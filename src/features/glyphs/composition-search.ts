import type { GlyphRecord } from '../../types/glyphs-diary.js';
import { createGlyphSearchIndex } from './search.js';

/** Search every word in a phrase while returning the unchanged stored record. */
export function createCompositionSearchIndex(glyphs: GlyphRecord[]) {
  const records = new Map(glyphs.map(glyph => [glyph.id, glyph]));
  const index = createGlyphSearchIndex(glyphs.map(glyph => {
    const parts = glyph.additionalGlyphs ?? [];
    return { ...glyph, primaryMeaning: [glyph.primaryMeaning, ...parts.map(part => part.primaryMeaning)].join(' '),
      synonyms: [...glyph.synonyms, ...parts.flatMap(part => part.synonyms)],
      description: [glyph.description, ...parts.map(part => part.description)].join(' ') };
  }));
  return (query: string): GlyphRecord[] => index(query).map(glyph => records.get(glyph.id)!);
}
