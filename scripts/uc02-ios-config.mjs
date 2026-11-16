import { isIPv4 } from 'node:net';

export function readUc02Config(env) {
  if (env.VITE_COMMUNITY_TEA_V4 !== 'true') {
    throw new Error('Set VITE_COMMUNITY_TEA_V4=true in .env.uc02-local.local.');
  }

  const url = env.FAC_UC02_SUPABASE_URL?.trim();
  if (!/^http:\/\/(?:localhost|[0-9.]+):[0-9]{1,5}\/?$/.test(url ?? '')) {
    throw new Error('Use a local HTTP Supabase URL with an explicit port.');
  }
  const parsed = new URL(url);
  const host = parsed.hostname;
  const [first, second] = host.split('.').map(Number);
  const localIp = isIPv4(host) && (
    host === '127.0.0.1' || first === 10 || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
  );
  if (host !== 'localhost' && !localIp) throw new Error('Supabase must use loopback or a private IPv4 address.');

  const publishableKey = env.FAC_UC02_SUPABASE_PUBLIC_KEY?.trim();
  if (!isPublicKey(publishableKey)) throw new Error('Use the local Supabase publishable or legacy anon key.');
  return { url: parsed.origin, publishableKey };
}

function isPublicKey(key) {
  if (/^sb_publishable_[\w-]+$/.test(key ?? '')) return true;
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(key ?? '')) return false;
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon';
  } catch {
    return false;
  }
}
