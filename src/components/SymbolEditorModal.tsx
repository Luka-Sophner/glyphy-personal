import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSymbols } from '../features/symbols/SymbolContext';
import { mediaSaveError } from '../db/storage-errors';
import { prepareMedia } from '../features/symbols/media';
import { useObjectURL } from '../hooks/useObjectURL';
import { createId } from '../lib/id';
import { categories } from '../lib/categories';
import type { MeaningGroup, MediaAsset } from '../types';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { MeaningGroupEditor } from './MeaningGroupEditor';
import { motion, AnimatePresence } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';

export function SymbolEditorModal() {
  const { cardId } = useParams(), location = useLocation(), navigate = useNavigate();
  const { loading, databaseError } = useSymbols();
  if (loading || databaseError) return <Modal labelId="editor-loading" className="editor-modal" onClose={() => navigate(location.state?.returnTo ?? location.state?.backgroundPath ?? '/', { replace: true, state: location.state })}>
    <div className="modal-panel"><h2 id="editor-loading">{loading ? 'Загрузка карточки…' : 'База недоступна'}</h2><p>{databaseError}</p></div>
  </Modal>;
  return <Editor key={cardId} />;
}

function Editor() {
  const { cardId } = useParams(), { symbols, saveSymbol } = useSymbols(), location = useLocation(), navigate = useNavigate();
  const existing = useRef(symbols.find(symbol => symbol.id === cardId)).current;
  const backgroundPath = location.state?.backgroundPath ?? '/', { reduced } = useNavigationMotion();
  const [meanings, setMeanings] = useState<MeaningGroup[]>(() => existing ? structuredClone(existing.meanings) : [
    { id: createId(), category: 'phenomena', primary: '', secondary: [''], isPrimaryCategory: true, order: 0 },
  ]);
  const [photo, setPhoto] = useState<MediaAsset | null | undefined>();
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? ''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [saved, setSaved] = useState(false);
  const fingerprint = JSON.stringify({ meanings, tags, photo: photo === undefined ? 'keep' : photo?.id ?? 'remove' });
  const initial = useRef(fingerprint), dirty = fingerprint !== initial.current && !saved;
  const guard = useRef(false); guard.current = dirty || busy || preparing;
  const mounted = useRef(true), uploadGeneration = useRef(0);
  const writeInFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++uploadGeneration.current; }; }, []);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => guard.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!guard.current) return;
    const warn = (event: BeforeUnloadEvent) => { if (guard.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy, preparing]);
  const blob = photo === undefined ? existing?.media?.blob : photo?.blob;
  const localPreview = useObjectURL(blob);
  const image = localPreview ?? (photo === undefined && existing?.imageId ? existing.image : '');
  const close = () => { if (!busy) navigate(location.state?.returnTo ?? backgroundPath, { replace: true, state: location.state }); };
  const addMeaning = () => setMeanings(current => [...current, { id: createId(), category: categories.find(c => !current.some(g => g.category === c.id))?.id ?? 'phenomena', primary: '', secondary: [''], isPrimaryCategory: false, order: current.length }]);
  const removeMeaning = (id: string) => setMeanings(current => {
    const next = current.filter(group => group.id !== id);
    if (!next.some(group => group.isPrimaryCategory) && next[0]) next[0] = { ...next[0], isPrimaryCategory: true };
    return next;
  });
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    const generation = ++uploadGeneration.current; setPreparing(true); setError('');
    try { const asset = await prepareMedia(file); if (mounted.current && generation === uploadGeneration.current) setPhoto(asset); }
    catch (cause) { if (mounted.current && generation === uploadGeneration.current) setError(cause instanceof Error ? cause.message : 'Не удалось прочитать фото.'); }
    finally { if (mounted.current && generation === uploadGeneration.current) setPreparing(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (writeInFlight.current || preparing || saved) return;
    writeInFlight.current = true; setBusy(true); setError('');
    try {
      const result = await saveSymbol({ id: existing?.id, imageId: existing?.imageId ?? null, expectedUpdatedAt: existing?.updatedAt,
        meanings, tags: tags.split(',') }, photo);
      guard.current = false; setSaved(true); setBusy(false);
      if (blocker.state === 'blocked') blocker.reset();
      navigate(location.state?.returnTo ?? `/cards/${result.id}`, { replace: true, state: { ...location.state, backgroundPath } });
    } catch (cause) { writeInFlight.current = false; setError(mediaSaveError(cause)); setBusy(false); }
  };
  const missing = cardId !== 'new' && !existing;
  return <Modal labelId="editor-title" onClose={close} className="editor-modal">
    <div className="modal-toolbar"><button type="button" className="modal-action" aria-label="Закрыть редактор" onClick={close} disabled={busy}><Icon name="close" /></button></div>
    <form className="modal-panel editor-panel" onSubmit={save} aria-busy={busy || preparing}>
      <h2 className="sr-only" id="editor-title">{existing ? 'Редактирование карточки' : 'Создание карточки'}</h2>
      {blocker.state === 'blocked' && <div className="unsaved-confirm" role="alertdialog" aria-label="Несохранённые изменения">
        <p>{busy ? 'Сохранение карточки…' : 'Есть несохранённые изменения. Выйти без сохранения?'}</p>
        <button type="button" onClick={() => blocker.reset()}>Продолжить редактирование</button>
        <button type="button" disabled={busy} onClick={() => { guard.current = false; blocker.proceed(); }}>Выйти без сохранения</button>
      </div>}
      {missing ? <p>Карточка не найдена.</p> : <>
        <div className="editor-heading"><span className="editor-pencil"><Icon name="edit" /></span>
          <button type="submit" className="save-card" aria-label="Сохранить карточку" disabled={busy || preparing}><Icon name="check" /><span>{busy ? 'Сохранение…' : 'Сохранить'}</span></button>
          <span className="primary-category-label">Основная категория</span></div>
        <fieldset className="editor-fields" disabled={busy}>
          <div className="meaning-editors"><AnimatePresence initial={false}>{meanings.map((meaning, index) => <MeaningGroupEditor key={meaning.id} value={meaning} index={index}
            onChange={updated => setMeanings(current => current.map(group => group.id === updated.id ? updated : group))}
            onPrimary={() => setMeanings(current => current.map(group => ({ ...group, isPrimaryCategory: group.id === meaning.id })))}
            onRemove={meanings.length > 1 ? () => removeMeaning(meaning.id) : undefined} />)}</AnimatePresence></div>
          <button type="button" className="add-meaning" onClick={addMeaning}>+ Добавить группу</button>
          <div className="editor-media"><label className="photo-picker">{image ? <img src={image} alt="Выбранное изображение" /> : <span>Добавьте фото</span>}
            <input type="file" accept="image/*" aria-label="Добавить фотографию" onChange={upload} /></label>
            <motion.textarea className="tags-input" aria-label="Теги через запятую" placeholder="Тег 1, тег 2, тег 3…" value={tags} onChange={e => setTags(e.target.value)} whileFocus={reduced ? undefined : { scale: 1.012 }} transition={animation.gentleSpring} /></div>
          <div className="photo-actions"><label className="camera-picker">Сделать фото<input type="file" accept="image/*" capture="environment" aria-label="Сделать фото камерой" onChange={upload} /></label>
            {image && <button type="button" onClick={() => { ++uploadGeneration.current; setPreparing(false); setPhoto(null); }}>Удалить фото</button>}
          </div>
          {preparing && <p className="editor-note" role="status">Подготовка фотографии…</p>}
        </fieldset>
        {error && <p role="alert" className="editor-error">{error}</p>}
      </>}
    </form>
  </Modal>;
}

