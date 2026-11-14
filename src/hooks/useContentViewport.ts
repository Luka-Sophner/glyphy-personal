import { useLayoutEffect, useRef, useState } from 'react';

/** One mobile scroller. Recalculate when content, fonts or the visible viewport change. */
export function useContentViewport() {
  const app = useRef<HTMLDivElement>(null), scroller = useRef<HTMLElement>(null), content = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  const [hasBefore, setHasBefore] = useState(false);
  useLayoutEffect(() => {
    const shell = app.current!, main = scroller.current!, inner = content.current!;
    const mobile = matchMedia('(max-width: 767px)'), viewport = window.visualViewport;
    let frame = 0, disposed = false, width = innerWidth, fullHeight = viewport?.height ?? innerHeight;
    const measure = () => {
      frame = 0;
      const height = viewport?.height ?? innerHeight;
      if (innerWidth !== width) { width = innerWidth; fullHeight = height; }
      fullHeight = Math.max(fullHeight, height);
      shell.style.setProperty('--app-viewport-height', `${height}px`);
      shell.style.setProperty('--app-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      shell.toggleAttribute('data-keyboard', mobile.matches && fullHeight - height > 150);
      const bottom = inner.getBoundingClientRect().bottom;
      const padding = mobile.matches ? parseFloat(getComputedStyle(inner).paddingBottom) : 0;
      const visibleBottom = mobile.matches ? main.getBoundingClientRect().bottom : height;
      const navigation = shell.querySelector<HTMLElement>('.bottom-navigation');
      const menu = shell.querySelector<HTMLElement>('.nav-center');
      // Use the fixed layout position, without the launch animation's translation.
      const menuTop = navigation && menu && !shell.hasAttribute('data-keyboard')
        ? innerHeight - parseFloat(getComputedStyle(navigation).bottom) - navigation.offsetHeight + menu.offsetTop
        : visibleBottom + 30;
      const fadeBoundary = Math.min(visibleBottom, menuTop - 30);
      const cards = inner.querySelectorAll<HTMLElement>('.symbol-card:not([disabled]), .glyph-card:not([disabled]), .diary-card:not([disabled])');
      const lastCard = cards.item(cards.length - 1);
      const contentBottom = lastCard ? lastCard.getBoundingClientRect().bottom : bottom - padding;
      shell.style.setProperty('--content-top', `${main.getBoundingClientRect().top - shell.getBoundingClientRect().top}px`);
      setHasBefore((mobile.matches ? main.scrollTop : window.scrollY) > 2);
      setHasMore(contentBottom - fadeBoundary > 2);
    };
    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule); resize.observe(main); resize.observe(inner);
    const mutation = new MutationObserver(schedule); mutation.observe(inner, { childList: true, characterData: true, subtree: true });
    main.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule); viewport?.addEventListener('resize', schedule); viewport?.addEventListener('scroll', schedule);
    mobile.addEventListener('change', schedule); inner.addEventListener('load', schedule, true);
    void document.fonts?.ready.then(schedule); measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect();
      main.removeEventListener('scroll', schedule); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule);
      viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
      mobile.removeEventListener('change', schedule); inner.removeEventListener('load', schedule, true);
    };
  }, []);
  return { app, scroller, content, hasMore, hasBefore };
}
