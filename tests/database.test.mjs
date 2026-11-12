import 'fake-indexeddb/auto';
import Dexie, { liveQuery } from 'dexie';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Compile the real repository, not a separate in-memory mock of its operations.
const root = new URL('../', import.meta.url);
for (const file of ['db/database.ts', 'db/repository.ts', 'db/media-lifecycle.ts', 'lib/id.ts', 'lib/categories.ts', 'types/index.ts']) {
  const source = await readFile(new URL(`src/${file}`, root), 'utf8');
  const destination = new URL(`.verification/db-tests/src/${file.replace(/\.ts$/, '.js')}`, root);
  await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
  await writeFile(destination, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const { GlyphyDatabase, schemaV1 } = await import(new URL('.verification/db-tests/src/db/database.js', root).href);
const { SymbolRepository } = await import(new URL('.verification/db-tests/src/db/repository.js', root).href);
const group = (category = 'phenomena', primary = 'Вода', index = 0) => ({ id: `group-${index}`, category, primary, secondary: ['Жидкость', 'Субстанция'], isPrimaryCategory: index === 0, order: index });
const draft = (meanings = [group()]) => ({ imageId: null, meanings, tags: [' Природа ', 'природа', 'река'] });
const asset = id => ({ id, blob: new Blob(['original-lines'], { type: 'image/png' }), mimeType: 'image/png', width: 1200, height: 900,
  thumbnailBlob: new Blob(['lossless-thumbnail'], { type: 'image/png' }), createdAt: Date.now() });
async function setup(t) {
  const db = new GlyphyDatabase(`glyphy-test-${crypto.randomUUID()}`); await db.open();
  t.after(async () => { db.close(); await Dexie.delete(db.name); });
  return new SymbolRepository(db);
}

test('one persisted card belongs to three categories without duplication', async t => {
  const repo = await setup(t);
  const card = await repo.save(draft([group(), group('events', 'Течь', 1), group('qualities', 'Мокрый', 2)]), asset('photo'));
  assert.equal(await repo.db.cards.count(), 1);
  for (const category of ['phenomena', 'events', 'qualities']) assert.deepEqual((await repo.byCategory(category)).map(c => c.id), [card.id]);
  assert.deepEqual(card.tags, ['Природа', 'река']);
  assert.ok(card.createdAt > 0 && card.updatedAt >= card.createdAt);
  assert.equal(await (await repo.db.media.get('photo')).blob.text(), 'original-lines');
});
test('edit preserves creation time, primary category and secondary arrays', async t => {
  const repo = await setup(t), card = await repo.save(draft());
  const changed = await repo.save({ ...card, expectedUpdatedAt: card.updatedAt, meanings: [{ ...group('time', 'Вечность'), secondary: ['Бесконечность', 'Длительность'] }] });
  assert.equal(changed.createdAt, card.createdAt); assert.ok(changed.updatedAt > card.updatedAt);
  assert.equal((await repo.byCategory('phenomena')).length, 0);
  assert.deepEqual((await repo.byCategory('time'))[0].meanings[0].secondary, ['Бесконечность', 'Длительность']);
});
test('replacement/removal/deletion collect only media without any references', async t => {
  const repo = await setup(t), first = await repo.save(draft(), asset('shared'));
  const second = await repo.save({ ...draft(), imageId: 'shared' });
  const replaced = await repo.save({ ...first, expectedUpdatedAt: first.updatedAt }, asset('replacement'));
  assert.ok(await repo.db.media.get('shared'));
  await repo.delete(second.id); assert.equal(await repo.db.media.get('shared'), undefined);
  assert.ok(await repo.db.media.get('replacement'));
  await repo.save({ ...replaced, expectedUpdatedAt: replaced.updatedAt }, null);
  assert.equal((await repo.get(first.id)).imageId, null); assert.equal(await repo.db.media.count(), 0);
  await repo.delete(first.id); assert.equal(await repo.db.cards.count(), 0);
});
test('failed card write rolls the media write back atomically', async t => {
  const repo = await setup(t);
  repo.db.cards.hook('creating', () => { throw new Error('forced card failure'); });
  await assert.rejects(repo.save(draft(), asset('orphan')), /forced card failure/);
  assert.equal(await repo.db.media.count(), 0); assert.equal(await repo.db.cards.count(), 0);
});
test('stale update cannot overwrite a newer card or insert an orphan photo', async t => {
  const repo = await setup(t), card = await repo.save(draft());
  await repo.save({ ...card, expectedUpdatedAt: card.updatedAt, tags: ['новые'] });
  await assert.rejects(repo.save({ ...card, expectedUpdatedAt: card.updatedAt }, asset('stale')), /другой вкладке/);
  assert.deepEqual((await repo.get(card.id)).tags, ['новые']); assert.equal(await repo.db.media.count(), 0);
});
test('records and original/thumbnail Blobs survive close and reopen', async t => {
  const repo = await setup(t), card = await repo.save(draft(), asset('persisted'));
  repo.db.close();
  const reopened = new GlyphyDatabase(repo.db.name); t.after(() => reopened.close());
  const next = new SymbolRepository(reopened); await reopened.open();
  assert.deepEqual(await next.get(card.id), card);
  const photo = await reopened.media.get('persisted');
  assert.equal(await photo.blob.text(), 'original-lines'); assert.equal(await photo.thumbnailBlob.text(), 'lossless-thumbnail');
  reopened.close();
});
test('version 1 upgrades to version 3 without losing original media', async t => {
  const name = `glyphy-migration-${crypto.randomUUID()}`, old = new Dexie(name); old.version(1).stores(schemaV1);
  await old.open(); await old.table('media').add(asset('legacy-photo'));
  await old.table('cards').add({ id: 'legacy', imageId: 'legacy-photo', meanings: [{ id: 'legacy-group', categoryId: 'events', primary: 'Течь', secondary: 'Литься' }], tags: [], createdAt: 42, updatedAt: 43 });
  old.close(); const upgraded = new GlyphyDatabase(name); t.after(async () => { upgraded.close(); await Dexie.delete(name); });
  await upgraded.open(); const repo = new SymbolRepository(upgraded), card = await repo.get('legacy');
  assert.deepEqual(card.meanings[0].secondary, ['Литься']); assert.equal(card.meanings[0].category, 'events');
  assert.equal(card.meanings[0].isPrimaryCategory, true); assert.equal(card.createdAt, 42);
  assert.equal((await repo.byCategory('events')).length, 1); assert.equal(await (await upgraded.media.get('legacy-photo')).blob.text(), 'original-lines');
});
test('demo seed is explicit, idempotent and never returns after deleting everything', async t => {
  const repo = await setup(t); assert.equal(await repo.db.cards.count(), 0);
  const now = Date.now(), card = { ...draft(), id: 'demo', meanings: [group()], categories: ['phenomena'], createdAt: now, updatedAt: now };
  await repo.seedDemo([card], []); await repo.seedDemo([card], []); assert.equal(await repo.db.cards.count(), 1);
  await repo.delete('demo'); await repo.seedDemo([card], []); assert.equal(await repo.db.cards.count(), 0);
});
test('live query observes repository commits', async t => {
  const repo = await setup(t);
  let subscription;
  const observed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('liveQuery did not update')), 2000);
    subscription = liveQuery(() => repo.list()).subscribe({ next: rows => { if (rows.length === 1) { clearTimeout(timer); resolve(rows); } }, error: reject });
  });
  t.after(() => subscription?.unsubscribe());
  const card = await repo.save(draft()); assert.equal((await observed)[0].id, card.id);
});
test('invalid meaning groups do not write partial records', async t => {
  const repo = await setup(t);
  await assert.rejects(repo.save(draft([{ ...group(), isPrimaryCategory: false }])), /основную категорию/);
  await assert.rejects(repo.save(draft([{ ...group(), primary: ' ' }])), /основное значение/);
  assert.equal(await repo.db.cards.count(), 0);
});

