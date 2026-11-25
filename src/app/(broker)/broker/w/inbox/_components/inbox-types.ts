import type { ListStatusTone } from "@/components/workspace/list/WorkspaceList";

export type InboxFilterType =
  | "all"
  | "registered"
  | "anonymous"
  | "todo"
  | "views"
  | "viewed"
  | "vip"
  | "buyer"
  | "seller"
  | "newsletter"
  | "emailable"
  | "clients";

export type InboxEditorTabType = "todo" | "message" | "history";

export type InboxClientRole = "buyer" | "seller" | "tenant" | "partner";

export type InboxEmailDeliveryStatus = "ok" | "bounced" | "complained";

export type InboxAlimtalkTemplateId =
  | "TPL_INBOX_IM_APPROVED"
  | "TPL_INBOX_INQUIRY_REPLY"
  | "TPL_INBOX_TOUR_CONFIRMED"
  | "TPL_INBOX_CORRECTION_NOTICE";

export type InboxTransactionalBasis =
  | "im_request"
  | "property_inquiry"
  | "tour_booking"
  | "broker_manual";

export interface RecipientEvent {
  id: string;
  eventType: "open" | "dwell" | "gate_request" | "share";
  description: string;
  timestamp: string;
  sectionName?: string;
}

export type InboxDispatchStatus =
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "copied"
  | "prepared"
  | "imported"
  | "logged";

export interface InboxDispatchHistoryItem {
  id: string;
  eventType: string;
  channel: "email" | "kakao_copy" | "copy" | "newsletter" | "alimtalk" | "link" | "import" | "system";
  title: string;
  status: InboxDispatchStatus;
  createdAt: string;
  bounceReason?: string;
  shareUrl?: string;
}

export interface InboxThreadItem {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  transactionalBasis?: InboxTransactionalBasis | null;
  hasTransactionalBasis?: boolean;
  clientCompany?: string;
  clientGrade: "VIP" | "일반" | "잠재";
  isVip?: boolean;
  clientRole?: InboxClientRole;
  preferredRegions?: string[];
  budgetManwon?: number | null;
  freeMemo?: string;
  emailDeliveryStatus?: InboxEmailDeliveryStatus;
  dispatchHistory?: InboxDispatchHistoryItem[];
  buildingTitle: string;
  buildingId: string;
  latestEvent: string;
  detail?: string;
  cleanMessage?: string;
  gateStatus?: "pending" | "approved" | "rejected" | "none";
  memo?: string;
  updatedAt: string;
  lastActivityAt?: string;
  openCount: number;
  dwellSeconds?: number;
  lastViewedAt?: string | null;
  isRead: boolean;
  status: "pending_gate" | "high_interest" | "active" | "revoked";
  shareToken: string;
  shareUrl?: string;
  events: RecipientEvent[];
  budget: string;
  preferredRegion: string;
  focusedSections?: string[];
  hasCorrectionNotice?: boolean;
  correctionMessage?: string;
  newsletterSubscribed?: boolean;
  newsletterStatus?: "active" | "pending" | "unsubscribed" | "none";
  crmClientId?: string;
  hasIm?: boolean;
  hasDealCard?: boolean;
}

export interface BrokerInventoryDeal {
  buildingId: string;
  title: string;
  region: string;
  priceBand: string;
  askingPriceManwon: number;
  capRatePct: number;
  hasIm?: boolean;
  hasDealCard?: boolean;
}

export interface InboxWorkspacePageProps {
  initialThreads?: InboxThreadItem[];
}

export const INBOX_STORAGE_KEY_PREFIX = "credeal-w-inbox-v5";
export const INBOX_LEGACY_STORAGE_KEYS = [
  "credeal-w-inbox-v4",
  "credeal-w-inbox-v3",
  "credeal-w-inbox-v2",
];

export const ALIMTALK_EARLY_ACCESS_NOTICE =
  "Pro 알림톡 정식 연동 오픈 예정 — 이메일 발송 또는 카톡 인사말+링크 1초 복사를 바로 이용하실 수 있습니다";

export type KakaoOutreachPresetKind = "intro" | "followup_meeting" | "tour_guide";

export const KAKAO_OUTREACH_PRESET_OPTIONS: ReadonlyArray<{
  kind: KakaoOutreachPresetKind;
  label: string;
  shortLabel: string;
}> = [
  { kind: "intro", label: "첫 자료 전달", shortLabel: "첫 전달" },
  { kind: "followup_meeting", label: "검토 후 미팅 제안", shortLabel: "미팅 제안" },
  { kind: "tour_guide", label: "현장 방문 안내", shortLabel: "방문 안내" },
];

