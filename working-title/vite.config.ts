import { defineConfig } from 'vite';

import { singleFilePlugin } from './tools/singleFilePlugin';

export default defineConfig(({ mode }) => {
  // `vite build --mode single` produces one self-contained HTML file (dist-single/index.html)
  // for sandboxed hosts that can only serve a single page. Production uses the normal build.
  const single = mode === 'single';
  return {
    // Relative asset URLs: the deploy target is not decided, and this works at any sub-path.
    base: './',
    publicDir: single ? false : 'public',
    plugins: single ? singleFilePlugin() : [],
    optimizeDeps: {
      // Havok ships an Emscripten loader plus a .wasm file; pre-bundling breaks its wasm lookup.
      exclude: ['@babylonjs/havok'],
    },
    build: {
      target: 'es2022',
      outDir: single ? 'dist-single' : 'dist',
      sourcemap: !single,
      // The entry chunk is ~1.35 MiB minified because both the WebGPU and the WebGL2 back
      // ends ship. A vendor-chunk split was tried and rejected: it pulls Babylon's lazily
      // loaded shaders and texture loaders into the eager download. Warn only past this.
      chunkSizeWarningLimit: single ? 8000 : 1500,
      ...(single
        ? {
            assetsInlineLimit: () => true,
            cssCodeSplit: false,
            modulePreload: false,
            rolldownOptions: { output: { codeSplitting: false } },
          }
        : {}),
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
  };
});
