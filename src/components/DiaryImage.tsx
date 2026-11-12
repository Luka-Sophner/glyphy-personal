import { useDiary } from '../features/diary/DiaryContext';
import { useObjectURL } from '../hooks/useObjectURL';
import { motion } from '../lib/motion';
import { animation } from '../lib/animations';
import { useNavigationMotion } from '../app/NavigationMotion';
import type { MediaAsset } from '../types';

export function DiaryImage({ imageId, alt, thumbnail = false, zoom = 1 }: { imageId?: string; alt: string; thumbnail?: boolean; zoom?: number }) {
  const { media, loading } = useDiary();
  const asset = imageId ? media.get(imageId) : undefined;
  return <MediaAssetImage asset={asset} alt={alt} thumbnail={thumbnail} zoom={zoom} loading={loading} />;
}
export function MediaAssetImage({ asset, alt, thumbnail = false, zoom = 1, loading = false }: { asset?: MediaAsset; alt: string; thumbnail?: boolean; zoom?: number; loading?: boolean }) {
  const { reduced } = useNavigationMotion(), imageId = asset?.id;
  const url = useObjectURL(thumbnail ? asset?.thumbnailBlob : asset?.blob);
  if (!url) return <span className="diary-image-unavailable" role="status">{loading || asset ? 'Загрузка фотографии…' : 'Фотография недоступна'}</span>;
  return <motion.img key={imageId} src={url} alt={alt} loading={thumbnail ? 'lazy' : 'eager'} decoding="async" width={asset?.width} height={asset?.height}
    className={zoom !== 1 ? 'diary-photo diary-photo--zoomed' : 'diary-photo'} style={zoom !== 1 ? { width: `${zoom * 100}%` } : undefined}
    initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={reduced ? { duration: 0 } : animation.fade} />;
}
