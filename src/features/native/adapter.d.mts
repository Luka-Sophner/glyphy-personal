export const nativeRuntime: boolean;
export function saveNativeArchive(bytes: Uint8Array, filename: string): Promise<boolean>;
export function listenNativeBack(handler: () => void): Promise<() => void>;
export function minimizeNativeApp(): Promise<void>;
