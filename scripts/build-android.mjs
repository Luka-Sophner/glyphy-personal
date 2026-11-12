import fs from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { configureAndroid } from './configure-android.mjs';
import { checkAndroid } from './check-android.mjs';

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const status = { startedAt: new Date().toISOString(), success: false, stage: 'start', apk: null, error: null };
const statusFile = 'android-build-status.json';
function stage(name) { status.stage = name; fs.writeFileSync(statusFile, JSON.stringify(status, null, 2)); console.log(`\n--- ${name} ---`); }
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command}: ${result.error?.message ?? `код ${result.status}`}`);
}
const npmCli = process.env.npm_execpath?.endsWith('.js') ? process.env.npm_execpath : join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
function npm(args) {
  if (!fs.existsSync(npmCli)) throw new Error('Не найден npm. Переустановите Node.js LTS с сайта nodejs.org.');
  run(process.execPath, [npmCli, ...args]);
}
function javaHome() {
  const candidates = [process.env.JAVA_HOME, join(process.env.ProgramFiles ?? 'C:/Program Files', 'Android/Android Studio/jbr'), join(process.env.LOCALAPPDATA ?? '', 'Programs/Android Studio/jbr')];
  for (const root of [join(process.env.ProgramFiles ?? 'C:/Program Files', 'Java'), join(process.env.ProgramFiles ?? 'C:/Program Files', 'Microsoft'), join(process.env.USERPROFILE ?? '', '.jdks')]) {
    if (fs.existsSync(root)) for (const entry of fs.readdirSync(root, { withFileTypes: true })) if (entry.isDirectory()) candidates.push(join(root, entry.name));
  }
  return candidates.filter(Boolean).find(path => {
    try { return /JAVA_VERSION="21[.\"]/.test(fs.readFileSync(join(path, 'release'), 'utf8')); } catch { return false; }
  });
}
try {
  stage('Проверка проекта');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Нужен Node.js 22 или 24 LTS. Установите его с https://nodejs.org/.');
  checkAndroid();
  const jdk = javaHome();
  const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(process.env.LOCALAPPDATA ?? '', 'Android/Sdk')].filter(Boolean).find(p => fs.existsSync(join(p, 'platforms/android-36/android.jar')));
  console.log(`JDK 21: ${jdk ?? 'не найден; см. INSTALL_ANDROID.md'}`);
  console.log(`Android SDK 36: ${sdk ?? 'не найден; см. INSTALL_ANDROID.md'}`);
  const required = ['@capacitor/core', '@capacitor/android', '@capacitor/cli', '@capacitor/app', '@capacitor/filesystem', '@capacitor/share'];
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const installed = required.every(name => { try { return JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`, 'utf8')).version === (packageJson.dependencies[name] ?? packageJson.devDependencies[name]); } catch { return false; } });
  if (!installed) {
    stage('Установка зависимостей (для первой сборки нужен интернет)');
    // Ignore project-local/offline npm preferences without changing global settings.
    npm(['install', '--offline=false', '--no-audit', '--no-fund', '--cache', '.npm-cache', '--fetch-retries=0', '--fetch-timeout=30000']);
  }
  stage('Сборка интерфейса');
  process.env.GLYPHY_ANDROID = '1';
  npm(['run', 'build']);
  checkAndroid({ dist: true });
  const capCli = resolve('node_modules/@capacitor/cli/bin/capacitor');
  if (!fs.existsSync('android/gradlew.bat')) {
    if (fs.existsSync('android')) throw new Error('Папка android существует, но gradlew.bat отсутствует. Не перезаписываю её: см. INSTALL_ANDROID.md.');
    stage('Создание Android-проекта официальным Capacitor');
    run(process.execPath, [capCli, 'add', 'android']);
  }
  if (jdk) process.env.JAVA_HOME = jdk;
  if (sdk) process.env.ANDROID_HOME = sdk;
  configureAndroid();
  stage('Синхронизация Android');
  run(process.execPath, [capCli, 'sync', 'android']);
  checkAndroid({ dist: true, synced: true });
  if (process.argv.includes('--sync-only')) { status.success = true; stage('Синхронизация завершена; APK ещё не собран'); }
  else {
    if (!jdk || !sdk) throw new Error('Установите Android Studio, SDK Platform 36 и Build Tools 36.0.0 по INSTALL_ANDROID.md. Затем снова запустите build-android.bat.');
    stage('Сборка APK через Gradle');
    const version = JSON.parse(fs.readFileSync('android-version.json', 'utf8')).lastSuccessfulVersionCode + 1;
    run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'gradlew.bat', '--no-daemon', `-PglyphyVersionCode=${version}`, 'assembleDebug'], { cwd: resolve('android') });
    const source = resolve('android/app/build/outputs/apk/debug/app-debug.apk');
    if (!fs.existsSync(source) || fs.statSync(source).size < 1024) throw new Error('Gradle не создал непустой APK.');
    stage('Проверка APK');
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(fs.readFileSync(source));
    for (const name of ['AndroidManifest.xml', 'classes.dex', 'assets/public/index.html', 'assets/capacitor.config.json']) if (!zip.file(name)) throw new Error(`APK не содержит ${name}`);
    const embedded = JSON.parse(await zip.file('assets/capacitor.config.json').async('string'));
    if (embedded.appId !== 'com.glyphy.personal' || embedded.server?.url) throw new Error('Некорректная конфигурация внутри APK.');
    const tools = join(sdk, 'build-tools/36.0.0');
    if (!fs.existsSync(join(tools, 'lib/apksigner.jar'))) throw new Error('В SDK Manager установите Android SDK Build-Tools 36.0.0.');
    run(join(jdk, 'bin/java.exe'), ['-jar', join(tools, 'lib/apksigner.jar'), 'verify', '--verbose', source]);
    const badging = spawnSync(join(tools, 'aapt2.exe'), ['dump', 'badging', source], { encoding: 'utf8' });
    if (badging.status !== 0 || !badging.stdout.includes("package: name='com.glyphy.personal'")) throw new Error('Не удалось проверить application ID собранного APK.');
    fs.mkdirSync('APK', { recursive: true });
    const destination = resolve('APK/Glyphy-debug.apk'); fs.copyFileSync(source, destination);
    fs.writeFileSync('android-version.json', JSON.stringify({ lastSuccessfulVersionCode: version }, null, 2));
    status.apk = destination; status.success = true;
    stage('APK готов'); console.log(destination);
  }
} catch (error) {
  status.error = error.message;
  console.error(`\nСборка остановлена: ${error.message}\nОткройте INSTALL_ANDROID.md. Личные данные не удалены.`);
  process.exitCode = 1;
} finally { status.finishedAt = new Date().toISOString(); fs.writeFileSync(statusFile, JSON.stringify(status, null, 2)); }
