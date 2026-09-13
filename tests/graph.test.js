import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const db = vi.hoisted(() => new Map());
vi.mock('../server/storage.js', () => ({
  env: () => 'test-token',
  kvGet: vi.fn(async (s, k) => db.get(`${s}/${k}`) || null),
  kvSet: vi.fn(async (s, k, v) => db.set(`${s}/${k}`, v)),
}));
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => { vi.resetModules(); db.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe('Meta failure handling', () => {
  it('persists throttling and stops subsequent requests, including in a new function instance', async () => {
    const fetch = vi.fn(async () => response({ error: { code: 4, message: 'Application request limit reached' } }, 400));
    vi.stubGlobal('fetch', fetch);
    const { g } = await import('../server/graph.js');
    await expect(g('123')).rejects.toMatchObject({ status: 429 });
    expect(db.get('cache/metaCooldown').retryAt).toBeGreaterThan(Date.now());
    await expect(g('456')).rejects.toMatchObject({ status: 429 });
    vi.resetModules();
    const fresh = await import('../server/graph.js');
    await expect(fresh.g('789')).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries after the cooldown expires', async () => {
    db.set('cache/metaCooldown', { retryAt: Date.now() - 1 });
    const fetch = vi.fn(async () => response({ id: '123' }));
    vi.stubGlobal('fetch', fetch);
    expect(await (await import('../server/graph.js')).g('123')).toEqual({ id: '123' });
  });

  it('rejects HTTP errors even without a Meta error object', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({}, 503)));
    await expect((await import('../server/graph.js')).g('123')).rejects.toMatchObject({ status: 503 });
  });

  it('does not turn a page-resolution throttle into an empty page list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.pathname.endsWith('/me/adaccounts')) return response({ data: [{ id: 'act_1', name: 'Account', account_status: 1 }] });
      if (url.pathname.endsWith('/act_1/ads')) return response({ data: [{ id: 'ad', effective_status: 'ACTIVE', creative: { effective_object_story_id: '123_456' } }] });
      return response({ error: { code: 4, message: 'Application request limit reached' } }, 400);
    }));
    await expect((await import('../server/graph.js')).buildAdIndex()).rejects.toMatchObject({ status: 429 });
  });

  it('rejects incomplete ad discovery instead of publishing an empty index', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => url.pathname.endsWith('/me/adaccounts')
      ? response({ data: [{ id: 'act_1', name: 'Account', account_status: 1 }] })
      : response({ error: { code: 200, message: 'Permission denied' } }, 403)));
    await expect((await import('../server/graph.js')).buildAdIndex()).rejects.toThrow('Permission denied');
  });

  it('rejects a failed comment stream instead of returning a false empty queue', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.pathname.endsWith('/123')) return response({ access_token: 'page-test' });
      if (url.pathname.endsWith('/123_456')) return response({ message: 'Post' });
      if (url.pathname.endsWith('/123_456/comments')) return response({ error: { code: 200, message: 'Permission denied' } }, 403);
      return response({ data: [] });
    }));
    const graph = await import('../server/graph.js');
    await expect(graph.fetchPageComments('123', { '123_456': { storyId: '123_456', ads: [], active: true, lastUpdated: '' } })).rejects.toThrow('Permission denied');
  });
});
