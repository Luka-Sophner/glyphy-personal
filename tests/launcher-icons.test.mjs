import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inactiveIconFrames, defaultIconFrame, configureLauncherIcons } from '../scripts/configure-launcher-icons.mjs';

test('Android launcher preserves deep links and generates one default launcher entry', () => {
  const previous = process.cwd();
  const fixture = fs.mkdtempSync(path.join(previous, '.verification/icon-manifest-'));
  try {
    for (const frame of [defaultIconFrame, ...inactiveIconFrames]) {
      fs.mkdirSync(path.join(fixture, 'public/icons'), { recursive: true });
      for (const suffix of ['', '-maskable']) {
        const file = `public/icons/frame-${frame}${suffix}.png`;
        fs.copyFileSync(file, path.join(fixture, file));
      }
    }
    process.chdir(fixture);
    const original = '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity android:name=".MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter><intent-filter><action android:name="android.intent.action.VIEW"/></intent-filter></activity></application></manifest>';
    const manifest = configureLauncherIcons(original, 'com.glyphy.personal');
    assert.equal(configureLauncherIcons(manifest, 'com.glyphy.personal'), manifest);
    const activity = manifest.match(/<activity\s[\s\S]*?<\/activity>/)[0];
    assert(!activity.includes('LAUNCHER'));
    assert(activity.includes('android.intent.action.VIEW'));
    assert.equal((manifest.match(/android:enabled="true"/g) ?? []).length, 1);
    assert.equal((manifest.match(/android.intent.category.LAUNCHER/g) ?? []).length, 4);
    assert(!manifest.includes('SCHEDULE_EXACT_ALARM'));
  } finally {
    process.chdir(previous);
    fs.rmSync(fixture, { recursive: true });
  }
});

test('native icon timeline handles boundaries, delayed alarms and repeated cycles', () => {
  const fixture = fs.mkdtempSync(path.join(process.cwd(), '.verification/icon-timeline-'));
  try {
    const template = fs.readFileSync(new URL('../scripts/android-icons/IconTimeline.java', import.meta.url), 'utf8');
    fs.writeFileSync(path.join(fixture, 'IconTimeline.java'), template
      .replace('package __PACKAGE__;', '')
      .replaceAll('__DEFAULT_FRAME__', String(defaultIconFrame))
      .replaceAll('__INACTIVE_FRAMES__', inactiveIconFrames.join(', ')));
    fs.writeFileSync(path.join(fixture, 'TimelineCheck.java'), `
public class TimelineCheck {
    static void check(long elapsed, int expected, long delay) {
        if (IconTimeline.frame(elapsed) != expected || IconTimeline.nextDelay(elapsed) != delay)
            throw new AssertionError("Elapsed: " + elapsed);
    }
    public static void main(String[] args) {
        long hour = 3600000L;
        check(0, 45, 12 * hour);
        check(-hour, 45, 12 * hour);
        check(12 * hour - 1, 45, 1);
        check(12 * hour, 48, 2 * hour);
        check(14 * hour, 47, 2 * hour);
        check(16 * hour, 46, 2 * hour);
        check(18 * hour, 48, 2 * hour);
        check(21 * hour, 47, hour);
        check(12 * hour + 1000 * 6 * hour, 48, 2 * hour);
    }
}`);
    for (const [command, args] of [
      ['javac', ['IconTimeline.java', 'TimelineCheck.java']],
      ['java', ['-cp', '.', 'TimelineCheck']],
    ]) {
      const result = spawnSync(command, args, { cwd: fixture, encoding: 'utf8' });
      assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    }
  } finally {
    fs.rmSync(fixture, { recursive: true });
  }
});
