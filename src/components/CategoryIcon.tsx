import type { ReactNode } from 'react';
import type { CategoryId } from '../types';

// Local vector versions of the seven white signs in the supplied reference.
// No font glyphs: appearance is identical across Android and Windows.
export function CategoryIcon({ category }: { category: CategoryId }) {
  const signs: Record<CategoryId, ReactNode> = {
    phenomena: <path d="M4 14h40M14 5v22M33 5v23q0 15-14 15" />,
    qualities: <path d="M6 6h36v18H6zM14 30v15M34 30v15" />,
    events: <path d="M4 5h40M24 5v16M12 15h24M12 24h24M16 24v20h16V24" />,
    relations: <><circle cx="24" cy="5" r="3.4" fill="currentColor" stroke="none" /><path d="M13 15h22M4 25h40M24 15v11q-1 13-20 18M24 26q3 12 20 18" /></>,
    experiences: <path d="M24 3v42M3 14h42M23 15Q17 30 3 34M25 15q7 15 20 19M14 36h20" />,
    certainty: <path d="M4 13h40M32 4v27q0 14-13 14M11 21h10v13H11z" />,
    time: <><circle cx="24" cy="24" r="19" /><path d="m24 24 12-12" /></>,
  };
  return <svg className="category-icon" data-category-icon={category} aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="butt" strokeLinejoin="miter">{signs[category]}</svg>;
}
