/**
 * @file src/lib/deal-card/memo-pairing.ts
 * @description 메모 우선(Memo-First) 딜카드 파싱 · 1:1 상시 페어링 · 3대 상태 그룹핑 도메인 모듈
 *
 * 핵심 원칙:
 * 1. 원본 메모(memoText)는 중개사 전용 비공개 정보(번지·건물명·상호·연락처·협상 조건 포함 가능)로,
 *    공개 블라인드 Card4 객체에는 절대 섞지 않고 페어링 메타데이터로 분리 관리한다.
 * 2. parseMemoIntoCard4 는 원문에서 권역·용도·매물유형·면적·블라인드 가격 구간·장점 3줄·한 줄 제목을
 *    결정론적으로 즉시 추출하며, 번지·건물명·브랜드 상호는 cleanBlindPoints 로 100% 마스킹한다.
 * 3. 좌측 목록은 'ai_memo' (AI 메모 생성 딜카드) · 'unconverted_memo' (딜카드 미생성 메모) · 'manual' (직접 작성 딜카드)
 *    3대 그룹으로 분류하며, 매수 조건(buyer_condition) 및 일정(schedule_event) 메모는 기본적으로 제외한다.
 */

import type { Card4Data, DealCardGenerationSource, DealCardPosture } from "./card4-schema";
import { m2ToPyeong } from "@/domain/building/im-core/facts/area";
import { formatPriceRange, parseKoreanPriceKrw, validateBlindPriceBand } from "./price-band";
import { cleanBlindPoints, validateBlindPoints } from "./blind-guard";
import {
  DEAL_CARD_LINE_MAX,
  deriveDealCardHeadline,
  repairDealCardLine,
  repairDealCardPoints,
} from "./copy-limits";

export type DealCardOriginGroup = "ai_memo" | "unconverted_memo" | "manual";

export interface UnconvertedMemoItem {
  id: string;
  memoText: string;
  routingType: string;
  routingSummary?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  isPinned?: boolean;
}

export interface ExtractedMemoFacts {
  yieldPct?: number;
  completionYear?: number;
  remodelingYear?: number;
  roadContact?: string;
  roadWidthMeters?: number;
  subwayWalkMinutes?: number;
  floorsLabel?: string;
  zoning?: string;
  parkingCount?: number;
  parkingType?: "자주식" | "기계식";
  hasElevator?: boolean;
  occupancyStatus?: string;
  anchorCategory?: string;
  farPotential?: string;
  landUnitPriceHint?: string;
  memoSummary?: string;
}

/**
 * 매수 조건(buyer_condition) · 일정(schedule_event) 등 딜카드 매물 소싱이 목적이 아닌 메모를
 * 기본적으로 딜카드 미생성 메모 그룹에서 제외한다.
 */
export function isDealCandidateMemo(
  routingType?: string | null,
  includeOtherMemos = false
): boolean {
  if (includeOtherMemos) return true;
  const rt = (routingType || "new_deal").trim().toLowerCase();
  if (rt === "buyer_condition" || rt === "schedule_event") {
    return false;
  }
  return true;
}

/**
 * 딜카드의 생성 출처 그룹을 판별한다:
 * - 'ai_memo': 메모에서 AI/파서로 생성된 딜카드
 * - 'manual': 메모 없이 직접 작성했거나 IM에서 동기화된 딜카드
 */
export function classifyDealCardOriginGroup(input: {
  card4?: Partial<Card4Data> | null;
  generationSource?: DealCardGenerationSource | string | null;
  inputType?: string | null;
  pairedMemoId?: string | null;
}): "ai_memo" | "manual" {
  const explicitSource = input.generationSource || input.card4?.generationSource;
  if (explicitSource === "ai_memo") return "ai_memo";
  if (explicitSource === "manual") return "manual";
  if (input.inputType === "broker_memo") return "ai_memo";
  if (input.pairedMemoId || input.card4?.pairedMemoId) return "ai_memo";
  return "manual";
}

/**
 * 좌측 목록 카드에 표시할 중개사 전용 1줄 메모 프리뷰를 생성한다.
 */