export interface PriorityContactSignal {
  isPriority: boolean;
  badgeLabel: string;
  detailLabel: string;
}

/**
 * 연락처(전화/이메일)가 없는 미등록 열람 스레드(`view_*`)인지 판별한다.
 */
export function isAnonymousViewerThread(
  thread: InboxThreadItem | null | undefined
): boolean {
  if (!thread) return false;
  return (
    thread.id.startsWith("view_") &&
    !isValidCallPhone(thread.clientPhone) &&
    !(thread.clientEmail || "").trim()
  );
}

/**
 * '🔥 관심 높음만 보기' 토글과 목록 필터가 동일하게 사용하는 SSOT.
 */
export function isPriorityHotThread(
  thread: InboxThreadItem | null | undefined
): boolean {
  if (!thread || thread.status === "revoked") return false;
  return (
    thread.status === "high_interest" ||
    thread.openCount >= 2 ||
    (thread.dwellSeconds ?? 0) >= 60
  );
}

const RAW_UUID_TITLE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 익명/미입력 열람자는 매물·자료명을 1순위 제목으로 노출해 목록 구분성을 높인다.
 */
export function getInboxThreadDisplayTitle(thread: InboxThreadItem): string {
  const cleanBuilding = (thread.buildingTitle || "").trim();
  const hasMeaningfulBuilding =
    Boolean(cleanBuilding) &&
    !RAW_UUID_TITLE_RE.test(cleanBuilding) &&
    cleanBuilding !== "관심 매물 미지정" &&
    cleanBuilding !== "관심 매물";

  if (
    isAnonymousViewerThread(thread) ||
    thread.clientName === "익명 열람객" ||
    thread.clientName === "이름 미입력 고객"
  ) {
    if (hasMeaningfulBuilding) return cleanBuilding;
    if (thread.latestEvent?.includes("뉴스레터")) return "부동산뉴스";
    return thread.clientName;
  }
  return thread.clientName;
}

/**
 * 카톡 프리셋 전환 시 2열 본문 입력창에 즉시 반영할 깔끔한 2문장 초안을 생성한다.
 */
export function buildKakaoPresetDraftBody(
  kind: KakaoOutreachPresetKind,
  params: { clientName?: string; buildingTitle?: string }
): string {
  const rawName = String(params.clientName ?? "")
    .trim()
    .replace(/님$/, "");
  const nameLabel =
    !rawName || rawName === "익명 열람객" || rawName === "이름 미입력 고객"
      ? "고객님"
      : `${rawName}님`;
  const buildingLabel =
    String(params.buildingTitle ?? "").trim() || "검토 매물";

  if (kind === "followup_meeting") {
    return `${nameLabel}, 안녕하세요. 보내드린 [${buildingLabel}] 자료는 잘 살펴보셨는지요.\n궁금하실 만한 임대현황과 수익 세부 내역을 정리해 두었으니, 편하신 시간에 차 한잔 나누며 직접 브리핑해 드리겠습니다.`;
  }
  if (kind === "tour_guide") {
    return `${nameLabel}, 안녕하세요. [${buildingLabel}] 현장 동선과 층별 구성을 직접 보실 수 있도록 방문 일정을 안내드립니다.\n원하시는 요일과 시간대를 알려주시면 건물 내·외부를 편히 보실 수 있게 미리 준비하겠습니다.`;
  }
  return `${nameLabel}, 안녕하세요. 관심 가져주신 [${buildingLabel}] 상세 자료와 임대 현황을 보내드립니다.\n살펴보시면서 궁금하신 점이나 현장 확인이 필요하시면 편하게 말씀해 주세요.`;
}

/**
 * 열람 요청 대기 중이거나 2회 이상 열람·60초 이상 체류한 고객에게
 * '먼저 연락할 타이밍' 신호를 계산한다.
 */
