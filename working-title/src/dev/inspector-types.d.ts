/**
 * Type shim for `@babylonjs/inspector`, wired in through `paths` in tsconfig.app.json.
 *
 * The 9.x package's declarations import `@babylonjs/shared-ui-components`, which is not
 * published, so they fail to type-check. This shim declares only the API used here and
 * lets `skipLibCheck` stay off for every other dependency. Runtime resolution is not
 * affected: Vite resolves the real package. Remove once upstream ships valid typings.
 */
import type { Scene } from '@babylonjs/core/scene';

export interface InspectorToken {
  dispose(): void;
}

export declare function ShowInspector(scene: Scene): InspectorToken;
