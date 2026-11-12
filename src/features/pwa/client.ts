import { nativeRuntime } from '../native/adapter.mjs';
import { useSyncExternalStore } from 'react';
interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
interface PwaState { status: 'starting' | 'ready' | 'reload' | 'unsupported' | 'insecure' | 'error' | 'dev'; update: boolean; installable: boolean; offline: boolean }
let state: PwaState = { status: 'starting', update: false, installable: false, offline: !navigator.onLine };
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | undefined, installPrompt: InstallPrompt | undefined, requestedUpdate = false, started = false;
function publish(patch: Partial<PwaState>) { state = { ...state, ...patch }; listeners.forEach(listener => listener()); }
export function usePwa() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state); }
export function registerPwa() {
  if (nativeRuntime) { publish({ status: 'ready', installable: false, update: false }); return; }
  if (started) return; started = true;
  window.addEventListener('online', () => publish({ offline: false }));
  window.addEventListener('offline', () => publish({ offline: true }));
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event as InstallPrompt; publish({ installable: true }); });
  window.addEventListener('appinstalled', () => { installPrompt = undefined; publish({ installable: false }); });
  if (!window.isSecureContext) { publish({ status: 'insecure' }); return; }
  if (!('serviceWorker' in navigator)) { publish({ status: 'unsupported' }); return; }
  if (!import.meta.env.PROD) { publish({ status: 'dev' }); return; }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    publish({ status: 'ready' });
    if (requestedUpdate) window.location.reload();
  });
  void navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './', updateViaCache: 'none' }).then(async value => {
    registration = value;
    publish({ update: !!value.waiting });
    value.addEventListener('updatefound', () => {
      const installing = value.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) publish({ update: true });
      });
    });
    await navigator.serviceWorker.ready;
    publish({ status: navigator.serviceWorker.controller ? 'ready' : 'reload' });
    void value.update().catch(() => {}); // Offline is a normal condition, not a database error.
  }).catch(() => publish({ status: 'error' }));
}
export async function installPwa() {
  if (!installPrompt) return;
  await installPrompt.prompt(); await installPrompt.userChoice;
  installPrompt = undefined; publish({ installable: false });
}
export function applyPwaUpdate() {
  if (!registration?.waiting) return;
  requestedUpdate = true; registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
}
