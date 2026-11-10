const STORAGE_KEY = 'fac-v3-push';
const PROMPT_KEY = 'fac-v3-push-permission-asked';

function read(storage) {
  try {
    const value = JSON.parse(storage?.getItem(STORAGE_KEY));
    return value?.version === 1 && typeof value.token === 'string' && typeof value.id === 'string' ? value : null;
  } catch { return null; }
}

function publicKeyBytes(key) {
  const binary = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

/** Independent of React and the timer/media implementation. */
export function createPushController({
  endpoint, baseUrl,
  navigatorRef = globalThis.navigator,
  notificationRef = globalThis.Notification,
  windowRef = globalThis.window,
  cryptoRef = globalThis.crypto,
  storage,
  fetchRef = globalThis.fetch,
  now = () => Date.now(),
  onChange = () => {},
  setupTimeoutMs = 10000,
}) {
  let saved = read(storage);
  let registration;
  let publicKey;
  let disposed = false;
  let initializing;
  let enabling;
  let permissionAsked = false;
  try { permissionAsked = storage?.getItem(PROMPT_KEY) === '1'; } catch { /* unavailable */ }
  function bounded(promise) {
    let timeout;
    return Promise.race([promise, new Promise((_, reject) => {
      timeout = globalThis.setTimeout(() => reject(new Error('Notification setup timed out.')), setupTimeoutMs);
    })]).finally(() => globalThis.clearTimeout(timeout));
  }
  let inFlight = false;
  let lastTimer;
  let retryTimer;
  let failedAction = 'sync';
  const standalone = windowRef?.matchMedia?.('(display-mode: standalone)').matches || navigatorRef?.standalone === true;
  const supported = Boolean(navigatorRef?.serviceWorker && notificationRef && windowRef?.PushManager);
  let state = {
    available: supported && standalone,
    installed: Boolean(standalone),
    enabled: Boolean(saved?.enabled),
    busy: false, ready: false, status: 'idle', error: '',
    permission: notificationRef?.permission || 'default',
  };
  const snapshot = () => ({ ...state });
  function update(patch) {
    state = { ...state, ...patch };
    if (!disposed) onChange(snapshot());
  }
  function persist() {
    // Without durable credentials we cannot safely cancel after a reload.
    storage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }
  function nextRevision() {
    const stored = read(storage);
    return Math.max(now() * 1024, (saved?.revision || 0) + 1, (stored?.revision || 0) + 1);
  }
  async function request(body) {
    const response = await fetchRef(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, id: saved.id, token: saved.token }),
      keepalive: true, signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'Notifications are unavailable. Please try again.'), { status: response.status });
    return result;
  }
  function clearRetry() {
    if (retryTimer) globalThis.clearTimeout(retryTimer);
    retryTimer = null;
  }
  function retryLater() {
    clearRetry();
    if (!disposed) retryTimer = globalThis.setTimeout(() => { retryTimer = null; void flush(); }, 5000);
  }
  function syncError(intent) {
    return intent?.kind === 'schedule'
      ? 'Notification not confirmed. Keep the app open, or reconnect and retry.'
      : 'Cancellation not confirmed. Reconnect and retry; the previous notification may still arrive.';
  }

  async function flush() {
    if (disposed || !state.ready || !state.enabled || !saved?.enabled || inFlight || !saved.intent) return;
    const intent = { ...saved.intent };
    if (saved.ackRevision === intent.revision) return;
    inFlight = true;
    clearRetry();
    update({ status: 'syncing', error: '' });
    let success = false;
    try {
      const remainingMs = intent.kind === 'schedule' ? Math.ceil(intent.deadline - now()) : null;
      if (remainingMs !== null && remainingMs <= 0) {
        // Do not create a delayed notification after an offline timer has ended.
        // The original request may have succeeded; leave that server job alone.
        update({ status: 'unconfirmed', error: 'The timer ended before notification delivery could be confirmed.' });
        return;
      }
      const result = await request({ action: 'sync', revision: intent.revision, remainingMs });
      if (result.revision !== intent.revision) throw new Error('This timer was changed in another app window.');
      saved.ackRevision = intent.revision;
      persist();
      success = true;
      if (saved.intent?.revision === intent.revision) update({ status: intent.kind === 'schedule' ? 'scheduled' : 'cancelled', error: '' });
    } catch (error) {
      if (saved.intent?.revision === intent.revision) {
        if (error.status === 403 || error.status === 409) {
          update({ enabled: false, status: 'idle', error: 'Enable notifications again on this device.' });
          return;
        }
        failedAction = 'sync';
        update({ status: 'unconfirmed', error: syncError(intent) });
        retryLater();
      }
    } finally {
      inFlight = false;
      if (saved.intent?.revision !== intent.revision) void flush();
      else if (success) clearRetry();
    }
  }

  function syncTimer(timer) {
    lastTimer = timer;
    if (!saved?.enabled || !state.enabled || timer.preparing) return;
    if (timer.finished) { if (!state.error) update({ status: 'finished' }); return; }
    const kind = timer.running ? 'schedule' : 'cancel';
    const deadline = timer.running ? timer.deadline : null;
    if (saved.intent?.kind === kind && saved.intent?.deadline === deadline) return;
    saved.revision = nextRevision();
    saved.intent = { kind, deadline, revision: saved.revision };
    try { persist(); } catch {
      failedAction = 'sync';
      update({ status: 'unconfirmed', error: 'Notification changes could not be saved on this device. Please retry.' });
      return;
    }
    void flush();
  }

  async function prepare() {
    if (!state.available || disposed) return;
    if (initializing) return initializing;
    update({ busy: true, error: '', permission: notificationRef.permission });
    initializing = (async () => {
      try {
        const response = await bounded(fetchRef(endpoint, { signal: AbortSignal.timeout(setupTimeoutMs) }));
        if (!response.ok) throw new Error();
        publicKey = (await bounded(response.json())).publicKey;
        if (typeof publicKey !== 'string') throw new Error();
        registration = await bounded(navigatorRef.serviceWorker.register(baseUrl + 'sw.js', { scope: baseUrl, updateViaCache: 'none' }));
        // ready resolves only after activation; registration alone is insufficient on first install.
        if (registration.active?.state !== 'activated') {
          registration = await bounded(navigatorRef.serviceWorker.ready);
        }
        if (disposed) return;
        update({ ready: true });
        if (saved?.enabled) {
          const subscription = await registration.pushManager.getSubscription();
          if (notificationRef.permission !== 'granted' || !subscription) {
            update({ enabled: false, error: 'Enable notifications again on this device.' });
            return;
          }
          const result = await request({ action: 'register', subscription: subscription.toJSON() });
          saved.revision = Math.max(saved.revision || 0, result.revision);
          persist();
          if (saved.intent && saved.ackRevision === saved.intent.revision) {
            update({ status: saved.intent.kind === 'schedule' ? 'scheduled' : 'cancelled' });
          }
          if (lastTimer) syncTimer(lastTimer);
          await flush();
        }
      } catch {
        failedAction = 'prepare';
        update({ busy: false, ready: false, error: 'Could not connect notifications. Check your connection and retry.' });
      }
    })().finally(() => { initializing = null; update({ busy: false }); });
    return initializing;
  }

  // Called synchronously from the existing Start/BREW tap, before any await.
  // Permission must not depend on a slow/unavailable service worker or network.
  function enable() {
    if (!state.available || disposed) return Promise.resolve(false);
    if (enabling) return enabling;
    const permission = notificationRef.permission;
    if (permission === 'denied' || (permission === 'default' && permissionAsked)) return Promise.resolve(false);
    if (state.enabled && saved?.enabled && permission === 'granted') return Promise.resolve(retry());
    let permissionPromise;
    try {
      if (permission === 'default') {
        permissionAsked = true;
        try { storage?.setItem(PROMPT_KEY, '1'); } catch { /* per-session guard still applies */ }
        permissionPromise = notificationRef.requestPermission();
      } else permissionPromise = Promise.resolve(permission);
    }
    catch {
      permissionAsked = false;
      try { storage?.setItem(PROMPT_KEY, '0'); } catch { /* unavailable */ }
      update({ error: 'Notifications could not be enabled. Please try again.' });
      return Promise.resolve(false);
    }
    update({ busy: true, error: '' });
    enabling = (async () => {
      try {
        const permission = await permissionPromise;
        update({ permission });
        if (permission !== 'granted') { update({ enabled: false }); return false; }
        if (!state.ready || initializing) await prepare();
        if (disposed) return false;
        if (!state.ready) throw new Error('Notification setup unavailable.');
        const newIdentity = !saved;
        if (newIdentity) {
          const bytes = cryptoRef.getRandomValues(new Uint8Array(32));
          saved = { version: 1, id: cryptoRef.randomUUID(), token: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''), revision: 0, enabled: false };
          persist();
        }
        let subscription = await registration.pushManager.getSubscription();
        // Lost credentials cannot claim another installation's endpoint.
        if (newIdentity && subscription) { await subscription.unsubscribe(); subscription = null; }
        subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKeyBytes(publicKey) });
        const result = await request({ action: 'register', subscription: subscription.toJSON() });
        saved.enabled = true;
        saved.revision = Math.max(saved.revision, result.revision);
        persist();
        update({ enabled: true, status: 'idle', error: '' });
        if (lastTimer) syncTimer(lastTimer);
        await flush();
        return true;
      } catch {
        failedAction = 'enable';
        update({ error: 'Notifications could not be enabled. Check your connection and retry.' });
        return false;
      } finally { enabling = null; update({ busy: false }); }
    })();
    return enabling;
  }

  async function disable() {
    if (!saved || state.busy) return;
    update({ busy: true, error: '' });
    try {
      saved.revision = nextRevision();
      const result = await request({ action: 'disable', revision: saved.revision });
      if (result.revision !== saved.revision) throw new Error();
      saved.enabled = false;
      saved.intent = null;
      persist();
      clearRetry();
      update({ enabled: false, status: 'idle' });
      const subscription = await registration?.pushManager.getSubscription();
      // Server cancellation already succeeded, even if browser cleanup fails.
      await subscription?.unsubscribe().catch(() => {});
    } catch { failedAction = 'disable'; update({ error: 'Could not turn notifications off. Reconnect and retry.' }); }
    finally { update({ busy: false }); }
  }

  const retry = () => {
    update({ permission: notificationRef?.permission || 'default' });
    if (!state.ready) return prepare();
    if (state.error && failedAction === 'disable') return disable();
    // Permission prompts always remain behind the explicit Enable button.
    return flush();
  };
  const online = () => { void retry(); };
  const visible = () => { if (!windowRef?.document?.hidden) void retry(); };
  windowRef?.addEventListener?.('online', online);
  windowRef?.document?.addEventListener?.('visibilitychange', visible);
  return {
    snapshot, prepare, enable, disable, syncTimer, retry,
    destroy() {
      disposed = true;
      clearRetry();
      // Unmounting/reloading must not cancel a running server timer.
      windowRef?.removeEventListener?.('online', online);
      windowRef?.document?.removeEventListener?.('visibilitychange', visible);
    },
  };
}
