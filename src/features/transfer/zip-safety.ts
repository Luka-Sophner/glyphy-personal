export const transferLimits = {
  archiveBytes: 128 * 1024 * 1024,
  expandedBytes: 128 * 1024 * 1024,
  imageBytes: 40 * 1024 * 1024,
  jsonBytes: 8 * 1024 * 1024,
  entries: 10_000,
  cards: 10_000,
} as const;
const table = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes: Uint8Array, seed = 0) {
  let value = seed ^ -1;
  for (const byte of bytes) value = table[(value ^ byte) & 255] ^ value >>> 8;
  return (value ^ -1) >>> 0;
}
export interface ZipEntryInfo { name: string; size: number; compressedSize: number; crc: number; directory: boolean }
const allowedPath = /^(manifest\.json|data\/|media\/|data\/(?:cards|modules)\.json|media\/[A-Za-z0-9_-]{1,180}(?:\.thumb)?\.(?:jpg|png|webp|gif|avif|bmp|svg))$/;
const bad = () => { throw new Error('Некорректная или неподдерживаемая структура ZIP.'); };
// Read the central directory BEFORE decompression. Reject ambiguous names and ZIP64.
export function inspectZip(bytes: Uint8Array): ZipEntryInfo[] {
  if (bytes.length < 22 || bytes.length > transferLimits.archiveBytes) throw new Error('Архив должен быть ZIP размером до 128 МБ.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) { end = offset; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) return bad();
  const count = view.getUint16(end + 10, true), length = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (count > transferLimits.entries || count === 65535 || view.getUint16(end + 8, true) !== count || start + length !== end) return bad();
  const result: ZipEntryInfo[] = [], names = new Set<string>(), ranges: { start: number; end: number }[] = [];
  let offset = start, total = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) return bad();
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true), directory = nameLength > 0 && bytes[offset + 46 + nameLength - 1] === 47;
    if (offset + 46 + nameLength + extraLength + commentLength > end || local + 30 > start || flags & ~0x808 || ![0, 8].includes(method)) return bad();
    let name: string;
    try { name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)); } catch { return bad(); }
    if (!allowedPath.test(name) || names.has(name) || name.includes('..') || name.includes('\\')) return bad();
    const unixMode = view.getUint32(offset + 38, true) >>> 16;
    if ((unixMode & 0xf000) === 0xa000 || view.getUint16(offset + 34, true)) return bad();
    if (view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method) return bad();
    const localNameLength = view.getUint16(local + 26, true), localExtraLength = view.getUint16(local + 28, true);
    const localEnd = local + 30 + localNameLength + localExtraLength + compressedSize;
    if (localEnd > start || ranges.some(range => local < range.end && localEnd > range.start)) return bad();
    ranges.push({ start: local, end: localEnd });
    if (decoder.decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name) return bad();
    const limit = name.endsWith('.json') ? transferLimits.jsonBytes : transferLimits.imageBytes;
    total += size;
    if (size > limit || total > transferLimits.expandedBytes || compressedSize > bytes.length || directory && size) throw new Error('Превышены допустимые размеры содержимого архива.');
    names.add(name); result.push({ name, size, compressedSize, crc: view.getUint32(offset + 16, true), directory });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== end || !names.has('manifest.json') || !names.has('data/cards.json')) return bad();
  return result;
}
