import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { DiaryEntry } from '../types/glyphs-diary';
import { useDiary } from '../features/diary/DiaryContext';
import { diaryPath, diaryPhotoPath } from '../features/diary/routes';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { DiaryPhotoGallery } from './DiaryPhotoGallery';
import { DiaryImage } from './DiaryImage';
import { DiaryGroupPicker } from './DiaryGroupPicker';

export function DiaryPreviewModal({ entryId, photoIndex }: { entryId: string; photoIndex?: number }) {
  const { entries, groups, loading, error, deleteEntry, assignEntryGroup, views } = useDiary(), navigate = useNavigate(), location = useLocation();
  const [assigning, setAssigning] = useState(false), [groupError, setGroupError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), lastKnown = useRef<DiaryEntry>();
  const [confirmDelete, setConfirmDelete] = useState(false), [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState(''), [zoom, setZoom] = useState(1);
  const found = entries.find(entry => entry.id === entryId); if (found) lastKnown.current = found;
  const entry = found ?? (deleting ? lastKnown.current : undefined), enlarged = photoIndex !== undefined, parentPath = diaryPath(entryId);
  const close = () => {
    if (deleting) return;
    if (enlarged) {
      if (location.state?.diaryPhotoFrom === parentPath) navigate(-1);
      else navigate(parentPath, { replace: true, state: { backgroundPath: '/diary' } });
    } else if (location.state?.fromDiary) navigate(-1);
    else navigate('/diary', { replace: true });
  };
  useEffect(() => { setZoom(1); }, [photoIndex]);
  useLayoutEffect(() => {
    const element = dialog.current; if (!element) return;
    if (enlarged) { element.scrollTop = 0; element.querySelector<HTMLButtonElement>('button[aria-label="Закрыть увеличенное фото"]')?.focus({ preventScroll: true }); }
    else {
      const view = views.get(entryId); element.scrollTop = view?.scrollTop ?? 0;
      const target = view && element.querySelector<HTMLButtonElement>(`button[data-diary-photo="${view.photoIndex}"]`);
      (target || element.querySelector<HTMLButtonElement>('button[aria-label="Закрыть запись"]'))?.focus({ preventScroll: true });
    }
  }, [enlarged, entryId, loading, views]);
  const enlarge = (index: number) => {
    views.set(entryId, { scrollTop: dialog.current?.scrollTop ?? 0, photoIndex: index });
    navigate(diaryPhotoPath(entryId, index), { state: { ...location.state, backgroundPath: '/diary', diaryPhotoFrom: parentPath } });
  };
  const remove = async () => {
    if (!entry || deleting) return; setDeleting(true); setDeleteError('');
    try { await deleteEntry(entry.id); navigate('/diary', { replace: true }); }
    catch (cause) { setDeleting(false); setDeleteError(cause instanceof Error ? cause.message : 'Не удалось удалить запись.'); }
  };
  return <Modal elementRef={dialog} labelId={enlarged ? 'diary-photo-title' : 'diary-preview-title'} onClose={close} className={`diary-preview-modal${enlarged ? ' diary-photo-zoom' : ''}`}>
    <div className="diary-preview-layer" hidden={enlarged}>
      <div className="modal-toolbar">{entry && <><button type="button" className="modal-action delete-action" aria-label="Удалить запись" disabled={deleting} onClick={() => setConfirmDelete(value => !value)}><Icon name="trash" /></button><button type="button" className="modal-action" aria-label="Редактировать запись" disabled={deleting} onClick={() => { views.set(entryId, { scrollTop: dialog.current?.scrollTop ?? 0, photoIndex: views.get(entryId)?.photoIndex ?? 0 }); navigate(`${parentPath}/edit`, { state: { ...location.state, backgroundPath: '/diary', diaryEditorFrom: parentPath } }); }}><Icon name="edit" /></button></>}<button type="button" className="modal-action" aria-label="Закрыть запись" onClick={close} disabled={deleting}><Icon name="close" /></button></div>
      <article className="modal-panel diary-preview-panel">{!entry ? <><h2 id="diary-preview-title">{loading ? 'Загрузка записи…' : error ? 'Дневник недоступен' : 'Запись не найдена'}</h2>{error && <p role="alert">{error}</p>}</> : <>
        {confirmDelete && <div className="delete-confirm" role="group" aria-label="Подтверждение удаления записи"><p>Удалить запись дневника?</p><button type="button" onClick={remove} disabled={deleting}>{deleting ? 'Удаление…' : 'Удалить'}</button><button type="button" disabled={deleting} onClick={() => setConfirmDelete(false)}>Отмена</button>{deleteError && <p role="alert">{deleteError}</p>}</div>}
        <h2 id="diary-preview-title">{entry.title}</h2>
        <DiaryPhotoGallery imageIds={entry.imageIds} title={entry.title} initialIndex={views.get(entryId)?.photoIndex ?? 0} onIndex={index => views.set(entryId, { scrollTop: views.get(entryId)?.scrollTop ?? 0, photoIndex: index })} onEnlarge={enlarge} />
        {entry.description.trim() && <p className="diary-description">{entry.description}</p>}
        <div className="diary-preview-group"><DiaryGroupPicker value={entry.groupId ?? null} disabled={assigning || deleting} onChange={value => {
          setAssigning(true); setGroupError(''); void assignEntryGroup(entry.id, value).catch(cause => setGroupError(cause instanceof Error ? cause.message : 'Не удалось изменить группу.')).finally(() => setAssigning(false));
        }} />{!groups.length && <button type="button" className="diary-group-link" onClick={() => navigate('/diary/groups', { state: { ...location.state, backgroundPath: '/diary', diaryGroupsFrom: parentPath, diaryGroupEditor: 'new' } })}>Создать группу</button>}{groupError && <p role="alert">{groupError}</p>}</div>
      </>}</article>
    </div>
    {enlarged && <div className="diary-zoom-layer"><div className="modal-toolbar"><button type="button" className="modal-action" aria-label="Закрыть увеличенное фото" onClick={close}><Icon name="close" /></button></div><section className="modal-panel diary-zoom-panel"><h2 className="sr-only" id="diary-photo-title">{entry ? `${entry.title}, фото ${(photoIndex ?? 0) + 1}` : 'Фотография недоступна'}</h2>
      <div className="diary-zoom-controls" role="group" aria-label="Масштаб фотографии"><button type="button" aria-label="Уменьшить фото" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .5))}>−</button><button type="button" aria-label="Сбросить масштаб" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button type="button" aria-label="Увеличить фото" disabled={zoom >= 4} onClick={() => setZoom(value => Math.min(4, value + .5))}>+</button></div>
      <div className="diary-zoom-viewport" tabIndex={0} aria-label="Увеличенная фотография, прокручивается"><DiaryImage imageId={entry?.imageIds[photoIndex ?? 0]} alt={entry?.title ?? 'Фотография недоступна'} zoom={zoom} /></div>
      {entry && entry.imageIds.length > 1 && <div className="diary-photo-controls" role="group" aria-label="Переключение увеличенных фотографий"><button type="button" aria-label="Предыдущее фото" disabled={photoIndex === 0} onClick={() => navigate(diaryPhotoPath(entryId, (photoIndex ?? 0) - 1), { replace: true, state: location.state })}>←</button><span>{(photoIndex ?? 0) + 1} / {entry.imageIds.length}</span><button type="button" aria-label="Следующее фото" disabled={(photoIndex ?? 0) >= entry.imageIds.length - 1} onClick={() => navigate(diaryPhotoPath(entryId, (photoIndex ?? 0) + 1), { replace: true, state: location.state })}>→</button></div>}
    </section></div>}
  </Modal>;
}
