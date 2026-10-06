/**
 * 에디터 표시 라벨 단일 출처 (U-05).
 *  - 시장 온도 아이콘 ↔ 구독자(매수자) 온도 이모지 분리 (U2-24)
 *  - 뉴스 topic 한글 라벨 (T1-UX-3)
 *
 * 시장 온도는 도메인(`MARKET_TEMP_CONFIG`)·뷰어(`MARKET_TEMP_VIEW`)·에디터가 모두 색 사각형(🟩🟨🟦🟧🟥)으로 일치하고,
 * 구독자 온도(`buyer-temperature.ts`)는 🔥/📈/⏸️/❄️/⚪ 를 써서 두 개념이 섞이지 않게 한다 (일치·비중복은 테스트로 보장).
 */
import { decodeEntities } from "./escape";
/** 시장 온도(중개사가 고르는 시장 분위기) → 에디터 전용 아이콘. 구독자 온도 이모지(🔥📈⏸️❄️⚪)와 겹치지 않는다. */
export const EDITOR_MARKET_TEMP_ICON: Record<string, string> = {
  "적극 매수": "🟩",
  "선별 매수": "🟨",
  "관망": "🟦",
  "조정 대기": "🟧",
  "위기 경계": "🟥",
};

export function marketTempIcon(temp: string | null | undefined): string {
  if (!temp) return "⬜";
  return EDITOR_MARKET_TEMP_ICON[temp] ?? "⬜";
}

/** 구독자(매수자) 온도 이모지 — 시장 온도 아이콘과 겹치면 안 된다 (테스트로 보장). */
export const BUYER_TEMP_EMOJIS: readonly string[] = ["🔥", "📈", "⏸️", "❄️", "⚪"];

/** 뉴스 topic 키(영문 슬러그) → 한글 */
const TOPIC_LABELS: Record<string, string> = {
  // 크롤러(naver-search.ts / market-crawlers.ts)가 실제로 쓰는 키
  transaction: "거래·매물",
  market_trend: "시장 동향",
  rental: "임대·공실",
  finance: "금융·금리",
  regulation: "규제",
  development: "개발·재개발",
  // 보조 별칭
  policy: "정책",
  rate: "금리",
  rates: "금리",
  interest_rate: "금리",
  loan: "대출",
  tax: "세제",
  market: "시장 동향",
  trend: "시장 동향",
  deal: "거래·매물",
  rent: "임대·공실",
  vacancy: "임대·공실",
  price: "가격",
  supply: "공급",
  redevelopment: "재개발·재건축",
  office: "오피스",
  retail: "상가·리테일",
  logistics: "물류",
  hotel: "숙박",
  residential: "주거",
  apartment: "아파트",
  land: "토지",
  investment: "투자",
  economy: "경제",
  macro: "거시경제",
  general: "일반",
  other: "기타",
};

const HANGUL_RE = /[\uAC00-\uD7A3]/;

/** topic 한글 라벨. 이미 한글이면 그대로, 모르는 영문 키는 '기타'. 비어 있으면 빈 문자열. */
export function topicLabel(topic: string | null | undefined): string {
  const raw = (topic ?? "").trim();
  if (!raw) return "";
  if (HANGUL_RE.test(raw)) return raw;
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
  return TOPIC_LABELS[key] ?? "기타";
}

/**
 * 뉴스 표시 텍스트 정리 — HTML 엔티티(`&quot;` 등)를 디코딩해 "텍스트"로만 쓴다.
 * 결과는 React 가 다시 이스케이프하므로 XSS 안전(HTML 로 주입하지 않는다).
 */
export function cleanNewsText(s: string | null | undefined): string {
  return decodeEntities(s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * 뉴스 요약 정리: 엔티티 디코딩 + 파이프(`|`)로 이어 붙은 "핵심 팩트: … | 브로커 임플리케이션: … | 추천 액션: …"
 * 구조를 항목 배열로 분리한다. (여러 줄이면 줄바꿈도 항목 경계로 취급)
 */
export function formatNewsSummary(summary: string | null | undefined): string[] {
  const text = decodeEntities(summary ?? "");
  return text
    .split(/\||\r?\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
