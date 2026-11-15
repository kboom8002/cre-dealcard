/**
 * src/lib/crm/contact-bulk-parser.ts
 *
 * 3-Way Bulk Contact & Subscriber Parser (.xlsx/.xls, .csv, Multi-line Paste)
 * - Automatic Korean/English column header matching
 * - Korean mobile/landline phone normalization (including Excel stripped leading-zero restoration)
 * - Strict opt-in marketing consent parsing (never defaults blank consent to true)
 * - Intra-batch duplicate merging by normalized phone or email
 */

import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export const MAX_BULK_IMPORT_ROWS = 1000;

export type BulkClientRole = 'buyer' | 'seller' | 'tenant' | 'partner';
export type BulkImportSourceMode = 'excel' | 'csv' | 'paste';

export type ContactColumnKey =
  | 'name'
  | 'phone'
  | 'email'
  | 'company'
  | 'clientRole'
  | 'isVip'
  | 'preferredRegions'
  | 'budgetText'
  | 'marketingConsent'
  | 'memo';

export interface ParsedContactRow {
  rowNumber: number;
  name: string;
  phone?: string;
  phoneDigits?: string;
  email?: string;
  company?: string;
  clientRole: BulkClientRole;
  isVip: boolean;
  preferredRegions?: string;
  budgetText?: string;
  marketingConsent: boolean;
  memo?: string;
  restoredLeadingZero?: boolean;
}

export interface InvalidContactRow {
  rowNumber: number;
  rawName?: string;
  rawPhone?: string;
  rawEmail?: string;
  reason: string;
}

export interface BulkParseResult {
  sourceMode: BulkImportSourceMode;
  validRows: ParsedContactRow[];
  invalidRows: InvalidContactRow[];
  mergedDuplicatesCount: number;
  restoredLeadingZeroCount: number;
  truncatedRowsCount: number;
  totalInputRows: number;
  detectedColumns: Partial<Record<ContactColumnKey, string>>;
}

export const CONTACT_COLUMN_ALIASES: Readonly<Record<ContactColumnKey, readonly string[]>> = {
  name: ['이름', '성함', '고객명', '담당자', '대표자', 'name', '성명'],
  phone: ['휴대폰', '연락처', '전화번호', '핸드폰', '휴대전화', '전화', 'phone', 'mobile', 'tel'],
  email: ['이메일', '메일', '전자우편', 'email', 'e-mail'],
  company: ['회사', '소속', '법인명', '상호', '업체명', 'company', 'organization'],
  clientRole: ['구분', '유형', '역할', '매수/매도', '고객유형', 'type', 'role'],
  isVip: ['vip', '중요', '핵심', '등급', '별표'],
  preferredRegions: ['관심지역', '희망지역', '지역', '권역', 'region'],
  budgetText: ['예산', '희망금액', '투자금', '매수예산', 'budget'],
  marketingConsent: ['수신동의', '마케팅동의', '광고동의', '뉴스레터동의', 'opt_in', 'consent'],
  memo: ['메모', '비고', '특이사항', '노트', 'memo', 'notes'],
};

const EMAIL_SYNTAX_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_EXTRACT_RE = /[^\s@<>"',;()[\]]+@[^\s@<>"',;()[\]]+\.[^\s@<>"',;()[\]]{2,}/;

const EXPLICIT_CONSENT_TRUTHY = new Set([
  'y',
  '동의',
  '수신동의',
  '마케팅동의',
  '광고동의',
  '뉴스레터동의',
  'o',
  '예',
  'true',
  '1',
]);

const EXPLICIT_VIP_TRUTHY = new Set([
  'y',
  '예',
  'vip',
  '★',
  '⭐',
  '1',
  'true',
  '중요',
  '핵심',
]);

const FREEFORM_ROLE_TOKENS: Readonly<Record<string, BulkClientRole>> = {
  매수: 'buyer',
  매수인: 'buyer',
  투자자: 'buyer',
  buyer: 'buyer',
  매도: 'seller',
  매도인: 'seller',
  건물주: 'seller',
  임대인: 'seller',
  seller: 'seller',
  임차: 'tenant',
  임차인: 'tenant',
  tenant: 'tenant',
  중개: 'partner',
  공동중개: 'partner',
  partner: 'partner',
};

