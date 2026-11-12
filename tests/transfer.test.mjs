import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import JSZip from 'jszip/dist/jszip.min.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { exifOrientationSegment } from './fixtures/diary-images.mjs';
const root = new URL('../', import.meta.url);
for (const file of ['db/database.ts', 'db/repository.ts', 'db/media-lifecycle.ts', 'lib/id.ts', 'lib/categories.ts', 'types/index.ts', 'features/transfer/archive.ts', 'features/transfer/modules.ts','features/diary/media-policy.ts', 'types/glyphs-diary.ts', 'db/model-validation.ts', 'features/transfer/image-header.ts', 'features/transfer/zip-safety.ts', 'features/transfer/known-demo-svg.ts']) {
  const source = await readFile(new URL(`src/${file}`, root), 'utf8');
  const destination = new URL(`.verification/transfer-tests/src/${file.replace(/\.ts$/, '.js')}`, root);
  await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
  await writeFile(destination, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const { GlyphyDatabase } = await import(new URL('.verification/transfer-tests/src/db/database.js', root).href);
const { SymbolRepository } = await import(new URL('.verification/transfer-tests/src/db/repository.js', root).href);
const { exportArchive, prepareImport, applyImport } = await import(new URL('.verification/transfer-tests/src/features/transfer/archive.js', root).href);
const { inspectZip } = await import(new URL('.verification/transfer-tests/src/features/transfer/zip-safety.js', root).href);
const { emptyGlyphCells } = await import(new URL('.verification/transfer-tests/src/types/glyphs-diary.js', root).href);
const { imageDimensions } = await import(new URL('.verification/transfer-tests/src/features/transfer/image-header.js', root).href);

test('phone JPEG with EXIF rotation round trips with displayed dimensions and original bytes', async t => {
  const repo=await database(t), jpeg=await readFile(new URL('docs/screenshots/dictionary-393x852.jpg',root));
  const rotated=Buffer.concat([jpeg.subarray(0,2),exifOrientationSegment(6),jpeg.subarray(2)]), raw=imageDimensions(rotated,'image/jpeg');
  const photo={...asset('rotated-phone-photo'), blob:new Blob([rotated],{type:'image/jpeg'}),mimeType:'image/jpeg',width:raw.height,height:raw.width};
  await repo.save(draft('Rotated JPEG'),photo);
  const imported=await prepareImport((await exportArchive(repo.db)).bytes);
  assert.equal(imported.media[0].width,raw.height); assert.equal(imported.media[0].height,raw.width);
  assert.deepEqual(Buffer.from(await imported.media[0].blob.arrayBuffer()),rotated);
});

async function fullSource(t) {
  const repo = await source(t), card = (await repo.list()).find(c => c.imageId === 'water-photo');
  const groupId = crypto.randomUUID(), entryId = crypto.randomUUID(), glyphId = crypto.randomUUID(), partId = crypto.randomUUID();
  const stamp = '2026-11-12T12:34:56.000Z';
  await repo.db.media.add(asset('custom-cover'));
  await repo.db.diaryGroups.add({ id: groupId, title: 'Haiku', coverEntryId: entryId, coverImageId: 'custom-cover', order: 0, createdAt: stamp, updatedAt: stamp });
  await repo.db.diaryEntries.add({ id: entryId, title: 'Autumn', description: 'line one\nline two\nline three', imageIds: ['water-photo', 'river-photo'], observationDate: '2025-01-02', groupId, createdAt: stamp, updatedAt: stamp });
  const cells = emptyGlyphCells().map(c => c.position === 'center' ? { ...c, symbolId: card.id, meaningId: card.meanings[0].id, meaningSnapshot: card.meanings[0].primary, imageIdSnapshot: card.imageId } : { ...c, imageIdSnapshot: null });
  cells[0].referenceValue = { kind: 'local-number', value: 7 };
  const partCells = structuredClone(cells); partCells[0].referenceValue.value = 8;
  partCells[8].referenceValue = { kind: 'local-reference', value: 7, targetGlyphId: glyphId };
  await repo.db.glyphs.add({ id: glyphId, primaryMeaning: 'Water phrase', synonyms: ['river'], description: 'Historical snapshot', cells, additionalGlyphs: [{ id: partId, primaryMeaning: 'Second part', synonyms: [], description: '', cells: partCells }], imageIds: ['water-photo'], createdAt: stamp, updatedAt: stamp });
  await repo.delete(card.id); // Keep a historical glyph snapshot even after its source card disappears.
  return repo;
}
async function moduleSnapshot(db) {
  const rows = async table => (await table.toArray()).sort((a,b) => a.id.localeCompare(b.id));
  return { glyphs: await rows(db.glyphs), diaryEntries: await rows(db.diaryEntries), diaryGroups: await rows(db.diaryGroups) };
}

test('complete ZIP restores glyph parts, historical snapshots, diary, dates, covers and original photo bytes after restart', async t => {
  const original = await fullSource(t), target = await database(t), archive = await exportArchive(original.db);
  assert.equal(archive.manifest.formatVersion, 2); assert.equal(archive.manifest.schemaVersion, 5);
  const prepared = await prepareImport(archive.bytes); assert.equal(prepared.modules.glyphs.length, 1);
  const result = await applyImport(target.db, prepared, 'merge');
  assert.deepEqual(result, { added: 2, skipped: 0, glyphsAdded: 1, entriesAdded: 1, groupsAdded: 1 });
  target.db.close(); await target.db.open();
  assert.deepEqual(await moduleSnapshot(target.db), await moduleSnapshot(original.db));
  for (const image of await original.db.media.toArray()) {
    const saved = await target.db.media.get(image.id);
    assert.deepEqual(Buffer.from(await saved.blob.arrayBuffer()), Buffer.from(await image.blob.arrayBuffer()));
    assert.deepEqual(Buffer.from(await saved.thumbnailBlob.arrayBuffer()), Buffer.from(await image.thumbnailBlob.arrayBuffer()));
  }
  const again = await applyImport(target.db, prepared, 'merge');
  assert.deepEqual(again, { added: 0, skipped: 2, glyphsAdded: 0, entriesAdded: 0, groupsAdded: 0 });
});
test('full ZIP media collisions remap every glyph snapshot, diary image and group cover consistently', async t => {
  const original = await fullSource(t), target = await database(t);
  await target.save(draft('Local photo'), asset('water-photo', secondPng, 512));
  const archive = await prepareImport((await exportArchive(original.db)).bytes);
  await applyImport(target.db, archive, 'merge');
  const glyph = (await target.db.glyphs.toArray())[0], entry = (await target.db.diaryEntries.toArray())[0];
  assert.notEqual(glyph.cells[4].imageIdSnapshot, 'water-photo');
  assert.equal(glyph.cells[4].imageIdSnapshot, entry.imageIds[0]);
  assert.equal(glyph.additionalGlyphs[0].cells[4].imageIdSnapshot, entry.imageIds[0]);
  assert.deepEqual(Buffer.from(await (await target.db.media.get('water-photo')).blob.arrayBuffer()), secondPng);
});
test('legacy dictionary replacement preserves full diary and glyph records and their media', async t => {
  const legacy = await source(t), target = await fullSource(t), before = await moduleSnapshot(target.db);
  await applyImport(target.db, await prepareImport((await exportArchive(legacy.db)).bytes), 'replace', true);
  assert.deepEqual(await moduleSnapshot(target.db), before);
  for (const id of ['water-photo','river-photo','custom-cover']) assert.ok(await target.db.media.get(id));
});
test('full replacement needs confirmation and restores all modules atomically', async t => {
  const original = await fullSource(t), target = await fullSource(t), prepared = await prepareImport((await exportArchive(original.db)).bytes), before = await moduleSnapshot(target.db);
  await assert.rejects(applyImport(target.db, prepared, 'replace'));
  assert.deepEqual(await moduleSnapshot(target.db), before);
  await assert.rejects(applyImport(target.db, { ...prepared, media: [] }, 'replace', true));
  assert.deepEqual(await moduleSnapshot(target.db), before);
  await applyImport(target.db, prepared, 'replace', true);
  assert.deepEqual(await moduleSnapshot(target.db), await moduleSnapshot(original.db));
});
test('full ZIP rejects missing module files, unknown group membership and missing historical images before import', async t => {
  const repo = await fullSource(t), bytes = (await exportArchive(repo.db)).bytes;
  await assert.rejects(prepareImport(await altered(bytes, zip => { zip.remove('data/modules.json'); })));
  for (const change of [m => { m.diaryEntries[0].groupId = crypto.randomUUID(); }, m => { m.glyphs[0].cells[4].imageIdSnapshot = 'missing'; }, m => { m.diaryGroups.push(m.diaryGroups[0]); }]) {
    const broken = await altered(bytes, async zip => { const modules = JSON.parse(await zip.file('data/modules.json').async('string')); change(modules); zip.file('data/modules.json', JSON.stringify(modules)); });
    await assert.rejects(prepareImport(broken));
  }
});
const png = await readFile(new URL('public/icons/icon-192.png', root)), secondPng = await readFile(new URL('public/icons/icon-512.png', root));
const group = (category, primary, order = 0) => ({ id: `group-${order}`, category, primary, secondary: ['Субстанция', 'Жидкость'], isPrimaryCategory: order === 0, order });
const draft = (name = 'Вода') => ({ imageId: null, meanings: [group('phenomena', name), group('events', 'Течь', 1), group('qualities', 'Мокрый', 2)], tags: ['Природа', 'Вода'] });
const asset = (id, bytes = png, size = 192) => ({ id, blob: new Blob([bytes], { type: 'image/png' }), thumbnailBlob: new Blob([png], { type: 'image/png' }), mimeType: 'image/png', width: size, height: size, createdAt: 42 });
async function database(t) {
  const db = new GlyphyDatabase(`glyphy-transfer-test-${crypto.randomUUID()}`); await db.open();
  t.after(async () => { db.close(); await Dexie.delete(db.name); }); return new SymbolRepository(db);
}
async function source(t) {
  const repo = await database(t);
  await repo.save(draft(), asset('water-photo'));
  await repo.save(draft('Река'), asset('river-photo', secondPng, 512));
  await repo.save(draft('Без фотографии'));
  return repo;
}
async function altered(bytes, change) {
  const zip = await JSZip.loadAsync(bytes); await change(zip);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
async function manifestChange(bytes, change) {
  return altered(bytes, async zip => { const manifest = JSON.parse(await zip.file('manifest.json').async('string')); change(manifest); zip.file('manifest.json', JSON.stringify(manifest)); });
}

test('full recovery into isolated empty database preserves cards, categories, tags and every image byte', async t => {
  const original = await source(t), destination = await database(t), archive = await exportArchive(original.db);
  assert.match(archive.filename, /^glyphy-\d{4}-\d{2}-\d{2}.*\.zip$/);
  const prepared = await prepareImport(archive.bytes), imported = await applyImport(destination.db, prepared, 'merge');
  assert.deepEqual(imported, { added: 3, skipped: 0 });
  assert.deepEqual((await destination.list()).sort((a,b)=>a.id.localeCompare(b.id)), (await original.list()).sort((a,b)=>a.id.localeCompare(b.id)));
  for (const category of ['phenomena', 'events', 'qualities']) assert.equal((await destination.byCategory(category)).length, 3);
  for (const media of await original.db.media.toArray()) {
    const restored = await destination.db.media.get(media.id);
    assert.deepEqual(Buffer.from(await restored.blob.arrayBuffer()), Buffer.from(await media.blob.arrayBuffer()));
    assert.deepEqual(Buffer.from(await restored.thumbnailBlob.arrayBuffer()), Buffer.from(await media.thumbnailBlob.arrayBuffer()));
  }
  assert.deepEqual(await applyImport(destination.db, prepared, 'merge'), { added: 0, skipped: 3 });
  assert.equal(await destination.db.cards.count(), 3); assert.equal(await destination.db.media.count(), 2);
  assert.equal(await original.db.cards.count(), 3);
});
test('merge keeps existing UUID and local edits', async t => {
  const repo = await source(t), prepared = await prepareImport((await exportArchive(repo.db)).bytes), card = (await repo.list())[0];
  await repo.save({ ...card, expectedUpdatedAt: card.updatedAt, tags: ['Личная правка'] });
  const result = await applyImport(repo.db, prepared, 'merge');
  assert.equal(result.added, 0); assert.deepEqual((await repo.get(card.id)).tags, ['Личная правка']);
});
test('conflicting media UUID is remapped without changing other cards or originals', async t => {
  const original = await source(t), destination = await database(t);
  const existing = await destination.save(draft('Локальный'), asset('water-photo', secondPng, 512));
  const prepared = await prepareImport((await exportArchive(original.db)).bytes);
  await applyImport(destination.db, prepared, 'merge');
  const imported = (await destination.list()).find(card => card.id === prepared.cards.find(card => card.imageId === 'water-photo').id);
  assert.notEqual(imported.imageId, 'water-photo');
  assert.equal((await destination.get(existing.id)).imageId, 'water-photo');
  assert.deepEqual(Buffer.from(await (await destination.db.media.get('water-photo')).blob.arrayBuffer()), secondPng);
  assert.deepEqual(Buffer.from(await (await destination.db.media.get(imported.imageId)).blob.arrayBuffer()), png);
  await applyImport(destination.db, prepared, 'merge'); assert.equal(await destination.db.media.count(), 3);
});
test('replace requires explicit confirmation, then restores the exact archive', async t => {
  const original = await source(t), target = await database(t), previous = await target.save(draft('Локальный'));
  const prepared = await prepareImport((await exportArchive(original.db)).bytes);
  await assert.rejects(applyImport(target.db, prepared, 'replace'), /подтверждения/);
  assert.ok(await target.get(previous.id));
  await applyImport(target.db, prepared, 'replace', true);
  assert.equal(await target.get(previous.id), undefined); assert.equal(await target.db.cards.count(), 3);
});
test('failed replacement rolls back cleared cards, all photos and metadata atomically', async t => {
  const original = await source(t), target = await database(t), previous = await target.save(draft('Локальный'), asset('local-photo'));
  await target.db.meta.put({ key: 'before', value: 'kept' });
  const prepared = await prepareImport((await exportArchive(original.db)).bytes);
  target.db.cards.hook('creating', () => { throw new Error('Forced import failure'); });
  await assert.rejects(applyImport(target.db, prepared, 'replace', true), /Forced import failure/);
  assert.deepEqual(await target.get(previous.id), previous); assert.equal(await target.db.media.count(), 1); assert.equal((await target.db.meta.get('before')).value, 'kept');
});
test('unsupported schema, missing fields and missing photos are rejected before writing', async t => {
  const archive = (await exportArchive((await source(t)).db)).bytes;
  await assert.rejects(prepareImport(await manifestChange(archive, manifest => { manifest.schemaVersion = 999; })), /Версия/);
  await assert.rejects(prepareImport(await altered(archive, zip => zip.remove('media/water-photo.png'))), /отсутствует/);
  await assert.rejects(prepareImport(await altered(archive, zip => zip.file('data/cards.json', '[{"id":"broken"}]'))));
});
test('path traversal, absolute paths and executable extra files are rejected', async t => {
  const archive = (await exportArchive((await source(t)).db)).bytes;
  for (const path of ['../evil.js', '/evil.js', 'media/../../evil.png', 'media\\evil.png', 'media/evil.js']) {
    await assert.rejects(prepareImport(await altered(archive, zip => zip.file(path, 'alert(1)'))));
  }
});
test('CRC corruption and dishonest decompressed sizes are rejected by bounded streams', async t => {
  const archive = (await exportArchive((await source(t)).db)).bytes;
  const corrupted = new Uint8Array(archive);
  const infos = inspectZip(corrupted); assert.ok(infos.length >= 6);
  const marker = new TextEncoder().encode('water-photo.png');
  let position = -1;
  for (let i=0;i<corrupted.length-marker.length;i++) if(marker.every((v,j)=>corrupted[i+j]===v)){position=i;break;}
  assert.ok(position >= 0); corrupted[position+marker.length+45] ^= 1;
  await assert.rejects(prepareImport(corrupted));
  const dishonest = await altered(archive, zip => zip.file('data/cards.json', ' '.repeat(100_000)));
  const view = new DataView(dishonest.buffer, dishonest.byteOffset, dishonest.byteLength);
  for (let i=0;i<dishonest.length-46;i++) if(view.getUint32(i,true)===0x02014b50){
    const len=view.getUint16(i+28,true), name=new TextDecoder().decode(dishonest.subarray(i+46,i+46+len));
    if(name==='data/cards.json'){view.setUint32(i+24,1,true);const local=view.getUint32(i+42,true);view.setUint32(local+22,1,true);break;}
  }
  await assert.rejects(prepareImport(dishonest), /размер|Размер|size/i);
});
test('wrong image types and oversized declared files are rejected', async t => {
  const archive = (await exportArchive((await source(t)).db)).bytes;
  await assert.rejects(prepareImport(await altered(archive, zip => zip.file('media/water-photo.png', '<script>alert(1)</script>'))), /изображения/);
  const oversized = new Uint8Array(archive), view = new DataView(oversized.buffer);
  for (let i=0;i<oversized.length-46;i++) if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,129*1024*1024,true);break;}
  await assert.rejects(prepareImport(oversized), /размер/);
});
test('safe local demo SVGs round-trip; arbitrary SVG code cannot be restored', async t => {
  const repo = await database(t), svg = await readFile(new URL('src/assets/glyphs/water-demo.svg', root));
  await repo.save(draft(), { ...asset('demo-photo'), blob: new Blob([svg],{type:'image/svg+xml'}), mimeType:'image/svg+xml', width:948, height:948 });
  const archive = (await exportArchive(repo.db)).bytes;
  assert.equal((await prepareImport(archive)).media.length,1);
  await assert.rejects(prepareImport(await altered(archive, zip=>zip.file('media/demo-photo.svg','<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))), /изображения/);
});
test('empty dictionary exports a valid restorable archive', async t => {
  const repo=await database(t), archive=await exportArchive(repo.db), prepared=await prepareImport(archive.bytes);
  assert.equal(prepared.cards.length,0); assert.equal(prepared.media.length,0);
  assert.ok(inspectZip(archive.bytes).some(entry=>entry.name==='media/'));
});

test('the browser-exported demo ZIP survives Vite inline SVG quote normalization', async t => {
  const repo = await database(t), svg = (await readFile(new URL('src/assets/glyphs/water-demo.svg', root), 'utf8')).replaceAll('"', "'");
  await repo.save(draft(), { ...asset('inline-demo'), blob: new Blob([svg], { type: 'image/svg+xml' }), mimeType: 'image/svg+xml', width:948, height:948 });
  const archive = await exportArchive(repo.db);
  assert.equal((await prepareImport(archive.bytes)).media.length, 1);
});


test('forged huge bitmap dimensions are rejected before any image decoder', async t => {
  const archive = (await exportArchive((await source(t)).db)).bytes;
  const forged = new Uint8Array(png); new DataView(forged.buffer).setUint32(16, 100_000);
  await assert.rejects(prepareImport(await altered(archive, zip => zip.file('media/water-photo.png', forged))), /Разрешение/);
});

