import { beforeEach, it, expect, vi } from 'vitest';
const { db, graph } = vi.hoisted(() => ({ db: new Map(), graph: { buildAdIndex: vi.fn(), fetchPageComments: vi.fn(), actions: { setHidden: vi.fn() } } }));
vi.mock('../server/storage.js', () => ({
  env: () => undefined,
  kvGet: vi.fn(async (s, k) => structuredClone(db.get(`${s}/${k}`) ?? null)),
  kvSet: vi.fn(async (s, k, v) => db.set(`${s}/${k}`, structuredClone(v))),
}));
vi.mock('../server/graph.js', () => ({ ...graph, GraphError: class extends Error {} }));
import { service } from '../server/service.js';
const goodIndex = () => ({ version: 2, builtAt: Date.now(), pages: [{ id: '123', name: 'Page' }], index: { '123': {} } });
beforeEach(() => {
  db.clear(); vi.clearAllMocks();
  db.set('moderation/state', { reviewed: {}, autoHidden: {}, settings: { enabledPages: ['123'], autoHide: false } });
});

it('preserves the last good index on sync failure and reports the error', async () => {
  const index = goodIndex(); db.set('cache/adIndex', index);
  graph.buildAdIndex.mockRejectedValue(new Error('Meta unavailable'));
  await expect(service.syncIndex()).rejects.toThrow('Meta unavailable');
  expect(db.get('cache/adIndex')).toEqual(index);
  expect(await service.bootstrap({ allowBuild: false })).toMatchObject({ pages: index.pages, syncError: 'Meta unavailable', building: false });
});

it('surfaces a persisted cooldown without starting another build', async () => {
  db.set('cache/metaCooldown', { error: 'Meta is limiting requests', retryAt: Date.now() + 60000 });
  expect(await service.bootstrap()).toMatchObject({ pages: [], syncError: 'Meta is limiting requests', building: false });
  expect(graph.buildAdIndex).not.toHaveBeenCalled();
});

it('distinguishes an intentionally empty page selection', async () => {
  db.set('cache/adIndex', goodIndex());
  db.set('moderation/state', { settings: { enabledPages: [] } });
  expect(await service.bootstrap({ allowBuild: false })).toMatchObject({ pages: [], configuredPageCount: 0, syncError: null, building: false });
});

it('deduplicates background page-sync dispatches', async () => {
  expect(await service.beginIndexSync()).toBe(true);
  expect(await service.beginIndexSync()).toBe(false);
});

it('treats the old potentially poisoned index as needing a rebuild', async () => {
  db.set('cache/adIndex', { pages: [], index: {}, builtAt: Date.now() });
  expect(await service.bootstrap({ allowBuild: false })).toMatchObject({ building: true });
});

it.each([null, undefined, '', 'null', 'undefined', 'abc'])('rejects invalid page ID %s before fetching comments', async (id) => {
  await expect(service.comments(id)).rejects.toMatchObject({ status: 400 });
  expect(graph.fetchPageComments).not.toHaveBeenCalled();
});

it('keeps cached comments when a forced refresh fails', async () => {
  const cached = { at: 123, comments: [{ id: 'c1' }] }; db.set('cache/comments/123', cached);
  graph.fetchPageComments.mockRejectedValue(new Error('Request limit reached'));
  await expect(service.comments('123', { force: true })).rejects.toThrow();
  expect(db.get('cache/comments/123')).toEqual(cached);
});

it('reuses the discovery index and retains counts and success timestamp when a page check fails', async () => {
  db.set('cache/adIndex', goodIndex());
  db.set('cache/queueIds', { '123': { total: 1, ids: ['c1'] } });
  db.set('cache/sweepStatus', { version: 2, at: 12345 });
  graph.fetchPageComments.mockRejectedValue(new Error('Meta unavailable'));
  expect(await service.sweep()).toMatchObject({ ok: false });
  expect(graph.buildAdIndex).not.toHaveBeenCalled();
  expect(await service.overview()).toMatchObject({ counts: { '123': { total: 1, toReview: 1 } }, lastSweep: 12345, sweepError: 'Page: Meta unavailable' });
});

it('a successful scan clears the error and updates queue counts', async () => {
  db.set('cache/adIndex', goodIndex());
  db.set('cache/sweepStatus', { at: 12345, error: 'Previous failure' });
  graph.fetchPageComments.mockResolvedValue([{ id: 'c1', pageId: '123', from: { id: '456' }, replies: [] }]);
  expect(await service.sweep()).toMatchObject({ ok: true });
  expect(await service.overview()).toMatchObject({ counts: { '123': { total: 1, toReview: 1 } }, sweepError: null });
});
