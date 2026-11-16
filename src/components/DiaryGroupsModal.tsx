import { mediaSaveError } from '../db/storage-errors';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import type { DiaryGroup } from '../types/glyphs-diary';
import { useDiary } from '../features/diary/DiaryContext';
import { diaryDate, formatDiaryDate } from '../features/diary/presentation';
import { useNavigationMotion } from '../app/NavigationMotion';
import { Reorder, AnimatePresence, useDragControls } from '../lib/motion';
import { animation } from '../lib/animations';
import { Modal } from './Modal';
import type { MediaAsset } from '../types';
import { prepareDiaryMedia } from '../features/diary/media';
import { MediaAssetImage, DiaryImage } from './DiaryImage';
import { SearchBar } from './SearchBar';

function GroupOrderRow({ group, count, index, total, busy, onEdit, onEntries, onDelete, onMove, onDragStart, onDragEnd }: { group: DiaryGroup; count: number; index: number; total: number; busy: boolean; onEdit: () => void; onEntries: () => void; onDelete: () => void; onMove: (direction: number) => void; onDragStart: () => void; onDragEnd: () => void }) {
  const controls = useDragControls(), { reduced } = useNavigationMotion();
  return <Reorder.Item as="li" value={group.id} dragListener={false} dragControls={controls} dragMomentum={false} className="diary-group-order-row" onDragStart={onDragStart} onDragEnd={onDragEnd}
    initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }} whileDrag={{ scale: reduced ? 1 : 1.02, zIndex: 2 }} transition={reduced ? { duration: 0 } : animation.gentleSpring}>
    <button type="button" className="diary-group-drag" aria-label={`Перетащить группу: ${group.title}`} title="Перетащите или используйте клавиши ↑ и ↓" disabled={busy}
      onPointerDown={event => { if (!busy) controls.start(event); }}
      onKeyDown={event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        if (!busy && (event.key === 'ArrowUp' ? index > 0 : index < total - 1)) onMove(event.key === 'ArrowUp' ? -1 : 1);
      }}><span aria-hidden="true" /></button>
    <div className="diary-group-order-heading"><strong>{group.title}</strong><small>Записей: {count}</small></div>
    <div className="diary-group-row-actions">
      <button type="button" className="diary-group-entries-action" aria-label="Записи" title={`Записи группы: ${group.title}`} disabled={busy} onClick={onEntries}><span aria-hidden="true" /></button>
      <button type="button" className="diary-group-edit-action" aria-label={`Редактировать группу: ${group.title}`} disabled={busy} onClick={onEdit} />
      <button type="button" className="diary-group-delete-action" aria-label={`Удалить группу: ${group.title}`} disabled={busy} onClick={onDelete}><span aria-hidden="true" /></button>
    </div>
  </Reorder.Item>;
}

