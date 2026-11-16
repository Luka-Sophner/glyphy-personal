import { useMemo } from 'react';
import type { GlyphySymbol } from '../types';
import type { SearchResult } from '../features/symbols/search';
import { SymbolGrid } from './SymbolGrid';
import { GlyphCard } from './GlyphCard';
import type { GlyphRecord } from '../types/glyphs-diary';
export function SearchResults({ results, dark = false, pending = false, glyphs }: { results: SearchResult<GlyphySymbol>[]; dark?: boolean; pending?: boolean; glyphs?: GlyphRecord[] }) {
  const cards = useMemo(() => results.map(result => result.card), [results]);
  const displayTitles = useMemo(() => new Map(results.map(result => [result.card.id, result.meaning.primary])), [results]);
  return <div className="search-results" aria-busy={pending}>
    <p className="search-summary" role="status" aria-live="polite" aria-atomic="true">{results.length || glyphs?.length ? `Найдено карточек: ${results.length}${glyphs ? `. Глифов: ${glyphs.length}` : ''}` : 'Ничего не найдено'}</p>
    <SymbolGrid symbols={cards} dark={dark} displayTitles={displayTitles}>
      {glyphs?.map((glyph, index) => <GlyphCard key={`glyph-${glyph.id}`} glyph={glyph} index={index} backgroundPath="/" compact />)}
    </SymbolGrid>
  </div>;
}

