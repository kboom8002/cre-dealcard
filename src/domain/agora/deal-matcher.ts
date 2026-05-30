/**
 * Deal Matcher — CRE Agora
 *
 * 질문 텍스트에서 CRE 엔티티를 추출하여
 * building_ssot_lite에서 관련 딜카드를 매칭합니다.
 */

import type { CRERegion } from "./qis-seed-generator";

export interface CREEntityExtract {
  regions: CRERegion[];
  assetTypes: string[];
  priceSignals: string[];
  intent: "buy" | "sell" | "lease" | "invest" | "manage" | "legal" | "finance" | null;
}

// ── Keyword Maps ───────────────────────────────────────────────────
const REGION_KEYWORDS: Record<CRERegion, string[]> = {
  gbd: ["강남", "서초", "역삼", "gbd", "삼성동", "테헤란로"],
  ybd: ["여의도", "ybd", "영등포"],
  cbd: ["종로", "광화문", "을지로", "cbd", "중구"],
  seongsu: ["성수", "뚝섬", "성동"],
  pangyo: ["판교", "분당", "정자"],
  mapo: ["마포", "공덕", "상암"],
  jongno: ["종로", "인사동", "북촌", "경복궁"],
  hongdae: ["홍대", "연남", "합정", "망원"],
};

const ASSET_TYPE_KEYWORDS: Record<string, string[]> = {
  "오피스":    ["오피스", "사무실", "사무공간", "office"],
  "리테일":    ["상가", "소매", "리테일", "retail", "점포"],
  "F&B":      ["식당", "카페", "음식점", "f&b", "먹거리"],
  "물류":      ["물류", "창고", "logistics", "배송센터"],
  "오피스텔":  ["오피스텔", "주거용 오피스"],
  "빌딩":     ["빌딩", "건물", "building"],
};

const INTENT_KEYWORDS: Record<NonNullable<CREEntityExtract["intent"]>, string[]> = {
  buy:     ["매수", "매입", "구매", "취득", "인수"],
  sell:    ["매각", "매도", "팔다", "처분", "양도"],
  lease:   ["임대", "임차", "세입자", "공실", "렌트"],
  invest:  ["투자", "수익률", "캡레이트", "noi", "roi", "irr"],
  manage:  ["관리", "pm", "fm", "보수", "리모델링", "유지"],
  legal:   ["세금", "세무", "법률", "양도세", "취득세", "법인세", "임대차보호"],
  finance: ["대출", "pf", "브릿지", "리파이낸싱", "금융", "ltv"],
};

/**
 * 질문 텍스트에서 CRE 엔티티 추출
 */
export function extractCREEntities(text: string): CREEntityExtract {
  const lower = text.toLowerCase();

  const regions: CRERegion[] = [];
  for (const [region, keywords] of Object.entries(REGION_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      regions.push(region as CRERegion);
    }
  }

  const assetTypes: string[] = [];
  for (const [type, keywords] of Object.entries(ASSET_TYPE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      assetTypes.push(type);
    }
  }

  // 가격 시그널 추출
  const priceSignals: string[] = [];
  const pricePatterns = [
    /\d+억/g, /\d+백억/g, /\d+천억/g,
    /\d+조/g, /\d+만원/g,
  ];
  for (const pattern of pricePatterns) {
    const matches = text.match(pattern);
    if (matches) priceSignals.push(...matches);
  }

  // 인텐트 추출 (첫 번째 매칭)
  let intent: CREEntityExtract["intent"] = null;
  for (const [intentKey, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      intent = intentKey as CREEntityExtract["intent"];
      break;
    }
  }

  return { regions, assetTypes, priceSignals, intent };
}

/**
 * 추출된 엔티티로 Supabase 쿼리 파라미터 생성
 */
export function buildDealMatchQuery(entities: CREEntityExtract): {
  regions: string[];
  assetTypes: string[];
  limit: number;
} {
  return {
    regions: entities.regions.length > 0 ? entities.regions : [],
    assetTypes: entities.assetTypes,
    limit: 3,
  };
}

/**
 * 권역에서 시세 리포트 URL 생성
 */
export function getMarketReportUrl(region: CRERegion | null): string | null {
  if (!region) return null;
  return `/market/${region}`;
}

/**
 * 관련 카테고리에서 관련 질문 URL 생성
 */
export function getRelatedQuestionsUrl(
  category: string,
  region: CRERegion | null
): string {
  const base = `/agora/${category}`;
  return region ? `${base}?region=${region}` : base;
}
