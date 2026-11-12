import { useDeferredValue, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDiary } from '../features/diary/DiaryContext';
import { DiaryCard } from '../components/DiaryCard';
import { AnimatePresence } from '../lib/motion';
import { DiaryGroupShelf } from '../components/DiaryGroupShelf';
import { diaryVisibleEntries } from '../features/diary/groups';

export function DiaryPage() {
  const { entries, groups, loading, error, query, search, notice, rootView } = useDiary(), navigate = useNavigate(), location = useLocation();
  const backgroundSearch = location.pathname === '/diary' ? location.search : location.state?.diaryBackgroundSearch ?? '';
  const parameters = new URLSearchParams(backgroundSearch), requested = parameters.get('group'), all = parameters.get('all') === '1';
  const activeGroup = groups.find(group => group.id === requested), unassigned = requested === 'unassigned';
  useEffect(() => { if (location.pathname === '/diary') { rootView.groupId = activeGroup?.id ?? null; rootView.search = location.search; } }, [location.pathname, location.search, activeGroup?.id, rootView]);
  const deferred = useDeferredValue(query), results = useMemo(() => diaryVisibleEntries(search(deferred), groups, requested, all, !!deferred.trim()), [search, deferred, groups, requested, all]);
  const manage = () => navigate('/diary/groups', { state: { backgroundPath: '/diary', diaryGroupsFrom: `/diary${backgroundSearch}`, diaryBackgroundSearch: backgroundSearch, diaryGroupEditor: groups.length ? undefined : 'new' } });
  const createEntry = () => navigate('/diary/new/edit', { state: { backgroundPath: '/diary', diaryEditorFrom: `/diary${backgroundSearch}`, diaryBackgroundSearch: backgroundSearch, diaryInitialGroupId: activeGroup?.id ?? null } });
  return <section className="diary-page"><h1 className="sr-only">Дневник</h1>{notice && <p className="glyph-save-notice" role="status">{notice}</p>}
    <button type="button" className="diary-groups-open" onClick={manage}>{groups.length ? 'Управлять группами' : 'Создать группу'}</button>
    {loading ? <p className="empty-state" role="status">Загрузка дневника…</p> : error ? <p role="alert">{error}</p> : <>
      {groups.length > 0 && <>
        <DiaryGroupShelf activeId={activeGroup?.id} onSelect={id => { if (activeGroup?.id !== id) navigate(`/diary?group=${encodeURIComponent(id)}`); }} />
        {(activeGroup || unassigned || all || query.trim()) && <div className="diary-group-view"><span>{activeGroup?.title ?? (unassigned ? 'Без группы' : 'Все записи')}</span><div><button type="button" onClick={() => navigate('/diary?all=1')}>Все записи</button><button type="button" onClick={() => navigate('/diary?group=unassigned')}>Без группы</button><button type="button" onClick={() => navigate('/diary')}>К группам</button>{activeGroup && <button type="button" onClick={createEntry}>Добавить запись</button>}</div></div>}
      </>}
      {query.trim() && <p className="search-summary" role="status">{results.length ? `Найдено записей: ${results.length}` : 'Ничего не найдено'}</p>}
      {!entries.length && <div className="empty-state"><p>В дневнике пока нет записей.</p><button type="button" className="create-first-glyph" onClick={createEntry}>Создать запись</button></div>}
      {entries.length > 0 && !results.length && !query.trim() && <p className="empty-state">{activeGroup ? 'В группе пока нет записей. Добавьте их через управление группами или создайте новую запись.' : 'Нераспределённых записей пока нет.'}</p>}
      <div className="diary-list" aria-busy={query !== deferred}><AnimatePresence>{results.map((entry, index) => <DiaryCard key={entry.id} entry={entry} index={index} />)}</AnimatePresence></div>
    </>}
  </section>;
}
