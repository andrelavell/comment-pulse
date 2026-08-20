import crypto from 'node:crypto';
import { env } from './storage.js';

const COOKIE = 'cp_auth';
const MAX_AGE = 180 * 24 * 60 * 60; // stay signed in for 180 days

function secret() {
  const pw = env('APP_PASSWORD');
  return crypto.createHash('sha256').update(`comment-pulse:${pw}`).digest();
}

function sign(exp) {
  return crypto.createHmac('sha256', secret()).update(String(exp)).digest('hex');
}

export function authEnabled() {
  return Boolean(env('APP_PASSWORD'));
}

export function checkPassword(password) {
  const expected = env('APP_PASSWORD') || '';
  const a = Buffer.from(String(password ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function makeAuthCookie({ secure = true } = {}) {
  const exp = Date.now() + MAX_AGE * 1000;
  const value = `${exp}.${sign(exp)}`;
  return (
    `${COOKIE}=${value}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; SameSite=Lax` +
    (secure ? '; Secure' : '')
  );
}

export function isAuthed(cookieHeader) {
  if (!authEnabled()) return true;
  const match = (cookieHeader || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!match) return false;
  const [exp, sig] = match[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(exp)));
  } catch {
    return false;
  }
}
