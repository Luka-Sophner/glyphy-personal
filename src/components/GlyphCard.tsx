import { useNavigate } from 'react-router-dom';
import type { GlyphRecord } from '../types/glyphs-diary';
import { GlyphGrid } from './GlyphGrid';
import { motion, useIsPresent } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';
import { glyphPath } from '../features/glyphs/routes';
export function GlyphCard({ glyph, index = 0, backgroundPath = '/glyphs', compact = false }: { glyph: GlyphRecord; index?: number; backgroundPath?: string; compact?: boolean }) {
  const navigate = useNavigate(), { reduced } = useNavigationMotion(), present = useIsPresent();
  return <motion.button type="button" className={`glyph-card${compact ? ' glyph-card--compact' : ''}`} disabled={!present} aria-hidden={!present || undefined} tabIndex={present ? 0 : -1} aria-label={`Открыть глиф: ${glyph.primaryMeaning}`}
    initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }}
    transition={reduced ? { duration: 0 } : { ...animation.row, delay: Math.min(index, 8) * animation.cardStagger }} whileTap={reduced ? undefined : { scale: animation.pressScale }}
    onClick={event => { event.currentTarget.focus({ preventScroll: true }); navigate(glyphPath(glyph.id), { state: { backgroundPath, fromGallery: true } }); }}>
    <GlyphGrid glyph={compact ? { ...glyph, additionalGlyphs: [] } : glyph} /><span className="glyph-card-title" title={glyph.primaryMeaning}>{glyph.primaryMeaning}</span>
  </motion.button>;
}
