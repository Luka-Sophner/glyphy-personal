import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigationMotion } from '../app/NavigationMotion';
import { DiaryImage } from './DiaryImage';

export function DiaryPhotoGallery({ imageIds, title, initialIndex = 0, onIndex, onEnlarge }: { imageIds: string[]; title: string; initialIndex?: number; onIndex: (index: number) => void; onEnlarge: (index: number) => void }) {
  const strip = useRef<HTMLDivElement>(null), { reduced } = useNavigationMotion();
  const [active, setActive] = useState(() => Math.min(initialIndex, Math.max(0, imageIds.length - 1)));
  const activeRef = useRef(active); activeRef.current = active;
  useLayoutEffect(() => {
    const element = strip.current; if (!element) return;
    const align = () => { if (element.clientWidth) element.scrollLeft = Math.min(activeRef.current, imageIds.length - 1) * element.clientWidth; };
    align(); const observer = new ResizeObserver(align); observer.observe(element);
    return () => observer.disconnect();
  }, [imageIds.length]);
  const go = (index: number) => {
    const element = strip.current; if (!element) return;
    element.scrollTo({ left: Math.max(0, Math.min(imageIds.length - 1, index)) * element.clientWidth, behavior: reduced ? 'instant' : 'smooth' });
  };
  if (!imageIds.length) return <p className="diary-image-unavailable">Фотография недоступна</p>;
  if (imageIds.length === 1) return <button type="button" className="diary-single-photo" data-diary-photo="0" aria-label="Открыть фото 1 крупнее" onClick={() => onEnlarge(0)}><DiaryImage imageId={imageIds[0]} alt={`Хайку: ${title}`} /></button>;
  return <div className="diary-photo-gallery">
    <div ref={strip} className="diary-photo-strip" role="group" aria-label="Фотографии записи" onScroll={event => {
      const element = event.currentTarget; if (!element.clientWidth) return;
      const next = Math.max(0, Math.min(imageIds.length - 1, Math.round(element.scrollLeft / element.clientWidth)));
      setActive(next); onIndex(next);
    }}>{imageIds.map((imageId, index) => <button key={`${imageId}-${index}`} type="button" className="diary-photo-slide" data-diary-photo={index} aria-label={`Открыть фото ${index + 1} крупнее`} onClick={() => onEnlarge(index)}><DiaryImage imageId={imageId} thumbnail={Math.abs(index - active) > 1} alt={`${title}, фото ${index + 1} из ${imageIds.length}`} /></button>)}</div>
    <div className="diary-photo-controls" role="group" aria-label="Переключение фотографий"><button type="button" aria-label="Предыдущее фото" disabled={active === 0} onClick={() => go(active - 1)}>←</button><span role="status">{active + 1} / {imageIds.length}</span><button type="button" aria-label="Следующее фото" disabled={active === imageIds.length - 1} onClick={() => go(active + 1)}>→</button></div>
  </div>;
}
