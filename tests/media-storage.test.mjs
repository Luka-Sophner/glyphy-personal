import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { diaryPng } from './fixtures/diary-images.mjs';
const root = new URL('../', import.meta.url);
const files = ['db/media-storage.ts','db/storage-errors.ts','db/database.ts','db/repository.ts','db/media-lifecycle.ts','db/DiaryRepository.ts','db/DiaryGroupRepository.ts','db/GlyphRepository.ts','db/model-validation.ts','lib/id.ts','lib/categories.ts','types/index.ts','types/glyphs-diary.ts','features/transfer/archive.ts','features/transfer/modules.ts','features/transfer/image-header.ts','features/transfer/zip-safety.ts','features/transfer/known-demo-svg.ts','features/diary/media-policy.ts'];
for (const file of files) {
  const destination = new URL(`.verification/media-storage-tests/src/${file.replace(/\.ts$/, '.js')}`, root);
  await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
  await writeFile(destination, ts.transpileModule(await readFile(new URL(`src/${file}`, root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const load = file => import(new URL(`.verification/media-storage-tests/src/${file}.js`, root).href);
const { GlyphyDatabase } = await load('db/database');
const { SymbolRepository } = await load('db/repository');
const { DiaryRepository } = await load('db/DiaryRepository');
const { DiaryGroupRepository } = await load('db/DiaryGroupRepository');
const { storeMedia, readMedia } = await load('db/media-storage');
const { mediaSaveError } = await load('db/storage-errors');
const { exportArchive, prepareImport, applyImport } = await load('features/transfer/archive');
const photo = id => ({ id, blob: new Blob([diaryPng(96,128)], { type: 'image/png' }), thumbnailBlob: new Blob([diaryPng(48,64)], { type: 'image/png' }), mimeType: 'image/png', width: 96, height: 128, createdAt: Date.now() });
const draft = name => ({ imageId: null, meanings: [{ id: 'meaning', category: 'phenomena', primary: name, secondary: [], isPrimaryCategory: true, order: 0 }], tags: [] });
async function database(t) {
  const db = new GlyphyDatabase(`media-storage-${crypto.randomUUID()}`); await db.open();
  t.after(async () => { db.close(); await Dexie.delete(db.name); }); return db;
}
async function raw(db, id) {
  return new Promise((resolve, reject) => { const request = db.backendDB().transaction('media').objectStore('media').get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
function forbidBlobs(t) {
  for (const method of ['add','put']) {
    const original = IDBObjectStore.prototype[method];
    IDBObjectStore.prototype[method] = function(value, ...args) {
      if (this.name === 'media' && (value.blob instanceof Blob || value.thumbnailBlob instanceof Blob)) throw new DOMException('Failed to write blobs (InvalidBlob)', 'DataError');
      return original.call(this, value, ...args);
    };
    t.after(() => { IDBObjectStore.prototype[method] = original; });
  }
}
test('new photographs bypass failing native Blob storage, restore exact bytes and generate display URLs', async t => {
  const db = await database(t), repository = new SymbolRepository(db), asset = photo('new-photo'); forbidBlobs(t);
  const card = await repository.save(draft('New photo'), asset), stored = await raw(db, asset.id);
  assert(stored.blob instanceof ArrayBuffer); assert(stored.thumbnailBlob instanceof ArrayBuffer);
  assert.equal(stored.storageFormat, 'arraybuffer-v1'); assert.equal(stored.mimeType, 'image/png');
  assert.deepEqual(new Uint8Array(stored.blob), new Uint8Array(await asset.blob.arrayBuffer()));
  const decoded = await db.media.get(card.imageId); assert(decoded.blob instanceof Blob); assert.equal(decoded.thumbnailBlob.type,'image/png');
  const url = URL.createObjectURL(decoded.blob);
  try { assert.deepEqual(new Uint8Array(await (await fetch(url)).arrayBuffer()), new Uint8Array(stored.blob)); } finally { URL.revokeObjectURL(url); }
  const replacement = photo('replacement'); await repository.save({ ...card, expectedUpdatedAt: card.updatedAt }, replacement);
  assert.equal(await db.media.get(asset.id), undefined);
  await repository.delete(card.id); assert.equal(await db.media.count(), 0);
});
test('legacy Blob records remain untouched across reopen; old and new records round trip through ZIP', async t => {
  const db = await database(t), repository = new SymbolRepository(db), legacy = photo('legacy');
  await db.media.add(legacy); await repository.save({ ...draft('Legacy'), imageId: legacy.id });
  db.close(); await db.open(); assert((await raw(db, legacy.id)).blob instanceof Blob);
  assert.equal((await db.media.get(legacy.id)).blob.type, 'image/png'); forbidBlobs(t);
  await repository.save(draft('Binary'), photo('binary'));
  const before = await exportArchive(db), prepared = await prepareImport(before.bytes), destination = await database(t);
  await applyImport(destination, prepared, 'merge');
  assert.equal(await destination.cards.count(), 2);
  for (const asset of prepared.media) {
    assert((await raw(destination, asset.id)).blob instanceof ArrayBuffer);
    assert.deepEqual(new Uint8Array(await (await destination.media.get(asset.id)).blob.arrayBuffer()), new Uint8Array(await asset.blob.arrayBuffer()));
  }
  const restored = await prepareImport((await exportArchive(destination)).bytes);
  assert.equal(restored.manifest.formatVersion, before.manifest.formatVersion); assert.equal(restored.media.length, 2);
});
test('diary images and group covers store bytes, replace and collect unused images atomically', async t => {
  const db = await database(t), diary = new DiaryRepository(db), groups = new DiaryGroupRepository(db); forbidBlobs(t);
  const first = photo('diary-first'), second = photo('diary-second'), cover = photo('cover');
  const entry = await diary.create({ title:'Entry', imageIds:[first.id], description:'Draft preserved', observationDate:'2026-11-14' }, [first]);
  await diary.update(entry.id, { imageIds:[second.id] }, [second], { expectedUpdatedAt:entry.updatedAt });
  assert.equal(await db.media.get(first.id), undefined); assert((await raw(db, second.id)).blob instanceof ArrayBuffer);
  const group = await groups.save({ title:'Group', coverImageId:cover.id }, undefined, {}, cover);
  assert((await raw(db, cover.id)).thumbnailBlob instanceof ArrayBuffer);
  const prepared = await prepareImport((await exportArchive(db)).bytes), restored = await database(t);
  await applyImport(restored, prepared, 'merge');
  assert.equal(await restored.diaryEntries.count(), 1); assert.equal(await restored.diaryGroups.count(), 1);
  await groups.delete(group.id); assert.equal(await db.media.get(cover.id), undefined);
  await diary.delete(entry.id); assert.equal(await db.media.count(),0);
});
test('failed file read or transaction leaves previous photograph, text and media links intact', async t => {
  const db = await database(t), repository = new SymbolRepository(db), old = photo('original');
  const card = await repository.save(draft('Keep me'), old);
  const broken = photo('broken'); broken.blob.arrayBuffer = async () => { throw new DOMException('Cannot read file', 'NotReadableError'); };
  await assert.rejects(repository.save({ ...card, meanings:draft('New title').meanings }, broken), /Cannot read/);
  assert.equal((await repository.get(card.id)).meanings[0].primary,'Keep me');
  assert.equal(await db.media.count(),1);
  await assert.rejects(repository.save({ ...card, expectedUpdatedAt:-1 }, photo('aborted')));
  assert.equal(await db.media.get('aborted'),undefined); assert.equal((await repository.get(card.id)).imageId,old.id);
  assert.match(mediaSaveError(new DOMException('InvalidBlob','DataError')), /остались в редакторе/);
  assert.match(mediaSaveError({ inner:{name:'QuotaExceededError'} }), /Недостаточно места/);
});
test('byte codec preserves metadata and accepts both legacy and binary records', async () => {
  const asset=photo('codec'), stored=await storeMedia(asset), restored=readMedia(stored);
  assert.equal(readMedia(asset),asset); assert.equal(restored.id,asset.id); assert.equal(restored.createdAt,asset.createdAt);
  assert.deepEqual(new Uint8Array(await restored.thumbnailBlob.arrayBuffer()), new Uint8Array(await asset.thumbnailBlob.arrayBuffer()));
});
