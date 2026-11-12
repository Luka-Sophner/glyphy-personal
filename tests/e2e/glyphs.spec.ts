import { test, expect } from '@playwright/test';

test('corner offers a number or any symbol and a phrase persists all of its glyphs', async ({page}) => {
  await page.goto('/?demo=1#/glyphs');
  await page.getByRole('button', {name:'Добавить глиф', exact:true}).click();
  await page.getByRole('button', {name:'Нумерация: пусто', exact:true}).click();
  await expect(page.getByRole('button', {name:'Пронумеровать', exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Выбрать любой символ', exact:true}).click();
  await page.getByRole('button', {name:'Выбрать символ: Мокрый', exact:true}).click();
  await page.getByRole('textbox', {name:'Значение', exact:true}).fill('Первая часть');
  await page.getByRole('button', {name:'+ Добавить глиф в связку', exact:true}).click();
  await page.getByRole('textbox', {name:'Значение', exact:true}).fill('Вторая часть');
  await page.getByRole('button', {name:'Явление: пусто', exact:true}).click();
  await page.getByRole('button', {name:'Выбрать символ: Вода', exact:true}).click();
  await page.getByRole('button', {name:'Обращение к нумерации: пусто', exact:true}).click();
  await page.getByRole('button', {name:'Пронумеровать', exact:true}).click();
  await page.getByRole('spinbutton', {name:'Номер', exact:true}).fill('1');
  await page.getByRole('button', {name:'Применить', exact:true}).click();
  await page.getByRole('button', {name:'Глиф 1', exact:true}).click();
  await expect(page.getByRole('textbox', {name:'Значение', exact:true})).toHaveValue('Первая часть');
  await expect(page.getByRole('button', {name:'Нумерация: Мокрый', exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Сохранить связку', exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('searchbox', {name:'Поиск глифов'}).fill('вторая часть');
  await expect(page.locator('.glyph-card:not([disabled])')).toHaveCount(1);
  await page.locator('.glyph-card:not([disabled])').click();
  await expect(page.locator('dialog .glyph-cell')).toHaveCount(18);
  await page.getByRole('button', {name:'Ядро: Вода', exact:true}).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.goBack();
  await expect(page.getByRole('button', {name:'Ядро: Вода', exact:true})).toBeFocused();
  await page.getByRole('button', {name:'Редактировать глиф', exact:true}).click();
  await page.getByRole('button', {name:'Глиф 2', exact:true}).click();
  await page.getByRole('button', {name:'Убрать этот глиф из связки', exact:true}).click();
  await page.getByRole('button', {name:'Сохранить', exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('.glyph-card .glyph-composition')).toHaveCount(0);
});

test('gallery has two columns and nine real cells in every card', async ({page}, testInfo) => {
  await page.goto('/?demo=1#/glyphs');
  await expect(page.locator('.glyph-card')).toHaveCount(7);
  expect(await page.locator('.glyph-gallery-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
  for(const card of await page.locator('.glyph-card').all()) await expect(card.locator('.glyph-cell')).toHaveCount(9);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('glyph-gallery.png')});
  await page.getByRole('button',{name:'Открыть глиф: Вода',exact:true}).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.screenshot({path:testInfo.outputPath('glyph-preview.png')});
});

test('nested dictionary preview keeps one focus trap and returns to the scrolled glyph',async({page})=>{
  await page.setViewportSize({width:393,height:500});
  await page.goto('/?demo=1#/glyphs');
  await page.getByRole('button',{name:'Открыть глиф: Вода',exact:true}).click();
  const dialog=page.locator('dialog[open]');
  await expect(dialog.getByRole('button',{name:'Ядро: Вода',exact:true})).toBeVisible();
  await dialog.evaluate(el=>{el.scrollTop=80;});
  const source=dialog.getByRole('button',{name:'Ядро: Вода',exact:true});
  await source.scrollIntoViewIfNeeded();
  const before=await dialog.evaluate(el=>el.scrollTop);
  await source.click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(dialog.getByRole('button',{name:'Закрыть карточку',exact:true})).toBeFocused();
  await expect(dialog.getByText('Явления',{exact:true})).toBeVisible();
  await expect(dialog.locator('.preview-image')).toHaveJSProperty('naturalWidth',948);
  await page.keyboard.press('Escape');
  await expect(source).toBeFocused();
  expect(Math.abs(await dialog.evaluate(el=>el.scrollTop)-before)).toBeLessThan(2);
  await source.click();await page.goBack();await expect(source).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
});

test('editing a nested symbol returns to its parent glyph, not to the gallery',async({page})=>{
  await page.goto('/?demo=1#/glyphs');await page.getByRole('button',{name:'Открыть глиф: Вода',exact:true}).click();
  await page.getByRole('button',{name:'Ядро: Вода',exact:true}).click();
  await page.getByRole('button',{name:'Редактировать карточку',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Основное значение группы 1',exact:true})).toHaveValue('Вода');
  await page.getByRole('button',{name:'Закрыть редактор',exact:true}).click();
  await page.getByRole('button',{name:'Закрыть карточку',exact:true}).click();
  await expect(page.getByRole('button',{name:'Закрыть глиф',exact:true})).toBeVisible();
});

test('search is scoped to glyph fields and keeps the query across its popup',async({page})=>{
  await page.goto('/?demo=1#/glyphs');const search=page.getByRole('searchbox',{name:'Поиск глифов'});
  await search.fill('  ЖИЛЬЕ  ');await expect(page.locator('.glyph-card:not([disabled])')).toHaveCount(1);
  await page.getByRole('button',{name:'Открыть глиф: Дом',exact:true}).click();await page.keyboard.press('Escape');
  await expect(search).toHaveValue('  ЖИЛЬЕ  ');
  await search.fill('неизвестно');await expect(page.getByText('Ничего не найдено',{exact:true})).toBeVisible();
});

test('unavailable source shows saved meaning without an invalid navigation',async({page})=>{
  await page.goto('/?demo=1#/glyphs');await page.getByRole('searchbox',{name:'Поиск глифов'}).fill('исторический');
  await page.getByRole('button',{name:'Открыть глиф: Сохранённое прочтение',exact:true}).click();
  await expect(page.getByText('Исходный символ недоступен',{exact:true})).toBeVisible();
  await expect(page.locator('dialog .glyph-cell')).toHaveCount(9);await expect(page.locator('dialog button[data-glyph-position]')).toHaveCount(0);
  await expect(page.locator('dialog .glyph-missing-reading')).toHaveText('Вода');
});

test('normal empty gallery opens the constructor and validates the draft',async({page})=>{
  await page.goto('/#/glyphs');await expect(page.getByText('Глифов пока нет. Создайте первый глиф.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Добавить глиф',exact:true}).click();await expect(page.getByRole('dialog',{name:'Создание глифа',exact:true})).toBeVisible();
  await expect(page.locator('dialog [data-editor-position]')).toHaveCount(9);await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('Введите значение глифа.');await page.keyboard.press('Escape');await expect(page.locator('.glyph-card')).toHaveCount(0);
});

test('deleting a demo glyph never deletes its dictionary symbol or reseeds the gallery',async({page})=>{
  await page.goto('/?demo=1#/glyphs');await page.getByRole('button',{name:'Открыть глиф: Вода',exact:true}).click();
  await page.getByRole('button',{name:'Удалить глиф',exact:true}).click();await page.getByRole('button',{name:'Удалить',exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);await page.reload();await expect(page.locator('.glyph-card:not([disabled])')).toHaveCount(6);
  await page.getByRole('button',{name:'Открыть меню',exact:true}).click();await page.getByRole('button',{name:'Главная',exact:true}).click();
  await expect(page.getByRole('button',{name:'Открыть карточку: Вода',exact:true})).toBeVisible();
});


test('constructor selects three readings, saves without a stale dialog, edits and survives reload', async ({page}) => {
  await page.goto('/?demo=1#/glyphs');await page.getByRole('button',{name:'Добавить глиф',exact:true}).click();
  for(const [position,query,meaning] of [['Явление','жидкость','Вода'],['Событие','льет','Течь'],['Качество','мок','Мокрый']]) {
    await page.getByRole('button',{name:position+': пусто',exact:true}).click();
    // Category search must not match readings from other categories of the same card.
    if(position==='Событие'){await page.getByRole('searchbox',{name:'Поиск символа для ячейки'}).fill('вода');await expect(page.getByRole('button',{name:'Выбрать символ: Течь',exact:true})).toHaveCount(0);}
    await page.getByRole('searchbox',{name:'Поиск символа для ячейки'}).fill(position==='Событие'?'течь':query);
    await page.getByRole('button',{name:'Выбрать символ: '+meaning,exact:true}).click();
  }
  await page.getByRole('textbox',{name:'Значение',exact:true}).fill('Проверка конструктора');await page.getByRole('textbox',{name:'Синонимы',exact:true}).fill('Последняя капля');await page.getByRole('textbox',{name:'Синонимы',exact:true}).press('Enter');
  await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  await page.reload();await page.getByRole('button',{name:'Открыть глиф: Проверка конструктора',exact:true}).click();
  await page.getByRole('button',{name:'Ядро: Вода',exact:true}).click();await expect(page.locator('dialog[open]')).toHaveCount(1);await page.goBack();await expect(page.getByRole('button',{name:'Редактировать глиф',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Редактировать глиф',exact:true}).click();await page.getByRole('button',{name:'Явление: Вода',exact:true}).click();await page.getByRole('button',{name:'Заменить символ',exact:true}).click();await page.getByRole('button',{name:'Выбрать символ: Дом',exact:true}).click();
  await page.getByRole('button',{name:'Качество: Мокрый',exact:true}).click();await page.getByRole('button',{name:'Очистить ячейку',exact:true}).click();await expect(page.getByRole('button',{name:'Качество: пусто',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Открыть глиф: Проверка конструктора',exact:true})).toHaveCount(1);
});

test('constructor Back closes only the picker and protects an unsaved draft',async({page})=>{
  await page.goto('/?demo=1#/glyphs');await page.getByRole('button',{name:'Добавить глиф',exact:true}).click();await page.getByRole('textbox',{name:'Значение',exact:true}).fill('Черновик');await page.getByRole('button',{name:'Явление: пусто',exact:true}).click();await page.goBack();await expect(page.getByRole('textbox',{name:'Значение',exact:true})).toHaveValue('Черновик');
  await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog',{name:'Несохранённые изменения'})).toBeVisible();await page.getByRole('button',{name:'Продолжить редактирование',exact:true}).click();await expect(page.getByRole('textbox',{name:'Значение',exact:true})).toHaveValue('Черновик');
});

test('closing unchanged editor returns to exactly one parent preview',async({page})=>{
 await page.goto('/?demo=1#/glyphs');await page.getByRole('button',{name:'Открыть глиф: Вода',exact:true}).click();await page.getByRole('button',{name:'Редактировать глиф',exact:true}).click();await page.getByRole('button',{name:'Закрыть редактор глифа',exact:true}).click();await page.getByRole('button',{name:'Закрыть глиф',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);await expect(page).toHaveURL(/#\/glyphs$/);
});
