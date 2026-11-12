import type { ReactNode } from 'react';
export type IconName = 'search' | 'plus' | 'menu' | 'dictionary' | 'glyphs' | 'diary' | 'settings' | 'close' | 'edit' | 'trash' | 'check' | 'home' | 'back';
export function Icon({ name }: { name: IconName }) {
  const paths: Record<Exclude<IconName, 'search'>, ReactNode> = {
    home: <path d="M4 34a20 20 0 0 1 40 0M24 14v20m-5-13h10m-10 7h10m-10 6h10" />,
    back: <path d="M40 24H8m14-14L8 24l14 14" />,
    plus: <path d="M24 4v40M4 24h40" />,
    menu: <path d="M4 34a20 20 0 0 1 40 0M24 14v20m-5-13h10m-10 7h10m-10 6h10" />,
    dictionary: <path d="M8 11h32M17 12v27m14-27v27" />,
    glyphs: <path d="M8 5h32M8 16h32M17 17v23m14-23v23" />,
    diary: <path d="M15 8h19v32H15z" />,
    settings: <><circle cx="24" cy="24" r="16"/><path d="M24 2v6m0 32v6M2 24h6m32 0h6M8 8l5 5m22 22 5 5M8 40l5-5m22-22 5-5"/></>,
    close: <><circle cx="24" cy="24" r="17"/><path d="m18 18 12 12m0-12L18 30"/></>,
    edit: <><path d="m9 34-2 8 8-2L40 15l-6-6Z" fill="currentColor" stroke="none"/><path d="m30 13 6 6" stroke="var(--color-panel)" strokeWidth="2"/></>,
    trash: <path d="M11 13h26M18 8h12M14 13v25q0 3 4 3h12q4 0 4-3V13M21 20v13m7-13v13"/>,
    check: <path d="m10 24 9 10L39 12" />,
  };
  return <svg data-icon={name} aria-hidden="true" viewBox="0 0 48 48" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="square" strokeLinejoin="round">{name === 'search' ? <><circle cx="24" cy="24" r="20"/><circle cx="24" cy="24" r="10"/></> : paths[name]}</svg>;
}
