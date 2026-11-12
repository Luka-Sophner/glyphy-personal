import { prepareMedia } from '../symbols/media';
import type { MediaAsset } from '../../types';
import { diaryMediaLimits, jpegOrientation, validateDiaryImageFile } from './media-policy';
import { imageDimensions } from '../transfer/image-header';

async function orientedThumbnail(file: File) {
  let bitmap: ImageBitmap | undefined, objectURL: string | undefined;
  try {
    let source: CanvasImageSource, width: number, height: number;
    if (typeof createImageBitmap === 'function') {
      try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* Native image decoder below is the browser fallback. */ }
    }
    if (bitmap) { source = bitmap; width = bitmap.width; height = bitmap.height; }
    else {
      const image = new Image(); objectURL = URL.createObjectURL(file); image.src = objectURL; await image.decode();
      source = image; width = image.naturalWidth; height = image.naturalHeight;
    }
    if (!width || !height || width * height > diaryMediaLimits.pixels) throw new Error('Разрешение фотографии превышает 80 мегапикселей.');
    const scale = Math.min(1, diaryMediaLimits.thumbnailEdge / Math.max(width, height)), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Не удалось подготовить миниатюру.');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const thumbnailBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось сохранить миниатюру.')), 'image/png'));
    return { width, height, thumbnailBlob };
  } finally { bitmap?.close(); if (objectURL) URL.revokeObjectURL(objectURL); }
}

export async function prepareDiaryMedia(file: File): Promise<MediaAsset> {
  const header = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
  const mimeType = validateDiaryImageFile(file, header);
  const dimensions = (() => { try { return imageDimensions(header, mimeType); } catch { return undefined; } })();
  if (dimensions && (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > diaryMediaLimits.pixels)) throw new Error('Разрешение фотографии превышает 80 мегапикселей.');
  // A typed File fixes missing/incorrect OS MIME labels without changing one byte.
  const original = new File([file], file.name || 'photo', { type: mimeType, lastModified: file.lastModified });
  try {
    const prepared = await prepareMedia(original);
    const needsThumbnail = !prepared.thumbnailBlob?.size || prepared.thumbnailBlob.type !== 'image/png';
    const oriented = needsThumbnail || !dimensions || mimeType === 'image/jpeg' && jpegOrientation(header) !== 1 ? await orientedThumbnail(original) : undefined;
    const result = { ...prepared, ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}), ...oriented, blob: original, mimeType };
    if (!result.width || !result.height || result.width * result.height > diaryMediaLimits.pixels || result.thumbnailBlob.type !== 'image/png' || !result.thumbnailBlob.size) throw new Error('Фотография не прошла проверку размеров или миниатюры.');
    return result;
  } catch (cause) {
    if (mimeType === 'image/heif') throw new Error('Приложение не смогло обработать HEIC/HEIF на этом устройстве. Преобразуйте фотографию в JPEG, PNG или WebP.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('Этот формат не удалось декодировать в приложении. Преобразуйте снимок в JPEG, PNG или WebP.');
    throw cause;
  }
}
