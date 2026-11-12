import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=await readFile(new URL('../src/lib/home-navigation.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {isHomeReturn}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('return from every full page restarts Home entrance',()=>{
  for(const pathname of ['/settings','/dictionary','/glyphs','/diary','/category/phenomena']) assert.equal(isHomeReturn({pathname},{pathname:'/'}),true);
});
test('closing or switching modals over Home never restarts launch',()=>{
  for(const pathname of ['/cards/example','/cards/example/edit','/cards/new/edit']) {
    assert.equal(isHomeReturn({pathname,state:{backgroundPath:'/'}},{pathname:'/'}),false);
    assert.equal(isHomeReturn({pathname:'/'},{pathname,state:{backgroundPath:'/'}}),false);
  }
});
test('opening and closing the menu is not a new Home visit',()=>{
  assert.equal(isHomeReturn({pathname:'/menu'},{pathname:'/'}),false);
  assert.equal(isHomeReturn({pathname:'/'},{pathname:'/menu'}),false);
});
test('return from a modal belonging to another page is a real Home return',()=>{
  assert.equal(isHomeReturn({pathname:'/cards/example',state:{backgroundPath:'/category/phenomena'}},{pathname:'/'}),true);
});

test('glyph popup and nested source are not new Home visits',()=>{
  assert.equal(isHomeReturn({pathname:'/glyphs/id'},{pathname:'/glyphs/id/symbols/example'}),false);
  assert.equal(isHomeReturn({pathname:'/glyphs/id/symbols/example'},{pathname:'/glyphs/id'}),false);
  assert.equal(isHomeReturn({pathname:'/glyphs/id/symbols/example'},{pathname:'/'}),true);
});
