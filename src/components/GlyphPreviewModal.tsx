import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGlyphs } from '../features/glyphs/GlyphContext';
import { useSymbols } from '../features/symbols/SymbolContext';
import type { GlyphCell, GlyphRecord } from '../types/glyphs-diary';
import { glyphPath, glyphSymbolPath } from '../features/glyphs/routes';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { GlyphGrid } from './GlyphGrid';
import { SymbolPreviewModal } from './SymbolPreviewModal';
import { motion } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';

export function GlyphPreviewModal({ glyphId, symbolId }: { glyphId: string; symbolId?: string }) {
  const { glyphs, loading, error, deleteGlyph, views } = useGlyphs(), { symbols, loading: symbolsLoading } = useSymbols();
  const navigate = useNavigate(), location = useLocation(), { reduced } = useNavigationMotion();
  const dialog = useRef<HTMLDialogElement>(null), lastKnown = useRef<GlyphRecord>();
  const [confirmDelete, setConfirmDelete] = useState(false), [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState('');
  const found = glyphs.find(glyph => glyph.id === glyphId); if (found) lastKnown.current = found;
  const glyph = found ?? (deleting ? lastKnown.current : undefined), parentPath = glyphPath(glyphId);
  const close = () => {
    if (deleting) return;
    if (symbolId) {
      if (location.state?.nestedFrom === parentPath) navigate(-1);
      else navigate(parentPath, { replace: true, state: { backgroundPath: '/glyphs' } });
    } else if (location.state?.fromGallery) navigate(-1);
    else navigate('/glyphs', { replace: true });
  };
  useLayoutEffect(() => {
    const element = dialog.current; if (!element) return;
    if (symbolId) {
      element.scrollTop = 0;
      element.querySelector<HTMLButtonElement>('.symbol-preview-content button[aria-label="Закрыть карточку"]')?.focus({ preventScroll: true });
    } else {
      const view = views.get(glyphId); element.scrollTop = view?.scrollTop ?? 0;
      const target = view?.position && element.querySelector<HTMLButtonElement>(`${view.partId ? `[data-glyph-part="${view.partId}"] ` : ''}button[data-glyph-position="${view.position}"]`);
      (target || element.querySelector<HTMLButtonElement>('button[aria-label="Закрыть глиф"]'))?.focus({ preventScroll: true });
    }
  }, [symbolId, glyphId, loading, views]);
  const openSymbol = (cell: GlyphCell, partId?: string) => {
    if (!cell.symbolId || !symbols.some(symbol => symbol.id === cell.symbolId)) return;
    views.set(glyphId, { scrollTop: dialog.current?.scrollTop ?? 0, position: cell.position, partId });
    navigate(glyphSymbolPath(glyphId, cell.symbolId), { state: { ...location.state, backgroundPath: '/glyphs', nestedFrom: parentPath } });
  };
  const editSymbol = () => {
    if (!symbolId) return;
    navigate(`/cards/${encodeURIComponent(symbolId)}/edit`, { replace: true, state: { ...location.state, backgroundPath: '/glyphs', returnTo: glyphSymbolPath(glyphId, symbolId) } });
  };
  const remove = async () => {
    if (deleting || !glyph) return; setDeleting(true); setDeleteError('');
    try { await deleteGlyph(glyph.id); navigate('/glyphs', { replace: true }); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Не удалось удалить глиф.'); setDeleting(false); }
  };
  const unavailable = !symbolsLoading && glyph && [glyph.cells, ...(glyph.additionalGlyphs ?? []).map(part => part.cells)].some(cells => cells.some(cell => cell.symbolId && !symbols.some(symbol => symbol.id === cell.symbolId)));
  return <Modal elementRef={dialog} labelId={symbolId ? 'preview-title' : 'glyph-preview-title'} onClose={close} className={`glyph-preview-modal ${symbolId ? 'shows-symbol' : ''}`}>
    <motion.div className="glyph-preview-layer" data-return-scroll={views.get(glyphId)?.scrollTop ?? 0} hidden={!!symbolId} aria-hidden={!!symbolId || undefined} initial={false} animate={{ opacity: symbolId ? 0 : 1 }} transition={reduced ? { duration: 0 } : animation.fade}>
      <div className="modal-toolbar">{glyph && <>
        <button type="button" className="modal-action delete-action" aria-label="Удалить глиф" disabled={deleting} onClick={() => setConfirmDelete(value => !value)}><Icon name="trash" /></button>
        <button type="button" className="modal-action" aria-label="Редактировать глиф" disabled={deleting} onClick={() => { views.set(glyphId, { scrollTop: dialog.current?.scrollTop ?? 0 }); navigate(`${parentPath}/edit`, { state: { ...location.state, backgroundPath: '/glyphs', glyphEditorFrom: parentPath } }); }}><Icon name="edit" /></button>
      </>}<button type="button" className="modal-action" aria-label="Закрыть глиф" disabled={deleting} onClick={close}><Icon name="close" /></button></div>
      <article className="modal-panel glyph-preview-panel">{!glyph ? <><h2 id="glyph-preview-title">{loading ? 'Загрузка глифа…' : 'Глиф не найден'}</h2>{error && <p role="alert">{error}</p>}</> : <>
        {confirmDelete && <div className="delete-confirm" role="group" aria-label="Подтверждение удаления глифа"><p>Удалить глиф?</p><button type="button" disabled={deleting} onClick={remove}>{deleting ? 'Удаление…' : 'Удалить'}</button><button type="button" disabled={deleting} onClick={() => setConfirmDelete(false)}>Отмена</button>{deleteError && <p role="alert">{deleteError}</p>}</div>}
        <h2 id="glyph-preview-title">{[glyph.primaryMeaning, ...(glyph.additionalGlyphs ?? []).map(part => part.primaryMeaning)].join(' · ')}</h2>
        {!glyph.additionalGlyphs?.length && !!glyph.synonyms.length && <p className="glyph-synonyms">{glyph.synonyms.join(', ')}</p>}
        <GlyphGrid glyph={glyph} interactive onOpen={openSymbol} />
        {unavailable && <p className="glyph-unavailable-note" role="status">Исходный символ недоступен</p>}
        {!glyph.additionalGlyphs?.length && glyph.description && <p className="glyph-description">{glyph.description}</p>}
      </>}</article>
    </motion.div>
    {symbolId && <motion.div key={symbolId} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : animation.row}><SymbolPreviewModal embedded symbolId={symbolId} onClose={close} onEdit={editSymbol} /></motion.div>}
  </Modal>;
}

