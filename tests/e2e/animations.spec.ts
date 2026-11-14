import { test, expect } from '@playwright/test';

test('active menu slot becomes Home in the content sections', async ({ page }) => {
  for (const [path, slot] of [['dictionary', 'dictionary'], ['glyphs', 'glyphs'], ['diary', 'diary']]) {
    await page.goto(`/#/${path}`);
    await page.locator('.nav-center').click();
    await expect(page.getByRole('button', { name: 'Главная', exact: true })).toHaveCount(1);
    const home = page.locator(`[data-nav-slot="${slot}"]`);
    await expect(home).toHaveAttribute('aria-label', 'Главная');
    await home.click();
    await expect(page.getByRole('heading', { name: 'Главная', exact: true })).toBeAttached();
  }
});

test('circle uses the clicked icon, browser Back restores scroll and clears layers', async ({ page }) => {
  await page.goto('/#/dictionary');
  const row = page.locator('[data-category-id="time"]');
  await row.scrollIntoViewIfNeeded();
  // Finish only the short row entrance before measuring the source.
  await expect(row).toHaveCSS('opacity', '1');
  await row.getByRole('link').click({ trial: true });
  const rect = await row.locator('.category-circle').boundingBox();
  const scroll = await page.evaluate(() => matchMedia('(max-width: 767px)').matches ? document.getElementById('content')!.scrollTop : scrollY);
  await row.getByRole('link').click();
  const circle = page.locator('[data-route-transition="forward"]');
  await expect(circle).toBeAttached();
  expect(Number(await circle.getAttribute('data-origin-x'))).toBeCloseTo(rect!.x + rect!.width / 2, 0);
  expect(Number(await circle.getAttribute('data-origin-y'))).toBeCloseTo(rect!.y + rect!.height / 2, 0);
  await expect(page.locator('[data-route-transition]')).toHaveCount(0, { timeout: 4000 });
  await expect(page.getByRole('heading', { name: 'Время', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-route-transition]')).toHaveCount(0, { timeout: 4000 });
  await expect(page.locator('.category-row')).toHaveCount(7);
  expect(await page.evaluate(() => matchMedia('(max-width: 767px)').matches ? document.getElementById('content')!.scrollTop : scrollY)).toBeCloseTo(scroll, 0);
});

test('rapid menu and route changes do not retain overlay or focus lock', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#/dictionary');
  for (let i = 0; i < 7; i++) await page.locator('.nav-center').press('Enter');
  await expect(page.locator('.nav-center')).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Главная', exact: true }).press('Enter');
  await page.goto('/#/dictionary');
  await page.getByRole('link', { name: 'Явления', exact: true }).press('Enter');
  await page.goBack();
  await expect(page.locator('[data-route-transition]')).toHaveCount(0, { timeout: 4000 });
  await page.getByRole('button', { name: 'Добавить карточку', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (page.viewportSize()!.width < 768) await expect(page.locator('.app-main')).toHaveCSS('overflow-y', 'auto');
  else await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  expect(await page.locator('body').evaluate(el => el.style.overflow)).not.toBe('hidden');
  expect(errors).toEqual([]);
});

test('system prefers-reduced-motion keeps all actions available without circles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/dictionary');
  await expect(page.locator('.app')).toHaveAttribute('data-reduced-motion', 'true');
  await page.getByRole('link', { name: 'Явления', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Явления', exact: true })).toBeVisible();
  await expect(page.locator('[data-route-transition]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Вернуться к категориям', exact: true }).click();
  await expect(page.locator('.category-row')).toHaveCount(7);
  await page.getByRole('button', { name: 'Добавить карточку', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
  await page.getByRole('dialog').press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
