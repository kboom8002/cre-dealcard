import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, CD, KR, M, CW, light } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { calculateSetbackRatio, inferTenantCategory } from './a22-stacking-plan';
import type { StackingPlanFloor } from '../../types';
import { sqmToPyeong } from '@/lib/utils/area-conversion';
import { projectBasicRentRollColumns, isNumericRentRollHeader, RENTROLL_SUMMARY_CELL, BASIC_RENTROLL_HEADERS, RENTROLL_NOTE_HEADER } from '../rentroll-area-columns';
import { formatAreaSqm, formatAreaWithPyeong, parseLeadingNumber, MASKED_TENANT_RE } from '../binder/rent-roll-table-builder';
import { normalizeMissing } from '../missing-values';

export interface ArchetypeInput {
  pres: PptxGenJS;
  slideNum: number;
  docno: string;
  watermarkText?: string;
  data: Record<string, any>;
  grade: 'A' | 'B' | 'C';
  provenance: Record<string, ProvenanceKind>;
  flags?: Record<string, any>;
}

export interface ArchetypeOutput {
  slide?: ReturnType<PptxGenJS['addSlide']>;
  warnings: string[];
  suppress?: boolean;
}

function isSuppressed(flags?: Record<string, any>, archetype?: string): boolean {
  if (!flags) return false;
  if (archetype && (flags[archetype] === false || flags[`suppress_${archetype}`] === true || flags[`hide_${archetype}`] === true)) {
    return true;
  }
  if (Array.isArray(flags.suppressedArchetypes) && archetype && flags.suppressedArchetypes.includes(archetype)) {
    return true;
  }
  return false;
}

const EXPIRY_HEATMAP_PALETTE: Record<string, string> = {
  '2024': 'D6C6B9',
  '2025': 'C9A9A6',
  '2026': '93B3A0',
  '2027': 'A6C1D9',
  '2028': 'C5B4E3',
  '2029': 'F2C4A2',
  '2030': 'E8D1A7',
  '2031': 'B8D8D8',
  '2032': 'D4B8E0',
  '2033': 'A8C8B8',
  '2034': 'C8B8A8',
  '2035': 'B8C8E0',
};

type FloorInfo = StackingPlanFloor & { _expiry?: string; area?: number };

