// The same lock names protect repository writes and destructive profile operations.
// Keeping the old database locked until catalog publication rejects stale editors.
export function withDatabaseLocks<T>(names: string[], work: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (!locks) return work();
  const ordered = [...new Set(names)].sort();
  const enter = async (index: number): Promise<T> => {
    if (index === ordered.length) return work();
    return await locks.request('glyphy-profile-' + ordered[index], () => enter(index + 1));
  };
  return enter(0);
}
