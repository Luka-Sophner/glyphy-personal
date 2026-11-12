import { test, expect, type Page } from '@playwright/test';

/** Synthetic orientation fixtures, isolated by Playwright's fresh browser context. */
async function seedDiary(page: Page) {
  await page.goto('/?demo=1#/diary');
  await expect(page.getByText('В дневнике пока нет записей.', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const open = indexedDB.open('glyphy-demo');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const makePhoto = async (id: string, width: number, height: number) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d')!; context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); context.fillStyle = '#000000';
      context.fillRect(2, 2, width - 4, 2); context.fillRect(2, height - 4, width - 4, 2); context.fillRect(2, 2, 2, height - 4); context.fillRect(width - 4, 2, 2, height - 4);
      context.font = '16px sans-serif'; context.fillText('Тестовое хайку', 12, 30);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Canvas fixture failed')), 'image/png'));
      return { id, blob, thumbnailBlob: blob, mimeType: 'image/png', width, height, createdAt: Date.now() };
    };
    const media = await Promise.all([makePhoto('diary-portrait', 192, 384), makePhoto('diary-landscape', 384, 192), makePhoto('diary-panorama', 600, 80)]);
    const entries = [
      { id: '00000000-0000-4000-8000-000000000001', title: 'Вертикальное хайку', description: '', imageIds: ['diary-portrait'], observationDate: '2026-11-12', createdAt: '2026-11-12T12:00:00.000Z', updatedAt: '2026-11-12T12:00:00.000Z' },
      { id: '00000000-0000-4000-8000-000000000002', title: 'Два снимка', description: 'Лёд на воде', imageIds: ['diary-landscape', 'diary-panorama'], observationDate: '2026-11-11', createdAt: '2026-11-11T12:00:00.000Z', updatedAt: '2026-11-11T12:00:00.000Z' },
      { id: '00000000-0000-4000-8000-000000000003', title: 'Панорамное хайку', description: '', imageIds: ['diary-panorama'], observationDate: '2026-11-10', createdAt: '2026-11-10T12:00:00.000Z', updatedAt: '2026-11-10T12:00:00.000Z' },
    ];
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['diaryEntries', 'media'], 'readwrite');
      for (const asset of media) transaction.objectStore('media').put(asset);
      for (const entry of entries) transaction.objectStore('diaryEntries').put(entry);
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  });
  // Raw test fixture writes are observed on reload, independently of Dexie's hooks.
  await page.reload(); await expect(page.locator('.diary-card')).toHaveCount(3);
}

test('diary chronology, dates, intact photo proportions and responsive gallery', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 }); await seedDiary(page);
  await expect(page.locator('.diary-card-date')).toHaveText(['12/11/2026', '11/11/2026', '10/11/2026']);
  await expect(page.locator('.diary-card img')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const photo of await page.locator('.diary-card img').all()) expect(await photo.evaluate(element => getComputedStyle(element).objectFit)).toBe('contain');
  await page.screenshot({ path: testInfo.outputPath('diary-393x852.png') });
  await page.getByRole('button', { name: 'Открыть запись: Вертикальное хайку', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1); await expect(page.locator('dialog .diary-description')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Следующее фото', exact: true })).toHaveCount(0);
  await expect(page.locator('dialog img')).toHaveJSProperty('naturalWidth', 192);
  expect(await page.locator('dialog img').evaluate((element: HTMLImageElement) => element.naturalHeight / element.naturalWidth)).toBe(2);
  await page.screenshot({ path: testInfo.outputPath('diary-preview-393x852.png') });
  await page.keyboard.press('Escape'); await expect(page.locator('dialog')).toHaveCount(0);
  for (const viewport of [{ width: 412, height: 915 }, { width: 1365, height: 768 }]) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`diary-${viewport.width}x${viewport.height}.png`) });
  }
});
test('multiple photos switch horizontally and enlarge in one modal; Back closes only enlargement', async ({ page }) => {
  await seedDiary(page); await page.getByRole('button', { name: 'Открыть запись: Два снимка', exact: true }).click();
  await expect(page.locator('dialog .diary-photo-controls')).toHaveText(/1\s*\/\s*2/);
  await page.getByRole('button', { name: 'Следующее фото', exact: true }).click(); await expect(page.locator('dialog .diary-photo-controls')).toHaveText(/2\s*\/\s*2/);
  await page.getByRole('button', { name: 'Открыть фото 2 крупнее', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1); await page.getByRole('button', { name: 'Увеличить фото', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сбросить масштаб', exact: true })).toHaveText('150%');
  await page.goBack(); await expect(page.getByRole('button', { name: 'Открыть фото 2 крупнее', exact: true })).toBeFocused();
  await expect(page.locator('dialog[open]')).toHaveCount(1); await expect(page.locator('dialog .diary-photo-controls')).toHaveText(/2\s*\/\s*2/);
});
test('local diary search does not mix sections and survives closing the entry', async ({ page }) => {
  await seedDiary(page); const search = page.getByRole('searchbox', { name: 'Поиск по дневнику', exact: true });
  await search.fill('  ЛЕД  '); await expect(page.locator('.diary-card:not([disabled])')).toHaveCount(1);
  await page.getByRole('button', { name: 'Открыть запись: Два снимка', exact: true }).click(); await page.keyboard.press('Escape');
  await expect(search).toHaveValue('  ЛЕД  '); await search.fill('12/11/2026'); await expect(page.locator('.diary-card:not([disabled])')).toHaveCount(1);
  await search.fill('Несуществующее'); await expect(page.getByText('Ничего не найдено', { exact: true })).toBeVisible();
});
test('closing entry restores the diary scroll; plus opens the unified editor', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 }); await seedDiary(page);
  const card = page.getByRole('button', { name: 'Открыть запись: Панорамное хайку', exact: true }); await card.scrollIntoViewIfNeeded();
  const previous = await page.evaluate(() => scrollY); await card.click(); await page.keyboard.press('Escape'); await expect(page.locator('dialog')).toHaveCount(0);
  expect(Math.abs(await page.evaluate(() => scrollY) - previous)).toBeLessThan(3);
  await page.locator('.nav-add').click(); await expect(page.getByRole('heading', { name: 'Новая запись дневника', exact: true })).toBeVisible();
  await expect(page.locator('dialog input[type=file]')).toHaveCount(3); await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toBeVisible(); await expect(page.locator('.diary-card')).toHaveCount(3);
});
