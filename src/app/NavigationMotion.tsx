import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { animate, motion, MotionConfig, useMotionValue } from '../lib/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { isHomeReturn } from '../lib/home-navigation';
import { animation, circleOrigin, coveringScale, type CircleOrigin } from '../lib/animations';
interface Source { categoryId: string; origin: CircleOrigin; scrollY: number }
interface Layer { id: number; direction: 'forward' | 'reverse' | 'fade'; source?: Source }
interface NavigationState {
  displayedLocation: Location; reduced: boolean; returning: boolean; homeVisited: MutableRefObject<boolean>; homeEntranceKey: number;
  openCategory: (id: string, circle: Element | null) => void; backToDictionary: () => void;
}
const Context = createContext<NavigationState | null>(null);
const isCategory = (path: string) => path.startsWith('/category/');
const isModal = (path: string) => path.startsWith('/cards/') || path.startsWith('/glyphs/') || path.startsWith('/diary/');
export function NavigationMotionProvider({ children }: { children: ReactNode }) {
  const actual = useLocation(), navigate = useNavigate(), reduced = !!useReducedMotion();
  const [homeEntranceKey, setHomeEntranceKey] = useState(0);
  const [displayedLocation, setDisplayed] = useState(actual), [layer, setLayer] = useState<Layer | null>(null);
  const actualRef = useRef(actual); actualRef.current = actual;
  const displayRef = useRef(displayedLocation); displayRef.current = displayedLocation;
  const source = useRef<Source | null>(null), homeVisited = useRef(false), sequence = useRef(0);
  const previousKey = useRef(actual.key), previousReduced = useRef(reduced), scrollLocation = useRef(actual);
  const openCategory = (categoryId: string, circle: Element | null) => {
    if (circle) source.current = { categoryId, origin: circleOrigin(circle.getBoundingClientRect()), scrollY: window.scrollY };
    navigate(`/category/${categoryId}`);
  };
  useLayoutEffect(() => {
    if (previousKey.current === actual.key && previousReduced.current === reduced) return;
    previousKey.current = actual.key; previousReduced.current = reduced;
    if (isHomeReturn(displayRef.current, actual)) { homeVisited.current = false; setHomeEntranceKey(value => value + 1); }
    const id = ++sequence.current, previous = displayRef.current.pathname, next = actual.pathname;
    setLayer(null);
    if (!reduced && isCategory(next) && previous === '/dictionary') {
      const categoryId = next.split('/')[2];
      const circle = document.querySelector(`[data-category-id="${categoryId}"] .category-circle`);
      if (circle) source.current = { categoryId, origin: circleOrigin(circle.getBoundingClientRect()), scrollY: window.scrollY };
      if (source.current?.categoryId === categoryId) {
        setLayer({ id, direction: 'forward', source: source.current });
        return; // Keep the dictionary until complete viewport coverage.
      }
    }
    if (!reduced && isCategory(previous) && next === '/dictionary') {
      setLayer(source.current && previous.endsWith(`/${source.current.categoryId}`)
        ? { id, direction: 'reverse', source: source.current } : { id, direction: 'fade' });
    } else if (!reduced && isCategory(previous) && !isCategory(next) && !isModal(next)) {
      setLayer({ id, direction: 'fade' });
    }
    setDisplayed(actual);
  }, [actual.key, actual.pathname, reduced]);
  useLayoutEffect(() => {
    const previous = scrollLocation.current; scrollLocation.current = displayedLocation;
    if (previous.key === displayedLocation.key || isModal(previous.pathname) || isModal(displayedLocation.pathname)) return;
    window.scrollTo({ top: displayedLocation.pathname === '/dictionary' ? source.current?.scrollY ?? 0 : 0, left: 0, behavior: 'instant' });
  }, [displayedLocation]);
  useEffect(() => {
    const cancel = () => { ++sequence.current; setLayer(null); setDisplayed(actualRef.current); };
    window.addEventListener('resize', cancel);
    const visibility = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('resize', cancel); document.removeEventListener('visibilitychange', visibility); ++sequence.current; };
  }, []);
  const done = (id: number) => { if (sequence.current === id) setLayer(null); };
  const reveal = (id: number) => { if (sequence.current === id) setDisplayed(actualRef.current); };
  useEffect(() => {
    if (layer?.direction !== 'fade') return;
    const timer = window.setTimeout(() => done(layer.id), animation.modalExitDeadlineMs);
    return () => window.clearTimeout(timer);
  }, [layer?.id]);
  return <Context.Provider value={{ displayedLocation, reduced, returning: layer?.direction === 'reverse', homeVisited, homeEntranceKey, openCategory, backToDictionary: () => navigate('/dictionary') }}>
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}
    {layer?.direction === 'fade' && <motion.div key={layer.id} className="route-fade-layer" aria-hidden="true" data-route-transition="fallback"
      initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={animation.exit} onAnimationComplete={() => done(layer.id)} />}
    {layer?.source && layer.direction !== 'fade' && <CircleLayer key={layer.id} layer={layer} reveal={reveal} done={done} />}</MotionConfig>
  </Context.Provider>;
}
function CircleLayer({ layer, reveal, done }: { layer: Layer; reveal: (id: number) => void; done: (id: number) => void }) {
  const source = layer.source!, reverse = layer.direction === 'reverse';
  const [shape, setShape] = useState(source.origin);
  const scale = useMotionValue(reverse ? coveringScale(shape, innerWidth, innerHeight) : 1), opacity = useMotionValue(1);
  useEffect(() => {
    let cancelled = false, frame = 0;
    let running: { stop: () => void } | undefined;
    // Background/occluded WebViews may suspend RAF. Never retain a route layer.
    const deadline = window.setTimeout(() => {
      cancelled = true; running?.stop(); cancelAnimationFrame(frame);
      if (!reverse) reveal(layer.id);
      done(layer.id);
    }, animation.circleDeadlineMs);
    const nextFrame = () => new Promise<void>(resolve => { frame = requestAnimationFrame(() => resolve()); });
    const run = async () => {
      if (reverse) {
        await nextFrame(); // Restore dictionary layout/scroll before measuring.
        if (cancelled) return;
        const circle = document.querySelector(`[data-category-id="${source.categoryId}"] .category-circle`);
        if (!circle) { const fade = animate(opacity, 0, animation.exit); running = fade; await fade; }
        else {
          const target = circleOrigin(circle.getBoundingClientRect());
          setShape(target); scale.set(coveringScale(target, innerWidth, innerHeight));
          await nextFrame(); if (cancelled) return;
          const shrink = animate(scale, 1, animation.circle); running = shrink; await shrink;
        }
      } else {
        const growth = animate(scale, coveringScale(source.origin, innerWidth, innerHeight), animation.circle); running = growth; await growth;
        if (cancelled) return;
        reveal(layer.id); await nextFrame(); await nextFrame();
        if (cancelled) return;
        const fade = animate(opacity, 0, animation.fade); running = fade; await fade;
      }
      if (!cancelled) done(layer.id);
    };
    void run();
    return () => { cancelled = true; window.clearTimeout(deadline); cancelAnimationFrame(frame); running?.stop(); };
  }, [layer.id]);
  return <motion.div className="route-circle-layer" aria-hidden="true" data-route-transition={layer.direction}
    data-origin-x={shape.x} data-origin-y={shape.y} data-origin-radius={shape.radius}
    style={{ left: shape.x - shape.radius, top: shape.y - shape.radius, width: shape.radius * 2, height: shape.radius * 2, scale, opacity }} />;
}
export function useNavigationMotion() {
  const context = useContext(Context); if (!context) throw new Error('NavigationMotionProvider is required'); return context;
}



