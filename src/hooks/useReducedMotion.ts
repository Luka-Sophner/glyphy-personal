import { useSyncExternalStore } from 'react';
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const subscribe = (notify: () => void) => { media.addEventListener('change', notify); return () => media.removeEventListener('change', notify); };
export function useReducedMotion() {
  const system = useSyncExternalStore(subscribe, () => media.matches, () => true);
  // Optional per-link accessibility override; never forces motion on.
  return system || new URLSearchParams(window.location.search).get('reduceMotion') === '1';
}
