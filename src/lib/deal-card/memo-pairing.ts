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
import { cleanBlindPoints, validateBlindPoints } from "./blind-guard";
import {
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
  roadContact?: string;
  subwayWalkMinutes?: number;
  floorsLabel?: string;
  zoning?: string;
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

  const walkMatch = text.match(/도보\s*(\d{1,2})\s*분/);
  if (walkMatch) {
    const mins = parseInt(walkMatch[1], 10);
    if (mins > 0 && mins <= 30) {
      facts.subwayWalkMinutes = mins;
    }
  }

  if (/코너|각지/.test(text)) {
    facts.roadContact = /대로변/.test(text) ? "대로변 코너" : "코너 입지";
  } else if (/대로변/.test(text)) {
    facts.roadContact = "대로변 접면";
  }

  const floorMatch = text.match(/(?:지하\s*\d+층\s*[~/·-]?\s*)?지상\s*\d+층|B\d+\s*[~/·-]\s*\d+F/i);
  if (floorMatch) {
    facts.floorsLabel = floorMatch[0].replace(/\s+/g, "");
  }

  const zoningMatch = text.match(/(?:제[123]종\s*)?(?:일반|전용|준)?(?:주거|상업|공업)지역/);
  if (zoningMatch) {
    facts.zoning = zoningMatch[0];
  }

  // 연락처 제거 후 블라인드 정제된 안전 요약 생성
  const withoutPhones = text
    .replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g, "")
    .replace(/\d{2,3}-\d{3,4}-\d{4}/g, "");
  const cleanedSummary = cleanBlindPoints([withoutPhones])[0]
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  if (cleanedSummary) {
    facts.memoSummary = cleanedSummary;
  }

  return facts;
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

  // 1. 매물 유형(posture) 추정
  let posture: DealCardPosture = baseCard4.posture || "income";
  if (
    /(?:신축[·\s/]*개발|신축\s*(?:용\s*)?부지|개발\s*(?:용\s*)?부지|합필\s*신축|나대지|철거\s*후|재건축\s*부지|부지\s*매각)/.test(
      text
    )
  ) {
    posture = "value_add";
  } else if (/신축|개발|철거|부지|재건축|용적률/.test(text) && !/사옥/.test(text)) {
    posture = "value_add";
  } else if (/사옥|자가\s*사용|본사|직접\s*입주|통임대\s*사옥/.test(text)) {
    posture = "owner_occupied";
  } else if (/임대|수익|월세|만실|보증금|임차/.test(text)) {
    posture = "income";
  }

  // 2. 지역(region) 추출 (번지 제외 + 동/구 안전 마스킹)
  let region = baseCard4.region || "";
  const guDongMatch = text.match(/([가-힣]{2,6}(?:구|군))\s+([가-힣0-9]{2,8}(?:동|읍|면))/);
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

  if (guDongMatch) {
    // '양평동4가' / '역삼1동' 등 세부 가/동 숫자는 행정동 대표명으로 정돈
    const cleanDong = guDongMatch[2].replace(/\d+가$/, "동").replace(/동동$/, "동");
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

  // 3. 용도(use) 추출
  let use = baseCard4.use || "";
  if (/근린생활시설|근생빌딩|근생상가|올근생|근생|꼬마빌딩/.test(text)) {
    use = "근린생활시설";
  } else if (/지식산업센터/.test(text)) {
    use = "지식산업센터";
  } else if (/업무시설|오피스빌딩|오피스|사옥빌딩|사옥/.test(text)) {
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

  // 4. 면적(gfaPyung / landAreaPyung / area) 추출 — 다필지 합계/가산식 최우선 인식
  const toPyung = (rawNum: string, unit: string): number | undefined => {
    const n = parseFloat(rawNum.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    if (/㎡|m2/i.test(unit)) return Math.round(n / 3.3058);
    return Math.round(n);
  };

  const toExactPyungFloat = (rawNum: string, unit: string): number | undefined => {
    const n = parseFloat(rawNum.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return /㎡|m2/i.test(unit) ? n / 3.3058 : n;
  };

  const gfaTotalMatch =
    text.match(
      /(?:연면적|건평)\s*(?:\d+\s*개?동\s*)?(?:합계|총합?|통합|계)\s*[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i
    ) ||
    text.match(/(?:총|합계|통합)\s*(?:연면적|건평)\s*[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i);
  const gfaSingleMatch = text.match(
    /(?:연면적|건평)\s*(?:\d+\s*개?동\s*)?[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i
  );

  const landTotalMatch =
    text.match(
      /(?:대지면적|토지면적|대지|토지)\s*(?:\d+\s*필지\s*)?(?:합계|총합?|통합|계)\s*[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i
    ) ||
    text.match(
      /(?:합계|총|전체|통합)\s*(?:대지면적|토지면적|대지|토지)(?:\s*\d+\s*필지)?\s*[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i
    );
  const landPlusExprMatch = text.match(
    /(?:대지면적|토지면적|대지|토지)\s*(?:\d+\s*필지\s*)?[:：]?\s*((?:(?:약\s*)?[\d,.]+\s*(?:평|㎡|m2)\s*\+\s*)+(?:약\s*)?[\d,.]+\s*(?:평|㎡|m2))/i
  );
  const landSingleMatch = text.match(
    /(?:대지면적|토지면적|대지|토지)\s*(?:\d+\s*필지\s*)?[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i
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

  // 5. 가격 구간(priceBand) 추출 (보증금/대출 숫자와 구분하여 안전 구간화)
  let priceBand = baseCard4.priceBand || "";
  const explicitBandMatch = text.match(/(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)\s*억/);
  if (explicitBandMatch) {
    priceBand = `${explicitBandMatch[1]}~${explicitBandMatch[2]}억`;
  } else {
    const explicitAskMatch = text.match(
      /(?:매매가|매각가|희망가|매매\s*희망가|매가|매매|호가)\s*[:：]?\s*(?:약\s*)?(\d+(?:[.,]\d+)?)\s*억(?:\s*(\d+)\s*천)?/
    );
    let askEok: number | null = null;
    if (explicitAskMatch) {
      askEok =
        parseFloat(explicitAskMatch[1].replace(/,/g, "")) +
        (explicitAskMatch[2] ? parseFloat(explicitAskMatch[2]) * 0.1 : 0);
    } else {
      const strippedSubAmounts = text.replace(
        /(?:보증금|전세금|대출|융자|근저당|임대보증금)\s*[:：]?\s*(?:약\s*)?\d+(?:[.,]\d+)?\s*억/g,
        ""
      );
      const allEok = Array.from(strippedSubAmounts.matchAll(/(\d+(?:[.,]\d+)?)\s*억/g))
        .map((m) => parseFloat(m[1].replace(/,/g, "")))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (allEok.length > 0) {
        askEok = Math.max(...allEok);
      }
    }

    if (askEok !== null && askEok > 0) {
      if (askEok >= 100) {
        const low = Math.floor(askEok / 10) * 10;
        priceBand = `${low}~${low + 10}억`;
      } else if (askEok >= 20) {
        const low = Math.floor(askEok / 5) * 5;
        priceBand = `${low}~${low + 5}억`;
      } else {
        const low = Math.max(1, Math.floor(askEok));
        priceBand = `${low}~${low + 2}억`;
      }
    }
  }

  // 6. 장점 3줄 추출 (블라인드 정제 + 천단위 쉼표 보존 + 18자 어절 경계 교정)
  const sanitizedForClauses = text
    // 괄호 안 연락처·소유주 비공개 메모 제거 (앞부분 핵심 장점 문구는 살림)
    .replace(/\([^)]*(?:01[016789]|\d{2,3}-\d{3,4}-\d{4}|사장님|대표님|소유주|건물주|연락처|비공개)[^)]*\)/g, "")
    .replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g, "");

  // 천단위 숫자 쉼표(예: 2억7,950만 / 1,230평)와 단어 내부 가운뎃점(예: 학원·카페)은 분할하지 않음
  const rawClauses = sanitizedForClauses
    .split(/\r?\n|;|,(?!\d{3}(?:\D|$))|\s+[\/·]\s+/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 3);

  const compactRentClause = (clause: string): string => {
    // 예: "보증금 2억7,950만 월세 809만" (20자) -> 18자 이내에서 월세 핵심이 잘리지 않도록 정돈
    if (clause.length <= 18) return clause;
    const rentMatch = clause.match(/월세\s*([\d,.]+\s*(?:억(?:\s*[\d,.]+\s*만)?|만|천만?))\s*(?:원)?/);
    const depEokManMatch = clause.match(/보증금\s*(\d+)\s*억\s*(\d[\d,]*)\s*만/);
    if (depEokManMatch && rentMatch) {
      const eok = parseInt(depEokManMatch[1], 10);
      const man = parseInt(depEokManMatch[2].replace(/,/g, ""), 10);
      const roundedEok = Math.round((eok + man / 10000) * 10) / 10;
      const compact = `보증금 ${roundedEok}억·월세 ${rentMatch[1].replace(/\s+/g, "")}`;
      if (compact.length <= 18) return compact;
    }
    if (rentMatch) {
      return `월세 ${rentMatch[1].replace(/\s+/g, "")} 임대수익`;
    }
    return clause;
  };

  const candidatePoints: string[] = [];
  for (const rawClause of rawClauses) {
    const clause = compactRentClause(rawClause);
    if (/^(?:주소|소재지|위치|매매가|매각가|희망가|매가|연락처|전화|소유주|건물주)\s*[:：]/.test(clause)) {
      continue;
    }
    // 다필지 부속 지번 조각(예: "315-3", "315-7 외 1필지", "1필지 82평")이나 가격/면적 스펙 절은 장점 후보에서 제외
    if (
      /^(?:산\s*)?\d{1,5}(?:-\d{1,5})?(?:\s*번지)?(?:\s*외\s*\d*\s*필지)?$/.test(clause) ||
      /^(?:\d+\s*필지|(?:대지|토지|대지면적|토지면적|연면적|건평|매가|매매가|매각가|희망가)(?:\s*\d+\s*필지)?(?:\s*합계|\s*총)?)\s*[:：]?\s*(?:약\s*)?[\d,.]+\s*(?:평|㎡|m2|억)/i.test(
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
    owner_occupied: ["사옥 활용 쉬운 구조", "출퇴근 편한 입지", "즉시 검토 가능 매물"],
    value_add: ["신축·리모델링 검토 부지", "가치 상승 여지 보유", "토지 활용도 높은 입지"],
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
