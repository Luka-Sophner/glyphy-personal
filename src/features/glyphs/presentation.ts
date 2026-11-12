import type { GlyphRecord, GlyphCell } from '../../types/glyphs-diary.js';
import { glyphPositions } from '../../types/glyphs-diary.js';
import type { GlyphySymbol } from '../../types/index.js';
export function resolveGlyphCells(glyph: GlyphRecord, symbols: ReadonlyMap<string, GlyphySymbol>) {
  return glyphPositions.map(position => {
    const cell: GlyphCell = glyph.cells.find(cell => cell.position === position) ?? { position, symbolId: null, meaningId: null, meaningSnapshot: '' };
    const symbol = cell.symbolId ? symbols.get(cell.symbolId) : undefined;
    return { cell, symbol, unavailable: !!cell.symbolId && !symbol };
  });
}
