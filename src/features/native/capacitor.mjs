import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const nativeRuntime = Capacitor.isNativePlatform();
export async function listenNativeBack(handler) {
  if (!nativeRuntime) return () => {};
  const listener = await App.addListener('backButton', handler);
  return () => { void listener.remove(); };
}
export async function minimizeNativeApp() { if (nativeRuntime) await App.minimizeApp(); }

export async function saveNativeArchive(bytes, filename) {
  if (!nativeRuntime) return false;
  // Only private cache access. No permission to read all phone storage is needed.
  const path = `glyphy-exports/${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  // Avoid a single enormous base64 string crossing the native bridge.
  const chunkSize = 192 * 1024;
  try {
    await Filesystem.mkdir({ path: 'glyphy-exports', directory: Directory.Cache, recursive: true });
  } catch { /* The directory may already exist. writeFile reports genuine failures. */ }
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    let binary = '';
    for (const byte of bytes.subarray(offset, offset + chunkSize)) binary += String.fromCharCode(byte);
    const options = { path, directory: Directory.Cache, data: btoa(binary) };
    if (!offset) await Filesystem.writeFile(options);
    else await Filesystem.appendFile(options);
  }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  await Share.share({ title: 'Резервная копия Glyphy', files: [uri], dialogTitle: 'Сохранить или отправить ZIP' });
  // Keep the cache file: the receiving app may read it after Share resolves.
  return true;
}
