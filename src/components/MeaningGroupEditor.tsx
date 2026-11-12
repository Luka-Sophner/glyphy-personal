import type { MeaningGroup } from '../types';
import { CategoryPicker } from './CategoryPicker';
import { motion } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';
export function MeaningGroupEditor({ value, index, onChange, onRemove, onPrimary }: { value: MeaningGroup; index: number; onChange: (value: MeaningGroup) => void; onRemove?: () => void; onPrimary: () => void }) {
  const { reduced } = useNavigationMotion();
  const secondary = value.secondary.length ? value.secondary : [''];
  return <motion.fieldset layout className="meaning-editor" initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: reduced ? 0 : -8, transition: reduced ? { duration: 0 } : animation.exit }} transition={reduced ? { duration: 0 } : { ...animation.row, layout: animation.layout }}><legend className="sr-only">Группа значений {index + 1}</legend>
    <div className="category-control"><CategoryPicker label={`Категория группы ${index + 1}`} value={value.category} onChange={category => onChange({ ...value, category })} />
      <label className="primary-choice" title="Назначить основной категорией"><input type="radio" name="primary-category" checked={value.isPrimaryCategory} onChange={onPrimary} aria-label={`Основная категория: группа ${index + 1}`} /></label></div>
    <div className="meaning-inputs">
      <motion.input aria-label={`Основное значение группы ${index + 1}`} value={value.primary} required maxLength={200} onChange={e => onChange({ ...value, primary: e.target.value })} whileFocus={reduced ? undefined : { scale: 1.012 }} transition={animation.gentleSpring} />
      {secondary.map((text, secondaryIndex) => <div className="secondary-value" key={secondaryIndex}>
        <motion.input aria-label={secondaryIndex === 0 ? `Второстепенные значения группы ${index + 1}` : `Второстепенное значение ${secondaryIndex + 1} группы ${index + 1}`}
          value={text} maxLength={1000} onChange={e => onChange({ ...value, secondary: secondary.map((item, i) => i === secondaryIndex ? e.target.value : item) })} whileFocus={reduced ? undefined : { scale: 1.012 }} transition={animation.gentleSpring} />
        <button className="secondary-remove" type="button" aria-label={`Удалить второстепенное значение ${secondaryIndex + 1} группы ${index + 1}`} onClick={() => onChange({ ...value, secondary: secondary.filter((_, i) => i !== secondaryIndex) })}>×</button>
      </div>)}
      <button className="secondary-add" type="button" aria-label={`Добавить второстепенное значение группы ${index + 1}`} onClick={() => onChange({ ...value, secondary: [...secondary, ''] })}>+ Значение</button>
    </div>{onRemove && <button className="remove-meaning" type="button" aria-label={`Удалить группу ${index + 1}`} onClick={onRemove}>×</button>}
  </motion.fieldset>;
}
