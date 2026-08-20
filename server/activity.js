import { kvGet, kvSet } from './storage.js';

const LOG_KEY = 'activityLog';
const MAX_LOG = 1000;

// Audit trail: every moderation action (manual or automatic) is recorded so
// mistakes can be traced and the auto-hide keyword list can be audited.
export async function logActivity(entry) {
  const log = (await kvGet('moderation', LOG_KEY)) || [];
  log.push({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    ...entry,
  });
  await kvSet('moderation', LOG_KEY, log.slice(-MAX_LOG));
}

export async function listActivity() {
  const log = (await kvGet('moderation', LOG_KEY)) || [];
  return log.slice().reverse();
}
