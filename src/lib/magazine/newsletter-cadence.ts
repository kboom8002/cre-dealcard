/**
 * src/lib/magazine/newsletter-cadence.ts — 뉴스레터 발행 주기(일간·주간·월간) SSOT
 *
 * 회고(1.4): 3단계 UX 단순화(NL-12) 과정에서 편집기·발행 API가 `cadence: "monthly"` / `editionType: "monthly"`로
 * 하드코딩되어 일간·주간 작성 경로가 화면에서 사라졌다. 이 모듈은 주기별
 *  - 발행 호수 라벨(예: 2026년 11월호 / 2026년 11월 2주차 주간호 / 2026년 11월 10일(화) 일간호)
 *  - 주소 슬러그(edition_label: YYYY-MM / Www-YYYY / YYYY-MM-DD — edition-draft.defaultLabelForEditionType 과 동일 규칙)
 *  - 화면 카피(새로 쓰기 버튼 · 기간 표현 · 브리핑 기본 제목)
 * 를 한 곳에서 계산해 편집기·발행 API·AI 프롬프트가 같은 주기 정보를 공유하도록 한다.
 *
 * 클라이언트·서버 공용 순수 모듈 (Node 전용 import 금지).
 */
import { addDays, isoWeekLabel, isoWeekOf, kstParts, mondayOfWeek, parseIssueDate, todayKst } from "@/lib/magazine/kst";

export type NewsletterCadence = "daily" | "weekly" | "monthly";

export const NEWSLETTER_CADENCES: readonly NewsletterCadence[] = ["daily", "weekly", "monthly"] as const;

export interface NewsletterCadenceMeta {
  key: NewsletterCadence;
  /** 칩 라벨 */
  label: "일간" | "주간" | "월간";
  /** 기간 표현 (오늘 / 이번 주 / 이번 달) */
  periodWord: string;
  /** 빠른 시작 버튼 문구 */
  newButtonLabel: string;
  /** 시장 브리핑 기본 소제목 */
  briefingFallbackTitle: string;
  /** 짧은 설명 */
  description: string;
}

