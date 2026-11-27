/**
 * Per-sheet parsers.
 *
 * IP columns are AUTO-DETECTED per panel/block (highest fraction of rows whose cell
 * yields ≥1 IP); config values are used only as fallbacks. Everything is recorded in
 * warnings and never silently guessed.
 */
import net from 'node:net';
import type { RawRecord, NormalizedIp, RecordKind } from '../types/index.js';
import { parseIps } from '../normalize/ip.js';
import { cleanName } from '../normalize/name.js';
import { isBannerRow, isSectionTitleRow, type WorkbookSheet } from './workbook.js';

export interface ParsedSheet {
  sheetName: string;
  sheetFile: string;
  records: RawRecord[];
  warnings: string[];
}

export interface PanelSpec {
  /** 0-indexed columns of this panel (a contiguous group of columns). */
  panelCols: number[];
  /** 0-indexed expected name column (validated; fallback = first non-IP text col). */
  nameCol: number;
  kind: RecordKind;
  /** Panel block label, or -1 when the block comes from a per-row tag column. */
  block?: string | null;
  blockTagCol?: number; // 0-indexed per-row block tag column
  locationCol?: number;
  vlansCol?: number;
  purposeCol?: number;
  remarksCol?: number;
  hostnameCol?: number;
  statusCol?: number;
  dnsCol?: number;
  openPortsCol?: number;
  serialCol?: number;
  modelCol?: number;
  osCol?: number;
  /** true when this is a host sheet (IPs of physical hosts, not network infrastructure). */
  host?: boolean;
  /** when true, the name column is never guessed beyond the configured column. */
  noFallback?: boolean;
}

export interface NeighborBlockSpec {
  localNameCol: number;
  localModelCol: number;
  localSerialCol: number;
  localTagCol: number;
  localIpCol: number;
  localPortCol: number;
  localAllowedCol: number;
  localLocationCol: number;
  localRemarksCol: number;
  neighborNameCol: number;
  neighborModelCol: number;
  neighborSerialCol: number;
  neighborTagCol: number;
  neighborIpCol: number;
  neighborPortCol: number;
  neighborAllowedCol: number;
}

export interface SheetSpec {
  name: string;
  dataStart: number;
  headerRow: number | null;
  bannerRows: number;
  kind: 'hq' | 'panels' | 'skip';
  panels: PanelSpec[];
  hq: NeighborBlockSpec | null;
}

function getRow(sheet: WorkbookSheet, rowIndex: number): string[] {
  return sheet.cells[rowIndex - 1] ?? [];
}

function cell(row: string[], colIdx: number): string {
  if (colIdx < 0) return '';
  return (row[colIdx] ?? '').trim();
}

function allSameString(vals: string[]): boolean {
  const v = vals.filter((x) => x !== '');
  if (v.length < 2) return false;
  return new Set(v).size === 1;
}

const HEADER_TOKENS = /^(name|serial no|serial number|device model|model|quantity|block|building|floor|ip address|ip|address|subnet|network block|gateway|site \/ use description|uplink|uplink info|up-link switch|up-link switch port|switch port info|switch model|switch name|hostname|status|dns server used|open ports|nslookup domain|os(hardware)|host name|user name|user|tag number|tag|remarks|role|remarks?|notes?|notes|purpose|os|hardware|hardware\/os|serial|location|location\/floor|purpose|remark|remarks)$/i;

function isHeaderVocabularyRow(populated: string[]): boolean {
  if (populated.length === 0) return false;
  return populated.every((v) => HEADER_TOKENS.test(v.trim()));
}

function isSkipRow(sheet: WorkbookSheet, rowIndex: number, panelCols: number[]): boolean {
  const row = getRow(sheet, rowIndex);
  const populated = row.filter((v) => v !== '');
  if (populated.length === 0) return true;
  if (allSameString(populated)) return true;
  if (isHeaderVocabularyRow(populated)) return true;
  const panelVals = panelCols.map((c) => cell(row, c)).filter((v) => v !== '');
  if (panelVals.length >= 2 && isSectionTitleRow(row, panelCols)) return true;
  return false;
}

