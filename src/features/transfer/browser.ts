import { saveNativeArchive } from '../native/adapter.mjs';
import type { MediaAsset } from '../../types';
import { prepareMedia } from '../symbols/media';
export async function validateDecodedAsset(asset: MediaAsset) {
  const original = await prepareMedia(asset.blob, asset.mimeType === 'image/svg+xml');
  if (original.width !== asset.width || original.height !== asset.height) throw new Error('Разрешение фотографии не совпадает с данными архива.');
  const thumbnail = await prepareMedia(asset.thumbnailBlob);
  if (thumbnail.width > 768 || thumbnail.height > 768) throw new Error('Миниатюра имеет недопустимый размер.');
}
export async function downloadArchive(bytes: Uint8Array, filename: string) {
  if (await saveNativeArchive(bytes, filename)) return;
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'application/zip' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  // Android's download manager may read the URL after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
