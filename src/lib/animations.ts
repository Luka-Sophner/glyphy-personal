import type { Transition } from './motion';

export const animation = {
  spring: { type: 'spring', stiffness: 400, damping: 24, mass: 0.8 } satisfies Transition,
  gentleSpring: { type: 'spring', stiffness: 360, damping: 28, mass: 0.8 } satisfies Transition,
  launch: { duration: 0.56, ease: [0.22, 1, 0.36, 1] } satisfies Transition,
  circle: { duration: 0.62, ease: [0.65, 0, 0.25, 1] } satisfies Transition,
  fade: { duration: 0.12 } satisfies Transition,
  exit: { duration: 0.16, ease: 'easeIn' } satisfies Transition,
  layout: { duration: 0.23, ease: [0.22, 1, 0.36, 1] } satisfies Transition,
  row: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } satisfies Transition,
  cardStagger: 0.05,
  categoryStagger: 0.045,
  pressScale: 0.95,
  circleDeadlineMs: 1800,
  modalExitDeadlineMs: 600,
} as const;

export interface CircleOrigin { x: number; y: number; radius: number }
export function symbolEntranceDelay(index: number, sectionIndex = 0) {
  return 0.1 + sectionIndex * 0.12 + Math.min(index, 60) * animation.cardStagger;
}
export function circleOrigin(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): CircleOrigin {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: Math.max(rect.width, rect.height) / 2 };
}
export function coveringScale(origin: CircleOrigin, width: number, height: number): number {
  const farX = Math.max(Math.abs(origin.x), Math.abs(width - origin.x));
  const farY = Math.max(Math.abs(origin.y), Math.abs(height - origin.y));
  return (Math.hypot(farX, farY) + 2) / Math.max(origin.radius, 1);
}