export function autoDetectIpCol(sheet: WorkbookSheet, dataStart: number, panelCols: number[]): number {
  let best = -1;
  let bestRate = 0;
  for (const c of panelCols) {
    let hits = 0;
    let total = 0;
    for (let r = dataStart; r <= sheet.rowCount; r++) {
      const row = getRow(sheet, r);
      const v = cell(row, c);
      if (v === '') continue;
      total++;
      if (parseIps(v).length > 0) hits++;
    }
    const rate = total > 0 ? hits / total : 0;
    if (rate <= 0) continue;
    if (best < 0 || rate > bestRate || (rate === bestRate && c < best)) {
      bestRate = rate;
      best = c;
    }
  }
  return best;
}

const STATUS_TOKENS = new Set(['active', 'inactive', 'quarantine', 'standby', 'unknown', 'pend', 'na', 'n/a', 'processing', 'pending']);

function looksLikeName(t: string): boolean {
  if (!t) return false;
  const trimmed = t.trim();
  if (trimmed.length < 3) return false;
  if (parseIps(trimmed).length > 0) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (STATUS_TOKENS.has(trimmed.toLowerCase())) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  if (/^[0-9.,;:!?\-_\s]+$/.test(trimmed)) return false;
  return true;
}

function nameCellFor(sheet: WorkbookSheet, row: string[], panelCols: number[], expectedNameCol: number, noFallback = false): { raw: string; source: string } {
  const v = cell(row, expectedNameCol);
  if (v && looksLikeName(v)) return { raw: v, source: `col${expectedNameCol + 1} (configured)` };
  if (noFallback) return { raw: v ? v : '', source: v ? `col${expectedNameCol + 1} (configured)` : '' };
  for (const c of panelCols) {
    if (c === expectedNameCol) continue;
    const t = cell(row, c);
    if (looksLikeName(t)) return { raw: t, source: `col${c + 1} (auto-detected)` };
  }
  // last resort: a config-configured cell even if it fails the heuristic
  if (v) return { raw: v, source: `col${expectedNameCol + 1} (configured, low-confidence)` };
  return { raw: '', source: '' };
}

