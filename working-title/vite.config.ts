import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs: the deploy target is not decided, and this works at any sub-path.
  base: './',
  optimizeDeps: {
    // Havok ships an Emscripten loader plus a .wasm file; pre-bundling breaks its wasm lookup.
    exclude: ['@babylonjs/havok'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // The entry chunk is ~1.35 MiB minified because both the WebGPU and the WebGL2 back
    // ends ship. A vendor-chunk split was tried and rejected: it pulls Babylon's lazily
    // loaded shaders and texture loaders into the eager download. Warn only past this.
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
