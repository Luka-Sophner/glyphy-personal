import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { diaryPng, exifOrientationSegment } from '../fixtures/diary-images.mjs';

const portrait = { name: 'portrait.png', mimeType: 'image/png', buffer: diaryPng(96, 192) };
const landscape = { name: 'landscape.png', mimeType: 'image/png', buffer: diaryPng(192, 96) };
async function openNew(page: Page) {
  await page.goto('/?demo=1#/diary'); await expect(page.getByText('В дневнике пока нет записей.', { exact: true })).toBeVisible();
  await page.locator('.nav-add').click(); await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toBeVisible();
}
async function upload(page: Page, files = [portrait]) {
  await page.locator('input[data-diary-upload=gallery]').setInputFiles(files);
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled();
}
async function saveToPreview(page: Page) {
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Закрыть запись', exact: true })).toBeVisible();
}
async function readDiary(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open('glyphy-demo');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const get = (name: string) => new Promise<any[]>((resolve, reject) => { const request = db.transaction(name, 'readonly').objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const entries = await get('diaryEntries'), assets = await get('media'); db.close();
    const photos = [];
    for (const asset of assets) {
      const bytes = new Uint8Array(await asset.blob.arrayBuffer()); let binary = '';
      for (let index = 0; index < bytes.length; index += 16384) binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
      photos.push({ id: asset.id, width: asset.width, height: asset.height, mimeType: asset.mimeType, base64: btoa(binary) });
    }
    return { entries, photos };
  });
}