/** Resolve neighbor columns for a HQ-style sheet. Returns null ip when neighbor is unknown. */
export function parseNeighborBlocks(
  sheet: WorkbookSheet,
  sheetFile: string,
  dataStart: number,
  opts: {
    localNameCol: number;
    localModelCol: number;
    localSerialCol: number;
    localTagCol: number;
    localIpCol: number;
    localPortCol: number;
    localAllowedCol: number;
    localLocationCol: number;
    localRemarksCol: number;
    neighborNameCol: number;
    neighborModelCol: number;
    neighborSerialCol: number;
    neighborTagCol: number;
    neighborIpCol: number;
    neighborPortCol: number;
    neighborAllowedCol: number;
  }
): ParsedSheet {
  const warnings: string[] = [];
  const records: RawRecord[] = [];
  const localCols = [opts.localNameCol, opts.localModelCol, opts.localSerialCol, opts.localTagCol, opts.localIpCol, opts.localPortCol, opts.localAllowedCol, opts.localLocationCol].filter((c) => c >= 0);
  const neighborCols = [opts.neighborNameCol, opts.neighborModelCol, opts.neighborSerialCol, opts.neighborTagCol, opts.neighborIpCol, opts.neighborPortCol, opts.neighborAllowedCol].filter((c) => c >= 0);

  const localDetected = autoDetectIpCol(sheet, dataStart, localCols);
  const neighborDetected = autoDetectIpCol(sheet, dataStart, neighborCols);
  if (localDetected < 0) {
    warnings.push(`sheet "${sheet.name}": no local IP column detected — sheet skipped`);
    return { sheetName: sheet.name, sheetFile, records, warnings };
  }
  if (localDetected !== opts.localIpCol) {
    warnings.push(`sheet "${sheet.name}": local IP detected col ${localDetected + 1} vs configured col ${opts.localIpCol + 1} (using detected)`);
  }
  if (neighborDetected >= 0 && neighborDetected !== opts.neighborIpCol) {
    warnings.push(`sheet "${sheet.name}": neighbor IP detected col ${neighborDetected + 1} vs configured col ${opts.neighborIpCol + 1} (using detected)`);
  }
  if (opts.neighborIpCol >= 0 && neighborDetected < 0) {
    warnings.push(`sheet "${sheet.name}": no neighbor IP column detected (name-based edges only)`);
  }

  const neighborIpCol = neighborDetected >= 0 ? neighborDetected : -1;
  const localIpCol = localDetected;

  for (let r = dataStart; r <= sheet.rowCount; r++) {
    const row = getRow(sheet, r);
    if (isSkipRow(sheet, r, [localIpCol])) continue;
    const localCell = cell(row, localIpCol);
    if (!localCell) continue;
    const localIps = parseIps(localCell);
    if (localIps.length === 0) continue;

    const nameRes = nameCellFor(sheet, row, localCols, opts.localNameCol);
    const rawName = nameRes.raw;
    const name = cleanName(rawName).cleaned || null;

    const neighborCell = opts.neighborNameCol >= 0 ? cell(row, opts.neighborNameCol) : '';
    const neighborName = cleanName(neighborCell).cleaned || null;
    const neighborRaw = neighborCell || null;

    const neighborIps = neighborIpCol >= 0 ? parseIps(cell(row, neighborIpCol)) : [];
    const neighborPort = opts.neighborPortCol >= 0 ? (cell(row, opts.neighborPortCol) || null) : null;
    const neighborModel = opts.neighborModelCol >= 0 ? (cell(row, opts.neighborModelCol) || null) : null;
    const neighborSerial = opts.neighborSerialCol >= 0 ? (cell(row, opts.neighborSerialCol) || null) : null;

    const port = opts.localPortCol >= 0 ? (cell(row, opts.localPortCol) || null) : null;
    const serial = opts.localSerialCol >= 0 ? (cell(row, opts.localSerialCol) || null) : null;
    const model = opts.localModelCol >= 0 ? (cell(row, opts.localModelCol) || null) : null;
    const location = opts.localLocationCol >= 0 ? (cell(row, opts.localLocationCol) || null) : null;
    const tag = opts.localTagCol >= 0 ? (cell(row, opts.localTagCol) || null) : null;
    const remarks = opts.localRemarksCol >= 0 ? (cell(row, opts.localRemarksCol) || null) : null;

    const rec: RawRecord = {
      sourceFile: sheetFile,
      sourceSheet: sheet.name,
      sourceRow: r,
      block: location ?? null,
      name,
      rawName: rawName || null,
      ips: localIps,
      kind: 'device',
      networkPurpose: null,
      location: location ?? null,
      serial,
      model,
      tag,
      neighborName,
      neighborRaw,
      neighborIps,
      secondaryIps: [],
      port,
      neighborPort,
      remarks,
      raw: {
        nameCell: nameRes.raw,
        ipCell: localCell,
        location: location ?? '',
        serial: serial ?? '',
        model: model ?? '',
        tag: tag ?? '',
        remarks: remarks ?? '',
        neighborName: neighborCell,
        neighborModel: neighborModel ?? '',
        neighborSerial: neighborSerial ?? '',
        neighborPort: neighborPort ?? '',
        nameSource: nameRes.source,
      },
    };
    records.push(rec);
  }
  return { sheetName: sheet.name, sheetFile, records, warnings };
}

interface PanelRowOpts {
  sheet: WorkbookSheet;
  sheetFile: string;
  rowIndex: number;
  row: string[];
  panelCols: number[];
  expectedNameCol: number;
  kind: RecordKind;
  block: string | null;
  location: string | null;
  serial: string | null;
  model: string | null;
  remarks: string | null;
  hostname: string | null;
  status: string | null;
  dns: string | null;
  openPorts: string | null;
  purpose: string | null;
  vlans: string | null;
  os: string | null;
  noFallback?: boolean;
}

