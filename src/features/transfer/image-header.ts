// Probe raster headers before browser decoding, so forged dimensions cannot force
// an unbounded bitmap allocation. Full decoding is still required in the UI.
export function imageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, count: number) => String.fromCharCode(...bytes.subarray(start, start + count));
  const dimensions = (width: number, height: number) => {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > 80_000_000) throw new Error('Разрешение изображения превышает допустимое.');
    return { width, height };
  };
  if (mime === 'image/png' && bytes.length >= 24) return dimensions(view.getUint32(16), view.getUint32(20));
  if (mime === 'image/gif' && bytes.length >= 10) return dimensions(view.getUint16(6, true), view.getUint16(8, true));
  if (mime === 'image/bmp' && bytes.length >= 26) {
    return view.getUint32(14, true) === 12 ? dimensions(view.getUint16(18, true), view.getUint16(20, true)) : dimensions(Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true)));
  }
  if (mime === 'image/webp' && bytes.length >= 30) {
    const kind = ascii(12, 4), uint24 = (offset: number) => bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
    if (kind === 'VP8X') return dimensions(uint24(24) + 1, uint24(27) + 1);
    if (kind === 'VP8 ' && ascii(23, 3) === '\x9d\x01\x2a') return dimensions(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    if (kind === 'VP8L' && bytes[20] === 47) return dimensions(1 + ((bytes[22] & 63) << 8 | bytes[21]), 1 + ((bytes[24] & 15) << 10 | bytes[23] << 2 | bytes[22] >> 6));
  }
  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker) && length >= 7) return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      offset += length;
    }
  }
  if (mime === 'image/avif') {
    let found: { width: number; height: number } | undefined;
    for (let offset = 4; offset + 16 <= bytes.length; offset++) {
      if (ascii(offset, 4) === 'ispe' && view.getUint32(offset - 4) >= 20) {
        const current = dimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
        if (!found || current.width * current.height > found.width * found.height) found = current;
      }
    }
    if (found) return found;
  }
  if (mime === 'image/svg+xml') return undefined; // Only exact built-in SVGs pass the separate allowlist.
  throw new Error('Не удалось проверить заголовок изображения.');
}
