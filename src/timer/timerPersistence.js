/** Versioned local recovery; running timers retain an absolute wall-clock deadline. */
export function readTimerSession(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem(key) || 'null');
    if (!value || value.version !== 1 || !['running','paused','finished'].includes(value.status)
      || !Number.isFinite(value.total) || value.total < 1 || value.total > 3600
      || !Number.isFinite(value.remaining) || value.remaining < 0 || value.remaining > value.total
      || (value.status === 'running' && !Number.isFinite(value.deadline))) return null;
    return value;
  } catch { return null; }
}
export function persistTimerSession(storage, key, state) {
  try {
    const active = state.running || state.finished || state.remaining < state.total;
    if (!active) { storage?.removeItem(key); return; }
    const value = JSON.stringify({version:1,total:state.total,
      status:state.finished?'finished':state.running?'running':'paused',
      remaining:state.running?state.total:state.remaining,
      deadline:state.running?state.deadline:null, warnedThirty:state.warnedThirty});
    if (storage?.getItem(key) !== value) storage?.setItem(key, value);
  } catch { /* Storage restrictions must never interrupt a timer. */ }
}
