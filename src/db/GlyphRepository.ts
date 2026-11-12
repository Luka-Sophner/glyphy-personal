import type { GlyphyDatabase } from './database.js';
import type { GlyphCell, GlyphInput, GlyphRecord, GlyphReferenceValue, UpdateOptions } from '../types/glyphs-diary.js';
import { emptyGlyphCells, glyphPositions, glyphPositionCategories } from '../types/glyphs-diary.js';
import { collectUnusedMedia } from './media-lifecycle.js';
import { createId } from '../lib/id.js';
import { assertUuid, requiredText, optionalText, nextTimestamp, assertRevision } from './model-validation.js';

export class GlyphRepository {
  constructor(readonly db: GlyphyDatabase) {}
  list() { return this.db.glyphs.orderBy('createdAt').reverse().toArray(); }
  get(id: string) { return this.db.glyphs.get(id); }
  async create(input: GlyphInput): Promise<GlyphRecord> {
    return this.db.transaction('rw', [this.db.glyphs, this.db.cards, this.db.media, this.db.diaryEntries, this.db.diaryGroups], async () => {
      const timestamp = nextTimestamp(), id = createId(); assertUuid(id);
      const record = { id, ...await this.normalize(input), createdAt: timestamp, updatedAt: timestamp };
      await this.db.glyphs.add(record); return record;
    });
  }
  async update(id: string, patch: Partial<GlyphInput>, options: UpdateOptions = {}): Promise<GlyphRecord> {
    assertUuid(id);
    return this.db.transaction('rw', [this.db.glyphs, this.db.cards, this.db.media, this.db.diaryEntries, this.db.diaryGroups], async () => {
      const old = await this.db.glyphs.get(id); if (!old) throw new Error('Глиф не найден.');
      assertRevision(old.updatedAt, options.expectedUpdatedAt);
      const record = { id, ...await this.normalize({ primaryMeaning: patch.primaryMeaning ?? old.primaryMeaning, synonyms: patch.synonyms ?? old.synonyms, description: patch.description ?? old.description, cells: patch.cells ?? old.cells, additionalGlyphs: patch.additionalGlyphs ?? old.additionalGlyphs }, old), createdAt: old.createdAt, updatedAt: nextTimestamp(old.updatedAt) };
      await this.db.glyphs.put(record);
      for (const imageId of old.imageIds) if (!record.imageIds.includes(imageId)) await collectUnusedMedia(this.db, imageId);
      return record;
    });
  }
  async save(input: GlyphInput, id?: string, options: UpdateOptions = {}): Promise<GlyphRecord> {
    if (!input.cells?.some(cell => cell.symbolId && cell.meaningId)) throw new Error('Выберите символ хотя бы в одной смысловой ячейке.');
    return id ? this.update(id, input, options) : this.create(input);
  }
  async delete(id: string): Promise<void> {
    assertUuid(id);
    await this.db.transaction('rw', [this.db.glyphs, this.db.cards, this.db.media, this.db.diaryEntries, this.db.diaryGroups], async () => {
      const old = await this.db.glyphs.get(id); await this.db.glyphs.delete(id);
      for (const imageId of old?.imageIds ?? []) await collectUnusedMedia(this.db, imageId);
    });
  }
  private async normalize(input: GlyphInput, previous?: Pick<GlyphRecord, 'cells' | 'additionalGlyphs'>): Promise<{ primaryMeaning: string; synonyms: string[]; description: string; cells: GlyphCell[]; additionalGlyphs: NonNullable<GlyphRecord['additionalGlyphs']>; imageIds: string[] }> {
    const primaryMeaning = requiredText(input.primaryMeaning, 'значение глифа');
    const description = optionalText(input.description), rawSynonyms = input.synonyms ?? [];
    if (!Array.isArray(rawSynonyms) || rawSynonyms.length > 100) throw new Error('Некорректный список синонимов.');
    const seen = new Set<string>();
    const synonyms = rawSynonyms.map(value => optionalText(value, 200)).filter(value => { const key = value.toLocaleLowerCase('ru'); if (!value || seen.has(key)) return false; seen.add(key); return true; });
    const rawCells = input.cells ?? emptyGlyphCells();
    if (!Array.isArray(rawCells) || rawCells.length !== 9 || new Set(rawCells.map(cell => cell?.position)).size !== 9 || rawCells.some(cell => !cell || !glyphPositions.includes(cell.position))) throw new Error('Глиф должен содержать девять разных позиций.');
    const cells: GlyphCell[] = [];
    for (const position of glyphPositions) {
      const cell = rawCells.find(cell => cell.position === position)!;
      if (typeof cell.meaningSnapshot !== 'string' || cell.meaningSnapshot.length > 1000) throw new Error('Некорректный снимок значения.');
      const special = position === 'topLeft' || position === 'bottomRight';
      if (cell.specialMode !== undefined && (!special || !['number', 'symbol'].includes(cell.specialMode))) throw new Error('Некорректный режим угловой ячейки.');
      if (special && (cell.symbolId !== null || cell.meaningId !== null) && cell.specialMode !== 'symbol') throw new Error('Специальная позиция не является категорией словаря.');
      if (special && cell.specialMode === 'symbol' && (!cell.symbolId || !cell.meaningId)) throw new Error('Выберите символ для угловой ячейки.');
      if ((position === 'topLeft' || position === 'bottomRight') && cell.symbolId === null && cell.meaningId === null) {
        if (cell.meaningSnapshot !== '') throw new Error('Специальная позиция не является категорией словаря.');
        let referenceValue: GlyphReferenceValue | undefined;
        if (cell.referenceValue !== undefined) {
          const value = cell.referenceValue;
          if (!value || !Number.isSafeInteger(value.value) || value.value < 1 || value.value > 2_147_483_647 || value.kind !== (position === 'topLeft' ? 'local-number' : 'local-reference')) throw new Error('Некорректная локальная нумерация.');
          if (value.kind === 'local-reference') {
            if (value.targetGlyphId !== undefined) assertUuid(value.targetGlyphId);
            referenceValue = { kind: value.kind, value: value.value, ...(value.targetGlyphId ? { targetGlyphId: value.targetGlyphId } : {}) };
          } else referenceValue = { kind: value.kind, value: value.value };
        }
        cells.push({ position, symbolId: null, meaningId: null, meaningSnapshot: '', ...(referenceValue ? { referenceValue } : {}) }); continue;
      }
      if (cell.referenceValue !== undefined) throw new Error('Нумерация допускается только в специальных позициях.');
      if (cell.symbolId === null && cell.meaningId === null) {
        if (cell.meaningSnapshot !== '') throw new Error('Пустая ячейка не содержит значения.');
        cells.push({ position, symbolId: null, meaningId: null, meaningSnapshot: '' }); continue;
      }
      const symbolId = requiredText(cell.symbolId, 'символ', 160), meaningId = requiredText(cell.meaningId, 'группа значения', 160);
      const old = previous?.cells.find(value => value.position === position);
      if (old && old.symbolId === symbolId && old.meaningId === meaningId && old.meaningSnapshot === cell.meaningSnapshot) {
        // Historical reading survives later dictionary edits and deletion.
        cells.push({ position, symbolId, meaningId, meaningSnapshot: old.meaningSnapshot, imageIdSnapshot: old.imageIdSnapshot ?? null, ...(special ? { specialMode: 'symbol' as const } : {}) }); continue;
      }
      const symbol = await this.db.cards.get(symbolId), meaning = symbol?.meanings.find(value => value.id === meaningId);
      const expectedCategory = position in glyphPositionCategories ? glyphPositionCategories[position as keyof typeof glyphPositionCategories] : null;
      if (!meaning || expectedCategory && meaning.category !== expectedCategory) throw new Error('Символ или значение не соответствует позиции глифа.');
      const selected = cell.meaningSnapshot || meaning.primary;
      if (![meaning.primary, ...meaning.secondary].includes(selected)) throw new Error('Выбранное значение отсутствует в группе символа.');
      cells.push({ position, symbolId, meaningId, meaningSnapshot: selected, imageIdSnapshot: old?.symbolId === symbolId && old.meaningId === meaningId ? old.imageIdSnapshot ?? null : symbol?.imageId ?? null, ...(special ? { specialMode: 'symbol' as const } : {}) });
    }
    const rawParts = input.additionalGlyphs ?? [];
    if (!Array.isArray(rawParts) || rawParts.length > 11) throw new Error('В связке может быть не больше 12 глифов.');
    const ids = new Set<string>(), additionalGlyphs: NonNullable<GlyphRecord['additionalGlyphs']> = [];
    for (const part of rawParts) {
      if (!part) throw new Error('Некорректный глиф связки.');
      assertUuid(part.id);
      if (ids.has(part.id) || 'additionalGlyphs' in part) throw new Error('Некорректная структура связки.');
      ids.add(part.id);
      if (!part.cells?.some(cell => cell.symbolId && cell.meaningId)) throw new Error('Выберите хотя бы один символ в каждом глифе связки.');
      const normalized = await this.normalize(part, previous?.additionalGlyphs?.find(value => value.id === part.id));
      additionalGlyphs.push({ id: part.id, primaryMeaning: normalized.primaryMeaning, synonyms: normalized.synonyms, description: normalized.description, cells: normalized.cells });
    }
    return { primaryMeaning, synonyms, description, cells, additionalGlyphs, imageIds: [...new Set([cells, ...additionalGlyphs.map(part => part.cells)].flatMap(group => group.flatMap(cell => cell.imageIdSnapshot ? [cell.imageIdSnapshot] : [])))] };
  }
}
