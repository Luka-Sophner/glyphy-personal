import { useEffect, useState } from 'react';
export function useObjectURL(blob?: Blob): string | undefined {
  const [value, setValue] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!blob) { setValue(undefined); return; }
    const url = URL.createObjectURL(blob); setValue({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return value?.blob === blob ? value?.url : undefined;
}
