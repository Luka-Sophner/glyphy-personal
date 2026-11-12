import Dexie, { type Table } from 'dexie';
import type { SymbolCard, MediaAsset, CategoryMeaning } from '../types/index.js';
import { categories } from '../lib/categories.js';
import { createId } from '../lib/id.js';
import type { GlyphRecord, DiaryEntry, DiaryGroup } from '../types/glyphs-diary.js';

export interface StoredSymbolCard extends SymbolCard { categories: string[] }
export interface StoredGlyphRecord extends GlyphRecord { imageIds: string[] }
export interface DatabaseMeta { key: string; value: unknown }
export const schemaV1 = { cards: 'id,imageId,createdAt,updatedAt,*tags', media: 'id,createdAt', meta: 'key' };
export const schemaV2 = { ...schemaV1, cards: 'id,imageId,createdAt,updatedAt,*tags,*categories' };
export const schemaV3 = { ...schemaV2, glyphs: 'id,primaryMeaning,createdAt,updatedAt', diaryEntries: 'id,title,observationDate,createdAt,updatedAt,*imageIds' };
export const schemaV4 = { ...schemaV3, glyphs: 'id,primaryMeaning,createdAt,updatedAt,*imageIds' };
export const schemaV5 = { ...schemaV4, diaryEntries: `${schemaV3.diaryEntries},groupId`, diaryGroups: 'id,order,title,createdAt,updatedAt' };

export class GlyphyDatabase extends Dexie {
  cards!: Table<StoredSymbolCard, string>;
  media!: Table<MediaAsset, string>;
  meta!: Table<DatabaseMeta, string>;
  glyphs!: Table<StoredGlyphRecord, string>;
  diaryEntries!: Table<DiaryEntry, string>;
  diaryGroups!: Table<DiaryGroup, string>;
  constructor(name = 'glyphy') {
    super(name);
    this.version(1).stores(schemaV1);
    this.version(2).stores(schemaV2).upgrade(async transaction => {
      // v1 accepted a single secondary string/categoryId. Preserve media and ids.
      await transaction.table('cards').toCollection().modify((card: Record<string, unknown>) => {
        const groups = (Array.isArray(card.meanings) ? card.meanings : []) as Record<string, unknown>[];
        let primaryFound = false;
        const meanings: CategoryMeaning[] = groups.map((group, index) => {
          const candidate = group.category ?? group.categoryId;
          const category = categories.find(c => c.id === candidate)?.id ?? 'phenomena';
          const main = !!group.isPrimaryCategory && !primaryFound;
          if (main) primaryFound = true;
          return { id: String(group.id ?? createId()), category, primary: String(group.primary ?? ''),
            secondary: (Array.isArray(group.secondary) ? group.secondary : [group.secondary]).filter(s => typeof s === 'string' && s.trim()).map(String),
            isPrimaryCategory: main, order: index };
        });
        if (!primaryFound && meanings[0]) meanings[0].isPrimaryCategory = true;
        card.meanings = meanings;
        card.categories = [...new Set(meanings.map(group => group.category))];
        card.imageId ??= null;
        card.createdAt ??= Date.now(); card.updatedAt ??= card.createdAt;
      });
    });
    // Additive migration: the dictionary and all original Blob records stay intact.
    this.version(3).stores(schemaV3);
    this.version(4).stores(schemaV4).upgrade(async transaction => {
      const cards = new Map((await transaction.table('cards').toArray()).map(card => [card.id, card]));
      await transaction.table('glyphs').toCollection().modify((glyph: StoredGlyphRecord) => {
        glyph.cells = glyph.cells.map(cell => ({ ...cell, imageIdSnapshot: cell.symbolId ? cards.get(cell.symbolId)?.imageId ?? null : null }));
        glyph.imageIds = [...new Set(glyph.cells.flatMap(cell => cell.imageIdSnapshot ? [cell.imageIdSnapshot] : []))];
      });
    });
    // Optional membership leaves every old entry, date and Blob untouched.
    this.version(5).stores(schemaV5);
  }
}
