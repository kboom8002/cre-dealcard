import type { EditorUnitTarget } from "@/components/workspace/preview-sync/useEditorPreviewSync";
import type { ListStatusTone } from "@/components/workspace/list/WorkspaceList";
import {
  resolveCard4AreaLabel,
  type Card4Data,
  type DealCardGenerationSource,
} from "@/lib/deal-card/card4-schema";
import {
  extractMemoStructuredFacts,
  parseMemoIntoCard4,
  type UnconvertedMemoItem,
} from "@/lib/deal-card/memo-pairing";
import { cleanBlindPoints, validateBlindPoints } from "@/lib/deal-card/blind-guard";
import {
  deriveDealCardHeadline,
  isCompleteDealCardLine,
  normalizeDealCardCopy,
  repairDealCardLine,
  repairDealCardPoints,
  stripChipRepetition,
  stripUngroundedNumbers,
} from "@/lib/deal-card/copy-limits";
import { TERMS } from "@/lib/ux/lexicon";

export interface BuildingListItem {
  id: string;
  title: string;
  region: string;
  use: string;
  priceBand: string;
  status: "draft" | "sent" | "archived";
  updatedAt: string;
  card4: Card4Data;
  /** 중개사 전용 비공개 원본 메모 — 고객 카톡·공유 링크(/dc/[id])·썸네일에는 절대 노출되지 않음 */
  memoText?: string;
  pairedMemoId?: string;
  generationSource?: DealCardGenerationSource;
  /** 신규 생성 직후 아직 메모에서 딜카드 생성을 실행하기 전인 1단계 상태 */
  awaitingMemoGeneration?: boolean;
  ownerUserId?: string;
}

export type ScopedUnconvertedMemoItem = UnconvertedMemoItem & {
  ownerUserId?: string;
};

export interface BrokerProfileSummary {
  displayName: string;
  company: string;
  phone: string;
  registrationNo: string;
  slug: string;
  photoUrl: string | null;
}

export type SimpleListEntry =
  | { kind: "dealcard"; key: string; item: BuildingListItem }
  | { kind: "memo"; key: string; memo: UnconvertedMemoItem };

export type DealCardPendingDeleteTarget =
  | { kind: "dealcard"; target: BuildingListItem }
  | { kind: "memo"; target: UnconvertedMemoItem };

export const SAMPLE_MEMO_TEXT =
  "마포구 서교동 395-166 대로변 코너 근생빌딩, 대지 127평 / 연면적 439평, 매매 희망가 95억, 합정역 도보 3분 코너 입지, 전층 우량 임차인 만실 운영 중";

export const SAMPLE_CARD4: Card4Data = {
  headline: "대로변 코너 만실 운영 매물",
  posture: "income",
  region: "마포구 서교동",
  use: "근린생활시설",
  area: "연면적 439평",
  gfaPyung: 439,
  landAreaPyung: 127,
  priceBand: "90~100억",
  points: [
    "합정역 도보 3분 코너",
    "우량 임차인 전층 만실",
    "안정적인 임대수익 구조",
  ],
  pointTones: ["amber", "sky", "mint"],
  provenance: {
    points: ["public", "broker", "ai"],
  },
  generationSource: "ai_memo",
  card4_version: 1,
};

export const EMPTY_CARD4: Card4Data = {
  headline: "",
  posture: "income",
  region: "",
  use: "",
  area: "",
  priceBand: "",
  points: ["", "", ""],
  pointTones: ["amber", "sky", "mint"],
  provenance: {
    points: ["broker", "broker", "broker"],
  },
  card4_version: 1,
};

export const INITIAL_BUILDINGS: BuildingListItem[] = [
  {
    id: "bld-01",
    title: "마포구 서교동 근린생활시설",
    region: "마포구 서교동",
    use: "근린생활시설",
    priceBand: "90~100억",
    status: "draft",
    updatedAt: "2026-11-01T09:00:00.000Z",
    card4: SAMPLE_CARD4,
    memoText: SAMPLE_MEMO_TEXT,
    generationSource: "ai_memo",
    awaitingMemoGeneration: false,
  },
];

export const INITIAL_IDS = new Set(INITIAL_BUILDINGS.map((b) => b.id));

/**
 * 상용/개발 런타임에서는 빈 계정에 체험 예시 딜카드(bld-01)를 자동 주입하지 않는다.
 * 기존 단위/통합 테스트 환경(NODE_ENV === "test")에서만 초기 샘플 시드를 허용한다.
 */
export function allowInitialDemoSeed(): boolean {
  return typeof process !== "undefined" && process.env?.NODE_ENV === "test";
}

export const DEALCARDS_STORAGE_KEY = "credeal-w-dealcards-v5";
export const UNCONVERTED_MEMO_STORAGE_KEY = "credeal-w-dealcards-memos-v1";