export function computePriorityContactSignal(
  thread: InboxThreadItem | null | undefined
): PriorityContactSignal | null {
  if (!thread || thread.status === "revoked") return null;
  if (thread.gateStatus === "pending") {
    return {
      isPriority: true,
      badgeLabel: "🔔 자료 요청 대기",
      detailLabel: "고객이 상세 자료 열람을 요청했습니다 — 지금 승인·전달해 주세요",
    };
  }
  const dwell = Math.max(0, Number(thread.dwellSeconds ?? 0));
  if (thread.openCount >= 2 || dwell >= 60) {
    const dwellText = dwell > 0 ? ` · 체류 ${dwell}초` : "";
    return {
      isPriority: true,
      badgeLabel: "🔥 집중 열람 · 먼저 연락",
      detailLabel: `열람 ${thread.openCount}회${dwellText} — 검토 온도가 높아 안부 연락 적기입니다`,
    };
  }
  return null;
}

/**
 * 선임 중개사가 고객에게 카톡·문자로 바로 붙여넣는 3가지 상황별 인사말을 생성한다.
 * 서버가 발급한 개인별 추적 링크(?sid=...)를 그대로 보존한다.
 */
export function buildKakaoOutreachPreset(
  kind: KakaoOutreachPresetKind,
  params: {
    clientName?: string;
    buildingTitle?: string;
    shareUrl: string;
    headline?: string;
  }
): string {
  const rawName = String(params.clientName ?? "")
    .trim()
    .replace(/님$/, "");
  const nameLabel = rawName ? `${rawName}님` : "고객님";
  const buildingLabel = String(params.buildingTitle ?? "").trim() || "검토 매물";
  const urlLine = String(params.shareUrl ?? "").trim();
  const headlineLine = String(params.headline ?? "").trim();

  if (kind === "followup_meeting") {
    return [
      `${nameLabel}, 안녕하세요. 보내드린 [${buildingLabel}] 자료는 잘 살펴보셨는지요.`,
      "궁금하실 만한 임대현황과 수익 세부 내역을 간단히 정리해 두었습니다.",
      `▼ 자료 다시 보기\n${urlLine}`,
      "편하신 시간에 차 한잔 나누며 상세 내용을 직접 브리핑해 드리겠습니다.",
    ].join("\n\n");
  }

  if (kind === "tour_guide") {
    return [
      `${nameLabel}, 안녕하세요. [${buildingLabel}] 현장 동선과 층별 구성을 직접 보실 수 있도록 방문 일정을 안내드립니다.`,
      `▼ 위치·제원 요약 보기\n${urlLine}`,
      "원하시는 요일과 시간대를 알려주시면 건물 내·외부를 편히 보실 수 있게 미리 준비하겠습니다.",
    ].join("\n\n");
  }

  return [
    `${nameLabel}, 안녕하세요. 검토 요청하신 [${buildingLabel}] 요약 자료를 보내드립니다.`,
    ...(headlineLine ? [headlineLine] : []),
    `▼ 자료 바로 보기\n${urlLine}`,
    "살펴보시고 궁금하신 점이나 현장 확인이 필요하시면 편히 답장 주십시오.",
  ].join("\n\n");
}

export function formatPhoneKo(raw: string): string {
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("01")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    if (digits.startsWith("02")) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9 && digits.startsWith("02")) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return raw;
}

export function isValidCallPhone(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("@")) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 8;
}

export function sanitizeClientPhone(raw: unknown): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (
    !trimmed ||
    trimmed.includes("@") ||
    trimmed === "010-0000-0000" ||
    trimmed === "01000000000"
  ) {
    return "";
  }
  return formatPhoneKo(trimmed);
}

export function parsePreferredRegionsList(
  raw: string | string[] | null | undefined
): string[] {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((item) => item.length > 0)
      )
    );
  }
  if (typeof raw !== "string" || !raw.trim()) return [];
  return Array.from(
    new Set(
      raw
        .split(/[,/]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    )
  );
}

export function parseBudgetManwonValue(
  raw: string | number | null | undefined
): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
  }
  if (typeof raw !== "string" || !raw.trim()) return null;
  const cleaned = raw.replace(/,/g, "").trim();

  // Range e.g. "100~130억" -> take upper target in 만원
  const rangeEokMatch = cleaned.match(
    /(\d+(?:\.\d+)?)\s*[~\-]\s*(\d+(?:\.\d+)?)\s*억/
  );
  if (rangeEokMatch) {
    const upper = Number(rangeEokMatch[2]);
    if (Number.isFinite(upper) && upper > 0) return Math.round(upper * 10_000);
  }

  // "85억 5000만" or "60억"
  const eokMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*억(?:\s*(\d+(?:\.\d+)?)\s*만?)?/);
  if (eokMatch) {
    const eok = Number(eokMatch[1]);
    const man = eokMatch[2] ? Number(eokMatch[2]) : 0;
    if (Number.isFinite(eok) && eok > 0) {
      return Math.round(eok * 10_000 + (Number.isFinite(man) ? man : 0));
    }
  }

  // "5000만원" or "5000만"
  const manMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*만(?:원)?$/);
  if (manMatch) {
    const man = Number(manMatch[1]);
    return Number.isFinite(man) && man > 0 ? Math.round(man) : null;
  }

  // Pure numeric 만원 e.g. "480000"
  if (/^\d+$/.test(cleaned)) {
    const num = Number(cleaned);
    return Number.isFinite(num) && num > 0 ? Math.round(num) : null;
  }

  return null;
}

