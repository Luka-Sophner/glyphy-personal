import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { liveQuery } from 'dexie';
import { diaryRepository } from '../../db/repositories';
import { DiaryGroupRepository } from '../../db/DiaryGroupRepository';
import { sortDiaryGroups } from './groups';
import { initializeDatabase } from '../symbols/demo';
import { createDiarySearchIndex } from './presentation';
import type { DiaryEntry, DiaryInput, DiaryGroup, DiaryGroupInput, UpdateOptions } from '../../types/glyphs-diary';
import type { MediaAsset } from '../../types';

export interface DiaryViewState { scrollTop: number; photoIndex: number }
interface DiaryState {
  entries: DiaryEntry[]; media: ReadonlyMap<string, MediaAsset>; loading: boolean; error: string;
  query: string; setQuery: (query: string) => void; search: ReturnType<typeof createDiarySearchIndex>;
  deleteEntry: (id: string) => Promise<void>; views: Map<string, DiaryViewState>;
  saveEntry: (input: DiaryInput, newMedia: MediaAsset[], id?: string, options?: UpdateOptions) => Promise<DiaryEntry>;
  notice: string;
  groups: DiaryGroup[];
  rootView: { groupId: string | null; search: string };
  saveGroup: (input: DiaryGroupInput, id?: string, options?: UpdateOptions, newCover?: MediaAsset) => Promise<DiaryGroup>;
  deleteGroup: (id: string) => Promise<void>;
  assignEntryGroup: (entryId: string, groupId: string | null) => Promise<void>;
  setGroupEntries: (groupId: string, entryIds: string[]) => Promise<void>;
  reorderGroups: (ids: string[]) => Promise<void>;
}
const Context = createContext<DiaryState | null>(null);
const groupRepository = new DiaryGroupRepository(diaryRepository.db);
export function DiaryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]), [media, setMedia] = useState<ReadonlyMap<string, MediaAsset>>(new Map());
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [groups, setGroups] = useState<DiaryGroup[]>([]);
  const views = useRef(new Map<string, DiaryViewState>());
  const rootView = useRef<{ groupId: string | null; search: string }>({ groupId: null, search: '' });
  useEffect(() => {
    let active = true, subscription: { unsubscribe: () => void } | undefined;
    void initializeDatabase().then(() => {
      if (!active) return;
      subscription = liveQuery(() => diaryRepository.snapshot()).subscribe({ next: snapshot => {
        if (!active) return;
        setEntries(snapshot.entries); setGroups(sortDiaryGroups(snapshot.groups)); setMedia(new Map(snapshot.media.map(asset => [asset.id, asset]))); setLoading(false); setError('');
      }, error: cause => { if (active) { setLoading(false); setError(String(cause?.message ?? cause)); } } });
    }).catch(cause => { if (active) { setLoading(false); setError(String(cause?.message ?? cause)); } });
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);
  const search = useMemo(() => createDiarySearchIndex(entries), [entries]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4000); return () => window.clearTimeout(timer); }, [notice]);
  const saveEntry = async (input: DiaryInput, newMedia: MediaAsset[], id?: string, options: UpdateOptions = {}) => {
    const entry = id ? await diaryRepository.update(id, input, newMedia, options) : await diaryRepository.create(input, newMedia);
    setEntries(current => [entry, ...current.filter(value => value.id !== entry.id)]);
    setMedia(current => new Map([...current, ...newMedia.map(asset => [asset.id, asset] as const)]));
    if (!id) setQuery('');
    setNotice(id ? 'Запись обновлена' : 'Запись сохранена');
    return entry;
  };
  const deleteEntry = async (id: string) => { await diaryRepository.delete(id); setEntries(current => current.filter(entry => entry.id !== id)); views.current.delete(id); };
  const mergeEntries = (updates: DiaryEntry[]) => { const byId = new Map(updates.map(entry => [entry.id, entry])); setEntries(current => current.map(entry => byId.get(entry.id) ?? entry)); };
  const saveGroup = async (input: DiaryGroupInput, id?: string, options: UpdateOptions = {}, newCover?: MediaAsset) => { const group = await groupRepository.save(input, id, options, newCover); if (newCover) setMedia(current => new Map([...current, [newCover.id, newCover]])); setGroups(current => sortDiaryGroups([...current.filter(value => value.id !== group.id), group])); setNotice(id ? 'Группа обновлена' : 'Группа создана'); return group; };
  const deleteGroup = async (id: string) => { const changed = await groupRepository.delete(id); mergeEntries(changed); setGroups(current => current.filter(group => group.id !== id)); setNotice('Группа удалена. Записи сохранены без группы.'); };
  const assignEntryGroup = async (entryId: string, groupId: string | null) => { const entry = await groupRepository.assignEntry(entryId, groupId); mergeEntries([entry]); };
  const setGroupEntries = async (groupId: string, entryIds: string[]) => { const result = await groupRepository.setEntries(groupId, entryIds); mergeEntries(result.entries); setGroups(current => sortDiaryGroups(current.map(group => group.id === groupId ? result.group : group))); setNotice('Записи распределены'); };
  const reorderGroups = async (ids: string[]) => { const result = await groupRepository.reorder(ids); setGroups(sortDiaryGroups(result)); };
  return <Context.Provider value={{ entries, media, loading, error, query, setQuery, search, deleteEntry, saveEntry, notice, groups, rootView: rootView.current, saveGroup, deleteGroup, assignEntryGroup, setGroupEntries, reorderGroups, views: views.current }}>{children}</Context.Provider>;
}
export function useDiary() { const value = useContext(Context); if (!value) throw new Error('DiaryProvider required'); return value; }
