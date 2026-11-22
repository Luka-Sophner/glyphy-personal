import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import Dexie from 'dexie';
const root = process.cwd(), output = path.join(root, '.verification/profile-tests');
async function transpile(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await transpile(file);
    else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      const destination = path.join(output, path.relative(path.join(root, 'src'), file)).replace(/\.ts$/, '.js');
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, ts.transpileModule(await fs.readFile(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
    }
  }
}
await transpile(path.join(root, 'src'));
const { ProfileStore } = await import(new URL('../.verification/profile-tests/features/profiles/store.js', import.meta.url));
const { GlyphyDatabase } = await import(new URL('../.verification/profile-tests/db/database.js', import.meta.url));
const { exportProfiles, prepareProfileBackup, restoreProfiles } = await import(new URL('../.verification/profile-tests/features/profiles/archive.js', import.meta.url));
const { exportArchive } = await import(new URL('../.verification/profile-tests/features/transfer/archive.js', import.meta.url));
const { storeMedia } = await import(new URL('../.verification/profile-tests/db/media-storage.js', import.meta.url));
const { emptyGlyphCells } = await import(new URL('../.verification/profile-tests/types/glyphs-diary.js', import.meta.url));
const noop = () => {};
const glyphId = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';
const entryId = '33333333-3333-4333-8333-333333333333';
const options = { destination: 'existing', targetId: 'default', sourceIndex: 0, mode: 'merge', confirmed: false };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
async function fixture(t) {
  const store = new ProfileStore('profile-test-' + crypto.randomUUID());
  await store.initialize();
  t.after(async () => {
    for (const name of await Dexie.getDatabaseNames()) if (name.startsWith(store.legacyName)) await Dexie.delete(name);
  });
  return store;
}
async function fill(db, name = 'Символ') {
  const photo = { id: 'photo', blob: new Blob([png], { type: 'image/png' }), thumbnailBlob: new Blob([png], { type: 'image/png' }), mimeType: 'image/png', width: 1, height: 1, createdAt: 123 };
  await db.media.put(await storeMedia(photo));
  await db.cards.put({ id: 'symbol', imageId: 'photo', createdAt: 123, updatedAt: 124, tags: ['личное'], categories: ['phenomena'],
    meanings: [{ id: 'meaning', category: 'phenomena', primary: name, secondary: ['смысл'], isPrimaryCategory: true, order: 0 }] });
  const date = '2026-01-01T00:00:00.000Z';
  const cells = emptyGlyphCells().map(cell => cell.position === 'center' ? { ...cell, symbolId: 'symbol', meaningId: 'meaning', meaningSnapshot: name, imageIdSnapshot: 'photo' } : cell);
  await db.glyphs.put({ id: glyphId, primaryMeaning: name, description: '', synonyms: [], cells, imageIds: ['photo'], createdAt: date, updatedAt: date });
  await db.diaryGroups.put({ id: groupId, title: 'Группа', order: 0, coverEntryId: entryId, coverImageId: 'photo', createdAt: date, updatedAt: date });
  await db.diaryEntries.put({ id: entryId, title: 'Запись', description: 'Память', imageIds: ['photo'], groupId, observationDate: '2026-01-01', createdAt: date, updatedAt: date });
  await db.meta.put({ key: 'writing-settings', value: { direction: 'right' } });
}
test('v1.1 data are adopted in place, idempotently, without rewriting binary originals or IDs', async t => {
  const name = 'profile-test-' + crypto.randomUUID(), legacy = new GlyphyDatabase(name);
  await fill(legacy);
  const before = await legacy.media.toCollection().raw().first();
  legacy.close();
  const store = new ProfileStore(name);
  t.after(async () => { for (const db of await Dexie.getDatabaseNames()) if (db.startsWith(name)) await Dexie.delete(db); });
  await store.initialize(); await store.initialize();
  const { profiles, active } = await store.snapshot();
  assert.equal(profiles.length, 1); assert.equal(active.database, name);
  const db = store.database(active);
  assert.deepEqual(await db.media.toCollection().raw().first(), before);
  assert.equal((await db.cards.get('symbol')).updatedAt, 124);
  assert.equal((await db.glyphs.get(glyphId)).cells.find(cell => cell.position === 'center').symbolId, 'symbol');
  assert.equal((await db.diaryGroups.get(groupId)).coverImageId, 'photo');
});
test('five-profile limit is transactional, editing persists and all modules stay isolated', async t => {
  const store = await fixture(t), first = (await store.snapshot()).active, oldSession = store.database(first);
  await fill(oldSession);
  const creations = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => store.create('Профиль ' + i, 'star')));
  assert.equal(creations.filter(result => result.status === 'fulfilled').length, 4);
  const second = creations.find(result => result.status === 'fulfilled').value;
  await store.activate(second.id); await store.edit(second.id, 'Луна', 'moon');
  assert.equal((await store.snapshot()).active.icon, 'moon');
  const next = store.database(second);
  for (const table of ['cards', 'media', 'glyphs', 'diaryEntries', 'diaryGroups']) assert.equal(await next.table(table).count(), 0);
  // A captured session continues writing only to its original database.
  await oldSession.meta.put({ key: 'late-write', value: true });
  assert.equal(await next.meta.get('late-write'), undefined);
  await fill(next, 'Другой символ');
  await store.clear(second.id);
  const cleared = store.database(await store.profiles.get(second.id));
  for (const table of ['cards', 'media', 'glyphs', 'diaryEntries', 'diaryGroups']) assert.equal(await cleared.table(table).count(), 0);
  assert.equal(await oldSession.media.count(), 1);
  await store.remove(second.id);
  assert.equal((await store.snapshot()).profiles.length, 4);
  await assert.rejects(store.activate(second.id));
});
test('single and all-profile ZIPs restore originals, thumbnails, settings and links, including legacy ZIPs', async t => {
  const store = await fixture(t), first = (await store.snapshot()).active;
  await fill(store.database(first));
  const single = await prepareProfileBackup((await exportProfiles(store, [first.id], false, noop)).bytes, noop);
  const target = await store.create('Второй', 'leaf');
  await restoreProfiles(store, single, { ...options, targetId: target.id }, noop);
  const current = await store.profiles.get(target.id), restored = store.database(current);
  assert.deepEqual(Buffer.from(await (await restored.media.get('photo')).blob.arrayBuffer()), png);
  assert.deepEqual(Buffer.from(await (await restored.media.get('photo')).thumbnailBlob.arrayBuffer()), png);
  assert.deepEqual((await restored.meta.get('writing-settings')).value, { direction: 'right' });
  assert.equal((await restored.diaryEntries.get(entryId)).groupId, groupId);
  assert.equal((await restored.glyphs.get(glyphId)).imageIds[0], 'photo');
  const legacy = await prepareProfileBackup((await exportArchive(store.database(first))).bytes, noop);
  assert.equal(legacy.kind, 'legacy');
  const result = await restoreProfiles(store, legacy, { ...options, targetId: target.id }, noop);
  assert.equal(result.added, 0); assert.equal(result.skipped, 1);
  await store.edit(first.id, 'Из архива', 'moon');
  const all = await prepareProfileBackup((await exportProfiles(store, [first.id, target.id], true, noop)).bytes, noop);
  await store.edit(first.id, 'Локальное имя', 'sun');
  await restoreProfiles(store, all, { ...options, destination: 'all' }, noop);
  assert.equal((await store.snapshot()).profiles.length, 2);
  assert.equal((await store.profiles.get(first.id)).name, 'Из архива');
  assert.equal((await store.profiles.get(first.id)).icon, 'moon');
});
test('restore preserves profiles beyond the free limit and never publishes partial failed stages', async t => {
  const store = await fixture(t), first = (await store.snapshot()).active;
  await fill(store.database(first));
  const backup = await prepareProfileBackup((await exportProfiles(store, [first.id], true, noop)).bytes, noop);
  const base = backup.profiles[0];
  const expanded = { kind: 'all', profiles: Array.from({ length: 6 }, (_, i) => ({ ...base, profile: { ...base.profile, id: 'restored-' + i, name: 'Из копии ' + i } })) };
  await restoreProfiles(store, expanded, { ...options, destination: 'all' }, noop);
  assert.equal((await store.snapshot()).profiles.length, 7);
  await assert.rejects(store.create('Шестой', 'person'), /пять/);
  const before = await store.profiles.toArray(), original = await store.database(first).cards.toArray();
  const broken = { kind: 'all', profiles: [base, { ...base, profile: { ...base.profile, id: 'broken' }, archive: { ...base.archive, media: [] } }] };
  await assert.rejects(restoreProfiles(store, broken, { ...options, destination: 'all', mode: 'replace', confirmed: true }, noop));
  assert.deepEqual(await store.profiles.toArray(), before);
  assert.deepEqual(await store.database(first).cards.toArray(), original);
  await assert.rejects(restoreProfiles(store, backup, { ...options, mode: 'replace' }, noop), /подтверждения/);
  const bytes = (await exportProfiles(store, [first.id], false, noop)).bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const data = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    if (size) { bytes[data + Math.floor(size / 2)] ^= 127; break; }
    offset = data;
  }
  await assert.rejects(prepareProfileBackup(bytes, noop));
});
test('failed clear publication leaves the original profile and every photograph intact', async t => {
  const store = await fixture(t), original = (await store.snapshot()).active;
  const db = store.database(original);
  await fill(db);
  const before = await db.media.toCollection().raw().toArray();
  const put = store.profiles.put.bind(store.profiles);
  store.profiles.put = async () => { throw new Error('Synthetic quota failure'); };
  try { await assert.rejects(store.clear(original.id), /quota/); }
  finally { store.profiles.put = put; }
  assert.equal((await store.profiles.get(original.id)).database, original.database);
  assert.deepEqual(await db.media.toCollection().raw().toArray(), before);
  assert.equal(await db.cards.count(), 1);
});
test('replacing with an empty profile clears all modules while legacy dictionary replacement retains the diary', async t => {
  const store = await fixture(t), first = (await store.snapshot()).active;
  const empty = await store.create('Пустая письменность', 'sun');
  const full = await prepareProfileBackup((await exportProfiles(store, [empty.id], false, noop)).bytes, noop);
  await fill(store.database(first));
  const legacy = await prepareProfileBackup((await exportArchive(store.database(empty))).bytes, noop);
  await restoreProfiles(store, legacy, { ...options, mode: 'replace', confirmed: true }, noop);
  const partial = store.database(await store.profiles.get(first.id));
  assert.equal(await partial.cards.count(), 0);
  assert.equal(await partial.diaryEntries.count(), 1);
  assert.equal(await partial.media.count(), 1);
  await restoreProfiles(store, full, { ...options, mode: 'replace', confirmed: true }, noop);
  const restored = store.database(await store.profiles.get(first.id));
  for (const table of ['cards', 'media', 'glyphs', 'diaryEntries', 'diaryGroups']) assert.equal(await restored.table(table).count(), 0);
});
test('abandoned import stages are recovered without touching the working profile', async t => {
  const store = await fixture(t), profile = (await store.snapshot()).active;
  await fill(store.database(profile));
  const orphanName = store.legacyName + '-restored-abandoned', orphan = new GlyphyDatabase(orphanName);
  await orphan.meta.put({ key: 'incomplete', value: true });
  orphan.close();
  await store.state.put({ key: 'pending-' + orphanName, value: orphanName, createdAt: Date.now() - 25 * 60 * 60 * 1000 });
  await store.initialize();
  assert.equal(await Dexie.exists(orphanName), false);
  assert.equal(await store.database(profile).cards.count(), 1);
  assert.deepEqual(Buffer.from(await (await store.database(profile).media.get('photo')).blob.arrayBuffer()), png);
});
