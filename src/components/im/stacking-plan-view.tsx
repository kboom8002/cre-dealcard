'use client';

/**
 * @file stacking-plan-view.tsx
 * @description 건축 입면 셋백(Setback) 스태킹 플랜 인터랙티브 웹 뷰어 컴포넌트
 *
 * Spec:
 * - 상층부 테라스 후퇴(10F~11F), 지표면(GL ±0.0m), 지하층(B1F~B6F) 깊이감 반영 SVG 단면 실루엣.
 * - 층별 호버/탭 인터랙션: 테넌트 상세 팝오버 및 렌트롤 표 연동 하이라이트.
 * - 5대 의미적 컬러코드(앵커, 일반, 리테일, 주차/기계, 공실) 및 만기연도 범례 필터.
 * - 모바일(360px~393px) 및 데스크톱 반응형 뷰 지원.
 * - Rule 1 (페르소나 격리) 및 Rule 2 (CRE 실무 표준 용어) 준수.
 */

import React, { useState, useMemo } from 'react';
import type { StackingPlanFloor, StackingPlanSummary, TenantCategory } from '@/domain/building/mobile-im/types';
import { sqmToPyeong, pyeongToSqm } from "@/lib/utils/area-conversion";
import { PYEONG_TO_SQM_V15, areaUnitLabel, resolveAreaInputUnit, sqmToInputUnit, type AreaInputUnit } from '@/domain/building/mobile-im/rentroll-meta';

export interface StackingPlanViewProps {
  stackingPlan?: StackingPlanFloor[];
  summary?: StackingPlanSummary;
  rawMarkdown?: string;
  tables?: Array<{ headers: string[]; rows: string[][] }>;
  buildingName?: string;
  /** 렌트롤 입력 단위(G9, doc.body.rent_roll_meta.area_input_unit). 없으면 마크다운 머리글 단위 → ㎡ */
  areaInputUnit?: AreaInputUnit;
}

const CATEGORY_STYLES: Record<TenantCategory, {
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeText: string;
  label: string;
}> = {
  anchor: {
    bg: 'bg-blue-900/80 hover:bg-blue-800',
    border: 'border-blue-500/60',
    text: 'text-blue-100',
    badgeBg: 'bg-blue-500/20',
    badgeText: 'text-blue-400',
    label: '앵커 테넌트',
  },
  general: {
    bg: 'bg-slate-800/80 hover:bg-slate-700',
    border: 'border-slate-600/60',
    text: 'text-slate-200',
    badgeBg: 'bg-slate-600/20',
    badgeText: 'text-slate-300',
    label: '일반 업무',
  },
  retail: {
    bg: 'bg-teal-900/80 hover:bg-teal-800',
    border: 'border-teal-500/60',
    text: 'text-teal-100',
    badgeBg: 'bg-teal-500/20',
    badgeText: 'text-teal-400',
    label: '리테일/근생',
  },
  parking: {
    bg: 'bg-neutral-800/80 hover:bg-neutral-700',
    border: 'border-neutral-700/60',
    text: 'text-neutral-400',
    badgeBg: 'bg-neutral-700/20',
    badgeText: 'text-neutral-400',
    label: '주차/기계',
  },
  vacant: {
    bg: 'bg-red-950/80 hover:bg-red-900',
    border: 'border-red-500/60',
    text: 'text-red-200',
    badgeBg: 'bg-red-500/20',
    badgeText: 'text-red-400',
    label: '공실',
  },
};

/** 머리글에서 면적 단위 추출: '전용(㎡)' → sqm, '임대(평)' → pyeong, 단위 없음 → null */
function headerAreaUnit(header?: string): AreaInputUnit | null {
  if (!header) return null;
  if (/㎡|m²|m2/i.test(header)) return 'sqm';
  if (/\(\s*평\s*\)|평/.test(header)) return 'pyeong';
  return null;
}

