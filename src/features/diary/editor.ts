import type { DiaryEntry, DiaryInput } from '../../types/glyphs-diary.js';
import type { MediaAsset } from '../../types/index.js';
import { localDate, validateLocalDate } from '../../db/model-validation.js';

export function initialObservationDate(entry?: DiaryEntry) { return entry?.observationDate ?? localDate(); }
export function validateDiaryDraft(input: DiaryInput) {
  if (!input.title.trim()) throw new Error('Введите название записи.');
  if (input.title.trim().length > 200) throw new Error('Название не должно превышать 200 символов.');
  if ((input.description?.length ?? 0) > 20000) throw new Error('Описание не должно превышать 20 000 символов.');
  if (!input.imageIds.length) throw new Error('Добавьте хотя бы одну фотографию.');
  if (input.imageIds.length > 50 || new Set(input.imageIds).size !== input.imageIds.length) throw new Error('Допускается до 50 разных фотографий.');
  if (!input.observationDate) throw new Error('Укажите дату наблюдения.');
  validateLocalDate(input.observationDate);
}
export function appendDiaryPhotos(ids: string[], assets: MediaAsset[]): string[] {
  const result = [...ids, ...assets.map(asset => asset.id)];
  if (result.length > 50 || new Set(result).size !== result.length) throw new Error('Допускается до 50 разных фотографий.');
  return result;
}
export function replaceDiaryPhoto(ids: string[], previousId: string, asset: MediaAsset): string[] {
  if (!ids.includes(previousId)) throw new Error('Заменяемая фотография уже удалена.');
  const result = ids.map(id => id === previousId ? asset.id : id);
  if (new Set(result).size !== result.length) throw new Error('Эта фотография уже добавлена.');
  return result;
}
export function removeDiaryPhoto(ids: string[], id: string) { return ids.filter(value => value !== id); }
export function makeDiaryCover(ids: string[], id: string) { return ids.includes(id) ? [id, ...ids.filter(value => value !== id)] : ids; }
export function pendingDiaryMedia(ids: string[], pending: ReadonlyMap<string, MediaAsset>) {
  return ids.flatMap(id => pending.has(id) ? [pending.get(id)!] : []);
}
export function diarySaveError(cause: unknown) {
  const error = cause as { name?: string; message?: string; inner?: { name?: string } } | null;
  if (error?.name === 'QuotaExceededError' || error?.inner?.name === 'QuotaExceededError') return 'Недостаточно места на устройстве. Освободите место или уберите часть фотографий. Черновик остался в редакторе.';
  return error?.message || 'Не удалось сохранить запись. Данные и фотографии остались в редакторе.';
}
