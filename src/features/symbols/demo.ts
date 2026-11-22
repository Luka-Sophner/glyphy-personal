import water from '../../assets/glyphs/water-demo.svg';
import house from '../../assets/glyphs/house-demo.svg';
import { prepareMedia } from './media';
import { repository as defaultRepository, demoMode, type SymbolRepository } from '../../db/repository';
import type { StoredSymbolCard } from '../../db/database';

const initializations = new WeakMap<SymbolRepository, Promise<void>>();
export function initializeDatabase(repository = defaultRepository): Promise<void> {
  const previous = initializations.get(repository);
  if (previous) return previous;
  const initialization = (async () => {
    await repository.db.open();
    if (!demoMode || repository.db.name !== 'glyphy-demo' || await repository.db.meta.get('demo-initialized')) return;
    const assets = await Promise.all([water, house].map(async url => prepareMedia(await (await fetch(url)).blob(), true)));
    const now = Date.now();
    const cards: StoredSymbolCard[] = [
      { id: 'example', imageId: assets[0].id, meanings: [
        { id: 'water', category: 'phenomena', primary: 'Вода', secondary: ['Жидкость', 'Субстанция'], isPrimaryCategory: true, order: 0 },
        { id: 'flow', category: 'events', primary: 'Течь', secondary: ['Литься', 'Вытекать'], isPrimaryCategory: false, order: 1 },
        { id: 'wet', category: 'qualities', primary: 'Мокрый', secondary: ['Водяной', 'Неплотный'], isPrimaryCategory: false, order: 2 },
      ], categories: ['phenomena', 'events', 'qualities'], tags: ['Природа'], createdAt: now, updatedAt: now },
      { id: 'demo-house', imageId: assets[1].id, meanings: [{ id: 'house', category: 'phenomena', primary: 'Дом', secondary: ['Жилище'], isPrimaryCategory: true, order: 0 }], categories: ['phenomena'], tags: [], createdAt: now, updatedAt: now },
    ];
    await repository.seedDemo(cards, assets);
  })();
  initializations.set(repository, initialization);
  return initialization;
}
