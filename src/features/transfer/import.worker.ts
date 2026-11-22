import { prepareProfileBackup } from '../profiles/archive';
self.onmessage = async (event: MessageEvent<Uint8Array>) => {
  try {
    const prepared = await prepareProfileBackup(event.data, message => self.postMessage({ progress: message }));
    self.postMessage({ prepared });
  } catch (cause) {
    self.postMessage({ error: cause instanceof Error ? cause.message : 'Не удалось проверить архив.' });
  }
};
