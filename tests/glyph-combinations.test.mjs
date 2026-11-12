import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
for (const file of ['db/database.ts', 'db/repository.ts', 'db/GlyphRepository.ts', 'db/media-lifecycle.ts', 'db/model-validation.ts', 'lib/id.ts', 'lib/categories.ts', 'types/index.ts', 'types/glyphs-diary.ts', 'features/glyphs/editor.ts', 'features/glyphs/search.ts', 'features/glyphs/composition-search.ts', 'features/symbols/search.ts']) {
  const destination = new URL(`.verification/combination-tests/src/${file.replace(/\.ts$/, '.js')}`, root);
  await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
  await writeFile(destination, ts.transpileModule(await readFile(new URL(`src/${file}`, root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const compiled = file => new URL(`.verification/combination-tests/src/${file}.js`, root).href;
const { GlyphyDatabase } = await import(compiled('db/database'));
const { SymbolRepository } = await import(compiled('db/repository'));
const { GlyphRepository } = await import(compiled('db/GlyphRepository'));
const { emptyGlyphCells } = await import(compiled('types/glyphs-diary'));
const { validateGlyphInput, createPickerIndex } = await import(compiled('features/glyphs/editor'));
const { createCompositionSearchIndex } = await import(compiled('features/glyphs/composition-search'));
const png = await readFile(new URL('public/icons/icon-192.png', root));
const photo = id => ({ id, blob: new Blob([png], { type: 'image/png' }), thumbnailBlob: new Blob([png], { type: 'image/png' }), mimeType: 'image/png', width: 192, height: 192, createdAt: 1 });
async function setup(t) {
  const db = new GlyphyDatabase('glyphy-combinations-test-' + crypto.randomUUID()); await db.open();
  t.after(async () => { db.close(); await Dexie.delete(db.name); });
  return { db, glyphs: new GlyphRepository(db), symbols: new SymbolRepository(db) };
}
async function card(symbols, category, primary, imageId) {
  return symbols.save({ imageId: null, meanings: [{ id: crypto.randomUUID(), category, primary, secondary: ['Иное прочтение'], isPrimaryCategory: true, order: 0 }], tags: ['Тест'] }, imageId ? photo(imageId) : undefined);
}
function cellsFor(symbol, position = 'center') {
  return emptyGlyphCells().map(cell => cell.position === position ? { ...cell, symbolId: symbol.id, meaningId: symbol.meanings[0].id, meaningSnapshot: symbol.meanings[0].primary, ...(['topLeft', 'bottomRight'].includes(position) ? { specialMode: 'symbol' } : {}) } : cell);
}
const part = (symbol, name = 'Второй глиф') => ({ id: crypto.randomUUID(), primaryMeaning: name, synonyms: ['Продолжение'], description: 'Вторая часть связки', cells: cellsFor(symbol) });

test('both special positions accept any dictionary category in explicit symbol mode', async t => {
  const { glyphs, symbols } = await setup(t);
  for (const position of ['topLeft', 'bottomRight']) for (const category of ['phenomena', 'qualities', 'events', 'relations', 'experiences', 'certainty', 'time']) {
    const symbol = await card(symbols, category, 'Символ ' + category);
    const input = { primaryMeaning: 'Угловой глиф', cells: cellsFor(symbol, position) }; validateGlyphInput(input);
    const saved = await glyphs.save(input), cell = saved.cells.find(cell => cell.position === position);
    assert.equal(cell.symbolId, symbol.id); assert.equal(cell.meaningId, symbol.meanings[0].id); assert.equal(cell.specialMode, 'symbol'); assert.equal(cell.referenceValue, undefined);
  }
});
test('switching a corner from symbol to number and back retains exactly one role', async t => {
  const { glyphs, symbols } = await setup(t), symbol = await card(symbols, 'phenomena', 'Вода');
  let cells = cellsFor(symbol); cells[0] = { ...cells[0], referenceValue: { kind: 'local-number', value: 3 } };
  const first = await glyphs.save({ primaryMeaning: 'Номер', cells });
  const asSymbol = [...first.cells]; asSymbol[0] = cellsFor(symbol, 'topLeft')[0];
  const second = await glyphs.save({ primaryMeaning: 'Символ', cells: asSymbol }, first.id);
  assert.equal(second.cells[0].referenceValue, undefined); assert.equal(second.cells[0].symbolId, symbol.id);
  const asNumber = [...second.cells]; asNumber[0] = { position: 'topLeft', symbolId: null, meaningId: null, meaningSnapshot: '', referenceValue: { kind: 'local-number', value: 8 } };
  const third = await glyphs.save({ primaryMeaning: 'Снова номер', cells: asNumber }, first.id);
  assert.equal(third.cells[0].symbolId, null); assert.equal(third.cells[0].referenceValue.value, 8);
});
test('semantic positions still reject a mismatched category', async t => {
  const { glyphs, symbols } = await setup(t), symbol = await card(symbols, 'qualities', 'Мокрый');
  await assert.rejects(glyphs.save({ primaryMeaning: 'Ошибка', cells: cellsFor(symbol, 'topCenter') }), /позиции/);
});
test('all-category picker finds every group; category picker remains restricted', async t => {
  const { symbols } = await setup(t), one = await card(symbols, 'time', 'Вечер'), two = await card(symbols, 'qualities', 'Тёмный');
  assert.equal(createPickerIndex([one, two], null)('').length, 2);
  assert.equal(createPickerIndex([one, two], null)('тем')[0].group.primary, 'Тёмный');
  assert.equal(createPickerIndex([one, two], 'time')('тем').length, 0);
});
test('a phrase saves ordered nine-cell parts in one record and survives restart', async t => {
  const { db, glyphs, symbols } = await setup(t), first = await card(symbols, 'phenomena', 'Дождь', 'rain-photo'), second = await card(symbols, 'phenomena', 'Дорога', 'road-photo');
  const extra = part(second, 'Дорога'), input = { primaryMeaning: 'Дождь', cells: cellsFor(first), additionalGlyphs: [extra] }; validateGlyphInput(input);
  const saved = await glyphs.save(input); assert.equal(saved.cells.length, 9); assert.equal(saved.additionalGlyphs[0].cells.length, 9);
  assert.deepEqual(saved.imageIds.sort(), ['rain-photo', 'road-photo']); assert.equal(await db.glyphs.count(), 1);
  db.close(); await db.open(); assert.deepEqual(await glyphs.get(saved.id), saved);
  const edited = await glyphs.save({ ...saved, additionalGlyphs: [{ ...saved.additionalGlyphs[0], primaryMeaning: 'Тропа' }] }, saved.id, { expectedUpdatedAt: saved.updatedAt });
  assert.equal(edited.id, saved.id); assert.equal(edited.additionalGlyphs[0].id, extra.id); assert.equal(edited.additionalGlyphs[0].primaryMeaning, 'Тропа'); assert.equal(await db.glyphs.count(), 1);
});
test('invalid additional part rolls back the complete phrase update', async t => {
  const { glyphs, symbols } = await setup(t), first = await card(symbols, 'phenomena', 'Вода'), event = await card(symbols, 'events', 'Течь');
  const saved = await glyphs.save({ primaryMeaning: 'Прежнее', cells: cellsFor(first) });
  await assert.rejects(glyphs.save({ primaryMeaning: 'Новое', cells: saved.cells, additionalGlyphs: [part(event)] }, saved.id), /позиции/);
  assert.deepEqual(await glyphs.get(saved.id), saved);
});
test('additional part snapshots retain media after deleting its source; removing the part collects unused media', async t => {
  const { db, glyphs, symbols } = await setup(t), first = await card(symbols, 'phenomena', 'Первый', 'first-photo'), second = await card(symbols, 'phenomena', 'Второй', 'second-photo');
  const saved = await glyphs.save({ primaryMeaning: 'Связка', cells: cellsFor(first), additionalGlyphs: [part(second)] });
  await symbols.delete(second.id); assert.ok(await db.media.get('second-photo')); db.close(); await db.open();
  const current = await glyphs.get(saved.id); assert.equal(current.additionalGlyphs[0].cells.find(cell => cell.position === 'center').meaningSnapshot, 'Второй');
  await glyphs.save({ ...current, additionalGlyphs: [] }, saved.id); assert.equal(await db.media.get('second-photo'), undefined); assert.ok(await db.media.get('first-photo'));
});
test('deleting a phrase never deletes its source dictionary cards', async t => {
  const { db, glyphs, symbols } = await setup(t), first = await card(symbols, 'phenomena', 'Первый', 'retained-first'), second = await card(symbols, 'phenomena', 'Второй', 'retained-second');
  const saved = await glyphs.save({ primaryMeaning: 'Связка', cells: cellsFor(first), additionalGlyphs: [part(second)] });
  await glyphs.delete(saved.id); assert.equal(await db.glyphs.count(), 0); assert.equal(await db.cards.count(), 2); assert.equal(await db.media.count(), 2);
});
test('phrase search finds additional names, synonyms and descriptions without duplicate or projected records', async t => {
  const { glyphs, symbols } = await setup(t), first = await card(symbols, 'phenomena', 'Вода');
  const saved = await glyphs.save({ primaryMeaning: 'Начало', cells: cellsFor(first), additionalGlyphs: [part(first, 'Лёд')] });
  const search = createCompositionSearchIndex([saved]);
  for (const query of ['ЛЕД', 'Продолжение', 'вторая часть']) { const results = search(query); assert.equal(results.length, 1); assert.equal(results[0], saved); }
});
test('single older glyphs remain editable without additional parts', async t => {
  const { db, glyphs, symbols } = await setup(t), symbol = await card(symbols, 'phenomena', 'Вода');
  const saved = await glyphs.save({ primaryMeaning: 'Один', cells: cellsFor(symbol) }); const legacy = { ...saved }; delete legacy.additionalGlyphs; await db.glyphs.put(legacy);
  const updated = await glyphs.save({ primaryMeaning: 'Один обновлённый', cells: legacy.cells }, saved.id);
  assert.equal(updated.id, saved.id); assert.deepEqual(updated.additionalGlyphs, []);
});
