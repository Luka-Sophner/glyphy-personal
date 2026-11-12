import { glyphPositions, type GlyphCell, type GlyphInput, type GlyphPosition } from '../../types/glyphs-diary.js';
import type { CategoryId, GlyphySymbol } from '../../types/index.js';
import { normalizeSearch } from '../symbols/search.js';
export const glyphPositionLabels: Record<GlyphPosition, string> = { topLeft: 'Нумерация', topCenter: 'Время', topRight: 'Событие', middleLeft: 'Качество', center: 'Явление', middleRight: 'Отношение', bottomLeft: 'Достоверность', bottomCenter: 'Переживание', bottomRight: 'Обращение к нумерации' };
export function validateGlyphInput(input: GlyphInput) {
  if (!input.primaryMeaning.trim()) throw new Error('Введите значение глифа.');
  if (!input.cells || input.cells.length !== 9 || new Set(input.cells.map(cell => cell.position)).size !== 9 || glyphPositions.some(position => !input.cells!.some(cell => cell.position === position))) throw new Error('Глиф должен содержать все девять позиций.');
  if (!input.cells.some(cell => cell.symbolId && cell.meaningId)) throw new Error('Выберите символ хотя бы в одной смысловой ячейке.');
  if ((input.additionalGlyphs?.length ?? 0) > 11) throw new Error('В связке может быть не больше 12 глифов.');
  for (const part of input.additionalGlyphs ?? []) validateGlyphInput(part);
}
export function replaceGlyphCell(cells: GlyphCell[], replacement: GlyphCell): GlyphCell[] { return glyphPositions.map(position => position === replacement.position ? replacement : cells.find(cell => cell.position === position)!); }
export function addSynonyms(existing: string[], text: string): string[] { const seen = new Set(existing.map(normalizeSearch)); return [...existing, ...text.split(',').map(value => value.trim()).filter(value => { const key = normalizeSearch(value); if (!key || seen.has(key)) return false; seen.add(key); return true; })].slice(0, 100); }
export function createPickerIndex(symbols: GlyphySymbol[], category: CategoryId | null) {
  const entries = symbols.flatMap(symbol => symbol.meanings.filter(group => category === null || group.category === category).map(group => ({ symbol, group, fields: [group.primary, ...group.secondary, ...symbol.tags].map(normalizeSearch) })));
  return (query: string) => { const needle = normalizeSearch(query); return entries.filter(entry => !needle || entry.fields.some(field => field.includes(needle))); };
}
