import { useCallback, useEffect, useRef, useState } from 'react';
import { registerPlugin } from '@capacitor/core';
import { createVoiceTeaSession } from './voiceTeaSession.js';

const voice = registerPlugin('FACVoiceTea');

export function useNativeVoiceTea(enabled, onResult, onError) {
  const [state, setState] = useState('idle');
  const handler = useRef({ onResult, onError });
  handler.current = { onResult, onError };
  const [session] = useState(() => createVoiceTeaSession(voice, {
    update: setState,
    handle: (...args) => handler.current.onResult(...args),
    notify: code => handler.current.onError(code),
    visible: () => !document.hidden,
  }));

  const cancel = useCallback(() => {
    session.cancel();
    setState('idle');
  }, [session]);

  useEffect(() => {
    if (!enabled) { cancel(); return; }
    const hidden = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', cancel);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', cancel);
      session.cancel();
    };
  }, [enabled, cancel, session]);

  return { state, toggle: enabled ? session.toggle : undefined, cancel };
}
