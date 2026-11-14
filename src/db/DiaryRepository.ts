import type { GlyphyDatabase } from './database.js';
import type { DiaryEntry, DiaryInput, UpdateOptions } from '../types/glyphs-diary.js';
import type { MediaAsset } from '../types/index.js';
import { createId } from '../lib/id.js';
import { collectUnusedMedia, validateNewMedia } from './media-lifecycle.js';
import { storeMedia, type StoredMediaAsset } from './media-storage.js';
import { assertUuid, requiredText, optionalText, nextTimestamp, assertRevision, localDate, validateLocalDate } from './model-validation.js';

export class DiaryRepository {
  constructor(readonly db: GlyphyDatabase) {}
  list() { return this.db.diaryEntries.orderBy('observationDate').reverse().toArray(); }
  get(id: string) { return this.db.diaryEntries.get(id); }
  snapshot() {
    return this.db.transaction('r', this.db.diaryEntries, this.db.media, this.db.diaryGroups, async () => {
      const entries = await this.list();
      const groups = await this.db.diaryGroups.orderBy('order').toArray();
      const ids = [...new Set([...entries.flatMap(entry => entry.imageIds), ...groups.flatMap(group => group.coverImageId ? [group.coverImageId] : [])])];
      const media = (await this.db.media.bulkGet(ids)).filter((asset): asset is MediaAsset => asset !== undefined);
      return { entries, media, groups };
    });
  }
  byDate(date: string) { return this.db.diaryEntries.where('observationDate').equals(validateLocalDate(date)).toArray(); }
  async create(input: DiaryInput, newMedia: MediaAsset[] = []): Promise<DiaryEntry> {
    newMedia.forEach(validateNewMedia);
    const storedMedia = await Promise.all(newMedia.map(storeMedia));
    return this.db.transaction('rw', [this.db.diaryEntries, this.db.media, this.db.cards, this.db.glyphs, this.db.diaryGroups], async () => {
      const id = createId(), timestamp = nextTimestamp(); assertUuid(id);
      const entry = { id, ...await this.normalize(input, newMedia, storedMedia), createdAt: timestamp, updatedAt: timestamp };
      await this.db.diaryEntries.add(entry); return entry;
    });
  }
  async update(id: string, patch: Partial<DiaryInput>, newMedia: MediaAsset[] = [], options: UpdateOptions = {}): Promise<DiaryEntry> {
    assertUuid(id);
    newMedia.forEach(validateNewMedia);
    const storedMedia = await Promise.all(newMedia.map(storeMedia));
    return this.db.transaction('rw', [this.db.diaryEntries, this.db.media, this.db.cards, this.db.glyphs, this.db.diaryGroups], async () => {
      const old = await this.db.diaryEntries.get(id); if (!old) throw new Error('Запись дневника не найдена.');
      assertRevision(old.updatedAt, options.expectedUpdatedAt);
      const entry = { id, ...await this.normalize({ title: patch.title ?? old.title, description: patch.description ?? old.description, imageIds: patch.imageIds ?? old.imageIds, observationDate: patch.observationDate ?? old.observationDate, groupId: patch.groupId === undefined ? old.groupId ?? null : patch.groupId }, newMedia, storedMedia), createdAt: old.createdAt, updatedAt: nextTimestamp(old.updatedAt) };
      await this.db.diaryEntries.put(entry);
      for (const imageId of old.imageIds.filter(imageId => !entry.imageIds.includes(imageId))) await collectUnusedMedia(this.db, imageId);
      return entry;
    });
  }
  async delete(id: string): Promise<void> {
    assertUuid(id);
    await this.db.transaction('rw', [this.db.diaryEntries, this.db.media, this.db.cards, this.db.glyphs, this.db.diaryGroups], async () => {
      const old = await this.db.diaryEntries.get(id); if (!old) return;
      await this.db.diaryEntries.delete(id);
      for (const imageId of old.imageIds) await collectUnusedMedia(this.db, imageId);
    });
  }
  private async normalize(input: DiaryInput, newMedia: MediaAsset[], storedMedia: StoredMediaAsset[]) {
    const title = requiredText(input.title, 'название записи'), description = optionalText(input.description);
    const observationDate = validateLocalDate(input.observationDate ?? localDate());
    const groupId = input.groupId ?? null;
    if (groupId !== null) { assertUuid(groupId); if (!await this.db.diaryGroups.get(groupId)) throw new Error('Группа удалена. Выберите другую группу или «Без группы».'); }
    if (!Array.isArray(input.imageIds) || input.imageIds.length < 1 || input.imageIds.length > 50 || new Set(input.imageIds).size !== input.imageIds.length) throw new Error('Запись должна содержать от одного до 50 разных изображений.');
    const imageIds = input.imageIds.map(value => requiredText(value, 'фотография', 160));
    if (new Set(imageIds).size !== imageIds.length || !Array.isArray(newMedia) || newMedia.length > 50) throw new Error('Повторяющиеся фотографии.');
    for (const asset of newMedia) {
      validateNewMedia(asset);
      if (!imageIds.includes(asset.id)) throw new Error('Добавленная фотография не используется в записи.');
      await this.db.media.add(storedMedia.find(value => value.id === asset.id)!);
    }
    for (const imageId of imageIds) if (!await this.db.media.get(imageId)) throw new Error('Фотография записи не найдена.');
    return { title, description, imageIds, observationDate, ...(groupId ? { groupId } : {}) };
  }
}
