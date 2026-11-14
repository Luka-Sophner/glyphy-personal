import { test, expect } from '@playwright/test';

test('settings ZIP restores into an isolated browser context without duplicates', async ({ page, browser }, testInfo) => {
  await page.goto('/?demo=1#/settings');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать словарь', exact: true }).click();
  const download = await downloadEvent, path = testInfo.outputPath('dictionary.zip');
  await download.saveAs(path);
  const isolated = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  try {
    const target = await isolated.newPage();
    await target.goto('/#/settings');
    await target.getByLabel('ZIP-архив словаря', { exact: true }).setInputFiles(path);
    await expect(target.getByRole('dialog', { name: 'Импорт словаря' })).toBeVisible();
    await target.getByRole('radio', { name: 'Заменить', exact: true }).check();
    await expect(target.getByRole('button', { name: 'Заменить словарь', exact: true })).toBeDisabled();
    await expect(target.getByRole('button', { name: 'Скачать резервную копию', exact: true })).toBeVisible();
    await target.getByRole('radio', { name: 'Объединить', exact: true }).check();
    await target.getByRole('button', { name: 'Объединить словари', exact: true }).click();
    await expect(target.getByText('Импорт завершён. Добавлено: 2. Уже существовали: 0.', { exact: true })).toBeVisible();
    await target.getByLabel('ZIP-архив словаря', { exact: true }).setInputFiles(path);
    await target.getByRole('button', { name: 'Объединить словари', exact: true }).click();
    await expect(target.getByText('Импорт завершён. Добавлено: 0. Уже существовали: 2.', { exact: true })).toBeVisible();
    await target.locator('.nav-center').click();
    await expect(target.locator('.symbol-card:not([disabled])')).toHaveCount(4);
    await target.getByRole('button', { name: 'Открыть карточку: Вода', exact: true }).click();
    await expect(target.locator('.preview-image')).toHaveJSProperty('naturalWidth', 948);
  } finally { await isolated.close(); }
});

test('return to Home replays the entrance, closing a popup keeps the same visit', async ({ page }) => {
  await page.goto('/?demo=1#/');
  const app = page.locator('.app');
  const before = Number(await app.getAttribute('data-home-visit'));
  await page.evaluate(() => {
    (window as any).__launchElements = [document.querySelector('.app-header'), document.querySelector('.bottom-navigation')];
  });
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('.nav-center').click();
  await expect(app).toHaveAttribute('data-home-visit', String(before + 1));
  expect(await page.evaluate(() => {
    const [header, nav] = (window as any).__launchElements;
    return header === document.querySelector('.app-header') && nav === document.querySelector('.bottom-navigation');
  })).toBe(true);
  await page.getByRole('button', { name: 'Открыть карточку: Вода', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть карточку', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(app).toHaveAttribute('data-home-visit', String(before + 1));
});
