/**
 * @file src/lib/rent-roll/tsv-parser.ts
 * @description WP-P3-03: Multi-cell TSV clipboard paste parser, unit mistake warning,
 * and Korean currency readout for CRE R1 Rent Roll.
 */

import { parseLeaseExpiryDate } from './date-parser';

export type RentRollStatus = 'occupied' | 'vacant' | 'owner';

export interface RentRollRowItem {
  id: string;
  floor: string;
  unit: string;
  use: string;
  depositManwon: number;
  monthlyRentManwon: number;
  maintenanceManwon: number;
  leaseExpiry: string;
  normalizedExpiry?: string;
  isExpired?: boolean;
  status: RentRollStatus;
  unitMistakeWarning?: string;
}

export interface ParsedTsvResult {
  rows: RentRollRowItem[];
  hasUnitMistakes: boolean;
  totalDepositManwon: number;
  totalMonthlyRentManwon: number;
  totalMaintenanceManwon: number;
  summaryMessage: string;
}

/**
 * Parses raw text containing currency or number into manwon (10,000 KRW).
 * Handles:
 * - "1억" -> 10,000
 * - "1.5억" -> 15,000
 * - "5,000만" -> 5,000
 * - "5000" -> 5,000
 * - "50,000,000" (raw KRW) -> 5,000 (detected unit mistake)
 */
export function parseManwonAmount(input: string | number | null | undefined): {
  manwon: number;
  isSuspiciousUnitMistake: boolean;
} {
  if (input === null || input === undefined || input === '') {
    return { manwon: 0, isSuspiciousUnitMistake: false };
  }

  if (typeof input === 'number') {
    if (isNaN(input)) return { manwon: 0, isSuspiciousUnitMistake: false };
    if (input >= 100000) {
      // e.g. 50,000,000 entered as number
      return {
        manwon: Math.round(input / 10000),
        isSuspiciousUnitMistake: true,
      };
    }
    return { manwon: Math.round(input), isSuspiciousUnitMistake: false };
  }

  const str = String(input).trim().replace(/,/g, '');
  if (!str || str === '-' || str === '0') {
    return { manwon: 0, isSuspiciousUnitMistake: false };
  }

  // Check Korean combined units like "1억 5000만" or "1.5억" or "5000만"
  let eok = 0;
  let man = 0;

  const eokMatch = str.match(/([\d.]+)\s*억/);
  if (eokMatch) {
    const eokVal = parseFloat(eokMatch[1]);
    eok = isNaN(eokVal) ? 0 : eokVal * 10000;
  }

  const manMatch = str.match(/([\d.]+)\s*만(?:원)?/);
  if (manMatch) {
    const manVal = parseFloat(manMatch[1]);
    man = isNaN(manVal) ? 0 : manVal;
  }

  if (eokMatch || manMatch) {
    const total = Math.round(eok + man);
    return { manwon: total, isSuspiciousUnitMistake: false };
  }

  // Pure numeric string
  const numVal = parseFloat(str);
  if (isNaN(numVal)) {
    return { manwon: 0, isSuspiciousUnitMistake: false };
  }

  // Unit mistake detection:
  // In Korea, standard CRE input expects manwon (e.g. 5000 for 5,000만원).
  // If user copied raw KRW numbers >= 100,000 (e.g. 50,000,000 for deposit or 3,000,000 for rent),
  // they entered in '원' rather than '만원'.
  if (numVal >= 100000) {
    return {
      manwon: Math.round(numVal / 10000),
      isSuspiciousUnitMistake: true,
    };
  }

  return { manwon: Math.round(numVal), isSuspiciousUnitMistake: false };
}

/**
 * Formats manwon amount into readable Korean currency string with '= ' prefix.
 * e.g.
 * 0 -> "= 0원"
 * 5000 -> "= 5,000만 원"
 * 12000 -> "= 1억 2,000만 원"
 * 100000 -> "= 10억 원"
 */
export function formatKoreanCurrencyReadout(manwon: number): string {
  if (!manwon || isNaN(manwon) || manwon <= 0) {
    return '= 0원';
  }

  const eok = Math.floor(manwon / 10000);
  const remMan = manwon % 10000;

  if (eok > 0 && remMan > 0) {
    return `= ${eok}억 ${remMan.toLocaleString()}만 원`;
  }
  if (eok > 0) {
    return `= ${eok}억 원`;
  }
  return `= ${remMan.toLocaleString()}만 원`;
}

/**
 * Parses multi-cell TSV / tab-delimited text copied from Excel or Google Sheets.
 */
