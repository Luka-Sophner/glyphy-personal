import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { configureAndroid } from '../scripts/configure-android.mjs';
import { glyphyNativeBuild } from '../scripts/native-build.mjs';

const project = path.resolve('.');
const nativeSource = fs.readFileSync('src/features/native/capacitor.mjs', 'utf8');
function adapter(native = true, fail = false) {
  let saved = Buffer.alloc(0), shared, listened = false, removed = false;
  const Filesystem = {
    async mkdir() {}, async writeFile(o) { if (fail) throw new Error('Disk full'); saved = Buffer.from(o.data, 'base64'); },
    async appendFile(o) { saved = Buffer.concat([saved, Buffer.from(o.data, 'base64')]); },
    async getUri(o) { return { uri: `file:///cache/${o.path}` }; },
  };
  const body = nativeSource.replace(/^import .*;\s*$/gm, '').replaceAll('export ', '');
  const api = new Function('Capacitor','App','Filesystem','Directory','Share','btoa', `${body}\nreturn {saveNativeArchive,listenNativeBack};`)(
    { isNativePlatform: () => native }, { async addListener(name, handler) { assert.equal(name,'backButton'); listened = handler; return { remove() { removed = true; } }; } }, Filesystem, { Cache: 'CACHE' }, { async share(options) { shared = options; } }, btoa);
  return { ...api, saved: () => saved, shared: () => shared, listened: () => listened, removed: () => removed };
}
test('Android ZIP crosses multiple native chunks without changing one byte and uses private cache sharing', async () => {
  const api = adapter(), bytes = Uint8Array.from({length: 600_001}, (_, i) => i % 256);
  assert.equal(await api.saveNativeArchive(bytes,'backup.zip'),true);
  assert.deepEqual(api.saved(),Buffer.from(bytes));
  assert.deepEqual(api.shared().files,['file:///cache/glyphy-exports/backup.zip']);
});
test('Android export reports write failure before opening Share; desktop keeps browser export', async () => {
  const api=adapter(true,true); await assert.rejects(api.saveNativeArchive(new Uint8Array([1,2,3]),'backup.zip'), /Disk full/); assert.equal(api.shared(),undefined);
  const web=adapter(false); assert.equal(await web.saveNativeArchive(new Uint8Array([1]),'backup.zip'),false); assert.equal(web.saved().length,0);
});
test('Android back registration calls the router handler and is removable', async () => {
  const api=adapter(); let calls=0; const remove=await api.listenNativeBack(()=>calls++); api.listened()(); assert.equal(calls,1); remove(); assert.equal(api.removed(),true);
});
test('Android bundling selects native adapter and safe viewport; desktop keeps its adapter and viewport', () => {
  const previous=process.env.GLYPHY_ANDROID;
  try {
    process.env.GLYPHY_ANDROID='1'; const plugin=glyphyNativeBuild();
    assert(plugin.resolveId('../native/adapter.mjs',`${project}/src/features/transfer/browser.ts`).endsWith('capacitor.mjs'));
    assert(plugin.resolveId('../features/native/adapter.mjs',`${project}/src/app/App.tsx`).endsWith('capacitor.mjs'));
    assert(plugin.transformIndexHtml('<meta content="viewport-fit=cover">').includes('viewport-fit=contain'));
    process.env.GLYPHY_ANDROID='0'; assert.equal(glyphyNativeBuild().resolveId('../native/adapter.mjs',`${project}/src/features/transfer/browser.ts`),undefined);
    assert(glyphyNativeBuild().transformIndexHtml('viewport-fit=cover').includes('viewport-fit=cover'));
  } finally { if (previous===undefined) delete process.env.GLYPHY_ANDROID; else process.env.GLYPHY_ANDROID=previous; }
});
test('native configuration is repeatable, retains application ID, adds icon, blocks cleartext and keeps system UI visible', () => {
  const dir=path.join(project,'.verification/android-config-fixture');
  const write=(file,text)=>{const target=path.join(dir,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);};
  write('capacitor.config.json',fs.readFileSync('capacitor.config.json'));
  write('android/app/build.gradle',"android { defaultConfig { applicationId 'com.glyphy.personal'\nversionCode 1 } }");
  write('android/gradle.properties','android.useAndroidX=true\n');
  write('android/app/src/main/res/values/strings.xml','<resources><string name="app_name">App</string><string name="title_activity_main">App</string></resources>');
  write('android/app/src/main/AndroidManifest.xml','<manifest><application android:allowBackup="true"><activity android:name=".MainActivity"/></application></manifest>');
  write('android/app/src/main/java/com/glyphy/personal/MainActivity.java','package com.glyphy.personal; import com.getcapacitor.BridgeActivity; public class MainActivity extends BridgeActivity {}');
  for(const file of ['maskable-512.png','icon-192.png']) write(`public/icons/${file}`,fs.readFileSync(`public/icons/${file}`));
  for (const frame of [45, 48, 47, 46]) {
    for (const suffix of ['', '-maskable']) {
      const file = `public/icons/frame-${frame}${suffix}.png`;
      write(file, fs.readFileSync(file));
    }
  }
  try {
    process.chdir(dir); configureAndroid(); configureAndroid();
    assert.equal((fs.readFileSync('android/gradle.properties','utf8').match(/android.overridePathCheck=/g)??[]).length,1);
    assert(fs.readFileSync('android/app/build.gradle','utf8').includes('glyphyVersionCode'));
    const manifest=fs.readFileSync('android/app/src/main/AndroidManifest.xml','utf8'); assert(manifest.includes('allowBackup="false"')); assert(manifest.includes('usesCleartextTraffic="false"')); assert(!manifest.includes('READ_EXTERNAL_STORAGE')); assert(!manifest.includes('screenOrientation'));
    assert(fs.existsSync('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'));
    assert(fs.readFileSync('android/app/src/main/java/com/glyphy/personal/MainActivity.java','utf8').includes('EdgeToEdge.enable'));
    assert.equal((manifest.match(/<activity-alias /g) ?? []).length, 4);
    assert.equal((manifest.match(/<receiver /g) ?? []).length, 1);
    assert(manifest.includes('android:name=".GlyphyApplication"'));
    assert(manifest.includes('android.permission.RECEIVE_BOOT_COMPLETED'));
    assert(fs.existsSync('android/app/src/main/res/mipmap-anydpi-v26/glyphy_frame_48.xml'));
  } finally { process.chdir(project); }
});
