import fs from 'node:fs';
import { resolve, dirname } from 'node:path';

export function configureAndroid() {
  const config = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
  const buildFile = 'android/app/build.gradle';
  let gradle = fs.readFileSync(buildFile, 'utf8');
  const existingId = gradle.match(/applicationId\s+["']([^"']+)/)?.[1];
  if (existingId !== config.appId) throw new Error(`Application ID mismatch: ${existingId}. Android files were not changed.`);
  if (!gradle.includes('glyphyVersionCode')) {
    gradle = gradle.replace(/versionCode\s+\d+/, "versionCode Integer.parseInt(project.findProperty('glyphyVersionCode') ?: '1')");
    fs.writeFileSync(buildFile, gradle);
  }
  const propertiesFile = 'android/gradle.properties';
  let properties = fs.readFileSync(propertiesFile, 'utf8');
  if (!properties.includes('android.overridePathCheck=')) properties += '\n# Project can have a Cyrillic Windows folder name.\nandroid.overridePathCheck=true\n';
  fs.writeFileSync(propertiesFile, properties);
  const stringsFile = 'android/app/src/main/res/values/strings.xml';
  let strings = fs.readFileSync(stringsFile, 'utf8');
  for (const name of ['app_name', 'title_activity_main']) strings = strings.replace(new RegExp(`(<string name="${name}">)[^<]*(</string>)`), '$1Glyphy$2');
  fs.writeFileSync(stringsFile, strings);
  const manifestFile = 'android/app/src/main/AndroidManifest.xml';
  let manifest = fs.readFileSync(manifestFile, 'utf8');
  manifest = manifest.replace(/android:allowBackup="[^"]*"/, 'android:allowBackup="false"');
  if (!manifest.includes('android:usesCleartextTraffic=')) manifest = manifest.replace('<application', '<application android:usesCleartextTraffic="false"');
  if (!manifest.includes('android:largeHeap=')) manifest = manifest.replace('<application', '<application android:largeHeap="true"');
  fs.writeFileSync(manifestFile, manifest);
  // Official Capacitor template owns file selection/camera and orientation handling.
  const mainFile = `android/app/src/main/java/${config.appId.replaceAll('.', '/')}/MainActivity.java`;
  let main = fs.readFileSync(mainFile, 'utf8');
  if (!main.includes('EdgeToEdge.enable')) {
    if (/class MainActivity extends BridgeActivity\s*\{\s*\}/.test(main)) {
      main = `package ${config.appId};\nimport android.os.Bundle;\nimport androidx.activity.EdgeToEdge;\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {\n  @Override public void onCreate(Bundle savedInstanceState) {\n    super.onCreate(savedInstanceState);\n    EdgeToEdge.enable(this);\n  }\n}\n`;
      fs.writeFileSync(mainFile, main);
    }
  }
  const res = 'android/app/src/main/res';
  const write = (path, text) => { fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, text); };
  fs.mkdirSync(`${res}/drawable-nodpi`, { recursive: true });
  fs.copyFileSync('public/icons/maskable-512.png', `${res}/drawable-nodpi/glyphy_icon.png`);
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    fs.mkdirSync(`${res}/mipmap-${density}`, { recursive: true });
    for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) fs.copyFileSync('public/icons/icon-192.png', `${res}/mipmap-${density}/${name}.png`);
  }
  write(`${res}/values/glyphy_colors.xml`, '<?xml version="1.0" encoding="utf-8"?><resources><color name="glyphy_icon_background">#FF527E</color></resources>');
  for (const name of ['ic_launcher', 'ic_launcher_round']) write(`${res}/mipmap-anydpi-v26/${name}.xml`, '<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/glyphy_icon_background"/><foreground android:drawable="@drawable/glyphy_icon"/></adaptive-icon>');
  if (process.env.ANDROID_HOME) write('android/local.properties', `sdk.dir=${resolve(process.env.ANDROID_HOME).replaceAll('\\', '/')}\n`);
}
