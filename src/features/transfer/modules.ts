import type { StoredGlyphRecord } from '../../db/database.js';
import type { DiaryEntry, DiaryGroup, GlyphCell, GlyphPart } from '../../types/glyphs-diary.js';
import { glyphPositions } from '../../types/glyphs-diary.js';
import { assertUuid, validateLocalDate } from '../../db/model-validation.js';
import { transferLimits } from './zip-safety.js';

export interface ArchiveModules { glyphs: StoredGlyphRecord[]; diaryEntries: DiaryEntry[]; diaryGroups: DiaryGroup[] }
const bad = (): never => { throw new Error('Некорректные данные глифов или дневника в архиве.'); };
const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : bad();
const text = (value: unknown, max = 20_000) => typeof value === 'string' && value.length <= max ? value : bad();
const identifier = (value: unknown) => { const result = text(value, 160); return /^[A-Za-z0-9_-]{1,160}$/.test(result) ? result : bad(); };
const uuid = (value: unknown) => { const result = text(value, 36); assertUuid(result); return result; };
const date = (value: unknown) => { const result = text(value, 40); return Number.isFinite(Date.parse(result)) ? result : bad(); };
const list = (value: unknown, max: number = transferLimits.cards): unknown[] => Array.isArray(value) && value.length <= max ? value : bad();
const unique = <T extends { id: string }>(items: T[]) => new Set(items.map(item => item.id)).size === items.length ? items : bad();
function cells(value: unknown): GlyphCell[] {
  const raw = list(value, 9);
  if (raw.length !== 9 || new Set(raw.map(item => obj(item).position)).size !== 9) return bad();
  return raw.map(item => {
    const c = obj(item), position = glyphPositions.find(p => p === c.position);
    if (!position) return bad();
    const symbolId = c.symbolId === null ? null : identifier(c.symbolId), meaningId = c.meaningId === null ? null : identifier(c.meaningId);
    if (!!symbolId !== !!meaningId) return bad();
    const cell: GlyphCell = { position, symbolId, meaningId, meaningSnapshot: text(c.meaningSnapshot, 1000), imageIdSnapshot: c.imageIdSnapshot == null ? null : identifier(c.imageIdSnapshot) };
    if (c.specialMode !== undefined) {
      if (!['topLeft', 'bottomRight'].includes(position) || !['number', 'symbol'].includes(String(c.specialMode))) return bad();
      cell.specialMode = c.specialMode as 'number' | 'symbol';
    }
    if (c.referenceValue !== undefined) {
      const r = obj(c.referenceValue);
      if (!Number.isSafeInteger(r.value) || Number(r.value) < 1 || Number(r.value) > 2_147_483_647 || symbolId) return bad();
      if (position === 'topLeft' && r.kind === 'local-number') cell.referenceValue = { kind: 'local-number', value: Number(r.value) };
      else if (position === 'bottomRight' && r.kind === 'local-reference') cell.referenceValue = { kind: 'local-reference', value: Number(r.value), ...(r.targetGlyphId ? { targetGlyphId: uuid(r.targetGlyphId) } : {}) };
      else return bad();
    }
    return cell;
  });
}
function part(value: unknown): GlyphPart {
  const p = obj(value), primaryMeaning = text(p.primaryMeaning, 200);
  if (!primaryMeaning.trim()) return bad();
  return { id: uuid(p.id), primaryMeaning, description: text(p.description), synonyms: list(p.synonyms, 100).map(v => text(v, 200)), cells: cells(p.cells) };
}
export function glyphMediaIds(glyph: Pick<StoredGlyphRecord, 'cells' | 'additionalGlyphs'>) {
  return [...new Set([glyph.cells, ...(glyph.additionalGlyphs ?? []).map(p => p.cells)].flatMap(group => group.flatMap(cell => cell.imageIdSnapshot ? [cell.imageIdSnapshot] : [])))];
}
export function cleanModules(value: unknown): ArchiveModules {
  const data = obj(value);
  const diaryGroups = unique(list(data.diaryGroups).map(value => {
    const g = obj(value), title = text(g.title, 200);
    if (!title.trim() || !Number.isSafeInteger(g.order) || Number(g.order) < 0) return bad();
    return { id: uuid(g.id), title, coverEntryId: g.coverEntryId == null ? null : uuid(g.coverEntryId), coverImageId: g.coverImageId == null ? null : identifier(g.coverImageId), order: Number(g.order), createdAt: date(g.createdAt), updatedAt: date(g.updatedAt) };
  }));
  const groupIds = new Set(diaryGroups.map(g => g.id));
  const diaryEntries = unique(list(data.diaryEntries).map(value => {
    const e = obj(value), title = text(e.title, 200), imageIds = list(e.imageIds, 50).map(identifier), groupId = e.groupId == null ? null : uuid(e.groupId);
    if (!title.trim() || !imageIds.length || new Set(imageIds).size !== imageIds.length || groupId && !groupIds.has(groupId)) return bad();
    return { id: uuid(e.id), title, description: text(e.description), imageIds, groupId, observationDate: validateLocalDate(e.observationDate), createdAt: date(e.createdAt), updatedAt: date(e.updatedAt) };
  }));
  const glyphs = unique(list(data.glyphs).map(value => {
    const g = obj(value), primary = part(g), additionalGlyphs = unique(list(g.additionalGlyphs ?? [], 11).map(part));
    const glyph = { ...primary, additionalGlyphs, createdAt: date(g.createdAt), updatedAt: date(g.updatedAt) };
    return { ...glyph, imageIds: glyphMediaIds(glyph) };
  }));
  return { glyphs, diaryEntries, diaryGroups };
}
export function moduleMediaIds(modules: ArchiveModules) {
  return [...modules.glyphs.flatMap(glyphMediaIds), ...modules.diaryEntries.flatMap(e => e.imageIds), ...modules.diaryGroups.flatMap(g => g.coverImageId ? [g.coverImageId] : [])];
}
