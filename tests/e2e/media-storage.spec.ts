import { test, expect, type Page } from '@playwright/test';
import { diaryPng } from '../fixtures/diary-images.mjs';

const bytes = diaryPng(96, 128);

async function storedPhotos(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('glyphy');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const get = db.transaction('media').objectStore('media').getAll();
      return await new Promise<{ binary: boolean; mime: string; bytes: number[] }[]>((resolve, reject) => {
        get.onsuccess = () => resolve(get.result.map(asset => ({
          binary: asset.blob instanceof ArrayBuffer && asset.thumbnailBlob instanceof ArrayBuffer,
          mime: asset.mimeType, bytes: Array.from(new Uint8Array(asset.blob)),
        })));
        get.onerror = () => reject(get.error);
      });
    } finally { db.close(); }
  });
}

test('browser saves and displays exact image bytes when IndexedDB refuses Blob writes', async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ['add', 'put'] as const) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (value, ...args) {
        if (this.name === 'media' && (value.blob instanceof Blob || value.thumbnailBlob instanceof Blob)) {
          throw new DOMException('Failed to write blobs (InvalidBlob)', 'DataError');
        }
        return original.call(this, value, ...args);
      };
    }
  });
  await page.goto('/');
  await page.locator('.nav-add').click();
  await page.getByRole('textbox', { name: 'Основное значение группы 1', exact: true }).fill('Фото');
  await page.locator('.photo-picker input').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.locator('.photo-picker img')).toHaveJSProperty('naturalWidth', 96);
  await expect(page.locator('.save-card')).toBeEnabled();

  // Fail the card write after the media write. Retry must retain the entire draft.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === 'cards') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      return original.call(this, value, ...args);
    };
  });
  await page.locator('.save-card').click();
  await expect(page.locator('.editor-error')).toContainText('Недостаточно');
  await expect(page.getByRole('textbox', { name: 'Основное значение группы 1', exact: true })).toHaveValue('Фото');
  await expect(page.locator('.photo-picker img')).toHaveJSProperty('naturalWidth', 96);
  expect(await storedPhotos(page)).toEqual([]);

  await page.locator('.save-card').click();
  await expect(page.locator('.preview-image')).toHaveJSProperty('naturalWidth', 96);
  const photos = await storedPhotos(page);
  expect(photos).toEqual([{ binary: true, mime: 'image/png', bytes: Array.from(bytes) }]);
  await page.reload();
  await expect(page.locator('.preview-image')).toHaveJSProperty('naturalWidth', 96);
});
