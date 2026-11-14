import { GlyphyDatabase, type StoredSymbolCard } from './database.js';
import { categories } from '../lib/categories.js';
import { createId } from '../lib/id.js';
import { collectUnusedMedia } from './media-lifecycle.js';
import { storeMedia } from './media-storage.js';
import type { CategoryId, CategoryMeaning, SymbolDraft, MediaAsset } from '../types/index.js';

function normalizeMeanings(meanings: CategoryMeaning[]): CategoryMeaning[] {
  if (!meanings.length) throw new Error('Добавьте хотя бы одну категорию.');
  if (meanings.filter(group => group.isPrimaryCategory).length !== 1) throw new Error('Назначьте одну основную категорию.');
  const ids = new Set<string>();
  return meanings.map((group, order) => {
    if (!categories.some(category => category.id === group.category)) throw new Error('Неизвестная категория.');
    if (!group.primary.trim()) throw new Error('У каждой категории должно быть основное значение.');
    if (!group.id || ids.has(group.id)) throw new Error('Повторяющийся идентификатор группы.');
    ids.add(group.id);
    return { ...group, primary: group.primary.trim(), secondary: group.secondary.map(s => s.trim()).filter(Boolean), order };
  });
}
export class SymbolRepository {
  constructor(readonly db: GlyphyDatabase) {}
  list() { return this.db.cards.orderBy('createdAt').reverse().toArray(); }
  get(id: string) { return this.db.cards.get(id); }
  byCategory(category: CategoryId) { return this.db.cards.where('categories').equals(category).toArray(); }
  snapshot() {
    return this.db.transaction('r', this.db.cards, this.db.media, async () => {
      const cards = await this.list();
      const ids = [...new Set(cards.map(card => card.imageId).filter((id): id is string => !!id))];
      const media = (await this.db.media.bulkGet(ids)).filter((asset): asset is MediaAsset => asset !== undefined);
      return { cards, media };
    });
  }
  async save(input: SymbolDraft, photoChange?: MediaAsset | null): Promise<StoredSymbolCard> {
    const storedPhoto = photoChange ? await storeMedia(photoChange) : undefined;
    const meanings = normalizeMeanings(input.meanings);
    const seen = new Set<string>();
    const tags = input.tags.map(tag => tag.trim()).filter(tag => {
      const key = tag.toLocaleLowerCase('ru'); if (!key || seen.has(key)) return false; seen.add(key); return true;
    });
    return this.db.transaction('rw', [this.db.cards, this.db.media, this.db.diaryEntries, this.db.glyphs, this.db.diaryGroups], async () => {
      const id = input.id ?? createId(), old = await this.db.cards.get(id);
      if (input.expectedUpdatedAt !== undefined && (!old || old.updatedAt !== input.expectedUpdatedAt)) {
        throw new Error('Карточка изменена или удалена в другой вкладке. Откройте её снова, чтобы не перезаписать изменения.');
      }
      let imageId = input.imageId;
      if (photoChange === null) imageId = null;
      else if (photoChange) {
        if (!photoChange.blob.size || !photoChange.thumbnailBlob.size || photoChange.width <= 0 || photoChange.height <= 0) throw new Error('Некорректная фотография.');
        await this.db.media.add(storedPhoto!); imageId = photoChange.id;
      }
      if (imageId && !await this.db.media.get(imageId)) throw new Error('Фотография не найдена. Выберите её снова.');
      const now = Math.max(Date.now(), (old?.updatedAt ?? 0) + 1);
      const card: StoredSymbolCard = { id, imageId, meanings, tags, createdAt: old?.createdAt ?? now, updatedAt: now,
        categories: [...new Set(meanings.map(group => group.category))] };
      await this.db.cards.put(card);
      if (old?.imageId && old.imageId !== imageId) await this.collectUnusedMedia(old.imageId);
      return card;
    });
  }
  async delete(id: string) {
    await this.db.transaction('rw', [this.db.cards, this.db.media, this.db.diaryEntries, this.db.glyphs, this.db.diaryGroups], async () => {
      const old = await this.db.cards.get(id);
      await this.db.cards.delete(id);
      if (old?.imageId) await this.collectUnusedMedia(old.imageId);
    });
  }
  private async collectUnusedMedia(id: string) {
    await collectUnusedMedia(this.db, id);
  }
  async seedDemo(cards: StoredSymbolCard[], media: MediaAsset[]) {
    const storedMedia = await Promise.all(media.map(storeMedia));
    await this.db.transaction('rw', [this.db.cards, this.db.media, this.db.meta], async () => {
      if (await this.db.meta.get('demo-initialized')) return;
      if (await this.db.cards.count() === 0) { await this.db.media.bulkAdd(storedMedia); await this.db.cards.bulkAdd(cards); }
      await this.db.meta.put({ key: 'demo-initialized', value: true });
    });
  }
}
export const demoMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';
export const repository = new SymbolRepository(new GlyphyDatabase(demoMode ? 'glyphy-demo' : 'glyphy'));

