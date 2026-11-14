import { useMemo } from 'react';
import { useSymbols } from '../features/symbols/SymbolContext';
import { useObjectURL } from '../hooks/useObjectURL';
import { type GlyphCell, type GlyphRecord } from '../types/glyphs-diary';
import type { GlyphySymbol } from '../types';
import { resolveGlyphCells } from '../features/glyphs/presentation';
import { useGlyphs } from '../features/glyphs/GlyphContext';
const labels = { topLeft: 'Нумерация', topCenter: 'Время', topRight: 'Событие', middleLeft: 'Качество', center: 'Ядро', middleRight: 'Отношение', bottomLeft: 'Достоверность', bottomCenter: 'Переживание', bottomRight: 'Обращение к нумерации' };
function Cell({ cell, symbol, rememberedBlob, interactive, onOpen }: { cell: GlyphCell; symbol?: GlyphySymbol; rememberedBlob?: Blob; interactive: boolean; onOpen?: (cell: GlyphCell) => void }) {
  const remembered = useObjectURL(rememberedBlob);
  const image = remembered ?? (symbol?.imageId ? symbol.thumbnail : undefined);
  const missing = !!cell.symbolId && !symbol;
  const title = `${labels[cell.position]}${cell.meaningSnapshot ? `: ${cell.meaningSnapshot}` : ''}${missing ? '. Исходный символ недоступен' : ''}`;
  const content = <>{image && <img src={image} alt="" loading="lazy" decoding="async" />}{cell.referenceValue && <span className="glyph-reference">{cell.referenceValue.kind === 'local-reference' ? '↗ ' : ''}{cell.referenceValue.value}</span>}{missing && <span className="glyph-missing-reading">{cell.meaningSnapshot}</span>}</>;
  return interactive && symbol ? <button type="button" className="glyph-cell" data-glyph-position={cell.position} aria-label={title} title={title} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onOpen?.(cell); }}>{content}</button>
    : <span className={`glyph-cell ${missing ? 'glyph-cell--missing' : ''}`} data-glyph-position={cell.position} aria-label={title} title={title}>{content}</span>;
}
function SingleGlyphGrid({ glyph, interactive = false, onOpen }: { glyph: GlyphRecord; interactive?: boolean; onOpen?: (cell: GlyphCell) => void }) {
  const { rememberedThumbnails, retainedThumbnails } = useGlyphs();
  const { symbols } = useSymbols(), map = useMemo(() => new Map(symbols.map(symbol => [symbol.id, symbol])), [symbols]);
  const resolved = useMemo(() => resolveGlyphCells(glyph, map), [glyph, map]);
  return <span className="glyph-grid" role="group" aria-label="Девять позиций глифа">{resolved.map(({ cell, symbol }) => <Cell key={cell.position} cell={cell} symbol={symbol} rememberedBlob={cell.imageIdSnapshot ? retainedThumbnails.get(cell.imageIdSnapshot) : cell.symbolId ? rememberedThumbnails.get(cell.symbolId) : undefined} interactive={interactive} onOpen={onOpen} />)}</span>;
}

export function GlyphGrid({ glyph, interactive = false, onOpen }: { glyph: GlyphRecord; interactive?: boolean; onOpen?: (cell: GlyphCell, partId?: string) => void }) {
  if (!glyph.additionalGlyphs?.length) return <SingleGlyphGrid glyph={glyph} interactive={interactive} onOpen={onOpen} />;
  const parts = [glyph, ...glyph.additionalGlyphs.map(part => ({ ...glyph, ...part, additionalGlyphs: [] }))];
  return <span className="glyph-composition" role="group" aria-label="Связка глифов">{parts.map((part, index) => <span key={part.id} className="glyph-composition-part" data-glyph-part={part.id}>
    <SingleGlyphGrid glyph={part} interactive={interactive} onOpen={cell => onOpen?.(cell, part.id)} />
    <span className="glyph-part-caption">{index + 1}. {part.primaryMeaning}</span>
    {interactive && !!part.synonyms.length && <span className="glyph-part-synonyms">{part.synonyms.join(', ')}</span>}
    {interactive && part.description && <span className="glyph-part-description">{part.description}</span>}
  </span>)}</span>;
}
