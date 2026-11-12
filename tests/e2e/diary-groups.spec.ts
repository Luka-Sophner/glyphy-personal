import { test, expect, type Page } from '@playwright/test';
import { diaryPng } from '../fixtures/diary-images.mjs';
const payload = (landscape = false) => ({ name: landscape ? 'landscape.png' : 'portrait.png', mimeType: 'image/png', buffer: diaryPng(landscape ? 192 : 96, landscape ? 96 : 192) });
async function read(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open('glyphy-demo'), db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const rows = (name: string) => new Promise<any[]>((resolve, reject) => { const request = db.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const entries = await rows('diaryEntries'), groups = await rows('diaryGroups'), media = await rows('media'); db.close(); return { entries, groups: groups.sort((a, b) => a.order - b.order), mediaIds: media.map(asset => asset.id).sort() };
  });
}
async function addPost(page: Page, title: string, date: string, landscape = false) {
  await page.locator('.nav-add').click(); await page.getByRole('textbox', { name: 'Название', exact: true }).fill(title); await page.getByLabel('Дата наблюдения', { exact: true }).fill(date);
  await page.locator('input[data-diary-upload=gallery]').setInputFiles(payload(landscape)); await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled(); await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await page.getByRole('button', { name: 'Закрыть запись', exact: true }).click(); await expect(page.locator('dialog')).toHaveCount(0);
}
async function diary(page: Page) {
  await page.goto('/?demo=1#/diary'); await expect(page.getByText('В дневнике пока нет записей.', { exact: true })).toBeVisible();
  await addPost(page, 'Первая запись', '2025-01-01'); await addPost(page, 'Последняя запись', '2026-01-01', true);
}
async function manage(page: Page) { await page.getByRole('button', { name: 'Управлять группами', exact: true }).click(); await expect(page.locator('dialog .diary-group-order-list')).toBeVisible(); }
async function createGroup(page: Page, title: string) {
  const existing = await page.locator('.diary-group-card').count();
  if (!existing) await page.getByRole('button', { name: 'Создать группу', exact: true }).click();
  else { await manage(page); await page.locator('dialog').getByRole('button', { name: 'Создать группу', exact: true }).click(); }
  await page.getByRole('textbox', { name: 'Название группы', exact: true }).fill(title); await page.getByRole('button', { name: 'Сохранить группу', exact: true }).click();
  if (existing) await page.getByRole('button', { name: 'Закрыть управление группами', exact: true }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
}
async function assignBoth(page: Page, group: string) {
  await manage(page); await page.locator('.diary-group-order-row').filter({ hasText: group }).getByRole('button', { name: 'Записи', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Включить запись: Первая запись', exact: true }).check(); await page.getByRole('checkbox', { name: 'Включить запись: Последняя запись', exact: true }).check();
  await page.getByRole('button', { name: 'Сохранить распределение', exact: true }).click(); await expect(page.locator('dialog .diary-group-order-list')).toBeVisible();
}

test('no groups keep the full feed; groups form a horizontal shelf above all posts', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 }); await diary(page); await expect(page.locator('.diary-card')).toHaveCount(2); await expect(page.locator('.diary-group-strip')).toHaveCount(0);
  await createGroup(page, 'Правила'); await expect(page.locator('.diary-group-card')).toHaveCount(1); await expect(page.locator('.diary-card')).toHaveCount(2); await expect(page.locator('.diary-card-title').first()).toHaveText('Последняя запись');
  await createGroup(page, 'Хокку'); await createGroup(page, 'Наблюдения'); expect(await page.locator('.diary-group-strip').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: testInfo.outputPath('diary-groups-393x852.png') });
  await page.getByRole('button', { name: 'Открыть группу: Правила', exact: true }).click(); await page.locator('.nav-add').click();
  const group = (await read(page)).groups.find(group => group.title === 'Правила')!; await expect(page.getByRole('combobox', { name: 'Группа записи', exact: true })).toHaveValue(group.id);
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Статья в правилах'); await page.locator('input[data-diary-upload=gallery]').setInputFiles(payload()); await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled(); await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await page.getByRole('button', { name: 'Закрыть запись', exact: true }).click();
  await expect(page.locator('.diary-card-title')).toHaveText('Статья в правилах'); expect((await read(page)).entries.find(entry => entry.title === 'Статья в правилах')!.groupId).toBe(group.id);
});
test('bulk assignment, entry picker and deleting a group retain posts and every image', async ({ page }) => {
  await diary(page); const before = await read(page); await createGroup(page, 'Правила'); await assignBoth(page, 'Правила'); await page.getByRole('button', { name: 'Закрыть управление группами', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть группу: Правила', exact: true }).click(); await expect(page.locator('.diary-card')).toHaveCount(2);
  await createGroup(page, 'Хокку'); await page.getByRole('button', { name: 'Открыть запись: Первая запись', exact: true }).click();
  const second = (await read(page)).groups.find(group => group.title === 'Хокку')!; await page.getByRole('combobox', { name: 'Группа записи', exact: true }).selectOption(second.id);
  await expect.poll(async () => (await read(page)).entries.find(entry => entry.title === 'Первая запись')!.groupId).toBe(second.id); await page.getByRole('button', { name: 'Закрыть запись', exact: true }).click();
  await manage(page); await page.locator('dialog').getByRole('button', { name: 'Удалить группу: Хокку', exact: true }).click(); await expect(page.getByRole('alertdialog', { name: 'Подтверждение удаления группы', exact: true })).toContainText('Записи и фотографии сохранятся');
  await page.getByRole('button', { name: 'Удалить группу', exact: true }).click(); await expect(page.locator('dialog .diary-group-order-row')).toHaveCount(1);
  const after = await read(page); expect(after.entries).toHaveLength(2); expect(after.mediaIds).toEqual(before.mediaIds); const moved = after.entries.find(entry => entry.title === 'Первая запись')!; expect(moved.groupId).toBeNull(); expect(moved.imageIds).toEqual(before.entries.find(entry => entry.id === moved.id)!.imageIds);
  await page.locator('dialog').getByRole('button', { name: 'Без группы', exact: true }).click(); await expect(page.locator('.diary-card-title')).toHaveText('Первая запись');
});
test('order buttons, rename and explicit cover persist after reopening', async ({ page }) => {
  await diary(page); await createGroup(page, 'Правила'); await createGroup(page, 'Хокку'); await createGroup(page, 'Наблюдения'); await assignBoth(page, 'Правила');
  await page.getByRole('button', { name: 'Поднять группу: Наблюдения', exact: true }).click(); await expect(page.getByRole('button', { name: 'Поднять группу: Наблюдения', exact: true })).toBeEnabled(); await page.getByRole('button', { name: 'Поднять группу: Наблюдения', exact: true }).click(); await expect(page.getByRole('button', { name: 'Поднять группу: Наблюдения', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Редактировать группу: Правила', exact: true }).click(); await page.getByRole('textbox', { name: 'Название группы', exact: true }).fill('Мои правила');
  const first = (await read(page)).entries.find(entry => entry.title === 'Первая запись')!; await page.getByRole('combobox', { name: 'Обложка группы', exact: true }).selectOption(first.id); await page.getByRole('button', { name: 'Сохранить группу', exact: true }).click(); await page.getByRole('button', { name: 'Закрыть управление группами', exact: true }).click(); await page.reload();
  await expect(page.locator('.diary-group-title')).toHaveText(['Наблюдения', 'Мои правила', 'Хокку']); await expect.poll(() => page.getByRole('button', { name: 'Открыть группу: Мои правила', exact: true }).locator('img').evaluate((image: HTMLImageElement) => image.naturalHeight > image.naturalWidth)).toBe(true);
});
test('drag handle reorders groups and saves the final order once released', async ({ page }) => {
  await diary(page); await createGroup(page, 'A'); await createGroup(page, 'B'); await createGroup(page, 'C'); await manage(page);
  const from = await page.getByRole('button', { name: 'Перетащить группу: A', exact: true }).boundingBox(), to = await page.getByRole('button', { name: 'Перетащить группу: C', exact: true }).boundingBox();
  expect(from).not.toBeNull(); expect(to).not.toBeNull(); await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height + 20, { steps: 20 }); await page.waitForTimeout(80); await page.mouse.up();
  await expect.poll(async () => (await read(page)).groups.map(group => group.title)).toEqual(['B', 'C', 'A']);
});

test('custom cover upload survives reload, can be replaced and removed', async ({page}) => {
  await diary(page); await createGroup(page,'Custom'); await manage(page);
  await page.locator('.diary-group-order-row').filter({hasText:'Custom'}).locator('button').nth(4).click();
  await page.getByLabel('Загрузить обложку группы',{exact:true}).setInputFiles(payload(true));
  await expect(page.locator('.diary-group-cover-preview img')).toBeVisible();
  await page.locator('form button[type=submit]').click();
  await page.locator('.modal-toolbar button').click();
  await page.reload();
  await expect.poll(async()=> (await read(page)).groups[0]?.coverImageId).toBeTruthy();
  await expect.poll(()=>page.locator('.diary-group-cover img').evaluate((img:HTMLImageElement)=>img.naturalWidth>img.naturalHeight)).toBe(true);
  const before=await read(page), firstCover=before.groups[0].coverImageId;
  await manage(page); await page.locator('.diary-group-order-row').locator('button').nth(4).click();
  await page.getByLabel('Загрузить обложку группы',{exact:true}).setInputFiles(payload());
  await expect(page.locator('form button[type=submit]')).toBeEnabled(); await page.locator('form button[type=submit]').click();
  await expect.poll(async()=> (await read(page)).mediaIds.includes(firstCover)).toBe(false);
  await page.locator('.diary-group-order-row').locator('button').nth(4).click();
  await page.getByRole('button',{name:'Убрать свою обложку',exact:true}).click();
  await page.locator('form button[type=submit]').click(); await page.locator('.modal-toolbar button').click();
  expect((await read(page)).mediaIds).toHaveLength(before.mediaIds.length-1);
  await expect(page.locator('.diary-card')).toHaveCount(2);
});
test('group shelf hides its scrollbar and scrolls with a mouse wheel', async ({page},testInfo) => {
  test.skip(testInfo.project.name!=='desktop-chromium');
  await diary(page);
  for (const title of ['A','B','C','D','E','F']) await createGroup(page,title);
  const strip=page.locator('.diary-group-strip');
  expect(await strip.evaluate(el=>getComputedStyle(el).scrollbarWidth)).toBe('none');
  await strip.hover(); await page.mouse.wheel(0,90);
  await expect.poll(()=>strip.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.locator('.diary-card')).toHaveCount(2);
});
