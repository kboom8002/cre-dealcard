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
  areaSqm?: number;
  areaPyeong?: number;
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
    if (input >= 250000) {
      // e.g. 50,000,000 or 300,000 entered as raw KRW number
      return {
        manwon: Math.round((input / 10000) * 10) / 10,
        isSuspiciousUnitMistake: true,
      };
    }
    return { manwon: Math.round(input * 10) / 10, isSuspiciousUnitMistake: false };
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
    const total = Math.round((eok + man) * 10) / 10;
    return { manwon: total, isSuspiciousUnitMistake: false };
  }

  // Pure numeric string
  const numVal = parseFloat(str);
  if (isNaN(numVal)) {
    return { manwon: 0, isSuspiciousUnitMistake: false };
  }

  // Unit mistake detection:
  // In Korea, standard CRE input expects manwon (e.g. 5000 for 5,000만원, 130000 for 13억).
  // If user copied raw KRW numbers >= 250,000 (e.g. 50,000,000 for deposit, 3,500,000 for rent, 300,000 for maint),
  // they entered in '원' rather than '만원'.
  if (numVal >= 250000) {
    return {
      manwon: Math.round((numVal / 10000) * 10) / 10,
      isSuspiciousUnitMistake: true,
    };
  }

  return { manwon: Math.round(numVal * 10) / 10, isSuspiciousUnitMistake: false };
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

