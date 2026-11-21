/**
 * Central config. Never reads process.env in other modules — import from here.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const SRC_DIR = path.join(REPO_ROOT, 'src');
export const DATA_DIR = path.join(REPO_ROOT, 'data');
export const SOURCES_DIR = path.join(DATA_DIR, 'sources');
export const DB_PATH = path.join(DATA_DIR, 'netarch.db');
export const WEB_PUBLIC_DIR = path.join(SRC_DIR, 'web', 'public');

/** Source workbooks (read-only). Names are exactly the downloaded files. */
export const SOURCE_FILES = [
  'HQ-ACCESS-SWITCH-INFO.xlsx',
  'All Building VLAN & Floor Information(NOC).xlsx',
];

export interface AppConfig {
  port: number;
  host: string;
  dbPath: string;
  sourcesDir: string;
  sourceFiles: string[];
  webPublic: string;
  isProduction: boolean;
}

function readPort(): number {
  const raw = process.env.PORT;
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 3000;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: readPort(),
    host: process.env.HOST ?? '0.0.0.0',
    dbPath: process.env.NETARCH_DB_PATH ?? DB_PATH,
    sourcesDir: process.env.NETARCH_SOURCES_DIR ?? SOURCES_DIR,
    sourceFiles: SOURCE_FILES,
    webPublic: WEB_PUBLIC_DIR,
    isProduction: process.env.NODE_ENV === 'production',
    ...overrides,
  };
}
