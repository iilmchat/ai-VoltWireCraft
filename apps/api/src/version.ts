import { createRequire } from 'node:module';

interface PackageMeta {
  readonly version: string;
}

const loadModule = createRequire(import.meta.url);
const packageMeta = loadModule('../package.json') as PackageMeta;

/** Версия API, прочитанная из `package.json` (RULES § 1.8). */
export const APP_VERSION: string = packageMeta.version;
