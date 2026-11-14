import { test, expect } from '@playwright/test';

test('bottom fade protects the menu before the final card leaves the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 600 });
  await page.goto('/?demo=1');
  await expect(page.locator('.symbol-card').first()).toBeVisible();
  await expect(page.locator('.bottom-navigation')).toHaveCSS('opacity', '1');
  const last = (await page.locator('.symbol-card:not([disabled])').last().boundingBox())!;
  const menu = (await page.locator('.nav-center').boundingBox())!;
  expect(last.y + last.height).toBeLessThan(600);
  expect(last.y + last.height).toBeGreaterThan(menu.y - 30);
  await expect(page.locator('.content-fade')).toHaveCSS('opacity', '1');
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(page.locator('.content-fade')).toHaveCSS('opacity', '0');
});

test('font, fixed mobile search, end gradient, bottom space and responsive viewport', async ({ page }, info) => {
  await page.goto('/?demo=1');
  await expect(page.locator('.symbol-card').first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    const open = indexedDB.open('glyphy-demo');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const tx = db.transaction('cards','readwrite'), store = tx.objectStore('cards'), get = store.getAll();
    get.onsuccess = () => { for (let i = 0; i < 100; i++) store.put({ ...get.result[0], id: 'scroll-' + i, meanings: get.result[0].meanings.map((m: any) => ({ ...m, primary: 'Scroll ' + i })) }); };
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  });
  // Native IndexedDB writes are fixture setup, not Dexie mutations. Reopen the
  // page so its subscription starts from the persisted fixture snapshot.
  await page.reload();
  await page.evaluate(async () => {
    document.documentElement.style.setProperty('--safe-area-inset-top', '24px');
    await document.fonts.ready;
  });
  await expect.poll(() => page.locator('.symbol-card').count()).toBeGreaterThan(80);
  expect(await page.evaluate(() => document.fonts.check('900 20px "Glyphy Uni Sans"'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const mobile = page.viewportSize()!.width < 768, header = page.locator('.app-header'), main = page.locator('.app-main');
  // Visibility alone does not mean the launch transform has reached its target.
  await expect(header).toHaveCSS('transform', 'none');
  if (mobile) {
    const before = (await header.boundingBox())!; expect(before.y).toBeGreaterThanOrEqual(24);
    await expect(page.locator('.content-fade-top')).toHaveCSS('opacity','0');
    await expect(page.locator('.content-fade')).toHaveCSS('opacity','1');
    await main.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.locator('.content-fade')).toHaveCSS('opacity','0');
    await expect(page.locator('.content-fade-top')).toHaveCSS('opacity','1');
    expect((await header.boundingBox())!.y).toBeCloseTo(before.y, 0);
    const last = (await page.locator('.app-main .symbol-card').last().boundingBox())!, bounds = (await main.boundingBox())!;
    expect(bounds.y + bounds.height - last.y - last.height).toBeGreaterThan(100);
    await main.evaluate(el => { el.scrollTop = 0; });
    await expect(page.locator('.content-fade-top')).toHaveCSS('opacity','0');
    await expect(page.locator('.content-fade')).toHaveCSS('opacity','1');
  }
  const search = page.locator('.app-header input');
  await search.fill('no-match-12345'); await expect(page.locator('.content-fade')).toHaveCSS('opacity','0');
  await expect(search).toHaveValue('no-match-12345');
  await page.screenshot({path:info.outputPath('search-fixed.png')});
  if (mobile) {
    await search.focus(); await page.setViewportSize({ width: page.viewportSize()!.width, height: 420 });
    await expect(page.locator('.app')).toHaveAttribute('data-keyboard','');
    const box = (await search.boundingBox())!; expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThan(420);
    await search.fill('Scroll 2'); await expect(search).toHaveValue('Scroll 2');
    // This simulates viewport shrink; it does not emulate the native Android IME.
  }
});

test('all dictionary categories paint the root and shell blue', async ({ page }) => {
  for (const category of ['phenomena', 'qualities', 'events', 'relations', 'experiences', 'certainty', 'time']) {
    await page.goto(`/?demo=1#/category/${category}`);
    await expect(page.locator('.app')).toHaveClass(/app--category/);
    for (const selector of ['html', 'body', '.app']) {
      await expect(page.locator(selector)).toHaveCSS('background-color', 'rgb(140, 157, 173)');
    }
    await expect(page.locator('.content-fade-top')).toHaveCSS('background-image', /rgb\(140, 157, 173\)/);
  }
  await page.goto('/?demo=1#/');
  await expect(page.locator('.app')).toHaveCSS('background-color', 'rgb(255, 253, 250)');
});

test('search wobble settles, respects reduced motion, and menu survives fast reversals', async ({page}) => {
  await page.goto('/?demo=1'); await expect(page.locator('.symbol-card').first()).toBeVisible();
  const form = page.locator('.app-header .search-bar');
  await form.dispatchEvent('pointerdown'); expect(await form.evaluate(el => el.getAnimations().length)).toBeGreaterThan(0);
  await expect.poll(() => form.evaluate(el => el.getAnimations().length)).toBe(0);
  await page.emulateMedia({reducedMotion:'reduce'}); await expect(page.locator('.app')).toHaveAttribute('data-reduced-motion','true');
  await form.dispatchEvent('pointerdown'); expect(await form.evaluate(el => el.getAnimations().length)).toBe(0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  const toggle=page.locator('.nav-center');
  for(let i=0;i<8;i++) await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('[data-nav-slot]:enabled')).toHaveCount(0);
  await toggle.press('Enter');
  await expect(page.locator('[data-nav-slot]').nth(2)).toHaveCSS('opacity','1');
  await toggle.press('Enter');
  await expect(page.locator('[data-nav-slot]').first()).toHaveCSS('opacity','0');
});
