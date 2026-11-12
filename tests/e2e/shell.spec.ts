import { test, expect } from '@playwright/test';

test('шесть экранов, навигация и границы диалогов', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const check = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const dialog = page.getByRole('dialog');
    if (await dialog.count()) {
      const bounds = await dialog.boundingBox();
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    }
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  };
  await page.goto('/?demo=1');
  await expect(page.getByRole('heading', { name: 'Главная', exact: true })).toBeAttached();
  const firstRow = page.locator('.symbol-grid').first().locator('button');
  await expect(firstRow).toHaveCount(2);
  expect(await page.locator('.symbol-grid').first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(5);
  const boxes = await firstRow.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
  expect(new Set(boxes).size).toBe(1);
  await check('home');
  await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await check('menu');
  await page.getByRole('button', { name: 'Словарь', exact: true }).click();
  await expect(page.locator('.category-row')).toHaveCount(7);
  await check('dictionary');
  await page.getByRole('link', { name: 'Явления', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'category');
  await check('category');
  await page.getByRole('button', { name: 'Открыть карточку: Вода', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check('preview');
  await page.getByRole('button', { name: 'Редактировать карточку', exact: true }).click();
  await check('editor');
  await page.getByRole('dialog').press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('создание, редактирование групп и удаление сохраняются в базе', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить карточку', exact: true }).click();
  await page.getByRole('textbox', { name: 'Основное значение группы 1', exact: true }).fill('Река');
  await page.getByRole('combobox', { name: 'Категория группы 1', exact: true }).selectOption('phenomena');
  await page.getByRole('button', { name: '+ Добавить группу', exact: true }).click();
  await page.getByRole('textbox', { name: 'Основное значение группы 2', exact: true }).fill('Поток');
  await page.getByRole('textbox', { name: 'Теги через запятую', exact: true }).fill('река, вода, река');
  await page.getByRole('button', { name: 'Сохранить карточку', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Река', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Поток', exact: true })).toBeVisible();
  await expect(page.locator('.preview-tags')).toHaveText('река, вода');
  await page.getByRole('button', { name: 'Редактировать карточку', exact: true }).click();
  await page.getByRole('textbox', { name: 'Основное значение группы 1', exact: true }).fill('Ручей');
  await page.getByRole('button', { name: 'Сохранить карточку', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Ручей', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Удалить карточку', exact: true }).click();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Удалить карточку', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Открыть карточку: Ручей', exact: true })).toHaveCount(0);
});