test('one photo, no description, exact original bytes, automatic date and restart', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 }); await openNew(page);
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Солнечный Луч'); await upload(page);
  await expect(page.locator('input[data-diary-upload=camera]')).toHaveAttribute('capture', 'environment');
  await expect(page.locator('.diary-editor-photo img')).toHaveJSProperty('naturalWidth', 96);
  await page.screenshot({ path: testInfo.outputPath('diary-editor-393x852.png') });
  await saveToPreview(page); await expect(page.locator('dialog .diary-description')).toHaveCount(0);
  const saved = await readDiary(page); expect(saved.entries).toHaveLength(1); expect(saved.entries[0].title).toBe('Солнечный Луч'); expect(saved.entries[0].description).toBe('');
  const photo = saved.photos.find(photo => photo.id === saved.entries[0].imageIds[0])!; expect(Buffer.from(photo.base64, 'base64').equals(portrait.buffer)).toBe(true);
  await page.reload(); await expect(page.locator('#diary-preview-title')).toHaveText('Солнечный Луч'); await expect(page.locator('dialog img')).toHaveJSProperty('naturalHeight', 192);
  await page.getByRole('button', { name: 'Закрыть запись', exact: true }).click(); await expect(page.locator('.diary-card-date')).toHaveText(saved.entries[0].observationDate.split('-').reverse().join('/'));
});
test('multiple photos, replacement and removal retain the remaining images and original dates', async ({ page }) => {
  await openNew(page); await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Два снимка'); await page.getByRole('textbox', { name: 'Описание', exact: true }).fill('Первая строка\nВторая строка');
  await page.getByLabel('Дата наблюдения', { exact: true }).fill('2025-03-04'); await upload(page, [portrait, landscape]); await expect(page.locator('.diary-editor-thumbnail')).toHaveCount(2); await saveToPreview(page);
  const before = await readDiary(page); await page.getByRole('button', { name: 'Редактировать запись', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Описание', exact: true })).toHaveValue('Первая строка\nВторая строка'); await expect(page.getByLabel('Дата наблюдения', { exact: true })).toHaveValue('2025-03-04');
  await page.getByRole('button', { name: 'Фото 2', exact: true }).click();
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Заменить', exact: true }).click();
  const replacement = { name: 'replacement.png', mimeType: 'image/png', buffer: diaryPng(160, 80) }; await (await chooser).setFiles(replacement); await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Обновлённая запись'); await saveToPreview(page);
  const after = await readDiary(page); expect(after.entries[0].imageIds[0]).toBe(before.entries[0].imageIds[0]); expect(after.entries[0].imageIds[1]).not.toBe(before.entries[0].imageIds[1]); expect(after.entries[0].createdAt).toBe(before.entries[0].createdAt); expect(after.entries[0].observationDate).toBe('2025-03-04');
  expect(Buffer.from(after.photos.find(photo => photo.id === after.entries[0].imageIds[1])!.base64, 'base64').equals(replacement.buffer)).toBe(true);
  await page.getByRole('button', { name: 'Редактировать запись', exact: true }).click(); await page.getByRole('button', { name: 'Удалить фото', exact: true }).click(); await saveToPreview(page);
  const removed = await readDiary(page); expect(removed.entries[0].imageIds).toEqual([after.entries[0].imageIds[1]]); await expect(page.getByRole('button', { name: 'Следующее фото', exact: true })).toHaveCount(0);
});
test('unsaved changes offer save, continue and discard without losing local photos', async ({ page }) => {
  await openNew(page); await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Черновик'); await upload(page);
  await page.getByRole('button', { name: 'Закрыть редактор дневника', exact: true }).click(); await expect(page.getByRole('alertdialog', { name: 'Несохранённые изменения', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить и выйти', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Выйти без сохранения', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить редактирование', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toHaveValue('Черновик'); await expect(page.locator('.diary-editor-photo img')).toHaveJSProperty('naturalHeight', 192);
  await page.getByRole('button', { name: 'Закрыть редактор дневника', exact: true }).click(); await page.getByRole('button', { name: 'Сохранить и выйти', exact: true }).click(); await expect(page.locator('dialog')).toHaveCount(0); expect((await readDiary(page)).entries).toHaveLength(1);
});
test('discarding a new entry never commits its pending image', async ({ page }) => {
  await openNew(page); const before = await readDiary(page); await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Не сохранять'); await upload(page);
  await page.getByRole('button', { name: 'Закрыть редактор дневника', exact: true }).click(); await page.getByRole('button', { name: 'Выйти без сохранения', exact: true }).click(); await expect(page.locator('dialog')).toHaveCount(0);
  const after = await readDiary(page); expect(after.entries).toHaveLength(0); expect(after.photos.map(photo => photo.id).sort()).toEqual(before.photos.map(photo => photo.id).sort());
});
test('invalid title, missing photo, SVG and unsupported HEIC leave the form intact', async ({ page }) => {
  await openNew(page); await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await expect(page.getByRole('alert')).toHaveText('Введите название записи.');
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Мой текст'); await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await expect(page.getByRole('alert')).toHaveText('Добавьте хотя бы одну фотографию.');
  await page.locator('input[data-diary-upload=gallery]').setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') }); await expect(page.getByRole('alert')).toContainText('SVG');
  await page.locator('input[data-diary-upload=gallery]').setInputFiles({ name: 'unsupported.heic', mimeType: 'image/heic', buffer: Buffer.from('not a decodable HEIC file') }); await expect(page.getByRole('alert')).toContainText('Преобразуйте');
  await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toHaveValue('Мой текст'); expect((await readDiary(page)).entries).toHaveLength(0);
});
test('save failure keeps title, description and pending original; retry succeeds', async ({ page }) => {
  await openNew(page); await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Не потерять'); await page.getByRole('textbox', { name: 'Описание', exact: true }).fill('Сохраняемый текст'); await upload(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    (window as any).__restoreDiaryAdd = () => { IDBObjectStore.prototype.add = original; };
    IDBObjectStore.prototype.add = function (...args: any[]) { if (this.name === 'media') throw new DOMException('Test quota', 'QuotaExceededError'); return original.apply(this, args as [any]); };
  });
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Недостаточно места'); await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toHaveValue('Не потерять'); await expect(page.getByRole('textbox', { name: 'Описание', exact: true })).toHaveValue('Сохраняемый текст'); await expect(page.locator('.diary-editor-photo img')).toHaveJSProperty('naturalWidth', 96);
  expect((await readDiary(page)).entries).toHaveLength(0); await page.evaluate(() => (window as any).__restoreDiaryAdd()); await saveToPreview(page); expect((await readDiary(page)).entries).toHaveLength(1);
});
test('JPEG EXIF orientation produces an upright thumbnail and keeps the untouched original file', async ({ page }) => {
  await openNew(page);
  const jpeg = Buffer.from(await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64; const context = canvas.getContext('2d')!; context.fillStyle = 'white'; context.fillRect(0, 0, 128, 64); context.fillStyle = 'black'; context.fillRect(1, 1, 126, 1); return canvas.toDataURL('image/jpeg', 1).split(',')[1]; }), 'base64');
  const rotated = Buffer.concat([jpeg.subarray(0, 2), exifOrientationSegment(6), jpeg.subarray(2)]);
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('EXIF'); await upload(page, [{ name: 'oriented.jpg', mimeType: 'image/jpeg', buffer: rotated }]); await expect(page.locator('.diary-editor-photo img')).toHaveJSProperty('naturalWidth', 64); await saveToPreview(page);
  const saved = await readDiary(page), photo = saved.photos.find(photo => photo.id === saved.entries[0].imageIds[0])!; expect(photo.width).toBe(64); expect(photo.height).toBe(128); expect(Buffer.from(photo.base64, 'base64').equals(rotated)).toBe(true);
});
async function offlineCreate(page: Page, context: BrowserContext) {
  await openNew(page); await context.setOffline(true);
  try { await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Без интернета'); await upload(page); await saveToPreview(page); await expect(page.locator('dialog img')).toHaveJSProperty('naturalWidth', 96); }
  finally { await context.setOffline(false); }
}
test('entry deletion requires confirmation and collects only its unshared photo', async ({ page }) => {
  await openNew(page); const initial = await readDiary(page); await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Для удаления'); await upload(page); await saveToPreview(page);
  await page.getByRole('button', { name: 'Удалить запись', exact: true }).click(); await page.getByRole('button', { name: 'Отмена', exact: true }).click(); expect((await readDiary(page)).entries).toHaveLength(1);
  await page.getByRole('button', { name: 'Удалить запись', exact: true }).click(); await page.getByRole('button', { name: 'Удалить', exact: true }).click(); await expect(page.locator('dialog')).toHaveCount(0);
  const removed = await readDiary(page); expect(removed.entries).toHaveLength(0); expect(removed.photos.map(photo => photo.id).sort()).toEqual(initial.photos.map(photo => photo.id).sort());
});
test('loaded application creates and reads a diary entry with networking disabled', async ({ page, context }) => { await offlineCreate(page, context); await page.reload(); await expect(page.locator('#diary-preview-title')).toHaveText('Без интернета'); });
test('production PWA reopens the saved original after an offline reload', async ({ page, context }) => {
  test.skip(process.env.GLYPHY_TEST_PWA !== '1', 'Requires production preview with its service worker.');
  await openNew(page); await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Без интернета'); await upload(page); await saveToPreview(page);
  await expect.poll(() => page.evaluate(async () => 'serviceWorker' in navigator && (await navigator.serviceWorker.getRegistrations()).length > 0), { message: 'Run against the production preview with its service worker.' }).toBe(true);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true); await context.setOffline(true);
  try { await page.reload(); await expect(page.locator('#diary-preview-title')).toHaveText('Без интернета'); await expect(page.locator('dialog img')).toHaveJSProperty('naturalHeight', 192); }
  finally { await context.setOffline(false); }
});
