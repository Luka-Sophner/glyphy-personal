import { resolve } from 'node:path';
export function glyphyNativeBuild() {
  const android = process.env.GLYPHY_ANDROID === '1';
  return {
    name: 'glyphy-native-adapter', enforce: 'pre',
    transformIndexHtml(html) { return android ? html.replace('viewport-fit=cover', 'viewport-fit=contain') : html; },
    resolveId(source, importer) {
      if (android && importer && /\/features\/(?:pwa|transfer)\//.test(importer.replaceAll('\\', '/')) && source === '../native/adapter.mjs') return resolve('src/features/native/capacitor.mjs');
      if (android && source === '../features/native/adapter.mjs') return resolve('src/features/native/capacitor.mjs');
    },
    buildStart() {
      if (android && process.env.GLYPHY_LIVE_RELOAD) throw new Error('Live reload is forbidden in the APK build.');
    },
  };
}
