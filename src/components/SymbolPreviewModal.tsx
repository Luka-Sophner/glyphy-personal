import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useRef, useState } from 'react';
import type { GlyphySymbol } from '../types';
import { useSymbols } from '../features/symbols/SymbolContext';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { motion, AnimatePresence } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';
import { meaningFor } from '../features/symbols/meanings';
import { categories } from '../lib/categories';
export function SymbolPreviewModal({ embedded = false, symbolId, onClose, onEdit, readOnly = false }: { embedded?: boolean; symbolId?: string; onClose?: () => void; onEdit?: () => void; readOnly?: boolean } = {}) {
  const { cardId: routeCardId } = useParams(); const cardId = symbolId ?? routeCardId; const location = useLocation(); const navigate = useNavigate();
  const { symbols, deleteSymbol, loading } = useSymbols(); const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState('');
  const { reduced } = useNavigationMotion();
  const found = symbols.find(s => s.id === cardId), lastKnown = useRef<GlyphySymbol>();
  if (found) lastKnown.current = found;
  const symbol = found ?? (deleting ? lastKnown.current : undefined); const backgroundPath = location.state?.backgroundPath ?? '/';
  const close = () => { if (!deleting) { if (onClose) onClose(); else navigate(backgroundPath, { replace: true }); } };
  const remove = async () => {
    if (!symbol || deleting) return; setDeleting(true); setDeleteError('');
    try { await deleteSymbol(symbol.id); close(); } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Не удалось удалить карточку.'); setDeleting(false); }
  };
  const content = <>
    <div className="modal-toolbar">{symbol && !readOnly && <>
      <button type="button" className="modal-action delete-action" aria-label="Удалить карточку" disabled={deleting} onClick={() => setConfirmDelete(value => !value)}><Icon name="trash" /></button>
      <button type="button" className="modal-action" aria-label="Редактировать карточку" disabled={deleting} onClick={() => onEdit ? onEdit() : navigate(`/cards/${symbol.id}/edit`, { replace: true, state: { backgroundPath } })}><Icon name="edit" /></button>
    </>}<button type="button" className="modal-action" aria-label="Закрыть карточку" disabled={deleting} onClick={close} autoFocus><Icon name="close" /></button></div>
    <article className="modal-panel preview-panel">{!symbol ? <><h2 id="preview-title">{loading ? 'Загрузка карточки…' : 'Карточка не найдена'}</h2><p>{loading ? '' : 'Она могла быть удалена.'}</p></> : <>
      {confirmDelete && <div className="delete-confirm" role="group" aria-label="Подтверждение удаления"><p>Удалить карточку?</p>
        <button type="button" disabled={deleting} onClick={remove}>{deleting ? 'Удаление…' : 'Удалить'}</button><button type="button" disabled={deleting} onClick={() => setConfirmDelete(false)}>Отмена</button>{deleteError && <p role="alert">{deleteError}</p>}</div>}
      <div className="preview-meanings">{[...symbol.meanings].sort((a, b) => Number(b.isPrimaryCategory) - Number(a.isPrimaryCategory) || a.order - b.order).map((meaning, index) => <section className="preview-meaning" key={meaning.id}>
        {embedded && <span className="preview-category">{categories.find(category => category.id === meaning.category)?.label}</span>}<h2 id={index === 0 ? 'preview-title' : undefined}>{meaning.primary}</h2><p>{meaning.secondary.join(', ')}</p>
      </section>)}</div>
      <img className="preview-image" src={symbol.image} alt={`Символ: ${meaningFor(symbol)?.primary ?? ''}`} />
      <p className="preview-tags"><AnimatePresence>{symbol.tags.map((tag, index) => <motion.span key={tag} className="preview-tag" layout
        initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
        transition={reduced ? { duration: 0 } : { ...animation.row, delay: Math.min(index, 8) * animation.cardStagger }}>{index > 0 ? ', ' : ''}{tag}</motion.span>)}</AnimatePresence></p>
    </>}</article>
  </>; return embedded ? <div className="symbol-preview-content">{content}</div> : <Modal labelId="preview-title" onClose={close} className="preview-modal">{content}</Modal>;
}

