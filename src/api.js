async function req(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.authRequired = Boolean(json.authRequired);
    throw err;
  }
  return json;
}

export const api = {
  login: (password) => req('/api/login', { method: 'POST', body: { password } }),
  bootstrap: (force) => req(`/api/bootstrap${force ? '?force=1' : ''}`),
  comments: (pageId, force) => req(`/api/comments?pageId=${pageId}${force ? '&force=1' : ''}`),
  overview: () => req('/api/overview'),
  review: (commentIds, reviewed) => req('/api/review', { method: 'POST', body: { commentIds, reviewed } }),
  reply: (commentId, pageId, message) =>
    req(`/api/comments/${commentId}/reply`, { method: 'POST', body: { pageId, message } }),
  hide: (commentId, pageId, hidden) =>
    req(`/api/comments/${commentId}/hide`, { method: 'POST', body: { pageId, hidden } }),
  remove: (commentId, pageId) =>
    req(`/api/comments/${commentId}?pageId=${pageId}`, { method: 'DELETE' }),
  like: (commentId, pageId, liked) =>
    req(`/api/comments/${commentId}/like`, { method: 'POST', body: { pageId, liked } }),
  ban: (pageId, userId, banned) =>
    req(`/api/pages/${pageId}/ban`, { method: 'POST', body: { userId, banned } }),
  settings: () => req('/api/settings'),
  saveSettings: (settings) => req('/api/settings', { method: 'POST', body: settings }),
};

export function timeAgo(iso) {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fullTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
