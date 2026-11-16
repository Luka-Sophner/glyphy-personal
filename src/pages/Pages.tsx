import { Link, useParams } from 'react-router-dom';
import { categories } from '../lib/categories';
import { useSymbols } from '../features/symbols/SymbolContext';
import { SymbolGrid } from '../components/SymbolGrid';
import { CategoryRow } from '../components/CategoryRow';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';
import { normalizeSearch } from '../features/symbols/search';
import { SearchResults } from '../components/SearchResults';
import { Icon } from '../components/Icon';
import { useGlyphs } from '../features/glyphs/GlyphContext';
export function HomePage() {
  const { symbols, query, searchIndex, loading, databaseError } = useSymbols();
  const deferredQuery = useDeferredValue(query), searching = !!normalizeSearch(query);
  const results = useMemo(() => searchIndex.search(deferredQuery), [searchIndex, deferredQuery]);
  const { search: searchGlyphs, loading: glyphsLoading } = useGlyphs();
  const glyphResults = useMemo(() => normalizeSearch(deferredQuery) ? searchGlyphs(deferredQuery) : [], [searchGlyphs, deferredQuery]);
  const { reduced, homeVisited } = useNavigationMotion();
  const [entrance] = useState(() => !homeVisited.current);
  useEffect(() => { homeVisited.current = true; }, [homeVisited]);
  if (searching) return <section className="home-page search-page"><h1 className="sr-only">Результаты поиска</h1>
    {loading || glyphsLoading ? <p role="status">Загрузка словаря…</p> : <SearchResults results={results} glyphs={glyphResults} pending={query !== deferredQuery} />}</section>;
  return <div className="home-page" data-home-entrance={entrance}><h1 className="sr-only">Главная</h1><AnimatePresence initial={!reduced && entrance}>{categories.map((category, index) => {
    const items = symbols.filter(symbol => symbol.meanings.some(group => group.category === category.id));
    return !items.length ? null : <motion.section layout className="home-section" key={category.id} aria-labelledby={`section-${category.id}`}
      exit={{ opacity: 0, transition: reduced ? { duration: 0 } : animation.exit }} transition={reduced ? { duration: 0 } : animation.layout}>
      <motion.h2 id={`section-${category.id}`} initial={entrance && !reduced ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} transition={{ ...animation.row, delay: entrance ? index * 0.12 : 0 }}><Link to={`/category/${category.id}`}>{category.label}</Link></motion.h2>
      <SymbolGrid symbols={items} entrance={entrance && !reduced} sectionIndex={index} categoryId={category.id} />
    </motion.section>;
  })}</AnimatePresence>{!symbols.length && <p className="empty-state" role="status">{loading ? 'Загрузка словаря…' : databaseError ? 'Не удалось открыть словарь.' : 'Словарь пока пуст. Нажмите «+», чтобы добавить первую карточку.'}</p>}</div>;
}
export function DictionaryPage() {
  const { query, searchIndex } = useSymbols();
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => searchIndex.search(deferredQuery), [searchIndex, deferredQuery]);
  return <><h1 className="sr-only">Словарь</h1>{normalizeSearch(query)
    ? <SearchResults results={results} pending={query !== deferredQuery} />
    : <ul className="dictionary-list">{categories.map((category, index) => <CategoryRow key={category.id} {...category} index={index} />)}</ul>}</>;
}
export function CategoryPage() {
  const { categoryId } = useParams(); const { symbols, query, searchIndex } = useSymbols();
  const deferredQuery = useDeferredValue(query); const { backToDictionary, reduced } = useNavigationMotion();
  const category = categories.find(value => value.id === categoryId);
  const results = useMemo(() => category ? searchIndex.search(deferredQuery, category.id) : [], [searchIndex, deferredQuery, category]);
  if (!category) return <PlaceholderPage title="Категория не найдена" />;
  const searching = !!normalizeSearch(query);
  const items = symbols.filter(symbol => symbol.meanings.some(group => group.category === category.id));
  return <motion.section className="category-page" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={animation.row}>
    <div className="category-heading"><button type="button" className="category-back" aria-label="Вернуться к категориям" title="К категориям" onClick={backToDictionary}><Icon name="back" /></button><h1>{category.label}</h1></div>
    {searching ? <SearchResults results={results} dark pending={query !== deferredQuery} /> : <><SymbolGrid symbols={items} dark categoryId={category.id} />{!items.length && <p className="empty-state" role="status">В этой категории пока нет карточек.</p>}</>}
  </motion.section>;
}
export function PlaceholderPage({ title }: { title: string }) { return <section className="placeholder-page"><h1>{title}</h1><p>В разработке</p><Link className="home-link" to="/"><Icon name="home" /><span>На главную</span></Link></section>; }

