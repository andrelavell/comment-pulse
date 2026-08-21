import { env } from './storage.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export class GraphError extends Error {
  constructor(fbError, status) {
    super(fbError?.message || 'Graph API error');
    this.fb = fbError;
    this.status = status || 500;
  }
}

function userToken() {
  const t = env('META_USER_TOKEN');
  if (!t) throw new GraphError({ message: 'Missing META_USER_TOKEN' }, 500);
  return t;
}

export async function g(path, params = {}, token = userToken(), method = 'GET') {
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

// ---------- Page tokens (per-instance cache, re-fetched on demand) ----------
const pageTokens = new Map();

export async function pageToken(pageId) {
  if (pageTokens.has(pageId)) return pageTokens.get(pageId);
  const p = await g(pageId, { fields: 'access_token' });
  if (!p.access_token) throw new GraphError({ message: `No admin access to page ${pageId}` }, 403);
  pageTokens.set(pageId, p.access_token);
  return p.access_token;
}

export async function resolvePage(pageId) {
  try {
    const p = await g(pageId, { fields: 'id,name,category,picture{url},access_token' });
    if (!p.access_token) return null;
    pageTokens.set(pageId, p.access_token);
    const { access_token, ...rest } = p;
    return rest;
  } catch {
    return null;
  }
}

// ---------- Ad post index: { pages: [...], index: { pageId: { storyId: meta } } } ----------
export async function buildAdIndex() {
  const accounts = await gAll('me/adaccounts', { fields: 'id,name,account_status', limit: 100 });
  const index = {};
  const queue = accounts.filter((a) => a.account_status === 1);

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
          userToken(),
          4
        );
        for (const ad of ads) {
          const story = ad.creative?.effective_object_story_id;
          if (!story || !story.includes('_')) continue;
          if (['DELETED', 'ARCHIVED', 'DISAPPROVED'].includes(ad.effective_status)) continue;
          const pageId = story.split('_')[0];
          index[pageId] ??= {};
          index[pageId][story] ??= { storyId: story, ads: [], active: false, lastUpdated: '' };
          const entry = index[pageId][story];
          entry.ads.push({ id: ad.id, name: ad.name, status: ad.effective_status, account: acct.name });
          if (ad.effective_status === 'ACTIVE') entry.active = true;
          if ((ad.updated_time || '') > entry.lastUpdated) entry.lastUpdated = ad.updated_time || '';
        }
      } catch (e) {
        console.warn(`Ad fetch failed for ${acct.name}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  const pages = [];
  for (const pageId of Object.keys(index)) {
    const p = await resolvePage(pageId);
    if (p) pages.push({ ...p, adPosts: Object.keys(index[pageId]).length });
  }
  pages.sort((a, b) => b.adPosts - a.adPosts);
  return { pages, index, builtAt: Date.now() };
}

// ---------- Post meta (ad creative context) ----------
const postMeta = new Map();
async function getPostMeta(storyId, token) {
  if (postMeta.has(storyId)) return postMeta.get(storyId);
  try {
    const meta = await g(storyId, { fields: 'message,full_picture,permalink_url,created_time' }, token);
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
  'id,message,created_time,from{id,name,picture{url}},is_hidden,like_count,comment_count,can_hide,can_remove,can_like,can_comment,permalink_url,attachment,user_likes,reactions.summary(true).limit(50){type}';

// Meta redacts individual reaction entries without advanced access, but the
// summary count is always available; keep types when they do come through.
function slimReactions(r) {
  const types = {};
  for (const x of r?.data || []) types[x.type] = (types[x.type] || 0) + 1;
  return { total: r?.summary?.total_count || 0, types };
}

export async function fetchPageComments(pageId, postsById, { maxPosts = 40, maxOrganic = 25 } = {}) {
  const posts = Object.values(postsById || {})
    .sort((a, b) => (b.active - a.active) || b.lastUpdated.localeCompare(a.lastUpdated))
    .slice(0, maxPosts);

  const token = await pageToken(pageId);

  // Organic page posts aren't in the ad index, but their comments still need
  // moderating. Pull the most recent published posts and add any not already
  // covered by an ad.
  try {
    const organic = await gAll(
      `${pageId}/published_posts`,
      { fields: 'id,created_time', limit: 100 },
      token,
      1
    );
    const seen = new Set(posts.map((p) => p.storyId));
    for (const p of organic.slice(0, maxOrganic)) {
      if (seen.has(p.id)) continue;
      posts.push({ storyId: p.id, ads: [], active: false, lastUpdated: p.created_time || '' });
    }
  } catch (e) {
    console.warn(`Organic posts fetch failed for ${pageId}: ${e.message}`);
  }
  const all = [];
  const queue = [...posts];
  async function worker() {
    while (queue.length) {
      const post = queue.shift();
      try {
        const [meta, comments] = await Promise.all([
          getPostMeta(post.storyId, token),
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
            reactions: slimReactions(c.reactions),
            pageId,
            post: {
              id: post.storyId,
              message: meta.message || '',
              picture: meta.full_picture || null,
              permalink: meta.permalink_url || null,
            },
            ads: post.ads.slice(0, 3),
            adActive: post.active,
            replies: (c.comments?.data || []).map((r) => ({
              ...r,
              pageId,
              reactions: slimReactions(r.reactions),
            })),
          });
        }
      } catch (e) {
        console.warn(`Comments fetch failed for ${post.storyId}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));
  all.sort((a, b) => b.created_time.localeCompare(a.created_time));
  for (const c of all) delete c.comments;
  return all;
}

// ---------- Actions (all executed as the page) ----------
export const actions = {
  reply: async (commentId, pageId, message) =>
    g(`${commentId}/comments`, { message }, await pageToken(pageId), 'POST'),
  setHidden: async (commentId, pageId, hidden) =>
    g(commentId, { is_hidden: hidden ? 'true' : 'false' }, await pageToken(pageId), 'POST'),
  remove: async (commentId, pageId) => g(commentId, {}, await pageToken(pageId), 'DELETE'),
  like: async (commentId, pageId) => g(`${commentId}/likes`, {}, await pageToken(pageId), 'POST'),
  unlike: async (commentId, pageId) => g(`${commentId}/likes`, {}, await pageToken(pageId), 'DELETE'),
  ban: async (pageId, userId) => g(`${pageId}/blocked`, { user: userId }, await pageToken(pageId), 'POST'),
  unban: async (pageId, userId) => g(`${pageId}/blocked`, { user: userId }, await pageToken(pageId), 'DELETE'),
};
