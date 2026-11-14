import { type ReactNode, useLayoutEffect } from 'react';
import { motion } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from './NavigationMotion';
import { demoMode } from '../db/repository';
import { SearchBar } from '../components/SearchBar';
import { BottomNavigation } from '../components/BottomNavigation';
import { useSymbols } from '../features/symbols/SymbolContext';
import '../styles/interface.css';
import '../styles/interface-v1.1.css';
import { useContentViewport } from '../hooks/useContentViewport';
export function AppShell({ children, backgroundPath }: { children: ReactNode; backgroundPath: string }) {
  const { reduced, homeEntranceKey } = useNavigationMotion();
  const { announcement, databaseError } = useSymbols();
  const viewport = useContentViewport();
  const category = backgroundPath.startsWith('/category/');
  useLayoutEffect(() => {
    document.body.dataset.theme = document.documentElement.dataset.theme = category ? 'category' : 'light';
    return () => { delete document.body.dataset.theme; delete document.documentElement.dataset.theme; };
  }, [category]);
  return <div ref={viewport.app} className={`app ${category ? 'app--category' : ''} ${backgroundPath === '/settings' ? 'app--settings' : ''}`} data-reduced-motion={reduced || undefined} data-home-visit={homeEntranceKey} data-has-more={viewport.hasMore} data-has-before={viewport.hasBefore}>
    <a className="skip-link" href="#content" onClick={event => { event.preventDefault(); document.getElementById('content')?.focus(); }}>К содержимому</a>
    <motion.header className="app-header" initial={reduced ? false : { y: -90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={animation.launch}><SearchBar scope={backgroundPath === '/glyphs' ? 'glyphs' : 'dictionary'} /></motion.header>
    <main ref={viewport.scroller} id="content" className="app-main" tabIndex={-1}><div ref={viewport.content} className="app-scroll-content">{demoMode && <p className="demo-notice">Демонстрационный словарь · <a href={`${window.location.pathname}#/`}>Мой словарь</a></p>}{databaseError && <p className="database-error" role="alert">{databaseError} Проверьте доступ к хранилищу браузера и обновите страницу.</p>}{children}</div></main>
    <div className="content-fade-top" aria-hidden="true" /><div className="content-fade" aria-hidden="true" /><BottomNavigation />
    <p role="status" className="sr-only">{announcement}</p>
  </div>;
}




