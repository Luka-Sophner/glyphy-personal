import { type ReactNode, useLayoutEffect } from 'react';
import { motion } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from './NavigationMotion';
import { demoMode } from '../db/repository';
import { SearchBar } from '../components/SearchBar';
import { BottomNavigation } from '../components/BottomNavigation';
import { useSymbols } from '../features/symbols/SymbolContext';
import '../styles/interface.css';
export function AppShell({ children, backgroundPath }: { children: ReactNode; backgroundPath: string }) {
  const { reduced, homeEntranceKey } = useNavigationMotion();
  const { announcement, databaseError } = useSymbols();
  const category = backgroundPath.startsWith('/category/');
  useLayoutEffect(() => { document.body.dataset.theme = category ? 'category' : 'light'; return () => { delete document.body.dataset.theme; }; }, [category]);
  return <div className={`app ${category ? 'app--category' : ''} ${backgroundPath === '/settings' ? 'app--settings' : ''}`} data-reduced-motion={reduced || undefined} data-home-visit={homeEntranceKey}>
    <a className="skip-link" href="#content" onClick={event => { event.preventDefault(); document.getElementById('content')?.focus(); }}>К содержимому</a>
    <motion.header key={`header-${homeEntranceKey}`} className="app-header" initial={reduced ? false : { y: -90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={animation.launch}><SearchBar scope={backgroundPath === '/glyphs' ? 'glyphs' : 'dictionary'} /></motion.header>
    <main id="content" className="app-main" tabIndex={-1}>{demoMode && <p className="demo-notice">Демонстрационный словарь · <a href={`${window.location.pathname}#/`}>Мой словарь</a></p>}{databaseError && <p className="database-error" role="alert">{databaseError} Проверьте доступ к хранилищу браузера и обновите страницу.</p>}{children}</main>
    <div className="content-fade" aria-hidden="true" /><BottomNavigation key={`navigation-${homeEntranceKey}`} />
    <p role="status" className="sr-only">{announcement}</p>
  </div>;
}




