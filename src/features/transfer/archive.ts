import { cleanModules, moduleMediaIds, type ArchiveModules } from './modules.js';
import { jpegOrientation } from '../diary/media-policy.js';
import JSZip from 'jszip/dist/jszip.min.js';
import { imageDimensions } from './image-header.js';
import Dexie from 'dexie';
import { storeMedia } from '../../db/media-storage.js';
import { GlyphyDatabase, type StoredSymbolCard } from '../../db/database.js';
import type { MediaAsset, SymbolCard, CategoryMeaning } from '../../types/index.js';
import { categories } from '../../lib/categories.js';
import { knownDemoSvg } from './known-demo-svg.js';
import { crc32, inspectZip, transferLimits, type ZipEntryInfo } from './zip-safety.js';

export interface ArchiveMedia { id: string; path: string; thumbnailPath: string; mimeType: string; width: number; height: number; createdAt: number }
export interface ArchiveManifest { app: 'glyphy'; formatVersion: 1 | 2; schemaVersion: 2 | 5; exportedAt: string; cardCount: number; media: ArchiveMedia[] }
export interface PreparedArchive { manifest: ArchiveManifest; cards: SymbolCard[]; media: MediaAsset[]; modules?: ArchiveModules }
export type ImportMode = 'merge' | 'replace';
export type Progress = (message: string) => void;
export type ImageValidator = (asset: MediaAsset) => Promise<void>;
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg' };
const fail = (message = 'Архив содержит некорректные данные.'): never => { throw new Error(message); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const string = (value: unknown, max = 1000) => typeof value === 'string' && value.length <= max ? value : fail();
const id = (value: unknown) => { const text = string(value, 160); return /^[A-Za-z0-9_-]{1,160}$/.test(text) ? text : fail('Недопустимый идентификатор.'); };
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : fail();
const array = (value: unknown, max: number): unknown[] => Array.isArray(value) && value.length <= max ? value : fail();
const timestamp = (value: unknown) => integer(value, 8_640_000_000_000_000);
const blob = (bytes: Uint8Array, type: string) => new Blob([new Uint8Array(bytes).buffer], { type });
function cleanCard(value: unknown): SymbolCard {
  const input = object(value), groups = array(input.meanings, 50);
  if (!groups.length) return fail('В карточке отсутствуют значения.');
  const groupIds = new Set<string>();
  const meanings: CategoryMeaning[] = groups.map((value, index) => {
    const group = object(value), category = categories.find(c => c.id === group.category)?.id;
    const groupId = id(group.id), primary = string(group.primary, 200);
    if (!category || !primary.trim() || typeof group.isPrimaryCategory !== 'boolean' || integer(group.order, 49) !== index || groupIds.has(groupId)) return fail('Некорректная группа значений.');
    groupIds.add(groupId);
    return { id: groupId, category, primary, secondary: array(group.secondary, 100).map(value => string(value)), isPrimaryCategory: group.isPrimaryCategory, order: index };
  });
  if (meanings.filter(group => group.isPrimaryCategory).length !== 1) return fail('В карточке должна быть одна основная категория.');
  const createdAt = timestamp(input.createdAt), updatedAt = timestamp(input.updatedAt);
  if (updatedAt < createdAt) return fail();
  return { id: id(input.id), imageId: input.imageId === null ? null : id(input.imageId), meanings, tags: array(input.tags, 200).map(value => string(value, 200)), createdAt, updatedAt };
}
function cleanManifest(value: unknown): ArchiveManifest {
  const input = object(value);
  if (input.app !== 'glyphy' || !((input.formatVersion === 1 && input.schemaVersion === 2) || (input.formatVersion === 2 && input.schemaVersion === 5))) return fail('Версия формата архива не поддерживается. Нужен Glyphy ZIP формата 1, схема 2.');
  const exportedAt = string(input.exportedAt, 40);
  if (!Number.isFinite(Date.parse(exportedAt))) return fail('Неверная дата экспорта.');
  const ids = new Set<string>(), paths = new Set<string>();
  const media = array(input.media, 4000).map(value => {
    const entry = object(value), assetId = id(entry.id), mimeType = string(entry.mimeType, 40), extension = extensions[mimeType];
    const path = string(entry.path, 220), thumbnailPath = string(entry.thumbnailPath, 220);
    if (!extension || path !== `media/${assetId}.${extension}` || thumbnailPath !== `media/${assetId}.thumb.png` || ids.has(assetId) || paths.has(path) || paths.has(thumbnailPath)) return fail('Некорректные ссылки на фотографии.');
    ids.add(assetId); paths.add(path); paths.add(thumbnailPath);
    const width = integer(entry.width, 100_000), height = integer(entry.height, 100_000);
    if (!width || !height || width * height > 80_000_000) return fail('Недопустимое разрешение фотографии.');
    return { id: assetId, path, thumbnailPath, mimeType, width, height, createdAt: timestamp(entry.createdAt) };
  });
  return { app: 'glyphy', formatVersion: input.formatVersion as 1 | 2, schemaVersion: input.schemaVersion as 2 | 5, exportedAt, cardCount: integer(input.cardCount, transferLimits.cards), media };
}
function verifyImage(bytes: Uint8Array, mime: string) {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
  const png = bytes.length >= 24 && ascii(1, 3) === 'PNG' && bytes[0] === 137 && ascii(12, 4) === 'IHDR';
  const valid = mime === 'image/png' ? png : mime === 'image/jpeg' ? bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === 'image/webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP'
    : mime === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
    : mime === 'image/bmp' ? bytes.length > 26 && ascii(0, 2) === 'BM'
    : mime === 'image/avif' ? ascii(4, 4) === 'ftyp' && /avif|avis/.test(ascii(8, 24))
    : mime === 'image/svg+xml' ? knownDemoSvg.some(svg => {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trimEnd();
      // Vite's inline SVG encoder changes double attribute quotes to single quotes.
      return text === svg || text === svg.replaceAll('"', "'");
    }) : false;
  if (!valid) return fail('Содержимое изображения не соответствует разрешённому типу. Произвольные SVG не импортируются.');
}
export async function readEntry(zip: JSZip, info: ZipEntryInfo): Promise<Uint8Array> {
  const entry = zip.file(info.name);
  if (!entry || entry.unsafeOriginalName && entry.unsafeOriginalName !== info.name) return fail('Недопустимый путь в ZIP.');
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []; let size = 0, crc = 0, stopped = false;
    interface ReadStream {
      on(event: 'data', callback: (chunk: Uint8Array) => void): ReadStream;
      on(event: 'error', callback: (error: unknown) => void): ReadStream;
      on(event: 'end', callback: () => void): ReadStream;
      pause(): ReadStream; resume(): ReadStream;
    }
    const stream = (entry as typeof entry & { internalStream(type: 'uint8array'): ReadStream }).internalStream('uint8array');
    const stop = (error: unknown) => { if (!stopped) { stopped = true; stream.pause(); reject(error); } };
    stream.on('data', (chunk: Uint8Array) => {
      if (stopped) return;
      size += chunk.length;
      if (size > info.size) return stop(new Error('Размер распакованных данных превышает заявленный.'));
      crc = crc32(chunk, crc); chunks.push(chunk);
    }).on('error', stop).on('end', () => {
      if (stopped) return;
      if (size !== info.size || crc !== info.crc) return stop(new Error('Проверка целостности ZIP не пройдена.'));
      const result = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      resolve(result);
    }).resume();
  });
}
export async function prepareImport(bytes: Uint8Array, validateImage?: ImageValidator, progress: Progress = () => {}): Promise<PreparedArchive> {
  progress('Проверка структуры архива…');
  const infos = inspectZip(bytes), info = new Map(infos.map(entry => [entry.name, entry]));
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const read = (name: string) => { const entry = info.get(name); if (!entry || entry.directory) return fail('В архиве отсутствует обязательный файл.'); return readEntry(zip, entry); };
  let manifest: ArchiveManifest, rawCards: unknown;
  try { manifest = cleanManifest(JSON.parse(decoder.decode(await read('manifest.json')))); rawCards = JSON.parse(decoder.decode(await read('data/cards.json'))); }
  catch (cause) { throw new Error(cause instanceof Error ? cause.message : 'Некорректный JSON.'); }
  const cards = array(rawCards, transferLimits.cards).map(cleanCard), ids = new Set(cards.map(card => card.id));
  if (ids.size !== cards.length || manifest.cardCount !== cards.length) return fail('Повторяющиеся карточки или неверное количество записей.');
  const modules = manifest.formatVersion === 2 ? cleanModules(JSON.parse(decoder.decode(await read('data/modules.json')))) : undefined;
  const allowed = new Set([...(modules ? ['data/modules.json'] : []), 'manifest.json', 'data/cards.json', 'media/', 'data/', ...manifest.media.flatMap(asset => [asset.path, asset.thumbnailPath])]);
  if (infos.some(entry => !allowed.has(entry.name))) return fail('В архиве есть посторонние файлы.');
  const mediaIds = new Set(manifest.media.map(asset => asset.id));
  if (cards.some(card => card.imageId && !mediaIds.has(card.imageId))) return fail('Фотография, указанная в карточке, отсутствует.');
  if (modules && moduleMediaIds(modules).some(id => !mediaIds.has(id))) return fail('В архиве отсутствуют фотографии глифов или дневника.');
  const media: MediaAsset[] = [];
  for (const [index, asset] of manifest.media.entries()) {
    progress(`Проверка фотографий: ${index + 1} из ${manifest.media.length}`);
    const original = await read(asset.path), thumbnail = await read(asset.thumbnailPath);
    verifyImage(original, asset.mimeType); verifyImage(thumbnail, 'image/png');
    const rawSize = imageDimensions(original, asset.mimeType), thumbSize = imageDimensions(thumbnail, 'image/png');
    const originalSize = rawSize && asset.mimeType === 'image/jpeg' && jpegOrientation(original) >= 5 ? { width: rawSize.height, height: rawSize.width } : rawSize;
    if (originalSize && (originalSize.width !== asset.width || originalSize.height !== asset.height) || thumbSize && (thumbSize.width > 768 || thumbSize.height > 768)) return fail('Разрешение изображения не совпадает с архивом.');
    const item = { id: asset.id, blob: blob(original, asset.mimeType), mimeType: asset.mimeType, width: asset.width, height: asset.height, thumbnailBlob: blob(thumbnail, 'image/png'), createdAt: asset.createdAt };
    if (validateImage) await validateImage(item);
    media.push(item);
  }
  return { manifest, cards, media, ...(modules ? { modules } : {}) };
}
export async function exportArchive(db: GlyphyDatabase, progress: Progress = () => {}) {
  progress('Подготовка резервной копии…');
  const snapshot = await db.transaction('r', [db.cards, db.media, db.glyphs, db.diaryEntries, db.diaryGroups], async () => ({ cards: await db.cards.toArray(), media: await db.media.toArray(), glyphs: await db.glyphs.toArray(), diaryEntries: await db.diaryEntries.toArray(), diaryGroups: await db.diaryGroups.toArray() }));
  const modules = cleanModules(snapshot), full = !!(modules.glyphs.length || modules.diaryEntries.length || modules.diaryGroups.length);
  const cards = snapshot.cards.map(cleanCard), used = new Set([...cards.map(card => card.imageId).filter(Boolean), ...moduleMediaIds(modules)]);
  const media = snapshot.media.filter(asset => used.has(asset.id));
  if (cards.length > transferLimits.cards || media.length > 4000 || media.reduce((sum, asset) => sum + asset.blob.size + asset.thumbnailBlob.size, 0) > transferLimits.expandedBytes - transferLimits.jsonBytes * 2) return fail('Словарь слишком велик для одного архива (лимит 128 МБ).');
  const metadata: ArchiveMedia[] = media.map(asset => ({ id: id(asset.id), path: `media/${asset.id}.${extensions[asset.mimeType] ?? 'unsupported'}`, thumbnailPath: `media/${asset.id}.thumb.png`, mimeType: asset.mimeType, width: asset.width, height: asset.height, createdAt: asset.createdAt }));
  const manifest = cleanManifest({ app: 'glyphy', formatVersion: full ? 2 : 1, schemaVersion: full ? 5 : 2, exportedAt: new Date().toISOString(), cardCount: cards.length, media: metadata });
  if ([...used].some(assetId => !media.some(asset => asset.id === assetId))) return fail('В базе отсутствует связанная фотография; экспорт отменён.');
  const zip = new JSZip(); zip.folder('media');
  zip.file('manifest.json', JSON.stringify(manifest, null, 2), { compression: 'DEFLATE' });
  const json = JSON.stringify(cards);
  if (new TextEncoder().encode(json).length > transferLimits.jsonBytes) return fail('Слишком большой список карточек.');
  zip.file('data/cards.json', json, { compression: 'DEFLATE' });
  if (full) {
    const data = JSON.stringify(modules);
    if (new TextEncoder().encode(data).length > transferLimits.jsonBytes) return fail('Слишком много записей в резервной копии.');
    zip.file('data/modules.json', data, { compression: 'DEFLATE' });
  }
  for (const [index, asset] of media.entries()) {
    progress(`Подготовка фотографий: ${index + 1} из ${media.length}`);
    if (asset.blob.size > transferLimits.imageBytes || asset.thumbnailBlob.size > transferLimits.imageBytes) return fail('Фотография превышает лимит 40 МБ.');
    zip.file(metadata[index].path, new Uint8Array(await asset.blob.arrayBuffer()));
    zip.file(metadata[index].thumbnailPath, new Uint8Array(await asset.thumbnailBlob.arrayBuffer()));
  }
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE', platform: 'DOS' }, info => progress(`Создание ZIP: ${Math.round(info.percent)}%`));
  inspectZip(bytes); // Exports obey the same resource limits and format constraints.
  return { bytes, filename: `glyphy-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`, manifest };
}
async function sameMedia(a: MediaAsset, b: MediaAsset) {
  if (a.mimeType !== b.mimeType || a.width !== b.width || a.height !== b.height || a.blob.size !== b.blob.size || a.thumbnailBlob.size !== b.thumbnailBlob.size) return false;
  const compare = async (x: Blob, y: Blob) => {
    const left = new Uint8Array(await x.arrayBuffer()), right = new Uint8Array(await y.arrayBuffer());
    return left.length === right.length && left.every((byte, i) => byte === right[i]);
  };
  return await compare(a.blob, b.blob) && await compare(a.thumbnailBlob, b.thumbnailBlob);
}
export async function applyImport(db: GlyphyDatabase, prepared: PreparedArchive, mode: ImportMode, replaceConfirmed = false) {
  if (!['merge', 'replace'].includes(mode) || mode === 'replace' && !replaceConfirmed) return fail('Полная замена требует подтверждения.');
  const storedMedia = new Map(await Promise.all(prepared.media.map(async asset => [asset.id, await storeMedia(asset)] as const)));
  return db.transaction('rw', [db.cards, db.media, db.meta, db.diaryEntries, db.glyphs, db.diaryGroups], async () => {
    if (mode === 'replace') {
      await db.cards.clear();
      if (prepared.modules) { await db.glyphs.clear(); await db.diaryEntries.clear(); await db.diaryGroups.clear(); }
      // Legacy ZIP v1 still replaces only the dictionary.
      if (prepared.modules) await db.media.clear();
      else {
        const retained = new Set(moduleMediaIds({
          glyphs: await db.glyphs.toArray(), diaryEntries: await db.diaryEntries.toArray(), diaryGroups: await db.diaryGroups.toArray(),
        }));
        const ids = await db.media.toCollection().primaryKeys();
        await db.media.bulkDelete(ids.filter(id => !retained.has(id)));
      }
    }
    const existing = new Set((await db.cards.toCollection().primaryKeys()).map(String));
    const cards = prepared.cards.filter(card => !existing.has(card.id));
    const modules: ArchiveModules = { glyphs: [], diaryEntries: [], diaryGroups: [] };
    if (prepared.modules) {
      const existingGlyphs = new Set(await db.glyphs.toCollection().primaryKeys()), existingEntries = new Set(await db.diaryEntries.toCollection().primaryKeys()), existingGroups = new Set(await db.diaryGroups.toCollection().primaryKeys());
      modules.glyphs = prepared.modules.glyphs.filter(g => !existingGlyphs.has(g.id));
      modules.diaryEntries = prepared.modules.diaryEntries.filter(e => !existingEntries.has(e.id));
      modules.diaryGroups = prepared.modules.diaryGroups.filter(g => !existingGroups.has(g.id));
    }
    const needed = new Set([...cards.map(card => card.imageId).filter(Boolean), ...moduleMediaIds(modules)]), mapping = new Map<string, string>();
    const incoming = prepared.media.filter(asset => needed.has(asset.id));
    const oldMedia = await db.media.bulkGet(incoming.map(asset => asset.id));
    const additions: import('../../db/media-storage.js').StoredMediaAsset[] = [];
    for (const [index, asset] of incoming.entries()) {
      let candidate = asset.id, previous = oldMedia[index], attempt = 0;
      while (previous && !await Dexie.waitFor(sameMedia(previous, asset))) {
        const hash = crc32(new Uint8Array(await Dexie.waitFor(asset.blob.arrayBuffer()))).toString(16);
        candidate = `import-${asset.id.slice(0, 120)}-${hash}-${++attempt}`;
        previous = await db.media.get(candidate);
      }
      if (!previous) additions.push({ ...storedMedia.get(asset.id)!, id: candidate });
      mapping.set(asset.id, candidate);
    }
    await db.media.bulkAdd(additions);
    const stored: StoredSymbolCard[] = cards.map(card => ({ ...card, imageId: card.imageId ? mapping.get(card.imageId) ?? fail('Не удалось восстановить фотографию.') : null, categories: [...new Set(card.meanings.map(group => group.category))] }));
    await db.cards.bulkAdd(stored);
    const image = (id: string) => mapping.get(id) ?? fail('Не удалось восстановить изображение.');
    const mapCells = (cells: ArchiveModules['glyphs'][number]['cells']) => cells.map(cell => ({ ...cell, imageIdSnapshot: cell.imageIdSnapshot ? image(cell.imageIdSnapshot) : null }));
    await db.glyphs.bulkAdd(modules.glyphs.map(glyph => ({ ...glyph, cells: mapCells(glyph.cells), additionalGlyphs: glyph.additionalGlyphs?.map(part => ({ ...part, cells: mapCells(part.cells) })), imageIds: glyph.imageIds.map(image) })));
    await db.diaryGroups.bulkAdd(modules.diaryGroups.map(group => ({ ...group, coverImageId: group.coverImageId ? image(group.coverImageId) : null })));
    await db.diaryEntries.bulkAdd(modules.diaryEntries.map(entry => ({ ...entry, imageIds: entry.imageIds.map(image) })));
    await db.meta.put({ key: 'demo-initialized', value: true });
    await db.meta.put({ key: 'last-import', value: { date: new Date().toISOString(), mode, added: cards.length } });
    return { added: cards.length, skipped: prepared.cards.length - cards.length, ...(prepared.modules ? { glyphsAdded: modules.glyphs.length, entriesAdded: modules.diaryEntries.length, groupsAdded: modules.diaryGroups.length } : {}) };
  });
}



