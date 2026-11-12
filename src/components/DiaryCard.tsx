import { useLocation, useNavigate } from 'react-router-dom';
import type { DiaryEntry } from '../types/glyphs-diary';
import { diaryDate, formatDiaryDate } from '../features/diary/presentation';
import { diaryPath } from '../features/diary/routes';
import { motion, useIsPresent } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';
import { DiaryImage } from './DiaryImage';

export function DiaryCard({ entry, index = 0 }: { entry: DiaryEntry; index?: number }) {
  const navigate = useNavigate(), location = useLocation(), { reduced } = useNavigationMotion(), present = useIsPresent();
  return <motion.article layout className="diary-list-item" initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .98 }}
    transition={reduced ? { duration: 0 } : { ...animation.row, delay: Math.min(index, 8) * animation.cardStagger, layout: animation.layout }}>
    <time className="diary-card-date" dateTime={diaryDate(entry)}>{formatDiaryDate(diaryDate(entry))}</time>
    <motion.button type="button" className="diary-card" disabled={!present} tabIndex={present ? 0 : -1} aria-label={`Открыть запись: ${entry.title}`} whileTap={reduced ? undefined : { scale: animation.pressScale }}
      onClick={event => { event.currentTarget.focus({ preventScroll: true }); navigate(diaryPath(entry.id), { state: { backgroundPath: '/diary', fromDiary: true, diaryBackgroundSearch: location.search } }); }}>
      <span className="diary-card-image"><DiaryImage imageId={entry.imageIds[0]} thumbnail alt={`Хайку: ${entry.title}`} /></span>
      <span className="diary-card-title">{entry.title}</span>
    </motion.button>
  </motion.article>;
}
