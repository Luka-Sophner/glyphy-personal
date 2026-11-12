import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { diaryPng, exifOrientationSegment } from './fixtures/diary-images.mjs';
const root = new URL('../', import.meta.url);
for (const file of ['db/database.ts', 'db/repository.ts', 'db/DiaryRepository.ts', 'db/GlyphRepository.ts', 'db/media-lifecycle.ts', 'db/model-validation.ts', 'types/index.ts', 'types/glyphs-diary.ts', 'lib/id.ts', 'lib/categories.ts', 'features/diary/editor.ts', 'features/diary/media-policy.ts']) {
  const destination = new URL(`.verification/diary-editor-tests/src/${file.replace(/\.ts$/, '.js')}`, root);
  await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
  await writeFile(destination, ts.transpileModule(await readFile(new URL(`src/${file}`, root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const compiled = file => new URL(`.verification/diary-editor-tests/src/${file}.js`, root).href;
const { GlyphyDatabase } = await import(compiled('db/database'));
const { DiaryRepository } = await import(compiled('db/DiaryRepository'));
const { SymbolRepository } = await import(compiled('db/repository'));
const { GlyphRepository } = await import(compiled('db/GlyphRepository'));
const { emptyGlyphCells } = await import(compiled('types/glyphs-diary'));
const { validateDiaryDraft, appendDiaryPhotos, replaceDiaryPhoto, removeDiaryPhoto, makeDiaryCover, pendingDiaryMedia, initialObservationDate, diarySaveError } = await import(compiled('features/diary/editor'));
const { diaryImageMime, validateDiaryImageFile, jpegOrientation, diaryMediaLimits } = await import(compiled('features/diary/media-policy'));
const asset = (id, width = 96, height = 192) => { const bytes = diaryPng(width, height); return { id, blob: new Blob([bytes], { type: 'image/png' }), thumbnailBlob: new Blob([bytes], { type: 'image/png' }), mimeType: 'image/png', width, height, createdAt: 1 }; };
async function setup(t) { const db = new GlyphyDatabase('glyphy-diary-editor-test-' + crypto.randomUUID()); await db.open(); t.after(async () => { db.close(); await Dexie.delete(db.name); }); return { db, diary: new DiaryRepository(db), symbols: new SymbolRepository(db), glyphs: new GlyphRepository(db) }; }

test('create one-image entry without description preserves title case and sets automatic dates', async t => {
  const { diary } = await setup(t), photo = asset('single'), input = { title: 'Солнечный Луч', description: '', imageIds: [photo.id], observationDate: initialObservationDate() };
  validateDiaryDraft(input); const saved = await diary.create(input, [photo]);
  assert.equal(saved.title, 'Солнечный Луч'); assert.equal(saved.description, ''); assert.equal(saved.observationDate, input.observationDate); assert.match(saved.id, /^[a-f0-9-]{36}$/); assert.equal(saved.createdAt, saved.updatedAt);
});
test('multiple portrait, landscape and panoramic originals persist byte for byte across restart', async t => {
  const { db, diary } = await setup(t), photos = [asset('portrait', 96, 192), asset('landscape', 192, 96), asset('panorama', 600, 80)];
  const saved = await diary.create({ title: 'Несколько снимков', imageIds: photos.map(photo => photo.id), description: '', observationDate: '2026-11-12' }, photos);
  db.close(); await db.open(); assert.deepEqual(await diary.get(saved.id), saved);
  for (const photo of photos) { const stored = await db.media.get(photo.id); assert.equal(stored.width, photo.width); assert.equal(stored.height, photo.height); assert.deepEqual(new Uint8Array(await stored.blob.arrayBuffer()), new Uint8Array(await photo.blob.arrayBuffer())); }
});
test('replacing one photo keeps every other photo and the entry creation/observation dates', async t => {
  const { db, diary } = await setup(t), originals = [asset('one'), asset('two'), asset('three')], saved = await diary.create({ title: 'Исходное', description: 'Первая строка\nВторая строка', imageIds: originals.map(photo => photo.id), observationDate: '2025-02-03' }, originals);
  const replacement = asset('replacement', 192, 96), ids = replaceDiaryPhoto(saved.imageIds, 'two', replacement);
  const updated = await diary.update(saved.id, { title: 'Новое название', imageIds: ids }, [replacement], { expectedUpdatedAt: saved.updatedAt });
  assert.deepEqual(updated.imageIds, ['one', 'replacement', 'three']); assert.equal(updated.createdAt, saved.createdAt); assert.equal(updated.observationDate, '2025-02-03'); assert.ok(updated.updatedAt > saved.updatedAt); assert.equal(updated.description, saved.description);
  assert.ok(await db.media.get('one')); assert.ok(await db.media.get('three')); assert.equal(await db.media.get('two'), undefined);
});
test('removing a selected photo and changing cover preserve the other IDs and only persist selected pending media', async t => {
  const { db, diary } = await setup(t), photos = [asset('one'), asset('two'), asset('removed')], pending = new Map(photos.map(photo => [photo.id, photo]));
  const ids = makeDiaryCover(removeDiaryPhoto(appendDiaryPhotos([], photos), 'removed'), 'two'); assert.deepEqual(ids, ['two', 'one']);
  const saved = await diary.create({ title: 'Обложка', imageIds: ids }, pendingDiaryMedia(ids, pending)); assert.deepEqual(saved.imageIds, ids); assert.equal(await db.media.count(), 2); assert.equal(await db.media.get('removed'), undefined);
});
test('failed media validation rolls back both photos and entry without overwriting the saved record', async t => {
  const { db, diary } = await setup(t), saved = await diary.create({ title: 'Сохранённое', imageIds: ['original'] }, [asset('original')]);
  await assert.rejects(diary.update(saved.id, { title: 'Не должно записаться', imageIds: ['new', 'bad'] }, [asset('new'), { ...asset('bad'), width: 0 }]), /медиа/);
  assert.deepEqual(await diary.get(saved.id), saved); assert.equal(await db.media.get('new'), undefined); assert.ok(await db.media.get('original'));
});
test('stale revision rejects a photo replacement before any new media is committed', async t => {
  const { db, diary } = await setup(t), saved = await diary.create({ title: 'Первое', imageIds: ['original'] }, [asset('original')]);
  const updated = await diary.update(saved.id, { title: 'Из другой вкладки' });
  await assert.rejects(diary.update(saved.id, { title: 'Устаревший черновик', imageIds: ['replacement'] }, [asset('replacement')], { expectedUpdatedAt: saved.updatedAt }));
  assert.deepEqual(await diary.get(saved.id), updated); assert.equal(await db.media.get('replacement'), undefined);
});
test('description can hold paragraphs; changing observation date does not change createdAt', async t => {
  const { diary } = await setup(t), description = 'Тонкие линии и маленькие точки.\n'.repeat(100), saved = await diary.create({ title: 'Наблюдение', description, imageIds: ['photo'], observationDate: '2026-01-01' }, [asset('photo')]);
  const updated = await diary.update(saved.id, { observationDate: '2025-12-31' }); assert.equal(updated.createdAt, saved.createdAt); assert.equal(updated.observationDate, '2025-12-31'); assert.equal(updated.description, description.trim());
});
test('diary deletion never deletes dictionary cards, glyphs or their shared original', async t => {
  const { db, diary, symbols, glyphs } = await setup(t), source = await symbols.save({ imageId: null, meanings: [{ id: 'meaning', category: 'phenomena', primary: 'Вода', secondary: [], isPrimaryCategory: true, order: 0 }], tags: [] }, asset('shared'));
  const cells = emptyGlyphCells().map(cell => cell.position === 'center' ? { ...cell, symbolId: source.id, meaningId: 'meaning', meaningSnapshot: 'Вода' } : cell), glyph = await glyphs.save({ primaryMeaning: 'Вода', cells });
  const saved = await diary.create({ title: 'Хайку', imageIds: ['shared'] }); await diary.delete(saved.id);
  assert.equal(await diary.get(saved.id), undefined); assert.ok(await symbols.get(source.id)); assert.ok(await glyphs.get(glyph.id)); assert.ok(await db.media.get('shared'));
});
test('client validation rejects missing title/photo/date but allows no description', () => {
  assert.throws(() => validateDiaryDraft({ title: ' ', imageIds: ['photo'], observationDate: '2026-11-12' }), /название/);
  assert.throws(() => validateDiaryDraft({ title: 'Название', imageIds: [], observationDate: '2026-11-12' }), /фотографию/);
  assert.throws(() => validateDiaryDraft({ title: 'Название', imageIds: ['photo'], observationDate: '2026-02-30' }));
  assert.doesNotThrow(() => validateDiaryDraft({ title: 'Название', imageIds: ['photo'], observationDate: '2026-11-12' }));
});
test('file sniffing validates actual raster signatures and rejects SVG/HTML, empty and oversized inputs', () => {
  const png = diaryPng(10, 20); assert.equal(diaryImageMime(png), 'image/png'); assert.equal(validateDiaryImageFile({ name: 'photo', type: '', size: png.length }, png), 'image/png');
  assert.equal(diaryImageMime(Buffer.from('GIF89a....')), 'image/gif'); assert.equal(diaryImageMime(Buffer.from('RIFF1234WEBPmore')), 'image/webp');
  assert.throws(() => validateDiaryImageFile({ name: 'unsafe.svg', type: 'image/svg+xml', size: 100 }, Buffer.from('<svg onload="alert(1)"/>')), /SVG/);
  assert.throws(() => validateDiaryImageFile({ name: 'fake.png', type: 'image/png', size: 100 }, Buffer.from('<html>payload</html>')), /не распознан/);
  assert.throws(() => validateDiaryImageFile({ name: 'empty.png', type: 'image/png', size: 0 }, png), /пустой/);
  assert.throws(() => validateDiaryImageFile({ name: 'huge.png', type: 'image/png', size: diaryMediaLimits.bytes + 1 }, png), /40 МБ/);
  assert.throws(() => validateDiaryImageFile({ name: 'photo.heic', type: 'image/heic', size: 100 }, new Uint8Array(64)), /Преобразуйте/);
});
test('EXIF orientation reads both byte orders and safely ignores malformed metadata', () => {
  for (const little of [true, false]) for (const orientation of [1, 2, 6, 8]) {
    const jpeg = Buffer.concat([Buffer.from([255,216]), exifOrientationSegment(orientation, little), Buffer.from([255,217])]); assert.equal(jpegOrientation(jpeg), orientation); assert.equal(jpegOrientation(jpeg.subarray(0, 12)), 1);
  }
  assert.equal(jpegOrientation(diaryPng(2, 2)), 1);
});
test('quota and generic save errors produce useful non-destructive editor feedback', () => {
  assert.match(diarySaveError({ name: 'QuotaExceededError' }), /Черновик остался/); assert.equal(diarySaveError(new Error('Повторите попытку')), 'Повторите попытку'); assert.match(diarySaveError(null), /остались в редакторе/);
});
