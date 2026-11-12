import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type MutableRefObject, type RefObject } from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { useDiary } from '../features/diary/DiaryContext';
import { appendDiaryPhotos, diarySaveError, initialObservationDate, makeDiaryCover, pendingDiaryMedia, removeDiaryPhoto, replaceDiaryPhoto, validateDiaryDraft } from '../features/diary/editor';
import { prepareDiaryMedia } from '../features/diary/media';
import { diaryPath } from '../features/diary/routes';
import { diaryDate, formatDiaryDate } from '../features/diary/presentation';
import type { DiaryEntry } from '../types/glyphs-diary';
import type { MediaAsset } from '../types';
import { useNavigationMotion } from '../app/NavigationMotion';
import { motion, AnimatePresence, useIsPresent } from '../lib/motion';
import { animation } from '../lib/animations';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { MediaAssetImage } from './DiaryImage';
import { DiaryGroupPicker } from './DiaryGroupPicker';

function PhotoThumbnail({ asset, index, selected, disabled, onSelect }: { asset?: MediaAsset; index: number; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const present = useIsPresent(), { reduced } = useNavigationMotion();
  return <motion.button layout type="button" className="diary-editor-thumbnail" aria-label={`Фото ${index + 1}${index === 0 ? ', обложка' : ''}`} aria-pressed={selected} disabled={disabled || !present} tabIndex={present ? 0 : -1} onClick={onSelect}
    initial={reduced ? false : { opacity: 0, scale: .85, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .8 }} whileTap={reduced ? undefined : { scale: animation.pressScale }} transition={reduced ? { duration: 0 } : animation.gentleSpring}>
    <MediaAssetImage asset={asset} thumbnail alt={`Фото ${index + 1}`} />
  </motion.button>;
}

export function DiaryEntryEditor({ entryId }: { entryId: string }) {
  const { loading, error } = useDiary(), navigate = useNavigate(), location = useLocation();
  const dialog = useRef<HTMLDialogElement>(null), closeDelegate = useRef<(() => void) | null>(null);
  const ready = useRef(false); if (!loading && !error) ready.current = true;
  const enlarged = typeof location.state?.diaryEditorPhoto === 'string';
  const close = () => {
    if (closeDelegate.current) { closeDelegate.current(); return; }
    if (location.state?.diaryEditorFrom) navigate(-1);
    else navigate(entryId === 'new' ? '/diary' : diaryPath(entryId), { replace: true, state: { backgroundPath: '/diary' } });
  };
  return <Modal elementRef={dialog} labelId={enlarged ? 'diary-editor-photo-title' : 'diary-editor-title'} onClose={close} className={`diary-entry-editor${enlarged ? ' diary-photo-zoom' : ''}`}>
    <div className="modal-toolbar"><button type="button" className="modal-action" aria-label={enlarged ? 'Закрыть увеличенное фото' : 'Закрыть редактор дневника'} onClick={close}><Icon name="close" /></button></div>
    {!ready.current ? <section className="modal-panel diary-entry-panel"><h2 id={enlarged ? 'diary-editor-photo-title' : 'diary-editor-title'}>{loading ? 'Загрузка записи…' : 'Дневник недоступен'}</h2>{error && <p role="alert">{error}</p>}</section> : <EntryForm key={entryId} entryId={entryId} dialog={dialog} closeDelegate={closeDelegate} />}
  </Modal>;
}

function EntryForm({ entryId, dialog, closeDelegate }: { entryId: string; dialog: RefObject<HTMLDialogElement>; closeDelegate: MutableRefObject<(() => void) | null> }) {
  const { entries, media, saveEntry, error: databaseError } = useDiary(), navigate = useNavigate(), location = useLocation(), { reduced } = useNavigationMotion();
  const existing = useRef<DiaryEntry | undefined>(entries.find(entry => entry.id === entryId)).current;
  const originalMedia = useRef(new Map((existing?.imageIds ?? []).flatMap(id => media.has(id) ? [[id, media.get(id)!] as const] : [])));
  const [title, setTitle] = useState(existing?.title ?? ''), [description, setDescription] = useState(existing?.description ?? ''), [observationDate, setObservationDate] = useState(() => initialObservationDate(existing));
  const [groupId, setGroupId] = useState<string | null>(existing ? existing.groupId ?? null : location.state?.diaryInitialGroupId ?? null);
  const [imageIds, setImageIds] = useState<string[]>(() => [...(existing?.imageIds ?? [])]), [pending, setPending] = useState(new Map<string, MediaAsset>());
  const [activeId, setActiveId] = useState<string | null>(existing?.imageIds[0] ?? null), [error, setError] = useState(''), [saving, setSaving] = useState(false), [preparing, setPreparing] = useState(false), [progress, setProgress] = useState(''), [zoom, setZoom] = useState(1);
  const galleryInput = useRef<HTMLInputElement>(null), cameraInput = useRef<HTMLInputElement>(null), replaceInput = useRef<HTMLInputElement>(null), replaceTarget = useRef<string | null>(null);
  const idsRef = useRef(imageIds); idsRef.current = imageIds;
  const mounted = useRef(true), generation = useRef(0), preparingRef = useRef(false), writeInFlight = useRef(false), saved = useRef(false), guard = useRef(false), editorScroll = useRef(0);
  const assets = useMemo(() => new Map([...originalMedia.current, ...media, ...pending]), [media, pending]);
  const enlargedId = typeof location.state?.diaryEditorPhoto === 'string' ? location.state.diaryEditorPhoto as string : null;
  const fingerprint = JSON.stringify({ title, description, observationDate, imageIds, groupId }), initial = useRef(fingerprint);
  const dirty = fingerprint !== initial.current && !saved.current; guard.current = !saved.current && (dirty || preparing || saving);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => guard.current && currentLocation.pathname !== nextLocation.pathname);
  const blockerRef = useRef(blocker); blockerRef.current = blocker;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; closeDelegate.current = null; }; }, [closeDelegate]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (guard.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, []);
  useEffect(() => { if (blocker.state === 'blocked') dialog.current?.querySelector<HTMLButtonElement>('[data-diary-continue]')?.focus({ preventScroll: true }); }, [blocker.state, dialog]);
  useLayoutEffect(() => {
    setZoom(1);
    const element = dialog.current; if (!element) return;
    if (enlargedId) { element.scrollTop = 0; element.querySelector<HTMLButtonElement>('button[aria-label="Закрыть увеличенное фото"]')?.focus({ preventScroll: true }); }
    else { element.scrollTop = editorScroll.current; element.querySelector<HTMLButtonElement>('[data-diary-enlarge]')?.focus({ preventScroll: true }); }
  }, [enlargedId, dialog]);
  const close = () => {
    if (writeInFlight.current) return;
    if (blocker.state === 'blocked') { blocker.reset(); return; }
    if (enlargedId) { navigate(-1); return; }
    if (location.state?.diaryEditorFrom) navigate(-1);
    else navigate(existing ? diaryPath(existing.id) : '/diary', { replace: true, state: { backgroundPath: '/diary' } });
  };
  closeDelegate.current = close;
  const setPhotos = (ids: string[], additions: MediaAsset[] = []) => {
    idsRef.current = ids; setImageIds(ids);
    setPending(current => { const next = new Map(current); for (const asset of additions) next.set(asset.id, asset); for (const id of next.keys()) if (!ids.includes(id)) next.delete(id); return next; });
  };
  const upload = async (files: File[], previousId?: string | null) => {
    if (!files.length || preparingRef.current || writeInFlight.current) return;
    if (previousId && files.length !== 1 || !previousId && files.length + idsRef.current.length > 50) { setError('В записи может быть до 50 фотографий. Для замены выберите один файл.'); return; }
    preparingRef.current = true; const currentGeneration = ++generation.current; setPreparing(true); setError('');
    const prepared: MediaAsset[] = [], failures: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        if (!mounted.current || generation.current !== currentGeneration) return;
        setProgress(`Подготовка фото ${index + 1} из ${files.length}…`);
        try { const asset = await prepareDiaryMedia(file); if (!mounted.current || generation.current !== currentGeneration) return; prepared.push(asset); }
        catch (cause) { failures.push(`${file.name}: ${cause instanceof Error ? cause.message : 'Не удалось прочитать изображение.'}`); }
      }
      if (!mounted.current || generation.current !== currentGeneration) return;
      if (prepared.length) {
        const next = previousId ? replaceDiaryPhoto(idsRef.current, previousId, prepared[0]) : appendDiaryPhotos(idsRef.current, prepared);
        setPhotos(next, prepared); setActiveId(prepared[0].id);
      }
      if (failures.length) setError(failures.join('\n'));
    } catch (cause) { if (mounted.current) setError(diarySaveError(cause)); }
    finally { if (mounted.current && generation.current === currentGeneration) { preparingRef.current = false; setPreparing(false); setProgress(''); } }
  };
  const selectFiles = (event: ChangeEvent<HTMLInputElement>, previousId?: string | null) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void upload(files, previousId); };
  const removePhoto = () => {
    if (!activeId || preparingRef.current || writeInFlight.current) return;
    const index = imageIds.indexOf(activeId), next = removeDiaryPhoto(imageIds, activeId); setPhotos(next); setActiveId(next[Math.min(index, next.length - 1)] ?? null); setError('');
  };
  const enlarge = () => { if (!activeId || preparingRef.current || writeInFlight.current) return; editorScroll.current = dialog.current?.scrollTop ?? 0; navigate(location.pathname, { state: { ...location.state, diaryEditorPhoto: activeId } }); };
  const save = async (event?: FormEvent) => {
    event?.preventDefault(); if (writeInFlight.current || preparingRef.current || saved.current || entryId !== 'new' && !existing) return;
    const input = { title, description, observationDate, imageIds, groupId };
    try { validateDiaryDraft(input); }
    catch (cause) { if (blocker.state === 'blocked') blocker.reset(); setError(diarySaveError(cause)); if (!title.trim()) dialog.current?.querySelector<HTMLInputElement>('#diary-entry-title')?.focus(); return; }
    writeInFlight.current = true; setSaving(true); setError('');
    try {
      const result = await saveEntry(input, pendingDiaryMedia(imageIds, pending), existing?.id, { expectedUpdatedAt: existing?.updatedAt });
      if (!mounted.current) return;
      saved.current = true; guard.current = false;
      const pendingNavigation = blockerRef.current;
      if (pendingNavigation.state === 'blocked') { pendingNavigation.proceed(); return; }
      if (existing && location.state?.diaryEditorFrom === diaryPath(existing.id)) navigate(-1);
      else navigate(diaryPath(result.id), { replace: true, state: { backgroundPath: '/diary', diaryBackgroundSearch: location.state?.diaryBackgroundSearch, fromDiary: !existing && (location.state?.diaryEditorFrom === '/diary' || String(location.state?.diaryEditorFrom ?? '').startsWith('/diary?')) } });
    } catch (cause) { if (mounted.current) { writeInFlight.current = false; setSaving(false); setError(diarySaveError(cause)); } }
  };
  const disabled = saving || preparing, activeAsset = activeId ? assets.get(activeId) : undefined, missing = entryId !== 'new' && !existing;
  return <>
    {blocker.state === 'blocked' && <section className="diary-unsaved-confirm" role="alertdialog" aria-labelledby="diary-unsaved-title"><h3 id="diary-unsaved-title">Несохранённые изменения</h3><p>{saving ? 'Запись сохраняется. Дождитесь завершения.' : preparing ? 'Фотографии ещё обрабатываются. Можно продолжить редактирование или выйти без сохранения.' : 'Сохранить изменения перед выходом?'}</p>{error && <p role="alert">{error}</p>}<button type="button" disabled={disabled} onClick={() => void save()}>Сохранить и выйти</button><button type="button" data-diary-continue disabled={saving} onClick={() => blocker.reset()}>Продолжить редактирование</button><button type="button" disabled={saving} onClick={() => { generation.current++; saved.current = true; guard.current = false; blocker.proceed(); }}>Выйти без сохранения</button></section>}
    <form className="modal-panel diary-entry-panel" onSubmit={event => void save(event)} hidden={!!enlargedId} aria-busy={saving || preparing}>
      <h2 className="sr-only" id="diary-editor-title">{existing ? 'Редактирование записи дневника' : 'Новая запись дневника'}</h2><span className="editor-pencil"><Icon name="edit" /></span>
      {missing ? <p role="alert">Запись не найдена. Закройте редактор и создайте новую запись.</p> : <>
        <fieldset className="diary-editor-fields" disabled={saving}>
          <input ref={galleryInput} type="file" accept="image/*,.heic,.heif" multiple hidden disabled={disabled} data-diary-upload="gallery" aria-label="Выбрать фотографии из галереи" onChange={event => selectFiles(event)} />
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden disabled={disabled} data-diary-upload="camera" aria-label="Сфотографировать страницу" onChange={event => selectFiles(event)} />
          <input ref={replaceInput} type="file" accept="image/*,.heic,.heif" hidden disabled={disabled} data-diary-upload="replace" aria-label="Заменить фотографию" onChange={event => selectFiles(event, replaceTarget.current)} />
          <motion.button type="button" className="diary-editor-photo" data-diary-enlarge={activeId || undefined} aria-label={activeId ? 'Рассмотреть выбранное фото' : 'Добавить фото'} disabled={disabled} onClick={() => activeId ? enlarge() : galleryInput.current?.click()} whileTap={reduced ? undefined : { scale: .985 }} transition={animation.gentleSpring}>
            {activeId ? <MediaAssetImage asset={activeAsset} alt={`Выбранная фотография ${imageIds.indexOf(activeId) + 1}`} /> : <span>Добавьте фото</span>}
          </motion.button>
          <div className="diary-editor-thumbnails" role="group" aria-label="Фотографии записи"><AnimatePresence initial={false}>{imageIds.map((id, index) => <PhotoThumbnail key={id} asset={assets.get(id)} index={index} selected={id === activeId} disabled={disabled} onSelect={() => setActiveId(id)} />)}</AnimatePresence></div>
          <div className="diary-editor-photo-actions"><button type="button" disabled={disabled || imageIds.length >= 50} onClick={() => galleryInput.current?.click()}>Галерея</button><button type="button" disabled={disabled || imageIds.length >= 50} onClick={() => cameraInput.current?.click()}>Камера</button>{activeId && <><button type="button" disabled={disabled} onClick={() => { replaceTarget.current = activeId; replaceInput.current?.click(); }}>Заменить</button><button type="button" disabled={disabled} onClick={removePhoto}>Удалить фото</button>{activeId !== imageIds[0] && <button type="button" disabled={disabled} onClick={() => setPhotos(makeDiaryCover(imageIds, activeId))}>Сделать обложкой</button>}</>}</div>
          {preparing && <p className="diary-editor-progress" role="status">{progress || 'Подготовка фотографии…'}</p>}
          <label className="sr-only" htmlFor="diary-entry-title">Название</label><input id="diary-entry-title" className="diary-editor-input" placeholder="Название" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} aria-required="true" />
          <label className="sr-only" htmlFor="diary-entry-description">Описание</label><textarea id="diary-entry-description" className="diary-editor-input diary-editor-description" placeholder="Описание" value={description} onChange={event => setDescription(event.target.value)} maxLength={20000} rows={4} />
          <label className="diary-editor-date-label" htmlFor="diary-entry-observation">Дата наблюдения</label><input id="diary-entry-observation" className="diary-editor-input diary-editor-date" type="date" value={observationDate} onChange={event => setObservationDate(event.target.value)} aria-required="true" />
          <DiaryGroupPicker value={groupId} onChange={setGroupId} disabled={saving} />
          {existing && <dl className="diary-editor-dates"><dt>Создано</dt><dd>{formatDiaryDate(diaryDate({ observationDate: '', createdAt: existing.createdAt }))} · {new Date(existing.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</dd><dt>Изменено</dt><dd>{new Date(existing.updatedAt).toLocaleString('ru-RU')}</dd></dl>}
        </fieldset>
        <div className="diary-entry-save-area">{(error || databaseError) && blocker.state !== 'blocked' && <p className="diary-editor-error" role="alert">{error || databaseError}</p>}<motion.button type="submit" className="diary-entry-save" disabled={disabled} animate={{ opacity: saving ? .75 : 1 }} whileTap={reduced ? undefined : { scale: animation.pressScale }} transition={animation.fade}>{saving ? 'Сохранение…' : preparing ? 'Подготовка фото…' : 'Сохранить'}</motion.button></div>
      </>}
    </form>
    {enlargedId && <section className="modal-panel diary-zoom-panel diary-editor-zoom-panel"><h2 className="sr-only" id="diary-editor-photo-title">Увеличенная фотография записи</h2><div className="diary-zoom-controls" role="group" aria-label="Масштаб фотографии"><button type="button" aria-label="Уменьшить фото" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .5))}>−</button><button type="button" aria-label="Сбросить масштаб" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button type="button" aria-label="Увеличить фото" disabled={zoom >= 4} onClick={() => setZoom(value => Math.min(4, value + .5))}>+</button></div><div className="diary-zoom-viewport" tabIndex={0} aria-label="Увеличенная фотография, прокручивается"><MediaAssetImage asset={assets.get(enlargedId)} alt="Увеличенная фотография перед сохранением" zoom={zoom} /></div></section>}
  </>;
}
