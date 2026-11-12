import { glyphyNativeBuild } from './native-build.mjs';
import { build, createServer, preview } from 'vite';
import ts from 'typescript';
import { glyphyPwa } from './pwa.mjs';
const mode = process.argv[2] ?? 'dev';
// Restricted Windows environments may forbid the child-process pipes esbuild uses.
// Vite/Rollup can also build with the existing TypeScript compiler in-process.
const portable = {
  configFile: false, resolve: { preserveSymlinks: true }, esbuild: false,
  base: './', plugins: [glyphyNativeBuild(), glyphyPwa(), { name: 'glyphy-typescript', enforce: 'pre', transform(source, id) {
    // RSC directives have no effect in this client-only SPA build.
    let code = source.replaceAll('import.meta.env.PROD', mode === 'dev' ? 'false' : 'true').replace(/^(['"])use client\1;?\s*/, '').replaceAll('process.env.NODE_ENV', JSON.stringify('production'));
    if (/\.tsx?$/.test(id)) code = ts.transpileModule(code, { fileName: id,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return { code, map: null };
  } }],
  build: { minify: false, cssMinify: false, target: 'esnext' },
};
const restricted = error => error?.code === 'EPERM' || /spawn EPERM/.test(String(error));
if (mode === 'preview') {
  const server = await preview({ configFile: false, resolve: { preserveSymlinks: true }, preview: { host: '0.0.0.0', port: 4173, strictPort: true } });
  server.printUrls();
} else if (mode === 'build') {
  try { await build(); } catch (error) {
    if (!restricted(error)) throw error;
    console.info('Using in-process TypeScript build (Windows process restriction).');
    await build(portable);
  }
} else {
  try { const server = await createServer(); await server.listen(); server.printUrls(); }
  catch (error) {
    if (!restricted(error)) throw error;
    console.info('Using Vite build-watch + preview. Refresh after source changes.');
    const watcher = await build({ ...portable, build: { ...portable.build, outDir: '.glyphy-dev', watch: {} } });
    let started = false;
    watcher.on('event', async event => {
      if (event.code === 'ERROR') console.error(event.error);
      if (event.code === 'END' && !started) {
        started = true;
        const server = await preview({ configFile: false, build: { outDir: '.glyphy-dev' }, resolve: { preserveSymlinks: true }, preview: { host: '0.0.0.0', port: 5173, strictPort: true } });
        server.printUrls();
      }
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await watcher.close(); process.exit(0); });
  }
}



