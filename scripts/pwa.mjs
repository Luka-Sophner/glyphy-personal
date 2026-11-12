import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

export function serviceWorkerSource(revision, files) {
  return `/* Glyphy offline shell. IndexedDB is never touched by this worker. */
const CACHE = 'glyphy-static-${revision}';
const FILES = ${JSON.stringify(files)};
const urls = FILES.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try { const cache = await caches.open(CACHE); await cache.addAll(urls); }
    catch (error) { await caches.delete(CACHE); throw error; }
  })());
});
self.addEventListener('activate', event => {
  // Keep earlier immutable caches for already-open tabs with older lazy chunks.
  // They are bounded and do not contain user records or photos.
  event.waitUntil((async () => {
    const keys = (await caches.keys()).filter(key => key.startsWith('glyphy-static-') && key !== CACHE);
    for (const key of keys.slice(0, Math.max(0, keys.length - 2))) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => { if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(new URL('index.html', self.registration.scope).href) || fetch(request);
    })()); return;
  }
  const cleanURL = new URL(url); cleanURL.search = ''; cleanURL.hash = '';
  const olderCodeChunk = cleanURL.pathname.startsWith(new URL('assets/', self.registration.scope).pathname) && /[.](?:js|css)$/.test(cleanURL.pathname);
  if (!urls.includes(cleanURL.href) && !olderCodeChunk) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(cleanURL.href) || await caches.match(cleanURL.href) || fetch(request);
  })());
});
`;
}
export function glyphyPwa() {
  return {
    name: 'glyphy-offline-shell', apply: 'build',
    async writeBundle(options) {
      const root = resolve(options.dir ?? 'dist');
      const entries = await readdir(root, { recursive: true, withFileTypes: true });
      const files = entries.filter(entry => entry.isFile()).map(entry => relative(root, resolve(entry.parentPath ?? entry.path, entry.name)).replaceAll('\\', '/')).filter(name => !name.endsWith('.map') && name !== 'sw.js').sort();
      const hash = createHash('sha256');
      hash.update(serviceWorkerSource('revision', []));
      for (const file of files) { hash.update(file); hash.update(await readFile(resolve(root, file))); }
      await writeFile(resolve(root, 'sw.js'), serviceWorkerSource(hash.digest('hex').slice(0, 16), files));
    },
  };
}
