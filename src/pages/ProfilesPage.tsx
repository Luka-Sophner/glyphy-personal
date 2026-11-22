import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfiles } from '../features/profiles/ProfileContext';
import { ProfileAvatar, ProfileEditor, ProfileDialog, useProfileTask, TaskFeedback } from '../features/profiles/ui';
import type { Profile } from '../features/profiles/store';
import { motion } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';
import { Icon } from '../components/Icon';
import pencil from '../assets/settings/profile-pencil.svg';
export function ProfilesPage() {
  const { profiles, active, store, switchProfile, busy } = useProfiles(), task = useProfileTask();
  const [editor, setEditor] = useState<Profile | 'new' | null>(null), [menu, setMenu] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ profile: Profile; action: 'clear' | 'delete' }>();
  const [confirmed, setConfirmed] = useState(false);
  const navigate = useNavigate(), location = useLocation(), { reduced } = useNavigationMotion();
  const ask = (profile: Profile, action: 'clear' | 'delete') => { setMenu(null); setConfirmed(false); setConfirmation({ profile, action }); };
  return <section className="profiles-page"><motion.h1 initial={reduced ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : animation.row}>Профили</motion.h1>
    <div className="profile-card-list">{profiles.map((profile, index) => <motion.article key={profile.id} className="profile-list-card" initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...animation.row, duration: reduced ? 0 : .3, delay: reduced ? 0 : .08 + Math.min(index, 12) * .085 }}>
      <button type="button" className="profile-card-hit" aria-label={`Активировать профиль: ${profile.name}`} aria-pressed={profile.id === active.id} disabled={busy} onClick={() => { void switchProfile(profile.id); }}/>
      <ProfileAvatar icon={profile.icon} active={profile.id === active.id}/>
      <div className="profile-card-title"><h2>{profile.name}</h2><p>{profile.id === active.id ? 'Текущий профиль' : 'Неактивный профиль'}</p></div>
      <button type="button" className="profile-pencil" aria-label={`Редактировать профиль: ${profile.name}`} disabled={busy} onClick={() => setEditor(profile)}><img src={pencil} alt=""/></button>
      <button type="button" className="profile-more" aria-label={`Управление профилем: ${profile.name}`} aria-expanded={menu === profile.id} disabled={busy} onClick={() => setMenu(menu === profile.id ? null : profile.id)}>⋮</button>
      {menu === profile.id && <div className="profile-menu" role="menu">
        <button type="button" role="menuitem" onClick={() => navigate('/settings/backups', { state: { ...location.state, operationProfile: profile.id } })}>Экспорт профиля</button>
        <button type="button" role="menuitem" onClick={() => ask(profile, 'clear')}>Очистить профиль</button>
        <button type="button" role="menuitem" onClick={() => ask(profile, 'delete')}>Удалить профиль</button>
      </div>}
    </motion.article>)}</div>
    <motion.button initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...animation.row, duration: reduced ? 0 : .3, delay: reduced ? 0 : .08 + Math.min(profiles.length, 13) * .085 }} type="button" className="profile-primary create-profile" disabled={busy} onClick={() => setEditor('new')}>Создать профиль</motion.button>
    <TaskFeedback task={task}/>
    {editor && <ProfileEditor profile={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)}/>}
    {confirmation && <ProfileDialog title={confirmation.action === 'clear' ? 'Очистить профиль?' : 'Удалить профиль?'} onClose={() => { if (!busy) setConfirmation(undefined); }}>
      <p>Профиль «{confirmation.profile.name}». Будут удалены его словарь, оригинальные фотографии, глифы, дневник и группы. Сначала сохраните резервную копию.</p>
      <label className="profile-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/>Подтверждаю удаление данных этого профиля</label>
      <button type="button" className="profile-primary profile-danger" disabled={!confirmed || busy} onClick={() => { void task.run(async () => {
        if (confirmation.action === 'delete') await store.remove(confirmation.profile.id);
        else await store.clear(confirmation.profile.id);
        setConfirmation(undefined); task.setMessage('Операция завершена.');
      }); }}><Icon name="trash"/>{confirmation.action === 'clear' ? 'Очистить профиль' : 'Удалить профиль'}</button>
      <TaskFeedback task={task}/>
    </ProfileDialog>}
  </section>;
}
