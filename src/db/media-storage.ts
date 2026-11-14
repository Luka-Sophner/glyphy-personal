import type { MediaAsset } from '../types/index.js';

/** IndexedDB stores bytes, never native Blob/File handles. Schema v5 remains unchanged. */
export interface StoredMediaAsset extends Omit<MediaAsset, 'blob' | 'thumbnailBlob'> {
  storageFormat: 'arraybuffer-v1';
  blob: ArrayBuffer;
  thumbnailBlob: ArrayBuffer;
}
export async function storeMedia(asset: MediaAsset): Promise<StoredMediaAsset> {
  // Native file IO must finish BEFORE opening the write transaction.
  const [original, thumbnail] = await Promise.all([asset.blob.arrayBuffer(), asset.thumbnailBlob.arrayBuffer()]);
  if (!original.byteLength || !thumbnail.byteLength) throw new Error('Не удалось прочитать фотографию. Выбери её ещё раз; заполненные поля остались в редакторе.');
  return { id: asset.id, mimeType: asset.mimeType, width: asset.width, height: asset.height,
    createdAt: asset.createdAt, storageFormat: 'arraybuffer-v1', blob: original, thumbnailBlob: thumbnail };
}
/** Decode on read only: no upgrade, clearing or rewriting of legacy photographs. */
export function readMedia(asset: MediaAsset | StoredMediaAsset): MediaAsset {
  if (!asset) return asset;
  if (asset.blob instanceof Blob && asset.thumbnailBlob instanceof Blob) return asset as MediaAsset;
  const asBlob = (value: Blob | ArrayBuffer, type: string) => {
    if (value instanceof Blob) return value;
    if (!(value instanceof ArrayBuffer)) throw new Error('Не удалось прочитать изображение. Не очищай данные приложения; сохрани резервную копию.');
    return new Blob([value], { type });
  };
  return { id: asset.id, mimeType: asset.mimeType, width: asset.width, height: asset.height, createdAt: asset.createdAt,
    blob: asBlob(asset.blob, asset.mimeType), thumbnailBlob: asBlob(asset.thumbnailBlob, 'image/png') };
}
