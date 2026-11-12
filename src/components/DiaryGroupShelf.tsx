import { useEffect, useMemo, useRef } from 'react';
import { useDiary } from '../features/diary/DiaryContext';
import { diaryGroupCover } from '../features/diary/groups';
import { DiaryImage } from './DiaryImage';
import { motion, AnimatePresence } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';

export function DiaryGroupShelf({ activeId, onSelect }: { activeId?: string; onSelect: (id: string) => void }) {
  const { groups, entries } = useDiary(), { reduced } = useNavigationMotion();
  const covers = useMemo(() => new Map(groups.map(group => [group.id, diaryGroupCover(group, entries)])), [groups, entries]);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1);
      const max = element.scrollWidth - element.clientWidth;
      if (max <= 0 || delta < 0 && element.scrollLeft <= 0 || delta > 0 && element.scrollLeft >= max - 1) return;
      event.preventDefault();
      element.scrollLeft = Math.max(0, Math.min(max, element.scrollLeft + delta));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  return <div className="diary-group-shelf"><div ref={strip} className="diary-group-strip" role="group" aria-label="Группы дневника"><AnimatePresence initial={false}>{groups.map(group => <motion.button layout key={group.id} type="button" className="diary-group-card" aria-label={`Открыть группу: ${group.title}`} aria-pressed={activeId === group.id} onClick={() => onSelect(group.id)}
    initial={reduced ? false : { opacity: 0, scale: .94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .9 }} whileTap={reduced ? undefined : { scale: animation.pressScale }} transition={reduced ? { duration: 0 } : animation.gentleSpring}>
    <span className="diary-group-cover">{covers.get(group.id) && <DiaryImage imageId={covers.get(group.id)} thumbnail alt="" />}</span><span className="diary-group-title">{group.title}</span>
  </motion.button>)}</AnimatePresence></div></div>;
}
