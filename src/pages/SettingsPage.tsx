import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfiles } from '../features/profiles/ProfileContext';
import { ProfileAvatar, ProfileDots, ProfileEditor, ProfileDialog } from '../features/profiles/ui';
import { motion, AnimatePresence } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';
import { usePwa, installPwa, applyPwaUpdate } from '../features/pwa/client';
import { nativeRuntime } from '../features/native/adapter.mjs';
import mascot from '../assets/settings/sleepy-glyphy.svg';
import pencil from '../assets/settings/profile-pencil.svg';

export function SettingsPage() {
  const { active, profiles, switchProfile, busy } = useProfiles();
  const [edit, setEdit] = useState(false), [about, setAbout] = useState(false);
  const navigate = useNavigate(), location = useLocation(), pwa = usePwa();
  const { reduced, settingsSurfaceReady } = useNavigationMotion();
  const revealed = reduced || settingsSurfaceReady;
  const [introStep, setIntroStep] = useState(0);
  const advanceIntro = (step: number) => setIntroStep(previous => Math.max(previous, step));
  const dotsReady = revealed && (reduced || introStep >= 1);
  const buttonsReady = dotsReady && (reduced || introStep >= 2);
  useEffect(() => {
    if (!revealed) setIntroStep(0);
  }, [revealed]);
  const go = (path: string) => navigate(path, { state: location.state });
  const next = profiles[(profiles.findIndex(profile => profile.id === active.id) + 1) % profiles.length];
  const enterLink = (index: number) => ({
    initial: reduced ? false as const : { opacity: 0 },
    animate: { opacity: buttonsReady ? 1 : 0 }, transition: { ...animation.row, duration: reduced ? 0 : .26, delay: reduced ? 0 : index * .065 },
  });
  return <section className="settings-page settings-v12">
    <h1 className="sr-only">Настройки</h1>
    <motion.article className="active-profile-card" initial={reduced ? false : { opacity: 0, y: -Math.min(innerHeight * .5, 320) }}
      animate={revealed ? { opacity: 1, y: 0 } : { opacity: 0, y: -Math.min(innerHeight * .5, 320) }} transition={reduced ? { duration: 0 } : { ...animation.gentleSpring, stiffness: 240, damping: 24 }}
      onUpdate={pose => { if (revealed && introStep < 1 && typeof pose.y === 'number' && Math.abs(pose.y) <= 8 && Number(pose.opacity) >= .95) advanceIntro(1); }}
      onAnimationComplete={() => { if (revealed) advanceIntro(1); }}>
      <button type="button" className="profile-card-hit" aria-label="Открыть профили" disabled={busy} onClick={() => go('/settings/profiles')}/>
      <ProfileAvatar icon={active.icon}/>
      <AnimatePresence mode="wait" initial={false}><motion.div className="active-profile-title" key={active.id} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={animation.fade}>
        <button type="button" disabled={busy} onClick={() => setEdit(true)}>{active.name}</button><p>Текущий профиль</p>
      </motion.div></AnimatePresence>
      <button type="button" className="profile-pencil" aria-label="Редактировать текущий профиль" disabled={busy} onClick={() => setEdit(true)}><img src={pencil} alt=""/></button>
      <button type="button" className="profile-next" aria-label="Следующий профиль" disabled={busy || profiles.length < 2} onClick={() => { void switchProfile(next.id); }}/>
    </motion.article>
    <ProfileDots selected={active.id} onSelect={id => { void switchProfile(id); }} delay={0} ready={dotsReady}
      onApproach={() => { if (dotsReady) advanceIntro(2); }} onSettled={() => { if (dotsReady) advanceIntro(2); }}/>
    <motion.div className="settings-sheet" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: revealed ? 1 : 0 }} transition={reduced ? { duration: 0 } : animation.fade}>
      <motion.h2 {...enterLink(0)}>Визуальная часть</motion.h2>
      <div className="settings-link-list"><motion.button {...enterLink(0)} type="button" disabled>Кастомизация <small>Скоро</small></motion.button><motion.button {...enterLink(1)} type="button" disabled>Звуки и вибрация <small>Скоро</small></motion.button></div>
      <motion.h2 {...enterLink(2)}>Аккаунты и профили</motion.h2>
      <div className="settings-link-list"><motion.button {...enterLink(2)} type="button" disabled>Подписка <small>Скоро</small></motion.button><motion.button {...enterLink(3)} type="button" disabled={busy} onClick={() => go('/settings/backups')}>Аккаунт и резервные копии</motion.button></div>
      <div className="settings-link-list settings-about"><motion.button {...enterLink(4)} type="button" onClick={() => setAbout(true)}
        onUpdate={pose => { if (buttonsReady && introStep < 3 && Number(pose.opacity) >= .9) advanceIntro(3); }}
        onAnimationComplete={() => { if (buttonsReady) advanceIntro(3); }}>О приложении</motion.button></div>
      <motion.img className="sleepy-mascot" src={mascot} alt="Спящий Glyphy с табличкой Wake me up for a guide"
        initial={reduced ? false : { opacity: 0 }} animate={{ opacity: buttonsReady && (reduced || introStep >= 3) ? 1 : 0 }} transition={reduced ? { duration: 0 } : animation.fade}/>
    </motion.div>
    {edit && <ProfileEditor profile={active} onClose={() => setEdit(false)}/>}
    {about && <ProfileDialog title="О Glyphy" onClose={() => setAbout(false)}>
      <p>Make your word!</p><p>Создай язык, которого не хватало твоим мыслям.</p>
      <p>Ваши письменности, изображения и дневник хранятся на этом устройстве. Резервные копии позволяют перенести их в другую установку Glyphy.</p>
      <p className="pwa-status" data-pwa-status={pwa.status}>{nativeRuntime ? 'Приложение готово к работе без интернета.' : pwa.offline ? 'Без подключения к сети' : pwa.status === 'ready' ? 'Готово к работе без сети' : 'Локальное хранение данных на устройстве'}</p>
      {pwa.installable && <button className="profile-primary" onClick={() => { void installPwa(); }}>Установить Glyphy</button>}
      {pwa.update && <button className="profile-primary" onClick={applyPwaUpdate}>Обновить приложение</button>}
    </ProfileDialog>}
  </section>;
}
