/**
 * Sheet -> geometry config.
 *
 * Each sheet maps to a SheetSpec. IP columns are NOT hardcoded here; they are
 * auto-detected inside the parser (validated against these hints).
 * Column indexes are 0-indexed.
 */
import type { SheetSpec } from './sheets.js';

/** HQ register sheets: 1 banner row each; local+neighbor blocks per row. */
const HQ_ACCESS_LIKE = {
  kind: 'hq' as const,
  dataStart: 4,
  headerRow: 3,
  bannerRows: 2,
};

export const SHEET_SPECS_HQ: SheetSpec[] = [
  {
    name: 'Distribution Device ',
    ...HQ_ACCESS_LIKE,
    panels: [],
    hq: {
      localNameCol: 2,     // c3 Switch Name
      localModelCol: 3,    // c4 Model
      localSerialCol: 4,   // c5 Serial Number
      localTagCol: 5,      // c6 Tag Number
      localPortCol: 7,     // c8 Uplink Port
      localAllowedCol: 8,  // c9 Allowed VLAN/Trunk
      localLocationCol: 1, // c2 Location
      localRemarksCol: 16, // c17 Remarks
      neighborNameCol: 11, // c12 Device Name
      neighborModelCol: 13,// c14 Model
      neighborSerialCol: 12, // c13 Serial Number
      neighborTagCol: 14,  // c15 Tag Number
      neighborIpCol: 15,  // c16 Mgmt IP (expected; auto-detected)
      neighborPortCol: 9,  // c10 Connceted Port
      neighborAllowedCol: 10, // c11 Allowed Vlan/ Trunk
      localIpCol: 6,      // c7 Mgmt IP (expected; auto-detected)
    },
  },
  {
    name: 'Access SW',
    ...HQ_ACCESS_LIKE,
    panels: [],
    hq: {
      localNameCol: 2,
      localModelCol: 3,
      localSerialCol: 4,
      localTagCol: 5,
      localPortCol: 7,
      localAllowedCol: 8,
      localLocationCol: 1,
      localRemarksCol: 16,
      neighborNameCol: 11,
      neighborModelCol: 13,
      neighborSerialCol: 12,
      neighborTagCol: 14,
      neighborIpCol: 15,
      neighborPortCol: 9,
      neighborAllowedCol: 10,
      localIpCol: 6,
    },
  },
  {
    name: 'Core Device',
    ...HQ_ACCESS_LIKE,
    panels: [],
    hq: {
      localNameCol: 2,
      localModelCol: 3,
      localSerialCol: 4,
      localTagCol: 5,
      localPortCol: 7,
      localAllowedCol: 8,
      localLocationCol: 1,
      localRemarksCol: 16,
      neighborNameCol: 11,
      neighborModelCol: 13,
      neighborSerialCol: 12,
      neighborTagCol: 14,
      neighborIpCol: 15,
      neighborPortCol: 9,
      neighborAllowedCol: 10,
      localIpCol: 6,
    },
  },
  {
    name: 'New-Acc-Sw-Sheet',
    kind: 'skip',
    dataStart: 2,
    headerRow: 1,
    bannerRows: 0,
    panels: [],
    hq: null,
  },
  {
    name: 'Old-Acc-Sw-Sheet',
    kind: 'hq',
    dataStart: 3,
    headerRow: 2,
    bannerRows: 1,
    panels: [],
    hq: {
      localNameCol: 3,     // c4 Host Name
      localModelCol: 4,    // c5 Switch Model
      localSerialCol: -1,
      localTagCol: -1,
      localPortCol: 8,     // c9 Uplink Info
      localAllowedCol: -1,
      localLocationCol: 6, // c7 Building
      localRemarksCol: 15, // c16 Remarks
      neighborNameCol: 9,  // c10 Up-link Switch
      neighborModelCol: -1,
      neighborSerialCol: -1,
      neighborTagCol: -1,
      neighborIpCol: -1,
      neighborPortCol: 10, // c11 Up-link Switch Port
      neighborAllowedCol: -1,
      localIpCol: 1, // c2 Switch IP (expected; auto-detected)
    },
  },
];

