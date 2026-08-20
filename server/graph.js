const GRAPH = 'https://graph.facebook.com/v21.0';

const USER_TOKEN = process.env.META_USER_TOKEN;
if (!USER_TOKEN) {
  console.error('Missing META_USER_TOKEN in .env');
  process.exit(1);
}

const pageTokens = new Map(); // pageId -> page access token (server-side only)

export class GraphError extends Error {
  constructor(fbError, status) {
    super(fbError?.message || 'Graph API error');
    this.fb = fbError;
    this.status = status || 500;
  }
}

export async function g(path, params = {}, token = USER_TOKEN, method = 'GET') {
  const url = new URL(`${GRAPH}/${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (method === 'GET') url.searchParams.set(k, v);
    else body.set(k, v);
  }
  if (method === 'GET') url.searchParams.set('access_token', token);
  else body.set('access_token', token);

  const res = await fetch(url, method === 'GET' ? {} : { method, body });
  const json = await res.json().catch(() => ({}));
  if (json.error) throw new GraphError(json.error, res.status);
  return json;
}

async function gAll(path, params, token, maxPages = 10) {
  let out = [];
  let after;
  for (let i = 0; i < maxPages; i++) {
    const json = await g(path, { ...params, after }, token);
    out = out.concat(json.data || []);
    after = json.paging?.cursors?.after;
    if (!after || !json.paging?.next) break;
  }
  return out;
}

// ---------- Pages ----------
let pagesCache = null;
export async function getPages(force = false) {
  if (pagesCache && !force) return pagesCache;
  const data = await gAll('me/accounts', {
    fields: 'id,name,access_token,category,picture{url}',
    limit: 100,
  });
  for (const p of data) pageTokens.set(p.id, p.access_token);
  pagesCache = data.map(({ access_token, ...rest }) => rest);
  return pagesCache;
}

export function pageToken(pageId) {
  const t = pageTokens.get(pageId);
  if (!t) throw new GraphError({ message: `No page token for ${pageId}. Reload pages.` }, 400);
  return t;
}

// Some pages (business-owned) don't show up in /me/accounts but are still
// accessible directly by id. Resolve their metadata + token individually.
const pageMeta = new Map();
export async function resolvePage(pageId) {
  if (pageMeta.has(pageId)) return pageMeta.get(pageId);
  try {
    const p = await g(pageId, { fields: 'id,name,category,picture{url},access_token' });
    if (p.access_token) pageTokens.set(pageId, p.access_token);
    const { access_token, ...rest } = p;
    pageMeta.set(pageId, access_token ? rest : null);
    return access_token ? rest : null;
  } catch {
    pageMeta.set(pageId, null);
    return null;
  }
}

export async function resolvePages(pageIds) {
  const out = [];
  for (const batch of Array.from({ length: Math.ceil(pageIds.length / 5) }, (_, i) =>
    pageIds.slice(i * 5, i * 5 + 5)
  )) {
    const results = await Promise.all(batch.map(resolvePage));
    out.push(...results.filter(Boolean));
  }
  return out;
}

// ---------- Ad post index: pageId -> Map(storyId -> meta) ----------
let adIndex = null;
let adIndexBuiltAt = 0;
let adIndexPromise = null;
const AD_INDEX_TTL = 10 * 60 * 1000;

async function buildAdIndex() {
  const accounts = await gAll('me/adaccounts', {
    fields: 'id,name,account_status',
    limit: 100,
  });
  const index = new Map();
  const active = accounts.filter((a) => a.account_status === 1);

  const CONCURRENCY = 4;
  const queue = [...active];
  async function worker() {
    while (queue.length) {
      const acct = queue.shift();
      try {
        const ads = await gAll(
          `${acct.id}/ads`,
          {
            fields: 'id,name,effective_status,updated_time,creative{effective_object_story_id}',
            limit: 250,
          },
          USER_TOKEN,
          4
        );
        for (const ad of ads) {
          const story = ad.creative?.effective_object_story_id;
          if (!story || !story.includes('_')) continue;
          if (['DELETED', 'ARCHIVED', 'DISAPPROVED'].includes(ad.effective_status)) continue;
          const pageId = story.split('_')[0];
          if (!index.has(pageId)) index.set(pageId, new Map());
          const posts = index.get(pageId);
          if (!posts.has(story)) {
            posts.set(story, { storyId: story, ads: [], active: false, lastUpdated: '' });
          }
          const entry = posts.get(story);
          entry.ads.push({ id: ad.id, name: ad.name, status: ad.effective_status, account: acct.name });
          if (ad.effective_status === 'ACTIVE') entry.active = true;
          if ((ad.updated_time || '') > entry.lastUpdated) entry.lastUpdated = ad.updated_time || '';
        }
      } catch (e) {
        console.warn(`Ad fetch failed for ${acct.name}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  adIndex = index;
  adIndexBuiltAt = Date.now();
  return index;
}

export async function getAdIndex(force = false) {
  if (adIndex && !force && Date.now() - adIndexBuiltAt < AD_INDEX_TTL) return adIndex;
  if (!adIndexPromise) {
    adIndexPromise = buildAdIndex().finally(() => (adIndexPromise = null));
  }
  return adIndexPromise;
}

// ---------- Post meta (ad creative context) ----------
const postMeta = new Map();
export async function getPostMeta(storyId, pageId) {
  if (postMeta.has(storyId)) return postMeta.get(storyId);
  try {
    const meta = await g(
      storyId,
      { fields: 'message,full_picture,permalink_url,created_time' },
      pageToken(pageId)
    );
    postMeta.set(storyId, meta);
    return meta;
  } catch {
    const fallback = { id: storyId };
    postMeta.set(storyId, fallback);
    return fallback;
  }
}

// ---------- Comments ----------
const COMMENT_FIELDS =
  'id,message,created_time,from{id,name,picture{url}},is_hidden,like_count,comment_count,can_hide,can_remove,can_like,can_comment,permalink_url,attachment,user_likes';

const commentCache = new Map(); // pageId -> { at, comments }
const COMMENT_TTL = 60 * 1000;

export async function getPageComments(pageId, { force = false, maxPosts = 40 } = {}) {
  const cached = commentCache.get(pageId);
  if (cached && !force && Date.now() - cached.at < COMMENT_TTL) return cached.comments;

  const index = await getAdIndex();
  const posts = [...(index.get(pageId)?.values() || [])]
    .sort((a, b) => (b.active - a.active) || b.lastUpdated.localeCompare(a.lastUpdated))
    .slice(0, maxPosts);

  const token = pageToken(pageId);
  const all = [];
  const CONCURRENCY = 5;
  const queue = [...posts];
  async function worker() {
    while (queue.length) {
      const post = queue.shift();
      try {
        const [meta, comments] = await Promise.all([
          getPostMeta(post.storyId, pageId),
          gAll(
            `${post.storyId}/comments`,
            {
              fields: `${COMMENT_FIELDS},comments{${COMMENT_FIELDS}}`,
              filter: 'toplevel',
              order: 'reverse_chronological',
              limit: 100,
            },
            token,
            3
          ),
        ]);
        for (const c of comments) {
          all.push({
            ...c,
            pageId,
            post: {
              id: post.storyId,
              message: meta.message || '',
              picture: meta.full_picture || null,
              permalink: meta.permalink_url || null,
            },
            ads: post.ads.slice(0, 3),
            adActive: post.active,
            replies: (c.comments?.data || []).map((r) => ({ ...r, pageId })),
          });
        }
      } catch (e) {
        console.warn(`Comments fetch failed for ${post.storyId}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  all.sort((a, b) => b.created_time.localeCompare(a.created_time));
  for (const c of all) delete c.comments;
  commentCache.set(pageId, { at: Date.now(), comments: all });
  return all;
}

export function invalidateComments(pageId) {
  commentCache.delete(pageId);
}

export function cachedCounts() {
  const out = {};
  for (const [pageId, { comments }] of commentCache) out[pageId] = comments;
  return out;
}

// ---------- Actions (all with page tokens) ----------
export const actions = {
  reply: (commentId, pageId, message) =>
    g(`${commentId}/comments`, { message }, pageToken(pageId), 'POST'),
  setHidden: (commentId, pageId, hidden) =>
    g(commentId, { is_hidden: hidden ? 'true' : 'false' }, pageToken(pageId), 'POST'),
  remove: (commentId, pageId) => g(commentId, {}, pageToken(pageId), 'DELETE'),
  like: (commentId, pageId) => g(`${commentId}/likes`, {}, pageToken(pageId), 'POST'),
  unlike: (commentId, pageId) => g(`${commentId}/likes`, {}, pageToken(pageId), 'DELETE'),
  ban: (pageId, userId) => g(`${pageId}/blocked`, { user: userId }, pageToken(pageId), 'POST'),
  unban: (pageId, userId) => g(`${pageId}/blocked`, { user: userId }, pageToken(pageId), 'DELETE'),
};