function splitClipboardRow(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed.includes('\t')) {
    return trimmed.split('\t').map((c) => c.trim().replace(/\*\*/g, ''));
  }
  if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
    return trimmed
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim().replace(/\*\*/g, '').replace(/`/g, ''));
  }
  if (trimmed.includes(',')) {
    return trimmed.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  }
  return [trimmed];
}

function isMarkdownSeparatorLine(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function isSummaryRow(cells: string[]): boolean {
  const firstTwo = `${cells[0] || ''} ${cells[1] || ''}`.replace(/\s+/g, '');
  return /^(합계|소계|총계|total|만실시총계)/i.test(firstTwo);
}

/**
 * Parses multi-cell TSV / CSV / Markdown table text copied from Excel, Google Sheets, or Guide Docs.
 */
export function parseTsvRentRoll(tsvText: string, startIdIndex: number = 1): ParsedTsvResult {
  const rawLines = tsvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const lines = rawLines.filter((l) => {
    const cells = splitClipboardRow(l);
    return !isMarkdownSeparatorLine(cells);
  });

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
  const firstCells = splitClipboardRow(lines[0]).map((c) => c.toLowerCase());
  const firstCell = firstCells[0] || '';
  const isDataFloor = /^(?:지하\s*\d+|\d+\s*층|[bB]?\d+[fF]?|\d+호)/.test(firstCell);

  let headerMap: {
    floorIdx?: number;
    unitIdx?: number;
    useIdx?: number;
    tenantIdx?: number;
    areaSqmIdx?: number;
    areaPyIdx?: number;
    depositIdx?: number;
    rentIdx?: number;
    maintIdx?: number;
    expiryIdx?: number;
    statusIdx?: number;
  } | null = null;

  if (!isDataFloor) {
    const isHeaderRow = firstCells.some(
      (c) =>
        c === '층' ||
        c === '층수' ||
        c === '구분' ||
        c === 'floor' ||
        c === '호수' ||
        c === '호' ||
        c === 'unit' ||
        c.includes('보증금') ||
        c.includes('월세') ||
        c.includes('임대료') ||
        c === 'deposit' ||
        c === 'rent'
    );
    if (isHeaderRow) {
      startIndex = 1;
      headerMap = {};
      firstCells.forEach((col, idx) => {
        if (headerMap!.floorIdx === undefined && (col === '층' || col === '층수' || col === '구분' || col === 'floor')) {
          headerMap!.floorIdx = idx;
        } else if (headerMap!.unitIdx === undefined && (col === '호수' || col === '호' || col === '호실' || col === 'unit')) {
          headerMap!.unitIdx = idx;
        } else if (headerMap!.useIdx === undefined && (col === '용도' || col === '업종' || col === 'use')) {
          headerMap!.useIdx = idx;
        } else if (headerMap!.tenantIdx === undefined && (col.includes('임차인') || col === '상호' || col === 'tenant')) {
          headerMap!.tenantIdx = idx;
        } else if (headerMap!.areaSqmIdx === undefined && (col.includes('㎡') || col.includes('m2') || col.includes('제곱'))) {
          headerMap!.areaSqmIdx = idx;
        } else if (headerMap!.areaPyIdx === undefined && (col.includes('면적(평)') || col.includes('전용(평)') || col.includes('계약면적(평)') || col === '평')) {
          headerMap!.areaPyIdx = idx;
        } else if (headerMap!.depositIdx === undefined && (col.includes('보증금') || col === 'deposit')) {
          headerMap!.depositIdx = idx;
        } else if (headerMap!.rentIdx === undefined && (col.includes('임대료') || col.includes('월세') || col === 'rent')) {
          headerMap!.rentIdx = idx;
        } else if (headerMap!.maintIdx === undefined && (col.includes('관리비') || col === 'maintenance' || col === 'cam')) {
          headerMap!.maintIdx = idx;
        } else if (headerMap!.expiryIdx === undefined && (col.includes('만기') || col.includes('계약기간') || col.includes('expiry'))) {
          headerMap!.expiryIdx = idx;
        } else if (headerMap!.statusIdx === undefined && (col.includes('상태') || col.includes('비고') || col.includes('안내') || col === 'status')) {
          headerMap!.statusIdx = idx;
        }
      });
    }
  }

  const rows: RentRollRowItem[] = [];
  let hasUnitMistakes = false;

  for (let i = startIndex; i < lines.length; i++) {
    const cells = splitClipboardRow(lines[i]);
    if (cells.length === 0 || cells.every((c) => !c)) continue;
    if (isSummaryRow(cells)) continue;

    let floor = '';
    let unit = '';
    let use = '';
    let rawAreaSqm = '';
    let rawAreaPy = '';
    let rawDeposit = '';
    let rawRent = '';
    let rawMaintenance = '';
    let rawExpiry = '';
    let rawStatus = '';

    if (headerMap && headerMap.depositIdx !== undefined && headerMap.rentIdx !== undefined) {
      floor = headerMap.floorIdx !== undefined ? cells[headerMap.floorIdx] || '' : cells[0] || '';
      unit = headerMap.unitIdx !== undefined ? cells[headerMap.unitIdx] || '' : '';
      const usePart = headerMap.useIdx !== undefined ? cells[headerMap.useIdx] || '' : '';
      const tenantPart = headerMap.tenantIdx !== undefined ? cells[headerMap.tenantIdx] || '' : '';
      use = tenantPart && usePart && tenantPart !== usePart ? `${tenantPart}` : tenantPart || usePart;
      rawAreaSqm = headerMap.areaSqmIdx !== undefined ? cells[headerMap.areaSqmIdx] || '' : '';
      rawAreaPy = headerMap.areaPyIdx !== undefined ? cells[headerMap.areaPyIdx] || '' : '';
      rawDeposit = cells[headerMap.depositIdx] || '0';
      rawRent = cells[headerMap.rentIdx] || '0';
      rawMaintenance = headerMap.maintIdx !== undefined ? cells[headerMap.maintIdx] || '0' : '0';
      rawExpiry = headerMap.expiryIdx !== undefined ? cells[headerMap.expiryIdx] || '' : '';
      rawStatus = headerMap.statusIdx !== undefined ? cells[headerMap.statusIdx] || '' : '';
    } else if (cells.length >= 7) {
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

    // Status resolution (guard against notes like "공실 아님" or "공실 체크 금지")
    let status: RentRollStatus = 'occupied';
    const combinedStatusText = `${rawStatus} ${rawExpiry} ${use}`.toLowerCase();
    const isExplicitlyNotVacant =
      combinedStatusText.includes('공실 아님') ||
      combinedStatusText.includes('공실아님') ||
      combinedStatusText.includes('공실 체크 금지') ||
      combinedStatusText.includes('임대중 유지');

    if (
      combinedStatusText.includes('자가') ||
      combinedStatusText.includes('사옥') ||
      combinedStatusText.includes('owner')
    ) {
      status = 'owner';
    } else if (
      !isExplicitlyNotVacant &&
      (combinedStatusText.includes('공실') || combinedStatusText.includes('vacant'))
    ) {
      status = 'vacant';
    }

    const parsedDep = parseManwonAmount(rawDeposit);
    const parsedRent = parseManwonAmount(rawRent);
    const parsedMaint = parseManwonAmount(rawMaintenance);
    const areaSqmVal = parseFloat(String(rawAreaSqm).replace(/,/g, ''));
    const areaPyVal = parseFloat(String(rawAreaPy).replace(/,/g, ''));

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
      use: status === 'vacant' && (!use || use === '공실') ? '공실' : (use || '근린생활시설'),
      ...(Number.isFinite(areaSqmVal) && areaSqmVal > 0 ? { areaSqm: areaSqmVal } : {}),
      ...(Number.isFinite(areaPyVal) && areaPyVal > 0 ? { areaPyeong: areaPyVal } : {}),
      depositManwon: parsedDep.manwon,
      monthlyRentManwon: status === 'vacant' && parsedRent.manwon === 0 ? 0 : parsedRent.manwon,
      maintenanceManwon: status === 'vacant' && parsedMaint.manwon === 0 ? 0 : parsedMaint.manwon,
      leaseExpiry: rawExpiry,
      normalizedExpiry: expiryResult.normalized,
      isExpired: expiryResult.isExpired,
      status,
      unitMistakeWarning,
    });
  }

  const totalDepositManwon = Math.round(
    rows.reduce((sum, r) => sum + (r.status !== 'vacant' ? r.depositManwon || 0 : 0), 0) * 10
  ) / 10;
  const totalMonthlyRentManwon = Math.round(
    rows.reduce((sum, r) => sum + (r.status !== 'vacant' ? r.monthlyRentManwon || 0 : 0), 0) * 10
  ) / 10;
  const totalMaintenanceManwon = Math.round(
    rows.reduce((sum, r) => sum + (r.status !== 'vacant' ? r.maintenanceManwon || 0 : 0), 0) * 10
  ) / 10;

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
