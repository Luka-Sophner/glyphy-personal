import { normalizeSearch } from '../symbols/search.js';
import type { GlyphRecord } from '../../types/glyphs-diary.js';
export function createGlyphSearchIndex(records: readonly GlyphRecord[]) {
  const indexed = records.map(record => ({ record, fields: [record.primaryMeaning, ...record.synonyms, record.description].map(normalizeSearch) }));
  return (query: string) => {
    const term = normalizeSearch(query);
    return indexed.filter(item => !term || item.fields.some(field => field.includes(term))).map(item => item.record);
  };
}
