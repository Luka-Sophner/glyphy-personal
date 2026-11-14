import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = new URL('../', import.meta.url);
for (const file of ['db/media-storage.ts', 'db/storage-errors.ts', 'db/database.ts', 'db/repository.ts', 'db/DiaryRepository.ts', 'db/media-lifecycle.ts', 'db/model-validation.ts', 'types/index.ts', 'types/glyphs-diary.ts', 'lib/id.ts', 'lib/categories.ts', 'features/diary/presentation.ts', 'features/diary/routes.ts', 'features/symbols/search.ts']) {
  const destination = new URL(`.verification/diary-gallery-tests/src/${file.replace(/\.ts$/, '.js')}`, root);
  await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
  await writeFile(destination, ts.transpileModule(await readFile(new URL(`src/${file}`, root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const compiled = file => new URL(`.verification/diary-gallery-tests/src/${file}.js`, root).href;
const { GlyphyDatabase } = await import(compiled('db/database'));
const { DiaryRepository } = await import(compiled('db/DiaryRepository'));
const { SymbolRepository } = await import(compiled('db/repository'));
const { diaryDate, formatDiaryDate, sortDiaryEntries, createDiarySearchIndex } = await import(compiled('features/diary/presentation'));
const { diaryPath, diaryPhotoPath, getDiaryRoute } = await import(compiled('features/diary/routes'));
const entry = (id, observationDate, title = id, description = '') => ({ id, title, description, imageIds: ['photo'], observationDate, createdAt: '2026-11-12T12:00:00.000Z', updatedAt: '2026-11-12T12:00:00.000Z' });
const png = await readFile(new URL('public/icons/icon-192.png', root));
const photo = id => ({ id, blob: new Blob([png], { type: 'image/png' }), thumbnailBlob: new Blob([png], { type: 'image/png' }), mimeType: 'image/png', width: 192, height: 192, createdAt: 1 });
async function setup(t) {
  const db = new GlyphyDatabase('glyphy-diary-gallery-test-' + crypto.randomUUID()); await db.open();
  t.after(async () => { db.close(); await Dexie.delete(db.name); });
  return { db, diary: new DiaryRepository(db), symbols: new SymbolRepository(db) };
}
test('calendar date formats DD/MM/YYYY without an implicit UTC conversion', () => {
  assert.equal(formatDiaryDate('2026-11-12'), '12/11/2026'); assert.equal(formatDiaryDate('2024-02-29'), '29/02/2024'); assert.equal(formatDiaryDate(''), '');
  assert.equal(diaryDate(entry('one', '2026-01-01')), '2026-01-01');
});
test('legacy creation time fallback uses the device local calendar', () => {
  const local = new Date(2026, 10, 12, 13, 0, 0).toISOString();
  assert.equal(diaryDate({ observationDate: '', createdAt: local }), '2026-11-12');
  assert.equal(diaryDate({ observationDate: '', createdAt: 'invalid' }), '');
});
test('chronology is observation date then creation time; later edits never move old observations to the top', () => {
  const old = { ...entry('old', '2025-03-01'), updatedAt: '2099-01-01T00:00:00.000Z' }, newer = entry('new', '2026-03-01');
  assert.deepEqual(sortDiaryEntries([old, newer]).map(row => row.id), ['new', 'old']);
  const first = entry('first', '2026-03-01'), second = { ...entry('second', '2026-03-01'), createdAt: '2026-11-12T13:00:00.000Z' };
  assert.deepEqual(sortDiaryEntries([first, second]).map(row => row.id), ['second', 'first']);
});
test('equal dates use stable ID ordering and duplicate inputs cannot duplicate an entry', () => {
  assert.deepEqual(sortDiaryEntries([entry('b', '2026-11-12'), entry('a', '2026-11-12'), entry('b', '2026-11-12')]).map(row => row.id), ['a', 'b']);
});
test('diary search finds title, description and local or ISO dates, with Cyrillic normalization', () => {
  const first = entry('first', '2026-11-12', 'Солнечный луч', 'Лёд на воде'), second = entry('second', '2026-11-11', 'Туман', 'Тихое утро');
  const search = createDiarySearchIndex([second, first]);
  for (const query of ['  СОЛНЕЧНЫЙ   ЛУЧ ', 'лед', 'на воде', '12/11/2026', '2026-11-12']) assert.deepEqual(search(query).map(row => row.id), ['first']);
  assert.equal(search('несуществующее').length, 0); assert.deepEqual(search('').map(row => row.id), ['first', 'second']);
});
test('title and description matches return one original entry', () => {
  const item = entry('one', '2026-11-12', 'Утро', 'Утро на реке'), search = createDiarySearchIndex([item]);
  assert.equal(search('утро').length, 1); assert.equal(search('утро')[0], item);
});
test('modal routes encode permanent IDs and validate photo indices without accepting invalid nested paths', () => {
  assert.deepEqual(getDiaryRoute(diaryPath('слово')), { entryId: 'слово', editor: false });
  assert.deepEqual(getDiaryRoute('/diary/new/edit'), { entryId: 'new', editor: true });
  assert.deepEqual(getDiaryRoute(diaryPhotoPath('one', 2)), { entryId: 'one', editor: false, photoIndex: 2 });
  for (const path of ['/diary', '/diary/one/photos/-1', '/diary/one/photos/50', '/diary/%ZZ', '/diary/%2F', '/glyphs/one', '/diary/one/unknown']) assert.equal(getDiaryRoute(path), null);
});
test('gallery snapshot reads ordered photos referenced by diary entries, excluding unrelated dictionary originals', async t => {
  const { diary, symbols } = await setup(t);
  await symbols.save({ imageId: null, meanings: [{ id: 'meaning', category: 'phenomena', primary: 'Вода', secondary: [], isPrimaryCategory: true, order: 0 }], tags: [] }, photo('dictionary-only'));
  const saved = await diary.create({ title: 'Хайку', description: '', observationDate: '2026-11-12', imageIds: ['cover', 'second'] }, [photo('cover'), photo('second')]);
  const snapshot = await diary.snapshot(); assert.equal(snapshot.entries.length, 1); assert.equal(snapshot.entries[0].id, saved.id); assert.deepEqual(snapshot.entries[0].imageIds, ['cover', 'second']);
  assert.deepEqual(snapshot.media.map(asset => asset.id).sort(), ['cover', 'second']); assert.deepEqual(Buffer.from(await snapshot.media.find(asset => asset.id === 'cover').blob.arrayBuffer()), png);
});
test('observation date, original photo and empty description survive an edit and restart', async t => {
  const { db, diary } = await setup(t);
  const saved = await diary.create({ title: 'Первое', imageIds: ['photo'], description: '', observationDate: '2026-01-01' }, [photo('photo')]);
  const updated = await diary.update(saved.id, { title: 'Новое название' }); db.close(); await db.open();
  assert.equal(updated.observationDate, '2026-01-01'); assert.equal(updated.createdAt, saved.createdAt); assert.ok(updated.updatedAt > saved.updatedAt);
  const snapshot = await diary.snapshot(); assert.equal(snapshot.entries[0].description, ''); assert.equal(snapshot.media[0].id, 'photo');
});
test('deleting a diary entry keeps any dictionary card sharing its photo', async t => {
  const { db, diary, symbols } = await setup(t);
  const source = await symbols.save({ imageId: null, meanings: [{ id: 'meaning', category: 'phenomena', primary: 'Вода', secondary: [], isPrimaryCategory: true, order: 0 }], tags: [] }, photo('shared'));
  const saved = await diary.create({ title: 'Запись', imageIds: ['shared'] }); await diary.delete(saved.id);
  assert.equal((await diary.snapshot()).entries.length, 0); assert.ok(await db.media.get('shared')); assert.ok(await symbols.get(source.id));
});
