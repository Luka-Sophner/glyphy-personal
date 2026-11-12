import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configureAndroid } from './configure-android.mjs';
import { checkAndroid } from './check-android.mjs';

const appId = 'com.glyphy.personal';
function run(command, args, capture = false) {
  const r = spawnSync(command, args, { stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`${path.basename(command)} failed (${r.status ?? r.error?.code})`);
  return r.stdout;
}
export function prepareCloudAndroid() {
  checkAndroid({ dist: true });
  configureAndroid();
  // A time-based counter also survives a new repository or renamed workflow.
  // Seconds from 2020 remain below Android's 2,100,000,000 limit until 2086.
  const version = Math.floor(Date.now() / 1000) - 1577836800;
  assert(version > 0 && version < 2100000000);
  fs.writeFileSync('android/glyphy-cloud.gradle', `android {
    compileSdkVersion 36
    buildToolsVersion '36.0.0'
    defaultConfig {
        applicationId '${appId}'
        targetSdkVersion 36
        versionCode ${version}
        versionName '${JSON.parse(fs.readFileSync('package.json')).version}'
    }
    buildTypes { release { signingConfig = null } }
}
`);
  const file = 'android/app/build.gradle', line = "apply from: '../glyphy-cloud.gradle'";
  let gradle = fs.readFileSync(file, 'utf8');
  if (!gradle.includes(line)) fs.writeFileSync(file, `${gradle}\n${line}\n`);
  fs.writeFileSync('android/glyphy-build-info.json', JSON.stringify({ applicationId: appId, versionCode: version, commit: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID }, null, 2));
}
export async function signCloudAndroid() {
  checkAndroid({ dist: true, synced: true });
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  assert(sdk, 'Android SDK is missing');
  assert(process.env.ANDROID_KEYSTORE_BASE64 && process.env.ANDROID_KEYSTORE_PASSWORD, 'Signing secrets are missing');
  const tools = path.join(sdk, 'build-tools/36.0.0');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'glyphy-apk-'));
  try {
    const key = path.join(temp, 'glyphy.jks');
    fs.writeFileSync(key, Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, 'base64'), { mode: 0o600 });
    fs.mkdirSync('APK', { recursive: true });
    const aligned = path.join(temp, 'aligned.apk'), output = 'APK/Glyphy.apk';
    run(path.join(tools, 'zipalign'), ['-P', '16', '-f', '4', 'android/app/build/outputs/apk/release/app-release-unsigned.apk', aligned]);
    run(path.join(tools, 'apksigner'), ['sign', '--ks', key, '--ks-key-alias', 'glyphy', '--ks-pass', 'env:ANDROID_KEYSTORE_PASSWORD', '--key-pass', 'env:ANDROID_KEYSTORE_PASSWORD', '--v4-signing-enabled', 'false', '--out', output, aligned]);
    const signature = run(path.join(tools, 'apksigner'), ['verify', '--verbose', '--print-certs', output], true);
    console.log(signature);
    run(path.join(tools, 'zipalign'), ['-c', '-P', '16', '4', output]);
    const info = JSON.parse(fs.readFileSync('android/glyphy-build-info.json', 'utf8'));
    const badging = run(path.join(tools, 'aapt2'), ['dump', 'badging', output], true);
    assert(badging.includes(`package: name='${appId}' versionCode='${info.versionCode}'`), 'Wrong application ID or version');
    assert(!badging.includes('application-debuggable'), 'Release must not be debuggable');
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(fs.readFileSync(output));
    for (const file of ['AndroidManifest.xml', 'classes.dex', 'assets/public/index.html', 'assets/capacitor.config.json']) assert(zip.file(file), `Missing ${file}`);
    const config = JSON.parse(await zip.file('assets/capacitor.config.json').async('string'));
    assert.equal(config.appId, appId); assert(!config.server?.url);
    assert.equal(config.server?.hostname, 'localhost'); assert.equal(config.server?.androidScheme, 'https');
    // Check every bundled file, not just index.html, against the local Vite build.
    function verifyDirectory(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) verifyDirectory(file);
        else comparisons.push((async () => {
          const name = `assets/public/${path.relative('dist', file).split(path.sep).join('/')}`;
          assert(zip.file(name), `Missing bundled file ${name}`);
          assert((await zip.file(name).async('nodebuffer')).equals(fs.readFileSync(file)), `Bundle mismatch: ${name}`);
        })());
      }
    }
    const comparisons = []; verifyDirectory('dist'); await Promise.all(comparisons);
    info.certificateSha256 = signature.match(/certificate SHA-256 digest: ([a-f\d]+)/i)?.[1];
    assert(info.certificateSha256, 'Missing signing certificate digest');
    const sum = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
    fs.writeFileSync('APK/SHA256SUMS.txt', `${sum}  Glyphy.apk\n`);
    fs.writeFileSync('APK/build-info.json', JSON.stringify(info, null, 2));
    console.log('Signed release verified: local assets, application ID, version, signature and ZIP alignment.');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'prepare') prepareCloudAndroid();
    else if (process.argv[2] === 'sign') await signCloudAndroid();
    else throw new Error('Expected prepare or sign');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
