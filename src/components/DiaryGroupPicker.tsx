import { useId } from 'react';
import { useDiary } from '../features/diary/DiaryContext';

export function DiaryGroupPicker({ value, onChange, disabled = false }: { value: string | null; onChange: (value: string | null) => void; disabled?: boolean }) {
  const { groups } = useDiary(), id = useId();
  return <label className="diary-group-picker" htmlFor={id}>Группа<select id={id} aria-label="Группа записи" value={value ?? ''} disabled={disabled} onChange={event => onChange(event.target.value || null)}>
    <option value="">Без группы</option>
    {value && !groups.some(group => group.id === value) && <option value={value} disabled>Группа удалена — выберите другую</option>}
    {groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}
  </select></label>;
}