test('search index follows committed creation, edits and deletion', async t => {
  const source = await readFile(new URL('src/features/symbols/search.ts', root), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { createSearchIndex } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const repo = await setup(t);
  const watch = (term, expectedCount, write) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { subscription.unsubscribe(); reject(new Error('Search snapshot did not update')); }, 2000);
    let committed = false;
    const subscription = liveQuery(() => repo.list()).subscribe({
      next: rows => {
        const results = createSearchIndex(rows).search(term);
        if (committed && results.length === expectedCount) { clearTimeout(timer); subscription.unsubscribe(); resolve(results); }
      }, error: reject,
    });
    t.after(() => { clearTimeout(timer); subscription.unsubscribe(); });
    void write().then(() => { committed = true; return repo.list(); }).then(rows => {
      const results = createSearchIndex(rows).search(term);
      if (results.length === expectedCount) { clearTimeout(timer); subscription.unsubscribe(); resolve(results); }
    }).catch(reject);
  });
  let card;
  const added = await watch('лужа', 1, async () => { card = await repo.save(draft([group('phenomena', 'Лужа')])); });
  assert.equal(added[0].card.id, card.id);
  await watch('лужа', 0, async () => { card = await repo.save({ ...card, expectedUpdatedAt: card.updatedAt, meanings: [{ ...card.meanings[0], primary: 'Озеро' }] }); });
  assert.equal(createSearchIndex(await repo.list()).search('озеро')[0].card.id, card.id);
  await watch('озеро', 0, () => repo.delete(card.id));
});


