// Register the wake-up listener before draining the native mailbox. The native
// plugin is the source of truth, so a cold start needs no retained JS event.
export function observeNativeQuickAccess(plugin, onTarget, onError) {
  let disposed = false;
  let listener;
  let draining = false;
  let requested = false;

  async function drain() {
    requested = true;
    if (draining || disposed) return;
    draining = true;
    try {
      while (requested && !disposed) {
        requested = false;
        const { target } = await plugin.takePending();
        // A Strict Mode cleanup can race with the initial takePending.
        // The stable App handler still owns this delivery.
        if (target === 'timer' || target === 'scanner') onTarget(target);
      }
    } catch (error) {
      if (!disposed) onError(error);
    } finally {
      draining = false;
    }
  }

  plugin.addListener('pending', drain).then(handle => {
    if (disposed) {
      void handle.remove();
      return;
    }
    listener = handle;
    void drain();
  }).catch(error => { if (!disposed) onError(error); });

  return () => {
    disposed = true;
    if (listener) void listener.remove();
  };
}

export function routeNativeQuickAccess(target, { showHome, cameraBusy, openCamera, closeCamera }) {
  if (target === 'timer') {
    showHome();
    if (cameraBusy()) void closeCamera();
  } else if (target === 'scanner' && !cameraBusy()) {
    showHome();
    void openCamera({ fromQuickAccess: true });
  }
}

// The existing native photo lookup expires after five seconds. Keep room for
// the bridge round trip while giving an in-progress catalogue request a chance.
export async function waitForCameraCatalog(request) {
  let timeout;
  try {
    return await Promise.race([request, new Promise(resolve => {
      timeout = setTimeout(() => resolve([]), 4000);
    })]);
  } finally {
    clearTimeout(timeout);
  }
}
