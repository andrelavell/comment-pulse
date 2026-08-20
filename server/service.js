// Business logic shared by the local Express server and Netlify Functions.
import { buildAdIndex, fetchPageComments, actions, GraphError } from './graph.js';
import { kvGet, kvSet } from './storage.js';
import { loadState, saveState, normalizeSettings } from './store.js';

const AD_INDEX_TTL = 30 * 60 * 1000;

function decorate(c, state) {
  return {
    ...c,
    reviewed: Boolean(state.reviewed[c.id]),
    autoHidden: state.autoHidden[c.id] || null,
    authorBanned: c.from ? Boolean(state.banned[`${c.pageId}:${c.from.id}`]) : false,
    isPageAuthor: c.from?.id === c.pageId,
    replies: (c.replies || []).map((r) => ({ ...r, isPageAuthor: r.from?.id === c.pageId })),
  };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function matchKeyword(message, keywords) {
  if (!message) return null;
  for (const kw of keywords) {
    if (new RegExp(`(^|\\W)${esc(kw)}($|\\W)`, 'i').test(message)) return kw;
  }
  return null;
}

// Hide new comments matching the keyword list. Each comment is only ever
// auto-hidden once, so manually unhiding it sticks.
async function autoHidePass(comments, pageId, state) {
  const { autoHide, keywords } = state.settings;
  let changed = false;
  if (!autoHide || keywords.length === 0) return changed;
  for (const c of comments) {
    if (c.is_hidden || !c.can_hide || c.from?.id === pageId) continue;
    if (state.autoHidden[c.id]) continue;
    const kw = matchKeyword(c.message, keywords);
    if (!kw) continue;
    try {
      await actions.setHidden(c.id, pageId, true);
      c.is_hidden = true;
      state.autoHidden[c.id] = { at: new Date().toISOString(), keyword: kw };
      changed = true;
      console.log(`Auto-hid ${c.id} (matched "${kw}")`);
    } catch (e) {
      console.warn(`Auto-hide failed for ${c.id}: ${e.message}`);
    }
  }
  return changed;
}

async function getAdIndexCached(force = false) {
  let cached = force ? null : await kvGet('cache', 'adIndex');
  if (!cached || Date.now() - cached.builtAt > AD_INDEX_TTL) {
    cached = await buildAdIndex();
    await kvSet('cache', 'adIndex', cached);
  }
  return cached;
}

export const service = {
  // Returns { pages } (enabled pages only) or { building: true } when no index exists yet.
  async bootstrap({ force = false, allowBuild = true } = {}) {
    let cached = await kvGet('cache', 'adIndex');
    const stale = !cached || Date.now() - cached.builtAt > AD_INDEX_TTL;
    if ((force || stale) && allowBuild) cached = await getAdIndexCached(force);
    if (!cached) return { building: true };
    const { settings } = await loadState();
    return { pages: cached.pages.filter((p) => settings.enabledPages.includes(p.id)) };
  },

  async comments(pageId, { force = false } = {}) {
    const state = await loadState();
    let cached = force ? null : await kvGet('cache', `comments/${pageId}`);
    if (!cached) {
      const adIndex = await kvGet('cache', 'adIndex');
      const comments = await fetchPageComments(pageId, adIndex?.index?.[pageId]);
      const changed = await autoHidePass(comments, pageId, state);
      if (changed) await saveState(state);
      cached = { at: Date.now(), comments };
      await kvSet('cache', `comments/${pageId}`, cached);
    }
    return { comments: cached.comments.map((c) => decorate(c, state)) };
  },

  async overview() {
    const [state, queueIds, sweepStatus] = await Promise.all([
      loadState(),
      kvGet('cache', 'queueIds'),
      kvGet('cache', 'sweepStatus'),
    ]);
    const counts = {};
    for (const [pageId, info] of Object.entries(queueIds || {})) {
      counts[pageId] = {
        total: info.total,
        toReview: info.ids.filter((id) => !state.reviewed[id] && !state.autoHidden[id]).length,
      };
    }
    return { counts, lastSweep: sweepStatus?.at || null };
  },

  async review(commentIds, reviewed) {
    const state = await loadState();
    for (const id of commentIds) {
      if (reviewed) state.reviewed[id] = { at: new Date().toISOString() };
      else delete state.reviewed[id];
    }
    await saveState(state);
    return { ok: true };
  },

  async updateCachedComments(pageId, fn) {
    const cached = await kvGet('cache', `comments/${pageId}`);
    if (!cached) return;
    cached.comments = fn(cached.comments);
    await kvSet('cache', `comments/${pageId}`, cached);
  },

  async reply(commentId, pageId, message) {
    const out = await actions.reply(commentId, pageId, message);
    await this.review([commentId], true);
    await this.updateCachedComments(pageId, (cs) =>
      cs.map((c) =>
        c.id === commentId
          ? { ...c, replies: [...(c.replies || []), { id: out.id, message, from: { id: pageId }, pageId }] }
          : c
      )
    );
    return { ok: true, id: out.id };
  },

  async hide(commentId, pageId, hidden) {
    await actions.setHidden(commentId, pageId, hidden);
    if (hidden) await this.review([commentId], true); // hiding counts as handled
    await this.updateCachedComments(pageId, (cs) =>
      cs.map((c) => (c.id === commentId ? { ...c, is_hidden: hidden } : c))
    );
    return { ok: true };
  },

  async remove(commentId, pageId) {
    await actions.remove(commentId, pageId);
    await this.review([commentId], true);
    await this.updateCachedComments(pageId, (cs) => cs.filter((c) => c.id !== commentId));
    return { ok: true };
  },

  async like(commentId, pageId, liked) {
    if (liked) await actions.like(commentId, pageId);
    else await actions.unlike(commentId, pageId);
    await this.updateCachedComments(pageId, (cs) =>
      cs.map((c) =>
        c.id === commentId
          ? { ...c, user_likes: liked, like_count: Math.max(0, c.like_count + (liked ? 1 : -1)) }
          : c
      )
    );
    return { ok: true };
  },

  async ban(pageId, userId, banned) {
    if (banned) await actions.ban(pageId, userId);
    else await actions.unban(pageId, userId);
    const state = await loadState();
    if (banned) state.banned[`${pageId}:${userId}`] = { at: new Date().toISOString() };
    else delete state.banned[`${pageId}:${userId}`];
    await saveState(state);
    return { ok: true };
  },

  async getSettings() {
    const [state, adIndex] = await Promise.all([loadState(), kvGet('cache', 'adIndex')]);
    return {
      ...state.settings,
      allPages: (adIndex?.pages || []).map(({ id, name, picture, adPosts }) => ({
        id, name, picture, adPosts,
      })),
    };
  },

  async saveSettings(settings) {
    const state = await loadState();
    state.settings = normalizeSettings({ ...state.settings, ...settings });
    await saveState(state);
    return state.settings;
  },

  // Full sweep: rebuild the ad index, refresh comments for every page,
  // auto-hide matches, and store queue counts. Runs every 15 minutes.
  async sweep() {
    const started = Date.now();
    const adIndex = await getAdIndexCached(true);
    const state = await loadState();
    const queueIds = {};
    let hidden = 0;
    const pages = adIndex.pages.filter((p) => state.settings.enabledPages.includes(p.id));
    for (const page of pages) {
      try {
        const comments = await fetchPageComments(page.id, adIndex.index[page.id]);
        const before = comments.filter((c) => c.is_hidden).length;
        await autoHidePass(comments, page.id, state);
        hidden += comments.filter((c) => c.is_hidden).length - before;
        await kvSet('cache', `comments/${page.id}`, { at: Date.now(), comments });
        queueIds[page.id] = {
          total: comments.length,
          ids: comments.filter((c) => c.from?.id !== page.id).map((c) => c.id),
        };
      } catch (e) {
        console.warn(`Sweep failed for ${page.name}: ${e.message}`);
      }
    }
    await saveState(state);
    await kvSet('cache', 'queueIds', queueIds);
    const secs = Math.round((Date.now() - started) / 1000);
    await kvSet('cache', 'sweepStatus', { at: Date.now(), pages: pages.length, hidden, seconds: secs });
    console.log(`Sweep done in ${secs}s across ${pages.length} enabled pages` +
      (hidden > 0 ? `, auto-hid ${hidden} comment(s)` : ''));
    return { ok: true, pages: pages.length, hidden, seconds: secs };
  },
};

export { GraphError };
