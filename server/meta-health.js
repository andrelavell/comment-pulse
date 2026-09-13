import { kvGet, kvSet } from './storage.js';

const COOLDOWN_MS = 60 * 60 * 1000;
let checkedAt = 0;
let cooldown = null;

export const isRateLimit = (error) => [4, 17, 32, 613, 80004].includes(Number(error?.fb?.code));
export const isGlobalGraphFailure = (error) =>
  isRateLimit(error) || [102, 190].includes(Number(error?.fb?.code)) ||
  Boolean(error?.fb?.is_transient) || error?.status >= 500;

export async function metaHealth() {
  cooldown = await kvGet('cache', 'metaCooldown');
  checkedAt = Date.now();
  return cooldown && cooldown.retryAt > Date.now() ? cooldown : null;
}

export async function assertMetaReady() {
  if (!checkedAt || Date.now() - checkedAt > 30000) await metaHealth();
  if (cooldown?.retryAt > Date.now()) {
    const error = new Error('Meta is limiting requests. Sync is paused temporarily; saved data is still available.');
    error.status = 429;
    error.retryAt = cooldown.retryAt;
    throw error;
  }
}

export async function recordMetaLimit(error) {
  cooldown = { error: 'Meta is limiting requests. Sync is paused temporarily; saved data is still available.', retryAt: Date.now() + COOLDOWN_MS };
  checkedAt = Date.now();
  error.retryAt = cooldown.retryAt;
  await kvSet('cache', 'metaCooldown', cooldown);
}
