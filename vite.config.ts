import { glyphyNativeBuild } from './scripts/native-build.mjs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { glyphyPwa } from './scripts/pwa.mjs';

// Deterministic offline shell works with the restricted in-process build too.
export default defineConfig({
  plugins: [glyphyNativeBuild(), react(), glyphyPwa()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022' }, base: './',
});

