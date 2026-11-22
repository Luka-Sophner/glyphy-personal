import type { ProfileBackup } from '../profiles/archive';
import type { Progress } from './archive';
import { validateDecodedAsset } from './browser';
export async function prepareBackupFile(file: File, progress: Progress): Promise<ProfileBackup> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
  try {
    const prepared = await new Promise<ProfileBackup>((resolve, reject) => {
      worker.onerror = () => reject(new Error('Не удалось прочитать ZIP. Попробуйте снова.'));
      worker.onmessage = event => {
        if (event.data.progress) progress(event.data.progress);
        else if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.prepared);
      };
      worker.postMessage(bytes, [bytes.buffer]);
    });
    const assets = prepared.profiles.flatMap(profile => profile.archive.media);
    for (const [index, asset] of assets.entries()) {
      progress(`Проверка изображений: ${index + 1} из ${assets.length}`);
      await validateDecodedAsset(asset);
    }
    return prepared;
  } finally { worker.terminate(); }
}