export function formatClientRoleLabel(role?: InboxClientRole): string {
  if (role === "seller") return "매도";
  if (role === "tenant") return "임차";
  if (role === "partner") return "공동중개";
  return "매수";
}

export function formatDispatchChannelLabel(
  channel: InboxDispatchHistoryItem["channel"] | string
): string {
  if (channel === "email") return "이메일";
  if (channel === "kakao_copy" || channel === "copy") return "카톡 복사";
  if (channel === "newsletter") return "뉴스레터";
  if (channel === "alimtalk") return "알림톡";
  if (channel === "import") return "연락처 등록";
  if (channel === "link") return "전용 링크";
  if (channel === "system") return "시스템";
  return "발송";
}

export function formatDispatchStatusBadge(
  status: InboxDispatchHistoryItem["status"] | string
): { label: string; cls: string } {
  if (status === "bounced") {
    return {
      label: "⚠️ 이메일 반송됨",
      cls: "border border-rose-300 bg-rose-100 text-rose-900",
    };
  }
  if (status === "complained") {
    return {
      label: "수신차단",
      cls: "border border-amber-300 bg-amber-100 text-amber-950",
    };
  }
  if (status === "delivered") {
    return {
      label: "전달 완료",
      cls: "border border-emerald-200 bg-emerald-100 text-emerald-900",
    };
  }
  if (status === "copied") {
    return {
      label: "링크 복사됨",
      cls: "border border-sky-200 bg-sky-50 text-sky-900",
    };
  }
  if (status === "prepared") {
    return {
      label: "링크 준비됨",
      cls: "border border-indigo-200 bg-indigo-50 text-indigo-900",
    };
  }
  if (status === "imported") {
    return {
      label: "연락처 등록됨",
      cls: "border border-teal-200 bg-teal-50 text-teal-900",
    };
  }
  if (status === "logged") {
    return {
      label: "기록됨",
      cls: "border border-slate-200 bg-slate-50 text-slate-700",
    };
  }
  return {
    label: "발송 완료",
    cls: "border border-slate-200 bg-slate-100 text-slate-800",
  };
}

export function parseRawGateReason(raw: unknown): {
  requesterName?: string;
  requesterPhone?: string;
  requesterEmail?: string;
  requesterCompany?: string;
  cleanMessage?: string;
} {
  if (typeof raw !== "string" || !raw.trim()) return {};
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const rawParsedEmail =
        typeof parsed.email === "string"
          ? parsed.email
          : typeof parsed.requester_email === "string"
          ? parsed.requester_email
          : typeof parsed.requesterEmail === "string"
          ? parsed.requesterEmail
          : "";
      const requesterEmail = rawParsedEmail.trim().includes("@")
        ? rawParsedEmail.trim()
        : undefined;
      return {
        requesterName:
          typeof parsed.name === "string"
            ? parsed.name.trim()
            : typeof parsed.requesterName === "string"
            ? parsed.requesterName.trim()
            : undefined,
        requesterPhone: sanitizeClientPhone(
          parsed.phone || parsed.contact || parsed.requesterPhone
        ),
        requesterEmail,
        requesterCompany:
          typeof parsed.company === "string"
            ? parsed.company.trim()
            : typeof parsed.organization === "string"
            ? parsed.organization.trim()
            : undefined,
        cleanMessage:
          typeof parsed.message === "string"
            ? parsed.message.trim()
            : typeof parsed.reason === "string"
            ? parsed.reason.trim()
            : undefined,
      };
    } catch {
      return { cleanMessage: trimmed };
    }
  }
  const bracketMatch = trimmed.match(
    /^\[신청자:\s*([^/\]\n]+?)(?:\s*\/\s*연락처:\s*([^\]\n]+?))?\]\s*(.*)$/
  );
  if (bracketMatch) {
    return {
      requesterName: bracketMatch[1]?.trim() || undefined,
      requesterPhone: sanitizeClientPhone(bracketMatch[2]),
      cleanMessage: bracketMatch[3]?.trim() || "IM 열람을 요청했습니다.",
    };
  }
  const marketMatch = trimmed.match(
    /성함\/기업명:\s*([^,\n]+?)(?:,\s*연락처:\s*([^\n]+))?$/
  );
  if (marketMatch) {
    return {
      requesterName: marketMatch[1]?.trim() || undefined,
      requesterPhone: sanitizeClientPhone(marketMatch[2]),
      cleanMessage: "IM 열람을 요청했습니다.",
    };
  }
  return { cleanMessage: trimmed };
}

