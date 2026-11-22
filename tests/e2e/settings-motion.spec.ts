import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await expect(page.locator('.bottom-navigation')).toHaveCSS('opacity', '1');
  await expect.poll(() => page.locator('.bottom-navigation').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(0);
}
test('settings backdrop, profile card, dots, buttons and mascot keep their order with overlapping finishes', async ({ page }) => {
  await page.goto('/?demo=1#/glyphs');
  await ready(page);
  const recordEntry = () => page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>('.nav-settings')!.click();
    const rows: { top: number; target: number; background: number; mascot: number; hero: number; heroY: number; dots: number[]; headings: number[]; buttons: number[] }[] = [];
    const start = performance.now();
    return new Promise<typeof rows>(resolve => {
      const opacity = (element: Element | null) => element ? Number(getComputedStyle(element).opacity) : 0;
      const frame = () => {
        const root = document.querySelector('.settings-v12'), main = document.getElementById('content')!;
        if (root) {
          const mainOpacity = opacity(main), sheetOpacity = opacity(root.querySelector('.settings-sheet'));
          rows.push({
            top: document.querySelector('.settings-backdrop')!.getBoundingClientRect().top,
            target: root.querySelector('.settings-sheet')!.getBoundingClientRect().top,
            background: opacity(document.querySelector('.settings-backdrop')),
            mascot: opacity(root.querySelector('.sleepy-mascot')) * sheetOpacity * mainOpacity,
            hero: opacity(root.querySelector('.active-profile-card')) * mainOpacity,
            heroY: new DOMMatrix(getComputedStyle(root.querySelector('.active-profile-card')!).transform).m42,
            dots: [...root.querySelectorAll('.profile-dots button')].map(dot => new DOMMatrix(getComputedStyle(dot).transform).m41),
            headings: [...root.querySelectorAll('.settings-sheet > h2')].map(opacity),
            buttons: [...root.querySelectorAll('.settings-link-list button')].map(opacity),
          });
        }
        const last = rows.at(-1);
        if (last?.mascot === 1 && last.buttons[4] === 1 && Math.abs(last.heroY) < .5 && last.dots.every(x => Math.abs(x) < .5) || performance.now() - start > 4000) resolve(rows);
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  });
  for (let entry = 0; entry < 3; entry++) {
    const rows = await recordEntry();
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.every(row => row.background === 1)).toBe(true);
    if (entry === 0) expect(rows.some(row => row.top > row.target + 20)).toBe(true);
    else expect(rows.some(row => row.top < row.target - 20)).toBe(true);
    expect(Math.abs(rows.at(-1)!.top - rows.at(-1)!.target)).toBeLessThan(.5);
    expect(rows.filter(row => Math.abs(row.top - row.target) > 1).every(row => row.mascot === 0 && row.hero === 0)).toBe(true);
    expect(rows.some(row => row.mascot > 0 && row.mascot < .98)).toBe(true);
    const dotStarts = [0, 1, 2, 3, 4].map(index => rows.findIndex(row => row.dots[index] > -page.viewportSize()!.width - 47));
    expect(dotStarts.every(index => index > 0)).toBe(true);
    for (let index = 1; index < dotStarts.length; index++) expect(dotStarts[index]).toBeLessThan(dotStarts[index - 1]);
    expect(rows.slice(0, Math.min(...dotStarts)).some(row => row.hero > 0 && Math.abs(row.heroY) > 1)).toBe(true);
    expect(rows.slice(Math.min(...dotStarts)).every(row => row.hero >= .95 && Math.abs(row.heroY) < 12)).toBe(true);
    expect(rows.slice(Math.min(...dotStarts)).some(row => Math.abs(row.heroY) > .5)).toBe(true);
    const buttonsVisible = rows.filter(row => row.buttons.some(value => value > 0));
    expect(buttonsVisible.every(row => row.dots.every(x => Math.abs(x) < 16))).toBe(true);
    expect(buttonsVisible.some(row => row.dots.some(x => Math.abs(x) > .5))).toBe(true);
    const mascotVisible = rows.filter(row => row.mascot > 0);
    expect(mascotVisible.every(row => row.buttons[4] >= .9)).toBe(true);
    expect(mascotVisible.some(row => row.buttons[4] < .999)).toBe(true);
    expect(rows.at(-1)!.mascot).toBe(1);
    expect(rows.every(row => Math.abs(row.headings[0] - row.buttons[0]) < .025 && Math.abs(row.headings[1] - row.buttons[2]) < .025)).toBe(true);
    if (entry === 0) {
      await page.getByRole('button', { name: 'Открыть профили', exact: true }).press('Enter');
      await expect(page.locator('.profiles-page')).toBeVisible();
    } else if (entry === 1) {
      await page.getByRole('button', { name: 'Аккаунт и резервные копии', exact: true }).click();
      await expect(page.locator('.backups-page')).toBeVisible();
    }
  }
});

