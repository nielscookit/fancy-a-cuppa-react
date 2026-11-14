import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabaseConfig } from '../data/supabaseConfig.js';
import { createPushController } from './pushController.js';
import { createNativeNotificationController } from './nativeNotificationController.js';

import { createNativeTeaAlarm } from '../timer/nativeTeaAlarm.js';
import { createNativeLiveActivitySync } from '../timer/nativeLiveActivity.js';

const liveActivity = createNativeLiveActivitySync(registerPlugin('FACLiveActivity'), error => {
  console.warn('[FAC Activity]', error);
});

// Browser/PWA keeps Supabase Web Push; native Capacitor uses local notifications.
// Never instantiate both controllers for a single timer.
export function usePushNotifications() {
  const controller = useRef(null);
  const timer = useRef(null);
  const ios = Capacitor.getPlatform() === 'ios';
  const alarm = useRef(null);
  if (ios && !alarm.current) {
    alarm.current = createNativeTeaAlarm({
      alarm: registerPlugin('FACTeaAlarm'),
      fallback: {
        sync: state => {
          controller.current?.syncTimer(state);
          void liveActivity(state);
        },
        enable: () => controller.current?.enable(),
      },
      onError: error => console.warn('[FAC AlarmKit]', error),
    });
  }
  useEffect(() => {
    const instance = alarm.current;
    if (!instance) return;
    const reconcile = () => { void instance.reconcile(); };
    document.addEventListener('fac:native-foreground', reconcile);
    return () => document.removeEventListener('fac:native-foreground', reconcile);
  }, []);
  const [snapshot, setSnapshot] = useState({ available: false, installed: false, busy: true, error: '' });
  useEffect(() => {
    let storage;
    try { storage = globalThis.localStorage; } catch { /* Report storage failure on enable. */ }
    const push = Capacitor.isNativePlatform()
      ? createNativeNotificationController({ notifications: LocalNotifications, onChange: setSnapshot })
      : createPushController({
        endpoint: supabaseConfig.url + '/functions/v1/tea-push',
        baseUrl: import.meta.env.BASE_URL, storage, onChange: setSnapshot,
      });
    controller.current = push;
    setSnapshot(push.snapshot());
    if (timer.current) push.syncTimer(timer.current);
    void push.prepare();
    return () => { controller.current = null; push.destroy(); };
  }, []);
  const syncTimer = useCallback(state => {
    timer.current = state;
    if (alarm.current) void alarm.current.sync(state);
    else controller.current?.syncTimer(state);
  }, []);
  const enable = useCallback(() => {
    if (!alarm.current) return controller.current?.enable();
  }, []);
  const resetAlarm = useCallback(() => alarm.current?.reset(), []);
  const useReady = useCallback(() => alarm.current?.useReady() ?? true, []);
  const disable = useCallback(() => controller.current?.disable(), []);
  const retry = useCallback(() => controller.current?.retry(), []);
  return { snapshot, syncTimer, enable, disable, retry, resetAlarm, useReady };
}
