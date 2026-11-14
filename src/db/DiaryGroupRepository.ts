import type { GlyphyDatabase } from './database.js';
import type { DiaryGroup, DiaryGroupInput, UpdateOptions } from '../types/glyphs-diary.js';
import { createId } from '../lib/id.js';
import type { MediaAsset } from '../types/index.js';
import { collectUnusedMedia, validateNewMedia } from './media-lifecycle.js';
import { storeMedia } from './media-storage.js';
import { assertUuid, assertRevision, nextTimestamp, requiredText } from './model-validation.js';

export class DiaryGroupRepository {
  constructor(readonly db: GlyphyDatabase) {}
  async list() { return (await this.db.diaryGroups.toArray()).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)); }
  async save(input: DiaryGroupInput, id?: string, options: UpdateOptions = {}, newCover?: MediaAsset): Promise<DiaryGroup> {
    if (newCover) validateNewMedia(newCover);
    const storedCover = newCover ? await storeMedia(newCover) : undefined;
    return this.db.transaction('rw', [this.db.diaryGroups, this.db.diaryEntries, this.db.media, this.db.cards, this.db.glyphs], async () => {
      const old = id ? await this.db.diaryGroups.get(id) : undefined;
      if (id) { assertUuid(id); if (!old) throw new Error('Группа удалена.'); assertRevision(old.updatedAt, options.expectedUpdatedAt); }
      const title = requiredText(input.title, 'название группы'), coverEntryId = input.coverEntryId === undefined ? old?.coverEntryId ?? null : input.coverEntryId;
      if (coverEntryId) { const cover = await this.db.diaryEntries.get(coverEntryId); if (!old || !cover || cover.groupId !== old.id || !cover.imageIds.length) throw new Error('Выберите обложку из записей этой группы.'); }
      const groups = await this.list(), stamp = nextTimestamp(old?.updatedAt);
      const coverImageId = input.coverImageId === undefined ? old?.coverImageId ?? null : input.coverImageId;
      if (newCover) {
        validateNewMedia(newCover);
        if (newCover.id !== coverImageId) throw new Error('Изображение не соответствует обложке.');
        await this.db.media.add(storedCover!);
      }
      if (coverImageId && !await this.db.media.get(requiredText(coverImageId, 'Обложка', 160))) throw new Error('Изображение обложки не найдено.');
      const group: DiaryGroup = { id: old?.id ?? createId(), title, coverEntryId, order: old?.order ?? groups.reduce((max, group) => Math.max(max, group.order), -1) + 1, createdAt: old?.createdAt ?? stamp, updatedAt: stamp };
      group.coverImageId = coverImageId;
      await this.db.diaryGroups.put(group);
      if (old?.coverImageId && old.coverImageId !== coverImageId) await collectUnusedMedia(this.db, old.coverImageId);
      return group;
    });
  }
  async delete(id: string) {
    assertUuid(id);
    return this.db.transaction('rw', [this.db.diaryGroups, this.db.diaryEntries, this.db.media, this.db.cards, this.db.glyphs], async () => {
      const group = await this.db.diaryGroups.get(id);
      const entries = (await this.db.diaryEntries.where('groupId').equals(id).toArray()).map(entry => ({ ...entry, groupId: null, updatedAt: nextTimestamp(entry.updatedAt) }));
      await this.db.diaryEntries.bulkPut(entries);
      await this.db.diaryGroups.delete(id);
      if (group?.coverImageId) await collectUnusedMedia(this.db, group.coverImageId);
      return entries;
    });
  }
  async assignEntry(entryId: string, groupId: string | null) {
    assertUuid(entryId); if (groupId) assertUuid(groupId);
    return this.db.transaction('rw', this.db.diaryGroups, this.db.diaryEntries, async () => {
      if (groupId && !await this.db.diaryGroups.get(groupId)) throw new Error('Группа удалена.');
      const entry = await this.db.diaryEntries.get(entryId); if (!entry) throw new Error('Запись удалена.');
      if ((entry.groupId ?? null) === groupId) return entry;
      const updated = { ...entry, groupId, updatedAt: nextTimestamp(entry.updatedAt) }; await this.db.diaryEntries.put(updated); return updated;
    });
  }
  async setEntries(groupId: string, entryIds: string[]) {
    assertUuid(groupId);
    if (new Set(entryIds).size !== entryIds.length) throw new Error('Записи не должны повторяться.');
    return this.db.transaction('rw', this.db.diaryGroups, this.db.diaryEntries, async () => {
      const group = await this.db.diaryGroups.get(groupId); if (!group) throw new Error('Группа удалена.');
      const entries = await this.db.diaryEntries.toArray(), selected = new Set(entryIds), available = new Set(entries.map(entry => entry.id));
      if (entryIds.some(id => !available.has(id))) throw new Error('Список записей изменился. Повторите сохранение.');
      const changed = entries.flatMap(entry => {
        const next = selected.has(entry.id) ? groupId : entry.groupId === groupId ? null : entry.groupId ?? null;
        return next === (entry.groupId ?? null) ? [] : [{ ...entry, groupId: next, updatedAt: nextTimestamp(entry.updatedAt) }];
      });
      await this.db.diaryEntries.bulkPut(changed);
      const updatedGroup = { ...group, updatedAt: nextTimestamp(group.updatedAt) };
      await this.db.diaryGroups.put(updatedGroup);
      return { entries: changed, group: updatedGroup };
    });
  }
  async reorder(ids: string[]) {
    return this.db.transaction('rw', this.db.diaryGroups, async () => {
      const groups = await this.list(), wanted = new Set(ids);
      if (ids.length !== groups.length || wanted.size !== ids.length || groups.some(group => !wanted.has(group.id))) throw new Error('Список групп изменился. Повторите перестановку.');
      const byId = new Map(groups.map(group => [group.id, group]));
      const result = ids.map((id, order) => { const group = byId.get(id)!; return group.order === order ? group : { ...group, order, updatedAt: nextTimestamp(group.updatedAt) }; });
      await this.db.diaryGroups.bulkPut(result); return result;
    });
  }
}
