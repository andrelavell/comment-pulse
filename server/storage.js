// Key-value JSON storage: Netlify Blobs in production, local files in dev.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IS_NETLIFY = Boolean(globalThis.Netlify) || process.env.NETLIFY === 'true';

export function env(name) {
  return globalThis.Netlify?.env.get(name) ?? process.env[name];
}

const localDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'kv');

function localFile(storeName, key) {
  return path.join(localDir, storeName, `${key.replaceAll('/', '__')}.json`);
}

let blobStores = null;
async function blobStore(name) {
  if (!blobStores) blobStores = new Map();
  if (!blobStores.has(name)) {
    const { getStore } = await import('@netlify/blobs');
    blobStores.set(name, getStore({ name, consistency: 'strong' }));
  }
  return blobStores.get(name);
}

export async function kvGet(storeName, key) {
  if (IS_NETLIFY) {
    const store = await blobStore(storeName);
    return store.get(key, { type: 'json' });
  }
  try {
    return JSON.parse(fs.readFileSync(localFile(storeName, key), 'utf8'));
  } catch {
    return null;
  }
}

export async function kvSet(storeName, key, value) {
  if (IS_NETLIFY) {
    const store = await blobStore(storeName);
    await store.setJSON(key, value);
    return;
  }
  const file = localFile(storeName, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}