/** 표기용: ㎡ 정본(우선) / 평 → 입력 단위 숫자+단위 토큰. 값이 없으면 '-' (모든 셀이 단위를 가진다) */
function fmtFloorArea(m2: number | undefined, py: number | undefined, unit: AreaInputUnit): string {
  const hasM2 = typeof m2 === 'number' && Number.isFinite(m2) && m2 > 0;
  const hasPy = typeof py === 'number' && Number.isFinite(py) && py > 0;
  let v: number | null = null;
  if (unit === 'pyeong') v = hasPy ? Math.round((py as number) * 100) / 100 : (hasM2 ? sqmToInputUnit(m2 as number, 'pyeong') : null);
  else v = hasM2 ? Math.round((m2 as number) * 100) / 100 : (hasPy ? sqmToInputUnit((py as number) * PYEONG_TO_SQM_V15, 'sqm') : null);
  return v == null ? '-' : `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${areaUnitLabel(unit)}`;
}

/** 면적 셀 파싱: '96평(약 317.4㎡)' / '317.4㎡' / 머리글 단위가 있는 순수 숫자. 단위 불명 숫자는 undefined (평으로 가정하지 않음) */
function extractArea(text: string | undefined, hdrUnit: AreaInputUnit | null): { py?: number; m2?: number } {
  if (!text) return {};
  const clean = text.trim();
  const fromPy = (py: number) => ({ py, m2: Math.round(py * PYEONG_TO_SQM_V15 * 100) / 100 });
  const fromM2 = (m2: number) => ({ m2, py: sqmToInputUnit(m2, 'pyeong') ?? undefined });
  // 1. "96평(약 317.4㎡)" 또는 "96평" — 셀 안의 단위 토큰이 머리글보다 우선
  const pyMatch = clean.match(/([\d,]+(?:\.\d+)?)\s*평/);
  if (pyMatch) return fromPy(parseFloat(pyMatch[1].replace(/,/g, '')));
  // 2. "317.4㎡" 또는 "317.4m²"
  const m2Match = clean.match(/([\d,]+(?:\.\d+)?)\s*(?:㎡|m²|m2)/i);
  if (m2Match) return fromM2(parseFloat(m2Match[1].replace(/,/g, '')));
  // 3. 순수 숫자 — 머리글 단위로만 해석 (금액 '만', 날짜 '-' 등 혼입 제외)
  const numMatch = clean.match(/^[\d,]+(?:\.\d+)?$/);
  if (numMatch && hdrUnit) {
    const n = parseFloat(numMatch[0].replace(/,/g, ''));
    return hdrUnit === 'sqm' ? fromM2(n) : fromPy(n);
  }
  return {};
}

