import { Link } from 'react-router-dom';
import type { CategoryId } from '../types';
import { motion } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';
import { CategoryIcon } from './CategoryIcon';
export function CategoryRow({ id, label, index = 0 }: { id: CategoryId; label: string; index?: number }) {
  const { openCategory, returning, reduced } = useNavigationMotion();
  return <motion.li layout data-category-id={id} initial={reduced || returning ? false : { opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : { ...animation.row, delay: index * animation.categoryStagger }}>
    <Link className="category-row" to={`/category/${id}`} onClick={event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); openCategory(id, event.currentTarget.querySelector('.category-circle'));
    }}><span className="category-circle" aria-hidden="true"><CategoryIcon category={id} /></span><span>{label}</span></Link>
  </motion.li>;
}
