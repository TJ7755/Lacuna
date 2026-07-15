import { useEffect, useState } from 'react';

const KEY = 'lacuna.startInFocusMode';
const CHANGE_EVENT = 'lacuna:start-in-focus-mode';

export function readStartInFocusMode(): boolean {
  return localStorage.getItem(KEY) === 'on';
}

export function writeStartInFocusMode(enabled: boolean): void {
  localStorage.setItem(KEY, enabled ? 'on' : 'off');
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: enabled }));
}

export function useStartInFocusMode(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(() => readStartInFocusMode());

  useEffect(() => {
    const onChange = () => setEnabled(readStartInFocusMode());
    window.addEventListener('storage', onChange);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, []);

  return [
    enabled,
    (next) => {
      writeStartInFocusMode(next);
      setEnabled(next);
    },
  ];
}
