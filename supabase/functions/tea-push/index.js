import postgres from 'postgres';
import * as webpush from 'web-push';
import { timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { APP_ORIGIN, APP_URL, RequestError, validateCommand, notificationPayload, pushFailureReason } from './protocol.js';

// This credential is supplied by Supabase to the Edge runtime, never to Vite.
const sql = postgres(Deno.env.get('SUPABASE_DB_URL'), {
  prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10,
});
const digest = value => createHash('sha256').update(value).digest('hex');
function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length === b.length
    && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
let configPromise;
function config() {
  if (!configPromise) configPromise = sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended('fac-v3-push-config', 0))`;
    let [keys] = await tx`select decrypted_secret from vault.decrypted_secrets where name = 'fac_push_vapid_v1'`;
    if (!keys) {
      const generated = JSON.stringify(webpush.generateVAPIDKeys());
      await tx`select vault.create_secret(${generated}, 'fac_push_vapid_v1', 'V3 Web Push signing keys; server only')`;
      keys = { decrypted_secret: generated };
    }
    const [dispatch] = await tx`select decrypted_secret from vault.decrypted_secrets where name = 'fac_push_dispatch_v1'`;
    if (!dispatch) throw new Error('Push setup incomplete');
    return { ...JSON.parse(keys.decrypted_secret), dispatch: dispatch.decrypted_secret };
  }).catch(error => { configPromise = null; throw error; });
  return configPromise;
}

async function rateLimit(key, limit, db) {
  const [row] = await db`
    insert into tea_push.rate_limits (key, count) values (${key}, 1)
    on conflict (key) do update set count = tea_push.rate_limits.count + 1
    returning count`;
  if (row.count > limit) throw new RequestError('Too many notification requests. Please try again later.', 429);
}

async function register(command, request, settings) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const bucket = createHmac('sha256', settings.dispatch).update(`${day}:${ip}`).digest('hex');
  const tokenHash = digest(command.token);
  return sql.begin(async tx => {
    const [existing] = await tx`select token_hash from tea_push.installations where id = ${command.id} for update`;
    if (existing && !equal(existing.token_hash, tokenHash)) throw new RequestError('Device authorization failed.', 403);
    if (!existing) await rateLimit(`register:${day}:${bucket}`, 20, tx);
    else await rateLimit(`register:${command.id}:${Math.floor(Date.now() / 60_000)}`, 120, tx);
    const [row] = await tx`
      insert into tea_push.installations (id, token_hash, subscription, endpoint_hash)
      values (${command.id}, ${tokenHash}, ${tx.json(command.subscription)}, ${digest(command.subscription.endpoint)})
      on conflict (id) do update set subscription = excluded.subscription,
        endpoint_hash = excluded.endpoint_hash, updated_at = now()
      where tea_push.installations.token_hash = excluded.token_hash
      returning revision, status`;
    if (!row) throw new RequestError('Device authorization failed.', 403);
    return { enabled: true, revision: Number(row.revision), status: row.status };
  });
}

async function sync(command) {
  return sql.begin(async tx => {
    const [row] = await tx`select * from tea_push.installations where id = ${command.id} for update`;
    if (!row || !equal(row.token_hash, digest(command.token))) throw new RequestError('Enable notifications again on this device.', 403);
    const minute = Math.floor(Date.now() / 60_000);
    await rateLimit(`sync:${command.id}:${minute}`, 120, tx);
    // A late Start request must never undo a newer Pause / Reset request.
    if (command.revision <= Number(row.revision)) return { revision: Number(row.revision), status: row.status };
    const cancel = command.action === 'disable' || command.remainingMs === null;
    if (!cancel && !row.subscription) throw new RequestError('Enable notifications again on this device.', 409);
    const [updated] = await tx`
      update tea_push.installations set
        revision = ${command.revision},
        deadline = case when ${cancel} then null else now() + ${command.remainingMs || 0} * interval '1 millisecond' end,
        next_attempt_at = case when ${cancel} then null else now() + ${command.remainingMs || 0} * interval '1 millisecond' end,
        status = ${cancel ? 'cancelled' : 'scheduled'}, attempts = 0, lease_until = null,
        subscription = case when ${command.action === 'disable'} then null else subscription end,
        last_http_status = null, updated_at = now()
      where id = ${command.id} returning revision, status`;
    return { revision: Number(updated.revision), status: updated.status };
  });
}

async function dispatch(settings) {
  const jobs = await sql`
    with due as (
      select id from tea_push.installations
      where subscription is not null and deadline > now() - interval '2 minutes'
        and attempts < 3 and next_attempt_at <= now()
        and (status = 'scheduled' or (status = 'sending' and lease_until < now()))
      order by next_attempt_at limit 20 for update skip locked
    )
    update tea_push.installations i set status = 'sending', lease_until = now() + interval '45 seconds', attempts = attempts + 1
    from due where i.id = due.id returning i.*`;
  await Promise.all(jobs.map(async job => {
    let httpStatus = 0;
    try {
      // Recheck after claiming: a cancellation or a new timer invalidates this job.
      const [current] = await sql`select revision, status from tea_push.installations where id = ${job.id}`;
      if (!current || current.status !== 'sending' || current.revision !== job.revision) return;
      const details = webpush.generateRequestDetails(job.subscription, notificationPayload(), {
        vapidDetails: { subject: APP_URL, publicKey: settings.publicKey, privateKey: settings.privateKey },
        TTL: 120, urgency: 'high', topic: 'fac-tea-ready', contentEncoding: 'aes128gcm',
      });
      const response = await fetch(details.endpoint, {
        method: details.method, headers: details.headers, body: details.body,
        redirect: 'error', signal: AbortSignal.timeout(5000),
      });
      httpStatus = response.status;
      if (!response.ok) {
        const reason = pushFailureReason(await response.text());
        console.error('tea-push provider rejected', httpStatus, reason);
      } else await response.body?.cancel();
    } catch { /* Retry bounded transport failures; never log subscriptions or secrets. */ }
    const sent = httpStatus >= 200 && httpStatus < 300;
    const gone = httpStatus === 404 || httpStatus === 410;
    const transient = httpStatus === 0 || httpStatus === 429 || httpStatus >= 500;
    const retry = transient && job.attempts < 3;
    await sql`
      update tea_push.installations set
        status = ${sent ? 'sent' : retry ? 'scheduled' : gone ? 'expired' : 'failed'},
        subscription = case when ${gone} then null else subscription end,
        lease_until = null, last_http_status = ${httpStatus || null},
        next_attempt_at = case when ${retry} then now() + ${5 * 2 ** (job.attempts - 1)} * interval '1 second' else null end
      where id = ${job.id} and revision = ${job.revision} and status = 'sending'`;
  }));
  return { processed: jobs.length };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': APP_ORIGIN, 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  } });
}

Deno.serve(async request => {
  try {
    const origin = request.headers.get('origin');
    if (request.method === 'OPTIONS') return origin === APP_ORIGIN ? response({}) : response({ error: 'Origin not allowed.' }, 403);
    if (request.method === 'GET') {
      if (origin !== APP_ORIGIN) return response({ error: 'Origin not allowed.' }, 403);
      const settings = await config();
      return response({ publicKey: settings.publicKey });
    }
    if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);
    if (Number(request.headers.get('content-length')) > 8192) throw new RequestError('Request too large.', 413);
    const body = await request.text();
    if (body.length > 8192) throw new RequestError('Request too large.', 413);
    let command;
    try { command = JSON.parse(body); } catch { throw new RequestError('Invalid JSON.'); }
    if (command?.action === 'dispatch') {
      const settings = await config();
      if (!equal(request.headers.get('x-dispatch-secret'), settings.dispatch)) throw new RequestError('Unauthorized.', 401);
      return response(await dispatch(settings));
    }
    if (origin !== APP_ORIGIN) throw new RequestError('Origin not allowed.', 403);
    command = validateCommand(command);
    return response(command.action === 'register'
      ? await register(command, request, await config()) : await sync(command));
  } catch (error) {
    if (error instanceof RequestError) return response({ error: error.message }, error.status);
    // The code identifies DB/runtime failures without disclosing SQL parameters.
    console.error('tea-push failed', typeof error?.code === 'string' ? error.code : 'runtime');
    return response({ error: 'Notifications are temporarily unavailable. Please try again.' }, 503);
  }
});
