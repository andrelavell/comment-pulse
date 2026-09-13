import { beforeEach, it, expect, vi } from 'vitest';
const service = vi.hoisted(() => ({ bootstrap: vi.fn(), beginIndexSync: vi.fn(), recordIndexError: vi.fn(), comments: vi.fn() }));
vi.mock('../server/service.js', () => ({ service, GraphError: class extends Error {} }));
vi.mock('../server/auth.js', () => ({ authEnabled: () => false, checkPassword: () => true, makeAuthCookie: () => '', isAuthed: () => true }));
vi.mock('../server/sweep-key.js', () => ({ sweepKey: () => 'test' }));
import handler from '../netlify/functions/api.mts';
beforeEach(() => vi.clearAllMocks());
it.each(['', 'null', 'undefined', 'abc'])('rejects bad page IDs before calling the service: %s', async (id) => {
  const res = await handler(new Request(`https://example.test/api/comments?pageId=${id}`), {});
  expect(res.status).toBe(400);
  expect(service.comments).not.toHaveBeenCalled();
});
it('honors a manual page sync and dispatches discovery only', async () => {
  service.bootstrap.mockResolvedValue({ pages: [], building: false });
  service.beginIndexSync.mockResolvedValue(true);
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
  const res = await handler(new Request('https://example.test/api/bootstrap?force=1'), {});
  expect(await res.json()).toMatchObject({ building: true });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ indexOnly: true });
  fetch.mockRestore();
});
it('never bypasses the cooldown on manual refresh', async () => {
  service.bootstrap.mockResolvedValue({ pages: [], building: false, retryAt: Date.now() + 60000, syncError: 'Rate limit' });
  const fetch = vi.spyOn(globalThis, 'fetch');
  const res = await handler(new Request('https://example.test/api/bootstrap?force=1'), {});
  expect(await res.json()).toMatchObject({ building: false, syncError: 'Rate limit' });
  expect(fetch).not.toHaveBeenCalled();
  expect(service.beginIndexSync).not.toHaveBeenCalled();
  fetch.mockRestore();
});
