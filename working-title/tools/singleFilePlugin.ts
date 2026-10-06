import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite';

const FAVICON_PATH = fileURLToPath(new URL('../public/favicon.svg', import.meta.url));

/**
 * Havok's loader computes a default wasm location with `new URL(..., import.meta.url)`.
 * Vite would inline that as a second 2 MiB copy of the wasm. The single-file build passes
 * the bytes in as `wasmBinary` (see src/core/physics.ts), so the default is never fetched.
 */
const HAVOK_LOADER_ID = /[\\/]@babylonjs[\\/]havok[\\/]lib[\\/]esm[\\/]HavokPhysics_es\.js$/;
const HAVOK_DEFAULT_WASM_URL = 'new URL("HavokPhysics.wasm",import.meta.url).href';

/**
 * Vite wraps each dynamic import() as `__vitePreload(factory, __VITE_PRELOAD__)` and later
 * swaps the marker for the chunk's dependency list. With code splitting off, Rolldown inlines
 * those imports first, so Vite never pairs them and the raw marker reaches the output, where
 * it throws a ReferenceError. In one file there is nothing to preload: "no deps" is correct.
 */
const PRELOAD_MARKER = /\b__VITE_PRELOAD__\b/g;

/** Stops inline code from closing its own <script> or <style> element early. */
function escapeForInline(code: string, tag: 'script' | 'style'): string {
  return code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);
}

/**
 * Folds the whole production build into one HTML file: the JS entry becomes an inline
 * module script, CSS becomes an inline <style>, the favicon becomes a data: URL. Combined
 * with `codeSplitting: false` and an unlimited `assetsInlineLimit`, the page loads nothing
 * from the network. Fails the build if anything is left as a separate file.
 */
export function singleFilePlugin(): Plugin[] {
  const dropHavokDefaultWasm: Plugin = {
    name: 'working-title:single-file-havok',
    apply: 'build',
    transform(code, id) {
      if (!HAVOK_LOADER_ID.test(id)) {
        return null;
      }
      if (!code.includes(HAVOK_DEFAULT_WASM_URL)) {
        this.error('single-file: Havok loader changed; its default wasm URL was not found.');
      }
      return { code: code.replace(HAVOK_DEFAULT_WASM_URL, '"HavokPhysics.wasm"'), map: null };
    },
  };

  const inline: Plugin = {
    name: 'working-title:single-file',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const svg = readFileSync(FAVICON_PATH, 'utf8');
        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        return html.replace('href="./favicon.svg"', `href="${dataUrl}"`);
      },
    },
    generateBundle(_options, bundle) {
      const htmlAsset = bundle['index.html'];
      if (htmlAsset?.type !== 'asset' || typeof htmlAsset.source !== 'string') {
        this.error('single-file: index.html missing from the bundle.');
      }
      let html = htmlAsset.source;

      for (const [fileName, output] of Object.entries(bundle)) {
        if (fileName === 'index.html' || fileName.endsWith('.map')) {
          continue;
        }
        const escapedName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (output.type === 'chunk') {
          output.code = output.code.replace(PRELOAD_MARKER, 'void 0');
          const tag = new RegExp(`<script[^>]*src="\\./${escapedName}"[^>]*></script>`);
          if (!tag.test(html)) {
            this.error(`single-file: chunk ${fileName} is not referenced by index.html.`);
          }
          const code = escapeForInline(
            output.code.replace(/\n\/\/# sourceMappingURL=.*$/, ''),
            'script',
          );
          html = html.replace(tag, () => `<script type="module">${code}</script>`);
        } else if (fileName.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]*href="\\./${escapedName}"[^>]*>`);
          const css = escapeForInline(String(output.source), 'style');
          html = html.replace(tag, () => `<style>${css}</style>`);
        } else {
          this.error(`single-file: asset ${fileName} was emitted instead of inlined.`);
        }
        Reflect.deleteProperty(bundle, fileName);
      }

      htmlAsset.source = html;
    },
  };

  return [dropHavokDefaultWasm, inline];
}
