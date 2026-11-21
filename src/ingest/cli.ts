/**
 * Ingest CLI: xlsx → normalize → resolve → merge → persist (node:sqlite).
 * Run: npx tsx src/ingest/cli.ts
 */
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig } from '../config/index.js';
import { loadWorkbook } from './workbook.js';
import { SHEET_SPECS_HQ, SHEET_SPECS_NOC, SHEET_SPECS_ISP } from './config.js';
import { parseSheet } from './sheets.js';
import { mergeRecords, type MergeResult } from '../merge/index.js';
import { openDb, saveIngest } from '../db/index.js';
import type { RawRecord } from '../types/index.js';

export interface IngestOptions {
  sourcesDir?: string;
  sourceFiles?: string[];
  dbPath?: string;
  verbose?: boolean;
}

export interface IngestOutput {
  records: RawRecord[];
  merged: MergeResult;
  files: string[];
  dbPath: string;
  sheetStats: Array<{ file: string; sheet: string; records: number; warnings: number }>;
  ingestedAt: string;
}

export async function runIngest(opts: IngestOptions = {}): Promise<IngestOutput> {
  const config = loadConfig();
  const sourcesDir = opts.sourcesDir ?? config.sourcesDir;
  const sourceFiles = opts.sourceFiles ?? config.sourceFiles;
  const dbPath = opts.dbPath ?? config.dbPath;
  const ingestedAt = new Date().toISOString();

  if (!fs.existsSync(sourcesDir)) {
    throw new Error(`Sources directory not found: ${sourcesDir} — download the source workbooks there first.`);
  }

  const allRecords: RawRecord[] = [];
  const warnings: string[] = [];
  const sheetStats: Array<{ file: string; sheet: string; records: number; warnings: number }> = [];

  for (const fileName of sourceFiles) {
    const filePath = path.join(sourcesDir, fileName);
    if (!fs.existsSync(filePath)) {
      warnings.push(`source file not found: ${fileName} (skipped)`);
      continue;
    }
    const wb = await loadWorkbook(filePath);
    // dispatch by file identity
    const upper = fileName.toUpperCase();
    const isHq = upper.includes('HQ-ACCESS-SWITCH-INFO');
    const isIsp = upper.includes('ISP REAL IP');
    const specs = isHq ? SHEET_SPECS_HQ : isIsp ? SHEET_SPECS_ISP : SHEET_SPECS_NOC;
    for (const ws of wb.sheets) {
      const spec = specs.find((s) => s.name === ws.name);
      if (!spec) {
        warnings.push(`sheet "${ws.name}" in ${fileName}: no parser configured — skipped`);
        sheetStats.push({ file: fileName, sheet: ws.name, records: 0, warnings: 1 });
        continue;
      }
      const out = parseSheet(ws, fileName, spec);
      allRecords.push(...out.records);
      warnings.push(...out.warnings);
      sheetStats.push({ file: fileName, sheet: ws.name, records: out.records.length, warnings: out.warnings.length });
    }
  }

  const merged = mergeRecords(allRecords, sheetStats, warnings);

  // persist
  const db = openDb(dbPath);
  saveIngest(db.db, merged, { files: sourceFiles, ingestedAt });
  db.close();

  return {
    records: allRecords,
    merged,
    files: sourceFiles,
    dbPath,
    sheetStats,
    ingestedAt,
  };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('cli.ts')) {
  const t0 = Date.now();
  runIngest({ verbose: true })
    .then((out) => {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`\n=== ingest complete in ${elapsed}s ===`);
      console.log(`files:   ${out.files.join(', ')}`);
      console.log(`records: ${out.merged.stats.records}`);
      console.log(`ips:     ${out.merged.stats.ips}`);
      console.log(`devices: ${out.merged.stats.devices}`);
      console.log(`connections: ${out.merged.stats.connections}`);
      console.log(`warnings: ${out.merged.warnings.length}`);
      for (const w of out.merged.warnings.slice(0, 20)) console.log(`  warn: ${w}`);
      console.log(`db:      ${out.dbPath}`);
    })
    .catch((err) => {
      console.error(`ingest failed: ${err?.message ?? err}`);
      process.exit(1);
    });
}