/** 마크다운 테이블 파싱 보조 함수 — 면적 머리글 단위(㎡|평)를 함께 반환 */
export interface ParsedFloorsFromMarkdown { floors: StackingPlanFloor[]; unit: AreaInputUnit | null }
const EMPTY_PARSE: ParsedFloorsFromMarkdown = { floors: [], unit: null };
export function parseFloorsFromMarkdown(markdown?: string): ParsedFloorsFromMarkdown {
  if (!markdown) return EMPTY_PARSE;
  const lines = markdown.split('\n').map(l => l.trim());
  
  // 파이프 기호(| ... |)를 포함하는 라인 추출 (후행 마크다운 헤더 등 혼입 방어)
  const tableLines: string[] = [];
  for (const l of lines) {
    const firstPipe = l.indexOf('|');
    const lastPipe = l.lastIndexOf('|');
    if (firstPipe !== -1 && lastPipe > firstPipe) {
      tableLines.push(l.substring(firstPipe, lastPipe + 1));
    }
  }
  if (tableLines.length < 3) return EMPTY_PARSE;

  // '층'을 포함하는 헤더 라인 찾기
  let headerLineIdx = -1;
  let floorIdx = -1;
  let headers: string[] = [];

  for (let i = 0; i < tableLines.length; i++) {
    const cells = tableLines[i].split('|').slice(1, -1).map(h => h.trim());
    if (cells.every(c => /^[-:]+$/.test(c))) continue;
    const idx = cells.findIndex(h => h.includes('층'));
    if (idx !== -1) {
      headerLineIdx = i;
      floorIdx = idx;
      headers = cells;
      break;
    }
  }

  if (headerLineIdx === -1 || floorIdx === -1) return EMPTY_PARSE;

  const useIdx = headers.findIndex(h => h.includes('용도') || h.includes('업종'));
  const exIdx = headers.findIndex(h => h.includes('전용'));
  // '임대면적' 또는 '계약면적'을 찾되, '월 임대료'나 '임대 만기' 등 오매칭 방지
  const leaseIdx = headers.findIndex(h => 
    h.includes('임대면적') || h.includes('계약면적') || h.includes('바닥') || (h.includes('임대') && !h.includes('료') && !h.includes('만기') && !h.includes('보증금'))
  );
  const tenantIdx = headers.findIndex(h => h.includes('입주') || h.includes('임차') || h.includes('테넌트') || h.includes('상호'));
  const expiryIdx = headers.findIndex(h => h.includes('만기'));

  const floors: StackingPlanFloor[] = [];
  let startIdx = headerLineIdx + 1;
  if (startIdx < tableLines.length && tableLines[startIdx].split('|').slice(1, -1).every(c => /^[-:]+$/.test(c.trim()))) {
    startIdx++;
  }

  for (let i = startIdx; i < tableLines.length; i++) {
    const rawCells = tableLines[i].split('|').slice(1, -1);
    // 새로운 구분선이나 다른 테이블 시작 시 중단
    if (rawCells.every(c => /^[-:]+$/.test(c.trim()))) break;
    const cells = rawCells.map(c => c.trim().replace(/[*_`]/g, ''));
    if (cells.length <= floorIdx) continue;
    const floor = cells[floorIdx];
    if (!floor || floor.includes('합계') || floor.includes('층수') || floor.includes('구분')) continue;

    // 실제 층 표기 형태 검증 (예: B1, 1F, 1F, 2F, 2층, 지하1층 등)
    if (!/^(?:B\d+|\d+F|\d+층|지하|\d+F\s*,\s*\d+F)/i.test(floor.trim())) {
      continue;
    }

    const use = useIdx !== -1 ? cells[useIdx] : '근린생활시설';
    const tenant = tenantIdx !== -1 ? cells[tenantIdx] : (useIdx !== -1 ? cells[useIdx] : '-');
    const exArea = exIdx !== -1 ? extractArea(cells[exIdx], headerAreaUnit(headers[exIdx])) : {};
    const leaseArea = leaseIdx !== -1 ? extractArea(cells[leaseIdx], headerAreaUnit(headers[leaseIdx])) : {};
    const exclusiveAreaPy = exArea.py;
    const leasableAreaPy = leaseArea.py;
    const expStr = expiryIdx !== -1 ? cells[expiryIdx].replace(/[^\d]/g, '') : '';

    let expiryYear = expStr ? parseInt(expStr, 10) : undefined;
    if (expiryYear && expiryYear < 100) expiryYear += 2000;
    else if (expiryYear && expiryYear > 2100) {
      expiryYear = parseInt(String(expiryYear).slice(0, 4), 10);
    }

    const isParking = use.includes('주차') || tenant.includes('주차') || use.includes('기계') || tenant.includes('기계');
    const isAnchor = tenant.includes('사옥') || tenant.includes('본사') || (exclusiveAreaPy != null && exclusiveAreaPy > 200);
    const isRetail = use.includes('근린') || use.includes('근생') || tenant.includes('편의점') || tenant.includes('의원') || tenant.includes('베이커리') || tenant.includes('약국') || tenant.includes('카페') || tenant.includes('소매점') || tenant.includes('헬스');
    const isVacant = tenant.includes('공실') || use.includes('공실');

    let category: TenantCategory = 'general';
    if (isVacant) category = 'vacant';
    else if (isParking) category = 'parking';
    else if (isAnchor) category = 'anchor';
    else if (isRetail) category = 'retail';

    // Wave 9.2 / Rule 34: 특정 픽스처(NH 사옥)의 셋백 형상(10F·11F 테라스, 1F·2F 축소, B6F 심도)을
    // 모든 매물에 적용하던 하드코딩 제거 — 실측 형상 데이터가 없으므로 균일 폭으로 도식화
    const setbackRatio = 1.0;

    floors.push({
      floor,
      use,
      tenant,
      exclusiveAreaPy,
      exclusiveAreaM2: exArea.m2,
      leasableAreaPy,
      leasableAreaM2: leaseArea.m2,
      floorAreaPy: leasableAreaPy ?? exclusiveAreaPy,
      expiryYear: expiryYear && expiryYear > 1900 && expiryYear < 2100 ? expiryYear : undefined,
      isVacant,
      category,
      setbackRatio,
      hasTerrace: false,
    });
  }

  // 표기 단위: 임대면적 머리글 > 전용면적 머리글 (없으면 호출측 기본값)
  const unit = (leaseIdx !== -1 ? headerAreaUnit(headers[leaseIdx]) : null) ?? (exIdx !== -1 ? headerAreaUnit(headers[exIdx]) : null);
  return { floors, unit };
}

export function StackingPlanView({
  stackingPlan: propFloors,
  summary: propSummary,
  rawMarkdown,
  buildingName,
  areaInputUnit,
}: StackingPlanViewProps) {
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<TenantCategory | 'all'>('all');

  // 데이터 정규화: 실데이터 없으면 빈 배열 반환 (목데이터 누출 차단)
  const parsedMarkdown = useMemo(
    () => (propFloors && propFloors.length > 0 ? null : parseFloorsFromMarkdown(rawMarkdown)),
    [propFloors, rawMarkdown],
  );
  const floors = useMemo(() => {
    if (propFloors && propFloors.length > 0) {
      return propFloors;
    }
    if (parsedMarkdown && parsedMarkdown.floors.length > 0) return parsedMarkdown.floors;

    return [];
  }, [propFloors, parsedMarkdown]);

  // v1.5 §9.1: 표기 단위 = 렌트롤 입력 단위(prop) > 마크다운 머리글 단위 > ㎡. 숫자만 단독으로 평으로 간주하지 않는다.
  const displayUnit: AreaInputUnit = areaInputUnit
    ? resolveAreaInputUnit({ area_input_unit: areaInputUnit })
    : (parsedMarkdown?.unit ?? 'sqm');

  // 지상층 및 지하층 분리 + 정렬 (건물 입면: 높은 층이 위)
  const parseFloorNum = (f: string): number => {
    const upper = f.toUpperCase().replace(/[F층]/g, '');
    if (upper.includes('옥상') || upper === 'R' || upper === 'PH') return 99;
    if (upper.startsWith('B')) return -(parseInt(upper.slice(1)) || 1);
    return parseInt(upper) || 0;
  };
  const aboveFloors = useMemo(() =>
    floors.filter(f => !f.floor.toUpperCase().startsWith('B'))
      .sort((a, b) => parseFloorNum(b.floor) - parseFloorNum(a.floor)), // 5F→4F→3F→2F→1F
    [floors]);
  const belowFloors = useMemo(() =>
    floors.filter(f => f.floor.toUpperCase().startsWith('B'))
      .sort((a, b) => parseFloorNum(b.floor) - parseFloorNum(a.floor)), // B1→B2→B3
    [floors]);

  // 현재 선택된 층 정보
  const activeFloor = useMemo(() => {
    if (!selectedFloor) return null;
    return floors.find(f => f.floor === selectedFloor) || null;
  }, [floors, selectedFloor]);

  // 요약 지표 (Wave 9.2 / Rule 34: 픽스처 하드코딩 폴백 제거 — 실데이터에서 산출하거나 null)
  const summary = useMemo(() => {
    const areaOf = (f: StackingPlanFloor) => f.floorAreaPy || f.exclusiveAreaPy || 0;
    const totalFromFloors = Math.round(floors.reduce((sum, f) => sum + areaOf(f), 0) * 10) / 10;
    const gfaFromSummary = propSummary?.totalGrossAreaPy;
    const totalGfa = gfaFromSummary || (totalFromFloors > 0 ? totalFromFloors : 0);
    const gfaIsRegister = !!gfaFromSummary;

    const exclusiveRate: number | null = propSummary?.exclusiveRatePct ?? null;

    // WALE: 만기연도가 있는 임대 층의 면적 가중 잔여기간
    let wale: number | null = propSummary?.waleYears ?? null;
    if (wale == null) {
      const nowYear = new Date().getFullYear();
      const leased = floors.filter(f => !f.isVacant && f.expiryYear && areaOf(f) > 0);
      const w = leased.reduce((s, f) => s + areaOf(f), 0);
      if (w > 0) {
        wale = Math.round((leased.reduce((s, f) => s + Math.max(0, (f.expiryYear as number) - nowYear) * areaOf(f), 0) / w) * 10) / 10;
      }
    }

    // 공실률: 면적 기준 (공실 면적 / 렌트롤 면적 합계)
    const vacantFloors = floors.filter(f => f.isVacant);
    let vacancy: number | null = propSummary?.vacancyRatePct ?? null;
    if (vacancy == null && totalFromFloors > 0) {
      const vacantArea = vacantFloors.reduce((s, f) => s + areaOf(f), 0);
      vacancy = Math.round((vacantArea / totalFromFloors) * 1000) / 10;
    }
    const unitVacancyPct = floors.length > 0 ? Math.round((vacantFloors.length / floors.length) * 1000) / 10 : null;

    return { totalGfa, gfaIsRegister, exclusiveRate, wale, vacancy, vacantCount: vacantFloors.length, unitVacancyPct };
  }, [propSummary, floors]);

  // 층 정보가 없으면 렌더링하지 않음 (모의 건물 누출 완전 차단)
  if (floors.length === 0) {
    return null;
  }

  return (
    <div className="w-full rounded-2xl bg-neutral-900 border border-neutral-800 p-4 sm:p-6 text-white space-y-6 mt-3">
      {/* ── 상단 헤더 및 4대 KPI 요약 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              ARCHITECTURAL STACKING
            </span>
            <h3 className="text-base sm:text-lg font-black text-white">
              {buildingName ? `${buildingName} ` : ''}층별 스태킹 플랜
            </h3>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            렌트롤 기준 층별 임차 구성 · 만기 · 공실 현황
          </p>
        </div>

        {/* 필터 범례 칩스 */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all border ${
              filterCategory === 'all'
                ? 'bg-neutral-100 text-neutral-950 border-white'
                : 'bg-neutral-800/60 text-neutral-400 border-neutral-700 hover:text-white'
            }`}
          >
            전체 ({floors.length})
          </button>
          {(Object.keys(CATEGORY_STYLES) as TenantCategory[]).map(cat => {
            const style = CATEGORY_STYLES[cat];
            const isFilter = filterCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold transition-all border ${
                  isFilter
                    ? 'bg-primary/20 text-primary border-primary'
                    : 'bg-neutral-800/60 text-neutral-400 border-neutral-700 hover:text-neutral-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${style.badgeBg} border ${style.border}`} />
                {style.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 4대 핵심 KPI 카드 ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-3">
          <p className="text-[11px] font-medium text-neutral-400">{summary.gfaIsRegister ? '연면적' : '임대면적 합계'}</p>
          <p className="text-base sm:text-lg font-black text-white mt-0.5">
            {summary.totalGfa.toLocaleString()} <span className="text-xs font-normal text-neutral-400">평</span>
          </p>
          <p className="text-[10px] text-neutral-500 mt-0.5">{summary.gfaIsRegister ? '건축물대장 기준' : `렌트롤 ${floors.length}개 구획 합산`}</p>
        </div>
        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-3">
          <p className="text-[11px] font-medium text-neutral-400">전용률</p>
          <p className="text-base sm:text-lg font-black text-white mt-0.5">
            {summary.exclusiveRate != null ? <>{summary.exclusiveRate} <span className="text-xs font-normal text-neutral-400">%</span></> : '-'}
          </p>
          <p className="text-[10px] text-neutral-500 mt-0.5">{summary.exclusiveRate != null ? '전용/임대 면적 기준' : '공용면적 자료 없음'}</p>
        </div>
        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-3">
          <p className="text-[11px] font-medium text-neutral-400">WALE (잔여 임대)</p>
          <p className="text-base sm:text-lg font-black text-amber-400 mt-0.5">
            {summary.wale != null ? <>{summary.wale} <span className="text-xs font-normal text-neutral-400">년</span></> : '-'}
          </p>
          <p className="text-[10px] text-neutral-500 mt-0.5">{summary.wale != null ? '면적 가중 · 만기연도 기준' : '렌트롤 만기 정보 없음'}</p>
        </div>
        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-3">
          <p className="text-[11px] font-medium text-neutral-400">공실률</p>
          <p className={`text-base sm:text-lg font-black mt-0.5 ${summary.vacancy ? 'text-red-400' : 'text-emerald-400'}`}>
            {summary.vacancy != null ? <>{summary.vacancy} <span className="text-xs font-normal text-neutral-400">%</span></> : '-'}
          </p>
          <p className="text-[10px] text-neutral-500 mt-0.5">
            {summary.vacancy == null
              ? '면적 자료 없음'
              : summary.vacantCount === 0
                ? '전 구획 임대 중'
                : `면적 기준 · 공실 ${summary.vacantCount}/${floors.length}구획(${summary.unitVacancyPct}%)`}
          </p>
        </div>
      </div>

      {/* ── 중앙 인터랙티브 단면 실루엣 & 팝오버 패널 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 좌측: 건축 입면 셋백 단면 실루엣 (7 cols) */}
        <div className="lg:col-span-7 flex flex-col items-center justify-start bg-neutral-950/80 rounded-xl border border-neutral-800 p-4 sm:p-5 relative overflow-hidden">
          <div className="w-full flex items-center justify-between text-xs text-neutral-400 mb-3 px-1">
            <span className="font-bold flex items-center gap-1.5">
              <span>🏢</span> 건축 입면 단면 실루엣
            </span>
            <span className="text-[11px] text-neutral-500">
              * 층을 탭/클릭하면 상세 제원이 동기화됩니다
            </span>
          </div>

          <div className="w-full flex flex-col items-center space-y-1 py-1 max-w-[480px]">
            {/* 1) 지상층 렌더링 */}
            {aboveFloors.map((floor, fIdx) => {
              const category = floor.category || 'general';
              const style = CATEGORY_STYLES[category];
              const isSelected = selectedFloor === floor.floor;
              const isDimmed = filterCategory !== 'all' && filterCategory !== category;
              const widthPct = Math.min(100, Math.max(48, Math.round((floor.setbackRatio ?? 1.0) * 82)));

              return (
                <div
                  key={`${floor.floor}-${fIdx}`}
                  className="w-full flex items-center justify-center relative group"
                >
                  <button
                    onClick={() => setSelectedFloor(isSelected ? null : floor.floor)}
                    style={{ width: `${widthPct}%` }}
                    className={`h-7 sm:h-8 rounded-md transition-all duration-200 px-2 flex items-center justify-between border text-xs font-semibold relative ${
                      isSelected
                        ? 'ring-2 ring-amber-400 border-amber-300 shadow-lg scale-[1.02] z-10'
                        : isDimmed
                        ? 'opacity-30 border-neutral-800 bg-neutral-900'
                        : `${style.bg} ${style.border} shadow-sm`
                    }`}
                  >
                    <span className="font-bold shrink-0 text-[11px] sm:text-xs">
                      {floor.floor}
                    </span>
                    <span className="truncate mx-2 text-[11px] font-normal text-left flex-1">
                      {floor.tenant || floor.use || '-'}
                    </span>
                    {floor.expiryYear && floor.expiryYear > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${style.badgeBg} ${style.badgeText}`}>
                        &apos;{String(floor.expiryYear).slice(-2)}
                      </span>
                    )}
                  </button>

                  {/* 옥외 테라스 셋백 태그 */}
                  {floor.hasTerrace && (
                    <span className="absolute right-0 sm:right-2 text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30 shrink-0 hidden sm:inline-block">
                      🌿 테라스
                    </span>
                  )}
                </div>
              );
            })}

            {/* 2) 지표면 GL 라인 */}
            <div className="w-full flex items-center gap-2 py-1.5 my-0.5">
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-neutral-500 to-transparent" />
              <span className="text-[10px] sm:text-[11px] font-bold text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded-full border border-neutral-700">
                지표면 (GL ±0.0m)
              </span>
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-neutral-500 to-transparent" />
            </div>

            {/* 3) 지하층 렌더링 (깊이감 표현) */}
            <div className="w-full flex flex-col items-center space-y-1 bg-neutral-900/30 p-1.5 rounded-lg border border-neutral-800/40">
              {belowFloors.map((floor, bIdx) => {
                const category = floor.category || 'parking';
                const style = CATEGORY_STYLES[category];
                const isSelected = selectedFloor === floor.floor;
                const isDimmed = filterCategory !== 'all' && filterCategory !== category;
                const widthPct = Math.min(100, Math.max(75, Math.round((floor.setbackRatio ?? 1.25) * 75)));
                const depth = floor.depthMeters ?? null; // Rule 34: 층당 -3.5m 추정치 표시 제거

                return (
                  <div
                    key={`${floor.floor}-b${bIdx}`}
                    className="w-full flex items-center justify-center relative group"
                  >
                    {/* 지하 심도 지표 (실데이터 있을 때만) */}
                    {depth != null && (
                      <span className="absolute left-1 text-[9px] text-neutral-500 font-mono hidden sm:inline-block">
                        {depth}m
                      </span>
                    )}

                    <button
                      onClick={() => setSelectedFloor(isSelected ? null : floor.floor)}
                      style={{ width: `${widthPct}%` }}
                      className={`h-6 sm:h-7 rounded-md transition-all duration-200 px-2 flex items-center justify-between border text-xs font-semibold relative ${
                        isSelected
                          ? 'ring-2 ring-amber-400 border-amber-300 shadow-lg scale-[1.02] z-10'
                          : isDimmed
                          ? 'opacity-30 border-neutral-800 bg-neutral-900'
                          : `${style.bg} ${style.border} shadow-sm`
                      }`}
                    >
                      <span className="font-bold shrink-0 text-[10px] sm:text-[11px]">
                        {floor.floor}
                      </span>
                      <span className="truncate mx-2 text-[10px] sm:text-[11px] font-normal text-left flex-1">
                        {floor.tenant || floor.use || '-'}
                      </span>
                      {floor.expiryYear && floor.expiryYear > 0 && (
                        <span className={`text-[9px] px-1 py-0.2 rounded font-bold shrink-0 ${style.badgeBg} ${style.badgeText}`}>
                          &apos;{String(floor.expiryYear).slice(-2)}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 우측: 선택된 층 상세 인스펙터 및 렌트롤 매트릭스 (5 cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          {/* 활성 층 인스펙터 카드 */}
          <div className="rounded-xl bg-neutral-950/80 border border-neutral-800 p-4">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2.5">
              <span className="text-xs font-bold text-neutral-400">
                🔍 층별 상세 인스펙터
              </span>
              {activeFloor ? (
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${CATEGORY_STYLES[activeFloor.category || 'general'].badgeBg} ${CATEGORY_STYLES[activeFloor.category || 'general'].badgeText}`}>
                  {CATEGORY_STYLES[activeFloor.category || 'general'].label}
                </span>
              ) : (
                <span className="text-[11px] text-neutral-500">층을 선택하세요</span>
              )}
            </div>

            {activeFloor ? (
              <div className="mt-3 space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-black text-white">{activeFloor.floor}</span>
                  <span className="text-xs font-medium text-neutral-300 truncate max-w-[200px]">
                    {activeFloor.tenant}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-neutral-900/60 p-2 rounded-lg border border-neutral-800">
                    <p className="text-[10px] text-neutral-400">주용도</p>
                    <p className="font-semibold text-neutral-200 truncate mt-0.5">{activeFloor.use || '-'}</p>
                  </div>
                  <div className="bg-neutral-900/60 p-2 rounded-lg border border-neutral-800">
                    <p className="text-[10px] text-neutral-400">계약 만기</p>
                    <p className="font-semibold text-amber-400 mt-0.5">
                      {activeFloor.expiryYear ? `${activeFloor.expiryYear}년` : '해당없음'}
                    </p>
                  </div>
                  <div className="bg-neutral-900/60 p-2 rounded-lg border border-neutral-800">
                    <p className="text-[10px] text-neutral-400">전용면적</p>
                    <p className="font-semibold text-neutral-200 mt-0.5">
                      {fmtFloorArea(activeFloor.exclusiveAreaM2, activeFloor.exclusiveAreaPy, displayUnit)}
                    </p>
                  </div>
                  <div className="bg-neutral-900/60 p-2 rounded-lg border border-neutral-800">
                    <p className="text-[10px] text-neutral-400">임대면적</p>
                    <p className="font-semibold text-neutral-200 mt-0.5">
                      {fmtFloorArea(activeFloor.leasableAreaM2, activeFloor.leasableAreaPy, displayUnit)}
                    </p>
                  </div>
                </div>

                {activeFloor.hasTerrace && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-2">
                    <span className="text-emerald-400 text-sm">🌿</span>
                    <span className="text-xs text-emerald-300 font-medium">
                      건축 인허가 셋백 구조로 전용 옥외 테라스 서비스 공간 제공
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-neutral-500">
                좌측 단면 실루엣에서 층을 클릭하거나 아래 표에서 행을 선택하세요.
              </div>
            )}
          </div>

          {/* 층별 데이터 매트릭스 표 (미니 테이블) */}
          <div className="rounded-xl bg-neutral-950/80 border border-neutral-800 p-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-neutral-400">📊 층별 임대차 매트릭스</span>
              <span className="text-[11px] text-neutral-500">{floors.length}개 층</span>
            </div>

            <div className="max-h-[260px] overflow-y-auto rounded border border-neutral-800 text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-neutral-900 text-[11px] text-neutral-400 sticky top-0 border-b border-neutral-800">
                  <tr>
                    <th className="py-1.5 px-2">층</th>
                    <th className="py-1.5 px-2">주요 입주사</th>
                    <th className="py-1.5 px-2 text-right">전용({areaUnitLabel(displayUnit)})</th>
                    <th className="py-1.5 px-2 text-right">만기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-mono text-[11px]">
                  {floors.map((f, tIdx) => {
                    const isSelected = selectedFloor === f.floor;
                    return (
                      <tr
                        key={`${f.floor}-${tIdx}`}
                        onClick={() => setSelectedFloor(isSelected ? null : f.floor)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-amber-500/20 text-white font-bold' : 'hover:bg-neutral-800/50 text-neutral-300'
                        }`}
                      >
                        <td className="py-1 px-2 font-bold">{f.floor}</td>
                        <td className="py-1 px-2 font-sans truncate max-w-[120px]">{f.tenant}</td>
                        <td className="py-1 px-2 text-right">
                          {fmtFloorArea(f.exclusiveAreaM2, f.exclusiveAreaPy, displayUnit)}
                        </td>
                        <td className="py-1 px-2 text-right text-amber-400">
                          {f.expiryYear ? `${f.expiryYear}` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* 하단 법적/실무 주석 */}
      <div className="text-[11px] text-neutral-500 leading-relaxed border-t border-neutral-800 pt-3 flex items-start gap-1.5">
        <span className="text-amber-500 shrink-0">※</span>
        <span>
          본 스태킹 플랜은 중개인 제공 렌트롤 기준이며, 단면 형상은 층 구성을 보여주는 도식으로 실제 건축 형태와 다를 수 있습니다.
        </span>
      </div>
    </div>
  );
}