function parsePanelRow(o: PanelRowOpts): RawRecord | null {
  // primary IP cell = first populated IP-bearing column in the panel
  let ipCell = '';
  for (const c of o.panelCols) {
    const v = cell(o.row, c);
    if (v && parseIps(v).length > 0) {
      ipCell = v;
      break;
    }
  }
  if (!ipCell) return null;
  const primaryIps = parseIps(ipCell);
  if (primaryIps.length === 0) return null;

  const nameRes = nameCellFor(o.sheet, o.row, o.panelCols, o.expectedNameCol, o.noFallback ?? false);
  let name = cleanName(nameRes.raw).cleaned || null;
  if (!name && o.hostname) name = cleanName(o.hostname.replace(/\./g, ' ')).cleaned || null;

  // extra IPs: all other IP-bearing columns (e.g. gateway col next to network block)
  const extraIps: NormalizedIp[] = [];
  for (const c of o.panelCols) {
    const v = cell(o.row, c);
    if (!v) continue;
    if (v === ipCell) continue;
    for (const p of parseIps(v)) extraIps.push({ ...p, raw: v });
  }
  // dedup extraIps against primary
  const primarySet = new Set(primaryIps.map((p) => `${p.family}|${p.ip}|${p.prefix ?? ''}|${p.port ?? ''}`));
  const extraIpsFiltered = extraIps.filter((p) => !primarySet.has(`${p.family}|${p.ip}|${p.prefix ?? ''}|${p.port ?? ''}`));

  const rec: RawRecord = {
    sourceFile: o.sheetFile,
    sourceSheet: o.sheet.name,
    sourceRow: o.rowIndex,
    block: o.block,
    name,
    rawName: nameRes.raw || o.hostname || null,
    ips: primaryIps,
    kind: o.kind,
    networkPurpose: o.purpose,
    location: o.location,
    serial: o.serial,
    model: o.model,
    tag: null,
    neighborName: null,
    neighborRaw: null,
    neighborIps: [],
    secondaryIps: extraIpsFiltered,
    port: null,
    neighborPort: null,
    remarks: o.remarks,
    raw: {
      nameCell: nameRes.raw,
      ipCell,
      hostname: o.hostname ?? '',
      status: o.status ?? '',
      dns: o.dns ?? '',
      openPorts: o.openPorts ?? '',
      os: o.os ?? '',
      remarks: o.remarks ?? '',
      serial: o.serial ?? '',
      model: o.model ?? '',
      location: o.location ?? '',
      block: o.block ?? '',
      VLAN: o.vlans ?? '',
      purpose: o.purpose ?? '',
      nameSource: nameRes.source,
    },
  };
  if (o.os) {
    rec.model = o.os; // host sheets: keep OS/hardware evidence as the "model"
  }
  return rec;
}

export function parsePanel(
  sheet: WorkbookSheet,
  sheetFile: string,
  dataStart: number,
  spec: PanelSpec
): ParsedSheet {
  const warnings: string[] = [];
  const records: RawRecord[] = [];
  const detected = autoDetectIpCol(sheet, dataStart, spec.panelCols);
  if (detected < 0) {
    if (spec.kind === 'serial') {
      // serial sheets carry no IPs: produce records with empty IP lists
      for (let r = dataStart; r <= sheet.rowCount; r++) {
        if (isSkipRow(sheet, r, spec.panelCols)) continue;
        const row = getRow(sheet, r);
        let serial = spec.serialCol !== undefined ? (cell(row, spec.serialCol) || null) : null;
        let model = spec.modelCol !== undefined ? (cell(row, spec.modelCol) || null) : null;
        const HEADER_LEAKAGE = /(serial no|device model|quantity|name)/i;
        if (serial && HEADER_LEAKAGE.test(serial) && /^[a-z0-9][a-z0-9 ]{2,}$/i.test(serial) && !/^[A-Z0-9]{6,}$/i.test(serial)) serial = null;
        if (model && HEADER_LEAKAGE.test(model)) model = null;
        const block = spec.block ?? null;
        const nameRes = nameCellFor(sheet, row, spec.panelCols, spec.nameCol);
        // a legitimate device name could be 'Name' — but it is not possible in practice
        const name = cleanName(nameRes.raw).cleaned || null;
        if (!name) continue;
        records.push({
          sourceFile: sheetFile, sourceSheet: sheet.name, sourceRow: r,
          block, name, rawName: nameRes.raw || null, ips: [], kind: 'serial',
          networkPurpose: null, location: null, serial, model, tag: null,
          neighborName: null, neighborRaw: null, neighborIps: [], secondaryIps: [],
          port: null, neighborPort: null, remarks: null,
          raw: { nameCell: nameRes.raw, ipCell: '', serial: serial ?? '', model: model ?? '', nameSource: nameRes.source },
        });
      }
      return { sheetName: sheet.name, sheetFile, records, warnings };
    }
    warnings.push(`sheet "${sheet.name}": no column in panel cols ${spec.panelCols.join(',')} parses to IPs — panel skipped`);
    return { sheetName: sheet.name, sheetFile, records, warnings };
  }

  for (let r = dataStart; r <= sheet.rowCount; r++) {
    if (isSkipRow(sheet, r, spec.panelCols)) continue;
    const row = getRow(sheet, r);
    const block = spec.block ?? (spec.blockTagCol !== undefined ? cell(row, spec.blockTagCol) || null : null);
    const serial = spec.serialCol !== undefined ? (cell(row, spec.serialCol) || null) : null;
    const model = spec.modelCol !== undefined ? (cell(row, spec.modelCol) || null) : null;
    const hostname = spec.hostnameCol !== undefined ? (cell(row, spec.hostnameCol) || null) : null;
    const status = spec.statusCol !== undefined ? (cell(row, spec.statusCol) || null) : null;
    const dns = spec.dnsCol !== undefined ? (cell(row, spec.dnsCol) || null) : null;
    const openPorts = spec.openPortsCol !== undefined ? (cell(row, spec.openPortsCol) || null) : null;
    const purpose = spec.purposeCol !== undefined ? (cell(row, spec.purposeCol) || null) : null;
    const location = spec.locationCol !== undefined ? (cell(row, spec.locationCol) || null) : null;
    const vlans = spec.vlansCol !== undefined ? (cell(row, spec.vlansCol) || null) : null;
    const remarks = spec.remarksCol !== undefined ? (cell(row, spec.remarksCol) || null) : null;
    const os = spec.osCol !== undefined ? (cell(row, spec.osCol) || null) : null;

    const rec = parsePanelRow({
      sheet, sheetFile, rowIndex: r, row, panelCols: spec.panelCols,
      expectedNameCol: spec.nameCol, kind: spec.kind, block, location, serial, model,
      remarks, hostname, status, dns, openPorts, purpose, vlans, os,
      noFallback: spec.noFallback,
    });
    if (rec) records.push(rec);
  }
  return { sheetName: sheet.name, sheetFile, records, warnings };
}

