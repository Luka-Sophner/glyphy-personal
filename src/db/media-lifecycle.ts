import type { GlyphyDatabase } from './database.js';
import type { MediaAsset } from '../types/index.js';
export async function isMediaReferenced(db: GlyphyDatabase, id: string): Promise<boolean> {
  return await db.cards.where('imageId').equals(id).count() > 0 || await db.diaryEntries.where('imageIds').equals(id).count() > 0 || await db.glyphs.where('imageIds').equals(id).count() > 0 || await db.diaryGroups.filter(group => group.coverImageId === id).count() > 0;
}
// Caller must include cards, media, glyphs, diaryEntries and diaryGroups in its transaction scope.
export async function collectUnusedMedia(db: GlyphyDatabase, id: string) {
  if (!await isMediaReferenced(db, id)) await db.media.delete(id);
}
export function validateNewMedia(asset: MediaAsset) {
  if (!asset || typeof asset.id !== 'string' || !asset.id || asset.id.length > 160 || !(asset.blob instanceof Blob) || !(asset.thumbnailBlob instanceof Blob)
    || !asset.blob.size || !asset.thumbnailBlob.size || asset.blob.size > 40 * 1024 * 1024
    || !Number.isSafeInteger(asset.width) || !Number.isSafeInteger(asset.height) || asset.width <= 0 || asset.height <= 0 || asset.width * asset.height > 80_000_000
    || !Number.isFinite(asset.createdAt) || asset.createdAt < 0 || !asset.mimeType.startsWith('image/') || asset.blob.type !== asset.mimeType || asset.thumbnailBlob.type !== 'image/png') throw new Error('Некорректное медиа. Используйте существующую подготовку фотографий.');
}
