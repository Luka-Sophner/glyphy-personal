import JSZip from 'jszip/dist/jszip.min.js';
import { exportArchive, prepareImport, applyImport, readEntry, type PreparedArchive, type ImportMode, type Progress } from '../transfer/archive.js';
import { inspectZip, transferLimits } from '../transfer/zip-safety.js';
import { GlyphyDatabase, type DatabaseMeta } from '../../db/database.js';
import { createId } from '../../lib/id.js';
import { ProfileStore, cleanProfileDetails, profileCreationAllowed, type Profile } from './store.js';
import { withDatabaseLocks } from './locks.js';

export interface ProfileBackupItem {
  profile: Omit<Profile, 'database'>;
  archive: PreparedArchive;
  meta: DatabaseMeta[];
}
export interface ProfileBackup { kind: 'legacy' | 'profile' | 'all'; profiles: ProfileBackupItem[] }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректные данные профиля.');
  return value as Record<string, unknown>;
}
function cleanMetadata(value: unknown): Omit<Profile, 'database'> {
  const data = record(value), details = cleanProfileDetails(data.name, data.icon);
  if (typeof data.id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(data.id)) throw new Error('Некорректный идентификатор профиля.');
  for (const key of ['createdAt', 'updatedAt']) {
    if (!Number.isSafeInteger(data[key]) || Number(data[key]) < 0) throw new Error('Некорректная дата профиля.');
  }
  return { ...details, id: data.id, createdAt: Number(data.createdAt), updatedAt: Number(data.updatedAt), settings: record(data.settings) };
}
export async function exportProfiles(store: ProfileStore, ids: string[], all: boolean, progress: Progress) {
  const zip = new JSZip(), items = [];
  let total = 0;
  for (const [index, id] of ids.entries()) {
    const profile = await store.profiles.get(id);
    if (!profile) throw new Error('Профиль больше не существует.');
    progress(`Экспорт профиля ${index + 1} из ${ids.length}…`);
    const db = store.database(profile);
    const archive = await exportArchive(db, progress);
    total += archive.bytes.length;
    if (total > transferLimits.expandedBytes - transferLimits.jsonBytes) throw new Error('Общая копия превышает 128 МБ. Экспортируйте профили отдельно.');
    const path = `profiles/${id}.zip`;
    const { database, ...metadata } = profile;
    items.push({ profile: metadata, path, meta: await db.meta.toArray() });
    zip.file(path, archive.bytes);
  }
  zip.file('manifest.json', JSON.stringify({ app: 'glyphy', formatVersion: 3, kind: all ? 'all' : 'profile', profiles: items }), { compression: 'DEFLATE' });
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }, update => progress(`Создание ZIP: ${Math.round(update.percent)}%`));
  inspectZip(bytes, true);
  return { bytes, filename: `glyphy-${all ? 'all-profiles' : 'profile'}-${Date.now()}.zip` };
}
export async function prepareProfileBackup(bytes: Uint8Array, progress: Progress): Promise<ProfileBackup> {
  const infos = inspectZip(bytes, true), zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  const manifestInfo = infos.find(info => info.name === 'manifest.json' && !info.directory);
  if (!manifestInfo) throw new Error('В архиве отсутствует manifest.json.');
  const manifest = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readEntry(zip, manifestInfo))));
  if (manifest.formatVersion !== 3) {
    const archive = await prepareImport(bytes, undefined, progress);
    return { kind: 'legacy', profiles: [{ archive, meta: [], profile: { id: 'legacy', name: 'Восстановленная письменность', icon: 'person', settings: {}, createdAt: Date.now(), updatedAt: Date.now() } }] };
  }
  if (manifest.app !== 'glyphy' || !['all', 'profile'].includes(String(manifest.kind)) || !Array.isArray(manifest.profiles)
    || !manifest.profiles.length || manifest.profiles.length > 100 || manifest.kind === 'profile' && manifest.profiles.length !== 1) throw new Error('Некорректный архив профилей.');
  const allowed = new Set(['manifest.json', 'profiles/']), ids = new Set<string>(), profiles: ProfileBackupItem[] = [];
  let expandedBytes = 0;
  for (const [index, value] of manifest.profiles.entries()) {
    const item = record(value), profile = cleanMetadata(item.profile), path = `profiles/${profile.id}.zip`;
    if (ids.has(profile.id) || item.path !== path) throw new Error('Повторяющиеся профили или некорректные пути.');
    ids.add(profile.id); allowed.add(path);
    if (!Array.isArray(item.meta) || item.meta.length > 10000) throw new Error('Некорректные настройки профиля.');
    const meta = item.meta.map(value => {
      const row = record(value);
      if (typeof row.key !== 'string' || !row.key || row.key.length > 160) throw new Error('Некорректные настройки профиля.');
      return { key: row.key, value: row.value };
    });
    const info = infos.find(info => info.name === path && !info.directory);
    if (!info) throw new Error('Отсутствует архив профиля.');
    progress(`Проверка профиля ${index + 1} из ${manifest.profiles.length}…`);
    const nestedBytes = await readEntry(zip, info);
    expandedBytes += inspectZip(nestedBytes).reduce((sum, entry) => sum + entry.size, 0);
    if (expandedBytes > transferLimits.expandedBytes) throw new Error('Суммарный размер профилей превышает 128 МБ.');
    profiles.push({ profile, meta, archive: await prepareImport(nestedBytes, undefined, progress) });
  }
  if (infos.some(info => !allowed.has(info.name))) throw new Error('В архиве есть посторонние файлы.');
  return { kind: manifest.kind as 'profile' | 'all', profiles };
}
export interface RestoreOptions {
  destination: 'new' | 'existing' | 'all';
  targetId: string;
  sourceIndex: number;
  mode: ImportMode;
  confirmed: boolean;
}
async function cloneDatabase(source: GlyphyDatabase, target: GlyphyDatabase) {
  const snapshot = await source.transaction('r', source.tables, async () =>
    Promise.all(source.tables.map(async table => ({ name: table.name, rows: await table.toCollection().raw().toArray() }))));
  await target.transaction('rw', target.tables, async () => {
    for (const table of snapshot) await target.table(table.name).bulkPut(table.rows);
  });
}
export async function restoreProfiles(store: ProfileStore, backup: ProfileBackup, options: RestoreOptions, progress: Progress) {
  const before = await store.profiles.toArray();
  return withDatabaseLocks(before.map(profile => profile.database), async () => {
    const current = await store.profiles.toArray();
    if (JSON.stringify(current) !== JSON.stringify(before)) throw new Error('Профили изменились. Повторите импорт.');
    return restoreLocked(store, backup, options, progress);
  });
}
async function restoreLocked(store: ProfileStore, backup: ProfileBackup, options: RestoreOptions, progress: Progress) {
  if (options.mode === 'replace' && !options.confirmed) throw new Error('Замена требует явного подтверждения.');
  if (options.destination === 'all' && backup.kind !== 'all') throw new Error('Это архив одного профиля.');
  const items = options.destination === 'all' ? backup.profiles : [backup.profiles[options.sourceIndex]];
  if (items.some(item => !item)) throw new Error('Выберите профиль из архива.');
  const stages: { profile: Profile; previous?: Profile; db: GlyphyDatabase }[] = [];
  let published = false, added = 0, skipped = 0;
  try {
    for (const [index, item] of items.entries()) {
      progress(`Подготовка восстановления ${index + 1} из ${items.length}…`);
      const previous = options.destination === 'all' ? await store.profiles.get(item.profile.id)
        : options.destination === 'existing' ? await store.profiles.get(options.targetId) : undefined;
      if (options.destination === 'existing' && !previous) throw new Error('Профиль назначения удалён.');
      const id = previous?.id ?? (options.destination === 'all' ? item.profile.id : createId());
      const profile: Profile = { ...item.profile, ...(options.destination === 'existing' ? previous ?? {} : {}), id,
        database: store.legacyName + '-restored-' + createId(),
        settings: backup.kind === 'legacy' ? previous?.settings ?? {} : options.mode === 'replace'
          ? item.profile.settings : { ...(previous?.settings ?? {}), ...item.profile.settings },
        updatedAt: options.destination === 'existing' ? Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1) : item.profile.updatedAt };
      const db = store.database(profile);
      stages.push({ profile, previous, db });
      await store.state.put({ key: 'pending-' + profile.database, value: profile.database, createdAt: Date.now() });
      await db.open();
      if (previous) await cloneDatabase(store.database(previous), db);
      const archive = backup.kind !== 'legacy' && !item.archive.modules
        ? { ...item.archive, modules: { glyphs: [], diaryEntries: [], diaryGroups: [] } } : item.archive;
      const result = await applyImport(db, archive, options.mode, options.confirmed);
      added += result.added; skipped += result.skipped;
      if (backup.kind !== 'legacy' && options.mode === 'replace') await db.meta.clear();
      await db.meta.bulkPut(item.meta);
      await db.meta.put({ key: 'demo-initialized', value: true });
      await db.meta.put({ key: 'glyph-gallery-demo-initialized', value: true });
    }
    await store.transaction('rw', store.profiles, store.state, async () => {
      const additions = stages.filter(stage => !stage.previous).length;
      if (options.destination !== 'all' && additions && !profileCreationAllowed(await store.profiles.count())) throw new Error('Доступно пять бесплатных профилей. Выберите существующий профиль.');
      for (const stage of stages) {
        const current = await store.profiles.get(stage.profile.id);
        if (stage.previous ? current?.database !== stage.previous.database || current?.updatedAt !== stage.previous.updatedAt : !!current) throw new Error('Профили изменились в другой вкладке. Повторите импорт.');
        await store.profiles.put(stage.profile);
        await store.state.delete('pending-' + stage.profile.database);
        if (stage.previous) await store.state.put({ key: 'retired-' + stage.previous.database, value: stage.previous.database });
      }
    });
    published = true;
    return { added, skipped, profiles: stages.length };
  } finally {
    // Failed validation/writes never publish any staged profile.
    if (!published) for (const stage of stages) {
      await stage.db.delete();
      await store.state.delete('pending-' + stage.profile.database);
    }
  }
}