export const NEWSLETTER_CADENCE_META: Readonly<Record<NewsletterCadence, NewsletterCadenceMeta>> = {
  daily: {
    key: "daily",
    label: "일간",
    periodWord: "오늘",
    newButtonLabel: "오늘의 일간 뉴스레터 새로 쓰기",
    briefingFallbackTitle: "오늘의 시장 브리핑",
    description: "매일 아침 핵심 이슈 5선을 짧게 전합니다.",
  },
  weekly: {
    key: "weekly",
    label: "주간",
    periodWord: "이번 주",
    newButtonLabel: "이번 주 주간 뉴스레터 새로 쓰기",
    briefingFallbackTitle: "이번 주 시장 브리핑",
    description: "한 주의 흐름과 추천 매물을 정리합니다.",
  },
  monthly: {
    key: "monthly",
    label: "월간",
    periodWord: "이번 달",
    newButtonLabel: "이번 달 뉴스레터 새로 쓰기",
    briefingFallbackTitle: "이달의 시장 브리핑",
    description: "한 달의 시장 브리핑과 통계를 담습니다.",
  },
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function normalizeNewsletterCadence(raw: unknown, fallback: NewsletterCadence = "monthly"): NewsletterCadence {
  return raw === "daily" || raw === "weekly" || raw === "monthly" ? raw : fallback;
}

export interface CadenceIssueMeta {
  cadence: NewsletterCadence;
  year: number;
  month: number;
  /** 기준 날짜 (KST 'YYYY-MM-DD'; 월간은 해당 월 1일, 주간은 해당 주 월요일) */
  dateStr: string;
  /** magazine_editions.edition_label 과 동일한 주소 슬러그 */
  slug: string;
  /** 화면 표시용 호수 라벨 (하위호환 필드명 유지) */
  yearMonthLabel: string;
  /** 기간 범위 보조 표기 (주간: 11.9~11.15) */
  rangeLabel: string;
  issueNumber: number;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function safeDateStr(dateStr: string | undefined | null): string {
  return dateStr && parseIssueDate(dateStr) ? dateStr : todayKst();
}

function dayOfYear(dateStr: string): number {
  const d = parseIssueDate(dateStr);
  if (!d) return 1;
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86_400_000) + 1;
}

/**
 * 주기 + 기준 연·월/날짜로부터 발행 호수 메타를 계산한다.
 * - monthly: slug `YYYY-MM`, 라벨 `YYYY년 M월호`, 호수 = (연도-2024)*12+월
 * - weekly : slug `Www-YYYY`(ISO 주차, edition-draft 규칙과 동일), 라벨 `YYYY년 M월 N주차 주간호`
 * - daily  : slug `YYYY-MM-DD`, 라벨 `YYYY년 M월 D일(요일) 일간호`
 */
export function deriveCadenceIssueMeta(
  cadence: NewsletterCadence,
  anchor: { year?: number; month?: number; dateStr?: string | null } = {},
  baseYear = 2024,
): CadenceIssueMeta {
  const now = kstParts();
  if (cadence === "monthly") {
    const year = Number.isFinite(anchor.year) && (anchor.year as number) >= 2020 ? Math.floor(anchor.year as number) : now.year;
    const month = Number.isFinite(anchor.month)
      ? Math.max(1, Math.min(12, Math.floor(anchor.month as number)))
      : now.month;
    return {
      cadence,
      year,
      month,
      dateStr: `${year}-${pad2(month)}-01`,
      slug: `${year}-${pad2(month)}`,
      yearMonthLabel: `${year}년 ${month}월호`,
      rangeLabel: `${year}.${pad2(month)}`,
      issueNumber: Math.max(1, (year - baseYear) * 12 + month),
    };
  }

  const dateStr = safeDateStr(anchor.dateStr);
  if (cadence === "weekly") {
    const monday = mondayOfWeek(dateStr);
    const sunday = addDays(monday, 6);
    const [my, mm, md] = monday.split("-").map(Number);
    const [, sm, sd] = sunday.split("-").map(Number);
    const weekOfMonth = Math.ceil(md / 7);
    const { week } = isoWeekOf(monday);
    return {
      cadence,
      year: my,
      month: mm,
      dateStr: monday,
      slug: isoWeekLabel(monday),
      yearMonthLabel: `${my}년 ${mm}월 ${weekOfMonth}주차 주간호`,
      rangeLabel: `${mm}.${md}~${sm}.${sd}`,
      issueNumber: week,
    };
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = parseIssueDate(dateStr)?.getUTCDay() ?? 0;
  return {
    cadence,
    year: y,
    month: m,
    dateStr,
    slug: dateStr,
    yearMonthLabel: `${y}년 ${m}월 ${d}일(${WEEKDAY_KO[weekday]}) 일간호`,
    rangeLabel: `${m}.${d}`,
    issueNumber: dayOfYear(dateStr),
  };
}

/** ISO 주차(W46-2026)의 월요일 'YYYY-MM-DD' */
export function mondayOfIsoWeek(isoYear: number, week: number): string {
  const jan4 = `${isoYear}-01-04`;
  const firstMonday = mondayOfWeek(jan4);
  return addDays(firstMonday, (Math.max(1, week) - 1) * 7);
}

/**
 * 저장된 에디션 슬러그(edition_label)와 edition_type 으로 주기와 기준 날짜를 복원한다.
 */
export function parseCadenceAnchor(
  slug: string | null | undefined,
  editionType?: string | null,
): { cadence: NewsletterCadence; year: number; month: number; dateStr: string } {
  const label = typeof slug === "string" ? slug.trim() : "";
  const weekly = label.match(/^W(\d{2})-(\d{4})$/);
  if (weekly) {
    const dateStr = mondayOfIsoWeek(Number(weekly[2]), Number(weekly[1]));
    const [y, m] = dateStr.split("-").map(Number);
    return { cadence: "weekly", year: y, month: m, dateStr };
  }
  const daily = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (daily && parseIssueDate(label)) {
    return {
      cadence: editionType === "weekly" ? "weekly" : "daily",
      year: Number(daily[1]),
      month: Number(daily[2]),
      dateStr: label,
    };
  }
  const monthly = label.match(/^(\d{4})-(\d{2})/);
  if (monthly) {
    const year = Number(monthly[1]);
    const month = Math.max(1, Math.min(12, Number(monthly[2])));
    return { cadence: normalizeNewsletterCadence(editionType, "monthly"), year, month, dateStr: `${year}-${pad2(month)}-01` };
  }
  const now = kstParts();
  return {
    cadence: normalizeNewsletterCadence(editionType, "monthly"),
    year: now.year,
    month: now.month,
    dateStr: todayKst(),
  };
}

/**
 * 주기별 기획 기본 코너 활성화 구성:
 *  - 일간(daily): [헤더 + 제목 + 일간 핵심 이슈 5선 + 추천 매물] (바쁜 아침 1분 속독형 — 장문 브리핑·월간 통계 기본 비활성)
 *  - 주간(weekly): [헤더 + 제목 + 주간 시장 브리핑 + 주간 핵심 이슈 5선 + 추천 매물] (월간 통계 비활성)
 *  - 월간(monthly): [헤더 + 제목 + 상단 주요 통계 그래픽 2선 + 월간 시장 브리핑 + 월간 핵심 이슈 5선 + 추천 매물]
 */
export function getDefaultSectionsForCadence(
  cadence: NewsletterCadence,
): Array<{ id: string; enabled: boolean }> {
  if (cadence === "daily") {
    return [
      { id: "field_note", enabled: false },
      { id: "news_curation", enabled: true },
      { id: "featured_deals", enabled: true },
      { id: "market_data", enabled: false },
    ];
  }
  if (cadence === "weekly") {
    return [
      { id: "field_note", enabled: true },
      { id: "news_curation", enabled: true },
      { id: "featured_deals", enabled: true },
      { id: "market_data", enabled: false },
    ];
  }
  return [
    { id: "market_data", enabled: true },
    { id: "field_note", enabled: true },
    { id: "news_curation", enabled: true },
    { id: "featured_deals", enabled: true },
  ];
}
