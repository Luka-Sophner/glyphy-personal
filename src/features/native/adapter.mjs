// Desktop implementation. The Android build replaces this module at bundle time.
export const nativeRuntime = false;
export async function saveNativeArchive() { return false; }
export async function listenNativeBack() { return () => {}; }
export async function minimizeNativeApp() {}
