import type { MediaAsset } from '../../types';
import { createId } from '../../lib/id';

export async function prepareMedia(blob: Blob, trustedSvg = false): Promise<MediaAsset> {
  if (!blob.size || blob.size > 40 * 1024 * 1024) throw new Error('Выберите изображение размером до 40 МБ.');
  const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'];
  if (!supported.includes(blob.type) && !(trustedSvg && blob.type === 'image/svg+xml')) throw new Error('Этот формат не поддерживается. Выберите JPG, PNG, WebP, GIF, AVIF или BMP.');
  // Immediately detach Android's selected file from its content-provider handle.
  blob = new Blob([await blob.arrayBuffer()], { type: blob.type });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch { throw new Error('Не удалось прочитать изображение. Проверьте файл или выберите другое фото.'); }
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width * height > 80_000_000) throw new Error('Не удалось обработать размер фотографии.');
    const scale = Math.min(1, 768 / Math.max(width, height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Не удалось создать миниатюру.');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const thumbnailBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось создать миниатюру.')), 'image/png'));
    // Keep every original byte; only the separate, lossless PNG thumbnail is scaled.
    return { id: createId(), blob, mimeType: blob.type, width, height, thumbnailBlob, createdAt: Date.now() };
  } finally { URL.revokeObjectURL(url); }
}
