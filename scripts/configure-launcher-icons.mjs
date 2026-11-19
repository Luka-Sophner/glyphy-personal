import fs from 'node:fs';
import { dirname } from 'node:path';

// Add future inactive frames here in their display order.
export const inactiveIconFrames = [48, 47, 46];
export const defaultIconFrame = 45;

export function configureLauncherIcons(manifest, appId) {
  const write = (path, content) => {
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, content);
  };
  const frames = [defaultIconFrame, ...inactiveIconFrames];
  const res = 'android/app/src/main/res';
  const javaDirectory = `android/app/src/main/java/${appId.replaceAll('.', '/')}`;
  for (const name of ['IconTimeline', 'IconScheduler', 'IconReceiver', 'GlyphyApplication']) {
    const template = fs.readFileSync(new URL(`./android-icons/${name}.java`, import.meta.url), 'utf8');
    write(`${javaDirectory}/${name}.java`, template
      .replaceAll('__PACKAGE__', appId)
      .replaceAll('__DEFAULT_FRAME__', String(defaultIconFrame))
      .replaceAll('__INACTIVE_FRAMES__', inactiveIconFrames.join(', ')));
  }
  for (const frame of frames) {
    const resource = `glyphy_frame_${frame}`;
    write(`${res}/drawable-nodpi/${resource}.png`, fs.readFileSync(`public/icons/frame-${frame}-maskable.png`));
    write(`${res}/mipmap-nodpi/${resource}.png`, fs.readFileSync(`public/icons/frame-${frame}.png`));
    write(`${res}/mipmap-anydpi-v26/${resource}.xml`,
      `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/glyphy_icon_background"/><foreground android:drawable="@drawable/${resource}"/></adaptive-icon>`);
  }
  const applicationName = manifest.match(/<application\b[^>]*android:name="([^"]+)"/)?.[1];
  if (applicationName && applicationName !== '.GlyphyApplication') {
    throw new Error('Custom Android Application needs integration with the launcher icon lifecycle.');
  }
  if (!applicationName) manifest = manifest.replace('<application', '<application android:name=".GlyphyApplication"');
  if (!manifest.includes('android.permission.RECEIVE_BOOT_COMPLETED')) {
    manifest = manifest.replace('<application', '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/><application');
  }
  // MainActivity stays enabled. Only its launcher entry moves to the aliases.
  manifest = manifest.replace(/(<activity\s[^>]*android:name="(?:\.MainActivity|[^"]+\.MainActivity)"[^>]*>)([\s\S]*?)(<\/activity>)/g,
    (_, start, body, end) => start + body.replace(/<intent-filter\b[^>]*>[\s\S]*?<\/intent-filter>/g,
      filter => filter.includes('android.intent.category.LAUNCHER') ? '' : filter) + end);
  manifest = manifest.replace(/\s*<!-- glyphy-icon-cycle -->[\s\S]*?<!-- \/glyphy-icon-cycle -->\s*/g, '');
  const aliases = frames.map(frame =>
    `<activity-alias android:name=".LauncherFrame${frame}" android:targetActivity=".MainActivity" android:exported="true" android:enabled="${frame === defaultIconFrame}" android:label="@string/app_name" android:icon="@mipmap/glyphy_frame_${frame}"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity-alias>`);
  const receiver = '<receiver android:name=".IconReceiver" android:exported="false"><intent-filter><action android:name="android.intent.action.BOOT_COMPLETED"/><action android:name="android.intent.action.MY_PACKAGE_REPLACED"/><action android:name="android.intent.action.TIME_SET"/></intent-filter></receiver>';
  return manifest.replace('</application>', `<!-- glyphy-icon-cycle -->\n${aliases.join('\n')}\n${receiver}\n<!-- /glyphy-icon-cycle -->\n</application>`);
}
