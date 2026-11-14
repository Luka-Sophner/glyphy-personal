export function mediaSaveError(cause: unknown): string {
  const error = cause as { name?: string; message?: string; inner?: { name?: string; message?: string } } | null;
  if ([error?.name, error?.inner?.name].includes('QuotaExceededError')) return 'Недостаточно места для сохранения. Освободи место на телефоне и повтори попытку. Черновик остался в редакторе. Поля и фотографии не сброшены.';
  if ([error?.name, error?.inner?.name].includes('DataError') || /InvalidBlob|Failed to write blobs/i.test(error?.message ?? error?.inner?.message ?? '')) return 'Не удалось записать фотографию. Поля и фотографии остались в редакторе — повтори сохранение. Не удаляй приложение и не очищай его данные.';
  return error?.message || 'Не удалось сохранить изменения. Данные и фотографии остались в редакторе.';
}
