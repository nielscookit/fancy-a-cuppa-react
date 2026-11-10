import { Buffer } from 'node:buffer';

export const APP_ORIGIN = 'https://nielscookit.github.io';
export const APP_URL = APP_ORIGIN + '/fancy-a-cuppa-react/';
export const MAX_DURATION_MS = 3_600_000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RequestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function keyBytes(value, length) {
  if (typeof value !== 'string' || !/^[\w-]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, 'base64url').length === length;
}

export function validateSubscription(value) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048) {
    throw new RequestError('Invalid notification subscription.');
  }
  let url;
  try { url = new URL(value.endpoint); } catch { throw new RequestError('Invalid push endpoint.'); }
  const host = url.hostname;
  // Never turn this public endpoint into an arbitrary server-side HTTP proxy.
  const allowed = host.endsWith('.push.apple.com') || host === 'fcm.googleapis.com'
    || host.endsWith('.push.services.mozilla.com');
  if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) {
    throw new RequestError('Unsupported push provider.');
  }
  if (!keyBytes(value.keys?.p256dh, 65) || Buffer.from(value.keys.p256dh, 'base64url')[0] !== 4
      || !keyBytes(value.keys?.auth, 16)) {
    throw new RequestError('Invalid notification keys.');
  }
  return { endpoint: url.href, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}

export function validateCommand(value) {
  if (!value || !['register', 'sync', 'disable'].includes(value.action)) {
    throw new RequestError('Unknown notification action.');
  }
  if (!UUID.test(value.id) || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)) {
    throw new RequestError('Invalid device credentials.');
  }
  if (value.action === 'register') return { ...value, subscription: validateSubscription(value.subscription) };
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) throw new RequestError('Invalid timer revision.');
  if (value.action === 'sync' && value.remainingMs !== null
      && (!Number.isFinite(value.remainingMs) || value.remainingMs <= 0 || value.remainingMs > MAX_DURATION_MS)) {
    throw new RequestError('Invalid notification time.');
  }
  return value;
}

export function notificationPayload() {
  return JSON.stringify({ version: 1, type: 'tea-ready', title: 'Your tea is ready', body: 'Time for a cuppa.' });
}
