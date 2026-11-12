import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, readdir } from 'node:fs/promises';
import { serviceWorkerSource } from '../scripts/pwa.mjs';

function worker({failInstall=false, names=[]}={}) {
  const events=new Map(), stores=new Map(names.map(name=>[name,new Map()]));
  const scope='https://glyphy.test/app/', shell=new Response('<html>offline-shell</html>');
  const state={claimed:0,skipped:0,fetches:0};
  const caches={
    async open(name){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {
      async addAll(urls){for(const url of urls){if(failInstall)throw Error('missing static asset');store.set(url,url.endsWith('index.html')?shell.clone():new Response('static-asset'));}},
      async match(url){return store.get(String(url))?.clone();},
    };},
    async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);},
    async match(url){for(const store of stores.values())if(store.has(url))return store.get(url).clone();},
  };
  const self={registration:{scope},location:{origin:'https://glyphy.test'},clients:{async claim(){state.claimed++;}},skipWaiting(){state.skipped++;},addEventListener(name,handler){events.set(name,handler);}};
  vm.runInNewContext(serviceWorkerSource('test',['index.html','assets/app.js','assets/archive.js','manifest.webmanifest']),{self,caches,URL,fetch:async()=>{state.fetches++;throw Error('network offline');}});
  return {events,stores,state,scope,async dispatch(name,data={}){let wait,response;events.get(name)({...data,waitUntil(p){wait=p;},respondWith(p){response=p;}});await wait;return response;}};
}
test('install precaches the full shell and lazy ZIP code; no forced update activation',async()=>{
  const w=worker();await w.dispatch('install');assert.equal(w.stores.get('glyphy-static-test').size,4);assert.equal(w.state.skipped,0);
});
test('offline navigation and static chunks work under a deployment subpath',async()=>{
  const w=worker();await w.dispatch('install');await w.dispatch('activate');
  const shell=await w.dispatch('fetch',{request:{method:'GET',mode:'navigate',url:w.scope+'?demo=1#/settings'}});
  assert.match(await shell.text(),/offline-shell/);
  const lazy=await w.dispatch('fetch',{request:{method:'GET',mode:'cors',url:w.scope+'assets/archive.js'}});
  assert.equal(await lazy.text(),'static-asset');assert.equal(w.state.fetches,0);assert.equal(w.state.claimed,1);
});
test('worker does not intercept writes, external URLs or unlisted user media',async()=>{
  const w=worker();await w.dispatch('install');
  for(const request of [{method:'POST',mode:'cors',url:w.scope},{method:'GET',mode:'cors',url:'https://other.test/file'},{method:'GET',mode:'cors',url:w.scope+'media/user-photo.jpg'}])assert.equal(await w.dispatch('fetch',{request}),undefined);
});
test('update is activated only after the explicit application message',async()=>{
  const w=worker();await w.dispatch('message',{data:{type:'unknown'}});assert.equal(w.state.skipped,0);
  await w.dispatch('message',{data:{type:'ACTIVATE_UPDATE'}});assert.equal(w.state.skipped,1);
});
test('cache cleanup preserves unrelated caches and recent older application versions',async()=>{
  const w=worker({names:['other-app','glyphy-static-old1','glyphy-static-old2','glyphy-static-old3']});await w.dispatch('install');await w.dispatch('activate');
  assert.equal(w.stores.has('other-app'),true);assert.equal(w.stores.has('glyphy-static-old1'),false);assert.equal(w.stores.has('glyphy-static-old3'),true);
});
test('failed precache rejects installation and removes only its incomplete cache',async()=>{
  const w=worker({failInstall:true,names:['glyphy-static-working']});await assert.rejects(w.dispatch('install'),/missing static asset/);assert.equal(w.stores.has('glyphy-static-test'),false);assert.equal(w.stores.has('glyphy-static-working'),true);
});
test('manifest and local PNG icons meet installability dimensions',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./#/');
  for(const icon of manifest.icons){const bytes=await readFile(new URL(`../public/${icon.src}`,import.meta.url));assert.equal(bytes.readUInt32BE(16),Number(icon.sizes.split('x')[0]));assert.equal(bytes.readUInt32BE(20),Number(icon.sizes.split('x')[1]));}
});
test('production worker precaches every emitted code and style chunk',async()=>{
  const source=await readFile(new URL('../dist/sw.js',import.meta.url),'utf8');
  for(const name of await readdir(new URL('../dist/assets/',import.meta.url)))if(/\.(js|css)$/.test(name))assert.ok(source.includes(`assets/${name}`),name);
  assert.equal(source.includes('indexedDB'),false);
});

test('already-open older tabs can load their cached lazy chunks after an update',async()=>{
  const w=worker({names:['glyphy-static-previous']});
  w.stores.get('glyphy-static-previous').set(w.scope+'assets/archive-old.js',new Response('older-safe-chunk'));
  await w.dispatch('install');await w.dispatch('activate');
  const response=await w.dispatch('fetch',{request:{method:'GET',mode:'cors',url:w.scope+'assets/archive-old.js'}});
  assert.equal(await response.text(),'older-safe-chunk');assert.equal(w.state.fetches,0);
});
