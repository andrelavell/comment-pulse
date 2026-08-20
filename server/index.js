import 'dotenv/config';
import express from 'express';
import { service, GraphError } from './service.js';
import { authEnabled, checkPassword, makeAuthCookie, isAuthed } from './auth.js';

const app = express();
app.use(express.json());

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    const status = e instanceof GraphError ? (e.status >= 400 ? e.status : 500) : 500;
    console.error(e.message);
    res.status(status).json({ error: e.message, code: e.fb?.code });
  });

app.post('/api/login', wrap(async (req, res) => {
  if (!checkPassword(req.body.password)) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  res.setHeader('Set-Cookie', makeAuthCookie({ secure: false }));
  res.json({ ok: true });
}));

app.use('/api', (req, res, next) => {
  if (!authEnabled() || isAuthed(req.headers.cookie)) return next();
  res.status(401).json({ error: 'Sign in required', authRequired: true });
});

app.get('/api/bootstrap', wrap(async (req, res) =>
  res.json(await service.bootstrap({ force: req.query.force === '1' }))));

app.get('/api/comments', wrap(async (req, res) => {
  if (!req.query.pageId) return res.status(400).json({ error: 'pageId required' });
  res.json(await service.comments(req.query.pageId, { force: req.query.force === '1' }));
}));

app.get('/api/overview', wrap(async (_req, res) => res.json(await service.overview())));

app.post('/api/review', wrap(async (req, res) =>
  res.json(await service.review(req.body.commentIds, req.body.reviewed))));

app.post('/api/comments/:id/reply', wrap(async (req, res) =>
  res.json(await service.reply(req.params.id, req.body.pageId, req.body.message))));

app.post('/api/comments/:id/ai-draft', wrap(async (req, res) =>
  res.json(await service.aiDraft(req.params.id, req.body.pageId))));

app.post('/api/comments/:id/hide', wrap(async (req, res) =>
  res.json(await service.hide(req.params.id, req.body.pageId, req.body.hidden))));

app.delete('/api/comments/:id', wrap(async (req, res) =>
  res.json(await service.remove(req.params.id, req.query.pageId))));

app.post('/api/comments/:id/like', wrap(async (req, res) =>
  res.json(await service.like(req.params.id, req.body.pageId, req.body.liked))));

app.post('/api/pages/:pageId/ban', wrap(async (req, res) =>
  res.json(await service.ban(req.params.pageId, req.body.userId, req.body.banned))));

app.post('/api/translate', wrap(async (req, res) => res.json(await service.translate(req.body.text))));

app.get('/api/feedback', wrap(async (_req, res) => res.json(await service.listFeedback())));
app.post('/api/feedback', wrap(async (req, res) =>
  res.json(await service.addFeedback(req.body.highlight, req.body.feedback, req.body.comment))));
app.delete('/api/feedback/:id', wrap(async (req, res) =>
  res.json(await service.deleteFeedback(req.params.id))));

app.get('/api/settings', wrap(async (_req, res) => res.json(await service.getSettings())));
app.post('/api/settings', wrap(async (req, res) => res.json(await service.saveSettings(req.body))));

const PORT = process.env.PORT || 5177;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

// Local background sweep, mirroring the Netlify scheduled function.
const run = () => service.sweep().catch((e) => console.warn('Sweep failed:', e.message));
run();
setInterval(run, 15 * 60 * 1000);
