import type { GlyphyDatabase } from '../../db/database.js';
import { GlyphRepository } from '../../db/GlyphRepository.js';
import { emptyGlyphCells } from '../../types/glyphs-diary.js';
export async function seedGlyphDemo(db: GlyphyDatabase, enabled: boolean) {
  if (!enabled) return;
  await db.transaction('rw', [db.glyphs, db.cards, db.meta, db.media, db.diaryEntries, db.diaryGroups], async () => {
    if (await db.meta.get('glyph-gallery-demo-initialized')) return;
    if (await db.glyphs.count() === 0) {
      const water = await db.cards.get('example'), house = await db.cards.get('demo-house');
      const examples = [
        { title: 'Вода', synonyms: ['Жидкость', 'Субстанция'], description: 'Вода как явление, движение и качество. Центральная ячейка задаёт ядро, ячейка события — течение, ячейка качества — влажность. Нажмите на любой заполненный квадрат, чтобы открыть настоящий символ словаря. Закройте его, чтобы продолжить чтение глифа с прежнего места.', house: false, flow: true, wet: true },
        { title: 'Дом', synonyms: ['Жилище', 'Жильё'], description: '', house: true, flow: false, wet: false },
        { title: 'Поток', synonyms: ['Течение'], description: 'Непрерывное движение воды.', house: false, flow: true, wet: false },
        { title: 'Дождь', synonyms: ['Осадки'], description: 'Вода в движении; влажность как качество.', house: false, flow: true, wet: true },
        { title: 'Влажность', synonyms: ['Мокрый'], description: '', house: false, flow: false, wet: true },
        { title: 'Ручей', synonyms: ['Водный поток'], description: 'Небольшое течение.', house: false, flow: true, wet: false },
        { title: 'Сохранённое прочтение', synonyms: ['Исторический глиф'], description: 'Демонстрация отсутствующего исходного символа: прежний текст сохранён, переход в несуществующую карточку отключён.', house: false, flow: false, wet: false, missing: true },
      ];
      const glyphs = new GlyphRepository(db), now = Date.now();
      for (const [index, example] of examples.entries()) {
        const source = example.house ? house : water;
        if (!source) continue;
        const cells = emptyGlyphCells();
        for (const cell of cells) {
          const category = cell.position === 'center' ? 'phenomena' : cell.position === 'topRight' && example.flow ? 'events' : cell.position === 'middleLeft' && example.wet ? 'qualities' : undefined;
          const meaning = category && source.meanings.find(group => group.category === category);
          if (meaning) { cell.symbolId = source.id; cell.meaningId = meaning.id; cell.meaningSnapshot = meaning.primary; }
        }
        const record = await glyphs.create({ primaryMeaning: example.title, synonyms: example.synonyms, description: example.description, cells });
        const stamp = new Date(now - index).toISOString();
        const savedCells = example.missing ? record.cells.map(cell => cell.position === 'center' ? { ...cell, symbolId: 'unavailable-demo-source' } : cell) : record.cells;
        await db.glyphs.update(record.id, { cells: savedCells, createdAt: stamp, updatedAt: stamp });
      }
    }
    await db.meta.put({ key: 'glyph-gallery-demo-initialized', value: true });
  });
}

