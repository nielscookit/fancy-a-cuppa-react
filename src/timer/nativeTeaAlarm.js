// One owner per React deadline. A serialized queue gives RESET the last word
// even when an authorization prompt or native schedule call is still pending.
export function createNativeTeaAlarm({ alarm, fallback, onError, now = Date.now }) {
  let run;
  let queue = Promise.resolve();

  function sync(state) {
    if (state.preparing) return;
    if (!state.running) {
      if (run?.owner === 'fallback' || !run) fallback.sync(state);
      if (!state.finished) run = undefined;
      return;
    }
    if (run?.deadline === state.deadline || state.deadline <= now()) return;
    const current = { deadline: state.deadline, owner: 'pending' };
    run = current;
    current.result = queue = queue.then(async () => {
      if (run !== current) return;
      try {
        const status = await alarm.status();
        if (run !== current) return;
        if (!status.available) throw new Error('AlarmKit unavailable.');
        await alarm.schedule({ deadline: current.deadline });
        current.owner = 'alarm';
      } catch (error) {
        if (run !== current) return;
        onError(error);
        current.owner = 'fallback';
        if (current.deadline > now()) {
          fallback.sync(state);
          void fallback.enable();
        }
      }
    });
    return current.result;
  }

  function reset() {
    run = undefined;
    queue = queue.then(() => alarm.clear()).catch(onError);
    return queue;
  }

  function useReady() {
    const current = run;
    if (!current) return true;
    if (current.owner !== 'pending') return current.owner === 'fallback';
    return current.result.then(() => run === current && current.owner === 'fallback');
  }

  function reconcile() {
    // The OS owns the alert after scheduling. Observe its state without
    // recreating an alarm dismissed from the Lock Screen.
    return queue.then(() => alarm.status()).catch(onError);
  }

  return { sync, reset, useReady, reconcile };
}
