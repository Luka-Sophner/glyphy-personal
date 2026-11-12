import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const root = new URL('../', import.meta.url);
for (const file of ['features/glyphs/editor.ts','features/symbols/search.ts','db/database.ts','db/repository.ts','db/media-lifecycle.ts','db/model-validation.ts','db/GlyphRepository.ts','db/DiaryRepository.ts','lib/id.ts','lib/categories.ts','types/index.ts','types/glyphs-diary.ts','features/transfer/archive.ts','features/transfer/modules.ts','features/diary/media-policy.ts','features/transfer/image-header.ts','features/transfer/zip-safety.ts','features/transfer/known-demo-svg.ts']) {
  const source = await readFile(new URL(`src/${file}`, root), 'utf8');
  const destination = new URL(`.verification/glyphs-diary-tests/src/${file.replace(/\.ts$/, '.js')}`, root);
  await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
  await writeFile(destination, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const compiled = file => new URL(`.verification/glyphs-diary-tests/src/${file}.js`, root).href;
const { GlyphyDatabase, schemaV2 } = await import(compiled('db/database'));
const { SymbolRepository } = await import(compiled('db/repository'));
const { GlyphRepository } = await import(compiled('db/GlyphRepository'));
const { DiaryRepository } = await import(compiled('db/DiaryRepository'));
const { emptyGlyphCells, glyphPositionCategories } = await import(compiled('types/glyphs-diary'));
const { localDate, validateLocalDate } = await import(compiled('db/model-validation'));
const { exportArchive, prepareImport, applyImport } = await import(compiled('features/transfer/archive'));
const png = await readFile(new URL('public/icons/icon-192.png', root));
const secondPng = await readFile(new URL('public/icons/icon-512.png', root));
const photo = (id, large = false) => ({ id, blob: new Blob([large ? secondPng : png], { type: 'image/png' }), thumbnailBlob: new Blob([png], { type: 'image/png' }), mimeType: 'image/png', width: large ? 512 : 192, height: large ? 512 : 192, createdAt: 100 });
const group = (category = 'phenomena', primary = 'Вода') => ({ id: `meaning-${category}`, category, primary, secondary: ['Жидкость'], isPrimaryCategory: true, order: 0 });
const symbolDraft = (category = 'phenomena') => ({ imageId: null, meanings: [group(category)], tags: ['Природа'] });
async function setup(t) {
  const db = new GlyphyDatabase(`glyphy-new-modules-test-${crypto.randomUUID()}`); await db.open();
  t.after(async () => { db.close(); await Dexie.delete(db.name); });
  return { db, symbols: new SymbolRepository(db), glyphs: new GlyphRepository(db), diary: new DiaryRepository(db) };
}
const selected = (symbol, position = 'center', snapshot = '') => emptyGlyphCells().map(cell => cell.position === position ? { ...cell, symbolId: symbol.id, meaningId: symbol.meanings[0].id, meaningSnapshot: snapshot } : cell);

test('v2 to v5 is additive and preserves dictionary records, timestamps, meta and original/thumbnail bytes', async t => {
  const name = `glyphy-v2-migration-test-${crypto.randomUUID()}`, old = new Dexie(name); old.version(2).stores(schemaV2); await old.open();
  const card = { ...symbolDraft(), id: 'legacy-card', imageId: 'original', categories:['phenomena'], createdAt: 100, updatedAt: 200 };
  await old.table('cards').add(card); await old.table('media').add(photo('original')); await old.table('meta').put({key:'demo-initialized',value:true}); old.close();
  const upgraded = new GlyphyDatabase(name); t.after(async()=>{upgraded.close();await Dexie.delete(name);});await upgraded.open();
  assert.equal(upgraded.verno,5);assert.deepEqual(await upgraded.cards.get(card.id),card);
  assert.deepEqual(Buffer.from(await (await upgraded.media.get('original')).blob.arrayBuffer()),png);
  assert.deepEqual(Buffer.from(await (await upgraded.media.get('original')).thumbnailBlob.arrayBuffer()),png);
  assert.equal((await upgraded.meta.get('demo-initialized')).value,true);assert.equal(await upgraded.glyphs.count(),0);assert.equal(await upgraded.diaryEntries.count(),0);
});
test('glyph CRUD has nine cells, UUID and ISO times and never embeds a dictionary card',async t=>{
  const {glyphs,db}=await setup(t), record=await glyphs.create({primaryMeaning:' Вода ',synonyms:['жидкость',' ЖИДКОСТЬ ','ручей'],description:' Смысл '});
  assert.match(record.id,/^[0-9a-f-]{36}$/);assert.equal(record.cells.length,9);assert.equal(record.primaryMeaning,'Вода');assert.deepEqual(record.synonyms,['жидкость','ручей']);assert.equal(new Date(record.createdAt).toISOString(),record.createdAt);
  const changed=await glyphs.update(record.id,{description:'Иное описание'},{expectedUpdatedAt:record.updatedAt});
  assert.equal(changed.createdAt,record.createdAt);assert.ok(changed.updatedAt>record.updatedAt);assert.equal((await glyphs.list()).length,1);
  assert.equal(await db.cards.count(),0);assert.equal(await db.media.count(),0);await glyphs.delete(record.id);assert.equal(await glyphs.get(record.id),undefined);
});
test('all seven semantic positions accept only their matching dictionary category',async t=>{
  const {glyphs,symbols}=await setup(t);
  for(const [position,category] of Object.entries(glyphPositionCategories)){
    const symbol=await symbols.save(symbolDraft(category)), glyph=await glyphs.create({primaryMeaning:position,cells:selected(symbol,position)});
    const cell=glyph.cells.find(cell=>cell.position===position);assert.equal(cell.symbolId,symbol.id);assert.equal(cell.meaningId,symbol.meanings[0].id);assert.equal(cell.meaningSnapshot,'Вода');
    assert.deepEqual(Object.keys(cell).sort(),['imageIdSnapshot','meaningId','meaningSnapshot','position','symbolId']);
  }
  const water=await symbols.save(symbolDraft());await assert.rejects(glyphs.create({primaryMeaning:'Ошибка',cells:selected(water,'topCenter')}),/позиции/);
});
test('secondary reading snapshot survives symbol edits, group removal and deletion',async t=>{
  const {glyphs,symbols}=await setup(t), water=await symbols.save(symbolDraft());
  const glyph=await glyphs.create({primaryMeaning:'Снимок',cells:selected(water,'center','Жидкость')});
  await symbols.save({...water,expectedUpdatedAt:water.updatedAt,meanings:[{...water.meanings[0],id:'changed-group',primary:'Озеро',secondary:[]}]});
  const changed=await glyphs.update(glyph.id,{description:'После правки словаря'});assert.equal(changed.cells.find(cell=>cell.position==='center').meaningSnapshot,'Жидкость');
  await symbols.delete(water.id);const final=await glyphs.update(glyph.id,{primaryMeaning:'Историческое прочтение'});assert.equal(final.cells.find(cell=>cell.position==='center').symbolId,water.id);assert.equal(final.cells.find(cell=>cell.position==='center').meaningSnapshot,'Жидкость');
});
test('invalid glyphs, missing references and fabricated snapshots do not write partial data',async t=>{
  const {glyphs,symbols,db}=await setup(t), water=await symbols.save(symbolDraft());
  await assert.rejects(glyphs.create({primaryMeaning:' '}));
  await assert.rejects(glyphs.create({primaryMeaning:'Ошибка',cells:emptyGlyphCells().slice(1)}));
  const duplicate=emptyGlyphCells();duplicate[0]=duplicate[1];await assert.rejects(glyphs.create({primaryMeaning:'Ошибка',cells:duplicate}));
  await assert.rejects(glyphs.create({primaryMeaning:'Ошибка',cells:selected(water,'center','Придуманное значение')}));
  await symbols.delete(water.id);await assert.rejects(glyphs.create({primaryMeaning:'Ошибка',cells:selected(water)}));assert.equal(await db.glyphs.count(),0);
});
test('special cells hold numbering/reference data without new dictionary categories',async t=>{
  const {glyphs}=await setup(t), cells=emptyGlyphCells();cells[0].referenceValue={kind:'local-number',value:1};cells[8].referenceValue={kind:'local-reference',value:1,targetGlyphId:crypto.randomUUID()};
  const glyph=await glyphs.create({primaryMeaning:'Нумерация',cells});assert.deepEqual(glyph.cells[0].referenceValue,{kind:'local-number',value:1});assert.equal(glyph.cells[8].symbolId,null);
  cells[4].referenceValue={kind:'local-number',value:2};await assert.rejects(glyphs.create({primaryMeaning:'Ошибка',cells}));
});
test('glyph optimistic revision rejects stale writes',async t=>{
  const {glyphs}=await setup(t), old=await glyphs.create({primaryMeaning:'Один'});await glyphs.update(old.id,{primaryMeaning:'Два'});
  await assert.rejects(glyphs.update(old.id,{primaryMeaning:'Три'},{expectedUpdatedAt:old.updatedAt}),/изменена/);assert.equal((await glyphs.get(old.id)).primaryMeaning,'Два');
});
test('diary CRUD preserves image order, creation time and observation date on edits',async t=>{
  const {diary,db}=await setup(t), first=await diary.create({title:' Луч ',imageIds:['one','two'],observationDate:'2026-11-11'},[photo('one'),photo('two',true)]);
  assert.equal(first.description,'');assert.match(first.id,/^[0-9a-f-]{36}$/);assert.deepEqual(first.imageIds,['one','two']);
  const edited=await diary.update(first.id,{title:'Солнечный луч',imageIds:['two','one']},[],{expectedUpdatedAt:first.updatedAt});
  assert.equal(edited.createdAt,first.createdAt);assert.equal(edited.observationDate,'2026-11-11');assert.ok(edited.updatedAt>first.updatedAt);assert.equal(edited.imageIds[0],'two');assert.equal((await diary.byDate('2026-11-11')).length,1);
  await diary.delete(first.id);assert.equal((await diary.list()).length,0);assert.equal(await db.media.count(),0);
});
test('local observation date uses device calendar and rejects impossible dates',async t=>{
  assert.equal(localDate({getFullYear:()=>2026,getMonth:()=>10,getDate:()=>12}),'2026-11-12');
  assert.equal(validateLocalDate('2024-02-29'),'2024-02-29');for(const value of ['2026-02-29','2026-02-30','2026-13-01','0000-01-01','12/11/2026'])assert.throws(()=>validateLocalDate(value));
  const {diary}=await setup(t), entry=await diary.create({title:'Сегодня',imageIds:['today']},[photo('today')]);assert.equal(entry.observationDate,localDate());assert.equal(entry.createdAt,entry.updatedAt);
});
test('empty title, empty/duplicate/missing images fail atomically',async t=>{
  const {diary,db}=await setup(t);
  await assert.rejects(diary.create({title:' ',imageIds:['p']},[photo('p')]));
  await assert.rejects(diary.create({title:'Запись',imageIds:[]}));
  await assert.rejects(diary.create({title:'Запись',imageIds:['p','p']},[photo('p')]));
  await assert.rejects(diary.create({title:'Запись',imageIds:['p','missing']},[photo('p')]));
  assert.equal(await db.diaryEntries.count(),0);assert.equal(await db.media.count(),0);
});
test('failed diary write rolls back all newly inserted media',async t=>{
  const {diary,db}=await setup(t);db.diaryEntries.hook('creating',()=>{throw Error('forced diary failure');});
  await assert.rejects(diary.create({title:'Запись',imageIds:['p']},[photo('p')]),/forced diary failure/);assert.equal(await db.media.count(),0);
});
test('shared diary media survives symbol deletion until its last reference is removed',async t=>{
  const {diary,symbols,db}=await setup(t), symbol=await symbols.save(symbolDraft(),photo('shared'));
  const entry=await diary.create({title:'Наблюдение',imageIds:['shared']});await symbols.delete(symbol.id);assert.ok(await db.media.get('shared'));
  await diary.delete(entry.id);assert.equal(await db.media.get('shared'),undefined);
});
test('symbol photo survives diary deletion and diary edits collect only unused images',async t=>{
  const {diary,symbols,db}=await setup(t);await symbols.save(symbolDraft(),photo('shared'));
  const entry=await diary.create({title:'Наблюдение',imageIds:['shared','private']},[photo('private')]);
  await diary.update(entry.id,{imageIds:['shared']});assert.equal(await db.media.get('private'),undefined);await diary.delete(entry.id);assert.ok(await db.media.get('shared'));
});
test('diary revisions reject stale edits and cannot overwrite shared media in place',async t=>{
  const {diary,db}=await setup(t), entry=await diary.create({title:'Раз',imageIds:['p']},[photo('p')]);await diary.update(entry.id,{title:'Два'});
  await assert.rejects(diary.update(entry.id,{title:'Три'},[],{expectedUpdatedAt:entry.updatedAt}),/изменена/);
  await assert.rejects(diary.update(entry.id,{title:'Ошибка'},[photo('p',true)]));assert.equal((await diary.get(entry.id)).title,'Два');assert.equal((await db.media.get('p')).width,192);
});
test('both new modules and their Blobs survive close/reopen',async t=>{
  const {glyphs,diary,db}=await setup(t), glyph=await glyphs.create({primaryMeaning:'Глиф'}), entry=await diary.create({title:'Запись',imageIds:['persisted']},[photo('persisted')]);
  const name=db.name;db.close();const reopened=new GlyphyDatabase(name);t.after(()=>reopened.close());await reopened.open();
  assert.deepEqual(await new GlyphRepository(reopened).get(glyph.id),glyph);assert.deepEqual(await new DiaryRepository(reopened).get(entry.id),entry);assert.deepEqual(Buffer.from(await (await reopened.media.get('persisted')).blob.arrayBuffer()),png);reopened.close();
});
test('dictionary-only replacement preserves glyph snapshots, diary entries and their conflicting media',async t=>{
  const source=await setup(t), target=await setup(t);await source.symbols.save(symbolDraft(),photo('same-id'));
  const oldSymbol=await target.symbols.save(symbolDraft(),photo('same-id',true));
  const glyph=await target.glyphs.create({primaryMeaning:'Прочтение',cells:selected(oldSymbol)}), entry=await target.diary.create({title:'Дневник',imageIds:['same-id']});
  const prepared=await prepareImport((await exportArchive(source.db)).bytes);await applyImport(target.db,prepared,'replace',true);
  assert.deepEqual(await target.glyphs.get(glyph.id),glyph);assert.deepEqual(await target.diary.get(entry.id),entry);assert.deepEqual(Buffer.from(await (await target.db.media.get('same-id')).blob.arrayBuffer()),secondPng);
  assert.equal(await target.symbols.get(oldSymbol.id),undefined);const imported=(await target.symbols.list())[0];assert.notEqual(imported.imageId,'same-id');assert.deepEqual(Buffer.from(await (await target.db.media.get(imported.imageId)).blob.arrayBuffer()),png);
});
test('dictionary snapshot stays scoped while full ZIP includes diary originals',async t=>{
  const {symbols,diary,db}=await setup(t);await symbols.save(symbolDraft(),photo('dictionary'));await diary.create({title:'Отдельно',imageIds:['diary']},[photo('diary',true)]);
  assert.deepEqual((await symbols.snapshot()).media.map(media=>media.id),['dictionary']);const archive=await exportArchive(db);assert.equal(archive.manifest.media.length,2);assert.deepEqual(archive.manifest.media.map(m=>m.id).sort(),['diary','dictionary']);
});
test('UUID fallback is RFC 4122 v4 on plain HTTP without randomUUID',async()=>{
  const source=await readFile(new URL('src/lib/id.ts',root),'utf8'), compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const context={exports:{},crypto:{getRandomValues:bytes=>{bytes.fill(255);return bytes;}}};vm.runInNewContext(compiled,context);assert.match(context.exports.createId(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

const { validateGlyphInput, replaceGlyphCell, addSynonyms, createPickerIndex } = await import(compiled('features/glyphs/editor'));
test('constructor saves three category readings of one card, all nine cells, and survives reopen', async t => {
  const {db,symbols,glyphs}=await setup(t);
  const card=await symbols.save({imageId:null,meanings:[{...group('phenomena','Вода'),isPrimaryCategory:true},{...group('events','Течь'),isPrimaryCategory:false},{...group('qualities','Мокрый'),isPrimaryCategory:false}],tags:['Дождь']},photo('glyph-original'));
  const cells=emptyGlyphCells().map(cell=>{ const category=glyphPositionCategories[cell.position], meaning=card.meanings.find(g=>g.category===category);return meaning?{...cell,symbolId:card.id,meaningId:meaning.id,meaningSnapshot:meaning.primary}:cell;});
  const input={primaryMeaning:'Вода после дождя',synonyms:['Последняя капля'],description:'Описание',cells};validateGlyphInput(input);
  const saved=await glyphs.save(input);assert.equal(saved.cells.length,9);assert.equal(saved.cells.filter(cell=>cell.symbolId===card.id).length,3);assert.deepEqual(saved.imageIds,['glyph-original']);
  db.close();await db.open();assert.deepEqual(await glyphs.get(saved.id),saved);assert.equal((await glyphs.get(saved.id)).cells.find(cell=>cell.position==='topRight').meaningSnapshot,'Течь');assert.equal(await db.cards.count(),1);
});
test('constructor replacement and clearing affect only selected cells; editing retains UUID and dates',async t=>{
  const {symbols,glyphs}=await setup(t), first=await symbols.save(symbolDraft()), second=await symbols.save({...symbolDraft(),meanings:[group('phenomena','Дом')]});
  const original=await glyphs.save({primaryMeaning:'Глиф',cells:selected(first)});
  let cells=replaceGlyphCell(original.cells,{position:'center',symbolId:second.id,meaningId:second.meanings[0].id,meaningSnapshot:'Дом'});
  cells=replaceGlyphCell(cells,{position:'topLeft',symbolId:null,meaningId:null,meaningSnapshot:'',referenceValue:{kind:'local-number',value:12}});
  const edited=await glyphs.save({primaryMeaning:'Изменённый',cells,synonyms:['Схема'],description:'Текст'},original.id,{expectedUpdatedAt:original.updatedAt});
  assert.equal(edited.id,original.id);assert.equal(edited.createdAt,original.createdAt);assert.ok(edited.updatedAt>original.updatedAt);assert.equal(edited.cells.find(c=>c.position==='center').symbolId,second.id);
  const cleared=replaceGlyphCell(edited.cells,{position:'topLeft',symbolId:null,meaningId:null,meaningSnapshot:''});assert.equal(cleared.find(c=>c.position==='topLeft').referenceValue,undefined);assert.deepEqual(cleared.find(c=>c.position==='center'),edited.cells.find(c=>c.position==='center'));
  await glyphs.save({primaryMeaning:'Финал',cells:cleared},edited.id);await glyphs.delete(edited.id);assert.equal((await glyphs.list()).length,0);assert.equal((await symbols.list()).length,2);
});
test('constructor refuses missing title, no semantic selection, and fake categories before writing',async t=>{
  const {symbols,glyphs}=await setup(t), symbol=await symbols.save(symbolDraft());
  assert.throws(()=>validateGlyphInput({primaryMeaning:' ',cells:selected(symbol)}),/значение/);
  assert.throws(()=>validateGlyphInput({primaryMeaning:'Только номер',cells:emptyGlyphCells()}),/смысловой/);
  await assert.rejects(glyphs.save({primaryMeaning:'Пусто',cells:emptyGlyphCells()}),/смысловой/);
  await assert.rejects(glyphs.save({primaryMeaning:'Ошибка категории',cells:selected(symbol,'topCenter')}),/позиции/);assert.equal((await glyphs.list()).length,0);
});
test('picker indexes matching category groups only, secondary values and tags; supports е/ё and Cyrillic',()=>{
  const multi={id:'same',meanings:[group('phenomena','Вода'),{...group('events','Течь'),secondary:['Льётся']}],tags:['ДОЖДЬ']};
  const events=createPickerIndex([multi],'events'),phenomena=createPickerIndex([multi],'phenomena');assert.equal(events('  ЛЬЕТ  ').length,1);assert.equal(events('теч')[0].group.primary,'Течь');assert.equal(events('дождь').length,1);assert.equal(events('вода').length,0);assert.equal(phenomena('течь').length,0);assert.equal(phenomena('ЖИДКОСТЬ').length,1);
});
test('synonym Enter/comma handling trims and deduplicates alternative readings',()=>{assert.deepEqual(addSynonyms(['Капля'],' , капля, Дождь, дождь, Лёд, лед '),['Капля','Дождь','Лёд']);});
test('media snapshots survive replacement/deletion of source and restart, with safe reference counting',async t=>{
  const {db,symbols,glyphs}=await setup(t), card=await symbols.save(symbolDraft(),photo('snapshot-photo'));
  const one=await glyphs.save({primaryMeaning:'Один',cells:selected(card)}),two=await glyphs.save({primaryMeaning:'Два',cells:selected(card)});
  await symbols.save({...card,meanings:card.meanings.map(g=>({...g,primary:'Изменено'}))},photo('new-photo',true));assert.ok(await db.media.get('snapshot-photo'));
  await symbols.delete(card.id);db.close();await db.open();assert.equal(await db.cards.count(),0);assert.ok(await db.media.get('snapshot-photo'));assert.equal(await db.media.get('new-photo'),undefined);
  const loaded=await glyphs.get(one.id);assert.equal(loaded.cells.find(c=>c.position==='center').meaningSnapshot,'Вода');assert.equal(loaded.cells.find(c=>c.position==='center').imageIdSnapshot,'snapshot-photo');
  assert.deepEqual(Buffer.from(await (await db.media.get('snapshot-photo')).blob.arrayBuffer()),png);
  await glyphs.save({...loaded,description:'Старое прочтение'},one.id);await glyphs.delete(one.id);assert.ok(await db.media.get('snapshot-photo'));await glyphs.delete(two.id);assert.equal(await db.media.get('snapshot-photo'),undefined);
});
test('v3 to v4 backfills media references without changing readings, IDs or dictionary bytes',async t=>{
  const name='glyphy-v3-'+crypto.randomUUID(), old=new Dexie(name);const {schemaV3}=await import(compiled('db/database'));old.version(3).stores(schemaV3);await old.open();
  const card={...symbolDraft(),id:'legacy-symbol',imageId:'legacy-image',categories:['phenomena'],createdAt:1,updatedAt:2};await old.table('cards').add(card);await old.table('media').add(photo('legacy-image'));
  const record={id:crypto.randomUUID(),primaryMeaning:'Старый',synonyms:[],description:'',cells:selected(card),createdAt:'2026-11-11T00:00:00.000Z',updatedAt:'2026-11-11T00:00:00.000Z'};await old.table('glyphs').add(record);old.close();
  const upgraded=new GlyphyDatabase(name);t.after(async()=>{upgraded.close();await Dexie.delete(name);});await upgraded.open();const migrated=await upgraded.glyphs.get(record.id);assert.deepEqual(migrated.imageIds,['legacy-image']);assert.equal(migrated.cells.find(c=>c.position==='center').imageIdSnapshot,'legacy-image');assert.equal(migrated.cells.find(c=>c.position==='center').meaningSnapshot,record.cells.find(c=>c.position==='center').meaningSnapshot);assert.equal(migrated.updatedAt,record.updatedAt);assert.deepEqual(await upgraded.cards.get(card.id),card);
  await new SymbolRepository(upgraded).delete(card.id);assert.ok(await upgraded.media.get('legacy-image'));
});
test('dictionary replacement retains glyph-only original media even with conflicting import ID',async t=>{
  const {db,symbols,glyphs}=await setup(t);const card=await symbols.save(symbolDraft(),photo('shared-import-id'));const glyph=await glyphs.save({primaryMeaning:'Исторический',cells:selected(card)});
  const isolated=new GlyphyDatabase('glyphy-import-source-'+crypto.randomUUID());t.after(async()=>{isolated.close();await Dexie.delete(isolated.name);});await isolated.open();await new SymbolRepository(isolated).save(symbolDraft(),photo('shared-import-id',true));
  const archive=await exportArchive(isolated),prepared=await prepareImport(archive.bytes);await applyImport(db,prepared,'replace',true);assert.ok(await db.media.get('shared-import-id'));assert.equal((await glyphs.get(glyph.id)).cells.find(c=>c.position==='center').imageIdSnapshot,'shared-import-id');const replacement=(await symbols.list())[0];assert.notEqual(replacement.imageId,'shared-import-id');assert.deepEqual(Buffer.from(await (await db.media.get('shared-import-id')).blob.arrayBuffer()),png);
});

test('replacing the last retained cell collects only its obsolete media and ignores forged image snapshots', async t=>{
 const {db,symbols,glyphs}=await setup(t),old=await symbols.save(symbolDraft(),photo('old-retained')),next=await symbols.save({...symbolDraft(),meanings:[group('phenomena','Дом')]},photo('next-retained',true));
 const glyph=await glyphs.save({primaryMeaning:'Глиф',cells:selected(old)});await symbols.delete(old.id);
 const cells=selected(next).map(cell=>cell.symbolId?{...cell,imageIdSnapshot:'forged'}:cell);const changed=await glyphs.save({primaryMeaning:'Дом',cells},glyph.id);
 assert.deepEqual(changed.imageIds,['next-retained']);assert.equal(await db.media.get('old-retained'),undefined);assert.ok(await db.media.get('next-retained'));await glyphs.delete(glyph.id);assert.ok(await db.media.get('next-retained'));assert.ok(await symbols.get(next.id));
});
