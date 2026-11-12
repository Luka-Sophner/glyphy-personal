export interface GlyphRoute { glyphId: string; symbolId?: string; editor: boolean }
export function getGlyphRoute(pathname: string): GlyphRoute | null {
  const match = /^\/glyphs\/([^/]+)(?:\/(edit|symbols\/([^/]+)))?$/.exec(pathname);
  if (!match) return null;
  try {
    return { glyphId: decodeURIComponent(match[1]), ...(match[3] ? { symbolId: decodeURIComponent(match[3]) } : {}), editor: match[2] === 'edit' };
  } catch { return null; }
}
export function glyphPath(id: string) { return `/glyphs/${encodeURIComponent(id)}`; }
export function glyphSymbolPath(id: string, symbolId: string) { return `${glyphPath(id)}/symbols/${encodeURIComponent(symbolId)}`; }
