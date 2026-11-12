import { categories } from '../lib/categories';
import type { CategoryId } from '../types';
import { CategoryIcon } from './CategoryIcon';
export function CategoryPicker({ value, onChange, label }: { value: CategoryId; onChange: (value: CategoryId) => void; label: string }) {
  return <span className="category-picker" title={categories.find(c => c.id === value)?.label}><span className="category-picker-dot" aria-hidden="true"><CategoryIcon category={value} /></span>
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value as CategoryId)}>{categories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select>
  </span>;
}
