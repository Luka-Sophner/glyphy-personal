import fs from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export function checkAndroid({ dist = false, synced = false } = {}) {
  const config = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
  assert.equal(config.appId, 'com.glyphy.personal');
  assert.equal(config.appName, 'Glyphy'); assert.equal(config.webDir, 'dist');
  assert(!config.server?.url, 'APK must not use server.url');
  assert.equal(config.server.androidScheme, 'https'); assert.equal(config.server.hostname, 'localhost');
  assert.equal(config.server.cleartext, false);
  const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
  if (dist) {
    const root = resolve(config.webDir), html = fs.readFileSync(join(root, 'index.html'), 'utf8');
    assert(html.includes('viewport-fit=contain'), 'Use the native-safe viewport for APK');
    for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const path = match[1]; if (/^(?:data:|https?:)/.test(path)) throw new Error(`External static dependency: ${path}`);
      assert(fs.existsSync(resolve(root, path)), `Missing asset: ${path}`);
    }
    const js = files(root).filter(p => p.endsWith('.js')).map(p => fs.readFileSync(p, 'utf8')).join('\n');
    assert(!/https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.[\d.]+):\d{4}/.test(js), 'Dev server URL in Android bundle');
    assert(js.includes('glyphy-exports'), 'Native ZIP export was not bundled');
    assert(fs.existsSync(join(root, 'icons/icon-192.png')));
    assert(fs.existsSync(join(root, 'icons/icon-512.png')));
  }
  if (synced) {
    const actual = JSON.parse(fs.readFileSync('android/app/src/main/assets/capacitor.config.json', 'utf8'));
    assert.equal(actual.appId, config.appId); assert(!actual.server?.url);
    assert(fs.existsSync('android/app/src/main/assets/public/index.html'));
    assert.equal(fs.readFileSync('dist/index.html', 'utf8'), fs.readFileSync('android/app/src/main/assets/public/index.html', 'utf8'));
  }
  console.log('Android configuration checks passed.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  checkAndroid({ dist: process.argv.includes('--dist'), synced: process.argv.includes('--synced') });
}
