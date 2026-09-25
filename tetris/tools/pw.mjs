/* Resolves Playwright from the project, or from a global install (it is a
   large download, so it is deliberately not a devDependency). */
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

export function loadPlaywright() {
  const local = createRequire(import.meta.url);
  try { return local('playwright'); } catch { /* fall through to the global install */ }
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return createRequire(path.join(globalRoot, '/'))('playwright');
}