export interface NormalizedKoreanPhone {
  formatted: string;
  digits: string;
  restoredLeadingZero: boolean;
}

function cellToString(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return '';
    return Number.isInteger(raw) ? String(raw) : String(Math.trunc(raw));
  }
  if (typeof raw === 'boolean') {
    return raw ? 'true' : 'false';
  }
  return String(raw).replace(/^\uFEFF/, '').trim();
}

/**
 * Normalizes Korean mobile and landline numbers, automatically restoring leading '0'
 * stripped by Excel numeric formatting (e.g. 1012345678 -> 010-1234-5678).
 */
export function normalizeKoreanContactPhone(raw: unknown): NormalizedKoreanPhone | null {
  const str = cellToString(raw);
  if (!str || str.includes('@')) return null;

  // Reject strings that contain letters (other than optional ext/tel prefix) to avoid turning dates/codes into phones
  if (/[a-zA-Z가-힣]/.test(str)) return null;
  // Reject YYYY-MM-DD / YYYY.MM.DD date-like strings
  if (/^(?:19|20)\d{2}[-./]\d{1,2}[-./]\d{1,2}$/.test(str)) return null;

  let digits = str.replace(/\D/g, '');
  if (!digits) return null;

  let restoredLeadingZero = false;

  // International +82 / 82 prefix
  if (digits.startsWith('82') && digits.length >= 10 && digits.length <= 13) {
    digits = '0' + digits.slice(digits.startsWith('820') ? 3 : 2);
  }

  // Excel leading-zero loss recovery
  if (!digits.startsWith('0')) {
    if (/^10\d{8}$/.test(digits)) {
      digits = '0' + digits;
      restoredLeadingZero = true;
    } else if (/^1[16789]\d{7,8}$/.test(digits)) {
      digits = '0' + digits;
      restoredLeadingZero = true;
    } else if (/^2\d{7,8}$/.test(digits)) {
      digits = '0' + digits;
      restoredLeadingZero = true;
    } else if (/^(?:3[1-3]|4[1-4]|5[1-5]|6[1-4]|70)\d{7,8}$/.test(digits)) {
      digits = '0' + digits;
      restoredLeadingZero = true;
    } else if (/^50\d{8,9}$/.test(digits)) {
      digits = '0' + digits;
      restoredLeadingZero = true;
    }
  }

  // Reject dummy all-zero placeholder phones
  if (/^0+$/.test(digits) || digits === '01000000000') {
    return null;
  }

  // Mobile 010 / 011 / 016 / 017 / 018 / 019
  if (/^010\d{8}$/.test(digits)) {
    return {
      formatted: `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`,
      digits,
      restoredLeadingZero,
    };
  }
  if (/^01[16789]\d{7,8}$/.test(digits)) {
    const formatted =
      digits.length === 10
        ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
        : `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    return { formatted, digits, restoredLeadingZero };
  }

  // Seoul landline 02
  if (/^02\d{7,8}$/.test(digits)) {
    const formatted =
      digits.length === 9
        ? `02-${digits.slice(2, 5)}-${digits.slice(5)}`
        : `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    return { formatted, digits, restoredLeadingZero };
  }

  // Regional landline 031~064, VoIP 070, toll-free 080
  if (/^0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4]|70|80)\d{7,8}$/.test(digits)) {
    const formatted =
      digits.length === 10
        ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
        : `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    return { formatted, digits, restoredLeadingZero };
  }

  // Virtual/safe number 050X
  if (/^050\d{8,9}$/.test(digits)) {
    const formatted =
      digits.length === 11
        ? `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
        : `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
    return { formatted, digits, restoredLeadingZero };
  }

  // Representative number 15XX / 16XX / 18XX
  if (/^1[568]\d{6}$/.test(digits)) {
    return {
      formatted: `${digits.slice(0, 4)}-${digits.slice(4)}`,
      digits,
      restoredLeadingZero,
    };
  }

  return null;
}

export function isValidContactEmail(raw: unknown): boolean {
  const s = cellToString(raw).toLowerCase();
  if (!s || s.length > 254) return false;
  return EMAIL_SYNTAX_RE.test(s);
}

export function normalizeContactEmail(raw: unknown): string | null {
  const s = cellToString(raw).toLowerCase();
  if (!s) return null;
  return isValidContactEmail(s) ? s : null;
}

export function normalizeClientRole(raw: unknown): BulkClientRole {
  const s = cellToString(raw).toLowerCase();
  if (!s) return 'buyer';

  // Exact match first
  if (s in FREEFORM_ROLE_TOKENS) {
    return FREEFORM_ROLE_TOKENS[s];
  }

  if (/(매도인|매도|건물주|임대인|seller)/i.test(s) && !/매수/.test(s)) {
    return 'seller';
  }
  if (/(임차인|임차|tenant)/i.test(s)) {
    return 'tenant';
  }
  if (/(공동중개|중개|partner)/i.test(s)) {
    return 'partner';
  }
  if (/(매수인|매수|투자자|buyer)/i.test(s)) {
    return 'buyer';
  }
  return 'buyer';
}

export function parseVipFlag(raw: unknown): boolean {
  const s = cellToString(raw);
  if (!s) return false;
  const lower = s.toLowerCase();
  if (/일반|아님|아니오|no|false|0|n/i.test(lower) && !lower.includes('vip')) {
    return false;
  }
  if (EXPLICIT_VIP_TRUTHY.has(lower)) return true;
  if (lower.includes('vip') || s.includes('★') || s.includes('⭐')) return true;
  return false;
}

/**
 * Strict Information and Communications Network Act opt-in check:
 * Truthy ONLY when explicit ('Y', '동의', 'O', '예', 'true', '1').
 * Blank, null, undefined, '미동의', 'N', '거부', etc. ALWAYS return false.
 */
export function parseMarketingConsent(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  if (typeof raw === 'boolean') return raw === true;
  const s = cellToString(raw);
  if (!s) return false;
  const lower = s.toLowerCase().replace(/\s+/g, '');
  if (/미동의|비동의|거부|철회|안함|아니오|불가|no|false|0|n|x/i.test(lower)) {
    return false;
  }
  // Strip parenthetical suffix e.g. "동의(Y)" -> "동의"
  const baseLower = lower.replace(/\([^)]*\)/g, '').trim();
  return EXPLICIT_CONSENT_TRUTHY.has(lower) || EXPLICIT_CONSENT_TRUTHY.has(baseLower);
}

function normalizeHeaderToken(raw: string): { exact: string; stripped: string } {
  const base = raw
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
  const withoutParens = base.replace(/\([^)]*\)/g, '').trim();
  const stripped = withoutParens.replace(/[\s_*#:.-]+/g, '');
  return { exact: base.replace(/\s+/g, ''), stripped };
}

function matchHeaderToColumnKey(rawHeader: unknown): ContactColumnKey | null {
  const headerStr = cellToString(rawHeader);
  if (!headerStr || headerStr.length > 50) return null;

  const { exact, stripped } = normalizeHeaderToken(headerStr);
  if (!exact && !stripped) return null;

  const entries = Object.entries(CONTACT_COLUMN_ALIASES) as Array<
    [ContactColumnKey, readonly string[]]
  >;

  for (const [colKey, aliases] of entries) {
    for (const alias of aliases) {
      const normAlias = normalizeHeaderToken(alias);
      if (exact === normAlias.exact || (stripped && stripped === normAlias.stripped)) {
        return colKey;
      }
    }
  }
  return null;
}

interface DetectedHeaderLayout {
  headerRowIndex: number;
  colIndexToKey: Map<number, ContactColumnKey>;
  detectedColumns: Partial<Record<ContactColumnKey, string>>;
}

function detectHeaderRow(matrix: unknown[][]): DetectedHeaderLayout | null {
  const maxScan = Math.min(matrix.length, 5);
  for (let r = 0; r < maxScan; r++) {
    const row = matrix[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const colIndexToKey = new Map<number, ContactColumnKey>();
    const detectedColumns: Partial<Record<ContactColumnKey, string>> = {};
    const usedKeys = new Set<ContactColumnKey>();

    for (let c = 0; c < row.length; c++) {
      const matched = matchHeaderToColumnKey(row[c]);
      if (matched && !usedKeys.has(matched)) {
        usedKeys.add(matched);
        colIndexToKey.set(c, matched);
        detectedColumns[matched] = cellToString(row[c]);
      }
    }

    const hasContactCol = usedKeys.has('phone') || usedKeys.has('email');
    if ((usedKeys.size >= 2 && (hasContactCol || usedKeys.has('name'))) || (usedKeys.size === 1 && hasContactCol && row.length === 1)) {
      return {
        headerRowIndex: r,
        colIndexToKey,
        detectedColumns,
      };
    }
  }
  return null;
}

function isRowCompletelyEmpty(row: unknown[]): boolean {
  if (!Array.isArray(row) || row.length === 0) return true;
  return row.every((cell) => cellToString(cell) === '');
}

function mergeContactRows(target: ParsedContactRow, incoming: ParsedContactRow): void {
  if (
    (!target.name || target.name === '이름 미입력 고객') &&
    incoming.name &&
    incoming.name !== '이름 미입력 고객'
  ) {
    target.name = incoming.name;
  }
  if (!target.phone && incoming.phone) {
    target.phone = incoming.phone;
    target.phoneDigits = incoming.phoneDigits;
  }
  if (!target.email && incoming.email) {
    target.email = incoming.email;
  }
  if (!target.company && incoming.company) {
    target.company = incoming.company;
  }
  if (target.clientRole === 'buyer' && incoming.clientRole !== 'buyer') {
    target.clientRole = incoming.clientRole;
  }
  if (incoming.isVip) {
    target.isVip = true;
  }
  if (incoming.preferredRegions) {
    if (!target.preferredRegions) {
      target.preferredRegions = incoming.preferredRegions;
    } else if (!target.preferredRegions.includes(incoming.preferredRegions)) {
      target.preferredRegions = `${target.preferredRegions}, ${incoming.preferredRegions}`;
    }
  }
  if (!target.budgetText && incoming.budgetText) {
    target.budgetText = incoming.budgetText;
  }
  if (incoming.marketingConsent) {
    target.marketingConsent = true;
  }
  if (incoming.memo) {
    if (!target.memo) {
      target.memo = incoming.memo;
    } else if (!target.memo.includes(incoming.memo)) {
      target.memo = `${target.memo} / ${incoming.memo}`;
    }
  }
  if (incoming.restoredLeadingZero) {
    target.restoredLeadingZero = true;
  }
}

function deduplicateParsedRows(rows: ParsedContactRow[]): {
  deduped: ParsedContactRow[];
  mergedDuplicatesCount: number;
} {
  const deduped: ParsedContactRow[] = [];
  const byPhone = new Map<string, ParsedContactRow>();
  const byEmail = new Map<string, ParsedContactRow>();
  let mergedDuplicatesCount = 0;

  for (const row of rows) {
    const phoneKey = row.phoneDigits || '';
    const emailKey = row.email ? row.email.toLowerCase() : '';

    const matchByPhone = phoneKey ? byPhone.get(phoneKey) : undefined;
    const matchByEmail = emailKey ? byEmail.get(emailKey) : undefined;
    const existing = matchByPhone || matchByEmail;

    if (existing) {
      mergeContactRows(existing, row);
      if (matchByPhone && matchByEmail && matchByPhone !== matchByEmail) {
        mergeContactRows(matchByPhone, matchByEmail);
        const removeIdx = deduped.indexOf(matchByEmail);
        if (removeIdx >= 0) {
          deduped.splice(removeIdx, 1);
          mergedDuplicatesCount += 1;
        }
        if (matchByEmail.phoneDigits) byPhone.set(matchByEmail.phoneDigits, matchByPhone);
        if (matchByEmail.email) byEmail.set(matchByEmail.email.toLowerCase(), matchByPhone);
      }
      if (existing.phoneDigits) byPhone.set(existing.phoneDigits, existing);
      if (existing.email) byEmail.set(existing.email.toLowerCase(), existing);
      mergedDuplicatesCount += 1;
    } else {
      const cloned: ParsedContactRow = { ...row };
      deduped.push(cloned);
      if (phoneKey) byPhone.set(phoneKey, cloned);
      if (emailKey) byEmail.set(emailKey, cloned);
    }
  }

  return { deduped, mergedDuplicatesCount };
}

function parseHeaderMappedRow(
  row: unknown[],
  rowNumber: number,
  colIndexToKey: Map<number, ContactColumnKey>,
): { valid?: ParsedContactRow; invalid?: InvalidContactRow } {
  const record: Partial<Record<ContactColumnKey, string>> = {};
  for (const [colIdx, key] of colIndexToKey.entries()) {
    record[key] = cellToString(row[colIdx]);
  }

  const rawName = record.name || '';
  const rawPhone = record.phone || '';
  const rawEmail = record.email || '';
  const company = record.company || undefined;
  const rawRole = record.clientRole || '';
  const rawVip = record.isVip || '';
  const preferredRegions = record.preferredRegions || undefined;
  const budgetText = record.budgetText || undefined;
  const rawConsent = record.marketingConsent || '';
  const memo = record.memo || undefined;

  // Sometimes brokers put email inside the phone/contact column if email column is blank
  let phoneCandidate = rawPhone;
  let emailCandidate = rawEmail;
  if (!emailCandidate && phoneCandidate.includes('@')) {
    emailCandidate = phoneCandidate;
    phoneCandidate = '';
  }

  const normalizedPhone = phoneCandidate ? normalizeKoreanContactPhone(phoneCandidate) : null;
  const normalizedEmail = emailCandidate ? normalizeContactEmail(emailCandidate) : null;

  if (!normalizedPhone && !normalizedEmail) {
    let reason = '연락처(전화번호 또는 이메일)가 누락되었습니다.';
    if (phoneCandidate && emailCandidate) {
      reason = '전화번호와 이메일 형식이 모두 올바르지 않습니다.';
    } else if (phoneCandidate) {
      reason = `전화번호 형식이 올바르지 않습니다 (${phoneCandidate}).`;
    } else if (emailCandidate) {
      reason = `이메일 형식이 올바르지 않습니다 (${emailCandidate}).`;
    }
    return {
      invalid: {
        rowNumber,
        rawName: rawName || undefined,
        rawPhone: rawPhone || undefined,
        rawEmail: rawEmail || undefined,
        reason,
      },
    };
  }

  const resolvedName =
    rawName ||
    company ||
    (normalizedEmail ? normalizedEmail.split('@')[0] : '이름 미입력 고객');

  const clientRole = normalizeClientRole(rawRole);
  const isVip = parseVipFlag(rawVip) || parseVipFlag(rawRole);
  const marketingConsent = parseMarketingConsent(rawConsent);

  return {
    valid: {
      rowNumber,
      name: resolvedName,
      phone: normalizedPhone?.formatted,
      phoneDigits: normalizedPhone?.digits,
      email: normalizedEmail || undefined,
      company,
      clientRole,
      isVip,
      preferredRegions,
      budgetText,
      marketingConsent,
      memo,
      restoredLeadingZero: normalizedPhone?.restoredLeadingZero || false,
    },
  };
}

function parseFreeformTokens(
  rawTokens: string[],
  rowNumber: number,
): { valid?: ParsedContactRow; invalid?: InvalidContactRow } {
  const tokens = rawTokens.map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return {};

  let name = '';
  let normalizedPhone: NormalizedKoreanPhone | null = null;
  let normalizedEmail: string | null = null;
  let rawInvalidEmail = '';
  let rawInvalidPhone = '';
  let clientRole: BulkClientRole = 'buyer';
  let roleAssigned = false;
  let isVip = false;
  let marketingConsent = false;
  const extraTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const cleanTok = token.replace(/^[,;|]+|[,;|]+$/g, '').trim();
    if (!cleanTok) continue;

    // 1. Email check
    if (cleanTok.includes('@')) {
      const extracted = cleanTok.match(EMAIL_EXTRACT_RE)?.[0] || cleanTok;
      const validMail = normalizeContactEmail(extracted);
      if (validMail && !normalizedEmail) {
        normalizedEmail = validMail;
      } else if (!validMail && !rawInvalidEmail) {
        rawInvalidEmail = cleanTok;
      }
      continue;
    }

    // 2. Single-token phone check
    if (!normalizedPhone) {
      const singlePhone = normalizeKoreanContactPhone(cleanTok);
      if (singlePhone) {
        normalizedPhone = singlePhone;
        continue;
      }
      // 3-part space-separated phone e.g. "010 1234 5678" or "02 1234 5678"
      if (
        i + 2 < tokens.length &&
        /^\d{2,4}$/.test(cleanTok) &&
        /^\d{3,4}$/.test(tokens[i + 1]) &&
        /^\d{4}$/.test(tokens[i + 2])
      ) {
        const joinedPhone = normalizeKoreanContactPhone(
          `${cleanTok}${tokens[i + 1]}${tokens[i + 2]}`,
        );
        if (joinedPhone) {
          normalizedPhone = joinedPhone;
          i += 2;
          continue;
        }
      }
    }

    const lower = cleanTok.toLowerCase();

    // 3. Explicit VIP check
    if (lower === 'vip' || cleanTok === '★' || cleanTok === '⭐' || cleanTok === '핵심고객') {
      isVip = true;
      continue;
    }

    // 4. Explicit role check
    if (!roleAssigned && lower in FREEFORM_ROLE_TOKENS) {
      clientRole = FREEFORM_ROLE_TOKENS[lower];
      roleAssigned = true;
      continue;
    }

    // 5. Explicit marketing consent token in freeform line (never bare '1' or ambiguous text)
    if (
      cleanTok === '수신동의' ||
      cleanTok === '마케팅동의' ||
      cleanTok === '광고동의' ||
      cleanTok === '뉴스레터동의'
    ) {
      marketingConsent = true;
      continue;
    }
    if (cleanTok === '수신거부' || cleanTok === '미동의' || cleanTok === '비동의') {
      marketingConsent = false;
      continue;
    }

    // 6. Track invalid digit-only token as invalid phone candidate, never as customer name
    if (/^[\d\s+()-]+$/.test(cleanTok)) {
      if (!rawInvalidPhone) rawInvalidPhone = cleanTok;
      continue;
    }

    if (!name) {
      name = cleanTok;
    } else {
      extraTokens.push(cleanTok);
    }
  }

  if (!normalizedPhone && !normalizedEmail) {
    let reason = '연락처(전화번호 또는 이메일)가 누락되었습니다.';
    if (rawInvalidPhone && rawInvalidEmail) {
      reason = '전화번호와 이메일 형식이 모두 올바르지 않습니다.';
    } else if (rawInvalidPhone) {
      reason = `전화번호 형식이 올바르지 않습니다 (${rawInvalidPhone}).`;
    } else if (rawInvalidEmail) {
      reason = `이메일 형식이 올바르지 않습니다 (${rawInvalidEmail}).`;
    }
    return {
      invalid: {
        rowNumber,
        rawName: name || undefined,
        rawPhone: rawInvalidPhone || undefined,
        rawEmail: rawInvalidEmail || undefined,
        reason,
      },
    };
  }

  const resolvedName =
    name || (normalizedEmail ? normalizedEmail.split('@')[0] : '이름 미입력 고객');
  const memo = extraTokens.length > 0 ? extraTokens.join(' ') : undefined;

  return {
    valid: {
      rowNumber,
      name: resolvedName,
      phone: normalizedPhone?.formatted,
      phoneDigits: normalizedPhone?.digits,
      email: normalizedEmail || undefined,
      clientRole,
      isVip,
      marketingConsent,
      memo,
      restoredLeadingZero: normalizedPhone?.restoredLeadingZero || false,
    },
  };
}

function processMatrix(
  matrix: unknown[][],
  sourceMode: BulkImportSourceMode,
): BulkParseResult {
  const headerLayout = detectHeaderRow(matrix);
  const startIdx = headerLayout ? headerLayout.headerRowIndex + 1 : 0;

  const nonEmptyRows: Array<{ row: unknown[]; rowNumber: number }> = [];
  for (let i = startIdx; i < matrix.length; i++) {
    const row = matrix[i];
    if (!isRowCompletelyEmpty(row)) {
      nonEmptyRows.push({ row, rowNumber: i + 1 });
    }
  }

  const totalInputRows = nonEmptyRows.length;
  const truncatedRowsCount = Math.max(0, totalInputRows - MAX_BULK_IMPORT_ROWS);
  const cappedRows = nonEmptyRows.slice(0, MAX_BULK_IMPORT_ROWS);

  const rawValid: ParsedContactRow[] = [];
  const invalidRows: InvalidContactRow[] = [];
  let restoredLeadingZeroCount = 0;

  for (const { row, rowNumber } of cappedRows) {
    const outcome = headerLayout
      ? parseHeaderMappedRow(row, rowNumber, headerLayout.colIndexToKey)
      : parseFreeformTokens(row.map(cellToString), rowNumber);

    if (outcome.valid) {
      if (outcome.valid.restoredLeadingZero) {
        restoredLeadingZeroCount += 1;
      }
      rawValid.push(outcome.valid);
    } else if (outcome.invalid) {
      invalidRows.push(outcome.invalid);
    }
  }

  const { deduped, mergedDuplicatesCount } = deduplicateParsedRows(rawValid);

  return {
    sourceMode,
    validRows: deduped,
    invalidRows,
    mergedDuplicatesCount,
    restoredLeadingZeroCount,
    truncatedRowsCount,
    totalInputRows,
    detectedColumns: headerLayout?.detectedColumns ?? {},
  };
}

/**
 * 1. Parse Excel (.xlsx / .xls) ArrayBuffer or Uint8Array (first non-empty worksheet).
 */
export function parseExcelContactsBuffer(buffer: ArrayBuffer | Uint8Array): BulkParseResult {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const workbook = XLSX.read(uint8, { type: 'array' });

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });
    if (matrix.some((row) => !isRowCompletelyEmpty(row))) {
      return processMatrix(matrix, 'excel');
    }
  }

  return {
    sourceMode: 'excel',
    validRows: [],
    invalidRows: [],
    mergedDuplicatesCount: 0,
    restoredLeadingZeroCount: 0,
    truncatedRowsCount: 0,
    totalInputRows: 0,
    detectedColumns: {},
  };
}

/**
 * 2. Parse CSV string with UTF-8 BOM stripping and Korean/English header detection.
 */
export function parseCsvContactsText(csvText: string): BulkParseResult {
  const cleanText = String(csvText ?? '').replace(/^\uFEFF/, '');
  if (!cleanText.trim()) {
    return {
      sourceMode: 'csv',
      validRows: [],
      invalidRows: [],
      mergedDuplicatesCount: 0,
      restoredLeadingZeroCount: 0,
      truncatedRowsCount: 0,
      totalInputRows: 0,
      detectedColumns: {},
    };
  }

  const parsed = Papa.parse<string[]>(cleanText, {
    skipEmptyLines: 'greedy',
  });
  const matrix = Array.isArray(parsed.data) ? parsed.data : [];
  return processMatrix(matrix, 'csv');
}

/**
 * 3. Parse multi-line pasted contacts from Excel, KakaoTalk, or phonebook.
 * Supports both headered tab/comma tables and headerless freeform lines.
 */
export function parsePastedContactsText(pastedText: string): BulkParseResult {
  const cleanText = String(pastedText ?? '').replace(/^\uFEFF/, '');
  const rawLines = cleanText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rawLines.length === 0) {
    return {
      sourceMode: 'paste',
      validRows: [],
      invalidRows: [],
      mergedDuplicatesCount: 0,
      restoredLeadingZeroCount: 0,
      truncatedRowsCount: 0,
      totalInputRows: 0,
      detectedColumns: {},
    };
  }

  // Check if first line is a tab- or comma-delimited header row
  const firstLineDelimiter = rawLines[0].includes('\t')
    ? '\t'
    : rawLines[0].includes(',')
      ? ','
      : null;

  if (firstLineDelimiter) {
    const candidateMatrix = rawLines.map((line) => line.split(firstLineDelimiter));
    const headerCheck = detectHeaderRow(candidateMatrix.slice(0, 1));
    if (headerCheck) {
      return processMatrix(candidateMatrix, 'paste');
    }
  }

  // Headerless freeform lines (tab, comma, or whitespace tokens)
  const totalInputRows = rawLines.length;
  const truncatedRowsCount = Math.max(0, totalInputRows - MAX_BULK_IMPORT_ROWS);
  const cappedLines = rawLines.slice(0, MAX_BULK_IMPORT_ROWS);

  const rawValid: ParsedContactRow[] = [];
  const invalidRows: InvalidContactRow[] = [];
  let restoredLeadingZeroCount = 0;

  cappedLines.forEach((line, idx) => {
    const rowNumber = idx + 1;
    const tokens = line.includes('\t')
      ? line.split('\t')
      : line.includes(',')
        ? line.split(',')
        : line.split(/\s+/);

    const outcome = parseFreeformTokens(tokens, rowNumber);
    if (outcome.valid) {
      if (outcome.valid.restoredLeadingZero) {
        restoredLeadingZeroCount += 1;
      }
      rawValid.push(outcome.valid);
    } else if (outcome.invalid) {
      invalidRows.push(outcome.invalid);
    }
  });

  const { deduped, mergedDuplicatesCount } = deduplicateParsedRows(rawValid);

  return {
    sourceMode: 'paste',
    validRows: deduped,
    invalidRows,
    mergedDuplicatesCount,
    restoredLeadingZeroCount,
    truncatedRowsCount,
    totalInputRows,
    detectedColumns: {},
  };
}

export type BulkContactsInput =
  | { mode: 'excel'; buffer: ArrayBuffer | Uint8Array }
  | { mode: 'csv'; text: string }
  | { mode: 'paste'; text: string };

export function parseBulkContactsInput(input: BulkContactsInput): BulkParseResult {
  if (input.mode === 'excel') {
    return parseExcelContactsBuffer(input.buffer);
  }
  if (input.mode === 'csv') {
    return parseCsvContactsText(input.text);
  }
  return parsePastedContactsText(input.text);
}

/**
 * Generates a 1-click downloadable sample CSV template with UTF-8 BOM (\uFEFF)
 * so Microsoft Excel on Korean Windows opens it without Mojibake.
 */
export function buildSampleCsvContent(): string {
  const headers = [
    '이름',
    '연락처',
    '이메일',
    '회사',
    '구분',
    'VIP',
    '관심지역',
    '예산',
    '수신동의',
    '메모',
  ];
  const sampleRows = [
    [
      '김매수(예시)',
      '010-1234-5678',
      'buyer.sample@example.com',
      '강남홀딩스(예시)',
      '매수',
      'Y',
      '강남·서초',
      '50억 내외',
      'Y',
      '역세권 꼬마빌딩 선호 (예시 행 삭제 후 입력)',
    ],
    [
      '박소유(예시)',
      '010-9876-5432',
      'owner.sample@example.com',
      '',
      '매도',
      '',
      '마포·홍대',
      '',
      '',
      '수신동의 미표시 시 상담용 수첩으로만 저장됩니다',
    ],
  ];

  const escapeCsvCell = (cell: string): string => {
    if (/[",\n\r]/.test(cell)) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };

  const lines = [headers, ...sampleRows].map((row) => row.map(escapeCsvCell).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
