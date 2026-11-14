import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
const source = await readFile(new URL('../src/features/symbols/search.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createSearchIndex, normalizeSearch } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const meaning = (primary, category = 'phenomena', secondary = [], order = 0) => ({ id: `${category}-${order}`, primary, category, secondary, order, isPrimaryCategory: order === 0 });
const card = (id, meanings, tags = []) => ({ id, imageId: null, meanings, tags, createdAt: 1, updatedAt: 1 });
const water = card('water', [meaning('Вода', 'phenomena', ['Жидкость', 'Субстанция']), meaning('Течь', 'events', ['Литься'], 1), meaning('Мокрый', 'qualities', ['Водяной'], 2)], ['Природа', 'Ручей']);
const tree = card('tree', [meaning('Ёлка', 'phenomena', ['Зелёное дерево'])], ['Лес']);
const index = createSearchIndex([water, tree]);
const ids = results => results.map(result => result.card.id);

test('primary match chooses the matching meaning, not the primary category', () => {
  const [result] = index.search('течь'); assert.equal(result.card.id, 'water'); assert.equal(result.meaning.primary, 'Течь'); assert.equal(result.rank, 0);
});
test('secondary values and tags are searchable', () => {
  assert.equal(index.search('жидкость')[0].rank, 1); assert.equal(index.search('ручей')[0].rank, 2);
});
test('Cyrillic case, е/ё, Unicode and repeated whitespace normalize', () => {
  assert.deepEqual(ids(index.search('  ЕЛКА  ')), ['tree']);
  assert.deepEqual(ids(index.search('ЗЕЛЕНОЕ   ДЕРЕВО')), ['tree']);
  assert.equal(normalizeSearch(' Е\u0308ЛКА\n  ТЕЧЬ '), 'елка течь');
});
test('partial matches and beginning of an interior word work', () => {
  assert.equal(index.search('идк')[0].rank, 4); assert.equal(index.search('дер')[0].rank, 3);
});
test('ranking is primary, secondary, tag, word prefix, substring', () => {
  const cards = [card('partial', [meaning('Подвода')]), card('prefix', [meaning('Водапад')]), card('tag', [meaning('Третий')], ['вода']), card('secondary', [meaning('Второй', 'phenomena', ['вода'])]), water];
  assert.deepEqual(ids(createSearchIndex(cards).search('ВОДА')), ['water', 'secondary', 'tag', 'prefix', 'partial']);
});
test('equal-rank order is stable regardless of incoming record order', () => {
  const cards = [card('b', [meaning('Бета')], ['лес']), card('a2', [meaning('Альфа')], ['лес']), card('a1', [meaning('Альфа')], ['лес'])];
  assert.deepEqual(ids(createSearchIndex(cards).search('лес')), ['a1', 'a2', 'b']);
  assert.deepEqual(ids(createSearchIndex([...cards].reverse()).search('лес')), ['a1', 'a2', 'b']);
});
test('multiple field matches and duplicate input IDs still produce one card', () => {
  const duplicate = card('same', [meaning('Вода', 'phenomena', ['Вода']), meaning('Вода', 'events', [], 1)], ['Вода']);
  assert.deepEqual(ids(createSearchIndex([duplicate, duplicate]).search('вода')), ['same']);
});
test('category restricts membership and keeps that category display meaning', () => {
  const results = index.search('течь', 'phenomena'); assert.deepEqual(ids(results), ['water']); assert.equal(results[0].meaning.primary, 'Вода');
  assert.equal(index.search('елка', 'events').length, 0); assert.equal(index.search('мокрый', 'events')[0].meaning.primary, 'Течь');
});
test('empty and punctuation queries are safe', () => {
  assert.equal(index.search('   ').length, 2); assert.equal(index.search('[').length, 0); assert.equal(index.search('несуществующий').length, 0);
});
test('new snapshots reflect additions, edits and deletions without stale matches', () => {
  const added = card('new', [meaning('Лужа')]);
  assert.deepEqual(ids(createSearchIndex([water, added]).search('лужа')), ['new']);
  const edited = { ...added, meanings: [meaning('Озеро')], updatedAt: 2 };
  assert.equal(createSearchIndex([water, edited]).search('лужа').length, 0);
  assert.deepEqual(ids(createSearchIndex([water, edited]).search('озеро')), ['new']);
  assert.equal(createSearchIndex([water]).search('озеро').length, 0);
});
test('300 and 1000 cards: reusable index, bounded search time', async () => {
  const measurements = [];
  for (const size of [300, 1000]) {
    const cards = Array.from({ length: size }, (_, i) => card(`symbol-${i}`, [meaning(`Символ ${i}`, 'phenomena', ['Зелёное дерево']), meaning(`Движение ${i}`, 'events', ['Течь'], 1)], ['Природа', `Метка ${i}`]));
    const start = performance.now(), prepared = createSearchIndex(cards), buildMs = performance.now() - start;
    const times = [];
    for (let iteration = 0; iteration < 50; ++iteration) {
      const before = performance.now(); const found = prepared.search(iteration % 2 ? 'зеленоЕ' : 'течь'); times.push(performance.now() - before); assert.equal(found.length, size);
    }
    times.sort((a, b) => a - b); const p95Ms = times[Math.floor(times.length * .95)];
    measurements.push({ cards: size, buildMs, searchP95Ms: p95Ms });
    assert.ok(p95Ms < 500, `Search unexpectedly slow: ${p95Ms}ms`);
  }
  await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
  await writeFile(new URL('../docs/search-benchmark.json', import.meta.url), JSON.stringify({ runtime: process.version, measurements, note: 'Local Node run; not a Poco X6 Pro measurement. 50 searches per size, including sorting.' }, null, 2));
  console.log(JSON.stringify(measurements));
});

test('matching group stays precise when two groups share one category', () => {
  const multi = card('same-category', [meaning('Вода'), meaning('Река', 'phenomena', ['Поток'], 1)]);
  assert.equal(createSearchIndex([multi]).search('поток')[0].meaning.primary, 'Река');
});
