import { deflateSync } from 'node:zlib';
const crc32 = bytes => { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; };
function chunk(name, data) { const type = Buffer.from(name), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([type, data]))); return Buffer.concat([length, type, data, crc]); }
/** Lossless synthetic photo: single-pixel edge strokes and a small dot. */
export function diaryPng(width, height) {
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (width * 4 + 1) + 1 + x * 4, black = x === 1 || x === width - 2 || y === 1 || y === height - 2 || x === 7 && y === 13;
    rows[offset] = rows[offset + 1] = rows[offset + 2] = black ? 0 : 255; rows[offset + 3] = 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
export function exifOrientationSegment(orientation = 6, little = true) {
  const data = Buffer.alloc(32); data.write('Exif\0\0', 0, 'binary'); data.write(little ? 'II' : 'MM', 6);
  const u16 = (value, offset) => little ? data.writeUInt16LE(value, offset) : data.writeUInt16BE(value, offset);
  const u32 = (value, offset) => little ? data.writeUInt32LE(value, offset) : data.writeUInt32BE(value, offset);
  u16(42, 8); u32(8, 10); u16(1, 14); u16(274, 16); u16(3, 18); u32(1, 20); u16(orientation, 24);
  const size = Buffer.alloc(2); size.writeUInt16BE(data.length + 2);
  return Buffer.concat([Buffer.from([255,225]), size, data]);
}
