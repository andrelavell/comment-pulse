import { kvGet, kvSet } from './storage.js';

const KEY = 'savedReplies';

export async function listSavedReplies() {
  return (await kvGet('moderation', KEY)) || [];
}

export async function addSavedReply({ title, text }) {
  const list = await listSavedReplies();
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    title: String(title || '').trim().slice(0, 120),
    text: String(text || '').trim().slice(0, 2000),
  };
  list.push(entry);
  await kvSet('moderation', KEY, list);
  return entry;
}

export async function updateSavedReply(id, { title, text }) {
  const list = await listSavedReplies();
  const entry = list.find((r) => r.id === id);
  if (!entry) return null;
  if (title !== undefined) entry.title = String(title).trim().slice(0, 120);
  if (text !== undefined) entry.text = String(text).trim().slice(0, 2000);
  await kvSet('moderation', KEY, list);
  return entry;
}

export async function deleteSavedReply(id) {
  const list = await listSavedReplies();
  await kvSet('moderation', KEY, list.filter((r) => r.id !== id));
}
