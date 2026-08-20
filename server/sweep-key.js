import crypto from 'node:crypto';
import { env } from './storage.js';

// Shared secret so only our own scheduled function (or API) can trigger the
// background sweep, since background functions are publicly routable.
export function sweepKey() {
  return crypto
    .createHash('sha256')
    .update(`sweep:${env('APP_PASSWORD') || ''}:${env('META_USER_TOKEN') || ''}`)
    .digest('hex');
}