export const SHEET_SPECS_NOC: SheetSpec[] = [
  {
    name: 'WHIL',
    kind: 'panels',
    dataStart: 5,
    headerRow: 4,
    bannerRows: 3,
    panels: [
      {
        panelCols: [0, 1, 2, 3, 4],
        nameCol: 0,
        kind: 'device',
        block: 'WHIL',
        vlansCol: 2,
        locationCol: 3,
        remarksCol: 4,
      },
    ],
    hq: null,
  },
  {
    name: 'WMTC',
    kind: 'panels',
    dataStart: 5,
    headerRow: 4,
    bannerRows: 3,
    panels: [
      {
        panelCols: [0, 1, 2, 3],
        nameCol: 0,
        kind: 'device',
        block: 'WMTC',
        vlansCol: 2,
        locationCol: 3,
      },
    ],
    hq: null,
  },
  {
    name: 'Data Center Devices',
    kind: 'panels',
    dataStart: 7,
    headerRow: 5,
    bannerRows: 2,
    panels: [
      { panelCols: [0, 1, 2], nameCol: 0, kind: 'device', block: 'NDC', vlansCol: 2 },
      { panelCols: [4, 5, 6], nameCol: 4, kind: 'device', block: 'DC', vlansCol: 6 },
    ],
    hq: null,
  },
  {
    name: 'Network BLocks',
    kind: 'panels',
    dataStart: 2,
    headerRow: 1,
    bannerRows: 0,
    panels: [
      {
        panelCols: [1, 2, 3],
        nameCol: 3,
        kind: 'network',
        block: null,
        purposeCol: 3,
        vlansCol: 0,
      },
    ],
    hq: null,
  },
  {
    name: 'CCTV',
    kind: 'panels',
    dataStart: 2,
    headerRow: 1,
    bannerRows: 0,
    panels: [
      {
        panelCols: [0, 2],
        nameCol: 2,
        kind: 'network',
        block: null,
        purposeCol: 2,
        vlansCol: 1,
      },
    ],
    hq: null,
  },
  {
    name: 'WIFI',
    kind: 'panels',
    dataStart: 2,
    headerRow: 1,
    bannerRows: 0,
    panels: [
      {
        panelCols: [0, 2, 3],
        nameCol: 2,
        kind: 'network',
        block: null,
        purposeCol: 2,
        vlansCol: 1,
        remarksCol: 3,
      },
    ],
    hq: null,
  },
  {
    name: 'Machine IT ',
    kind: 'panels',
    dataStart: 2,
    headerRow: 1,
    bannerRows: 0,
    panels: [
      {
        panelCols: [0, 2, 3],
        nameCol: 2,
        kind: 'network',
        block: null,
        purposeCol: 2,
        vlansCol: 1,
        remarksCol: 3,
      },
    ],
    hq: null,
  },
  {
    name: 'DMZ & MZ',
    kind: 'panels',
    dataStart: 3,
    headerRow: 2,
    bannerRows: 1,
    panels: [
      { panelCols: [0, 1, 2], nameCol: 0, kind: 'device', blockTagCol: 2 },
      { panelCols: [4, 5, 6], nameCol: 4, kind: 'device', blockTagCol: 6 },
    ],
    hq: null,
  },
  {
    name: 'Servers hardware IP',
    kind: 'panels',
    dataStart: 2,
    headerRow: 1,
    bannerRows: 0,
    panels: [
      {
        panelCols: [0, 1, 2],
        nameCol: 0,
        kind: 'device',
        block: null,
        osCol: 2,
        remarksCol: -1,
      },
    ],
    hq: null,
  },
  {
    name: 'DMZ & MZ (DC,NDC)',
    kind: 'panels',
    dataStart: 3,
    headerRow: 2,
    bannerRows: 1,
    panels: [
      { panelCols: [1, 2], nameCol: 1, kind: 'device', block: 'DMZ DC' },
      { panelCols: [4, 5], nameCol: 4, kind: 'device', block: 'MZ DC' },
      { panelCols: [8, 9], nameCol: 8, kind: 'device', block: 'MZ NDC' },
    ],
    hq: null,
  },
  {
    name: 'MZ-Block200',
    kind: 'panels',
    dataStart: 3,
    headerRow: 2,
    bannerRows: 1,
    panels: [
      { panelCols: [1, 2], nameCol: 1, kind: 'device', block: 'MZ DC' },
      { panelCols: [4, 5], nameCol: 4, kind: 'device', block: 'MZ NDC' },
    ],
    hq: null,
  },
  {
    name: 'DMZ-Block117',
    kind: 'panels',
    dataStart: 4,
    headerRow: 3,
    bannerRows: 1,
    panels: [
      { panelCols: [1, 2], nameCol: 1, kind: 'device', block: 'DMZ DC' },
      { panelCols: [4, 5], nameCol: 4, kind: 'device', block: 'DMZ NDC' },
    ],
    hq: null,
  },
  {
    name: 'MZ-Block118',
    kind: 'panels',
    dataStart: 4,
    headerRow: 3,
    bannerRows: 1,
    panels: [
      { panelCols: [1, 2], nameCol: 1, kind: 'device', block: 'MZ DC' },
      { panelCols: [4, 5], nameCol: 4, kind: 'device', block: 'MZ NDC' },
    ],
    hq: null,
  },
  {
    name: 'MZ_block 119',
    kind: 'panels',
    dataStart: 3,
    headerRow: 2,
    bannerRows: 1,
    panels: [
      {
        panelCols: [0, 1, 2, 3, 4],
        nameCol: 2, // hostname column
        kind: 'device',
        noFallback: true,
        block: 'MZ NDC',
        hostnameCol: 2,
        statusCol: 1,
        dnsCol: 3,
        openPortsCol: 4,
      },
    ],
    hq: null,
  },
  {
    name: 'DMZ-Block120',
    kind: 'panels',
    dataStart: 3,
    headerRow: 2,
    bannerRows: 1,
    panels: [
      { panelCols: [1, 2], nameCol: 1, kind: 'device', block: 'DMZ DC' },
      { panelCols: [4, 5], nameCol: 4, kind: 'device', block: 'DMZ NDC' },
    ],
    hq: null,
  },
  {
    name: 'DMZ_block 122',
    kind: 'panels',
    dataStart: 3,
    headerRow: 2,
    bannerRows: 1,
    panels: [
      {
        panelCols: [0, 1, 2, 3, 4],
        nameCol: 2,
        kind: 'device',
        noFallback: true,
        block: 'DMZ NDC',
        hostnameCol: 2,
        statusCol: 1,
        dnsCol: 3,
        openPortsCol: 4,
      },
    ],
    hq: null,
  },
  {
    name: 'serial number',
    kind: 'panels',
    dataStart: 4,
    headerRow: 3,
    bannerRows: 1,
    panels: [
      // no IP column; serial evidence merged by name — handled in merge layer
      {
        panelCols: [4, 5, 6, 7],
        nameCol: 4,
        kind: 'serial',
        block: 'DC',
        serialCol: 5,
        modelCol: 6,
      },
    ],
    hq: null,
  },
  {
    name: 'DMZ_block 123',
    kind: 'panels',
    dataStart: 3,
    headerRow: 2,
    bannerRows: 1,
    panels: [
      {
        panelCols: [0, 1, 2, 3, 4],
        nameCol: 2,
        kind: 'device',
        noFallback: true,
        block: 'DMZ NDC',
        hostnameCol: 2,
        statusCol: 1,
        dnsCol: 3,
        openPortsCol: 4,
      },
    ],
    hq: null,
  },
  {
    name: 'MZ-Block-150',
    kind: 'panels',
    dataStart: 3,
    headerRow: 2,
    bannerRows: 1,
    panels: [
      { panelCols: [1, 2], nameCol: 1, kind: 'device', block: 'MZ NDC' },
      { panelCols: [4, 5], nameCol: 4, kind: 'device', block: 'MZ DC' },
    ],
    hq: null,
  },
  {
    name: 'DMZ-Block151',
    kind: 'panels',
    dataStart: 3,
    headerRow: 2,
    bannerRows: 1,
    panels: [
      { panelCols: [1, 2], nameCol: 1, kind: 'device', block: 'DMZ DC' },
    ],
    hq: null,
  },
];

export const ALL_SHEET_SPECS = [...SHEET_SPECS_HQ, ...SHEET_SPECS_NOC];

export function specForSheet(sheetName: string): SheetSpec | undefined {
  return ALL_SHEET_SPECS.find((s) => s.name === sheetName);
}

/**
 * ISP Real IPs workbook: by-site provider network allocations (one /28 each).
 * Layout: Name (site-provider) | Provider | Real IP — one data row per row.
 */
export const SHEET_SPECS_ISP: SheetSpec[] = [
  {
    name: 'Real IPs',
    kind: 'panels',
    dataStart: 2,
    headerRow: 1,
    bannerRows: 0,
    panels: [
      {
        panelCols: [0, 1, 2],
        nameCol: 0,
        kind: 'network',
        remarksCol: 1,
      },
    ],
    hq: null,
  },
];
