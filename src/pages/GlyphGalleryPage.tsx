import { useDeferredValue, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlyphs } from '../features/glyphs/GlyphContext';
import { GlyphCard } from '../components/GlyphCard';
import { AnimatePresence } from '../lib/motion';
export function GlyphGalleryPage() {
  const { glyphs, query, search, loading, error, notice } = useGlyphs(), navigate = useNavigate();
  const deferred = useDeferredValue(query), results = useMemo(() => search(deferred), [search, deferred]);
  return <section className="glyph-gallery"><h1 className="sr-only">Глифы</h1>{notice && <p className="glyph-save-notice" role="status">{notice}</p>}
    {loading ? <p className="empty-state" role="status">Загрузка глифов…</p> : error ? <p role="alert">{error}</p> : <>
      {query.trim() && <p className="search-summary" role="status">{results.length ? `Найдено глифов: ${results.length}` : 'Ничего не найдено'}</p>}
      {!glyphs.length && <div className="empty-state"><p>Глифов пока нет. Создайте первый глиф.</p><button type="button" className="create-first-glyph" onClick={() => navigate('/glyphs/new/edit', { state: { backgroundPath: '/glyphs', glyphEditorFrom: '/glyphs' } })}>Создать глиф</button></div>}
      <div className="glyph-gallery-grid" aria-busy={query !== deferred}><AnimatePresence>{results.map((glyph, index) => <GlyphCard key={glyph.id} glyph={glyph} index={index} />)}</AnimatePresence></div>
    </>}
  </section>;
}

