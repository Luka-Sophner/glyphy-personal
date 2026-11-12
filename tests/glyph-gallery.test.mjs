import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
for(const file of ['db/database.ts','db/repository.ts','db/media-lifecycle.ts','db/model-validation.ts','db/GlyphRepository.ts','lib/id.ts','lib/categories.ts','types/index.ts','types/glyphs-diary.ts','features/glyphs/demo.ts','features/glyphs/search.ts','features/glyphs/routes.ts','features/glyphs/presentation.ts','features/symbols/search.ts']){
  const source=await readFile(new URL(`src/${file}`,root),'utf8'), destination=new URL(`.verification/glyph-gallery-tests/src/${file.replace(/\.ts$/,'.js')}`,root);
  await mkdir(dirname(fileURLToPath(destination)),{recursive:true});await writeFile(destination,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const modulePath=file=>new URL(`.verification/glyph-gallery-tests/src/${file}.js`,root).href;
const {GlyphyDatabase}=await import(modulePath('db/database'));
const {SymbolRepository}=await import(modulePath('db/repository'));
const {GlyphRepository}=await import(modulePath('db/GlyphRepository'));
const {seedGlyphDemo}=await import(modulePath('features/glyphs/demo'));
const {createGlyphSearchIndex}=await import(modulePath('features/glyphs/search'));
const {resolveGlyphCells}=await import(modulePath('features/glyphs/presentation'));
const {getGlyphRoute,glyphPath,glyphSymbolPath}=await import(modulePath('features/glyphs/routes'));
const {emptyGlyphCells,glyphPositions}=await import(modulePath('types/glyphs-diary'));
async function setup(t){const db=new GlyphyDatabase(`glyphy-gallery-test-${crypto.randomUUID()}`);await db.open();t.after(async()=>{db.close();await Dexie.delete(db.name);});const symbols=new SymbolRepository(db);
const now=Date.now(), meanings=[{id:'water',category:'phenomena',primary:'Вода',secondary:['Жидкость'],isPrimaryCategory:true,order:0},{id:'flow',category:'events',primary:'Течь',secondary:[],isPrimaryCategory:false,order:1},{id:'wet',category:'qualities',primary:'Мокрый',secondary:[],isPrimaryCategory:false,order:2}];
await symbols.save({id:'example',imageId:null,meanings,tags:['Природа']});await symbols.save({id:'demo-house',imageId:null,meanings:[{id:'house',category:'phenomena',primary:'Дом',secondary:[],isPrimaryCategory:true,order:0}],tags:[]});
return {db,symbols,glyphs:new GlyphRepository(db),now};}
const glyph=(text, synonyms=[],description='')=>({id:crypto.randomUUID(),primaryMeaning:text,synonyms,description,cells:emptyGlyphCells(),createdAt:'2026-11-12T00:00:00.000Z',updatedAt:'2026-11-12T00:00:00.000Z'});

test('gallery demos are disabled for ordinary databases',async t=>{const {db}=await setup(t);await seedGlyphDemo(db,false);assert.equal(await db.glyphs.count(),0);assert.equal(await db.meta.get('glyph-gallery-demo-initialized'),undefined);});
test('demo initialization is idempotent and does not mutate dictionary records',async t=>{const {db,symbols}=await setup(t),before=await symbols.list();await Promise.all([seedGlyphDemo(db,true),seedGlyphDemo(db,true)]);assert.equal(await db.glyphs.count(),7);assert.deepEqual(await symbols.list(),before);assert.equal(await db.media.count(),0);assert.equal((await new GlyphRepository(db).list())[0].primaryMeaning,'Вода');});
test('deleted demo glyphs never resurrect on reload',async t=>{const {db}=await setup(t);await seedGlyphDemo(db,true);await db.glyphs.clear();await seedGlyphDemo(db,true);assert.equal(await db.glyphs.count(),0);});
test('existing user glyphs in a test database are not supplemented or overwritten',async t=>{const {db,glyphs}=await setup(t),existing=await glyphs.create({primaryMeaning:'Мой глиф'});await seedGlyphDemo(db,true);assert.deepEqual(await glyphs.list(),[existing]);});
test('glyph search matches primary, synonyms and description with Cyrillic normalization',()=>{const water=glyph('Вода',['Жидкость'],'Течение зелёного ручья'),house=glyph('Дом',['Жильё']);const search=createGlyphSearchIndex([water,house]);for(const query of ['ВОДА','жидк','  ЗЕЛЕНОГО  РУЧЬЯ  '])assert.deepEqual(search(query).map(row=>row.id),[water.id]);assert.deepEqual(search('жилье').map(row=>row.id),[house.id]);assert.equal(search('неизвестно').length,0);assert.equal(search('').length,2);});
test('search result is not duplicated by matches in several glyph fields',()=>{const record=glyph('Вода',['Вода'],'Вода');assert.equal(createGlyphSearchIndex([record])('вода').length,1);});
test('nine real positions stay ordered and empty even with absent cells',()=>{const record=glyph('Схема');record.cells=record.cells.slice(2).reverse();const resolved=resolveGlyphCells(record,new Map());assert.deepEqual(resolved.map(item=>item.cell.position),[...glyphPositions]);assert.equal(resolved.length,9);assert.ok(resolved.every(item=>item.cell.symbolId===null&&!item.unavailable));});
test('deleted source retains its snapshot and is never returned as an available link',()=>{const record=glyph('Снимок');record.cells[4]={position:'center',symbolId:'deleted',meaningId:'water',meaningSnapshot:'Вода'};const resolved=resolveGlyphCells(record,new Map());assert.equal(resolved[4].unavailable,true);assert.equal(resolved[4].symbol,undefined);assert.equal(resolved[4].cell.meaningSnapshot,'Вода');});
test('live cell resolves to the exact persistent dictionary ID',async t=>{const {db,symbols,glyphs}=await setup(t);await seedGlyphDemo(db,true);const record=(await glyphs.list())[0],source=(await symbols.list()).find(row=>row.id==='example');const resolved=resolveGlyphCells(record,new Map([['example',source]]));assert.equal(resolved[4].symbol.id,'example');assert.equal(resolved[4].unavailable,false);});
test('modal routes distinguish gallery, editor and nested symbol, including invalid encoding',()=>{assert.equal(getGlyphRoute('/glyphs'),null);const parent=glyphPath('id');assert.equal(parent,'/glyphs/id');assert.deepEqual(getGlyphRoute(parent),{glyphId:'id',editor:false});assert.deepEqual(getGlyphRoute('/glyphs/new/edit'),{glyphId:'new',editor:true});assert.deepEqual(getGlyphRoute(glyphSymbolPath('id','example')),{glyphId:'id',symbolId:'example',editor:false});assert.equal(getGlyphRoute('/glyphs/%oops'),null);assert.equal(getGlyphRoute('/glyphs/id/symbols'),null);});