export function parseFilterParam(raw: string | null): InboxFilterType | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "registered") return "registered";
  if (normalized === "anonymous" || normalized === "anon") return "anonymous";
  if (normalized === "todo") return "todo";
  if (normalized === "viewing" || normalized === "views") return "views";
  if (normalized === "viewed") return "viewed";
  if (normalized === "vip") return "vip";
  if (normalized === "buyer") return "buyer";
  if (normalized === "seller") return "seller";
  if (normalized === "newsletter") return "newsletter";
  if (normalized === "emailable") return "emailable";
  if (normalized === "clients" || normalized === "subscribers") return "clients";
  if (normalized === "all") return "all";
  return null;
}

export function matchesInboxThreadFilter(
  thread: InboxThreadItem,
  filter: InboxFilterType,
  rawQuery: string
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (q) {
    const qDigits = q.replace(/\D/g, "");
    const isPhoneLikeQuery = /^[\d\s\-+()]+$/.test(q) && qDigits.length >= 2;
    const phoneDigits = thread.clientPhone.replace(/\D/g, "");
    const regionsText = (thread.preferredRegions || []).join(" ").toLowerCase();
    const callNotesText = [
      thread.memo || "",
      thread.freeMemo || "",
      thread.cleanMessage || "",
      thread.latestEvent || "",
      ...thread.events.map((ev) => ev.description || ""),
    ]
      .join(" ")
      .toLowerCase();

    const matched =
      thread.clientName.toLowerCase().includes(q) ||
      thread.clientPhone.toLowerCase().includes(q) ||
      (thread.clientEmail || "").toLowerCase().includes(q) ||
      ((isPhoneLikeQuery || qDigits.length >= 4) &&
        qDigits.length > 0 &&
        phoneDigits.includes(qDigits)) ||
      (thread.clientCompany || "").toLowerCase().includes(q) ||
      thread.buildingTitle.toLowerCase().includes(q) ||
      thread.preferredRegion.toLowerCase().includes(q) ||
      regionsText.includes(q) ||
      callNotesText.includes(q);

    if (!matched) return false;
  }

  if (filter === "registered") {
    return !isAnonymousViewerThread(thread);
  }
  if (filter === "anonymous") {
    return isAnonymousViewerThread(thread);
  }
  if (filter === "todo") {
    return (
      thread.status === "pending_gate" ||
      thread.status === "high_interest" ||
      thread.openCount >= 3
    );
  }
  if (filter === "views" || filter === "viewed") {
    return (
      thread.openCount > 0 ||
      (thread.dwellSeconds ?? 0) > 0 ||
      thread.status === "high_interest" ||
      thread.id.startsWith("view_")
    );
  }
  if (filter === "vip") {
    return thread.isVip === true || thread.clientGrade === "VIP";
  }
  if (filter === "buyer") {
    return (thread.clientRole || "buyer") === "buyer" && !thread.id.startsWith("view_");
  }
  if (filter === "seller") {
    return thread.clientRole === "seller";
  }
  if (filter === "newsletter") {
    return (
      !thread.id.startsWith("view_") &&
      (Boolean(thread.newsletterSubscribed) || thread.id.startsWith("sub_"))
    );
  }
  if (filter === "emailable") {
    const email = (thread.clientEmail || "").trim();
    return (
      email.length > 0 &&
      email.includes("@") &&
      thread.emailDeliveryStatus !== "bounced" &&
      thread.emailDeliveryStatus !== "complained"
    );
  }
  if (filter === "clients") {
    return (
      thread.id.startsWith("custom_") ||
      thread.id.startsWith("cli-") ||
      thread.id.startsWith("sub_")
    );
  }
  return true;
}

