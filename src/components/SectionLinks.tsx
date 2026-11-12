import { Link } from 'react-router-dom';
import styles from './SectionLinks.module.css';

export function SectionLinks({ items }: { items: ReadonlyArray<{ to: string; label: string }> }) {
  return <ul className={styles.list}>{items.map(({ to, label }) => (
    <li key={to}><Link to={to}>{label}<span aria-hidden="true">↗</span></Link></li>
  ))}</ul>;
}
