// Capacitor-only adapter. Deliberately has no React, browser-push or UI dependency.
// A stable ID prevents multiple pending reminders for the same brewing timer.
export const TEA_READY_NOTIFICATION_ID = 731001;
// Bundled at the iOS app root (not the WebView public directory).
export const NATIVE_READY_SOUND_FILE = 'Ready.caf';

export function createNativeNotificationController({
  notifications,
  now = () => Date.now(),
  onChange = () => {},
}) {
  if (!notifications) throw new Error('Native notifications plugin is required.');
  let disposed = false;
  let desiredDeadline = null;
  let queuedDeadline = undefined;
  let pending = Promise.resolve();
  let state = {
    available: true, installed: true, enabled: false, busy: false,
    ready: false, status: 'idle', error: '', permission: 'default',
  };
  const snapshot = () => ({ ...state });
  function update(change) {
    state = { ...state, ...change };
    if (!disposed) onChange(snapshot());
  }
  function enqueue(work) {
    const result = pending.then(work);
    pending = result.catch(error => {
      if (!disposed) update({ status: 'unconfirmed', error: error?.message || 'Local notification could not be updated.' });
    });
    return result;
  }
  function deadlineOf(timer) {
    if (!timer?.running || timer.preparing || timer.finished) return null;
    return Number.isFinite(timer.deadline) && timer.deadline > now() ? timer.deadline : null;
  }
  function queueLatest() {
    if (disposed || !state.ready || !state.enabled) return;
    if (queuedDeadline === desiredDeadline && state.status !== 'unconfirmed') return;
    queuedDeadline = desiredDeadline;
    const intendedDeadline = desiredDeadline;
    void enqueue(async () => {
      if (disposed || intendedDeadline !== desiredDeadline) return;
      // Always cancel the same ID before replacing the schedule.
      await notifications.cancel({ notifications: [{ id: TEA_READY_NOTIFICATION_ID }] });
      if (disposed) return;
      const deadline = intendedDeadline;
      if (deadline !== null && deadline === desiredDeadline && deadline > now()) {
        await notifications.schedule({ notifications: [{
          id: TEA_READY_NOTIFICATION_ID,
          title: 'Fancy a Cuppa',
          body: 'Your tea is ready.',
          schedule: { at: new Date(deadline) },
          // This short CAF file is copied into the app's main bundle by Xcode.
          sound: NATIVE_READY_SOUND_FILE,
        }] });
        if (!disposed && desiredDeadline === deadline) update({ status: 'scheduled', error: '' });
      } else if (!disposed) {
        update({ status: 'cancelled', error: '' });
      }
    });
  }
  async function prepare() {
    if (disposed) return false;
    try {
      const result = await notifications.checkPermissions();
      if (disposed) return false;
      const permission = result.display || 'default';
      const enabled = permission === 'granted';
      update({ ready: true, permission, enabled, error: '' });
      if (enabled) queueLatest();
      return enabled;
    } catch (error) {
      if (!disposed) update({ status: 'unconfirmed', error: error?.message || 'Notification permissions unavailable.' });
      return false;
    }
  }
  async function enable() {
    if (disposed) return false;
    // Called from existing START/BREW tap; no additional UI.
    update({ busy: true });
    try {
      let result = await notifications.checkPermissions();
      if (result.display === 'prompt' || result.display === 'prompt-with-rationale') {
        result = await notifications.requestPermissions();
      }
      if (disposed) return false;
      const permission = result.display || 'default';
      const enabled = permission === 'granted';
      update({ permission, enabled, ready: true, busy: false,
        error: enabled ? '' : 'Notifications are not permitted on this iPhone.' });
      if (enabled) queueLatest();
      return enabled;
    } catch (error) {
      if (!disposed) update({ busy: false, status: 'unconfirmed', error: error?.message || 'Could not enable notifications.' });
      return false;
    }
  }
  function syncTimer(timer) {
    const next = deadlineOf(timer);
    if (desiredDeadline === next) return;
    desiredDeadline = next;
    queueLatest();
  }
  function retry() {
    if (disposed) return Promise.resolve(false);
    queuedDeadline = undefined;
    return state.ready ? (queueLatest(), Promise.resolve(true)) : prepare();
  }
  function disable() {
    desiredDeadline = null;
    queuedDeadline = undefined;
    update({ enabled: false, status: 'idle' });
    return enqueue(() => notifications.cancel({ notifications: [{ id: TEA_READY_NOTIFICATION_ID }] }));
  }
  return { snapshot, prepare, enable, disable, retry, syncTimer,
    destroy() { disposed = true; },
  };
}
