import { useMemo } from 'react';
import type { GlyphySymbol } from '../types';
import type { SearchResult } from '../features/symbols/search';
import { SymbolGrid } from './SymbolGrid';
export function SearchResults({ results, dark = false, pending = false }: { results: SearchResult<GlyphySymbol>[]; dark?: boolean; pending?: boolean }) {
  const cards = useMemo(() => results.map(result => result.card), [results]);
  const displayTitles = useMemo(() => new Map(results.map(result => [result.card.id, result.meaning.primary])), [results]);
  return <div className="search-results" aria-busy={pending}>
    <p className="search-summary" role="status" aria-live="polite" aria-atomic="true">{results.length ? `Найдено карточек: ${results.length}` : 'Ничего не найдено'}</p>
    <SymbolGrid symbols={cards} dark={dark} displayTitles={displayTitles} />
  </div>;
}