function parseExpiryYear(text: string): string | undefined {
  if (!text) return undefined;
  const m4 = text.match(/20(2[4-9]|3[0-5])/);
  if (m4) return `20${m4[1]}`;
  const m2 = text.match(/['’]?\s*(2[4-9]|3[0-5])\b/);
  if (m2) return `20${m2[1]}`;
  return undefined;
}

// ════════════════════════════════════════
// 스태킹 도식 헬퍼 (단위 테스트용 export)
// ════════════════════════════════════════

/** 스태킹 도식의 임대 단위(호실) — 렌트롤 표 1행 = 1단위 */
export interface StackingUnit {
  unitLabel: string;
  tenant: string;
  /** ㎡, 0 = 미기재 */
  areaSqm: number;
  /** 표와 동일한 면적 문자열 (예: '209.6'), 미기재 '' */
  areaText: string;
  isVacant: boolean;
  expiryYear?: string;
  category?: string;
}

/** 물리 층 1개 = 스태킹 도식 1행 (분할 임대 호실은 같은 행에 좌우 세그먼트로 배치) */
export interface StackingFloorGroup {
  key: string;
  order: number;
  isSubterranean: boolean;
  totalArea: number;
  units: StackingUnit[];
}

/**
 * 호실 라벨 → 물리 층 키. '9F-A'·'9F-B'·'9층 901호'는 같은 '9F' 한 층으로 묶는다.
 * '3F~4F'·'1-2F' 같은 병합/범위 라벨은 원 라벨을 유지한다.
 */
export function physicalFloorKey(label: string): { key: string; order: number; isSubterranean: boolean } {
  const s = String(label ?? '').trim();
  if (/^(RF|PH|옥탑|옥상)/i.test(s)) return { key: s, order: 99, isSubterranean: false };
  const m = s.match(/^(B|지하\s*)?(\d+)\s*(F|층)?(.*)$/i);
  if (!m) return { key: s || '-', order: 1, isSubterranean: false };
  const isSub = !!m[1];
  const n = parseInt(m[2], 10);
  const rest = (m[4] || '').trim();
  const base = isSub ? `B${n}` : `${n}F`;
  const order = isSub ? -n : n;
  if (!rest) return { key: base, order, isSubterranean: isSub };
  // 범위/병합층 → 원 라벨 유지
  if (/^[~～]/.test(rest) || /^[-–]\s*B?\d+\s*(F|층)?$/i.test(rest)) return { key: s, order, isSubterranean: isSub };
  // 호실 접미사 (-A, _B, A, 901호, (A)) → 같은 물리 층
  if (/^[-–_·.\s(]*[A-Za-z0-9가-힣]{1,6}\)?\s*(호|호실)?$/.test(rest)) return { key: base, order, isSubterranean: isSub };
  return { key: s, order, isSubterranean: isSub };
}

/** 렌트롤 단위를 물리 층별로 묶어 아래(지하)→위 순으로 정렬 */
export function groupStackingFloors(units: StackingUnit[]): StackingFloorGroup[] {
  const map = new Map<string, StackingFloorGroup>();
  for (const u of units) {
    const pk = physicalFloorKey(u.unitLabel);
    let g = map.get(pk.key);
    if (!g) {
      g = { key: pk.key, order: pk.order, isSubterranean: pk.isSubterranean, totalArea: 0, units: [] };
      map.set(pk.key, g);
    }
    g.units.push(u);
    g.totalArea += u.areaSqm > 0 ? u.areaSqm : 0;
  }
  return [...map.values()].sort((a, b) => a.order - b.order);
}

const STACK_MIN_PT = 6.5;

function textWidthIn(text: string, pt: number, bold = false): number {
  let w = 0;
  for (const ch of String(text ?? '')) w += L.getCharWidthInches(ch, pt);
  return bold ? w * 1.06 : w;
}

/** 한 줄 고정 맞춤: 기준 글꼴에서 0.5pt씩 줄이고, 최소 글꼴에서도 넘치면 말줄임 */
export function fitSingleLine(
  text: string, widthIn: number, basePt: number, minPt = STACK_MIN_PT, bold = false,
): { text: string; fontSize: number; truncated: boolean } {
  const t = String(text ?? '');
  for (let pt = basePt; pt >= minPt - 1e-6; pt -= 0.5) {
    if (textWidthIn(t, pt, bold) <= widthIn) return { text: t, fontSize: pt, truncated: false };
  }
  const chars = Array.from(t);
  while (chars.length > 1 && textWidthIn(chars.join('') + '…', minPt, bold) > widthIn) chars.pop();
  return { text: chars.join('').trimEnd() + '…', fontSize: minPt, truncated: true };
}

/**
 * 스태킹 라벨 약어 사전 (D7-c) — 말줄임('…') 이전에 적용. 긴 순으로 매칭해 부분 치환 충돌을 막는다.
 * 의미를 바꾸지 않는 관행적 약어만 (표에는 항상 전체 표기가 남는다).
 */
const STACK_LABEL_ABBREVIATIONS: Array<[string, string]> = [
  ['제1종근린생활시설', '1종근생'],
  ['제2종근린생활시설', '2종근생'],
  ['근린생활시설', '근생'],
  ['휴게음식점', '휴게음식'],
  ['일반음식점', '음식점'],
  ['교육연구시설', '교육시설'],
  ['판매시설', '판매'],
  ['업무시설', '업무'],
  ['주식회사', '(주)'],
  ['사무소', '사무'],
  ['소매점', '소매'],
];

export function abbreviateTenantLabel(text: string): string {
  let out = String(text ?? '');
  for (const [from, to] of STACK_LABEL_ABBREVIATIONS) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** 스태킹 세그먼트 라벨: '임차인 209.6㎡' → (좁으면) '임차인' → (약어) → (최후) 말줄임 · 항상 한 줄 */
export function chooseStackLabel(
  tenant: string, areaText: string, widthIn: number, basePt: number, minPt = STACK_MIN_PT, bold = false,
): { text: string; fontSize: number } | null {
  if (widthIn < 0.16) return null;
  const short = abbreviateTenantLabel(tenant);
  const candidates = [
    ...(areaText ? [`${tenant} ${areaText}㎡`] : []),
    tenant,
    ...(short !== tenant ? [...(areaText ? [`${short} ${areaText}㎡`] : []), short] : []),
  ];
  for (const c of candidates) {
    for (let pt = basePt; pt >= minPt - 1e-6; pt -= 0.5) {
      if (textWidthIn(c, pt, bold) <= widthIn) return { text: c, fontSize: pt };
    }
  }
  // 본문 말줄임('…') 금지(골든 오라클): 최소 글꼴에서도 들어가지 않으면 단어 경계로 축약, 그래도 안 되면 라벨 생략 (표에는 전체 상호가 남는다)
  const words = short.split(/\s+/).filter(Boolean);
  for (let n = words.length - 1; n >= 1; n--) {
    const c = words.slice(0, n).join(' ');
    if (c.length >= 2 && textWidthIn(c, minPt, bold) <= widthIn) return { text: c, fontSize: minPt };
  }
  return null;
}

/** 숫자 셀 천 단위 구분 정규화 ('2490.3' → '2,490.3', '7600' → '7,600'), 숫자가 아니면 그대로 */
export function formatNumericCell(text: string): string {
  const s = String(text ?? '').trim();
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s)) return s;
  const dec = (s.split('.')[1] || '').length;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : s;
}

/** 내용 폭 기반 열폭 배분 (열 수 = 헤더 수 유지, Rule 68) — 합계 = totalW */
export function computeRentRollColumnWidths(
  headers: string[], rows: string[][], totalW: number, headerPt: number, bodyPt: number, pad = 0.14,
): number[] {
  const need = headers.map((h, c) => {
    let w = textWidthIn(h, headerPt, true);
    for (const r of rows) w = Math.max(w, textWidthIn(r[c] ?? '', bodyPt, true));
    // 한 열(긴 임차인명 등)이 표 폭을 독식하지 않도록 상한. D7: 텍스트 열(임차인·용도·업종·비고)은 0.30, 숫자 열은 0.24
    const cap = (h === '임차인' || h === '용도' || h === '업종' || h === RENTROLL_NOTE_HEADER) ? 0.30 : 0.24;
    return Math.min(totalW * cap, Math.max(0.42, w + pad));
  });
  const sum = need.reduce((a, b) => a + b, 0);
  const raw = sum <= totalW
    ? need.map(n => n + (totalW - sum) * (n / sum))
    : need.map(n => n * (totalW / sum));
  const rounded = raw.map(v => Math.round(v * 100) / 100);
  const diff = Math.round((totalW - rounded.reduce((a, b) => a + b, 0)) * 100) / 100;
  if (rounded.length > 0) rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + diff) * 100) / 100;
  return rounded;
}

