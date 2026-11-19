import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { encryptBackup, decryptBackup } from '../scripts/signing-backup.mjs';
import { prepareCloudAndroid } from '../scripts/cloud-android.mjs';

test('release workflow retains working SDK setup, Node 22 test flags and signing identity', () => {
  const workflow = fs.readFileSync('.github/workflows/build-android.yml', 'utf8');
  assert.match(workflow, /android-actions\/setup-android@v4/);
  assert.match(workflow, /node-version: '22'/);
  assert(!workflow.includes('--test-isolation'));
  assert.match(workflow, /java-version: '21'/);
  assert.match(workflow, /build-tools;36\.0\.0/);
  assert.match(workflow, /name: Glyphy-Android-APK/);
  assert(!workflow.includes('setup-android-signing.yml'));
  assert.match(fs.readFileSync('scripts/cloud-android.mjs', 'utf8'), /'--ks-key-alias', 'glyphy'/);
});

test('signing backup restores exact key bytes, rejects wrong password and modified data', () => {
  const key = crypto.randomBytes(4096), password = 'test-only-password-123456789';
  const encrypted = encryptBackup(key, password);
  assert(decryptBackup(encrypted, password).equals(key));
  assert.notDeepEqual(encryptBackup(key, password), encrypted, 'Encryption needs fresh salt and IV');
  assert.throws(() => decryptBackup(encrypted, 'wrong-password'));
  const changed = Buffer.from(encrypted.data, 'base64'); changed[0] ^= 1;
  assert.throws(() => decryptBackup({ ...encrypted, data: changed.toString('base64') }, password));
  assert(!JSON.stringify(encrypted).includes(key.toString('base64')));
});

test('cloud preparation creates repeatable unsigned release with SDK 36, persistent ID and increasing version', () => {
  const project = process.cwd();
  fs.mkdirSync('.verification', { recursive: true });
  const dir = fs.mkdtempSync(path.join(project, '.verification/cloud-fixture-'));
  const previousSdk = process.env.ANDROID_HOME;
  const write = (name, content) => {
    const file = path.join(dir, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
  };
  write('package.json', fs.readFileSync('package.json'));
  write('capacitor.config.json', fs.readFileSync('capacitor.config.json'));
  write('dist/index.html', '<meta content="viewport-fit=contain"><script src="./app.js"></script>');
  write('dist/app.js', '/* glyphy-exports */');
  for (const name of ['icon-192.png','icon-512.png','maskable-512.png']) {
    write(`public/icons/${name}`, fs.readFileSync(`public/icons/${name}`));
    write(`dist/icons/${name}`, fs.readFileSync(`public/icons/${name}`));
  }
  for (const frame of [45, 48, 47, 46]) {
    for (const suffix of ['', '-maskable']) {
      const file = `public/icons/frame-${frame}${suffix}.png`;
      write(file, fs.readFileSync(file));
    }
  }
  write('android/app/build.gradle', "android { defaultConfig { applicationId 'com.glyphy.personal'\nversionCode 1 } }");
  write('android/gradle.properties', 'android.useAndroidX=true\n');
  write('android/app/src/main/res/values/strings.xml', '<resources><string name="app_name">App</string></resources>');
  write('android/app/src/main/AndroidManifest.xml', '<manifest><application android:allowBackup="true"><activity android:name=".MainActivity"/></application></manifest>');
  write('android/app/src/main/java/com/glyphy/personal/MainActivity.java', 'package com.glyphy.personal; public class MainActivity extends BridgeActivity {}');
  try {
    process.chdir(dir); process.env.ANDROID_HOME = path.join(dir, 'sdk');
    prepareCloudAndroid(); prepareCloudAndroid();
    const gradle = fs.readFileSync('android/glyphy-cloud.gradle', 'utf8');
    assert.match(gradle, /compileSdkVersion 36/); assert.match(gradle, /targetSdkVersion 36/);
    assert.match(gradle, /buildToolsVersion '36.0.0'/); assert.match(gradle, /signingConfig = null/);
    assert.match(gradle, /applicationId 'com.glyphy.personal'/);
    const info = JSON.parse(fs.readFileSync('android/glyphy-build-info.json'));
    assert(info.versionCode > 100000000 && info.versionCode < 2100000000);
    const app = fs.readFileSync('android/app/build.gradle', 'utf8');
    assert.equal(app.split("apply from: '../glyphy-cloud.gradle'").length - 1, 1);
    const config = JSON.parse(fs.readFileSync('capacitor.config.json'));
    config.appId = 'other.app'; fs.writeFileSync('capacitor.config.json', JSON.stringify(config));
    assert.throws(() => prepareCloudAndroid(), /com.glyphy.personal/);
  } finally {
    process.chdir(project);
    if (previousSdk === undefined) delete process.env.ANDROID_HOME; else process.env.ANDROID_HOME = previousSdk;
    // The fixture path is generated underneath the explicit project verification folder.
    assert(dir.startsWith(path.join(project, '.verification') + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
