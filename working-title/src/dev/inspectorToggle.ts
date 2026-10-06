import type { Scene } from '@babylonjs/core/scene';

const TOGGLE_CODE = 'Backquote';

/**
 * Dev-only: the backtick key shows and hides the Babylon Inspector. The inspector package
 * is loaded on first use, and this module is only imported behind `import.meta.env.DEV`,
 * so neither reaches the production bundle (enforced by tools/check-bundle.mjs).
 */
export function installInspectorToggle(scene: Scene): void {
  let token: { dispose(): void } | null = null;
  let loading = false;

  window.addEventListener('keydown', (event) => {
    if (event.code !== TOGGLE_CODE || event.repeat || loading) {
      return;
    }
    event.preventDefault();
    if (token !== null) {
      token.dispose();
      token = null;
      return;
    }
    loading = true;
    import('@babylonjs/inspector')
      .then(({ ShowInspector }) => {
        token = ShowInspector(scene);
      })
      .catch((error: unknown) => {
        console.error('[working-title] Failed to load the Babylon Inspector.', error);
      })
      .finally(() => {
        loading = false;
      });
  });
}
