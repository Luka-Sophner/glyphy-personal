import { test, expect } from '@playwright/test';

test('settings keeps the gear on the right and the central button returns to the source page', async ({ page }) => {
  for (const path of ['/', '/dictionary', '/category/phenomena', '/glyphs', '/diary']) {
    await page.goto(`/?demo=1#${path}`);
    await expect(page.locator('.bottom-navigation')).toHaveCSS('opacity', '1');
    for (const orb of await page.locator('.nav-orb').all()) {
      await expect(orb).toHaveCSS('background-color', path.startsWith('/category/') ? 'rgb(244, 240, 231)' : 'rgb(255, 82, 126)');
    }
    const icon = await page.locator('.nav-center svg').getAttribute('data-icon');
    await page.locator('.nav-settings').click();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.locator('.nav-settings')).toHaveAttribute('aria-label', 'Настройки');
    await expect(page.locator('.nav-settings svg')).toHaveAttribute('data-icon', 'settings');
    await expect(page.locator('.nav-center svg')).toHaveAttribute('data-icon', icon!);
    await expect(page.locator('.nav-center')).toHaveCSS('background-color', 'rgb(255, 82, 126)');
    await expect(page.locator('.nav-center')).toHaveCSS('color', 'rgb(255, 253, 250)');
    // Repeated settings clicks and reloads must retain the original return target.
    await page.locator('.nav-settings').click();
    await page.reload();
    await page.getByRole('button', { name: 'Вернуться назад', exact: true }).click();
    await expect.poll(() => new URL(page.url()).hash).toBe(`#${path}`);
  }
});

test('opening settings directly has a safe Home fallback', async ({ page }) => {
  await page.goto('/#/settings');
  await page.locator('.nav-center').click();
  await expect.poll(() => new URL(page.url()).hash).toBe('#/');
});
