/**
 * 표시용 면적 단일 해석기 (unified fact resolver — 면적 부분, 표시 전용).
 *
 * 배경 (2026-10-10 income 골든 오라클):
 *   - 요약 스탯·요약 포인트·개요 하이라이트가 각자 ssot/heroCard 값을 읽어, 개요 표는 대장값(420.6㎡)으로
 *     스냅되는데 다른 면은 중개인 값(424.6㎡ / 128.4평)이 그대로 남는 슬라이드 간 불일치가 있었다.
 *   - 중개인 연면적 오기(1,141.15 vs 대장 1,441.15, 26% 괴리)가 '건축물대장 기준' 개요 표에 그대로 노출됐다.
 *
 * 정책:
 *   - 대장이 "신뢰 가능"(같은 건물로 판정되어 무효화되지 않았고, 건폐율·용적률·사용승인일 중 하나 이상 보유)할 때만 대장값을 쓴다.
 *   - 대지면적: 중개인(필지 합 등) 값과 대장 platArea 가 1% 이내면 대장 정밀값. 1% 초과는 중개인 값 유지
 *     (다필지 합 vs 대표 필지 대장 등 정당한 차이가 있을 수 있음).
 *   - 연면적: 신뢰 가능한 대장이 있으면 대장값이 정본. 1% 초과 괴리 시 경고를 남긴다(중개인 검토용).
 *   - 값이 없으면 undefined (0·추정값 생성 금지, Rule 34).
 * 순수 함수 — LLM 무관, 결정론.
 */

import { normalizeBuildingRegister } from '@/lib/external/building-register-normalize';

export interface DisplayAreaInput {
  /** 중개인/SSoT 대지면적(㎡) — 필지 합 포함 */
  brokerLandSqm?: number | null;
  /** 중개인/SSoT 연면적(㎡) */
  brokerGfaSqm?: number | null;
  /** enrichment.buildingRegister (원형 그대로) */
  register?: Record<string, any> | null;
}

export type DisplayAreaSource = 'broker' | 'register' | 'none';

export interface DisplayAreas {
  landSqm?: number;
  gfaSqm?: number;
  landSource: DisplayAreaSource;
  gfaSource: DisplayAreaSource;
  warnings: string[];
}

export const AREA_SNAP_TOLERANCE = 0.01;

const pos = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** 대장이 이 건물의 공부로 신뢰 가능한지 (2배 괴리 무효화 이력 없음 + 건물 고유 사실 보유) */
export function isRegisterTrustworthy(reg: Record<string, any> | null | undefined): boolean {
  if (!reg || typeof reg !== 'object') return false;
  if (Array.isArray(reg._areaConflictInvalidated) && reg._areaConflictInvalidated.length > 0) return false;
  const n = normalizeBuildingRegister(reg);
  return pos(n.bcRat) != null || pos(n.vlRat) != null || /^\d{4}/.test(String(n.useAprDay ?? ''));
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function resolveDisplayAreas(input: DisplayAreaInput): DisplayAreas {
  const warnings: string[] = [];
  const reg = input.register ?? null;
  const trusted = isRegisterTrustworthy(reg);
  const nreg = trusted ? normalizeBuildingRegister(reg) : null;
  const regLand = pos(nreg?.platArea);
  const regGfa = pos(nreg?.totalArea);
  const bLand = pos(input.brokerLandSqm);
  const bGfa = pos(input.brokerGfaSqm);

  // 대지면적
  let landSqm: number | undefined;
  let landSource: DisplayAreaSource = 'none';
  if (bLand != null) {
    if (regLand != null && Math.abs(bLand - regLand) / regLand <= AREA_SNAP_TOLERANCE) {
      landSqm = regLand; landSource = 'register';
    } else {
      landSqm = bLand; landSource = 'broker';
    }
  } else if (regLand != null) {
    landSqm = regLand; landSource = 'register';
  }

  // 연면적
  let gfaSqm: number | undefined;
  let gfaSource: DisplayAreaSource = 'none';
  if (regGfa != null) {
    gfaSqm = regGfa; gfaSource = 'register';
    if (bGfa != null && Math.abs(bGfa - regGfa) / regGfa > AREA_SNAP_TOLERANCE) {
      warnings.push(`연면적 불일치: 중개인 ${fmt(bGfa)}㎡ ≠ 건축물대장 ${fmt(regGfa)}㎡ — 대장 기준 표기 (중개인 확인 필요)`);
    }
  } else if (bGfa != null) {
    gfaSqm = bGfa; gfaSource = 'broker';
  }

  return { landSqm, gfaSqm, landSource, gfaSource, warnings };
}
