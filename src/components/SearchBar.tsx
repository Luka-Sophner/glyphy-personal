import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useDiary } from '../features/diary/DiaryContext';
import { motion } from '../lib/motion';
import { useSymbols } from '../features/symbols/SymbolContext';
import { useNavigationMotion } from '../app/NavigationMotion';
import { animation } from '../lib/animations';
import { Icon } from './Icon';
import { useGlyphs } from '../features/glyphs/GlyphContext';
export function SearchBar({ scope = 'dictionary', value, onChange, label }: { scope?: 'dictionary' | 'glyphs' | 'diary'; value?: string; onChange?: (value: string) => void; label?: string }) {
  const dictionary = useSymbols(), glyphs = useGlyphs(), diary = useDiary(), location = useLocation();
  const diaryScope = scope === 'diary' || location.pathname === '/diary' || location.pathname.startsWith('/diary/');
  const context = diaryScope ? diary : scope === 'glyphs' ? glyphs : dictionary; const query = value ?? context.query, setQuery = onChange ?? context.setQuery; const { reduced } = useNavigationMotion();
  const input = useRef<HTMLInputElement>(null);
  return <form className="search-bar" role="search" onSubmit={event => { event.preventDefault(); input.current?.blur(); }}>
    <span className="search-icon"><Icon name="search" /></span>
    <motion.input ref={input} type="search" aria-label={label ?? (diaryScope ? 'Поиск по дневнику' : scope === 'glyphs' ? 'Поиск глифов' : 'Поиск по словарю')} value={query} onChange={event => setQuery(event.target.value)}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setQuery(''); } }}
      autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" inputMode="search"
      whileFocus={reduced ? undefined : { scale: 1.01 }} transition={animation.gentleSpring} />
    {query && <button className="search-clear" type="button" aria-label="Очистить поиск" onClick={() => { setQuery(''); input.current?.focus(); }}><Icon name="close" /></button>}
  </form>;
}