export function DiaryGroupsModal() {
  const { groups, entries, loading, error: databaseError, search, saveGroup, deleteGroup, reorderGroups, setGroupEntries } = useDiary();
  const location = useLocation(), navigate = useNavigate(), dialog = useRef<HTMLDialogElement>(null);
  const editorId = typeof location.state?.diaryGroupEditor === 'string' ? location.state.diaryGroupEditor as string : null;
  const assignmentId = typeof location.state?.diaryGroupEntries === 'string' ? location.state.diaryGroupEntries as string : null;
  const mode = editorId ? 'edit' : assignmentId ? 'entries' : 'manage';
  const [title, setTitle] = useState(''), [coverId, setCoverId] = useState<string | null>(null), original = useRef<DiaryGroup>();
  const [coverImageId, setCoverImageId] = useState<string | null>(null), [newCover, setNewCover] = useState<MediaAsset>();
  const [selected, setSelected] = useState<string[]>([]), [query, setQuery] = useState(''), [shown, setShown] = useState(100);
  const [order, setOrder] = useState<string[]>(groups.map(group => group.id)), orderRef = useRef(order); orderRef.current = order;
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [deleteId, setDeleteId] = useState<string | null>(null);
  const writing = useRef(false), dragging = useRef(false), settled = useRef(false), guard = useRef(false), initialForm = useRef(JSON.stringify({ title: '', coverId: null, coverImageId: null })), initialSelection = useRef('[]');
  const formFingerprint = JSON.stringify({ title, coverId, coverImageId }), selectionFingerprint = JSON.stringify([...selected].sort());
  guard.current = mode !== 'manage' && !settled.current && (mode === 'edit' && formFingerprint !== initialForm.current || mode === 'entries' && selectionFingerprint !== initialSelection.current || busy);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => guard.current && currentLocation.key !== nextLocation.key), blockerRef = useRef(blocker); blockerRef.current = blocker;
  const byId = useMemo(() => new Map(groups.map(group => [group.id, group])), [groups]);
  const displayedGroups = order.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const counts = useMemo(() => { const result = new Map<string, number>(); for (const entry of entries) if (entry.groupId) result.set(entry.groupId, (result.get(entry.groupId) ?? 0) + 1); return result; }, [entries]);
  const candidates = entries.filter(entry => entry.groupId === editorId && entry.imageIds.length);
  const assignment = groups.find(group => group.id === assignmentId), assignmentResults = useMemo(() => search(query), [search, query]), selectedSet = useMemo(() => new Set(selected), [selected]);
  const availableIds = useMemo(() => new Set(entries.map(entry => entry.id)), [entries]);
  const selectedCount = selected.filter(id => availableIds.has(id)).length;
  const toggleEntry = (id: string, checked: boolean) => { settled.current = false; setSelected(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id)); };
  useEffect(() => { if (!writing.current && !dragging.current) setOrder(groups.map(group => group.id)); }, [groups, busy]);
  useEffect(() => { setShown(100); }, [query, assignmentId]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (guard.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, []);
  useEffect(() => { if (blocker.state === 'blocked') dialog.current?.querySelector<HTMLButtonElement>('[data-continue-groups]')?.focus({ preventScroll: true }); }, [blocker.state]);
  useEffect(() => { if (deleteId) dialog.current?.querySelector<HTMLButtonElement>('[data-keep-group]')?.focus(); }, [deleteId]);
  const close = () => { if (writing.current) return; if (blocker.state === 'blocked') { blocker.reset(); return; } if (mode !== 'manage') navigate(-1); else if (location.state?.diaryGroupsFrom) navigate(-1); else navigate('/diary', { replace: true }); };
  const beginEdit = (group?: DiaryGroup) => {
    original.current = group; const nextTitle = group?.title ?? '', nextCover = entries.some(entry => entry.id === group?.coverEntryId && entry.groupId === group?.id) ? group?.coverEntryId ?? null : null;
    setTitle(nextTitle); setCoverId(nextCover); setCoverImageId(group?.coverImageId ?? null); setNewCover(undefined); initialForm.current = JSON.stringify({ title: nextTitle, coverId: nextCover, coverImageId: group?.coverImageId ?? null }); settled.current = false; setError('');
    navigate(location.pathname, { state: { ...location.state, diaryGroupEditor: group?.id ?? 'new', diaryGroupEntries: undefined } });
  };
  const beginEntries = (group: DiaryGroup) => {
    const ids = entries.filter(entry => entry.groupId === group.id).map(entry => entry.id); setSelected(ids); initialSelection.current = JSON.stringify([...ids].sort()); settled.current = false; setQuery(''); setError('');
    navigate(location.pathname, { state: { ...location.state, diaryGroupEntries: group.id, diaryGroupEditor: undefined } });
  };
  const finish = () => { settled.current = true; guard.current = false; const pending = blockerRef.current; if (pending.state === 'blocked') pending.proceed(); else navigate(-1); };
  const save = async () => {
    if (writing.current) return;
    if (mode === 'edit' && !title.trim()) { setError('Введите название группы.'); return; }
    writing.current = true; setBusy(true); setError('');
    try {
      if (mode === 'edit') {
        const updated = await saveGroup({ title, coverEntryId: coverId, coverImageId }, original.current?.id, { expectedUpdatedAt: original.current?.updatedAt }, newCover);
        if (original.current) { original.current = updated; setTitle(updated.title); setCoverId(updated.coverEntryId); setCoverImageId(updated.coverImageId ?? null); setNewCover(undefined); initialForm.current = JSON.stringify({ title: updated.title, coverId: updated.coverEntryId, coverImageId: updated.coverImageId ?? null }); }
        else { setTitle(''); setCoverId(null); setCoverImageId(null); setNewCover(undefined); initialForm.current = JSON.stringify({ title: '', coverId: null, coverImageId: null }); }
      } else if (assignmentId) {
        const available = new Set(entries.map(entry => entry.id)); await setGroupEntries(assignmentId, selected.filter(id => available.has(id))); initialSelection.current = selectionFingerprint;
      }
      finish();
    } catch (cause) { setError(mediaSaveError(cause)); }
    finally { writing.current = false; setBusy(false); }
  };
  const uploadCover = async (file: File) => {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError('');
    try { const asset = await prepareDiaryMedia(file); settled.current = false; setNewCover(asset); setCoverImageId(asset.id); setCoverId(null); }
    catch (cause) { setError(mediaSaveError(cause)); }
    finally { writing.current = false; setBusy(false); }
  };
  const commitOrder = async (ids: string[]) => {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError('');
    try { await reorderGroups(ids); }
    catch (cause) { setOrder(groups.map(group => group.id)); setError(mediaSaveError(cause)); }
    finally { writing.current = false; setBusy(false); }
  };
  const move = (id: string, delta: number) => { if (writing.current || dragging.current) return; const next = [...orderRef.current], index = next.indexOf(id), target = index + delta; if (index < 0 || target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setOrder(next); orderRef.current = next; void commitOrder(next); };
  const remove = async () => { if (!deleteId || writing.current) return; writing.current = true; setBusy(true); setError(''); try { await deleteGroup(deleteId); setDeleteId(null); } catch (cause) { setError(mediaSaveError(cause)); } finally { writing.current = false; setBusy(false); } };
  const discard = () => {
    const current = original.current && groups.find(group => group.id === original.current!.id); setTitle(current?.title ?? ''); setCoverId(current?.coverEntryId ?? null); setCoverImageId(current?.coverImageId ?? null); setNewCover(undefined); initialForm.current = JSON.stringify({ title: current?.title ?? '', coverId: current?.coverEntryId ?? null, coverImageId: current?.coverImageId ?? null });
    const ids = entries.filter(entry => entry.groupId === assignmentId).map(entry => entry.id); setSelected(ids); initialSelection.current = JSON.stringify([...ids].sort()); settled.current = true; guard.current = false; if (blocker.state === 'blocked') blocker.proceed();
  };
  return <Modal elementRef={dialog} labelId="diary-groups-title" className={`diary-groups-modal diary-groups-modal--${mode}`} onClose={close}>
    <div className="modal-toolbar"><button type="button" className="modal-action diary-groups-close" aria-label="Закрыть управление группами" disabled={busy} onClick={close} /></div>
    <h2 className="sr-only" id="diary-groups-title">{mode === 'manage' ? 'Группы дневника' : mode === 'edit' ? original.current ? 'Редактирование группы' : 'Новая группа' : 'Записи группы'}</h2>
    {blocker.state === 'blocked' && <section className="diary-unsaved-confirm" role="alertdialog" aria-label="Несохранённые изменения группы"><p>{busy ? 'Изменения сохраняются…' : 'Сохранить изменения группы перед выходом?'}</p><button type="button" disabled={busy} onClick={() => void save()}>Сохранить и выйти</button><button type="button" disabled={busy} data-continue-groups onClick={() => blocker.reset()}>Продолжить редактирование</button><button type="button" disabled={busy} onClick={discard}>Выйти без сохранения</button></section>}
    {error && <p className="diary-groups-error" role="alert">{error}</p>}{databaseError && <p role="alert">{databaseError}</p>}
    <section className="modal-panel diary-groups-panel" hidden={mode !== 'manage'}><h3>Группы</h3><button type="button" className="diary-group-primary" aria-label="Создать группу" disabled={busy || loading} onClick={() => beginEdit()}>Создать</button>
      {deleteId && <section className="diary-unsaved-confirm" role="alertdialog" aria-label="Подтверждение удаления группы"><p>Удалить группу «{byId.get(deleteId)?.title}»? Записи и фотографии сохранятся без группы.</p><button type="button" disabled={busy} onClick={() => void remove()}>Удалить группу</button><button type="button" disabled={busy} data-keep-group onClick={() => setDeleteId(null)}>Оставить группу</button></section>}
      {loading ? <p role="status">Загрузка групп…</p> : !groups.length && <p className="diary-groups-help">Групп пока нет. Создайте первую, затем добавьте в неё записи.</p>}
      <p className="sr-only">Меняйте порядок перетаскиванием ручки или клавишами ↑ и ↓ на ней.</p>
      <Reorder.Group as="ul" axis="y" layoutScroll values={order} onReorder={ids => { setOrder(ids); orderRef.current = ids; }} className="diary-group-order-list"><AnimatePresence initial={false}>{displayedGroups.map((group, index) => <GroupOrderRow key={group.id} group={group} count={counts.get(group.id) ?? 0} index={index} total={displayedGroups.length} busy={busy} onEdit={() => beginEdit(group)} onEntries={() => beginEntries(group)} onDelete={() => setDeleteId(group.id)} onMove={direction => move(group.id, direction)} onDragStart={() => { dragging.current = true; }} onDragEnd={() => { dragging.current = false; void commitOrder(orderRef.current); }} />)}</AnimatePresence></Reorder.Group>
    </section>
    {mode === 'edit' && <form className="modal-panel diary-groups-panel" onSubmit={event => { event.preventDefault(); void save(); }}><h3>{original.current ? 'Изменить группу' : 'Создать группу'}</h3><label>Название группы<input className="diary-editor-input" aria-label="Название группы" value={title} maxLength={200} disabled={busy} onChange={event => { settled.current = false; setTitle(event.target.value); }} /></label><label className="diary-group-picker">Обложка<select aria-label="Обложка группы" disabled={busy} value={coverImageId ? 'custom' : coverId ?? ''} onChange={event => { settled.current = false; if (event.target.value === 'custom') return; setCoverImageId(null); setNewCover(undefined); setCoverId(event.target.value || null); }}>{coverImageId && <option value="custom">Своё изображение</option>}<option value="">Автоматически из последней записи</option>{coverId && !candidates.some(entry => entry.id === coverId) && <option value={coverId} disabled>Обложка недоступна — выберите другую</option>}{candidates.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>{!coverImageId && coverId && candidates.find(entry => entry.id === coverId) && <div className="diary-group-cover-preview"><DiaryImage imageId={candidates.find(entry => entry.id === coverId)?.imageIds[0]} thumbnail alt="Обложка группы" /></div>}<div className="diary-group-cover-upload"><label>Загрузить свою обложку<input type="file" accept="image/*" aria-label="Загрузить обложку группы" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadCover(file); }} /></label>{coverImageId && <><div className="diary-group-cover-preview">{newCover ? <MediaAssetImage asset={newCover} thumbnail alt="Обложка группы" /> : <DiaryImage imageId={coverImageId} thumbnail alt="Обложка группы" />}</div><button type="button" className="diary-group-link" disabled={busy} onClick={() => { settled.current = false; setCoverImageId(null); setNewCover(undefined); }}>Убрать свою обложку</button></>}<p className="diary-groups-help">Загрузите изображение или выберите фото из записей группы.</p></div><button className="diary-group-primary" type="submit" disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить группу'}</button></form>}
    {mode === 'entries' && <section className="modal-panel diary-groups-panel">
      <h3>{assignment?.title ?? 'Группа удалена'}</h3>
      <p className="diary-groups-help">Отметьте записи для этой группы. Запись из другой группы будет перемещена, снятая отметка оставит её без группы.</p>
      <SearchBar value={query} onChange={setQuery} label="Поиск записей для группы" />
      <div className="diary-group-bulk-actions"><button type="button" disabled={busy} onClick={() => { settled.current = false; setSelected(current => [...new Set([...current, ...assignmentResults.map(entry => entry.id)])]); }}>Выбрать найденные ({assignmentResults.length})</button><button type="button" disabled={busy} onClick={() => { settled.current = false; const found = new Set(assignmentResults.map(entry => entry.id)); setSelected(current => current.filter(id => !found.has(id))); }}>Снять найденные</button></div>
      <p className="diary-groups-help" role="status">Выбрано записей: {selectedCount}</p>
      <div className="diary-group-entry-list">{assignmentResults.slice(0, shown).map(entry => <label key={entry.id} className="diary-group-entry">
        <input type="checkbox" aria-label={`Включить запись: ${entry.title}`} disabled={busy || !assignment} checked={selectedSet.has(entry.id)} onChange={event => toggleEntry(entry.id, event.target.checked)} />
        <span className="diary-group-entry-photo"><DiaryImage imageId={entry.imageIds[0]} thumbnail alt="" /></span>
        <span><strong>{entry.title}</strong><small>{formatDiaryDate(diaryDate(entry))}</small>{entry.groupId && entry.groupId !== assignmentId && <small>Сейчас: {byId.get(entry.groupId)?.title ?? 'Другая группа'}</small>}</span>
      </label>)}</div>
      {!assignmentResults.length && <p>Записей не найдено.</p>}
      {shown < assignmentResults.length && <button type="button" className="diary-group-link" onClick={() => setShown(value => value + 100)}>Показать ещё</button>}
      <button type="button" className="diary-group-primary" disabled={busy || !assignment} onClick={() => void save()}>{busy ? 'Сохранение…' : 'Сохранить распределение'}</button>
    </section>}
  </Modal>;
}
