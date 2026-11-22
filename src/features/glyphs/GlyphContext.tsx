import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { liveQuery } from 'dexie';
import { demoMode } from '../../db/repository';
import { useProfileSession } from '../profiles/ProfileContext';
import { initializeDatabase } from '../symbols/demo';
import { seedGlyphDemo } from './demo';
import { createCompositionSearchIndex as createGlyphSearchIndex } from './composition-search';
import { useSymbols } from '../symbols/SymbolContext';
import type { GlyphRecord, GlyphPosition } from '../../types/glyphs-diary';
export interface GlyphViewState { scrollTop: number; position?: GlyphPosition; partId?: string }
interface GlyphState {
  glyphs: GlyphRecord[]; loading: boolean; error: string; query: string; setQuery: (value: string) => void;
  search: ReturnType<typeof createGlyphSearchIndex>; deleteGlyph: (id: string) => Promise<void>;
  views: Map<string, GlyphViewState>;
  rememberedThumbnails: ReadonlyMap<string, Blob>;
  retainedThumbnails: ReadonlyMap<string, Blob>;
  notice: string; setNotice: (message: string) => void;
}
const Context = createContext<GlyphState | null>(null);
export function GlyphProvider({ children }: { children: ReactNode }) {
  const { repository, glyphRepository } = useProfileSession();
  const [glyphs, setGlyphs] = useState<GlyphRecord[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [notice, setNotice] = useState(''), [retainedThumbnails, setRetainedThumbnails] = useState<ReadonlyMap<string, Blob>>(new Map());
  const [query, setQuery] = useState(''), views = useRef(new Map<string, GlyphViewState>());
  const { symbols } = useSymbols(), thumbnails = useRef(new Map<string, Blob>());
  const rememberedThumbnails = useMemo(() => {
    const referenced = new Set(glyphs.flatMap(glyph => [glyph.cells, ...(glyph.additionalGlyphs ?? []).map(part => part.cells)].flatMap(cells => cells.map(cell => cell.symbolId).filter(Boolean))));
    for (const symbol of symbols) if (referenced.has(symbol.id)) {
      if (symbol.media) thumbnails.current.set(symbol.id, symbol.media.thumbnailBlob);
      else thumbnails.current.delete(symbol.id); // An explicitly removed photo stays removed.
    }
    for (const id of thumbnails.current.keys()) if (!referenced.has(id)) thumbnails.current.delete(id);
    return new Map(thumbnails.current);
  }, [glyphs, symbols]);
  useEffect(() => {
    let active = true, subscription: { unsubscribe: () => void } | undefined;
    void initializeDatabase(repository).then(() => seedGlyphDemo(repository.db, demoMode && repository.db.name === 'glyphy-demo')).then(() => {
      if (!active) return;
      subscription = liveQuery(() => repository.db.transaction('r', repository.db.glyphs, repository.db.media, async () => {
        const rows = await glyphRepository.list();
        const ids = [...new Set(rows.flatMap(row => row.imageIds))];
        const assets = await repository.db.media.bulkGet(ids);
        return { rows, thumbnails: new Map(assets.flatMap(asset => asset ? [[asset.id, asset.thumbnailBlob] as const] : [])) };
      })).subscribe({ next: ({ rows, thumbnails }) => { if (active) { setRetainedThumbnails(thumbnails); setGlyphs(rows); setLoading(false); setError(''); } }, error: cause => { if (active) { setError(String(cause?.message ?? cause)); setLoading(false); } } });
    }).catch(cause => { if (active) { setError(String(cause?.message ?? cause)); setLoading(false); } });
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4000); return () => window.clearTimeout(timer); }, [notice]);
  const search = useMemo(() => createGlyphSearchIndex(glyphs), [glyphs]);
  const deleteGlyph = async (id: string) => {
    await glyphRepository.delete(id); views.current.delete(id);
    // Commit succeeds even if the subsequent view refresh fails; liveQuery retries.
    try { setGlyphs(await glyphRepository.list()); } catch { setError('Глиф удалён. Обновите страницу для обновления списка.'); }
  };
  return <Context.Provider value={{ glyphs, loading, error, query, setQuery, search, deleteGlyph, views: views.current, rememberedThumbnails, retainedThumbnails, notice, setNotice }}>{children}</Context.Provider>;
}
export function useGlyphs() { const value = useContext(Context); if (!value) throw new Error('GlyphProvider required'); return value; }
