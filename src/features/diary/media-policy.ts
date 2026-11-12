export const diaryMediaLimits = { bytes: 40 * 1024 * 1024, pixels: 80_000_000, thumbnailEdge: 768 } as const;
const text = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
export function diaryImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (['GIF87a', 'GIF89a'].includes(text(bytes, 0, 6))) return 'image/gif';
  if (bytes.length >= 14 && text(bytes, 0, 2) === 'BM') return 'image/bmp';
  if (text(bytes, 4, 8) === 'ftyp') {
    const brands = text(bytes, 8, Math.min(bytes.length, 64));
    if (/avif|avis/.test(brands)) return 'image/avif';
    if (/heic|heix|hevc|hevx|mif1|msf1/.test(brands)) return 'image/heif';
  }
  return null;
}
export function validateDiaryImageFile(file: { size: number; name: string; type: string }, header: Uint8Array): string {
  if (!file.size) throw new Error('Выбран пустой файл.');
  if (file.size > diaryMediaLimits.bytes) throw new Error('Одна фотография не должна превышать 40 МБ. Оригинал не будет автоматически сжат.');
  if (/svg/i.test(file.type) || /\.svgz?$/i.test(file.name)) throw new Error('SVG не принимается как фотография. Сохраните рисунок в PNG, JPEG или WebP.');
  const mime = diaryImageMime(header);
  if (!mime) {
    if (/hei[cf]/i.test(file.type + ' ' + file.name)) throw new Error('Приложение не смогло обработать HEIC/HEIF. Преобразуйте фотографию в JPEG, PNG или WebP.');
    throw new Error('Формат изображения не распознан. Используйте JPEG, PNG или WebP.');
  }
  return mime;
}
/** Safe TIFF orientation lookup inside JPEG APP1; no metadata is changed. */
export function jpegOrientation(bytes: Uint8Array): number {
  if (diaryImageMime(bytes) !== 'image/jpeg') return 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 255) return 1;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++]; if (marker === 217 || marker === 218) break;
    if (marker === 1 || marker >= 208 && marker <= 215) continue;
    if (offset + 2 > bytes.length) break;
    const size = bytes[offset] * 256 + bytes[offset + 1], end = offset + size;
    if (size < 2 || end > bytes.length) break;
    if (marker === 225 && text(bytes, offset + 2, offset + 8) === 'Exif\0\0') {
      const base = offset + 8, little = text(bytes, base, base + 2) === 'II';
      if (!little && text(bytes, base, base + 2) !== 'MM') return 1;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (base + 8 > end || view.getUint16(base + 2, little) !== 42) return 1;
      const directory = base + view.getUint32(base + 4, little);
      if (directory < base || directory + 2 > end) return 1;
      const count = view.getUint16(directory, little);
      for (let index = 0; index < count; index++) {
        const item = directory + 2 + index * 12; if (item + 12 > end) return 1;
        if (view.getUint16(item, little) === 274 && view.getUint16(item + 2, little) === 3 && view.getUint32(item + 4, little) === 1) {
          const orientation = view.getUint16(item + 8, little); return orientation >= 1 && orientation <= 8 ? orientation : 1;
        }
      }
    }
    offset = end;
  }
  return 1;
}
