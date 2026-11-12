import type { SymbolCard, CategoryId, CategoryMeaning } from '../../types';

export function normalizeSearch(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/gu, ' ').trim();
}
interface Field { text: string; starts: string[]; exactRank: number; meaning?: CategoryMeaning }
export interface SearchResult<T extends SymbolCard = SymbolCard> { card: T; meaning: CategoryMeaning; rank: number }
const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });

// Normalize once per data revision, not on each keystroke or unrelated render.
export function createSearchIndex<T extends SymbolCard>(cards: readonly T[]) {
  const seen = new Set<string>();
  const entries = cards.filter(card => {
    if (seen.has(card.id)) return false;
    seen.add(card.id); return true;
  }).map(card => {
    const meanings = [...card.meanings].sort((a, b) => Number(b.isPrimaryCategory) - Number(a.isPrimaryCategory) || a.order - b.order || a.id.localeCompare(b.id));
    const fields: Field[] = [];
    const add = (raw: string, exactRank: number, meaning?: CategoryMeaning) => {
      const text = normalizeSearch(raw);
      if (text) fields.push({ text, exactRank, meaning, starts: [...text.matchAll(/[\p{L}\p{N}]+/gu)].map(match => text.slice(match.index)) });
    };
    for (const meaning of meanings) {
      add(meaning.primary, 0, meaning);
      meaning.secondary.forEach(value => add(value, 1, meaning));
    }
    card.tags.forEach(tag => add(tag, 2));
    return { card, meanings, fields };
  });
  return {
    search(query: string, category?: CategoryId): SearchResult<T>[] {
      const term = normalizeSearch(query), results: SearchResult<T>[] = [];
      for (const entry of entries) {
        const contextual = category ? entry.meanings.find(meaning => meaning.category === category) : undefined;
        if ((category && !contextual) || !entry.meanings.length) continue;
        let rank = term ? Infinity : 5;
        let matched = entry.meanings[0];
        for (const field of term ? entry.fields : []) {
          const score = field.text === term ? field.exactRank : field.starts.some(start => start.startsWith(term)) ? 3 : field.text.includes(term) ? 4 : Infinity;
          if (score < rank) { rank = score; matched = field.meaning ?? entry.meanings[0]; }
        }
        if (Number.isFinite(rank)) results.push({ card: entry.card, meaning: contextual ?? matched, rank });
      }
      return results.sort((a, b) => a.rank - b.rank || collator.compare(normalizeSearch(a.meaning.primary), normalizeSearch(b.meaning.primary)) || a.card.id.localeCompare(b.card.id));
    },
  };
}
export function matchesSymbol(card: SymbolCard, query: string): boolean {
  return createSearchIndex([card]).search(query).length > 0;
}
