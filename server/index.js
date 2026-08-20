import 'dotenv/config';
import express from 'express';
import {
  getPages,
  resolvePages,
  getAdIndex,
  getPageComments,
  invalidateComments,
  cachedCounts,
  actions,
  GraphError,
} from './graph.js';
import { store } from './store.js';

const app = express();
app.use(express.json());

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    const status = e instanceof GraphError ? (e.status >= 400 ? e.status : 500) : 500;
    console.error(e.message);
    res.status(status).json({ error: e.message, code: e.fb?.code });
  });

function decorate(c) {
  return {
    ...c,
    reviewed: store.isReviewed(c.id),
    autoHidden: store.getAutoHidden(c.id),
    authorBanned: c.from ? store.isBanned(c.pageId, c.from.id) : false,
    isPageAuthor: c.from?.id === c.pageId,
    replies: (c.replies || []).map((r) => ({ ...r, isPageAuthor: r.from?.id === c.pageId })),
  };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function matchKeyword(message, keywords) {
  if (!message) return null;
  const text = message.toLowerCase();
  for (const kw of keywords) {
    if (new RegExp(`(^|\\W)${esc(kw)}($|\\W)`, 'i').test(text)) return kw;
  }
  return null;
}

// Hide any new comment matching the keyword list. Each comment is only ever
// auto-hidden once, so manually unhiding it sticks.
async function autoHidePass(comments, pageId) {
  const { autoHide, keywords } = store.getSettings();
  if (!autoHide || keywords.length === 0) return;
  for (const c of comments) {
    if (c.is_hidden || !c.can_hide || c.from?.id === pageId) continue;
    if (store.getAutoHidden(c.id)) continue;
    const kw = matchKeyword(c.message, keywords);
    if (!kw) continue;
    try {
      await actions.setHidden(c.id, pageId, true);
      c.is_hidden = true; // mutate the cached object so the UI reflects it
      store.setAutoHidden(c.id, kw);
      console.log(`Auto-hid ${c.id} (matched "${kw}")`);
    } catch (e) {
      console.warn(`Auto-hide failed for ${c.id}: ${e.message}`);
    }
  }
}

app.get('/api/bootstrap', wrap(async (req, res) => {
  const force = req.query.force === '1';
  await getPages(force); // seeds tokens for pages in /me/accounts
  const index = await getAdIndex(force);
  const pages = await resolvePages([...index.keys()]);
  const withAds = pages
    .map((p) => ({ ...p, adPosts: index.get(p.id)?.size || 0 }))
    .filter((p) => p.adPosts > 0)
    .sort((a, b) => b.adPosts - a.adPosts);
  res.json({ pages: withAds });
}));

app.get('/api/comments', wrap(async (req, res) => {
  const { pageId, force } = req.query;
  if (!pageId) return res.status(400).json({ error: 'pageId required' });
  const comments = await getPageComments(pageId, { force: force === '1' });
  await autoHidePass(comments, pageId);
  res.json({ comments: comments.map(decorate) });
}));

app.get('/api/settings', wrap(async (_req, res) => {
  res.json(store.getSettings());
}));

app.post('/api/settings', wrap(async (req, res) => {
  res.json(store.setSettings(req.body));
}));

app.get('/api/overview', wrap(async (_req, res) => {
  const counts = {};
  for (const [pageId, comments] of Object.entries(cachedCounts())) {
    counts[pageId] = {
      total: comments.length,
      toReview: comments.filter(
        (c) => !store.isReviewed(c.id) && !store.getAutoHidden(c.id) && c.from?.id !== c.pageId
      ).length,
    };
  }
  res.json({ counts });
}));

app.post('/api/review', wrap(async (req, res) => {
  const { commentIds, reviewed } = req.body;
  store.setReviewedBulk(commentIds, reviewed);
  res.json({ ok: true });
}));

app.post('/api/comments/:id/reply', wrap(async (req, res) => {
  const { pageId, message } = req.body;
  const out = await actions.reply(req.params.id, pageId, message);
  invalidateComments(pageId);
  res.json({ ok: true, id: out.id });
}));

app.post('/api/comments/:id/hide', wrap(async (req, res) => {
  const { pageId, hidden } = req.body;
  await actions.setHidden(req.params.id, pageId, hidden);
  invalidateComments(pageId);
  res.json({ ok: true });
}));

app.delete('/api/comments/:id', wrap(async (req, res) => {
  const { pageId } = req.query;
  await actions.remove(req.params.id, pageId);
  store.setReviewed(req.params.id, true);
  invalidateComments(pageId);
  res.json({ ok: true });
}));

app.post('/api/comments/:id/like', wrap(async (req, res) => {
  const { pageId, liked } = req.body;
  if (liked) await actions.like(req.params.id, pageId);
  else await actions.unlike(req.params.id, pageId);
  invalidateComments(pageId);
  res.json({ ok: true });
}));

app.post('/api/pages/:pageId/ban', wrap(async (req, res) => {
  const { userId, banned } = req.body;
  if (banned) await actions.ban(req.params.pageId, userId);
  else await actions.unban(req.params.pageId, userId);
  store.setBanned(req.params.pageId, userId, banned);
  res.json({ ok: true });
}));

const PORT = process.env.PORT || 5177;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

// ---------- background sweep ----------
// Every 15 minutes, re-fetch comments for every page with ad posts and run
// the auto-hide pass, so keyword moderation happens even with no browser open.
const SWEEP_INTERVAL = 15 * 60 * 1000;
let sweeping = false;

async function sweep() {
  if (sweeping) return;
  sweeping = true;
  const started = Date.now();
  try {
    await getPages();
    const index = await getAdIndex();
    const pages = await resolvePages([...index.keys()]);
    let hidden = 0;
    for (const p of pages) {
      try {
        const comments = await getPageComments(p.id, { force: true });
        const before = comments.filter((c) => c.is_hidden).length;
        await autoHidePass(comments, p.id);
        hidden += comments.filter((c) => c.is_hidden).length - before;
      } catch (e) {
        console.warn(`Sweep failed for ${p.name}: ${e.message}`);
      }
    }
    console.log(
      `Sweep done in ${Math.round((Date.now() - started) / 1000)}s across ${pages.length} pages` +
        (hidden > 0 ? `, auto-hid ${hidden} comment(s)` : '')
    );
  } catch (e) {
    console.warn('Sweep failed:', e.message);
  } finally {
    sweeping = false;
  }
}

// Warm the caches, then run the first sweep and keep sweeping on a timer.
sweep();
setInterval(sweep, SWEEP_INTERVAL);
