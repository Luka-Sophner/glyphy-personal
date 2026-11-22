import { saveNativeArchive } from '../native/adapter.mjs';
import type { MediaAsset } from '../../types';
async function decodedSize(blob: Blob) {
  if (typeof createImageBitmap === 'function' && blob.type !== 'image/svg+xml') {
    const bitmap = await createImageBitmap(blob);
    try { return { width: bitmap.width, height: bitmap.height }; }
    finally { bitmap.close(); }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}
export async function validateDecodedAsset(asset: MediaAsset) {
  const [original, thumbnail] = await Promise.all([decodedSize(asset.blob), decodedSize(asset.thumbnailBlob)]);
  if (!original.width || !original.height || original.width * original.height > 80_000_000) throw new Error('Недопустимое разрешение фотографии.');
  if (original.width !== asset.width || original.height !== asset.height) throw new Error('Разрешение фотографии не совпадает с данными архива.');
  if (!thumbnail.width || !thumbnail.height || thumbnail.width > 768 || thumbnail.height > 768) throw new Error('Миниатюра имеет недопустимый размер.');
}
export async function downloadArchive(bytes: Uint8Array, filename: string) {
  if (await saveNativeArchive(bytes, filename)) return;
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'application/zip' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  // Android's download manager may read the URL after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
