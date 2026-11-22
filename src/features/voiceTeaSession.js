let generation = 0;

/** One active turn owns UI updates until it settles or is invalidated. */
export function createVoiceTeaSession(bridge, { update, handle, notify, visible }) {
  let active;

  function cancel() {
    const id = active;
    active = undefined;
    if (id) void bridge.cancel({ id }).catch(() => {});
  }

  async function toggle() {
    if (active) {
      cancel();
      update('idle');
      return;
    }
    const id = String(++generation);
    active = id;
    update('idle');
    const current = () => active === id && visible();
    let listener;
    try {
      listener = await bridge.addListener('phase', event => {
        if (event.id === id && current() && ['listening', 'processing'].includes(event.phase)) update(event.phase);
      });
      if (!current()) return;
      const { transcripts, debug } = await bridge.listen({ id });
      if (!current()) return;
      update('processing');
      const trace = (intent, outcome) => {
        if (debug === true) void bridge.trace({ id, intent, outcome }).catch(() => {});
      };
      const handled = await handle(transcripts, current, trace);
      if (current()) update(handled ? 'idle' : 'unrecognised');
    } catch (error) {
      if (!current()) return;
      if (error.code === 'CANCELLED') update('idle');
      else {
        if (error.code === 'PERMISSION' || error.code === 'UNAVAILABLE') notify(error.code);
        update('unrecognised');
      }
    } finally {
      if (active === id) active = undefined;
      await listener?.remove().catch(() => {});
    }
  }

  return { cancel, toggle };
}
