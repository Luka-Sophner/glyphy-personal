import { nativeRuntime } from '../features/native/adapter.mjs';
import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { repository } from '../db/repository';
import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';
import { type PreparedArchive, type ImportMode } from '../features/transfer/archive';
import { transferLimits } from '../features/transfer/zip-safety';
import { usePwa, installPwa, applyPwaUpdate } from '../features/pwa/client';

export function SettingsPage() {
  const input = useRef<HTMLInputElement>(null), running = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [prepared, setPrepared] = useState<PreparedArchive | null>(null), [mode, setMode] = useState<ImportMode>('merge'), [confirmed, setConfirmed] = useState(false);
  const pwa = usePwa();
  const blocker = useBlocker(() => running.current);
  useEffect(() => { if (blocker.state === 'blocked') blocker.reset(); }, [blocker]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (running.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const operation = async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Операция не выполнена. Данные не изменены.'); setMessage(''); }
    finally { running.current = false; setBusy(false); }
  };
  const backup = () => operation(async () => {
    const { exportArchive } = await import('../features/transfer/archive');
    const { downloadArchive } = await import('../features/transfer/browser');
    const archive = await exportArchive(repository.db, setMessage);
    await downloadArchive(archive.bytes, archive.filename); setMessage(nativeRuntime ? 'Архив подготовлен. Сохраните или отправьте его через меню Android.' : 'Архив подготовлен. Сохраните ZIP в надёжном месте.');
  });
  const load = (file?: File) => operation(async () => {
    if (!file) return;
    if (file.size > transferLimits.archiveBytes) throw new Error('Выберите ZIP размером до 128 МБ.');
    setPrepared(null); setMode('merge'); setConfirmed(false); setMessage('Чтение ZIP…');
    const { prepareImport } = await import('../features/transfer/archive');
    const { validateDecodedAsset } = await import('../features/transfer/browser');
    const archive = await prepareImport(new Uint8Array(await file.arrayBuffer()), validateDecodedAsset, setMessage);
    setPrepared(archive); setMessage('Архив проверен. Выберите способ импорта.');
  });
  const restore = () => operation(async () => {
    if (!prepared) return;
    setMessage('Восстановление словаря…');
    const { applyImport } = await import('../features/transfer/archive');
    const result = await applyImport(repository.db, prepared, mode, confirmed);
    setPrepared(null); setMessage(`Импорт завершён. Карточек добавлено: ${result.added}; уже существовали: ${result.skipped}. Глифов: ${result.glyphsAdded ?? 0}; записей дневника: ${result.entriesAdded ?? 0}; групп: ${result.groupsAdded ?? 0}.`);
  });
  const statuses = {
    starting: 'Подготовка работы без сети…', ready: 'Готово к работе без сети', reload: 'Обновите страницу для работы без сети',
    unsupported: 'Офлайн-режим недоступен в этом браузере', insecure: 'Для установки и офлайн-режима нужен HTTPS',
    error: 'Не удалось подготовить офлайн-режим. Откройте приложение с подключением к сети.', dev: 'PWA проверяется в production-сборке: npm run build и npm run preview',
  };
  return <section className="settings-page"><h1 className="sr-only">Настройки</h1>
    <div className="settings-actions" aria-busy={busy}>
      <button type="button" className="settings-transfer-button" aria-label="Экспортировать словарь" disabled={busy} onClick={backup}>Экспорт базы</button>
      <button type="button" className="settings-transfer-button" aria-label="Импортировать словарь" disabled={busy} onClick={() => input.current?.click()}>Импорт базы</button>
      <input className="sr-only" ref={input} type="file" accept=".zip,application/zip,application/x-zip-compressed" aria-label="ZIP-архив словаря" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void load(file); }} />
      <div className="settings-feedback">
        {message && <p role="status" aria-live="polite">{message}</p>}{error && <p role="alert">{error}</p>}
        <p className="pwa-status" data-pwa-status={pwa.status}>{nativeRuntime ? 'Android: файлы приложения находятся на телефоне' : `${pwa.offline ? 'Без подключения · ' : ''}${statuses[pwa.status]}`}</p>
        {pwa.installable && <button type="button" className="settings-inline-action" onClick={() => { void installPwa(); }}>Установить Glyphy</button>}
        {pwa.update && <button type="button" className="settings-inline-action" disabled={busy} onClick={applyPwaUpdate}>Обновить приложение</button>}
      </div>
    </div>
    {prepared && <Modal labelId="import-title" onClose={() => { if (!busy) { setPrepared(null); setMessage('Импорт отменён. Данные не изменены.'); } }} className="transfer-modal">
      <div className="modal-toolbar"><button type="button" className="modal-action" aria-label="Закрыть импорт" disabled={busy} onClick={() => setPrepared(null)}><Icon name="close" /></button></div>
      <div className="modal-panel transfer-panel"><h2 id="import-title">Импорт резервной копии</h2><p>Карточек: {prepared.cards.length}. Изображений: {prepared.media.length}. Глифов: {prepared.modules?.glyphs.length ?? 0}. Записей дневника: {prepared.modules?.diaryEntries.length ?? 0}.</p>{!prepared.modules && <p>Это старый архив словаря: глифов и дневника в нём нет.</p>}
        <fieldset disabled={busy}><legend>Режим восстановления</legend>
          <label><input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => { setMode('merge'); setConfirmed(false); }} />Объединить</label>
          <p>Ваши карточки сохранятся. При совпадении ID останется существующая карточка.</p>
          <label><input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => { setMode('replace'); setConfirmed(false); }} />Заменить</label>
          {mode === 'replace' && <div className="replace-warning"><p>{prepared.modules ? 'Будут заменены словарь, глифы, дневник и группы. Сначала сохраните текущую резервную копию.' : 'Будет заменён только словарь. Глифы и дневник останутся. Сначала сохраните резервную копию.'}</p>
            <button type="button" className="settings-inline-action" onClick={backup}>Скачать резервную копию</button>
            <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Подтверждаю замену данных из архива. Резервная копия сохранена.</label>
          </div>}
          <button type="button" className="transfer-commit" disabled={mode === 'replace' && !confirmed} onClick={restore}>{busy ? 'Восстановление…' : mode === 'merge' ? 'Объединить словари' : 'Заменить словарь'}</button>
        </fieldset>{error && <p role="alert">{error}</p>}{busy && <p role="status">{message}</p>}
      </div>
    </Modal>}
  </section>;
}
