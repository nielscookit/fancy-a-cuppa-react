# V3 timer notifications

Current UI status: enrollment is triggered directly by the existing Home Start
or detail BREW gesture. There are no added controls or layout changes. The native
permission prompt is independent of network/worker readiness and is not repeated
after consent, denial, or dismissal. Setup has bounded waits; an already active
worker is used directly. The earlier client-side failure on the user's iPhone
was not confirmed; stalled readiness was reproduced in a controlled test.

The installed web app can opt in to a Web Push notification when the Home timer
finishes. The timer and media controllers remain independent of React and push.
V2 and all existing tea tables/functions are unchanged.

## Flow

- The existing Start/BREW tap is the deliberate user gesture. Merely opening the app
  never opens the operating system's permission prompt.
- The actual timer start (after Fill begins) submits the remaining duration to
  Supabase. A server acknowledgement updates the internal scheduled state.
  There is no added scheduling-status label beneath the timer.
- Pause and Reset submit a cancellation. Resume schedules the remaining time.
- Each change has an increasing revision. Older or retried requests cannot
  replace a newer schedule/cancellation. A reload retains the deadline and revision.
- Completion and React unmount never cancel a scheduled notification.
- Failed changes remain in local storage and retry on connection/foreground
  recovery. Failure is represented in the controller state; the removed Home
  controls do not display it. An unconfirmed cancellation can leave the previous
  reminder scheduled. An expired offline start does not create a new late message.
- The service worker displays a visible notification, with a fixed replacement
  tag, and opens/focuses only the V3 home URL. It does not cache or intercept pages.

## Backend and database handoff

`supabase/functions/tea-push/` is a new Edge Function in the existing project.
Its `verify_jwt = false` is intentional: this app has no user login. Registering
creates an anonymous device installation. Subsequent changes require its random
256-bit capability, stored locally; only its SHA-256 hash is stored in Postgres.
The function also checks the existing GitHub Pages origin. Origin is not used
as a substitute for device authentication.

The new private `tea_push` schema contains:

| Table | Contents | Retention |
| --- | --- | --- |
| `installations` | Device ID, token hash, push subscription and latest timer state | 90 days without use |
| `rate_limits` | Daily salted IP hash for enrollment; per-device request counters | 2 days |

Both tables have RLS enabled, with no public/anon/authenticated access. The schema
is not exposed to the Data API. The Edge Function uses its runtime database
connection. No new public database RPCs or frontend privileged keys are needed.

Vault holds `fac_push_dispatch_v1` and `fac_push_vapid_v1`. The first is generated
by the migration, the signing key pair once by the Edge Function under a database
lock. Private keys are never returned to browsers, committed, or logged. The
public signing key is fetched by the app for subscription enrollment.

The `fac-v3-tea-push` cron job checks an indexed due queue every 5 seconds. It
invokes the Edge Function only for due work, using the narrow dispatch secret.
Claims have a 45-second lease; transient failures get at most three attempts.
404/410 removes invalid subscriptions. Payloads contain no tea/catalog/user data.
Allowed HTTPS push hosts are Apple, Google FCM, and Mozilla; redirects are refused.
The daily cleanup limits only this feature's own cron history to one day.

## Rollout and checks

1. Apply `supabase/migrations/20261110165850_tea_timer_push.sql` to the existing
   project. This enables `pg_cron` and `pg_net` without changing catalog tables.
2. Deploy `tea-push` with `index.js`, `protocol.js`, and `deno.json` from its folder.
   The imports pin the Web Push and Postgres libraries; the accompanying npm
   lockfile is for reproducible local verification.
3. Verify configuration returns only the public key, unauthorized calls are
   rejected, and register/schedule/cancel/stale revision behavior against the
   actual endpoint. Check cron history, queue status, and security advisors.
4. Publish the frontend only after backend verification.
5. Test the installed iPhone app: enable notifications, start one minute, wait for
   the scheduled acknowledgement, lock, receive the notification, tap to reopen.
   Repeat with Reset (no message), Pause past the original deadline (no message),
   Resume (new deadline), reload, offline scheduling/cancellation, and opt-out.

Automated checks: `npm test`, `npm run check:safety`, `npm run build`,
`npm run verify:pages`; backend syntax/crypto checked with Deno and the pinned
dependencies. Local browser emulation is not proof of locked-iPhone delivery.

Verified on 2026-11-10: 129 automated tests pass; build, safety, Pages routes,
and the live 167-tea read pass. The deployed Edge Function's configuration,
registration, scheduling, cancellation, old-revision rejection, invalid device
token/origin and dispatcher authorization were tested against the real database.
Cron successfully dispatched a synthetic nonexistent Apple endpoint (expected
HTTP 400); that test installation was subsequently disabled. This validates the
dispatch path, not receipt on an iPhone. Locked-iPhone delivery remains a device
acceptance test. Security advisors report only the intentional deny-all/no-policy
RLS information for these private tables, with no public read or execute grants.

## Device acceptance update · 2026-11-11

The user confirmed locked-iPhone delivery and both foreground audio cues.
Apple's real endpoint had rejected the optional Topic header with
`400 BadWebPushTopic`; the deployed sender now omits it. The service worker
still uses its notification tag. There are no extra Home notification controls:
permission is requested once from the existing Start/BREW gesture.

On foreground recovery, the timer updates its deadline-based state without
replaying cues crossed while hidden. This is covered by automated tests;
the user confirmed the return-to-app behavior and subsequently confirmed the
timer tests as completed. There is no pending repeat of those acceptance tests.
See QA_V3.md for the current device acceptance status. Earlier rollout notes
describe historical checks, not today's outstanding work.

## Practical limits

Internet is required to confirm schedule changes and deliver push. The scheduler
adds up to about five seconds plus provider/network latency. Delivery can be
delayed by iOS notification/Focus settings. A notification already handed to the
push service cannot be recalled by Reset. Messages expire after two minutes;
these are timely tea reminders, not guaranteed native alarms. Custom timer audio
continues to belong to the foreground media controller; iOS chooses the push
notification sound.

Useful read-only diagnostics (do not print endpoint URLs, tokens or Vault values):

```sql
select status, count(*) from tea_push.installations group by status;
select jobname, schedule, active from cron.job where jobname like 'fac-v3-tea-push%';
select status, start_time, end_time from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'fac-v3-tea-push')
order by start_time desc limit 5;
```

Rollback: hide the frontend notification control, deactivate the two named cron
jobs, and keep the private schema/Vault entries until subscriptions are retired.
Do not drop the catalog, existing Edge Functions, or shared Supabase resources.
