// Manual desktop benchmark. Run before and after changes with the same Chromium.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5186'], { stdio: 'ignore', windowsHide: true });
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch('http://127.0.0.1:5186')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5186/?demo=1');
  const results = await page.evaluate(async fullPipeline => {
    const { GlyphyDatabase } = await import('/src/db/database.ts');
    const { exportArchive, prepareImport, applyImport } = await import('/src/features/transfer/archive.ts');
    const { validateDecodedAsset } = await import('/src/features/transfer/browser.ts');
    const { storeMedia } = await import('/src/db/media-storage.ts');
    const { ProfileStore } = await import('/src/features/profiles/store.ts');
    const { restoreProfiles } = await import('/src/features/profiles/archive.ts');
    const { prepareBackupFile } = await import('/src/features/transfer/import-client.ts');
    const db = new GlyphyDatabase('benchmark-source'), target = new GlyphyDatabase('benchmark-target');
    const profiles = new ProfileStore('benchmark-target');
    await profiles.initialize();
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 768;
    const context = canvas.getContext('2d'), pixels = context.createImageData(1024, 768);
    let random = 19;
    for (let i = 0; i < pixels.data.length; i += 4) {
      random = (random * 1664525 + 1013904223) >>> 0;
      pixels.data[i] = random >>> 24;
      pixels.data[i + 1] = random >>> 16;
      pixels.data[i + 2] = random >>> 8;
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    const thumb = document.createElement('canvas');
    thumb.width = 192; thumb.height = 144;
    thumb.getContext('2d').drawImage(canvas, 0, 0, 192, 144);
    const thumbnailBlob = await new Promise(resolve => thumb.toBlob(resolve, 'image/png'));
    for (let i = 0; i < 24; i++) {
      await db.media.put(await storeMedia({ id: 'photo-' + i, blob, thumbnailBlob, mimeType: 'image/jpeg', width: 1024, height: 768, createdAt: 1 }));
      await db.cards.put({ id: 'card-' + i, imageId: 'photo-' + i, createdAt: 1, updatedAt: 1, tags: [], categories: ['phenomena'],
        meanings: [{ id: 'meaning-' + i, category: 'phenomena', primary: 'Фото ' + i, secondary: [], isPrimaryCategory: true, order: 0 }] });
    }
    const archive = await exportArchive(db), samples = [];
    for (let i = 0; i < 4; i++) {
      const start = performance.now();
      const prepared = fullPipeline
        ? await prepareBackupFile(new File([archive.bytes], 'benchmark.zip', { type: 'application/zip' }), () => {})
        : await prepareImport(archive.bytes, validateDecodedAsset);
      const validated = performance.now();
      if (fullPipeline) await restoreProfiles(profiles, prepared, { destination: 'existing', targetId: 'default', sourceIndex: 0, mode: 'replace', confirmed: true }, () => {});
      else await applyImport(target, prepared, 'replace', true);
      samples.push({ validationMs: validated - start, writeMs: performance.now() - validated, totalMs: performance.now() - start });
    }
    await db.delete(); await target.delete();
    return { images: 24, width: 1024, height: 768, zipBytes: archive.bytes.length, warmup: samples.shift(), samples };
  }, process.argv.includes('--profiles'));
  const file = process.argv[2] ?? '.verification/import-benchmark.json';
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();
  server.kill();
}
