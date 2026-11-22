import { useLayoutEffect, useState } from 'react';
import { motion } from '../lib/motion';
import { useNavigationMotion } from '../app/NavigationMotion';
import { animation } from '../lib/animations';

/** One viewport-wide surface survives settings route changes and scrolling. */
export function SettingsBackdrop({ subpage }: { subpage: boolean }) {
  const { settingsTransition, finishSettingsExpansion, reduced, settingsSurfaceReady, markSettingsSurfaceReady } = useNavigationMotion();
  const [shape, setShape] = useState(() => ({
    top: Math.min(innerHeight * .27, 260), homeTop: Math.min(innerHeight * .27, 260),
    radius: 45 * Math.min(innerWidth / 1180, .6),
  }));
  useLayoutEffect(() => {
    if (subpage) return;
    const main = document.getElementById('content');
    const content = main?.firstElementChild, sheet = document.querySelector('.settings-sheet');
    if (!main || !content || !sheet) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = Math.max(0, sheet.getBoundingClientRect().top);
      const scroll = matchMedia('(max-width: 767px)').matches ? main.scrollTop : window.scrollY;
      const homeTop = sheet.getBoundingClientRect().top + scroll;
      const radius = 45 * Math.min(innerWidth / 1180, .6);
      setShape(previous => previous.top === top && previous.homeTop === homeTop && previous.radius === radius ? previous : { top, homeTop, radius });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(content);
    main.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      main.removeEventListener('scroll', schedule); window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [subpage]);
  const expanding = settingsTransition?.phase === 'expand';
  const dismissing = settingsTransition?.phase === 'dismiss';
  const expanded = dismissing ? false : expanding ? settingsTransition.expanded : subpage;
  const entering = !subpage && !settingsSurfaceReady && !settingsTransition;
  const geometry = { top: dismissing ? innerHeight : expanded ? 0 : expanding ? shape.homeTop : shape.top,
    borderTopLeftRadius: expanded ? 0 : shape.radius, borderTopRightRadius: expanded ? 0 : shape.radius };
  const duration = (expanding || entering || dismissing) && !reduced ? .36 : 0;
  return <motion.div className="settings-backdrop" aria-hidden="true" data-expanded={expanded}
    initial={{ ...geometry, top: reduced || subpage || settingsSurfaceReady ? geometry.top : innerHeight }}
    animate={geometry}
    transition={{ top: { ...animation.row, duration }, borderTopLeftRadius: { duration }, borderTopRightRadius: { duration },
    }}
    onAnimationComplete={() => {
      if (expanding || dismissing) finishSettingsExpansion(settingsTransition.id);
      else if (entering) markSettingsSurfaceReady();
    }}/>;
}
