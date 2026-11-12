import type { SymbolCard, CategoryId } from '../../types';
export function meaningFor(card: SymbolCard, category?: CategoryId) {
  return (category ? card.meanings.find(group => group.category === category) : card.meanings.find(group => group.isPrimaryCategory)) ?? card.meanings[0];
}