export function parseTsvRentRoll(tsvText: string, startIdIndex: number = 1): ParsedTsvResult {
  const lines = tsvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      rows: [],
      hasUnitMistakes: false,
      totalDepositManwon: 0,
      totalMonthlyRentManwon: 0,
      totalMaintenanceManwon: 0,
      summaryMessage: '붙여넣을 데이터가 없습니다.',
    };
  }

  // Check if first row is header row
  let startIndex = 0;
  const firstCells = lines[0].split('\t').map((c) => c.trim().toLowerCase());
  const firstCell = firstCells[0] || '';
  const isDataFloor = /^(?:지하\s*\d+|\d+\s*층|[bB]?\d+[fF]?|\d+호)/.test(firstCell);

  if (!isDataFloor) {
    const isHeaderRow = firstCells.some((c) =>
      c === '층' ||
      c === '층수' ||
      c === '구분' ||
      c === 'floor' ||
      c === '호수' ||
      c === '호' ||
      c === 'unit' ||
      c === '보증금' ||
      c === '월세' ||
      c === '임대료' ||
      c === 'deposit' ||
      c === 'rent'
    );
    if (isHeaderRow) {
      startIndex = 1;
    }
  }

  const rows: RentRollRowItem[] = [];
  let hasUnitMistakes = false;

  for (let i = startIndex; i < lines.length; i++) {
    const cells = lines[i].split('\t').map((c) => c.trim());
    if (cells.length === 0 || cells.every((c) => !c)) continue;

    // Mapping columns:
    // Pattern A (standard 7-8 cols): 층 | 호수 | 용도 | 보증금 | 월세 | 관리비 | 만기일 | 상태
    // Pattern B (6 cols): 층 | 용도 | 보증금 | 월세 | 관리비 | 만기일
    // Pattern C (5 cols): 층 | 보증금 | 월세 | 관리비 | 만기일
    let floor = '';
    let unit = '';
    let use = '';
    let rawDeposit = '';
    let rawRent = '';
    let rawMaintenance = '';
    let rawExpiry = '';
    let rawStatus = '';

    if (cells.length >= 7) {
      floor = cells[0];
      unit = cells[1];
      use = cells[2];
      rawDeposit = cells[3];
      rawRent = cells[4];
      rawMaintenance = cells[5];
      rawExpiry = cells[6];
      rawStatus = cells[7] || '';
    } else if (cells.length === 6) {
      floor = cells[0];
      use = cells[1];
      rawDeposit = cells[2];
      rawRent = cells[3];
      rawMaintenance = cells[4];
      rawExpiry = cells[5];
    } else if (cells.length === 5) {
      floor = cells[0];
      rawDeposit = cells[1];
      rawRent = cells[2];
      rawMaintenance = cells[3];
      rawExpiry = cells[4];
    } else {
      floor = cells[0] || `${i + 1}F`;
      rawDeposit = cells[1] || '0';
      rawRent = cells[2] || '0';
      rawMaintenance = cells[3] || '0';
    }

    // Status resolution
    let status: RentRollStatus = 'occupied';
    const statusText = (rawStatus || use || '').toLowerCase();
    if (statusText.includes('공실') || statusText.includes('vacant')) {
      status = 'vacant';
    } else if (statusText.includes('자가') || statusText.includes('사옥') || statusText.includes('owner')) {
      status = 'owner';
    }

    const parsedDep = parseManwonAmount(rawDeposit);
    const parsedRent = parseManwonAmount(rawRent);
    const parsedMaint = parseManwonAmount(rawMaintenance);

    let unitMistakeWarning: string | undefined;
    if (parsedDep.isSuspiciousUnitMistake || parsedRent.isSuspiciousUnitMistake || parsedMaint.isSuspiciousUnitMistake) {
      hasUnitMistakes = true;
      unitMistakeWarning = '원 단위 금액이 감지되어 만 원 단위로 자동 변환되었습니다.';
    }

    const expiryResult = parseLeaseExpiryDate(rawExpiry);

    rows.push({
      id: `rr-${startIdIndex + rows.length}`,
      floor: normalizeFloorName(floor || `${rows.length + 1}F`),
      unit: unit || `${rows.length + 1}호`,
      use: status === 'vacant' ? '공실' : (use || '근린생활시설'),
      depositManwon: parsedDep.manwon,
      monthlyRentManwon: status === 'vacant' ? 0 : parsedRent.manwon,
      maintenanceManwon: status === 'vacant' ? 0 : parsedMaint.manwon,
      leaseExpiry: rawExpiry,
      normalizedExpiry: expiryResult.normalized,
      isExpired: expiryResult.isExpired,
      status,
      unitMistakeWarning,
    });
  }

  const totalDepositManwon = rows.reduce((sum, r) => sum + (r.depositManwon || 0), 0);
  const totalMonthlyRentManwon = rows.reduce((sum, r) => sum + (r.monthlyRentManwon || 0), 0);
  const totalMaintenanceManwon = rows.reduce((sum, r) => sum + (r.maintenanceManwon || 0), 0);

  const summaryMessage = `${rows.length}개 층 행이 파싱되었습니다.${
    hasUnitMistakes ? ' (원 단위 의심 금액 자동 보정됨)' : ''
  }`;

  return {
    rows,
    hasUnitMistakes,
    totalDepositManwon,
    totalMonthlyRentManwon,
    totalMaintenanceManwon,
    summaryMessage,
  };
}

/**
 * Normalizes floor string: e.g. "지하1층" -> "B1", "1층" -> "1F", "b1" -> "B1"
 */
export function normalizeFloorName(str: string): string {
  const trimmed = str.trim();
  if (/^b?\d+f?$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const basementMatch = trimmed.match(/지하\s*(\d+)/);
  if (basementMatch) {
    return `B${basementMatch[1]}`;
  }
  const floorMatch = trimmed.match(/(\d+)\s*층/);
  if (floorMatch) {
    return `${floorMatch[1]}F`;
  }
  return trimmed;
}