export const ORIGIN_GROUP_TABS = [
  { id: "all", label: "전체", chipLabel: "전체" },
  { id: "ai_memo", label: "✨AI생성", chipLabel: "AI생성" },
  { id: "unconverted_memo", label: "📝미생성", chipLabel: "미생성" },
  { id: "manual", label: "✍️직접", chipLabel: "직접" },
] as const;

export const POSTURE_FILTER_TABS = [
  { id: "all", label: "전체", chipLabel: "전체" },
  { id: "income", label: "임대수익", chipLabel: "임대수익" },
  { id: "owner_value", label: "사옥·개발", chipLabel: "사옥·개발" },
] as const;

export const ROUTING_TYPE_BADGE: Record<string, string> = {
  new_deal: "매물 메모",
  update_building: "매물 보강",
  general_note: "일반 메모",
  buyer_condition: "매수 조건",
  schedule_event: "일정 메모",
};

export const DEALCARD_PREVIEW_UNITS: Record<string, EditorUnitTarget> = {
  "dc-unit-memo": {
    unitId: "dc-unit-memo",
    label: "원본 매물 메모",
    editorSelector: '[data-testid="paired-memo-top-card"]',
    focusSelector: '[data-testid="dealcard-top-memo-textarea"]',
  },
  "dc-unit-posture": {
    unitId: "dc-unit-posture",
    label: "매물 유형",
    editorSelector: '[data-testid="card4-section-posture"]',
    focusSelector: '[data-testid="card4-posture-chip-income"]',
  },
  "dc-unit-region": {
    unitId: "dc-unit-region",
    label: "권역·동명",
    editorSelector: "#card4-region-input",
    focusSelector: "#card4-region-input",
  },
  "dc-unit-use": {
    unitId: "dc-unit-use",
    label: "건물 용도",
    editorSelector: "#card4-use-input",
    focusSelector: "#card4-use-input",
  },
  "dc-unit-area": {
    unitId: "dc-unit-area",
    label: "핵심 면적",
    editorSelector: "#card4-area-input",
    focusSelector: "#card4-area-input",
  },
  "dc-unit-price": {
    unitId: "dc-unit-price",
    label: "매각 가격대",
    editorSelector: "#card4-priceband-input",
    focusSelector: "#card4-priceband-input",
  },
  "dc-unit-headline": {
    unitId: "dc-unit-headline",
    label: "한 줄 제목",
    editorSelector: "#card4-headline-input",
    focusSelector: "#card4-headline-input",
  },
  "dc-unit-point-0": {
    unitId: "dc-unit-point-0",
    label: "핵심 장점 1",
    editorSelector: "#card4-point-input-0",
    focusSelector: "#card4-point-input-0",
  },
  "dc-unit-point-1": {
    unitId: "dc-unit-point-1",
    label: "핵심 장점 2",
    editorSelector: "#card4-point-input-1",
    focusSelector: "#card4-point-input-1",
  },
  "dc-unit-point-2": {
    unitId: "dc-unit-point-2",
    label: "핵심 장점 3",
    editorSelector: "#card4-point-input-2",
    focusSelector: "#card4-point-input-2",
  },
};

export function hydrateCard4(card4: Card4Data): Card4Data {
  const normalized = normalizeDealCardCopy(card4, { fillHeadline: true });
  if (normalized.area === undefined) {
    const initialArea = resolveCard4AreaLabel(normalized);
    if (initialArea) {
      return { ...normalized, area: initialArea };
    }
  }
  return normalized;
}

export function hydrateItem<T extends { card4: Card4Data; memoText?: string | null }>(item: T): T {
  let card4 = hydrateCard4(item.card4);
  if (!(card4.area || "").trim() && item.memoText?.trim()) {
    const parsedFromMemo = parseMemoIntoCard4(item.memoText, card4);
    const recoveredArea = (parsedFromMemo.area || "").trim();
    if (
      recoveredArea ||
      parsedFromMemo.gfaPyung !== undefined ||
      parsedFromMemo.landAreaPyung !== undefined
    ) {
      card4 = {
        ...card4,
        ...(recoveredArea ? { area: recoveredArea } : {}),
        ...(card4.gfaPyung === undefined && parsedFromMemo.gfaPyung !== undefined
          ? { gfaPyung: parsedFromMemo.gfaPyung }
          : {}),
        ...(card4.landAreaPyung === undefined && parsedFromMemo.landAreaPyung !== undefined
          ? { landAreaPyung: parsedFromMemo.landAreaPyung }
          : {}),
      };
    }
  }
  return card4 === item.card4 ? item : { ...item, card4 };
}

export function isSampleDealCardItem(
  item: BuildingListItem | null | undefined,
  syncedServerIds?: ReadonlySet<string>
): boolean {
  if (!item || item.id !== "bld-01") return false;
  if (syncedServerIds?.has("bld-01")) return false;
  if (item.status === "sent") return false;
  if ((item.card4.card4_version || 1) > 1) return false;
  const regionText = `${item.card4.region || ""} ${item.title || ""}`;
  return regionText.includes("서교동") || regionText.includes("양평동");
}

