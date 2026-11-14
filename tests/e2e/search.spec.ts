import { test, expect } from '@playwright/test';

test('ranked global search, category meaning and keyboard focus', async ({ page }) => {
  await page.goto('/?demo=1#/');
  const search = page.getByRole('searchbox', { name: 'Поиск по словарю' });
  await search.fill('  ТЕЧЬ  ');
  const hit = page.getByRole('button', { name: 'Открыть карточку: Течь', exact: true });
  await expect(hit).toBeVisible();
  await expect(page.locator('.symbol-card:not([disabled])')).toHaveCount(1);
  await hit.press('Enter');
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByRole('button', { name: 'Закрыть карточку', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(hit).toBeFocused();
  await expect(search).toHaveValue('  ТЕЧЬ  ');
  await search.fill('несуществующее');
  await expect(page.getByText('Ничего не найдено', { exact: true })).toBeVisible();
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await page.getByRole('link', { name: 'Явления', exact: true }).click();
  await search.fill('течь');
  await expect(page.getByRole('button', { name: 'Открыть карточку: Вода', exact: true })).toBeVisible();
  await expect(page.locator('.symbol-card:not([disabled])')).toHaveCount(1);
});

test('search immediately follows persisted creation and edits', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Поиск по словарю' });
  await search.fill('лужа');
  await page.getByRole('button', { name: 'Добавить карточку', exact: true }).click();
  await page.getByRole('textbox', { name: 'Основное значение группы 1', exact: true }).fill('Лужа');
  await page.getByRole('button', { name: 'Сохранить карточку', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть карточку', exact: true }).click();
  const hit = page.getByRole('button', { name: 'Открыть карточку: Лужа', exact: true });
  await expect(hit).toBeVisible();
  await hit.click();
  await page.getByRole('button', { name: 'Редактировать карточку', exact: true }).click();
  await page.getByRole('textbox', { name: 'Основное значение группы 1', exact: true }).fill('Озеро');
  await page.getByRole('button', { name: 'Сохранить карточку', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть карточку', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Ничего не найдено', { exact: true })).toBeVisible();
  await search.fill('озеро');
  await expect(page.getByRole('button', { name: 'Открыть карточку: Озеро', exact: true })).toBeVisible();
});

test('Home sign stays square and centered in each navigation slot', async ({ page }) => {
  for (const path of ['dictionary', 'glyphs', 'diary']) {
    await page.goto(`/#/${path}`);
    await page.locator('.nav-center').click();
    const button = page.getByRole('button', { name: 'Главная', exact: true });
    await expect(button).toBeVisible();
    const icon = button.locator('svg[data-icon="home"]');
    await expect(icon).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    // Wait for the spring to settle before comparing geometry.
    await expect.poll(async () => {
      const a = await button.boundingBox(), b = await icon.boundingBox();
      return !!a && !!b && Math.abs(b.width - b.height) < .1 && Math.abs((a.x + a.width / 2) - (b.x + b.width / 2)) < .5 && Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) < .5;
    }).toBe(true);
    await button.click();
    await expect(page.getByRole('heading', { name: 'Главная', exact: true })).toBeAttached();
  }
});