test('leaving settings slides the warm surface below the screen and keeps the navigation fixed', async ({ page }) => {
  for (const [source, subpage] of [['/glyphs', ''], ['/dictionary', 'profiles'], ['/diary', 'backups']]) {
    await page.goto('/?demo=1#' + source);
    await ready(page);
    await page.locator('.nav-settings').click();
    await expect(page.locator('.sleepy-mascot')).toHaveCSS('opacity', '1');
    if (subpage) {
      const name = subpage === 'profiles' ? 'Открыть профили' : 'Аккаунт и резервные копии';
      await page.getByRole('button', { name, exact: true }).press('Enter');
      await expect(page.locator('.' + subpage + '-page')).toBeVisible();
      await expect(page.locator('#content')).toHaveCSS('opacity', '1');
      await expect(page.locator('.settings-backdrop')).toHaveCSS('top', '0px');
    } else {
      await page.evaluate(() => {
        const scroller = matchMedia('(max-width: 767px)').matches ? document.getElementById('content')! : document.scrollingElement!;
        scroller.scrollTop = scroller.scrollHeight;
      });
    }
    const samples = await page.evaluate(async () => {
      const navigation = document.querySelector('.bottom-navigation')!;
      const navTop = navigation.getBoundingClientRect().top;
      const rows: { top: number; main: number; phase: string | undefined; background: string; gradient: number }[] = [];
      let navMoved = false;
      document.querySelector<HTMLButtonElement>('.nav-center')!.click();
      return new Promise<{ rows: typeof rows; sameNavigation: boolean; navMoved: boolean; height: number; finished: boolean }>(resolve => {
        const start = performance.now();
        const frame = () => {
          const main = document.getElementById('content')!, backdrop = document.querySelector('.settings-backdrop');
          navMoved ||= Math.abs(navigation.getBoundingClientRect().top - navTop) > .5;
          if (backdrop) rows.push({
            top: backdrop.getBoundingClientRect().top,
            main: Number(getComputedStyle(main).opacity), phase: main.dataset.settingsTransition,
            background: getComputedStyle(document.querySelector('.app')!).backgroundColor,
            gradient: Number(getComputedStyle(document.querySelector('.content-fade')!).opacity),
          });
          const finished = !backdrop && getComputedStyle(main).opacity === '1';
          if (finished || performance.now() - start > 3000) resolve({ rows, sameNavigation: document.querySelector('.bottom-navigation') === navigation, navMoved, height: innerHeight, finished });
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    });
    expect(samples.finished).toBe(true);
    expect(samples.sameNavigation).toBe(true);
    expect(samples.navMoved).toBe(false);
    const moving = samples.rows.filter(row => row.phase === 'dismiss');
    expect(moving.length).toBeGreaterThan(2);
    expect(moving.some(row => row.top > samples.rows[0].top + 20 && row.top < samples.height - 5)).toBe(true);
    expect(Math.max(...moving.map(row => row.top))).toBeGreaterThan(samples.height - 20);
    expect(moving.filter(row => row.main > .01 || row.gradient !== 0 || row.background !== 'rgb(255, 253, 250)')).toEqual([]);
    await expect(page).toHaveURL(new RegExp('#' + source + '$'));
    await expect(page.locator('.nav-center')).toHaveCSS('background-color', 'rgb(255, 82, 126)');
  }
});

test('reopening settings during dismissal completes the intro and reduced motion skips the dismissal', async ({ page }) => {
  await page.goto('/?demo=1#/glyphs');
  await ready(page);
  await page.locator('.nav-settings').click();
  await expect(page.locator('.sleepy-mascot')).toHaveCSS('opacity', '1');
  const reversed = await page.evaluate(() => new Promise<boolean>(resolve => {
    const start = performance.now(), top = document.querySelector('.settings-backdrop')!.getBoundingClientRect().top;
    document.querySelector<HTMLButtonElement>('.nav-center')!.click();
    const frame = () => {
      const main = document.getElementById('content')!, panel = document.querySelector('.settings-backdrop');
      if (main.dataset.settingsTransition === 'dismiss' && panel && panel.getBoundingClientRect().top > top + 20) {
        document.querySelector<HTMLButtonElement>('.nav-settings')!.click(); resolve(true);
      } else if (performance.now() - start > 2000) resolve(false);
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }));
  expect(reversed).toBe(true);
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.locator('.sleepy-mascot')).toHaveCSS('opacity', '1');
  await expect(page.locator('#content')).toHaveCSS('opacity', '1');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.app')).toHaveAttribute('data-reduced-motion', 'true');
  await page.locator('.nav-center').click();
  await expect(page.locator('.settings-backdrop')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/glyphs$/);
});
test('settings subpages and repeated gear clicks retain the original menu screen', async ({ page }) => {
  for (const source of ['/dictionary', '/glyphs', '/diary?all=1']) {
    await page.goto('/?demo=1#' + source);
    await ready(page);
    await page.locator('.nav-settings').click();
    await page.getByRole('button', { name: 'Аккаунт и резервные копии', exact: true }).click();
    await expect(page.locator('.backups-page')).toBeVisible();
    await page.locator('.nav-settings').click();
    await expect(page).toHaveURL(/#\/settings$/);
    await page.locator('.nav-center').click();
    await expect.poll(() => new URL(page.url()).hash).toBe('#' + source);
    await expect(page.locator('#content')).toHaveCSS('opacity', '1');
  }
  await page.goto('/?demo=1#/glyphs');
  await page.locator('.nav-settings').click();
  await page.getByRole('button', { name: 'Открыть профили', exact: true }).press('Enter');
  await expect(page.locator('.profiles-page')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.settings-v12')).toBeVisible();
  await page.locator('.nav-center').click();
  await expect(page).toHaveURL(/#\/glyphs$/);
});

test('settings backdrop touches both viewport edges and continues behind the fixed menu', async ({ page }, info) => {
  await page.goto('/?demo=1#/settings');
  await ready(page);
  await expect(page.locator('.settings-about button')).toHaveCSS('opacity', '1');
  await expect(page.locator('.settings-link-list').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  for (const button of await page.locator('.settings-link-list button').all()) {
    await expect(button).toHaveCSS('background-color', 'rgb(255, 253, 250)');
  }
  const backdrop = page.locator('.settings-backdrop'), nav = page.locator('.nav-center');
  await expect(backdrop).toHaveCSS('background-color', 'rgb(244, 240, 231)');
  await expect.poll(() => backdrop.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.left) < .5 && Math.abs(rect.right - innerWidth) < .5 && Math.abs(rect.bottom - innerHeight) < .5;
  })).toBe(true);
  await expect(page.locator('.content-fade')).toHaveCSS('background-image', /rgb\(244, 240, 231\)/);
  const before = await nav.boundingBox();
  await page.evaluate(() => {
    const scroller = matchMedia('(max-width: 767px)').matches ? document.getElementById('content')! : document.scrollingElement!;
    scroller.scrollTop = scroller.scrollHeight;
  });
  await expect.poll(async () => {
    const mascot = await page.locator('.sleepy-mascot').boundingBox();
    return mascot!.y + mascot!.height < before!.y;
  }).toBe(true);
  const after = await nav.boundingBox(), panel = await backdrop.boundingBox();
  expect(Math.abs(before!.y - after!.y)).toBeLessThan(.5);
  expect(Math.abs(panel!.x)).toBeLessThan(.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('settings-scrolled.png') });
});

test('background expands before account content; dots enter in reverse order and settle before the label', async ({ page }, info) => {
  await page.goto('/?demo=1#/settings');
  await ready(page);
  await expect(page.locator('.settings-about button')).toHaveCSS('opacity', '1');
  const samples = await page.evaluate(async () => {
    const navigation = document.querySelector('.bottom-navigation');
    const rows: { top: number; main: number; account: number; dots: number[]; outsideLeft: boolean[]; offAxis: boolean; label: number; moving: boolean }[] = [];
    const button = [...document.querySelectorAll<HTMLButtonElement>('.settings-link-list button')].find(button => button.textContent === 'Аккаунт и резервные копии')!;
    button.click();
    return new Promise<{ rows: typeof rows; sameNavigation: boolean }>(resolve => {
      const start = performance.now();
      const frame = () => {
        const opacity = (element: Element | null) => element ? Number(getComputedStyle(element).opacity) : 0;
        const dots = [...document.querySelectorAll('.backups-page .profile-dots button')];
        rows.push({
          top: document.querySelector('.settings-backdrop')!.getBoundingClientRect().top,
          main: opacity(document.getElementById('content')),
          account: opacity(document.querySelector('.account-placeholder')),
          dots: dots.map(dot => dot.getBoundingClientRect().right > 0 ? opacity(dot) : 0),
          outsideLeft: dots.map(dot => dot.getBoundingClientRect().right < 0),
          offAxis: dots.some(dot => {
            const pose = new DOMMatrix(getComputedStyle(dot).transform);
            return Math.abs(pose.m42) > .01 || Math.abs(pose.m11 - 1) > .001 || Math.abs(pose.m12) > .001;
          }),
          label: opacity(document.querySelector('.backup-profile-choice h2')),
          moving: dots.some(dot => {
            const pose = new DOMMatrix(getComputedStyle(dot).transform);
            return Math.abs(pose.m41) > .5 || Math.abs(pose.m42) > .5 || Math.abs(pose.m11 - 1) > .01 || Math.abs(pose.m12) > .01;
          }),
        });
        if (rows.at(-1)!.label === 1 && !rows.at(-1)!.moving && dots.length || performance.now() - start > 4000) {
          resolve({ rows, sameNavigation: document.querySelector('.bottom-navigation') === navigation });
        } else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  });
  expect(samples.sameNavigation).toBe(true);
  const account = samples.rows.findIndex(row => row.account > .1 && row.main > .1);
  expect(account).toBeGreaterThan(0);
  expect(samples.rows.slice(0, account).some(row => row.top <= 1)).toBe(true);
  const initialTop = samples.rows[0].top;
  expect(samples.rows.some(row => row.top > 1 && row.top < initialTop - 5 && row.main < .1)).toBe(true);
  const dotStarts = [0, 1, 2, 3, 4].map(index => samples.rows.findIndex(row => (row.dots[index] ?? 0) > .05));
  expect(samples.rows.find(row => row.dots.length === 5)!.outsideLeft.every(Boolean)).toBe(true);
  expect(samples.rows.every(row => !row.offAxis)).toBe(true);
  for (let index = 1; index < dotStarts.length; index++) expect(dotStarts[index]).toBeLessThan(dotStarts[index - 1]);
  expect(samples.rows.filter(row => row.moving).every(row => row.label === 0)).toBe(true);
  expect(samples.rows.at(-1)!.label).toBe(1);
  await page.screenshot({ path: info.outputPath('backups-entered.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.app')).toHaveAttribute('data-reduced-motion', 'true');
  await page.locator('.nav-settings').click();
  await page.getByRole('button', { name: 'Открыть профили', exact: true }).press('Enter');
  await expect(page.locator('.profile-list-card').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('.profile-list-card').first()).toHaveCSS('transform', 'none');
  await expect(page.locator('.settings-backdrop')).toHaveCSS('top', '0px');
});
