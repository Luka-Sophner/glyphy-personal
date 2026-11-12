import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { animate, motion, useAnimationControls, useMotionValue, usePresence } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';

let returnFocusTarget: HTMLElement | null = null;

export function Modal({ children, labelId, onClose, className = '', elementRef }: { children: ReactNode; labelId: string; onClose: () => void; className?: string; elementRef?: RefObject<HTMLDialogElement> }) {
  const internalDialog = useRef<HTMLDialogElement>(null), dialog = elementRef ?? internalDialog, closeRef = useRef(onClose); closeRef.current = onClose;
  const [present, safeToRemove] = usePresence();
  const { reduced } = useNavigationMotion();
  const controls = useAnimationControls(), backdrop = useMotionValue(reduced ? 1 : 0);
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const element = dialog.current;
      if (!element) return;
      element.style.setProperty('--modal-viewport-height', `${viewport.height}px`);
      element.style.setProperty('--modal-viewport-top', `${viewport.offsetTop}px`);
      element.style.setProperty('--modal-viewport-bottom', `${Math.max(0, innerHeight - viewport.offsetTop - viewport.height)}px`);
    };
    update(); viewport.addEventListener('resize', update); viewport.addEventListener('scroll', update);
    return () => { viewport.removeEventListener('resize', update); viewport.removeEventListener('scroll', update); };
  }, []);
  useLayoutEffect(() => {
    const element = dialog.current!, focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body && !focused.closest('dialog')) returnFocusTarget = focused;
    element.style.setProperty('--backdrop-opacity', reduced ? '1' : '0');
    element.showModal(); element.querySelector<HTMLButtonElement>('button[aria-label^="Закрыть"]')?.focus({ preventScroll: true });
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const cancel = (event: Event) => { event.preventDefault(); closeRef.current(); };
    element.addEventListener('cancel', cancel);
    return () => { element.removeEventListener('cancel', cancel); element.close(); document.body.style.overflow = previous;
      queueMicrotask(() => {
        if (document.querySelector('dialog[open]')) return;
        if (returnFocusTarget?.isConnected) returnFocusTarget.focus({ preventScroll: true });
        else document.querySelector<HTMLInputElement>('.search-bar input')?.focus({ preventScroll: true });
        returnFocusTarget = null;
      }); };
  }, []);
  useEffect(() => backdrop.on('change', value => dialog.current?.style.setProperty('--backdrop-opacity', String(value))), [backdrop]);
  useEffect(() => {
    let cancelled = false;
    const deadline = !present ? window.setTimeout(() => { if (!cancelled) safeToRemove?.(); }, animation.modalExitDeadlineMs) : undefined;
    const fade = animate(backdrop, present ? 1 : 0, reduced ? { duration: 0 } : present ? { duration: 0.22 } : animation.exit);
    const panel = controls.start(present
      ? { opacity: 1, scale: 1, y: 0, transition: reduced ? { duration: 0 } : animation.gentleSpring }
      : { opacity: 0, scale: 0.97, y: 12, transition: reduced ? { duration: 0 } : animation.exit });
    void Promise.all([panel, fade]).then(() => { if (!cancelled && !present) safeToRemove?.(); });
    return () => { cancelled = true; window.clearTimeout(deadline); fade.stop(); controls.stop(); };
  }, [present, reduced, controls, backdrop, safeToRemove]);
  return <motion.dialog ref={dialog} className={`symbol-modal ${className}`} aria-labelledby={labelId} aria-modal="true" layout={!reduced} layoutScroll layoutRoot
    transition={{ layout: reduced ? { duration: 0 } : animation.layout }}
    initial={reduced ? false : { opacity: 0, scale: 0.94, y: 24 }} animate={controls}
    style={{ pointerEvents: present ? 'auto' : 'none' }} onClick={event => {
      if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); }
    }}>{children}</motion.dialog>;
}

