import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useProfiles } from '../features/profiles/ProfileContext';
import { ProfileDots, ProfileDialog, useProfileTask, TaskFeedback } from '../features/profiles/ui';
import { exportProfiles, restoreProfiles, type ProfileBackup, type RestoreOptions } from '../features/profiles/archive';
import { prepareBackupFile } from '../features/transfer/import-client';
import { downloadArchive } from '../features/transfer/browser';
import { transferLimits } from '../features/transfer/zip-safety';
import { Icon } from '../components/Icon';
import { initializeDatabase } from '../features/symbols/demo';
import { SymbolRepository } from '../db/repository';
import avatar from '../assets/settings/account-avatar.svg';
import { motion } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';

export function BackupsPage() {
  const { store, profiles, active, busy } = useProfiles(), location = useLocation(), task = useProfileTask();
  const { reduced } = useNavigationMotion();
  const [dotsReady, setDotsReady] = useState(reduced);
  const fade = (delay = 0) => ({ initial: reduced ? false as const : { opacity: 0 }, animate: { opacity: 1 },
    transition: { ...animation.row, duration: reduced ? 0 : .24, delay: reduced ? 0 : delay } });
  const [selected, setSelected] = useState(location.state?.operationProfile ?? active.id);
  const target = profiles.find(profile => profile.id === selected) ?? active;
  const [prepared, setPrepared] = useState<ProfileBackup>(), [clear, setClear] = useState(false), [clearConfirmed, setClearConfirmed] = useState(false);
  const [options, setOptions] = useState<RestoreOptions>({ destination: 'existing', targetId: target.id, sourceIndex: 0, mode: 'merge', confirmed: false });
  const input = useRef<HTMLInputElement>(null);
  const backup = (all: boolean) => task.run(async () => {
    await initializeDatabase(new SymbolRepository(store.database(target)));
    const result = await exportProfiles(store, all ? profiles.map(profile => profile.id) : [target.id], all, task.setMessage);
    await downloadArchive(result.bytes, result.filename);
    task.setMessage('Резервная копия подготовлена. Сохраните ZIP в надёжном месте.');
  });
  const load = (file?: File) => task.run(async () => {
    if (!file) return;
    if (file.size > transferLimits.archiveBytes) throw new Error('Выберите ZIP размером до 128 МБ.');
    setPrepared(undefined);
    const archive = await prepareBackupFile(file, task.setMessage);
    setPrepared(archive);
    setOptions({ destination: archive.kind === 'all' ? 'all' : 'existing', targetId: target.id, sourceIndex: 0, mode: 'merge', confirmed: false });
    task.setMessage('Архив проверен. Выберите назначение импорта.');
  });
  const source = prepared?.profiles[options.sourceIndex];
  return <section className="backups-page"><motion.h1 {...fade()}>Аккаунт и резервные копии</motion.h1>
    <motion.div {...fade()} className="account-placeholder"><img src={avatar} alt=""/><p>Аккаунт не подключён</p></motion.div>
    <div className="backup-profile-choice"><motion.h2 initial={reduced ? false : { opacity: 0 }} animate={{ opacity: dotsReady || reduced ? 1 : 0 }} transition={{ duration: reduced ? 0 : .16 }}>{target.name}</motion.h2>
      <ProfileDots selected={target.id} onSelect={setSelected} delay={.24} onSettled={() => setDotsReady(true)}/></div>
    <div className="backup-buttons">
      <motion.button {...fade(.24)} type="button" className="profile-primary" disabled={busy} onClick={() => { void backup(false); }}>Экспорт профиля</motion.button>
      <motion.button {...fade(.33)} type="button" className="profile-primary" disabled={busy} onClick={() => { void backup(true); }}>Экспортировать всё</motion.button>
      <motion.button {...fade(.42)} type="button" className="profile-primary" disabled={busy} onClick={() => input.current?.click()}>Импорт</motion.button>
      <input ref={input} type="file" className="sr-only" accept=".zip,application/zip,application/x-zip-compressed" aria-label="ZIP-архив профиля" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void load(file); }}/>
      <motion.button {...fade(.51)} type="button" className="profile-primary profile-danger clear-profile" disabled={busy} onClick={() => { setClearConfirmed(false); setClear(true); }}><Icon name="trash"/>Очистить профиль</motion.button>
    </div><TaskFeedback task={task}/>
    {clear && <ProfileDialog title="Очистить профиль?" onClose={() => { if (!busy) setClear(false); }}>
      <p>Будут удалены все данные профиля «{target.name}», включая оригинальные фотографии, глифы, дневник и группы. Сначала сохраните резервную копию.</p>
      <label className="profile-confirm"><input type="checkbox" checked={clearConfirmed} disabled={busy} onChange={event => setClearConfirmed(event.target.checked)}/>Подтверждаю очистку выбранного профиля</label>
      <button type="button" className="profile-primary profile-danger" disabled={busy || !clearConfirmed} onClick={() => { void task.run(async () => { await store.clear(target.id); setClear(false); task.setMessage('Профиль очищен.'); }); }}>Очистить профиль</button>
      <TaskFeedback task={task}/>
    </ProfileDialog>}
    {prepared && <ProfileDialog title="Импорт резервной копии" onClose={() => { if (!busy) { setPrepared(undefined); task.setMessage('Импорт отменён.'); } }}>
      <p>Профилей в архиве: {prepared.profiles.length}. Карточек: {source?.archive.cards.length ?? 0}. Изображений: {source?.archive.media.length ?? 0}. Глифов: {source?.archive.modules?.glyphs.length ?? 0}. Записей дневника: {source?.archive.modules?.diaryEntries.length ?? 0}.</p>
      {prepared.kind === 'legacy' && <p>Архив предыдущей версии Glyphy. Данные будут перенесены в выбранный профиль.</p>}
      <fieldset className="profile-import-options" disabled={busy}>
        <legend>Назначение импорта</legend>
        <select aria-label="Назначение импорта" value={options.destination} onChange={event => setOptions({ ...options, destination: event.target.value as RestoreOptions['destination'], confirmed: false })}>
          <option value="existing">В существующий профиль</option><option value="new">В новый профиль</option>
          {prepared.kind === 'all' && <option value="all">Восстановить все профили</option>}
        </select>
        {options.destination !== 'all' && prepared.profiles.length > 1 && <label>Профиль из архива<select aria-label="Профиль из архива" value={options.sourceIndex} onChange={event => setOptions({ ...options, sourceIndex: Number(event.target.value) })}>{prepared.profiles.map((item, index) => <option key={item.profile.id} value={index}>{item.profile.name}</option>)}</select></label>}
        {options.destination === 'existing' && <label>Профиль назначения<select aria-label="Профиль назначения" value={options.targetId} onChange={event => setOptions({ ...options, targetId: event.target.value, confirmed: false })}>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>}
        <legend>Режим восстановления</legend>
        <label><input type="radio" name="import-mode" checked={options.mode === 'merge'} onChange={() => setOptions({ ...options, mode: 'merge', confirmed: false })}/>Объединить</label>
        <p>Существующие записи сохраняются. При совпадении идентификаторов сохраняется текущая запись.</p>
        <label><input type="radio" name="import-mode" checked={options.mode === 'replace'} onChange={() => setOptions({ ...options, mode: 'replace', confirmed: false })}/>Заменить</label>
        {options.mode === 'replace' && <div className="replace-warning">
          <p>Данные выбранных профилей будут заменены содержимым архива. Старый архив словаря заменяет только словарь, сохраняя дневник и глифы.</p>
          <button type="button" className="settings-inline-action" onClick={() => { void backup(false); }}>Скачать резервную копию</button>
          <label className="profile-confirm"><input type="checkbox" checked={options.confirmed} onChange={event => setOptions({ ...options, confirmed: event.target.checked })}/>Подтверждаю замену данных из архива. Резервная копия сохранена.</label>
        </div>}
        <button type="button" className="profile-primary" disabled={options.mode === 'replace' && !options.confirmed} onClick={() => { void task.run(async () => {
          const result = await restoreProfiles(store, prepared, options, task.setMessage);
          setPrepared(undefined);
          task.setMessage(`Импорт завершён. Карточек добавлено: ${result.added}; уже существовали: ${result.skipped}. Профилей: ${result.profiles}.`);
        }); }}>{busy ? 'Восстановление…' : options.mode === 'merge' ? 'Объединить словари' : 'Заменить словарь'}</button>
      </fieldset><TaskFeedback task={task}/>
    </ProfileDialog>}
  </section>;
}
