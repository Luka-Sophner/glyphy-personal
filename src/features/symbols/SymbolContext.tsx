import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createSearchIndex } from './search';
import { liveQuery } from 'dexie';
import { initializeDatabase } from './demo';
import { useProfileSession } from '../profiles/ProfileContext';
import placeholder from '../../assets/glyphs/glyph-placeholder.svg';
import type { GlyphySymbol, SymbolDraft, MediaAsset, SymbolCard } from '../../types';
export { placeholder as defaultSymbolImage };
interface State {
  searchIndex: ReturnType<typeof createSearchIndex<GlyphySymbol>>;
  symbols: GlyphySymbol[]; loading: boolean; databaseError: string; announcement: string; query: string; setQuery: (value: string) => void;
  saveSymbol: (draft: SymbolDraft, media?: MediaAsset | null) => Promise<SymbolCard>; deleteSymbol: (id: string) => Promise<void>;
}
const Context = createContext<State | null>(null);
type Snapshot = Awaited<ReturnType<import('../../db/repository').SymbolRepository['snapshot']>>;
export function SymbolProvider({ children }: { children: ReactNode }) {
  const { repository } = useProfileSession();
  const [symbols, setSymbols] = useState<GlyphySymbol[]>([]), [loading, setLoading] = useState(true), [databaseError, setError] = useState('');
  const [announcement, setAnnouncement] = useState(''), [query, setQuery] = useState('');
  const applyRef = useRef<(snapshot: Snapshot) => void>(() => {});
  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;
    const urls = new Map<string, { image: string; thumbnail: string }>();
    const apply = (snapshot: Snapshot) => {
      if (!active) return;
      const media = new Map(snapshot.media.map(asset => [asset.id, asset]));
      for (const asset of snapshot.media) if (!urls.has(asset.id)) urls.set(asset.id, { image: URL.createObjectURL(asset.blob), thumbnail: URL.createObjectURL(asset.thumbnailBlob) });
      setSymbols(snapshot.cards.map(card => ({ ...card, media: card.imageId ? media.get(card.imageId) : undefined,
        image: (card.imageId && urls.get(card.imageId)?.image) || placeholder,
        thumbnail: (card.imageId && urls.get(card.imageId)?.thumbnail) || placeholder })));
      for (const [id, value] of urls) if (!media.has(id)) {
        urls.delete(id);
        const timer = setTimeout(() => { URL.revokeObjectURL(value.image); URL.revokeObjectURL(value.thumbnail); retirementUrls.delete(timer); }, 1000);
        // Cleanup must also revoke URLs if the app unmounts before the timeout.
        retirementUrls.set(timer, value);
      }
      setLoading(false); setError('');
    };
    const retirementUrls = new Map<ReturnType<typeof setTimeout>, { image: string; thumbnail: string }>();
    applyRef.current = apply;
    void initializeDatabase(repository).then(() => {
      if (!active) return;
      subscription = liveQuery(() => repository.snapshot()).subscribe({ next: apply, error: error => { if (active) { setError(String(error?.message ?? error)); setLoading(false); } } });
    }).catch(error => { if (active) { setError(String(error?.message ?? error)); setLoading(false); } });
    return () => {
      active = false; subscription?.unsubscribe(); applyRef.current = () => {};
      for (const value of urls.values()) { URL.revokeObjectURL(value.image); URL.revokeObjectURL(value.thumbnail); }
      for (const [timer, value] of retirementUrls) { clearTimeout(timer); URL.revokeObjectURL(value.image); URL.revokeObjectURL(value.thumbnail); }
    };
  }, []);
  const saveSymbol = async (draft: SymbolDraft, photo?: MediaAsset | null) => {
    const card = await repository.save(draft, photo);
    try { applyRef.current(await repository.snapshot()); } catch { setError('Запись сохранена, но обновить список не удалось. Обновите страницу.'); }
    setAnnouncement('Карточка сохранена'); return card;
  };
  const deleteSymbol = async (id: string) => {
    await repository.delete(id);
    try { applyRef.current(await repository.snapshot()); } catch { setError('Запись удалена, но обновить список не удалось. Обновите страницу.'); }
    setAnnouncement('Карточка удалена');
  };
  const searchIndex = useMemo(() => createSearchIndex(symbols), [symbols]);
  return <Context.Provider value={{ symbols, searchIndex, loading, databaseError, announcement, query, setQuery, saveSymbol, deleteSymbol }}>{children}</Context.Provider>;
}
export function useSymbols() { const value = useContext(Context); if (!value) throw new Error('SymbolProvider required'); return value; }