export interface SheetOutput extends ParsedSheet {
  ok: boolean;
}

/**
 * Resolve the panel/block list for a specific sheet by name.
 * This is the explicit wiring from sheet -> geometry; the IP column itself is
 * AUTO-DETECTED inside parsePanel / parseNeighborBlocks.
 */
export function parseSheet(sheet: WorkbookSheet, sheetFile: string, spec: SheetSpec): SheetOutput {
  const warnings: string[] = [];
  const records: RawRecord[] = [];

  if (spec.kind === 'skip') {
    warnings.push(`sheet "${spec.name}": skipped by config (empty/unusable — header row only)`);
    return { sheetName: sheet.name, sheetFile, records, warnings, ok: false };
  }

  if (spec.kind === 'hq') {
    if (!spec.hq) {
      warnings.push(`sheet "${spec.name}": HQ kind but no hq config`);
      return { sheetName: sheet.name, sheetFile, records, warnings, ok: false };
    }
    const parsed = parseNeighborBlocks(sheet, sheetFile, spec.dataStart, {
      localNameCol: spec.hq.localNameCol,
      localModelCol: spec.hq.localModelCol,
      localSerialCol: spec.hq.localSerialCol,
      localTagCol: spec.hq.localTagCol,
      localIpCol: spec.hq.localIpCol,
      localPortCol: spec.hq.localPortCol,
      localAllowedCol: spec.hq.localAllowedCol,
      localLocationCol: spec.hq.localLocationCol,
      localRemarksCol: spec.hq.localRemarksCol,
      neighborNameCol: spec.hq.neighborNameCol,
      neighborModelCol: spec.hq.neighborModelCol,
      neighborSerialCol: spec.hq.neighborSerialCol,
      neighborTagCol: spec.hq.neighborTagCol,
      neighborIpCol: spec.hq.neighborIpCol,
      neighborPortCol: spec.hq.neighborPortCol,
      neighborAllowedCol: spec.hq.neighborAllowedCol,
    });
    // fix: localIpCol config hint should actually be a placeholder; detection takes over
    warnings.push(...parsed.warnings);
    records.push(...parsed.records);
    return { sheetName: sheet.name, sheetFile, records, warnings, ok: true };
  }

  // panels kind
  if (!spec.panels.length) {
    warnings.push(`sheet "${spec.name}": panels kind but no panels config`);
    return { sheetName: sheet.name, sheetFile, records, warnings, ok: false };
  }
  for (const panel of spec.panels) {
    const parsed = parsePanel(sheet, sheetFile, spec.dataStart, panel);
    warnings.push(...parsed.warnings);
    records.push(...parsed.records);
  }
  return { sheetName: sheet.name, sheetFile, records, warnings, ok: true };
}