export function summarizeMemoOneLine(memoText?: string | null, maxChars = 36): string {
  const normalized = String(memoText || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}…`;
}

/**
 * 고속 AI 카피 정제(/api/broker/deal-card/ai-copy)에 전달할 구조화 사실 및 블라인드 정제 요약을 추출한다.
 * 연락처·번지·건물 고유명·상호는 사전 제거하여 프롬프트 오염을 원천 차단한다.
 */
export function extractMemoStructuredFacts(memoText: string): ExtractedMemoFacts {
  const text = String(memoText || "").trim();
  if (!text) return {};

  const facts: ExtractedMemoFacts = {};

  const yieldMatch = text.match(/(?:수익률|연\s*수익률|캡레이트|cap\s*rate)\s*[:：]?\s*(?:약\s*)?(\d+(?:\.\d+)?)\s*%/i);
  if (yieldMatch) {
    const val = parseFloat(yieldMatch[1]);
    if (Number.isFinite(val) && val > 0 && val < 30) {
      facts.yieldPct = Math.round(val * 10) / 10;
    }
  }

  const yearMatch = text.match(/(19\d{2}|20\d{2})\s*년\s*(?:준공|신축|리모델링|사용승인)/);
  if (yearMatch) {
    const yr = parseInt(yearMatch[1], 10);
    if (yr >= 1960 && yr <= 2035) {
      facts.completionYear = yr;
    }
  }

  const remodelMatch = text.match(/(19\d{2}|20\d{2})\s*년\s*(?:올\s*)?(?:리모델링|대수선|올수리)/);
  if (remodelMatch) {
    const yr = parseInt(remodelMatch[1], 10);
    if (yr >= 1980 && yr <= 2035) {
      facts.remodelingYear = yr;
    }
  }

  const walkMatch = text.match(/도보\s*(\d{1,2})\s*분/);
  if (walkMatch) {
    const mins = parseInt(walkMatch[1], 10);
    if (mins > 0 && mins <= 30) {
      facts.subwayWalkMinutes = mins;
    }
  }

  const roadWidthMatch =
    text.match(/(\d+(?:\.\d+)?)\s*m\s*(?:[×x*]\s*\d+(?:\.\d+)?\s*m\s*)?(?:도로|접도|코너|각지|대로변|양면)/i) ||
    text.match(/(?:도로\s*폭?|접도)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*m/i);
  if (roadWidthMatch) {
    const w = parseFloat(roadWidthMatch[1]);
    if (Number.isFinite(w) && w >= 2 && w <= 80) {
      facts.roadWidthMeters = w;
    }
  }

  if (/코너|각지/.test(text)) {
    const prefix = facts.roadWidthMeters ? `${facts.roadWidthMeters}m ` : "";
    facts.roadContact = /대로변/.test(text) ? `${prefix}대로변 코너`.trim() : `${prefix}코너 입지`.trim();
  } else if (/대로변/.test(text)) {
    const prefix = facts.roadWidthMeters ? `${facts.roadWidthMeters}m ` : "";
    facts.roadContact = `${prefix}대로변 접면`.trim();
  }

  const floorMatch = text.match(/(?:지하\s*\d+층\s*[~/·-]?\s*)?지상\s*\d+층|B\d+\s*[~/·-]\s*\d+F/i);
  if (floorMatch) {
    facts.floorsLabel = floorMatch[0].replace(/\s+/g, "");
  }

  const zoningMatch = text.match(/(?:제[123]종\s*)?(?:일반|전용|준)?(?:주거|상업|공업)지역/);
  if (zoningMatch) {
    facts.zoning = zoningMatch[0];
  }

  const parkingMatch =
    text.match(/(자주식|기계식)\s*(?:주차\s*)?(?:약\s*)?(\d{1,3})\s*대/) ||
    text.match(/주차\s*(?:[:：]?\s*)?(?:약\s*)?(자주식|기계식)?\s*(\d{1,3})\s*대/);
  if (parkingMatch) {
    const pCount = parseInt(parkingMatch[2], 10);
    if (Number.isFinite(pCount) && pCount > 0 && pCount <= 500) {
      facts.parkingCount = pCount;
    }
    if (parkingMatch[1] === "자주식" || parkingMatch[1] === "기계식") {
      facts.parkingType = parkingMatch[1];
    } else if (/자주식/.test(text)) {
      facts.parkingType = "자주식";
    } else if (/기계식/.test(text)) {
      facts.parkingType = "기계식";
    }
  }

  if (/(?:승강기|엘리베이터|E\/?V)/i.test(text) && !/(?:승강기|엘리베이터|E\/?V)\s*(?:없|무)/i.test(text)) {
    facts.hasElevator = true;
  }

  if (/전\s*층\s*만실|올\s*만실/.test(text)) {
    facts.occupancyStatus = "전 층 만실";
  } else if (/즉시\s*입주|명도\s*완료/.test(text)) {
    facts.occupancyStatus = "즉시 입주 가능";
  } else if (/명도\s*(?:가능|협의)/.test(text)) {
    facts.occupancyStatus = "명도 협의 가능";
  } else if (/만실|공실\s*없/.test(text)) {
    facts.occupancyStatus = "만실 운영";
  }

  // 연락처 제거 후 블라인드 정제된 안전 요약 생성 (브랜드·번지·건물명 사전 마스킹)
  const withoutPhones = text
    .replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g, "")
    .replace(/\d{2,3}-\d{3,4}-\d{4}/g, "");
  const cleanedSummary = cleanBlindPoints([withoutPhones])[0]
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);

  // 1층/핵심 업종은 반드시 블라인드 일반 카테고리로만 추출
  if (/스타벅스|투썸플레이스|이디야|블루보틀|할리스|카페|커피/.test(text)) {
    facts.anchorCategory = "대형 카페·식음료";
  } else if (/병원|의원|메디컬|치과|피부과|정형외과|한의원/.test(text)) {
    facts.anchorCategory = "병의원·의료 업종";
  } else if (/약국/.test(text)) {
    facts.anchorCategory = "약국·생활근생";
  } else if (/국민은행|신한은행|하나은행|우리은행|농협은행|기업은행|은행/.test(text)) {
    facts.anchorCategory = "시중 은행";
  } else if (/올리브영|다이소|파리바게뜨|뚜레쥬르|서브웨이|맥도날드|버거킹|편의점|프랜차이즈/.test(text)) {
    facts.anchorCategory = "우량 프랜차이즈";
  } else if (/전시장|쇼룸/.test(text)) {
    facts.anchorCategory = "전시장·쇼룸";
  } else if (/사옥|오피스/.test(text)) {
    facts.anchorCategory = "오피스·사옥 업종";
  }

  const farMatch = text.match(/(?:잔여\s*용적률|용적률\s*(?:여유|잔존|미달|상향)|신축\s*가능|증축\s*가능|합필\s*신축)/);
  if (farMatch) {
    facts.farPotential = farMatch[0].replace(/\s+/g, " ").trim();
  }

  const landPriceMatch = (cleanedSummary || text).match(/(?:토지|대지)?\s*평당\s*[\d,.]+\s*만?원?(?:\s*대)?/);
  if (landPriceMatch) {
    facts.landUnitPriceHint = landPriceMatch[0].replace(/\s+/g, " ").trim();
  }

  if (cleanedSummary) {
    facts.memoSummary = cleanedSummary;
  }

  return facts;
}

export interface ExtractedMemoExactDetails {
  exactAddress?: string;
  buildingName?: string;
  askingPriceManwon?: number;
  completionYear?: number;
  floorsAbove?: number;
  floorsBelow?: number;
  landAreaSqm?: number;
  gfaSqm?: number;
  zoning?: string;
  parkingCount?: number;
}

const PYEONG_TO_SQM = 3.305785;
const GENERIC_BLDG_NAMES = new Set(["근생", "올근생", "꼬마", "신축", "오피스", "메디컬", "리모델링"]);

/**
 * [IM 연계 전용] 중개사 원본 메모에서 IM 프리필용 정밀 원시 수치(실주소·건물명·정확한 매매가·층수·준공연도·면적)를 추출한다.
 * 공개 딜카드(Card4)가 아닌 브로커 내부 IM 워크스페이스 초안 생성에만 사용한다.
 */
export function extractMemoExactAddressAndPrice(memoText: string): ExtractedMemoExactDetails {
  const text = String(memoText || "").trim();
  if (!text) return {};
  const details: ExtractedMemoExactDetails = {};

  const addrMatch = text.match(
    /((?:서울(?:특별시|시)?|부산(?:광역시|시)?|대구(?:광역시|시)?|인천(?:광역시|시)?|광주(?:광역시|시)?|대전(?:광역시|시)?|울산(?:광역시|시)?|세종(?:특별자치시|시)?|경기(?:도)?|강원(?:특별자치도|도)?|충북|충남|전북|전남|경북|경남|제주(?:특별자치도|도)?|[가-힣]{2,6}(?:시|구|군))\s+(?:[가-힣]{1,6}(?:구|군|시)\s+)?[가-힣0-9]{1,8}(?:동(?:\d+가)?|읍|면|리|\d+가)\s+(?:산\s*)?\d{1,5}(?:-\d{1,5})?(?:\s*,\s*\d{1,5}(?:-\d{1,5})?)*)/
  );
  if (addrMatch) {
    details.exactAddress = addrMatch[1].replace(/\s+/g, " ").trim();
    const tail = text.slice((addrMatch.index ?? 0) + addrMatch[0].length);
    const bldgMatch = tail.match(
      /^\s+([가-힣A-Za-z0-9]{2,15})(빌딩|타워|스퀘어|펠리스|팰리스|프라자|플라자|센터|캐슬|하우스|맨션)(?=\s|,|$)/
    );
    if (bldgMatch && !GENERIC_BLDG_NAMES.has(bldgMatch[1])) {
      details.buildingName = bldgMatch[0];
    }
  }

  const askMatch = text.match(
    /(?:매매\s*금액|매각\s*금액|매매가|매각가|매매\s*희망가|매각\s*희망가|희망가|매가|호가|매매(?!\s*사례)|매각(?!\s*사례))\]?\s*[:：]?\s*(?:약\s*)?(\d+(?:,\d{3})*(?:\.\d+)?\s*조(?:\s*\d+(?:,\d{3})*(?:\.\d+)?\s*억)?|\d+(?:,\d{3})*(?:\.\d+)?\s*억(?:\s*[\d,]+\s*만(?:\s*원)?|\s*\d+\s*천)?)/
  );
  if (askMatch) {
    const krw = parseKoreanPriceKrw(askMatch[1]);
    if (krw && krw > 0) {
      details.askingPriceManwon = Math.round(krw / 10_000);
    }
  }

  const yearMatch = text.match(/(19\d{2}|20\d{2})\s*년\s*(?:준공|신축급|신축|리모델링|사용승인)/);
  if (yearMatch) {
    const yr = parseInt(yearMatch[1], 10);
    if (yr >= 1960 && yr <= 2035) {
      details.completionYear = yr;
    }
  }

  const korFloorMatch = text.match(/지하\s*(\d+)\s*층\s*[~/·-]\s*지상\s*(\d+)\s*층/);
  const engFloorMatch = text.match(/\bB(\d+)\s*[~/·-]\s*(\d+)F\b/i);
  if (korFloorMatch) {
    details.floorsBelow = parseInt(korFloorMatch[1], 10);
    details.floorsAbove = parseInt(korFloorMatch[2], 10);
  } else if (engFloorMatch) {
    details.floorsBelow = parseInt(engFloorMatch[1], 10);
    details.floorsAbove = parseInt(engFloorMatch[2], 10);
  }

  const toSqm = (raw: string, unit: string) => {
    const n = parseFloat(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return /㎡|m2/i.test(unit) ? Math.round(n * 100) / 100 : Math.round(n * PYEONG_TO_SQM * 100) / 100;
  };
  const landM = text.match(
    /(?:대지면적|토지면적|대지|토지)\]?\s*(?:\d+\s*필지\s*)?(?:합산|합계|총합?|통합)?\s*[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i
  );
  if (landM) details.landAreaSqm = toSqm(landM[1], landM[2]);
  const gfaM = text.match(
    /(?:연면적|건평)\]?\s*(?:\d+\s*개?동\s*)?(?:합산|합계|총합?|통합)?\s*[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i
  );
  if (gfaM) details.gfaSqm = toSqm(gfaM[1], gfaM[2]);

  const zoningM = text.match(/(?:제[123]종\s*)?(?:일반|전용|준)?(?:주거|상업|공업)지역/);
  if (zoningM) details.zoning = zoningM[0];

  const parkingM = text.match(/주차\s*(?:[:：]?\s*)?(\d+)\s*대/);
  if (parkingM) details.parkingCount = parseInt(parkingM[1], 10);

  return details;
}

/**
 * 카톡·문자·메모 원문에서 딜카드 4항목 + 장점 3줄 + 한 줄 제목을 안전하게 추출한다.
 * - 번지/건물명/상호 등 민감 식별자는 cleanBlindPoints 및 validateBlindPoints 로 자동 마스킹
 * - 원문에 없는 수익률 등 숫자는 절대 날조하지 않는다
 */
export function parseMemoIntoCard4(
  memoText: string,
  prevCard4?: Partial<Card4Data>
): Card4Data {
  const baseCard4: Card4Data = {
    headline: prevCard4?.headline || "",
    posture: prevCard4?.posture || "income",
    region: prevCard4?.region || "",
    use: prevCard4?.use || "",
    area: prevCard4?.area,
    gfaPyung: prevCard4?.gfaPyung,
    landAreaPyung: prevCard4?.landAreaPyung,
    priceBand: prevCard4?.priceBand || "",
    points: prevCard4?.points || ["", "", ""],
    pointTones: prevCard4?.pointTones || ["amber", "sky", "mint"],
    provenance: prevCard4?.provenance || { points: ["ai", "ai", "ai"] },
    card4_version: prevCard4?.card4_version ?? 1,
    ...(prevCard4?.pairedMemoId ? { pairedMemoId: prevCard4.pairedMemoId } : {}),
  };
  const text = String(memoText || "").trim();
  if (!text) return baseCard4;

  // 1. 매물 유형(posture) 추정 — "2019년 신축급 / 준신축" 및 "향후 신축/개발 잠재력" 수식어는 중립화
  const textForPosture = text
    .replace(
      /(?:(?:19|20)\d{2}\s*년\s*)?(?:신축급|준신축|신축\s*(?:첫\s*입주|완료|건물|빌딩)|올\s*신축)/g,
      "기존건물"
    )
    .replace(
      /향후[^.\n)]*(?:신축|개발|리모델링)[^.\n)]*|개발\s*(?:잠재력|여지|호재)[^.\n)]*/g,
      ""
    );
  const hasActiveLeaseSignals = /(?:보증금|월\s*임대료|월세|임대수익|수익률|만실)/.test(
    textForPosture
  );
  let posture: DealCardPosture = baseCard4.posture || "income";
  if (
    /(?:신축[·\s/]*(?:개발|리모델링)\s*부지|신축[·\s/]*개발|신축\s*(?:용\s*)?부지|개발\s*(?:용\s*)?부지|리모델링\s*부지|합필\s*신축|나대지|철거\s*후|재건축\s*부지|부지\s*매각|명도\s*조건)/.test(
      textForPosture
    )
  ) {
    posture = "value_add";
  } else if (
    /(?:신축|개발|철거|부지|재건축|용적률\s*(?:여유|잔존|미달|상향|완화)|대수선|밸류애드)/.test(
      textForPosture
    ) &&
    !/사옥/.test(textForPosture) &&
    !hasActiveLeaseSignals
  ) {
    posture = "value_add";
  } else if (/사옥|자가\s*사용|본사|직접\s*입주|통임대\s*사옥/.test(textForPosture)) {
    posture = "owner_occupied";
  } else if (/임대|수익|월세|만실|보증금|임차/.test(textForPosture)) {
    posture = "income";
  }

  // 2. 지역(region) 추출 (번지 제외 + 동/구 안전 마스킹)
  let region = baseCard4.region || "";
  const guDongMatch = text.match(/([가-힣]{2,6}(?:구|군))\s+([가-힣]{1,8}(?:동\d+가|\d+가|(?:\d+)?(?:동|읍|면)))/);
  const cityGuMatch = text.match(/([가-힣]{2,6}시)\s+([가-힣]{2,6}(?:구|동|읍|면))/);
  const stationMatch = text.match(/([가-힣0-9]{2,8}역)\s*(?:인근|부근|역세권|도보\s*\d+분)?/);
  const singleGuOrDongMatch = text.match(
    /(?:^|[\s,·/])([가-힣]{2,6}(?:구|동))(?=\s|,|·|\/|\d|$)/
  );
  const falsePositiveDong = new Set([
    "근린생활동",
    "유동",
    "변동",
    "가동",
    "이동",
    "공동",
    "활동",
    "자동",
    "수동",
    "입구",
    "출구",
    "창구",
    "지구",
    "가구",
    "별동",
    "본동",
  ]);

  if (guDongMatch && !falsePositiveDong.has(guDongMatch[2])) {
    const cleanDong = guDongMatch[2].replace(/동동$/, "동");
    region = `${guDongMatch[1]} ${cleanDong}`;
  } else if (cityGuMatch && !cityGuMatch[1].startsWith("서울")) {
    region = `${cityGuMatch[1]} ${cityGuMatch[2]}`;
  } else if (singleGuOrDongMatch && !falsePositiveDong.has(singleGuOrDongMatch[1])) {
    region = singleGuOrDongMatch[1];
  } else if (stationMatch) {
    region = stationMatch[1].endsWith("인근") ? stationMatch[1] : `${stationMatch[1]} 인근`;
  }
  if (region) {
    region = cleanBlindPoints([region])[0]?.trim() || region;
  }

  // 3. 용도(use) 추출 — 업무시설/오피스 우선순위(예: "업무시설, 근린생활시설" → "업무시설") 반영
  let use = baseCard4.use || "";
  const geunMatch = text.match(/근린생활시설|근생빌딩|근생상가|올근생|근생|꼬마빌딩/);
  const officeMatch = text.match(/업무시설|오피스빌딩|오피스|사옥빌딩|사옥/);
  if (/지식산업센터/.test(text)) {
    use = "지식산업센터";
  } else if (
    officeMatch &&
    (!geunMatch || (officeMatch.index ?? 0) <= (geunMatch.index ?? 0) || /프라임\s*오피스|코어\s*오피스/.test(text))
  ) {
    use = "업무시설";
  } else if (geunMatch) {
    use = "근린생활시설";
  } else if (officeMatch) {
    use = "업무시설";
  } else if (/숙박시설|호텔|모텔/.test(text)) {
    use = "숙박시설";
  } else if (/물류센터|창고시설|물류|창고/.test(text)) {
    use = "창고시설";
  } else if (/메디컬빌딩|병원|의원/.test(text)) {
    use = "메디컬빌딩";
  } else if (/상가주택|다가구/.test(text)) {
    use = "상가주택";
  } else if (/나대지|신축\s*부지|개발\s*부지/.test(text)) {
    use = "신축부지";
  }

  // 4. 면적(gfaPyung / landAreaPyung / area) 추출 — 다필지 합계/가산식 및 [대지면적]/[연면적] 대괄호 라벨 지원
  const toPyung = (rawNum: string, unit: string): number | undefined => {
    const n = parseFloat(rawNum.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    if (/㎡|m2/i.test(unit)) return Math.round(m2ToPyeong(n));
    return Math.round(n);
  };

  const toExactPyungFloat = (rawNum: string, unit: string): number | undefined => {
    const n = parseFloat(rawNum.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return /㎡|m2/i.test(unit) ? m2ToPyeong(n) : n;
  };

  const gfaTotalMatch =
    text.match(
      /(?:연면적|건평)\]?\s*(?:\d+\s*개?동\s*)?(?:합산|합계|총합?|통합|계)\s*[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i
    ) ||
    text.match(/(?:\d+\s*(?:개동|필지)\s*)?(?:합산|총|합계|통합)\s*(?:연면적|건평)\]?\s*[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i);
  const gfaSingleMatch = text.match(
    /(?:연면적|건평)\]?\s*(?:\d+\s*개?동\s*)?[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i
  );

  const landTotalMatch =
    text.match(
      /(?:대지면적|토지면적|대지|토지)\]?\s*(?:\d+\s*필지\s*)?(?:합산|합계|총합?|통합|계)\s*[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i
    ) ||
    text.match(
      /(?:\d+\s*필지\s*)?(?:합산|합계|총|전체|통합)\s*(?:대지면적|토지면적|대지|토지)\]?(?:\s*\d+\s*필지)?\s*[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i
    );
  const landPlusExprMatch = text.match(
    /(?:대지면적|토지면적|대지|토지)\]?\s*(?:\d+\s*필지\s*)?[:：]?\s*((?:(?:약\s*)?[\d,.]+\s*(?:평|㎡|m2)\s*\+\s*)+(?:약\s*)?[\d,.]+\s*(?:평|㎡|m2))/i
  );
  const landSingleMatch = text.match(
    /(?:대지면적|토지면적|대지|토지)\]?\s*(?:\d+\s*필지\s*)?[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i
  );

  let summedLandPyung: number | undefined;
  if (!landTotalMatch && landPlusExprMatch) {
    const terms = Array.from(
      landPlusExprMatch[1].matchAll(/([\d,.]+)\s*(평|㎡|m2)/gi)
    );
    const vals = terms
      .map((m) => toExactPyungFloat(m[1], m[2]))
      .filter((v): v is number => v !== undefined);
    if (vals.length >= 2) {
      summedLandPyung = Math.round(vals.reduce((s, v) => s + v, 0));
    }
  }

  const gfaPyung =
    (gfaTotalMatch
      ? toPyung(gfaTotalMatch[1], gfaTotalMatch[2])
      : gfaSingleMatch
      ? toPyung(gfaSingleMatch[1], gfaSingleMatch[2])
      : undefined) ?? baseCard4.gfaPyung;
  const landAreaPyung =
    (landTotalMatch
      ? toPyung(landTotalMatch[1], landTotalMatch[2])
      : summedLandPyung !== undefined
      ? summedLandPyung
      : landSingleMatch
      ? toPyung(landSingleMatch[1], landSingleMatch[2])
      : undefined) ?? baseCard4.landAreaPyung;

  let area = baseCard4.area;
  if (posture === "value_add" && landAreaPyung) {
    area = `토지 ${landAreaPyung.toLocaleString("ko-KR")}평`;
  } else if (gfaPyung) {
    area = `연면적 ${gfaPyung.toLocaleString("ko-KR")}평`;
  } else if (landAreaPyung) {
    area = `토지 ${landAreaPyung.toLocaleString("ko-KR")}평`;
  }

  // 5. 가격 구간(priceBand) 추출 — 명시 매매가 라벨을 비교/감정가 범위(예: "인근 90~106억 대비 58억")보다 우선 판별
  let priceBand = baseCard4.priceBand || "";
  const explicitAskRangeMatch = text.match(
    /(?:매매\s*금액|매각\s*금액|매매가|매각가|매매\s*희망가|매각\s*희망가|희망가|매가|호가)\]?\s*[:：]?\s*(?:약\s*)?(\d+(?:,\d{3})*(?:\.\d+)?)\s*~\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*억/
  );
  const explicitAskSingleMatch = text.match(
    /(?:매매\s*금액|매각\s*금액|매매가|매각가|매매\s*희망가|매각\s*희망가|희망가|매가|호가|매매(?!\s*사례)|매각(?!\s*사례))\]?\s*[:：]?\s*(?:약\s*)?(\d+(?:,\d{3})*(?:\.\d+)?\s*조(?:\s*\d+(?:,\d{3})*(?:\.\d+)?\s*억)?|\d+(?:,\d{3})*(?:\.\d+)?\s*억(?:\s*[\d,]+\s*만(?:\s*원)?|\s*\d+\s*천)?)/
  );
  const textWithoutComps = text
    .replace(
      /\([^)]*(?:감정가|밸류맵|공시지가|실거래|매각사례|매매사례|인근|대비)[^)]*\)/g,
      ""
    )
    .replace(
      /(?:감정가|밸류맵|공시지가|실거래가?|매각\s*사례|매매\s*사례)[^.\n]*?(?:\d+(?:,\d{3})*(?:\.\d+)?\s*(?:~\s*\d+(?:,\d{3})*(?:\.\d+)?\s*)?(?:조|억|만원))/g,
      ""
    );
  const explicitJoRangeMatch = textWithoutComps.match(
    /(\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:조(?:\s*\d+(?:,\d{3})*(?:\.\d+)?\s*억)?|억))?)\s*~\s*(\d+(?:,\d{3})*(?:\.\d+)?\s*조(?:\s*\d+(?:,\d{3})*(?:\.\d+)?\s*억)?)/
  );
  const explicitBandMatch = explicitJoRangeMatch
    ? null
    : textWithoutComps.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*~\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*억/);

  if (explicitAskRangeMatch) {
    const lo = parseFloat(explicitAskRangeMatch[1].replace(/,/g, ""));
    const hi = parseFloat(explicitAskRangeMatch[2].replace(/,/g, ""));
    const candidate = `${explicitAskRangeMatch[1]}~${explicitAskRangeMatch[2]}억`;
    const check = validateBlindPriceBand(candidate);
    if (check.valid) {
      priceBand = candidate;
    } else if (Number.isFinite(lo) && Number.isFinite(hi) && hi > 0) {
      priceBand = formatPriceRange(((lo + hi) / 2) * 100_000_000);
    }
  } else if (explicitAskSingleMatch) {
    const askKrw = parseKoreanPriceKrw(explicitAskSingleMatch[1]);
    if (askKrw !== null && askKrw > 0) {
      priceBand = formatPriceRange(askKrw);
    }
  } else if (explicitJoRangeMatch) {
    const rawLeft = explicitJoRangeMatch[1].trim();
    const rawRight = explicitJoRangeMatch[2].trim();
    const normalizedLeft = /(조|억|만)/.test(rawLeft) ? rawLeft : `${rawLeft}조`;
    const candidate = `${rawLeft}~${rawRight}`;
    const check = validateBlindPriceBand(candidate);
    if (check.valid) {
      priceBand = candidate;
    } else {
      const minKrw = parseKoreanPriceKrw(normalizedLeft);
      const maxKrw = parseKoreanPriceKrw(rawRight);
      if (minKrw && maxKrw && maxKrw > 0) {
        priceBand = formatPriceRange((minKrw + maxKrw) / 2);
      }
    }
  } else if (explicitBandMatch) {
    const lo = parseFloat(explicitBandMatch[1].replace(/,/g, ""));
    const hi = parseFloat(explicitBandMatch[2].replace(/,/g, ""));
    const candidate = `${explicitBandMatch[1]}~${explicitBandMatch[2]}억`;
    const check = validateBlindPriceBand(candidate);
    if (check.valid) {
      priceBand = candidate;
    } else if (Number.isFinite(lo) && Number.isFinite(hi) && hi > 0) {
      priceBand = formatPriceRange(((lo + hi) / 2) * 100_000_000);
    }
  } else {
    const strippedSubAmounts = textWithoutComps.replace(
      /(?:보증금|전세금|대출|융자|근저당|임대보증금)\s*(?:\]?[:：])?\s*(?:약\s*)?\d+(?:[.,]\d+)?\s*억/g,
      ""
    );
    const joHit = strippedSubAmounts.match(
      /\d+(?:,\d{3})*(?:\.\d+)?\s*조(?:\s*\d+(?:,\d{3})*(?:\.\d+)?\s*억)?/
    );
    let askKrw: number | null = null;
    if (joHit) {
      askKrw = parseKoreanPriceKrw(joHit[0]);
    } else {
      const allEok = Array.from(strippedSubAmounts.matchAll(/(\d+(?:[.,]\d+)?)\s*억/g))
        .map((m) => parseFloat(m[1].replace(/,/g, "")))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (allEok.length > 0) {
        askKrw = Math.max(...allEok) * 100_000_000;
      }
    }
    if (askKrw !== null && askKrw > 0) {
      priceBand = formatPriceRange(askKrw);
    }
  }

  // 6. 장점 3줄 추출 (블라인드 정제 + 천단위 쉼표·괄호 보존 + 18자 어절 경계 교정)
  const sanitizedForClauses = text
    // 괄호 안 연락처·소유주 비공개 메모 제거 (앞부분 핵심 장점 문구는 살림)
    .replace(
      /\([^)]*(?:01[016789]|\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}|사장님?|대표님?|전무님?|상무님?|원장님?|이사님?|부장님?|소유주|건물주|연락처|비공개)[^)]*\)/g,
      ""
    )
    .replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g, "")
    .replace(/\d{2,3}-\d{3,4}-\d{4}/g, "");

  // 다필지 지번 쉼표 및 건물명을 선행 마스킹한 뒤 괄호 깊이 0에서만 절 분할
  const preCleanedForSplit = cleanBlindPoints([sanitizedForClauses])[0] ?? sanitizedForClauses;
  const rawClauses: string[] = [];
  let clauseBuf = "";
  let parenDepth = 0;
  for (let idx = 0; idx < preCleanedForSplit.length; idx++) {
    const ch = preCleanedForSplit[idx];
    if (ch === "(") {
      parenDepth++;
      clauseBuf += ch;
      continue;
    }
    if (ch === ")") {
      if (parenDepth > 0) parenDepth--;
      clauseBuf += ch;
      continue;
    }
    if (parenDepth === 0) {
      if (ch === "\n" || ch === ";") {
        if (clauseBuf.trim().length >= 3) rawClauses.push(clauseBuf.trim());
        clauseBuf = "";
        continue;
      }
      if (ch === ",") {
        const prev = idx > 0 ? preCleanedForSplit[idx - 1] : "";
        const rest = preCleanedForSplit.slice(idx + 1);
        const isThousandsComma = /\d/.test(prev) && /^\d{3}(?:\D|$)/.test(rest);
        if (!isThousandsComma) {
          if (clauseBuf.trim().length >= 3) rawClauses.push(clauseBuf.trim());
          clauseBuf = "";
          continue;
        }
      }
      if (/\s/.test(ch)) {
        const sepMatch = preCleanedForSplit.slice(idx).match(/^\s+[\/·]\s+/);
        if (sepMatch) {
          if (clauseBuf.trim().length >= 3) rawClauses.push(clauseBuf.trim());
          clauseBuf = "";
          idx += sepMatch[0].length - 1;
          continue;
        }
      }
    }
    clauseBuf += ch;
  }
  if (clauseBuf.trim().length >= 3) {
    rawClauses.push(clauseBuf.trim());
  }

  const formatManWithoutDecimalEok = (totalMan: number): string => {
    if (totalMan >= 10000) {
      const wholeEok = Math.floor(totalMan / 10000);
      const remMan = Math.round(totalMan % 10000);
      return remMan > 0 ? `${wholeEok}억 ${remMan.toLocaleString("ko-KR")}` : `${wholeEok}억`;
    }
    return `${Math.round(totalMan).toLocaleString("ko-KR")}만`;
  };

  const normalizeRentToken = (raw: string): string => {
    const compactRaw = raw.replace(/\s+/g, "");
    const decEok = compactRaw.match(/^(\d+)\.(\d+)억$/);
    if (decEok) {
      const totalMan = Math.round(parseFloat(`${decEok[1]}.${decEok[2]}`) * 10000);
      return formatManWithoutDecimalEok(totalMan);
    }
    return compactRaw;
  };

  const compactRentClause = (clause: string): string => {
    // 예: "보증금 2억7,950만 월세 809만" (20자) -> DEAL_CARD_LINE_MAX 이내에서 월세 핵심이 잘리지 않도록 정돈
    if (clause.length <= DEAL_CARD_LINE_MAX) return clause;
    const rentMatch = clause.match(/월세\s*([\d,.]+\s*(?:억(?:\s*[\d,.]+\s*만)?|만|천만?))\s*(?:원)?/);
    const depEokManMatch = clause.match(/보증금\s*(\d+)\s*억\s*(\d[\d,]*)\s*만/);
    if (depEokManMatch && rentMatch) {
      const eok = parseInt(depEokManMatch[1], 10);
      const man = parseInt(depEokManMatch[2].replace(/,/g, ""), 10);
      const totalMan = eok * 10000 + man;
      const depDisplay = formatManWithoutDecimalEok(totalMan);
      const compact = `보증금 ${depDisplay}·월세 ${normalizeRentToken(rentMatch[1])}`;
      if (compact.length <= DEAL_CARD_LINE_MAX) return compact;
    }
    if (rentMatch) {
      return `월세 ${normalizeRentToken(rentMatch[1])} 임대수익`;
    }
    return clause;
  };

  const candidatePoints: string[] = [];
  for (const rawClause of rawClauses) {
    const clause = compactRentClause(rawClause);
    if (
      /^\[?(?:매물명|주소|소재지|위치|입지여건|용도지역|대지면적|연면적|건축면적|건폐율|용적률|규모\/구조(?:\/주용도)?|준공연도|주차\/승강기|공시지가|위반건축물|매매금액|매매가|매각가|희망가|매가|임대현황\s*요약|핵심\s*투자포인트|연락처|전화|소유주|건물주)\]?\s*(?:[:：]|$)/.test(
        clause
      )
    ) {
      continue;
    }
    // 다필지 부속 지번 조각(예: "315-3", "315-7 외 1필지", "1필지 82평")이나 가격/면적 스펙 절은 장점 후보에서 제외
    if (
      /^(?:산\s*)?\d{1,5}(?:-\d{1,5})?(?:\s*번지)?(?:\s*외\s*\d*\s*필지)?$/.test(clause) ||
      /^(?:\d+\s*필지(?:\s*합산)?\s*)?(?:대지|토지|대지면적|토지면적|연면적|건평|매가|매매가|매각가|희망가)(?:\s*\d+\s*필지)?(?:\s*합산|\s*합계|\s*총)?\s*[:：]?\s*(?:약\s*)?[\d,.]+\s*(?:평|㎡|m2|억)/i.test(
        clause
      )
    ) {
      continue;
    }
    // 주소+건물명+희망가 헤더 절(마스킹 후 ●●●/OO-OO/OO번지 잔존 또는 단순 행정동 인근 표기)은 장점 문구로 부적합하므로 제외
    const cleaned = cleanBlindPoints([clause])[0]?.trim() || "";
    if (
      !cleaned ||
      cleaned.includes("●●●") ||
      cleaned.includes("OO-OO") ||
      cleaned.includes("OO번지") ||
      /인근\s*OO(?:빌딩|타워|스퀘어|펠리스|팰리스|프라자|플라자|센터|캐슬|하우스|맨션)/.test(cleaned) ||
      /^(?:서울|경기|인천|부산|대구|광주|대전|울산|세종|[가-힣]{2,6}(?:시|도|구|군|동|읍|면)).*(?:매각|매매가|매매\s*희망가|매각\s*희망가|희망가|매가)\s*[\d,.]+\s*(?:억|조)/.test(
        cleaned
      ) ||
      /^(?:서울(?:특별시|시)?|경기(?:도)?|인천(?:광역시|시)?|부산(?:광역시|시)?|[가-힣]{2,6}(?:시|도|구|군))(?:\s+[가-힣0-9]{2,8}(?:구|군|시|동|읍|면|리|가))*\s*인근(?:\s*외\s*\d*\s*필지|\s*다필지)?$/.test(
        cleaned
      )
    ) {
      continue;
    }
    const repaired = repairDealCardLine(cleaned);
    if (
      repaired &&
      repaired.length >= 3 &&
      !repaired.includes("●●●") &&
      !repaired.includes("OO-OO") &&
      !repaired.includes("OO번지") &&
      repaired !== region &&
      repaired !== use &&
      !candidatePoints.includes(repaired)
    ) {
      candidatePoints.push(repaired);
    }
    if (candidatePoints.length >= 3) break;
  }

  const fallbackByPosture: Record<DealCardPosture, [string, string, string]> = {
    income: ["접근성 좋은 입지", "안정적 임차 구성", "꾸준한 임대수익 구조"],
    owner_occupied: ["사옥 활용 쉬운 구조", "출퇴근 편한 입지", "즉시 입주 협의 매물"],
    value_add: ["신축·리모델링 유망 부지", "건축·수익 개선 여지", "토지 활용도 높은 입지"],
  };

  const existingValid = (baseCard4.points || []).map((p) => p.trim()).filter(Boolean);
  const mergedRawPoints = [...candidatePoints, ...existingValid];
  let points = repairDealCardPoints(mergedRawPoints, {
    fillEmpty: true,
    fallbacks: fallbackByPosture[posture],
  });

  // 최종 블라인드 안전성 재검증 (동 단위 + 희귀 용도 조합 시 구 단위로 자동 완화 포함)
  let safeRegion = region || baseCard4.region || "서울 핵심 권역";
  const safeUse = use || baseCard4.use || "근린생활시설";
  const blindValidation = validateBlindPoints(points, {
    region: safeRegion,
    assetType: safeUse,
  });
  if (!blindValidation.isValid) {
    points = repairDealCardPoints(blindValidation.cleanedPoints, {
      fillEmpty: true,
      fallbacks: fallbackByPosture[posture],
    });
  }
  if (blindValidation.requiresDongToGuFallback && blindValidation.suggestedRegion) {
    safeRegion = blindValidation.suggestedRegion;
  }

  const headline = deriveDealCardHeadline({ posture, points });

  return {
    ...baseCard4,
    headline,
    posture,
    region: safeRegion,
    use: safeUse,
    ...(area !== undefined ? { area } : {}),
    ...(gfaPyung !== undefined ? { gfaPyung } : {}),
    ...(landAreaPyung !== undefined ? { landAreaPyung } : {}),
    priceBand: priceBand || baseCard4.priceBand || "가격 협의",
    points,
    generationSource: "ai_memo",
    provenance: {
      points: ["ai", "ai", "ai"],
    },
  };
}
