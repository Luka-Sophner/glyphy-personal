import Dexie, { type Table } from 'dexie';
import { GlyphyDatabase } from '../../db/database.js';
import { createId } from '../../lib/id.js';
import { withDatabaseLocks } from './locks.js';

export const profileIcons = ['person', 'sun', 'moon', 'star', 'leaf'] as const;
export type ProfileIcon = typeof profileIcons[number];
export interface Profile {
  id: string;
  name: string;
  icon: ProfileIcon;
  database: string;
  createdAt: number;
  updatedAt: number;
  settings: Record<string, unknown>;
  revision?: string;
}
interface CatalogState { key: string; value: string; createdAt?: number }
export const freeProfileLimit = 5;
// Future verified entitlements can supply a higher creation limit here.
export function profileCreationAllowed(count: number, limit = freeProfileLimit) { return count < limit; }
export function cleanProfileDetails(name: unknown, icon: unknown) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new Error('Введите название от 1 до 100 символов.');
  if (!profileIcons.includes(icon as ProfileIcon)) throw new Error('Выберите стандартную иконку.');
  return { name: name.trim(), icon: icon as ProfileIcon };
}

export class ProfileStore extends Dexie {
  profiles!: Table<Profile, string>;
  state!: Table<CatalogState, string>;
  readonly databases = new Map<string, GlyphyDatabase>();
  constructor(readonly legacyName = 'glyphy') {
    super(legacyName + '-profiles');
    this.version(1).stores({ profiles: 'id,createdAt', state: 'key' });
  }
  async initialize() {
    // The existing database is adopted in place. No media are copied or rewritten.
    await this.transaction('rw', this.profiles, this.state, async () => {
      if (await this.profiles.count()) return;
      const now = Date.now();
      await this.profiles.add({ id: 'default', name: 'Моя письменность', icon: 'person', database: this.legacyName, settings: {}, createdAt: now, updatedAt: now });
      await this.state.put({ key: 'active', value: 'default' });
    });
    for (const retired of await this.state.filter(row => row.key.startsWith('retired-') || row.key.startsWith('pending-')).toArray()) {
      if (retired.key.startsWith('pending-') && Date.now() - (retired.createdAt ?? 0) < 24 * 60 * 60 * 1000) continue;
      if (await this.profiles.filter(profile => profile.database === retired.value).count()) continue;
      try {
        await new GlyphyDatabase(retired.value).delete();
        await this.state.delete(retired.key);
      } catch { /* Keep the retry record if storage is temporarily unavailable. */ }
    }
  }
  database(profile: Profile) {
    let database = this.databases.get(profile.database);
    if (!database) {
      database = new GlyphyDatabase(profile.database);
      this.databases.set(profile.database, database);
    }
    return database;
  }
  async snapshot() {
    return this.transaction('r', this.profiles, this.state, async () => {
      const profiles = await this.profiles.orderBy('createdAt').toArray();
      const activeId = (await this.state.get('active'))?.value;
      return { profiles, active: profiles.find(profile => profile.id === activeId) ?? profiles[0] };
    });
  }
  async create(name: string, icon: ProfileIcon) {
    const details = cleanProfileDetails(name, icon), now = Date.now(), id = createId();
    const profile: Profile = { ...details, id, database: this.legacyName + '-profile-' + id, settings: {}, createdAt: now, updatedAt: now };
    await this.transaction('rw', this.profiles, async () => {
      if (!profileCreationAllowed(await this.profiles.count())) throw new Error('Доступно пять бесплатных профилей. Расширение лимита появится в будущей подписке.');
      await this.profiles.add(profile);
    });
    return profile;
  }
  async edit(id: string, name: string, icon: ProfileIcon) {
    const details = cleanProfileDetails(name, icon);
    await this.transaction('rw', this.profiles, async () => {
      const profile = await this.profiles.get(id);
      if (!profile) throw new Error('Профиль больше не существует.');
      await this.profiles.update(id, { ...details, updatedAt: Math.max(Date.now(), profile.updatedAt + 1) });
    });
  }
  async activate(id: string) {
    await this.transaction('rw', this.profiles, this.state, async () => {
      if (!await this.profiles.get(id)) throw new Error('Профиль больше не существует.');
      await this.state.put({ key: 'active', value: id });
    });
  }
  async clear(id: string) {
    const profile = await this.profiles.get(id);
    if (!profile) throw new Error('Профиль больше не существует.');
    await withDatabaseLocks([profile.database], async () => {
      if ((await this.profiles.get(id))?.database !== profile.database) throw new Error('Профиль изменился. Повторите очистку.');
      const empty = { ...profile, database: this.legacyName + '-cleared-' + createId(),
        updatedAt: Math.max(Date.now(), profile.updatedAt + 1), revision: createId() };
      const db = this.database(empty), pendingKey = 'pending-' + empty.database;
      await this.state.put({ key: pendingKey, value: empty.database, createdAt: Date.now() });
      let published = false;
      try {
        await db.meta.bulkPut([{ key: 'demo-initialized', value: true }, { key: 'glyph-gallery-demo-initialized', value: true }]);
        await this.transaction('rw', this.profiles, this.state, async () => {
          if ((await this.profiles.get(id))?.database !== profile.database) throw new Error('Профиль изменился. Повторите очистку.');
          await this.profiles.put(empty);
          await this.state.delete(pendingKey);
          await this.state.put({ key: 'retired-' + profile.database, value: profile.database });
        });
        published = true;
      } finally {
        if (!published) {
          await db.delete();
          await this.state.delete(pendingKey);
        }
      }
      try {
        await this.database(profile).delete();
        await this.state.delete('retired-' + profile.database);
      } catch { /* Logical clear succeeded. Retry physical cleanup on the next launch. */ }
    });
  }
  async remove(id: string) {
    const selected = await this.profiles.get(id);
    if (!selected) throw new Error('Профиль больше не существует.');
    return withDatabaseLocks([selected.database], () => this.removeLocked(id, selected.database));
  }
  private async removeLocked(id: string, expectedDatabase: string) {
    let profile: Profile | undefined;
    await this.transaction('rw', this.profiles, this.state, async () => {
      profile = await this.profiles.get(id);
      if (!profile || profile.database !== expectedDatabase) throw new Error('Профиль изменился. Повторите удаление.');
      if (await this.profiles.count() <= 1) throw new Error('Сначала создайте другой профиль. В приложении должен оставаться хотя бы один.');
      await this.profiles.delete(id);
      await this.state.put({ key: 'retired-' + id, value: profile.database });
      if ((await this.state.get('active'))?.value === id) {
        const next = await this.profiles.orderBy('createdAt').first();
        await this.state.put({ key: 'active', value: next!.id });
      }
    });
    // Catalog removal is atomic. If physical cleanup fails, keep a durable retry record.
    try {
      await this.database(profile!).delete();
      await this.state.delete('retired-' + id);
    } catch { /* Retry on the next launch. Other profiles remain available. */ }
  }
}
