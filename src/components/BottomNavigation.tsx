import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { motion } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';

const slots = [
  { id: 'dictionary', label: 'Словарь', path: '/dictionary', x: 215, y: 150 },
  { id: 'glyphs', label: 'Глифы', path: '/glyphs', x: 0, y: 249 },
  { id: 'diary', label: 'Дневник', path: '/diary', x: -215, y: 150 },
] as const;

export function BottomNavigation() {
  const navigate = useNavigate(), current = useLocation();
  const { displayedLocation: location, reduced } = useNavigationMotion();
  const path = location.pathname.startsWith('/glyphs/') ? '/glyphs' : location.pathname.startsWith('/cards/') ? location.state?.backgroundPath ?? '/' : location.pathname;
  const active = path === '/dictionary' || path.startsWith('/category/') ? 'dictionary'
    : path === '/glyphs' ? 'glyphs' : path === '/diary' ? 'diary' : path === '/settings' ? 'settings' : null;
  const settings = active === 'settings';
  const settingsFrom = location.state?.settingsFrom;
  const centerIcon: IconName = settings ? settingsFrom?.icon ?? 'menu' : active ?? 'menu';
  const returnFromSettings = () => {
    setOpen(false);
    navigate(settingsFrom ? settingsFrom.pathname + settingsFrom.search : '/', {
      replace: true, state: settingsFrom?.state,
    });
  };
  const openSettings = () => {
    setOpen(false);
    if (current.pathname !== '/settings') navigate('/settings', { state: { settingsFrom: {
      pathname: current.pathname, search: current.search, state: current.state, icon: centerIcon,
    } } });
  };
  const [open, setOpen] = useState(path === '/menu');
  const nav = useRef<HTMLElement>(null);
  const [unit, setUnit] = useState(() => innerWidth >= 768 ? 0.4 : Math.min(innerWidth / 1180, 0.6));
  useLayoutEffect(() => {
    const update = () => { if (nav.current) setUnit(nav.current.getBoundingClientRect().width / 507); };
    update(); const observer = new ResizeObserver(update); observer.observe(nav.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setOpen(path === '/menu'); }, [path]);
  const go = (target: string) => { setOpen(false); navigate(target); };
  const toggle = () => { if (settings) { returnFromSettings(); return; } if (path === '/menu') navigate('/'); setOpen(value => !value); };
  return <motion.nav ref={nav} className={`bottom-navigation ${open ? 'is-open' : ''}`} aria-label="Основная навигация"
    style={{ x: '-50%' }} initial={reduced ? false : { y: 160, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={reduced ? { duration: 0 } : animation.gentleSpring}>
    <div className="navigation-fan" id="navigation-fan" aria-hidden={!open} style={{ pointerEvents: open ? 'auto' : 'none' }}>
      {slots.map((slot, index) => {
        const home = active === slot.id;
        const origin = { x: slot.x * unit, y: slot.y * unit, opacity: 0, scale: 0.65 };
        return <motion.button key={slot.id} className={`nav-orb nav-${slot.id}`} type="button" data-nav-slot={slot.id}
          disabled={!open} tabIndex={open ? 0 : -1} aria-label={home ? 'Главная' : slot.label} title={home ? 'Главная' : slot.label}
          initial={reduced ? false : origin} animate={open ? { x: 0, y: 0, opacity: 1, scale: 1 } : origin}
          transition={reduced ? { duration: 0 } : { ...animation.spring, delay: (open ? index : slots.length - 1 - index) * .08, opacity: { ...animation.fade, delay: (open ? index : slots.length - 1 - index) * .08 } }}
          whileTap={reduced ? undefined : { scale: animation.pressScale }} onClick={() => go(home ? '/' : slot.path)}>
          <Icon name={home ? 'home' : slot.id} />
        </motion.button>;
      })}
    </div>
    <motion.button className="nav-add" type="button" aria-label={path === '/glyphs' ? 'Добавить глиф' : 'Добавить карточку'} whileTap={reduced ? undefined : { scale: animation.pressScale }}
      onClick={() => { setOpen(false); if (current.pathname === '/diary') {
        const group = new URLSearchParams(current.search).get('group');
        navigate('/diary/new/edit', { state: { backgroundPath: '/diary', diaryEditorFrom: '/diary' + current.search, diaryBackgroundSearch: current.search, diaryInitialGroupId: group === 'unassigned' ? null : group } }); return;
      } navigate(path === '/glyphs' ? '/glyphs/new/edit' : '/cards/new/edit', { state: { backgroundPath: path, ...(settings ? { settingsFrom } : {}), ...(path === '/glyphs' ? { glyphEditorFrom: '/glyphs' } : {}) } }); }}><Icon name="plus" /></motion.button>
    <motion.button className="nav-orb nav-center" type="button" aria-label={settings ? 'Вернуться назад' : open ? 'Закрыть меню' : 'Открыть меню'} title={settings ? 'Вернуться на предыдущую страницу' : active ?? 'Меню'}
      aria-expanded={settings ? undefined : open} aria-controls={settings ? undefined : 'navigation-fan'} whileTap={reduced ? undefined : { scale: animation.pressScale }} onClick={toggle}>
      <motion.span className="nav-current-icon" key={centerIcon} initial={reduced ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={animation.fade}>
        <Icon name={centerIcon} />
      </motion.span>
    </motion.button>
    <motion.button className="nav-settings" type="button" aria-label="Настройки"
      whileTap={reduced ? undefined : { scale: animation.pressScale }} onClick={openSettings}>
      <Icon name="settings" />
    </motion.button>
  </motion.nav>;
}


