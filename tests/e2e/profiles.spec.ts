import { test, expect, type Page } from '@playwright/test';

async function create(page: Page, name: string) {
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название письменности', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function navigationReady(page: Page) {
  await expect(page.locator('.bottom-navigation')).toHaveCSS('opacity', '1');
  await expect.poll(() => page.locator('.bottom-navigation').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(0);
  await expect(page.locator('.nav-center')).toBeInViewport();
}
test('five profiles, edit icons, switch with clean search and select backup target independently', async ({ page }, info) => {
  await page.goto('/?demo=1#/settings');
  await expect(page.locator('.active-profile-title')).toContainText('Моя письменность');
  await expect(page.locator('.sleepy-mascot')).toHaveJSProperty('naturalWidth', 531);
  await navigationReady(page);
  await expect(page.locator('.settings-v12')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('settings.png') });
  const card = page.getByRole('button', { name: 'Открыть профили', exact: true });
  const cardBounds = await card.boundingBox(), subtitle = await page.locator('.active-profile-title p').boundingBox();
  await card.click({ position: { x: subtitle!.x + subtitle!.width / 2 - cardBounds!.x, y: subtitle!.y + subtitle!.height / 2 - cardBounds!.y } });
  for (const name of ['Первая', 'Вторая', 'Третья', 'Четвёртая']) await create(page, name);
  await expect(page.locator('.profile-list-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название письменности', exact: true }).fill('Шестая');
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('пять бесплатных');
  await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать профиль: Первая', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название письменности', exact: true }).fill('Лунная письменность');
  await page.getByRole('button', { name: 'Луна', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Активировать профиль: Лунная письменность', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Активировать профиль: Лунная письменность', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.profile-list-card').last()).toHaveCSS('opacity', '1');
  await navigationReady(page);
  await page.screenshot({ path: info.outputPath('profiles.png') });
  await page.locator('.nav-center').click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('.symbol-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('.active-profile-title')).toContainText('Лунная письменность');
  await page.getByRole('button', { name: 'Аккаунт и резервные копии', exact: true }).click();
  await page.getByRole('button', { name: 'Выбрать профиль: Моя письменность', exact: true }).click();
  await expect(page.locator('.backup-profile-choice h2')).toHaveText('Моя письменность');
  await expect(page.locator('.backup-profile-choice .is-selected')).toHaveCSS('background-color', 'rgb(255, 82, 126)');
  await navigationReady(page);
  await page.screenshot({ path: info.outputPath('backups.png') });
  await page.locator('.nav-center').click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('.active-profile-title')).toContainText('Лунная письменность');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.locator('.active-profile-title')).toContainText('Лунная письменность');
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Следующий профиль', exact: true }).click();
  await expect(page.locator('.active-profile-title')).toContainText('Вторая');
});

test('clearing and deleting a selected inactive profile require confirmation and preserve the active dictionary', async ({ page }) => {
  await page.goto('/?demo=1#/settings/profiles');
  await create(page, 'Удаляемая');
  await page.getByRole('button', { name: 'Управление профилем: Удаляемая', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Очистить профиль', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Очистить профиль', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Очистить профиль', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/?demo=1#/settings/backups');
  await page.getByRole('button', { name: 'Выбрать профиль: Удаляемая', exact: true }).click();
  await page.getByRole('button', { name: 'Очистить профиль', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Очистить профиль', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Очистить профиль', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/?demo=1#/settings/profiles');
  await page.getByRole('button', { name: 'Управление профилем: Удаляемая', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Удалить профиль', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить профиль', exact: true }).click();
  await expect(page.locator('.profile-list-card')).toHaveCount(1);
  await page.locator('.nav-center').click();
  await expect(page.getByRole('button', { name: 'Открыть карточку: Вода', exact: true })).toBeVisible();
});