export function describeDealCardStatus(item: BuildingListItem) {
  const itemBlind = item.awaitingMemoGeneration
    ? { isValid: true }
    : validateBlindPoints([
        ...item.card4.points,
        item.card4.region || "",
        item.card4.use || "",
        item.card4.area || "",
        item.card4.priceBand || "",
        item.card4.headline || "",
      ]);
  const isCardReady =
    !item.awaitingMemoGeneration &&
    itemBlind.isValid &&
    Boolean(item.card4.region?.trim()) &&
    Boolean(item.card4.use?.trim()) &&
    Boolean(item.card4.area?.trim()) &&
    Boolean(item.card4.priceBand?.trim()) &&
    item.card4.points.some((p) => Boolean(p?.trim()));
  const statusTitle = !itemBlind.isValid
    ? "지번·건물명 등 비공개 식별 정보를 확인해 주세요"
    : item.status === "sent"
    ? "고객에게 카톡·링크로 발송된 딜카드입니다"
    : isCardReady
    ? "필수 항목 입력 완료 — 오른쪽에서 카톡으로 보내면 '보냄'으로 전환됩니다"
    : "권역·용도·면적·가격대와 장점 1개 이상을 입력하면 '준비 완료'가 됩니다";
  const simpleStatus: { label: string; tone: ListStatusTone } = !itemBlind.isValid
    ? { label: "확인 필요", tone: "warn" }
    : item.status === "sent"
    ? { label: TERMS.statusSent, tone: "sent" }
    : isCardReady
    ? { label: "준비 완료", tone: "ready" }
    : { label: TERMS.statusDraft, tone: "draft" };
  const rowTitle =
    item.awaitingMemoGeneration && !item.region
      ? "새 메모 · 딜카드 작성 중"
      : item.title || "새 딜카드";
  return { itemBlind, isCardReady, statusTitle, simpleStatus, rowTitle };
}

export async function runHybridMemoGenerationApi(
  rawMemoText: string,
  baseCard4: Card4Data
): Promise<Card4Data> {
  const slotMapped = parseMemoIntoCard4(rawMemoText, baseCard4);
  const structuredFacts = extractMemoStructuredFacts(rawMemoText);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const res = await fetch("/api/broker/deal-card/ai-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        mode: "both",
        posture: slotMapped.posture || "income",
        region: slotMapped.region,
        use: slotMapped.use,
        area: slotMapped.area || "",
        priceBand: slotMapped.priceBand,
        currentHeadline: slotMapped.headline || "",
        currentPoints: slotMapped.points,
        facts: structuredFacts,
      }),
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const aiJson = await res.json().catch(() => null);
      if (aiJson?.ok && aiJson?.result) {
        const factContext = [
          slotMapped.region,
          slotMapped.use,
          slotMapped.area,
          slotMapped.priceBand,
          structuredFacts.memoSummary,
          ...slotMapped.points,
        ]
          .filter(Boolean)
          .join(" ");

        let nextPoints = slotMapped.points;
        if (Array.isArray(aiJson.result.points) && aiJson.result.points.length >= 3) {
          const sanitizedAiPts = aiJson.result.points.slice(0, 3).map((pt: string) => {
            const grounded = stripUngroundedNumbers(String(pt || ""), factContext).cleaned;
            const masked = cleanBlindPoints([grounded])[0] || "";
            return repairDealCardLine(masked);
          });
          nextPoints = repairDealCardPoints(sanitizedAiPts, {
            fillEmpty: true,
            fallbacks: slotMapped.points,
          });
        }

        let nextHeadline = slotMapped.headline;
        if (typeof aiJson.result.headline === "string" && aiJson.result.headline.trim()) {
          const groundedH = stripUngroundedNumbers(
            aiJson.result.headline,
            factContext
          ).cleaned;
          const maskedH = cleanBlindPoints([groundedH])[0] || "";
          const noChipH = stripChipRepetition(maskedH, {
            region: slotMapped.region,
            use: slotMapped.use,
          });
          const repairedH = repairDealCardLine(noChipH);
          if (isCompleteDealCardLine(repairedH)) {
            nextHeadline = repairedH;
          }
        }

        return {
          ...slotMapped,
          headline:
            nextHeadline ||
            deriveDealCardHeadline({
              posture: slotMapped.posture || "income",
              points: nextPoints,
            }),
          points: nextPoints,
          generationSource: "ai_memo",
          provenance: {
            points: ["ai", "ai", "ai"],
          },
        };
      }
    }
  } catch {
    // 네트워크/모킹 환경에서는 결정론 슬롯 매퍼 결과를 무중단 그대로 사용
  }

  return slotMapped;
}
