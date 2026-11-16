import { useLocation, useNavigate } from 'react-router-dom';
import type { GlyphySymbol, CategoryId } from '../types';
import { meaningFor } from '../features/symbols/meanings';
import { motion, useIsPresent } from '../lib/motion';
import { animation, symbolEntranceDelay } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';
export function SymbolCard({ symbol, dark = false, index = 0, entrance = false, sectionIndex = 0, categoryId, titleOverride, onSelect }: { symbol: GlyphySymbol; dark?: boolean; index?: number; entrance?: boolean; sectionIndex?: number; categoryId?: CategoryId; titleOverride?: string; onSelect?: () => void }) {
  const location = useLocation(); const navigate = useNavigate(); const title = titleOverride ?? meaningFor(symbol, categoryId)?.primary ?? 'Без названия';
  const { reduced } = useNavigationMotion(); const present = useIsPresent();
  return <motion.button layout={!onSelect} type="button" disabled={!present} aria-hidden={!present || undefined} tabIndex={present ? 0 : -1} className={`symbol-card ${dark ? 'symbol-card--dark' : ''}`} aria-label={`${onSelect ? 'Выбрать символ' : 'Открыть карточку'}: ${title}`}
    initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.9, transition: animation.exit }}
    whileTap={reduced ? undefined : { scale: animation.pressScale }}
    transition={reduced ? { duration: 0 } : { ...animation.row, delay: entrance ? symbolEntranceDelay(index, sectionIndex) : 0, layout: animation.layout }}
    onClick={event => { event.currentTarget.focus({ preventScroll: true }); if (onSelect) { onSelect(); return; } navigate(`/cards/${symbol.id}`, { state: { backgroundPath: location.pathname } }); }}>
    <img loading="lazy" decoding="async" src={symbol.thumbnail} alt="" className="symbol-card-image" /><span title={title}>{title}</span>
  </motion.button>;
}




