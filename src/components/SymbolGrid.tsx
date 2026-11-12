import type { GlyphySymbol, CategoryId } from '../types';
import { SymbolCard } from './SymbolCard';
import { AnimatePresence } from '../lib/motion';
export function SymbolGrid({ symbols, dark = false, entrance = false, sectionIndex = 0, categoryId, displayTitles }: { symbols: GlyphySymbol[]; dark?: boolean; entrance?: boolean; sectionIndex?: number; categoryId?: CategoryId; displayTitles?: ReadonlyMap<string, string> }) {
  return <div className="symbol-grid"><AnimatePresence initial={entrance}>{symbols.map((symbol, index) => <SymbolCard key={symbol.id} symbol={symbol} dark={dark} index={index} entrance={entrance} sectionIndex={sectionIndex} categoryId={categoryId} titleOverride={displayTitles?.get(symbol.id)} />)}</AnimatePresence></div>;
}

