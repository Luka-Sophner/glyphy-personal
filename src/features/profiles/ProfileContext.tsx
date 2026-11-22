import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { liveQuery } from 'dexie';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { ProfileStore, type Profile } from './store';
import { demoMode, repository as defaultRepository, SymbolRepository } from '../../db/repository';
import { GlyphRepository } from '../../db/GlyphRepository';
import { DiaryRepository } from '../../db/DiaryRepository';
import { DiaryGroupRepository } from '../../db/DiaryGroupRepository';
import { withDatabaseLocks } from './locks';

const store = new ProfileStore(demoMode ? 'glyphy-demo' : 'glyphy');
function session(profile: Profile) {
  const db = store.database(profile);
  function guarded<T extends object>(repository: T): T {
    return new Proxy(repository, { get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      if (['list', 'get', 'snapshot', 'byCategory', 'byDate'].includes(String(property))) return value.bind(target);
      return (...args: unknown[]) => withDatabaseLocks([profile.database], async () => {
        if ((await store.profiles.get(profile.id))?.database !== profile.database) throw new Error('Профиль восстановлен или удалён. Откройте редактор заново.');
        return Reflect.apply(value, target, args);
      });
    } });
  }
  return { repository: guarded(new SymbolRepository(db)), glyphRepository: guarded(new GlyphRepository(db)),
    diaryRepository: guarded(new DiaryRepository(db)), groupRepository: guarded(new DiaryGroupRepository(db)) };
}
const fallback = { repository: defaultRepository, glyphRepository: new GlyphRepository(defaultRepository.db),
  diaryRepository: new DiaryRepository(defaultRepository.db), groupRepository: new DiaryGroupRepository(defaultRepository.db) };
const Session = createContext(fallback);
interface ProfilesState {
  store: ProfileStore;
  profiles: Profile[];
  active: Profile;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  error: string;
  message: string;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
  switchProfile: (id: string) => Promise<void>;
}
const Context = createContext<ProfilesState | null>(null);
function BusyGuard() {
  const blocker = useBlocker(() => true);
  useEffect(() => { if (blocker.state === 'blocked') blocker.reset(); }, [blocker]);
  return null;
}
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<ProfileStore['snapshot']>>>();
  const [loadError, setLoadError] = useState(''), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const navigate = useNavigate(), location = useLocation();
  useEffect(() => {
    let alive = true, subscription: { unsubscribe(): void } | undefined;
    void store.initialize().then(() => {
      if (alive) subscription = liveQuery(() => store.snapshot()).subscribe({
        next: value => { if (alive) setSnapshot(value); },
        error: cause => { if (alive) setLoadError(String(cause)); },
      });
    }).catch(cause => { if (alive) setLoadError(String(cause)); });
    return () => { alive = false; subscription?.unsubscribe(); };
  }, []);
  const active = snapshot?.active;
  const scoped = useMemo(() => active ? session(active) : fallback, [active?.database]);
  if (!snapshot || !active) return <p role={loadError ? 'alert' : 'status'}>{loadError || 'Открытие профилей…'}</p>;
  const switchProfile = async (id: string) => {
    if (busy || id === active.id) return;
    await store.activate(id);
    setError(''); setMessage('');
    // Leave editors, group filters and previews before mounting the new session.
    const destination = location.pathname.startsWith('/settings') ? location.pathname : '/';
    const previous = location.state?.settingsFrom?.pathname as string | undefined;
    const pathname = previous?.startsWith('/diary') ? '/diary' : previous?.startsWith('/glyphs') ? '/glyphs'
      : previous?.startsWith('/category') || previous === '/dictionary' ? '/dictionary' : '/';
    const icon = pathname === '/diary' ? 'diary' : pathname === '/glyphs' ? 'glyphs' : pathname === '/dictionary' ? 'dictionary' : 'menu';
    navigate(destination, { replace: true, state: { settingsFrom: { pathname, search: '', icon } } });
  };
  return <Context.Provider value={{ store, profiles: snapshot.profiles, active, busy, setBusy, error, setError, message, setMessage, switchProfile }}>
    {busy && <BusyGuard/>}
    <Session.Provider value={scoped}><div className="profile-session" key={active.database + ':' + (active.revision ?? '0')}>{children}</div></Session.Provider>
  </Context.Provider>;
}
export function useProfiles() {
  const value = useContext(Context);
  if (!value) throw new Error('ProfileProvider required');
  return value;
}
export function useProfileSession() { return useContext(Session); }