export function normalizeServerThread(rawInput: unknown): InboxThreadItem {
  const raw = (rawInput && typeof rawInput === "object" ? rawInput : {}) as Record<string, unknown>;
  const parsedReason = parseRawGateReason(
    raw?.detail || raw?.reason || raw?.gateReason || raw?.cleanMessage
  );
  const rawStatus = String(raw?.status || "active");
  const mappedStatus: InboxThreadItem["status"] =
    rawStatus === "pending_gate"
      ? "pending_gate"
      : rawStatus === "revoked"
      ? "revoked"
      : rawStatus === "hot_lead" || rawStatus === "high_interest" || Number(raw?.openCount) >= 3
      ? "high_interest"
      : "active";

  const rawPhoneCandidate = String(
    raw?.clientPhone || raw?.requesterPhone || parsedReason.requesterPhone || ""
  ).trim();
  const phone = sanitizeClientPhone(rawPhoneCandidate);
  const rescuedEmailFromPhone = rawPhoneCandidate.includes("@") ? rawPhoneCandidate : "";
  const clientName =
    String(
      raw?.clientName ||
        raw?.requesterName ||
        parsedReason.requesterName ||
        "이름 미입력 고객"
    ).trim() || "이름 미입력 고객";
  const buildingTitle =
    String(raw?.buildingTitle || raw?.building_label || "관심 매물").trim() || "관심 매물";
  const buildingId = String(raw?.buildingId || raw?.building_id || "").trim();
  const hasIm: boolean | undefined =
    typeof raw?.hasIm === "boolean" ? raw.hasIm : undefined;
  const hasDealCard: boolean | undefined =
    typeof raw?.hasDealCard === "boolean" ? raw.hasDealCard : undefined;
  const openCountRaw = Math.max(0, Number(raw?.openCount ?? 0));
  const rawIdStr = String(raw?.id || "");
  const hasActualView = openCountRaw > 0 || rawIdStr.startsWith("view_");
  const cleanMessage =
    String(
      raw?.cleanMessage ||
        parsedReason.cleanMessage ||
        raw?.latestEvent ||
        (hasActualView ? "상세 자료를 열람했습니다." : "")
    ).trim() || (hasActualView ? "상세 자료를 열람했습니다." : "상담 이력을 확인해 주세요.");

  const focusedSections = Array.isArray(raw?.focusedSections)
    ? raw.focusedSections.filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  const events: RecipientEvent[] = Array.isArray(raw?.events)
    ? raw.events.map((evRaw: unknown, idx: number) => {
        const ev = (evRaw && typeof evRaw === "object" ? evRaw : {}) as Record<string, unknown>;
        return {
          id: String(ev?.id || `ev-${raw?.id || idx}-${idx}`),
          eventType:
            ev?.eventType === "gate_request" ||
            ev?.eventType === "dwell" ||
            ev?.eventType === "share"
              ? ev.eventType
              : "open",
          description:
            parseRawGateReason(ev?.description).cleanMessage ||
            String(ev?.description || "상세 자료를 열람했습니다."),
          timestamp: String(ev?.timestamp || "방금"),
          sectionName: typeof ev?.sectionName === "string" ? ev.sectionName : undefined,
        };
      })
    : mappedStatus === "pending_gate"
    ? [
        {
          id: `ev-${raw?.id || Date.now()}`,
          eventType: "gate_request",
          description: `IM 열람 요청: ${cleanMessage}`,
          timestamp: String(raw?.updatedAt || "방금"),
        },
      ]
    : hasActualView
    ? [
        {
          id: `ev-${raw?.id || Date.now()}`,
          eventType: "open",
          description: "상세 자료를 열람했습니다",
          timestamp: String(raw?.updatedAt || "방금"),
        },
      ]
    : [];

  const shareToken = String(raw?.shareToken || "").trim();
  const shareUrl =
    typeof raw?.shareUrl === "string"
      ? raw.shareUrl
      : buildingId
      ? hasIm === false
        ? `/dc/${encodeURIComponent(buildingId)}`
        : shareToken
        ? `/im-lite/${encodeURIComponent(buildingId)}?token=${encodeURIComponent(shareToken)}`
        : ""
      : "";

  const isVip =
    typeof raw?.isVip === "boolean" ? raw.isVip : raw?.clientGrade === "VIP";
  const clientGrade: InboxThreadItem["clientGrade"] =
    raw?.clientGrade === "VIP" || isVip
      ? "VIP"
      : raw?.clientGrade === "잠재"
      ? "잠재"
      : "일반";

  const clientRole: InboxClientRole =
    raw?.clientRole === "seller" ||
    raw?.clientRole === "tenant" ||
    raw?.clientRole === "partner"
      ? raw.clientRole
      : "buyer";

  const preferredRegions = Array.isArray(raw?.preferredRegions)
    ? parsePreferredRegionsList(raw.preferredRegions as string[])
    : parsePreferredRegionsList(typeof raw?.preferredRegion === "string" ? raw.preferredRegion : "");

  const preferredRegion =
    String(raw?.preferredRegion || "").trim() || preferredRegions.join(", ");

  const budget = String(raw?.budget || "").trim();
  const budgetManwon =
    typeof raw?.budgetManwon === "number" && Number.isFinite(raw.budgetManwon)
      ? raw.budgetManwon
      : parseBudgetManwonValue(budget);

  const freeMemo = typeof raw?.freeMemo === "string" ? raw.freeMemo : "";

  const emailDeliveryStatus: InboxEmailDeliveryStatus =
    raw?.emailDeliveryStatus === "bounced" || raw?.emailDeliveryStatus === "complained"
      ? raw.emailDeliveryStatus
      : "ok";

  const dispatchHistory: InboxDispatchHistoryItem[] = Array.isArray(raw?.dispatchHistory)
    ? raw.dispatchHistory.map((dRaw: unknown, idx: number) => {
        const d = (dRaw && typeof dRaw === "object" ? dRaw : {}) as Record<string, unknown>;
        return {
          id: String(d?.id || `disp-${raw?.id || idx}-${idx}`),
          eventType: String(d?.eventType || "inbox_outbound_copied"),
          channel:
            d?.channel === "email" ||
            d?.channel === "kakao_copy" ||
            d?.channel === "copy" ||
            d?.channel === "newsletter" ||
            d?.channel === "alimtalk" ||
            d?.channel === "link" ||
            d?.channel === "import" ||
            d?.channel === "system"
              ? d.channel
              : "kakao_copy",
          title: String(d?.title || buildingTitle),
          status:
            d?.status === "bounced" ||
            d?.status === "complained" ||
            d?.status === "delivered" ||
            d?.status === "copied" ||
            d?.status === "prepared" ||
            d?.status === "imported" ||
            d?.status === "logged"
              ? d.status
              : "sent",
          createdAt: String(d?.createdAt || "방금"),
          bounceReason: typeof d?.bounceReason === "string" ? d.bounceReason : undefined,
          ...(typeof d?.shareUrl === "string" && d.shareUrl.trim()
            ? { shareUrl: d.shareUrl.trim() }
            : {}),
        };
      })
    : [];

  const rawClientComp = raw?.clientCompany || raw?.requesterCompany || parsedReason.requesterCompany;

  return {
    id: String(raw?.id || `thread-${Date.now()}`),
    clientName,
    clientPhone: phone,
    clientEmail:
      typeof raw?.clientEmail === "string" && raw.clientEmail.trim()
        ? raw.clientEmail.trim()
        : typeof raw?.requester_email === "string" && raw.requester_email.trim()
        ? raw.requester_email.trim()
        : typeof raw?.requesterEmail === "string" && raw.requesterEmail.trim()
        ? raw.requesterEmail.trim()
        : typeof raw?.email === "string" && raw.email.trim()
        ? raw.email.trim()
        : parsedReason.requesterEmail || rescuedEmailFromPhone,
    transactionalBasis:
      raw?.transactionalBasis === "im_request" ||
      raw?.transactionalBasis === "property_inquiry" ||
      raw?.transactionalBasis === "tour_booking" ||
      raw?.transactionalBasis === "broker_manual"
        ? raw.transactionalBasis
        : mappedStatus === "pending_gate"
        ? "im_request"
        : null,
    hasTransactionalBasis:
      typeof raw?.hasTransactionalBasis === "boolean"
        ? raw.hasTransactionalBasis
        : Boolean(raw?.transactionalBasis) || mappedStatus === "pending_gate",
    clientCompany: typeof rawClientComp === "string" && rawClientComp.trim() ? rawClientComp.trim() : undefined,
    clientGrade,
    isVip,
    clientRole,
    preferredRegions,
    budgetManwon,
    freeMemo,
    emailDeliveryStatus,
    dispatchHistory,
    buildingTitle,
    buildingId,
    latestEvent:
      mappedStatus === "pending_gate"
        ? `IM 열람 요청: ${cleanMessage}`
        : cleanMessage,
    detail: cleanMessage,
    cleanMessage,
    gateStatus:
      raw?.gateStatus === "pending" || mappedStatus === "pending_gate"
        ? "pending"
        : raw?.gateStatus === "approved"
        ? "approved"
        : raw?.gateStatus === "rejected"
        ? "rejected"
        : "none",
    memo: typeof raw?.memo === "string" ? raw.memo : undefined,
    updatedAt: String(raw?.updatedAt || "방금"),
    ...(typeof raw?.lastActivityAt === "string" && raw.lastActivityAt.trim()
      ? { lastActivityAt: raw.lastActivityAt.trim() }
      : {}),
    openCount: Math.max(0, Number(raw?.openCount ?? 0)),
    dwellSeconds: Math.max(0, Number(raw?.dwellSeconds ?? 0)),
    lastViewedAt: typeof raw?.lastViewedAt === "string" ? raw.lastViewedAt : null,
    isRead: Boolean(raw?.isRead),
    status: mappedStatus,
    shareToken,
    shareUrl,
    events,
    budget,
    preferredRegion,
    focusedSections,
    hasCorrectionNotice: Boolean(raw?.hasCorrectionNotice),
    correctionMessage:
      typeof raw?.correctionMessage === "string" ? raw.correctionMessage : undefined,
    newsletterSubscribed: Boolean(raw?.newsletterSubscribed),
    ...(raw?.newsletterStatus === "active" ||
    raw?.newsletterStatus === "pending" ||
    raw?.newsletterStatus === "unsubscribed" ||
    raw?.newsletterStatus === "none"
      ? { newsletterStatus: raw.newsletterStatus }
      : {}),
    ...(typeof raw?.crmClientId === "string" && raw.crmClientId
      ? { crmClientId: raw.crmClientId }
      : {}),
    ...(hasIm !== undefined ? { hasIm } : {}),
    ...(hasDealCard !== undefined ? { hasDealCard } : {}),
  };
}

