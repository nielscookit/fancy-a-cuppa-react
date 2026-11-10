import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseConfig } from '../data/supabaseConfig.js';
import { createPushController } from './pushController.js';

export function usePushNotifications() {
  const controller = useRef(null);
  const timer = useRef(null);
  const [snapshot, setSnapshot] = useState({ available: false, installed: false, busy: true, error: '' });
  useEffect(() => {
    let storage;
    try { storage = globalThis.localStorage; } catch { /* Report storage failure on enable. */ }
    const push = createPushController({
      endpoint: supabaseConfig.url + '/functions/v1/tea-push',
      baseUrl: import.meta.env.BASE_URL, storage, onChange: setSnapshot,
    });
    controller.current = push;
    setSnapshot(push.snapshot());
    if (timer.current) push.syncTimer(timer.current);
    void push.prepare();
    return () => { controller.current = null; push.destroy(); };
  }, []);
  const syncTimer = useCallback(state => { timer.current = state; controller.current?.syncTimer(state); }, []);
  const enable = useCallback(() => controller.current?.enable(), []);
  const disable = useCallback(() => controller.current?.disable(), []);
  const retry = useCallback(() => controller.current?.retry(), []);
  return { snapshot, syncTimer, enable, disable, retry };
}
