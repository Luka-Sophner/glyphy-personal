import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { useGlyphs } from '../features/glyphs/GlyphContext';
import { useSymbols } from '../features/symbols/SymbolContext';
import { glyphRepository } from '../db/repositories';
import { emptyGlyphCells, glyphPositionCategories, type GlyphCell, type GlyphPosition, type GlyphRecord, type GlyphPart } from '../types/glyphs-diary';
import { createId } from '../lib/id';
import { addSynonyms, createPickerIndex, glyphPositionLabels, replaceGlyphCell, validateGlyphInput } from '../features/glyphs/editor';
import { useNavigationMotion } from '../app/NavigationMotion';
import { useObjectURL } from '../hooks/useObjectURL';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { SearchBar } from './SearchBar';
import { SymbolCard } from './SymbolCard';
import { SymbolPreviewModal } from './SymbolPreviewModal';
import { motion, AnimatePresence } from '../lib/motion';
import { animation } from '../lib/animations';

type Pane = 'editor' | 'picker' | 'actions' | 'symbol' | 'number' | 'special';
function EditorCell({ cell, onClick, disabled }: { cell: GlyphCell; onClick: () => void; disabled?: boolean }) {
  const { symbols } = useSymbols(), { retainedThumbnails } = useGlyphs(), { reduced } = useNavigationMotion();
  const symbol = symbols.find(value => value.id === cell.symbolId);
  const retained = useObjectURL(cell.imageIdSnapshot ? retainedThumbnails.get(cell.imageIdSnapshot) : undefined);
  const image = retained ?? (symbol?.imageId ? symbol.thumbnail : undefined);
  return <motion.button type="button" className="glyph-cell" disabled={disabled} data-editor-position={cell.position} aria-label={glyphPositionLabels[cell.position] + (cell.meaningSnapshot ? ': ' + cell.meaningSnapshot : ': пусто')} title={glyphPositionLabels[cell.position]} onClick={onClick} whileTap={reduced ? undefined : { scale: animation.pressScale }}>
    <AnimatePresence mode="wait" initial={false}>{image ? <motion.img key={image} src={image} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={reduced ? { duration: 0 } : animation.fade} /> : cell.referenceValue ? <span className="glyph-reference">{cell.referenceValue.kind === 'local-reference' ? '↗ ' : ''}{cell.referenceValue.value}</span> : cell.symbolId ? <span className="glyph-missing-reading">{cell.meaningSnapshot}</span> : null}</AnimatePresence>
  </motion.button>;
}
export function GlyphEditorModal({ glyphId }: { glyphId: string }) {
  const { loading, error } = useGlyphs(), { loading: symbolsLoading, databaseError } = useSymbols(), navigate = useNavigate();
  if (loading || symbolsLoading) return <p className="glyph-loading-state" role="status">Загрузка глифа…</p>;
  if (error || databaseError) return <Modal labelId="glyph-editor-loading" className="glyph-editor-modal" onClose={() => navigate('/glyphs', { replace: true })}><section className="modal-panel"><h2 id="glyph-editor-loading">{error || databaseError ? 'База недоступна' : 'Загрузка глифа…'}</h2><p>{error || databaseError}</p></section></Modal>;
  return <Editor key={glyphId} glyphId={glyphId} />;
}
function Editor({ glyphId }: { glyphId: string }) {
  const { glyphs, setNotice, setQuery: setGlyphQuery } = useGlyphs(), { symbols } = useSymbols();
  const existing = useRef<GlyphRecord | undefined>(glyphs.find(glyph => glyph.id === glyphId)).current;
  const navigate = useNavigate(), location = useLocation(), { reduced } = useNavigationMotion();
  const [cells, setCells] = useState<GlyphCell[]>(() => structuredClone(existing?.cells ?? emptyGlyphCells()));
  const [primary, setPrimary] = useState(existing?.primaryMeaning ?? ''), [synonyms, setSynonyms] = useState(existing?.synonyms ?? []), [synonymInput, setSynonymInput] = useState(''), [description, setDescription] = useState(existing?.description ?? '');
  const [parts, setParts] = useState<GlyphPart[]>(() => [{ id: existing?.id ?? createId(), primaryMeaning: existing?.primaryMeaning ?? '', synonyms: existing?.synonyms ?? [], description: existing?.description ?? '', cells: structuredClone(existing?.cells ?? emptyGlyphCells()) }, ...structuredClone(existing?.additionalGlyphs ?? [])]);
  const [activePart, setActivePart] = useState(0);
  const [query, setQuery] = useState(''), [position, setPosition] = useState<GlyphPosition>('center'), [number, setNumber] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), saved = useRef(false), writeInFlight = useRef(false), guard = useRef(false);
  const pane: Pane = location.state?.glyphEditorPane ?? 'editor';
  const composition = parts.map((part, index) => index === activePart ? { ...part, cells, primaryMeaning: primary, synonyms: addSynonyms(synonyms, synonymInput), description } : part);
  const fingerprint = JSON.stringify({ composition, synonymInput }), initial = useRef(fingerprint);
  const dirty = initial.current !== fingerprint && !saved.current; guard.current = !saved.current && (dirty || busy);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => guard.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (guard.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, []);
  useEffect(() => { if (blocker.state === 'blocked') dialog.current?.querySelector<HTMLButtonElement>('.glyph-discard button')?.focus({ preventScroll: true }); }, [blocker.state]);
  const editorScroll = useRef(0), lastPane = useRef<Pane>('editor');
  useLayoutEffect(() => {
    if (dialog.current) dialog.current.scrollTop = pane === 'editor' ? editorScroll.current : 0;
    if (pane === 'editor' && lastPane.current !== 'editor') dialog.current?.querySelector<HTMLButtonElement>('[data-editor-position="' + position + '"]')?.focus({ preventScroll: true });
    else dialog.current?.querySelector<HTMLButtonElement>('button[aria-label^="Закрыть"]')?.focus({ preventScroll: true });
    lastPane.current = pane;
  }, [pane]);
  const openPane = (next: Pane) => { if (pane === 'editor') editorScroll.current = dialog.current?.scrollTop ?? 0; navigate(location.pathname, { replace: pane !== 'editor', state: { ...location.state, glyphEditorPane: next } }); };
  const backToEditor = () => { if (pane !== 'editor') navigate(-1); };
  const close = () => { if (busy) return; if (blocker.state === 'blocked') { blocker.reset(); return; } if (pane !== 'editor') { backToEditor(); return; } if (location.state?.glyphEditorFrom) navigate(-1); else navigate(existing ? '/glyphs/' + encodeURIComponent(existing.id) : '/glyphs', { replace: true, state: { backgroundPath: '/glyphs' } }); };
  const selected = cells.find(cell => cell.position === position)!;
  const source = symbols.find(symbol => symbol.id === selected.symbolId), group = source?.meanings.find(value => value.id === selected.meaningId);
  const category = position in glyphPositionCategories ? glyphPositionCategories[position as keyof typeof glyphPositionCategories] : null;
  const picker = useMemo(() => createPickerIndex(symbols, category), [symbols, category]);
  const results = useMemo(() => picker(query), [picker, query]);
  const changeCell = (cell: GlyphCell) => { const next: GlyphCell = { ...cell, ...(cell.symbolId && (cell.position === 'topLeft' || cell.position === 'bottomRight') ? { specialMode: 'symbol' as const } : {}) }; setCells(current => replaceGlyphCell(current, next)); setError(''); };
  const clear = () => { changeCell({ position, symbolId: null, meaningId: null, meaningSnapshot: '' }); backToEditor(); };
  const commitSynonyms = () => { setSynonyms(current => addSynonyms(current, synonymInput)); setSynonymInput(''); };
  const showPart = (next: GlyphPart[], index: number) => {
    setParts(next); setActivePart(index); setCells(structuredClone(next[index].cells)); setPrimary(next[index].primaryMeaning); setSynonyms([...next[index].synonyms]); setSynonymInput(''); setDescription(next[index].description); setError('');
  };
  const addPart = () => {
    if (busy || composition.length >= 12) return;
    showPart([...composition, { id: createId(), primaryMeaning: '', synonyms: [], description: '', cells: emptyGlyphCells() }], composition.length);
  };
  const removePart = () => {
    if (busy || activePart === 0) return;
    showPart(composition.filter((_, index) => index !== activePart), activePart - 1);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (writeInFlight.current || saved.current) return;
    const [first, ...additionalGlyphs] = composition;
    const input = { primaryMeaning: first.primaryMeaning.trim(), synonyms: first.synonyms, description: first.description, cells: first.cells, additionalGlyphs };
    if (composition.length > 1) {
      for (let index = 0; index < composition.length; index++) {
        try { validateGlyphInput(composition[index]); }
        catch (cause) { showPart(composition, index); setError(`Глиф ${index + 1}: ${(cause as Error).message}`); return; }
      }
    }
    try { validateGlyphInput(input); } catch (cause) { setError((cause as Error).message); return; }
    writeInFlight.current = true; setBusy(true); setError('');
    try {
      await glyphRepository.save(input, existing?.id, { expectedUpdatedAt: existing?.updatedAt });
      saved.current = true; guard.current = false; setGlyphQuery(''); setNotice(existing ? 'Глиф обновлён' : 'Глиф сохранён');
      if (blocker.state === 'blocked') blocker.reset();
      navigate('/glyphs', { replace: true });
    } catch (cause) { writeInFlight.current = false; setBusy(false); setError(cause instanceof Error ? cause.message : 'Не удалось сохранить глиф. Попробуйте снова.'); }
  };
  const missing = glyphId !== 'new' && !existing;
  const title = pane === 'picker' ? 'Выбор символа: ' + glyphPositionLabels[position] : pane === 'actions' ? 'Выбранный символ' : pane === 'number' || pane === 'special' ? glyphPositionLabels[position] : existing ? 'Редактирование глифа' : 'Создание глифа';
  return <Modal elementRef={dialog} labelId={pane === 'symbol' ? 'preview-title' : 'glyph-editor-title'} onClose={close} className={'glyph-editor-modal' + (pane === 'symbol' ? ' shows-symbol' : '')}>
    <div hidden={pane === 'symbol'}>
      <div className="modal-toolbar"><button type="button" className="modal-action" aria-label="Закрыть редактор глифа" onClick={close} disabled={busy}><Icon name="close" /></button></div>
      <h2 className="sr-only" id="glyph-editor-title">{title}</h2>
      {blocker.state === 'blocked' && <div className="unsaved-confirm glyph-discard" role="alertdialog" aria-label="Несохранённые изменения"><p>Есть несохранённые изменения. Выйти без сохранения?</p><button type="button" onClick={() => blocker.reset()}>Продолжить редактирование</button><button type="button" disabled={busy} onClick={() => { guard.current = false; blocker.proceed(); }}>Выйти без сохранения</button></div>}
      <form className="modal-panel glyph-editor-panel" onSubmit={save} hidden={pane !== 'editor'} aria-busy={busy}>
        <span className="editor-pencil"><Icon name="edit" /></span>
        {missing ? <p role="alert">Глиф не найден. Закройте редактор и создайте новый.</p> : <>
          <p className="glyph-editor-instruction">Нажимайте на ячейки, чтобы выбрать символ из словаря</p>
          <div className="glyph-composition-controls" role="group" aria-label="Глифы связки">
            {composition.map((part, index) => <button key={part.id} type="button" aria-pressed={index === activePart} disabled={busy} onClick={() => showPart(composition, index)} title={part.primaryMeaning || 'Новый глиф'}>Глиф {index + 1}</button>)}
            <button type="button" onClick={addPart} disabled={busy || composition.length >= 12}>+ Добавить глиф в связку</button>
          </div>
          {activePart > 0 && <button className="glyph-remove-part" type="button" onClick={removePart} disabled={busy}>Убрать этот глиф из связки</button>}
          <div className="glyph-grid glyph-editor-grid" role="group" aria-label="Девять позиций глифа">{cells.map(cell => <EditorCell key={cell.position} cell={cell} disabled={busy} onClick={() => {
            setPosition(cell.position); setQuery(''); setError('');
            if (!(cell.position in glyphPositionCategories)) { setNumber(cell.referenceValue ? String(cell.referenceValue.value) : ''); openPane('special'); }
            else openPane(cell.symbolId ? 'actions' : 'picker');
          }} />)}</div>
          <label className="sr-only" htmlFor="glyph-meaning">Значение</label><input id="glyph-meaning" className="glyph-field" placeholder="Значение" value={primary} onChange={event => setPrimary(event.target.value)} maxLength={200} aria-required="true" disabled={busy} />
          <div className="glyph-synonym-field"><AnimatePresence initial={false}>{synonyms.map(text => <motion.span layout key={text} className="glyph-synonym-chip" initial={reduced ? false : { opacity: 0, scale: .85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .8 }} transition={reduced ? { duration: 0 } : animation.gentleSpring}>{text}<button type="button" aria-label={'Удалить синоним: ' + text} onClick={() => setSynonyms(current => current.filter(value => value !== text))} disabled={busy}>×</button></motion.span>)}</AnimatePresence>
            <label className="sr-only" htmlFor="glyph-synonyms">Синонимы</label><input id="glyph-synonyms" placeholder="Синонимы" value={synonymInput} maxLength={200} disabled={busy} onChange={event => { const value = event.target.value; if (value.includes(',')) { const parts = value.split(','); setSynonyms(current => addSynonyms(current, parts.slice(0, -1).join(','))); setSynonymInput(parts.at(-1) ?? ''); } else setSynonymInput(value); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); commitSynonyms(); } }} onBlur={commitSynonyms} />
          </div>
          <label className="sr-only" htmlFor="glyph-description">Описание</label><textarea id="glyph-description" className="glyph-field glyph-description-field" placeholder="Описание" value={description} onChange={event => setDescription(event.target.value)} maxLength={20000} disabled={busy} />
          {error && <p className="glyph-editor-error" role="alert">{error}</p>}<button className="glyph-save" type="submit" disabled={busy}>{busy ? 'Сохранение…' : composition.length > 1 ? 'Сохранить связку' : 'Сохранить'}</button>
        </>}
      </form>
      {pane === 'picker' && <motion.section className="modal-panel glyph-picker-panel" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={animation.fade}><h3>{category ? glyphPositionLabels[position] : 'Любой символ'}</h3><SearchBar value={query} onChange={setQuery} label="Поиск символа для ячейки" /><p className="glyph-picker-help">{category ? 'Показаны значения нужной категории' : 'Все категории словаря. Выберите нужное значение символа.'}</p><div className="glyph-picker-results">{results.map(({ symbol, group: meaning }) => <SymbolCard key={symbol.id + ':' + meaning.id} symbol={symbol} titleOverride={meaning.primary} onSelect={() => { changeCell({ position, symbolId: symbol.id, meaningId: meaning.id, meaningSnapshot: meaning.primary, imageIdSnapshot: symbol.imageId }); backToEditor(); }} />)}</div>{!results.length && <p role="status">{query.trim() ? 'Ничего не найдено' : category ? 'В этой категории пока нет символов. Добавьте их в словарь.' : 'В словаре пока нет символов.'}</p>}</motion.section>}
      {pane === 'special' && <section className="modal-panel glyph-cell-actions"><h3>{glyphPositionLabels[position]}</h3><p className="glyph-unavailable-note">Выберите назначение ячейки</p><button type="button" onClick={() => openPane('number')}>Пронумеровать</button><button type="button" onClick={() => { setQuery(''); openPane('picker'); }}>Выбрать любой символ</button>{selected.symbolId && <button type="button" onClick={() => openPane('actions')}>Выбранный символ: {selected.meaningSnapshot}</button>}{(selected.symbolId || selected.referenceValue) && <button type="button" onClick={clear}>Очистить ячейку</button>}<button type="button" onClick={backToEditor}>Назад к глифу</button></section>}
      {pane === 'actions' && <section className="modal-panel glyph-cell-actions"><h3>{glyphPositionLabels[position]}</h3><p>{selected.meaningSnapshot}</p>{!source && <p className="glyph-unavailable-note">Исходный символ недоступен. Сохранённые значение и изображение останутся в глифе.</p>}
        {group && <label>Прочтение<select aria-label="Прочтение символа" value={selected.meaningSnapshot} onChange={event => changeCell({ ...selected, meaningSnapshot: event.target.value })}>{[...new Set([selected.meaningSnapshot, group.primary, ...group.secondary])].map(value => <option key={value}>{value}</option>)}</select></label>}
        <button type="button" onClick={() => { setQuery(''); openPane('picker'); }}>Заменить символ</button><button type="button" onClick={clear}>Очистить ячейку</button>{source && <button type="button" onClick={() => openPane('symbol')}>Просмотреть карточку словаря</button>}<button type="button" onClick={backToEditor}>Готово</button>
      </section>}
      {pane === 'number' && <section className="modal-panel glyph-cell-actions"><h3>{glyphPositionLabels[position]}</h3><p className="glyph-unavailable-note">Необязательный локальный номер, отдельный от категорий словаря.</p><label>Номер<input type="number" inputMode="numeric" min={1} max={2147483647} value={number} onChange={event => setNumber(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<button type="button" onClick={() => { const value = Number(number); if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) { setError('Введите целый положительный номер.'); return; } changeCell({ position, symbolId: null, meaningId: null, meaningSnapshot: '', referenceValue: { kind: position === 'topLeft' ? 'local-number' : 'local-reference', value } }); backToEditor(); }}>Применить</button><button type="button" onClick={clear}>Очистить ячейку</button></section>}
    </div>
    {pane === 'symbol' && source && <SymbolPreviewModal embedded readOnly symbolId={source.id} onClose={backToEditor} />}
    {pane === 'symbol' && !source && <section className="modal-panel"><p>Исходный символ недоступен.</p><button type="button" onClick={backToEditor}>Вернуться к глифу</button></section>}
  </Modal>;
}
