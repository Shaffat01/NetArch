/**
 * Workbook loading + cell matrix extraction (exceljs).
 */
import ExcelJS from 'exceljs';
import { cellText, cleanWhitespace } from '../normalize/cell.js';

export interface WorkbookSheet {
  name: string;
  /** rows[r][c] = cleaned cell text ('' when empty). 0-indexed cols. */
  cells: string[][];
  /** original raw values (for hyperlink object detection) — parallel to cells. */
  rawCells: unknown[][];
  rowCount: number;
  colCount: number;
}

export interface LoadedWorkbook {
  file: string;
  sheets: WorkbookSheet[];
  totalRows: number;
}

async function loadOne(xlsxPath: string): Promise<LoadedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const file = xlsxPath.split('/').pop() ?? xlsxPath;
  const sheets: WorkbookSheet[] = [];
  for (const ws of wb.worksheets) {
    const rowCount = ws.rowCount;
    const colCount = ws.columnCount;
    const cells: string[][] = [];
    const rawCells: unknown[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const rowText: string[] = new Array(colCount).fill('');
      const rowRaw: unknown[] = new Array(colCount).fill(null);
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const v = cell.value;
        rowRaw[col - 1] = v;
        const t = cellText(v);
        if (t) rowText[col - 1] = cleanWhitespace(t);
      });
      cells.push(rowText);
      rawCells.push(rowRaw);
    }
    sheets.push({ name: ws.name, cells, rawCells, rowCount, colCount });
  }
  const totalRows = sheets.reduce((a, s) => a + s.rowCount, 0);
  return { file, sheets, totalRows };
}

export async function loadWorkbook(xlsxPath: string): Promise<LoadedWorkbook> {
  return loadOne(xlsxPath);
}

/**
 * True when the row is a "banner"/"section"/"title" row — i.e. nearly all populated
 * cells hold the same text ("DATA CENTER CORE DEVICE" across 7 columns).
 */
export function isBannerRow(row: string[]): boolean {
  const vals = row.filter((c) => c !== '');
  if (vals.length < 2) return false;
  const first = vals[0];
  const same = vals.every((v) => v === first);
  return same && new Set(vals).size === 1;
}

/**
 * True when the row is a horizontal "section title" row: every populated cell in a
 * panel range holds the same text and the row marks a sub-section (e.g. NDC_Core SW in
 * row 6 of Data Center Devices). Caller passes the columns of the panel to check.
 */
export function isSectionTitleRow(row: string[], panelCols: number[]): boolean {
  const vals = panelCols.map((c) => row[c]).filter((v) => v !== '');
  if (vals.length < 2) return false;
  return new Set(vals).size === 1;
}
