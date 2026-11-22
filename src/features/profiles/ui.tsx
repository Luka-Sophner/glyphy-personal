import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useProfiles } from './ProfileContext';
import { profileIcons, type Profile, type ProfileIcon } from './store';
import { motion } from '../../lib/motion';
import { useNavigationMotion } from '../../app/NavigationMotion';

export function ProfileAvatar({ icon, active = false }: { icon: ProfileIcon; active?: boolean }) {
  const shapes: Record<ProfileIcon, ReactNode> = {
    person: <><circle cx="24" cy="16" r="6"/><path d="M13 38c0-13 22-13 22 0"/></>,
    sun: <><circle cx="24" cy="24" r="8"/><path d="M24 4v6m0 28v6M4 24h6m28 0h6M10 10l4 4m20 20 4 4M10 38l4-4m20-20 4-4"/></>,
    moon: <path d="M34 7a18 18 0 1 0 7 29A20 20 0 0 1 34 7Z"/>,
    star: <path d="m24 5 6 13 14 2-10 10 3 14-13-7-13 7 3-14L4 20l14-2Z"/>,
    leaf: <><path d="M38 7C9 4 5 33 18 39 32 45 43 26 38 7Z"/><path d="m11 44 22-27"/></>,
  };
  return <span className={`profile-avatar ${active ? 'is-active' : ''}`}><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[icon]}</svg></span>;
}
export function ProfileDots({ selected, onSelect, delay = .1, onSettled, onApproach, ready = true }: { selected: string; onSelect: (id: string) => void; delay?: number; onSettled?: () => void; onApproach?: () => void; ready?: boolean }) {
  const { profiles, busy } = useProfiles();
  const { reduced } = useNavigationMotion(), settled = useRef(new Set<number>()), callback = useRef(onSettled);
  const near = useRef(new Set<number>()), approachCallback = useRef(onApproach);
  callback.current = onSettled;
  approachCallback.current = onApproach;
  const count = Math.max(5, profiles.length);
  const approach = (index: number) => {
    if (near.current.has(index)) return;
    near.current.add(index);
    if (near.current.size >= count) approachCallback.current?.();
  };
  useEffect(() => { if (!ready) { settled.current.clear(); near.current.clear(); } }, [ready]);
  useEffect(() => { if (reduced) callback.current?.(); }, [reduced]);
  return <div className={`profile-dots ${count > 5 ? 'profile-dots--scroll' : ''}`} aria-label="Профили">{Array.from({ length: count }, (_, index) => {
    const profile = profiles[index];
    const start = delay + (count - 1 - index) * .065;
    return <motion.button type="button" key={profile?.id ?? index} className={profile?.id === selected ? 'is-selected' : ''}
      initial={reduced ? false : { x: -innerWidth - 48 }}
      animate={{ x: ready || reduced ? 0 : -innerWidth - 48 }}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 310, damping: 25, mass: .7, delay: start }}
      onUpdate={onApproach ? pose => { if (ready && typeof pose.x === 'number' && Math.abs(pose.x) <= 8) approach(index); } : undefined}
      onAnimationComplete={() => { if (!ready && !reduced) return; approach(index); settled.current.add(index); if (settled.current.size >= count) callback.current?.(); }}
      aria-label={profile ? `Выбрать профиль: ${profile.name}` : `Свободный слот ${index + 1}`} aria-pressed={profile ? profile.id === selected : undefined}
      disabled={!profile || busy} data-occupied={!!profile} onClick={() => profile && onSelect(profile.id)} />;
  })}</div>;
}
export function ProfileDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <Modal labelId="profile-dialog-title" onClose={onClose} className="profile-modal">
    <div className="modal-toolbar"><button className="modal-action" type="button" aria-label="Закрыть окно" onClick={onClose}><Icon name="close"/></button></div>
    <div className="modal-panel profile-dialog-panel"><h2 id="profile-dialog-title">{title}</h2>{children}</div>
  </Modal>;
}
export function ProfileEditor({ profile, onClose }: { profile?: Profile; onClose: () => void }) {
  const { store, busy } = useProfiles(), task = useProfileTask();
  const [name, setName] = useState(profile?.name ?? ''), [icon, setIcon] = useState<ProfileIcon>(profile?.icon ?? 'person');
  const names = ['Человек', 'Солнце', 'Луна', 'Звезда', 'Лист'];
  return <ProfileDialog title={profile ? 'Редактировать профиль' : 'Создать профиль'} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); void task.run(async () => {
      if (profile) await store.edit(profile.id, name, icon);
      else await store.create(name, icon);
      onClose();
    }); }}>
      <label className="profile-field">Название письменности<input autoFocus aria-label="Название письменности" maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)}/></label>
      <fieldset className="profile-icon-picker" disabled={busy}><legend>Иконка профиля</legend>{profileIcons.map((value, index) => <button type="button" key={value} aria-label={names[index]} aria-pressed={icon === value} onClick={() => setIcon(value)}><ProfileAvatar icon={value} active={icon === value}/></button>)}</fieldset>
      {task.error && <p role="alert" className="profile-message">{task.error}</p>}
      <button type="submit" className="profile-primary" disabled={busy || !name.trim()}>{busy ? 'Сохранение…' : 'Сохранить профиль'}</button>
    </form>
  </ProfileDialog>;
}
export function useProfileTask() {
  const { busy, setBusy, error, setError, message, setMessage } = useProfiles(), running = useRef(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (running.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const run = async (work: () => Promise<void>) => {
    if (running.current || busy) return;
    running.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить операцию.'); }
    finally { running.current = false; setBusy(false); }
  };
  return { run, error, message, setMessage };
}
export function TaskFeedback({ task }: { task: ReturnType<typeof useProfileTask> }) {
  const { busy } = useProfiles();
  return <div className="profile-feedback" aria-busy={busy}>
    {busy && <progress aria-label="Выполнение операции"/>}
    {task.message && <p role="status">{task.message}</p>}{task.error && <p role="alert">{task.error}</p>}
  </div>;
}