function parseAreaNum(cell: string): number {
  // '209.6 (63.4평)' → 209.6 (㎡ 첫 숫자 토큰만; 평 병기 숫자를 이어붙이지 않는다)
  return parseLeadingNumber(cell);
}

export function buildA24RentrollStacking(input: ArchetypeInput): ArchetypeOutput {
  const warnings: string[] = [];
  
  const data = input.data || {};
  const stackingData = data.stackingPlan || input.data.rentRollFloors || [];
  
  // Rent roll table data
  let tableRows = data.tableRows || (data.tables?.[0]?.rows) || [];
  if (tableRows.length === 0 && Array.isArray(input.data.tables)) {
    const firstTable = input.data.tables[0];
    if (firstTable?.rows?.length > 0) {
      tableRows = firstTable.rows;
    }
  }
  
  if (isSuppressed(input.flags, 'A24')) {
    warnings.push('A24 렌트롤/스태킹 슬라이드 억제 (플래그 지정)');
    return { warnings, suppress: true };
  }

  const slide = light(input.pres);
  L.head(slide, input.slideNum, input.data.kicker || 'Rent Roll', input.data.title || '임대차 현황');

  if (stackingData.length === 0 && tableRows.length === 0) {
    L.fallbackCard(slide, M, 1.62, CW, 4.80, {
      badge: '임대차 실사 안내',
      badgeKind: 'brass',
      title: '임대차 계약 및 렌트롤 상세 실사 프로토콜',
      leadText: '본 자산의 세부 층별 임대차 계약 원장 및 정산 내역은 매수 의향 접수 및 비밀유지협약(NDA) 체결 후 실측 대조가 진행됩니다.',
      checklist: [
        '임대차 계약서 원본 전수 대조 (임대료, 관리비, 계약기간, 만기일 및 갱신 옵션)',
        '보증금 및 월임대료 입금 금융 원장 대조·검증 (체납 내역 및 부가가치세 신고서 정합성)',
        '특약 사항 및 렌트프리(Rent-Free), 핏아웃(Fit-out) 등 실질 유효 임대료(Net Effective Rent) 산정',
        '상가건물 임대차보호법상 계약갱신요구권 행사 가능 여부 및 명도/재계약 리스크 검토',
      ],
      icon: 'document',
    });
    if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
    L.foot(slide, input.slideNum, input.docno);
    warnings.push('A24 렌트롤 데이터 없음 — 임대차 실사 대체 카드 삽입');
    return { slide, warnings };
  }

  // ─── 공통 프레임 ───
  // 표와 스태킹 도식의 상단(헤더 행)·하단(합계 행)을 정렬한다.
  // Rule 65: 스태킹 플랜 ≤ 2.2", 렌트롤 표 ≥ 9.0"
  const topY = 1.80;
  // 중개인 입력 '매입 후 전략' (broker-extras-slides.applyBrokerRentRollPlan) — 있으면 하단에 박스 영역을 예약
  const brokerPlan: string[] = Array.isArray(data.brokerPostAcquisitionPlan)
    ? data.brokerPostAcquisitionPlan.map((s: any) => String(s ?? '').trim()).filter(Boolean).slice(0, 4)
    : [];
  const planBoxH = brokerPlan.length > 0 ? 0.34 + brokerPlan.length * 0.22 + 0.08 : 0;
  const bottomLimit = 6.62 - (planBoxH > 0 ? planBoxH + 0.10 : 0); // SAFE_BOTTOM(6.75) 이내
  const spX = M;
  const spW = 2.20;
  const gap = 0.25;
  const tbX = M + spW + gap;
  const tbW = CW - spW - gap; // ≈ 9.64"

  // binder(rent-roll-table-builder / core-binders)가 만든 R2 10열(+선택 비고 11열) 표인지 — 단위(㎡·만원)가 확정된 표
  const isR2BinderTable = Array.isArray(data.tableHead)
    && (data.tableHead.length === BASIC_RENTROLL_HEADERS.length
      || (data.tableHead.length === BASIC_RENTROLL_HEADERS.length + 1 && String(data.tableHead[BASIC_RENTROLL_HEADERS.length]) === RENTROLL_NOTE_HEADER))
    && BASIC_RENTROLL_HEADERS.every((h, i) => String(data.tableHead[i]) === h);
  const isSummaryRowOf = (r: any[]) => r.some((c: any) => RENTROLL_SUMMARY_CELL.test(String(c || '').trim()));

  // --- 표 모델 (그리기 전에 행 수·행 높이를 확정해 스태킹 도식과 정렬) ---
  let rawRows: any[][] = [];
  let displayRows: any[][] = [];
  let truncated = false;
  let totalCount = 0;
  // D45: Dynamic row height to fit more rows (up to 18 rows comfortably)
  const maxRowsToFit = planBoxH > 0
    ? Math.max(8, Math.min(18, Math.floor((bottomLimit - topY - 0.22) / 0.22) - 1))
    : 18;

  if (tableRows.length > 0) {
    rawRows = tableRows.map((row: any) => {
      const newRow = [...row];
      // Do not splice for 12 columns. Assuming tableRows provides exactly 12 columns.
      return newRow;
    });

    // First row might be header — D45: '층수'/'층' 단독이 아니라 헤더 키워드 2개 이상 매칭 시에만 제거
    // B1층, 1층 등 실데이터가 '층'을 포함하므로 단순 includes('층')으로는 오탐
    const firstRowStr = (rawRows[0] || []).map((c: any) => String(c || '').trim());
    const headerKeywords = ['층수', '면적', '임차인', '보증금', '월세', '계약종료', '관리비', '호실', '업종'];
    const headerMatches = firstRowStr.filter((cell: string) => headerKeywords.some(kw => cell.includes(kw)));
    if (headerMatches.length >= 2) {
      rawRows.shift();
    }

    // D7 Fix: 합계 행이 없으면 자동 합산 추가
    const hasSummaryRow = rawRows.some((r: any) => isSummaryRowOf(r));
    if (!hasSummaryRow && rawRows.length > 0) {
      // 숫자로 읽힌 셀이 하나라도 있으면 합계를 표기 (행이 '0'이면 합계도 '0' — 행/합계 표기 일관성)
      const sums = { area: 0, exc: 0, deposit: 0, rent: 0, mgmt: 0, month: 0 };
      const seen = { deposit: false, rent: false, mgmt: false, month: false };
      const num = (c: any) => {
        // 첫 숫자 토큰 ('209.6 (63.4평)' → 209.6). 숫자가 없으면 NaN ('-', '〃')
        const m = String(c ?? '').match(/\d[\d,]*(?:\.\d+)?/);
        return m ? parseFloat(m[0].replace(/,/g, '')) : NaN;
      };
      for (const r of rawRows) {
        const a = num(r[3]); if (!isNaN(a)) sums.area += a;
        const e = num(r[4]); if (!isNaN(e)) sums.exc += e;
        const d = num(r[5]); if (!isNaN(d)) { sums.deposit += d; seen.deposit = true; }
        const rt = num(r[6]); if (!isNaN(rt)) { sums.rent += rt; seen.rent = true; }
        const mt = num(r[7]); if (!isNaN(mt)) { sums.mgmt += mt; seen.mgmt = true; }
        const tot = num(r[8]); if (!isNaN(tot)) { sums.month += tot; seen.month = true; }
      }
      const totalMonthlySum = (sums.month > 0 ? sums.month : (sums.rent + sums.mgmt));
      const money = (v: number, isSeen: boolean) => (isSeen ? Math.round(v).toLocaleString('en-US') : '-');
      // 합계 면적 정밀도 정합: 행은 소수 1자리로 반올림 표기되므로 행 합에는 최대 (행 수 × 0.05㎡) 오차가 있다.
      // 대장 연면적이 그 오차 범위 안이면(= 행이 건물 전체 면적을 구성) 대장값을 그대로 표기해 개요 슬라이드와 일치시킨다.
      const regTotal = Number(data.registerTotalAreaSqm);
      const areaRows = rawRows.filter((r: any[]) => !isNaN(num(r[3]))).length;
      const snapToRegister = Number.isFinite(regTotal) && regTotal > 0 && sums.area > 0
        && Math.abs(sums.area - regTotal) <= areaRows * 0.05 + 1e-6;
      const totalArea = snapToRegister ? regTotal : sums.area;
      const fmtTotalSqm = (v: number) => snapToRegister
        ? v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
        : formatAreaSqm(v);
      const hasPyeong = rawRows.some((r: any[]) => /평\)/.test(String(r[3] ?? '')));

      rawRows.push([
        '합계',
        `${Math.max(0, rawRows.length - (Number(data.nonLeasableRowCount) > 0 && Number(data.nonLeasableRowCount) < rawRows.length ? Number(data.nonLeasableRowCount) : 0))}개 호실`,
        '-',
        sums.area > 0 ? (hasPyeong ? `${fmtTotalSqm(totalArea)} (${sqmToPyeong(totalArea).toFixed(1)}평)` : fmtTotalSqm(totalArea)) : '-',
        sums.exc > 0 ? formatAreaSqm(sums.exc) : '-',
        money(sums.deposit, seen.deposit),
        money(sums.rent, seen.rent),
        money(sums.mgmt, seen.mgmt),
        money(totalMonthlySum, seen.month || seen.rent || seen.mgmt),
        '-'
      ]);
    }

    displayRows = rawRows;
    totalCount = rawRows.length;
    if (rawRows.length > maxRowsToFit) {
      const summaryRow = rawRows.find((r: any) => isSummaryRowOf(r));
      displayRows = rawRows.filter((r: any) => !isSummaryRowOf(r)).slice(0, maxRowsToFit - 1);
      if (summaryRow) displayRows.push(summaryRow);
      truncated = true;
    }
  }

  const hasTable = displayRows.length > 0;
  const totalRenderRows = displayRows.length + 1; // +1 for header
  const tableBudgetH = bottomLimit - topY - (truncated ? 0.22 : 0);
  const rowH = hasTable ? Math.max(0.22, Math.min(0.36, tableBudgetH / totalRenderRows)) : 0.32;
  const bodyFontSize = rowH >= 0.32 ? 8.5 : rowH >= 0.28 ? 8 : rowH >= 0.25 ? 7.5 : 7;
  const headerFontSize = rowH >= 0.30 ? 9 : bodyFontSize + 0.5;
  const summaryInDisplay = hasTable && isSummaryRowOf(displayRows[displayRows.length - 1]);
  const bodyRowCount = displayRows.length - (summaryInDisplay ? 1 : 0);

  // --- Left Panel: Stacking Plan ---
  // 표와 같은 SSOT(렌트롤 행)에서 단위를 만든다 → 층·임차인·면적 문자열이 표와 1:1 일치 (㎡ 통일, Rule 70)
  const FLOOR_PATTERN = /^(B?\d+F?|지상|지하|옥탑|PH|RF|\d+층)/i;
  const stackRows = rawRows.filter((r: any[]) => !isSummaryRowOf(r));
  const tableIsFloorBased = stackRows.length > 0 && FLOOR_PATTERN.test(String(stackRows[0]?.[0] || '').trim());
  let units: StackingUnit[] = [];
  if (tableIsFloorBased && (isR2BinderTable || stackingData.length === 0)) {
    // F4 fix: 첫 행의 r[0]이 층 패턴에 맞는 경우만 스태킹 플랜으로 변환
    // ssot_summary 합성 행("월 임대료 합계" 등)이 층 이름으로 둔갑하는 시각 오염 방지
    units = stackRows.map((r: any[]) => {
      const floor = String(r[0] || '').trim();
      // R2 10열: [층, 임차인, 용도, 임대면적, 전용면적, 보증금, 월임대료, 관리비, 월합계, 만기일]
      // 레거시 12열: [층, 호실, 용도, 임차인, 면적, …, 만기(11)]
      const is12Col = r.length >= 12;
      const tenantRaw = String(r[is12Col ? 3 : 1] || '').trim();
      const leaseCell = String(r[is12Col ? 4 : 3] || '').trim();
      const excCell = is12Col ? '' : String(r[4] || '').trim();
      const expiry = String(r[is12Col ? 11 : 9] || '').trim();
      // 임대면적 우선, 미기재 시 전용면적 (표에 실제 기입된 값만 사용)
      const areaCell = parseAreaNum(leaseCell) > 0 ? leaseCell : excCell;
      const area = parseAreaNum(areaCell);
      // '209.6 (63.4평)' → 스태킹 라벨은 표와 같은 ㎡ 숫자 토큰만 사용 (평 환산 라벨 금지, Rule 70)
      const areaToken = (String(areaCell).match(/\d[\d,]*(?:\.\d+)?/) ?? [''])[0];
      const isVac = tenantRaw.includes('공실') || floor.includes('공실');
      // D6: 임차인이 '임차인 A' 같은 마스킹 라벨이면 도식에는 용도(업종)를 표기 (익명 라벨은 정보가 없음)
      const useRaw = String(r[2] || '').trim();
      const label = !isVac && MASKED_TENANT_RE.test(tenantRaw) && useRaw && useRaw !== '-' ? useRaw : tenantRaw;
      return {
        unitLabel: floor,
        tenant: isVac ? '공실' : (label || '-'),
        areaSqm: area,
        areaText: area > 0 ? formatNumericCell(areaToken) : '',
        isVacant: isVac,
        expiryYear: parseExpiryYear(expiry) || parseExpiryYear(tenantRaw),
      };
    });
  } else if (stackingData.length > 0) {
    units = (stackingData as FloorInfo[]).map((f: any) => {
      const area = Number(f.leasableAreaM2 ?? f.floorAreaM2 ?? f.exclusiveAreaM2 ?? f.area) || 0;
      const isVac = !!f.isVacant || String(f.tenant || '').includes('공실');
      return {
        unitLabel: String(f.floor ?? ''),
        tenant: isVac ? '공실' : String(f.tenant || f.use || '-'),
        areaSqm: area > 0 ? area : 0,
        areaText: area > 0 ? formatAreaSqm(area) : '',
        isVacant: isVac,
        expiryYear: f.expiryYear ? String(f.expiryYear) : parseExpiryYear(String(f.tenant || '')),
        category: f.category,
      };
    });
  }
  // 층 패턴이 아니면 units를 빈 배열로 유지 → 좌측 스태킹 도식 생략, 우측 테이블만 렌더링

  // 같은 물리 층(9F-A·9F-B)은 한 행으로 묶는다 — 지하(B)부터 지상 순서로 바닥에서 위로 정렬
  let groups = groupStackingFloors(units);
  if (groups.length > 14) {
    // 초고층: 지하층을 1행으로 압축 (임의 용도 라벨을 만들지 않고 층수만 표기)
    const subs = groups.filter(g => g.isSubterranean);
    if (subs.length > 1) {
      const subArea = subs.reduce((a, g) => a + g.totalArea, 0);
      const merged: StackingFloorGroup = {
        key: `B${subs.length}~B1`,
        order: -1,
        isSubterranean: true,
        totalArea: subArea,
        units: [{
          unitLabel: `B${subs.length}~B1`,
          tenant: `지하 ${subs.length}개층`,
          areaSqm: subArea,
          areaText: subArea > 0 ? formatAreaSqm(subArea) : '',
          isVacant: false,
          category: 'parking',
        }],
      };
      groups = [merged, ...groups.filter(g => !g.isSubterranean)];
    }
  }

  if (groups.length > 0) {
    const G = groups.length;
    const bandH = rowH; // 헤더 띠·범례 띠 = 표 헤더 행·합계 행과 같은 높이
    const bodyTop = topY + bandH;
    const maxBodyH = Math.max(0.5, bottomLimit - topY - bandH * 2);
    const targetBodyH = hasTable ? bodyRowCount * rowH : maxBodyH;
    const lo = Math.min(0.22, maxBodyH / G);
    const hi = Math.min(0.55, maxBodyH / G);
    const hPerFloor = Math.min(hi, Math.max(lo, targetBodyH / G));
    const bodyH = G * hPerFloor;

    // 헤더 띠 (표 헤더 행과 동일 높이·색) — 단위 명시
    slide.addShape('rect', {
      x: spX, y: topY, w: spW, h: bandH,
      fill: { color: C.ink }, line: { color: C.ink, width: 0.5 },
    });
    slide.addText('층별 스태킹 플랜 (㎡)', {
      x: spX, y: topY, w: spW, h: bandH,
      fontSize: fitSingleLine('층별 스태킹 플랜 (㎡)', spW - 0.12, headerFontSize, 7, true).fontSize,
      bold: true, color: C.bg, align: 'center', valign: 'middle', fontFace: KR, margin: 0, wrap: false,
    });

    // G-11: 만기 연도 색상 — 실제 그려지는 단위 기준으로 수집하여 범례와 바 일치 보장
    const usedYears = new Set<string>();
    let hasVacant = false;
    groups.forEach(g => g.units.forEach(u => {
      if (u.isVacant) { hasVacant = true; return; }
      // G-11: EXPIRY_HEATMAP_PALETTE에 정의된 연도만 범례에 포함 — 미정의 연도는 기본 회색
      if (u.expiryYear && EXPIRY_HEATMAP_PALETTE[u.expiryYear]) usedYears.add(u.expiryYear);
    }));

    // 셋백: 지상 기준층(중앙값) 대비 비율 — 지하 대형층이 지상층 폭을 깎아내리지 않도록
    const aboveAreas = groups.filter(g => !g.isSubterranean && g.totalArea > 0).map(g => g.totalArea).sort((a, b) => a - b);
    const allAreas = groups.filter(g => g.totalArea > 0).map(g => g.totalArea).sort((a, b) => a - b);
    const pool = aboveAreas.length > 0 ? aboveAreas : allAreas;
    const stdArea = pool.length > 0 ? pool[Math.floor((pool.length - 1) / 2)] : 0;
    const ratios = groups.map(g => (g.totalArea > 0 && stdArea > 0)
      ? calculateSetbackRatio(g.totalArea, stdArea, g.isSubterranean)
      : 1.0);
    const maxRatio = Math.max(...ratios, 1.0);

    const labelW = 0.52; // Rule 70: 층 라벨 ≥ 0.50"
    const barRegionX = spX + 0.60;
    const maxBarW = spW - 0.62;
    const unitW = maxBarW / maxRatio;

    // D45: 층수가 많을수록 폰트 축소
    const floorFontSize = hPerFloor >= 0.40 ? 10 : hPerFloor >= 0.30 ? 9 : hPerFloor >= 0.22 ? 8 : 7;
    const labelBasePt = Math.min(hPerFloor >= 0.40 ? 8.5 : hPerFloor >= 0.30 ? 8 : 7.5, ((hPerFloor - 0.08) * 72) / 1.15);
    const labelMinPt = Math.min(STACK_MIN_PT, labelBasePt);

    groups.forEach((group, idx) => {
      const rowY = bodyTop + bodyH - (idx + 1) * hPerFloor;
      const floorBarW = unitW * ratios[idx];
      const floorBarX = barRegionX + (maxBarW - floorBarW) / 2;

      // Floor label
      slide.addText(String(group.key).replace(/층$/, ''), {
        x: spX, y: rowY, w: labelW, h: hPerFloor,
        fontSize: floorFontSize, bold: true, color: C.ink, align: 'right', valign: 'middle',
        fontFace: KR, margin: 0, wrap: false,
      });

      // 분할 임대: 면적 비례 좌우 세그먼트 (면적 미기재 시 균등 분할)
      const n = group.units.length;
      const allHaveArea = group.units.every(u => u.areaSqm > 0);
      let widths = group.units.map(u => (allHaveArea && group.totalArea > 0)
        ? floorBarW * (u.areaSqm / group.totalArea)
        : floorBarW / n);
      const minSeg = 0.20;
      if (n > 1 && n * minSeg <= floorBarW && widths.some(w => w < minSeg)) {
        const small = widths.map(w => w < minSeg);
        const fixed = small.filter(Boolean).length * minSeg;
        const restSum = widths.reduce((a, w, i) => a + (small[i] ? 0 : w), 0);
        widths = widths.map((w, i) => small[i] ? minSeg : (restSum > 0 ? (w / restSum) * (floorBarW - fixed) : w));
      }

      let segX = floorBarX;
      group.units.forEach((unit, uIdx) => {
        const segW = widths[uIdx];
        const isVacant = unit.isVacant;
        let fillCol = 'E2E8F0';
        if (isVacant) {
          fillCol = 'FBEFE8';
        } else if (unit.expiryYear && EXPIRY_HEATMAP_PALETTE[unit.expiryYear]) {
          fillCol = EXPIRY_HEATMAP_PALETTE[unit.expiryYear];
        }

        // Bar segment
        slide.addShape('rect', {
          x: segX, y: rowY + 0.035, w: segW, h: hPerFloor - 0.07,
          fill: { color: fillCol },
          line: isVacant
            ? { dashType: 'dash' as const, color: 'B05A2E', width: 1.0 }
            : { color: '5B6B73', width: 0.75 },
        });

        // 한 줄 라벨: '임차인 209.6㎡' → 좁으면 '임차인' (표와 같은 ㎡ 문자열)
        const lbl = hPerFloor >= 0.14
          ? chooseStackLabel(unit.tenant, unit.areaText, segW - 0.10, labelBasePt, labelMinPt, isVacant)
          : null;
        if (lbl) {
          slide.addText(lbl.text, {
            x: segX + 0.03, y: rowY + 0.035, w: Math.max(0.05, segW - 0.06), h: hPerFloor - 0.07,
            fontSize: lbl.fontSize, bold: isVacant, color: isVacant ? 'B05A2E' : '3A3A3A',
            align: 'center', valign: 'middle', fontFace: KR, margin: 0, wrap: false,
          });
        }
        segX += segW;
      });
    });

    // Ground line divider if B floors exist — 'GL' 라벨은 층 라벨 열 좌측(층 라벨은 우측 정렬)에 두어 겹침 방지
    const bCount = groups.filter(g => g.isSubterranean).length;
    if (bCount > 0 && bCount < G) {
      const groundY = bodyTop + bodyH - bCount * hPerFloor;
      slide.addShape('line', {
        x: barRegionX - 0.04, y: groundY, w: maxBarW + 0.06, h: 0,
        line: { color: '94A3B8', width: 1.25, dashType: 'dash' as const },
      });
      slide.addText('GL', {
        x: spX, y: groundY - 0.08, w: 0.24, h: 0.16,
        fontSize: 6.5, color: '64748B', fontFace: KR, align: 'left', valign: 'middle', bold: true, margin: 0, wrap: false,
      });
    }

    // 범례 띠 (표 합계 행과 같은 높이) — 공실 / 만기 연도
    const legendY = bodyTop + bodyH;
    type LegendItem = { label: string; color?: string; vacant?: boolean };
    const legendPt = 7;
    const yearsSorted = Array.from(usedYears).sort();
    const buildLegend = (shortYear: boolean): LegendItem[] => [
      ...(hasVacant ? [{ label: '공실', color: 'FBEFE8', vacant: true }] : []),
      ...(yearsSorted.length > 0 ? [{ label: '만기' }] : []), // 색상 의미 표기 (스와치 없음)
      ...yearsSorted.map(y => ({ label: shortYear ? `'${y.slice(2)}` : y, color: EXPIRY_HEATMAP_PALETTE[y] || C.line2 })),
    ];
    const itemW = (it: LegendItem) => (it.color ? 0.17 : 0) + textWidthIn(it.label, legendPt, !!it.vacant) + 0.10;
    let legendItems = buildLegend(false);
    if (legendItems.reduce((a, it) => a + itemW(it), 0) > spW - 0.04) legendItems = buildLegend(true);
    let lx = spX + 0.04;
    for (const item of legendItems) {
      const w = itemW(item);
      if (lx + w - 0.06 > spX + spW) break;
      let tx = lx;
      if (item.color) {
        slide.addShape('rect', {
          x: lx, y: legendY + (bandH - 0.12) / 2, w: 0.13, h: 0.12, fill: { color: item.color },
          line: item.vacant ? { dashType: 'dash' as const, color: 'B05A2E', width: 0.75 } : { color: '5B6B73', width: 0.5 },
        });
        tx = lx + 0.17;
      }
      slide.addText(item.label, {
        x: tx, y: legendY, w: textWidthIn(item.label, legendPt, !!item.vacant) + 0.06, h: bandH,
        fontSize: legendPt, color: item.vacant ? 'B05A2E' : '5B6B73', bold: !!item.vacant,
        fontFace: KR, valign: 'middle', margin: 0, wrap: false,
      });
      lx += w;
    }
  }

  // (D-RR) 기존 '※ 렌트롤 현황 기준 층별 공간 배치도' 각주는 제거 — 도식 하단과 겹치고,
  // 헤더 띠 '층별 스태킹 플랜 (㎡)'가 같은 정보를 전달하므로 중복 (Rule 4)

  // --- Right Panel: Rent Roll Table ---
  // 표 데이터는 표준 10열(층·임차인·용도·임대면적·전용면적·보증금·월임대료·관리비·월합계·만기일)로 만들고,
  // 렌더 직전에 사용자가 기입한 면적 열만 남기도록 투영한다 (HEADERS/colW 는 아래 areaProj 에서 확정).
  if (hasTable) {
    // 면적 열 투영 — 임대면적/전용면적 중 사용자가 기입한 것(둘 중 하나 또는 둘 다)만 표기.
    // 헤더·열폭·셀을 같은 keep 인덱스로 투영해 열 수 = 셀 수를 유지한다 (rule 68).
    const areaProj = projectBasicRentRollColumns(rawRows);
    const HEADERS = areaProj.headers;

    // 셀 문자열 확정 (숫자 열은 천 단위 구분 통일: 2490.3 → 2,490.3)
    const cellTexts: string[][] = displayRows.map((row: any[]) => areaProj.keep.map((ci, k) => {
      // D7(d): '미기재/미상/확인 필요/N/A' → '-' 를 맞춤(fit) 이전에 적용 (긴 플레이스홀더가 '미기…' 로 잘리는 문제 방지)
      const text = normalizeMissing(String(row[ci] ?? '').replace(/\*\*/g, ''));
      return isNumericRentRollHeader(HEADERS[k]) ? formatNumericCell(text) : text;
    }));

    // 열폭: 내용 폭 기반 배분 (셀 줄바꿈 방지) — 합계 = tbW
    const colW = computeRentRollColumnWidths(HEADERS, cellTexts, tbW, headerFontSize, bodyFontSize);

    // Render table
    const tableData: any[][] = [];
    const cellMargin = L.getDynamicTableMargin(rowH);
    const usable = (w: number) => Math.max(0.1, w - 0.12);

    // Header
    tableData.push(HEADERS.map((h, cIdx) => {
      const fitted = fitSingleLine(h, usable(colW[cIdx] ?? 0.8), headerFontSize, 7, true);
      return {
        text: fitted.text,
        options: { fill: C.ink, color: C.bg, fontSize: fitted.fontSize, bold: true, align: 'center', margin: cellMargin }
      };
    }));

    // Body
    displayRows.forEach((row: any, i: number) => {
      const isSummary = isSummaryRowOf(row);
      // 공실 판정은 층·임차인·용도 칸 기준 (면적 칸이 아님)
      const isVacant = !isSummary && row.slice(0, 3).some((c: any) => String(c || '').includes('공실'));
      const isSelfUse = row.some((c: any) => /자가|자가사용/.test(String(c || '')));

      const fill = isSummary ? C.tint : (isVacant ? 'FBEFE8' : (isSelfUse ? C.tint : (i % 2 === 0 ? C.bg : 'F3F6F7')));
      const color = isVacant ? 'B05A2E' : (isSummary ? C.ink : (isSelfUse ? C.slate : '2B2B2B'));
      const bold = isSummary || isVacant;

      const mappedRow = cellTexts[i].map((text, cIdx) => {
        let fitted = fitSingleLine(text, usable(colW[cIdx] ?? 0.8), bodyFontSize, Math.min(7, bodyFontSize), bold);
        const isTextCol = ['임차인', '용도', '업종', RENTROLL_NOTE_HEADER].includes(HEADERS[cIdx]);
        if (fitted.truncated && isTextCol && rowH >= 0.30) {
          // D7: 한 줄로 안 들어가는 텍스트 열은 최대 2줄(≤7.5pt)로 전체 표기 — 말줄임은 최후 수단
          for (let pt = Math.min(bodyFontSize, 7.5); pt >= 7 - 1e-6; pt -= 0.5) {
            if (L.simulateTextWrap(text, usable(colW[cIdx] ?? 0.8), pt).lines.length <= 2) {
              fitted = { text, fontSize: pt, truncated: false };
              break;
            }
          }
        }
        return {
          text: fitted.text,
          options: {
            fill, color, fontSize: fitted.fontSize, bold,
            align: isNumericRentRollHeader(HEADERS[cIdx]) ? 'right' : ((cIdx === 1 || HEADERS[cIdx] === RENTROLL_NOTE_HEADER) ? 'left' : 'center'),
            fontFace: KR,
            margin: cellMargin,
          }
        };
      });
      tableData.push(mappedRow);
    });

    slide.addTable(tableData, {
      x: tbX, y: topY, w: tbW, colW,
      border: { type: 'solid', color: C.line, pt: 0.3 },
      rowH,
      valign: 'middle',
      autoPage: false,
    });

    // 단위 표기 (binder가 ㎡·만원으로 확정한 R2 표일 때만) — 헤더 셀은 표준 명칭 유지
    if (isR2BinderTable) {
      slide.addText(cellTexts.some(r => r.some(c => /평\)/.test(c))) ? '면적 ㎡ (평) · 금액 만원' : '면적 ㎡ · 금액 만원', {
        x: tbX, y: topY - 0.26, w: tbW, h: 0.22,
        fontSize: 8, color: '7A8794', align: 'right', valign: 'bottom', fontFace: KR, margin: 0,
      });
    }
    // 전 호실 공통 비고(binder 가 열에서 분리) — 단위 표기 줄 왼쪽에 1회만 표기
    const commonNote = typeof data.commonNote === 'string' ? data.commonNote.trim() : '';
    if (commonNote) {
      slide.addText(`비고(공통): ${commonNote}`, {
        x: tbX, y: topY - 0.26, w: tbW * 0.62, h: 0.22,
        fontSize: 8, color: '7A8794', align: 'left', valign: 'bottom', fontFace: KR, margin: 0,
      });
    }

    if (truncated) {
      slide.addText(`(전체 ${totalCount - 1}건 중 ${maxRowsToFit - 1}건 표시)`, {
        x: tbX, y: topY + totalRenderRows * rowH + 0.03, w: tbW, h: 0.18,
        fontSize: Math.max(bodyFontSize - 1, 7), color: '7A8794', align: 'right', fontFace: KR, margin: 0
      });
    }
  }

  if (planBoxH > 0) {
    L.callout(slide, M, bottomLimit + 0.10, CW, planBoxH, 'brass', '매입 후 전략 · 중개인입력', brokerPlan.join('\n'));
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}