/** 목록 행 상태 배지 (간단히 · 자세히 보기 공통 문구) */
export function getInboxStatusBadge(item: InboxThreadItem): {
  text: string;
  cls: string;
  tone: ListStatusTone;
} {
  const isSubPendingConfirm =
    item.newsletterStatus === "pending" ||
    (item.id.startsWith("sub_") &&
      !item.newsletterSubscribed &&
      (item.cleanMessage || "").includes("수신 확인 대기"));
  if (item.status === "pending_gate") {
    return {
      text: "IM 요청 대기",
      cls: "bg-amber-100 text-amber-900 border border-amber-300",
      tone: "action",
    };
  }
  if (item.status === "revoked") {
    return {
      text: "링크 잠김",
      cls: "bg-rose-100 text-rose-800 border border-rose-200",
      tone: "warn",
    };
  }
  if (item.gateStatus === "rejected") {
    return {
      text: "요청 거절됨",
      cls: "bg-slate-200 text-slate-700 border border-slate-300",
      tone: "muted",
    };
  }
  if (item.status === "high_interest" || item.openCount >= 3) {
    return {
      text: "관심 높음",
      cls: "bg-blue-100 text-blue-900 border border-blue-200",
      tone: "ready",
    };
  }
  if (item.id.startsWith("sub_") || isSubPendingConfirm) {
    if (isSubPendingConfirm && !item.newsletterSubscribed) {
      return {
        text: "인증 대기",
        cls: "bg-amber-100 text-amber-900 border border-amber-300",
        tone: "action",
      };
    }
    if (item.newsletterSubscribed) {
      return {
        text: "수신 동의 완료",
        cls: "bg-emerald-100 text-emerald-900 border border-emerald-200",
        tone: "sent",
      };
    }
    return {
      text: "수신 거부",
      cls: "bg-slate-100 text-slate-700 border border-slate-200",
      tone: "muted",
    };
  }
  if (item.gateStatus === "approved" && item.openCount === 0) {
    return {
      text: "승인됨 · 미열람",
      cls: "bg-emerald-100 text-emerald-900 border border-emerald-200",
      tone: "sent",
    };
  }
  return {
    text: item.openCount > 0 ? `${item.openCount}회 열람` : "등록 고객",
    cls: "bg-slate-100 text-slate-700 border border-slate-200",
    tone: "draft",
  };
}
