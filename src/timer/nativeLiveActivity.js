export function createNativeLiveActivitySync(plugin, onError) {
  let lastKey;
  let queue = Promise.resolve();

  return function sync(timer) {
    const status = timer.finished ? 'finished' : timer.running ? 'running'
      : !timer.preparing && timer.remaining < timer.total ? 'paused' : 'idle';
    const deadline = status === 'running' ? timer.deadline : 0;
    const remaining = status === 'paused' ? timer.remaining : 0;
    const key = JSON.stringify([status, deadline, remaining]);
    if (key === lastKey) return queue;
    lastKey = key;
    queue = queue.then(() => plugin.sync({ status, deadline, remaining })).catch(error => {
      if (key === lastKey) lastKey = undefined;
      onError(error);
    });
    return queue;
  };
}
