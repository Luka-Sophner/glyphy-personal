import { test, expect } from '@playwright/test';

test('one card, several categories and original photo survive reopening', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить карточку', exact: true }).click();
  await page.getByRole('textbox', { name: 'Основное значение группы 1', exact: true }).fill('Вода');
  await page.getByRole('button', { name: '+ Добавить группу', exact: true }).click();
  await page.getByRole('combobox', { name: 'Категория группы 2', exact: true }).selectOption('events');
  await page.getByRole('textbox', { name: 'Основное значение группы 2', exact: true }).fill('Течь');
  await page.getByRole('button', { name: '+ Добавить группу', exact: true }).click();
  await page.getByRole('combobox', { name: 'Категория группы 3', exact: true }).selectOption('qualities');
  await page.getByRole('textbox', { name: 'Основное значение группы 3', exact: true }).fill('Мокрый');
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'pixel.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.getByRole('button', { name: 'Сохранить карточку', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Сохранить карточку', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Вода', exact: true })).toBeVisible();
  const savedURL = page.url();
  const reopened = await context.newPage();
  await page.close();
  await reopened.goto(savedURL);
  for (const value of ['Вода', 'Течь', 'Мокрый']) {
    await expect(reopened.getByRole('dialog').getByRole('heading', { name: value, exact: true })).toBeVisible();
  }
  await expect(reopened.locator('.preview-image')).toHaveJSProperty('naturalWidth', 1);
  await reopened.getByRole('button', { name: 'Закрыть карточку', exact: true }).click();
  await expect(reopened.locator('.symbol-card')).toHaveCount(3);
  await reopened.getByRole('button', { name: 'Открыть карточку: Вода', exact: true }).click();
  await reopened.getByRole('button', { name: 'Удалить карточку', exact: true }).click();
  await reopened.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(reopened.getByRole('dialog')).toHaveCount(0);
  await reopened.reload();
  await expect(reopened.locator('.symbol-card')).toHaveCount(0);
  await expect(reopened.locator('.app-main .empty-state[role="status"]')).toContainText('Словарь пока пуст');
});

test('all seven category signs are local SVGs', async ({ page }) => {
  await page.goto('/#/dictionary');
  await expect(page.locator('.category-row svg[data-category-icon]')).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
