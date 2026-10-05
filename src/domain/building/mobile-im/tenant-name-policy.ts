/**
 * @file tenant-name-policy.ts
 * @description IM(모바일 뷰어·PPTX) 임차인명 정책 — 오너 결정(D1): IM 전 구간 **실제 임차인명(렌트롤 상호)** 을 표기한다.
 *
 *  - 공개 티저/매거진(NDA 이전)만 업종 대체 마스킹을 유지한다 (guardrails.ts publicBlocked 경로).
 *  - 구 '임차인 상호 전량 마스킹([임차인A])' 과 '유명 브랜드 일괄 마스킹' 은 폐지.
 *  - 대신 **날조 검증**: 유명 브랜드명이 본문에 있는데 렌트롤(floor_leases)에는 없으면 LLM 이 만들어낸 상호이므로
 *    그 브랜드만 중립 표현으로 치환한다 (렌트롤에 실제로 있는 브랜드는 그대로 통과).
 */

/** 날조 검증 대상 유명 브랜드 (구 im-section-generator famousBrands 와 동일 집합) */
export const FAMOUS_BRANDS: readonly string[] = [
  '스타벅스', '맥도날드', '투썸플레이스', '올리브영', '다이소', '버거킹', '파리바게뜨', 'CU', 'GS25', '이마트',
];

/** 날조 브랜드 치환어 — 본문 문장 흐름을 유지하는 중립 표현 (레거시 '[임차인]' 라벨 아님) */
export const FABRICATED_BRAND_REPLACEMENT = '임차 업체';

/** 렌트롤 한 행에서 '렌트롤에 실재하는 상호/업종 문자열' 후보를 모은다 */
function leaseNameCandidates(lease: unknown): string[] {
  const l = (lease ?? {}) as Record<string, unknown>;
  return [l.tenant_name, l.tenantName, l.tenant, l.tenant_type, l.tenantType, l.tenant_sector, l.business_type, l.note]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);
}

/** 렌트롤 텍스트(상호·업종·비고)를 하나로 합친 검색 풀 — 브랜드 실재 여부 판정용 */
export function buildRentRollNamePool(floorLeases: ReadonlyArray<unknown> | null | undefined): string {
  if (!Array.isArray(floorLeases)) return '';
  return floorLeases.flatMap(leaseNameCandidates).join('\n');
}

/** 렌트롤의 실제 상호(tenant_name) 목록 (2자 이상, 중복 제거) — 진단/테스트용 */
export function collectRentRollTenantNames(floorLeases: ReadonlyArray<unknown> | null | undefined): string[] {
  if (!Array.isArray(floorLeases)) return [];
  const names = floorLeases
    .map((lease) => {
      const l = (lease ?? {}) as Record<string, unknown>;
      return String(l.tenant_name ?? l.tenantName ?? '').trim();
    })
    .filter((n) => n.length >= 2);
  return [...new Set(names)];
}

export interface FabricatedBrandResult {
  text: string;
  /** 렌트롤에 없어서 치환된 브랜드 */
  flagged: string[];
}

/**
 * 유명 브랜드 날조 검증 (D1). 렌트롤에 없는 유명 브랜드만 '임차 업체' 로 치환한다.
 * - 렌트롤(floor_leases)이 비어 있으면 모든 유명 브랜드가 근거 없는 상호이므로 치환 대상이다.
 * - '스타벅스 당산점' 처럼 뒤따르는 지점명(…점)까지 함께 치환한다 (구 로직과 동일한 소비 범위).
 */
export function maskFabricatedBrands(
  markdown: string,
  floorLeases: ReadonlyArray<unknown> | null | undefined,
): FabricatedBrandResult {
  const pool = buildRentRollNamePool(floorLeases);
  const flagged: string[] = [];
  let text = markdown;
  for (const brand of FAMOUS_BRANDS) {
    if (!text.includes(brand)) continue;
    if (pool.includes(brand)) continue; // 렌트롤에 실재 → 실명 그대로 통과
    // 영문 약어(CU/GS25)는 다른 영단어 일부와 충돌하지 않도록 경계 처리
    const escaped = brand.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const core = /^[A-Za-z0-9]+$/.test(brand) ? `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])` : escaped;
    const re = new RegExp(`${core}(?:\\s*[가-힣]*점)?`, 'g');
    const next = text.replace(re, FABRICATED_BRAND_REPLACEMENT);
    if (next !== text) {
      flagged.push(brand);
      text = next;
    }
  }
  return { text, flagged };
}
