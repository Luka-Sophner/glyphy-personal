import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { diaryPng } from './fixtures/diary-images.mjs';
const root = new URL('../', import.meta.url);
for (const file of ['db/media-storage.ts', 'db/storage-errors.ts', 'db/database.ts','db/DiaryRepository.ts','db/DiaryGroupRepository.ts','db/repository.ts','db/GlyphRepository.ts','db/media-lifecycle.ts','db/model-validation.ts','lib/id.ts','lib/categories.ts','types/index.ts','types/glyphs-diary.ts','features/diary/groups.ts','features/diary/presentation.ts','features/symbols/search.ts']) {
  const destination = new URL(`.verification/diary-groups-tests/src/${file.replace(/\.ts$/, '.js')}`, root);
  await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
  await writeFile(destination, ts.transpileModule(await readFile(new URL(`src/${file}`, root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const compiled = file => new URL(`.verification/diary-groups-tests/src/${file}.js`, root).href;
const { GlyphyDatabase, schemaV4 } = await import(compiled('db/database'));
const { DiaryRepository } = await import(compiled('db/DiaryRepository'));
const { DiaryGroupRepository } = await import(compiled('db/DiaryGroupRepository'));
const { SymbolRepository } = await import(compiled('db/repository'));
const { GlyphRepository } = await import(compiled('db/GlyphRepository'));
const { emptyGlyphCells } = await import(compiled('types/glyphs-diary'));
const { diaryGroupCover, diaryVisibleEntries, isDiaryGroupsRoute } = await import(compiled('features/diary/groups'));
const png = diaryPng(96, 192);
const photo = id => ({ id, blob: new Blob([png], { type:'image/png' }), thumbnailBlob: new Blob([png], { type:'image/png' }), mimeType:'image/png', width:96, height:192, createdAt:1 });
async function setup(t) { const db = new GlyphyDatabase('glyphy-diary-groups-test-' + crypto.randomUUID()); await db.open(); t.after(async()=>{ db.close(); await Dexie.delete(db.name); }); return { db, diary:new DiaryRepository(db), groups:new DiaryGroupRepository(db), symbols:new SymbolRepository(db), glyphs:new GlyphRepository(db) }; }
async function post(diary, title, groupId = null, date = '2026-11-12') { const image = photo(crypto.randomUUID()); return diary.create({ title, description:'Описание\nВторая строка', imageIds:[image.id], observationDate:date, groupId }, [image]); }

test('v4 to v5 preserves every old post, card, glyph snapshot and original image', async t => {
  const name='glyphy-group-migration-'+crypto.randomUUID(), old=new Dexie(name); old.version(4).stores(schemaV4); await old.open();
  const image=photo('original'), card={id:'source',imageId:image.id,meanings:[{id:'meaning',category:'phenomena',primary:'Вода',secondary:[],isPrimaryCategory:true,order:0}],tags:[],categories:['phenomena'],createdAt:1,updatedAt:2};
  const entry={id:crypto.randomUUID(),title:'Старое хайку',description:'Текст',imageIds:[image.id],observationDate:'2025-03-04',createdAt:'2025-03-04T00:00:00.000Z',updatedAt:'2025-03-04T01:00:00.000Z'};
  const cells=emptyGlyphCells().map(cell=>cell.position==='center'?{...cell,symbolId:card.id,meaningId:'meaning',meaningSnapshot:'Вода',imageIdSnapshot:image.id}:cell);
  const glyph={id:crypto.randomUUID(),primaryMeaning:'Глиф',synonyms:[],description:'',cells,imageIds:[image.id],createdAt:entry.createdAt,updatedAt:entry.updatedAt};
  await old.table('cards').put(card);await old.table('media').put(image);await old.table('diaryEntries').put(entry);await old.table('glyphs').put(glyph);old.close();
  const upgraded=new GlyphyDatabase(name);t.after(async()=>{upgraded.close();await Dexie.delete(name);});await upgraded.open();
  assert.equal(upgraded.verno,5);assert.deepEqual(await upgraded.diaryEntries.get(entry.id),entry);assert.deepEqual(await upgraded.cards.get(card.id),card);assert.deepEqual(await upgraded.glyphs.get(glyph.id),glyph);assert.equal(await upgraded.diaryGroups.count(),0);
  assert.deepEqual(Buffer.from(await (await upgraded.media.get(image.id)).blob.arrayBuffer()),png);assert.equal(await upgraded.glyphs.where('imageIds').equals(image.id).count(),1);
});
test('group create, rename and ordered persistence do not modify diary records', async t => {
  const {db,groups,diary}=await setup(t), entry=await post(diary,'Существующая запись'), a=await groups.save({title:' Правила '}), b=await groups.save({title:'Хокку'}), c=await groups.save({title:'Наблюдения'});
  assert.equal(a.title,'Правила');assert.deepEqual((await groups.list()).map(group=>group.order),[0,1,2]);
  await groups.reorder([c.id,a.id,b.id]);db.close();await db.open();assert.deepEqual((await groups.list()).map(group=>group.id),[c.id,a.id,b.id]);
  const current=(await groups.list()).find(group=>group.id===a.id), updated=await groups.save({title:'Мои правила'},a.id,{expectedUpdatedAt:current.updatedAt});assert.equal(updated.createdAt,a.createdAt);assert.equal(updated.id,a.id);assert.deepEqual(await diary.get(entry.id),entry);
});
test('invalid reorder rolls back instead of dropping unseen groups', async t => {
  const {groups}=await setup(t),a=await groups.save({title:'A'}),b=await groups.save({title:'B'}), before=await groups.list();
  await assert.rejects(groups.reorder([a.id]));await assert.rejects(groups.reorder([a.id,a.id]));await assert.rejects(groups.reorder([a.id,crypto.randomUUID()]));assert.deepEqual(await groups.list(),before);assert.equal((await groups.list())[1].id,b.id);
});
test('entry assignment moves between folders, keeps original dates/text/images, and can unassign', async t => {
  const {groups,diary}=await setup(t),a=await groups.save({title:'A'}),b=await groups.save({title:'B'}),entry=await post(diary,'Запись',a.id,'2025-01-01');
  const moved=await groups.assignEntry(entry.id,b.id);assert.equal(moved.groupId,b.id);for(const key of ['title','description','createdAt','observationDate']) assert.equal(moved[key],entry[key]);assert.deepEqual(moved.imageIds,entry.imageIds);
  const edited=await diary.update(entry.id,{title:'Изменённое название'});assert.equal(edited.groupId,b.id);
  const none=await diary.update(entry.id,{groupId:null});assert.equal(none.groupId??null,null);assert.equal(none.observationDate,entry.observationDate);
});
test('bulk assignment moves selected entries and unassigns only removed members of the target group', async t => {
  const {groups,diary}=await setup(t),a=await groups.save({title:'A'}),b=await groups.save({title:'B'}),old=await post(diary,'Снять',a.id),one=await post(diary,'Переместить',b.id),two=await post(diary,'Добавить'),untouched=await post(diary,'Оставить',b.id);
  await groups.setEntries(a.id,[one.id,two.id]);assert.equal((await diary.get(old.id)).groupId,null);assert.equal((await diary.get(one.id)).groupId,a.id);assert.equal((await diary.get(two.id)).groupId,a.id);assert.deepEqual(await diary.get(untouched.id),untouched);
  assert.deepEqual((await diary.get(one.id)).imageIds,one.imageIds);
});
test('unknown group or deleted entry prevents partial bulk changes', async t => {
  const {db,groups,diary}=await setup(t),g=await groups.save({title:'Группа'}),entry=await post(diary,'Запись',g.id), before=await diary.get(entry.id), groupBefore=(await groups.list())[0];
  await assert.rejects(groups.setEntries(g.id,[entry.id,crypto.randomUUID()]));assert.deepEqual(await diary.get(entry.id),before);assert.deepEqual((await groups.list())[0],groupBefore);
  await assert.rejects(diary.create({title:'Не создать',groupId:crypto.randomUUID(),imageIds:['new']},[photo('new')]));assert.equal(await db.media.get('new'),undefined);assert.equal(await db.diaryEntries.count(),1);
});
test('deleting a group leaves posts unassigned and keeps photos, cards, glyphs and other groups', async t => {
  const {db,groups,diary,symbols,glyphs}=await setup(t),a=await groups.save({title:'Удалить'}),b=await groups.save({title:'Оставить'}),entry=await post(diary,'Запись',a.id),other=await post(diary,'Другая',b.id);
  const card=await symbols.save({imageId:entry.imageIds[0],meanings:[{id:'meaning',category:'phenomena',primary:'Вода',secondary:[],isPrimaryCategory:true,order:0}],tags:[]});
  const glyph=await glyphs.save({primaryMeaning:'Глиф',cells:emptyGlyphCells().map(cell=>cell.position==='center'?{...cell,symbolId:card.id,meaningId:'meaning',meaningSnapshot:'Вода'}:cell)}), count=await db.media.count();
  await groups.delete(a.id);const unassigned=await diary.get(entry.id);assert.equal(unassigned.groupId,null);assert.deepEqual(unassigned.imageIds,entry.imageIds);assert.equal(unassigned.description,entry.description);assert.equal(unassigned.createdAt,entry.createdAt);assert.equal(unassigned.observationDate,entry.observationDate);
  assert.equal(await db.media.count(),count);assert.deepEqual(await diary.get(other.id),other);assert.ok(await symbols.get(card.id));assert.ok(await glyphs.get(glyph.id));assert.deepEqual((await groups.list()).map(group=>group.id),[b.id]);await groups.delete(a.id);assert.equal(await db.diaryEntries.count(),2);
});
test('cover is chosen from group posts, pinned explicitly and falls back if its post disappears', async t => {
  const {groups,diary}=await setup(t),g=await groups.save({title:'Обложка'}),old=await post(diary,'Старая',g.id,'2025-01-01'),newer=await post(diary,'Новая',g.id,'2026-01-01'),outside=await post(diary,'Вне группы');
  assert.equal(diaryGroupCover(g,[old,newer,outside]),newer.imageIds[0]);const pinned=await groups.save({title:g.title,coverEntryId:old.id},g.id);assert.equal(diaryGroupCover(pinned,[old,newer,outside]),old.imageIds[0]);
  const renamed=await groups.save({title:'Переименовано'},g.id);assert.equal(renamed.coverEntryId,old.id);await assert.rejects(groups.save({title:'Нельзя',coverEntryId:outside.id},g.id));
  await diary.delete(old.id);assert.equal(diaryGroupCover(pinned,[newer,outside]),newer.imageIds[0]);assert.equal(diaryGroupCover({...g,id:crypto.randomUUID()},[outside]),undefined);
});
test('stale group edits are rejected and the diary snapshot exposes saved groups', async t => {
  const {groups,diary}=await setup(t),g=await groups.save({title:'Первое'});await groups.save({title:'Другое'},g.id,{expectedUpdatedAt:g.updatedAt});await assert.rejects(groups.save({title:'Устаревшее'},g.id,{expectedUpdatedAt:g.updatedAt}));assert.equal((await diary.snapshot()).groups[0].title,'Другое');
});
test('without groups the full feed is unchanged; groups retain the full feed by default with accessible full/unassigned views', () => {
  const g={id:'group',title:'Группа',coverEntryId:null,order:0,createdAt:'2026-01-01',updatedAt:'2026-01-01'},matches=[{id:'new',groupId:'group'},{id:'none'},{id:'other',groupId:'elsewhere'}];
  assert.equal(diaryVisibleEntries(matches,[],null,false,false).length,3);assert.deepEqual(diaryVisibleEntries(matches,[g],null,false,false).map(entry=>entry.id),['new','none','other']);assert.equal(diaryVisibleEntries(matches,[g],null,true,false).length,3);assert.equal(diaryVisibleEntries(matches,[g],null,false,true).length,3);assert.deepEqual(diaryVisibleEntries(matches,[g],'unassigned',false,false).map(entry=>entry.id),['none']);assert.deepEqual(diaryVisibleEntries(matches,[g],g.id,false,false).map(entry=>entry.id),['new']);assert.equal(isDiaryGroupsRoute('/diary/groups'),true);assert.equal(isDiaryGroupsRoute('/diary/new/edit'),false);
  const dated=[{id:'recent-observation',createdAt:'2025-01-01T00:00:00.000Z'},{id:'last-created',createdAt:'2026-01-01T00:00:00.000Z'}];assert.deepEqual(diaryVisibleEntries(dated,[g],null,false,false),dated);
});

test('custom group covers persist, appear in snapshots and clean up only unreferenced media', async t => {
  const {db,groups,diary}=await setup(t), image=photo('custom-cover');
  const g=await groups.save({title:'Custom',coverImageId:image.id},undefined,{},image);
  db.close(); await db.open();
  assert.equal(diaryGroupCover((await groups.list())[0],[]),image.id);
  assert.equal((await diary.snapshot()).media[0].id,image.id);
  const entry=await diary.create({title:'Shared',imageIds:[image.id]});
  await diary.delete(entry.id); assert.ok(await db.media.get(image.id));
  const replacement=photo('replacement-cover');
  await groups.save({title:g.title,coverImageId:replacement.id},g.id,{},replacement);
  assert.equal(await db.media.get(image.id),undefined);
  await groups.delete(g.id); assert.equal(await db.media.get(replacement.id),undefined);
});
test('invalid and stale custom cover saves roll back without orphan media', async t => {
  const {db,groups}=await setup(t), g=await groups.save({title:'Group'}), image=photo('rejected');
  await assert.rejects(groups.save({title:'Missing',coverImageId:'missing'},g.id));
  await assert.rejects(groups.save({title:'Mismatch',coverImageId:'other'},g.id,{},image));
  await groups.save({title:'Renamed'},g.id);
  await assert.rejects(groups.save({title:'Stale',coverImageId:image.id},g.id,{expectedUpdatedAt:g.updatedAt},image));
  assert.equal(await db.media.count(),0);
});
