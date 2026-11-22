/**
 * @file src/app/api/public/qa-workbench/route.ts
 * @description Server-synced QA Workbench persistence (A-1), Live Auto-Verifier Probe (A-2),
 * and 1-Click Axis 4~6 Test Lead & Subscriber Fixture Seeder (A-3) for /newsletter-inbox-test.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBroker } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limiter";
import { isRealProductionRuntime } from "@/lib/env";
import { getClientIp } from "@/lib/magazine/public-guard";
import {
  getConfiguredQaSecrets,
  isPublicQaFlagEnabled,
  resolveQaKeyFromRequest,
  type QaKeyRole,
} from "@/lib/security/qa-gate";
import {
  issueShareLinkToken,
  verifyShareLinkToken,
  isBuildingShareLinkRevoked,
} from "@/lib/security/share-link-tokens";
import {
  getInboxState,
  getQuickImRecord,
  isUuid,
} from "@/lib/im-lite/quick-generate-store";
import { normalizeKrPhone, toE164Kr } from "@/lib/magazine/pii";
import {
  brokerKeys,
  isUnpublishedContent,
  maskPublicAddresses,
  mergeEditionContent,
  resolvePublicBroker,
  type MagazineContent,
} from "@/lib/magazine/public-page-data";
import { addDays } from "@/lib/magazine/kst";
import {
  MECE_36_STEPS,
  type MeceSeverity,
} from "@/lib/testguide/newsletter-inbox-mece-data";
import { CLICK_THROUGH_STEPS } from "@/lib/testguide/dealcard-im-mece-guide-data";
import {
  FASTTRACK_STEPS,
  QA_SIGNOFF_WORKBENCH_ID,
  QA_TESTER_MISSIONS_WORKBENCH_ID,
  QA_BROKER_SESSION_WORKBENCH_ID,
  TESTER_MISSIONS_8,
} from "@/lib/testguide/qa-signoff-fasttrack-data";
import {
  getBuildStampInfo,
  QA_OUTBOUND_CHANNEL_POLICY,
} from "@/lib/qa/build-stamp";
import {
  QA_OUTPUT_SHOWCASE_WORKBENCH_ID,
  OUTPUT_SHOWCASE_SCENARIOS,
} from "@/lib/qa/output-showcase-scenarios";
import {
  BROKER_FOLLOWUP_QUESTION_IDS,
  QA_BROKER_FOLLOWUP_WORKBENCH_ID,
} from "@/lib/qa/broker-followup-questions";
import {
  QA_ROUND2_WORKBENCH_ID,
  ROUND1_REMEDIATION_28_ITEMS,
  ROUND2_CORE_MISSIONS_6,
  V6_PHYSICAL_DEVICE_MISSIONS_5,
} from "@/lib/qa/round2-verification-data";
import {
  FULL_LOOP_ALL_STEPS,
  FULL_LOOP_CASES,
  QA_FULL_LOOP_WORKBENCH_ID,
} from "@/lib/testguide/full-loop-2cases-data";
import {
  FULL_LOOP_V2_ALL_STEPS,
  FULL_LOOP_V2_CASES,
  QA_FULL_LOOP_V2_WORKBENCH_ID,
} from "@/lib/testguide/full-loop-v2-holdout-data";
import {
  BROKER_FULL_LOOP_ALL_STEPS,
  BROKER_FULL_LOOP_CASES,
  QA_BROKER_FULL_LOOP_WORKBENCH_ID,
} from "@/lib/testguide/broker-full-loop-data";
import { createModuleLogger } from "@/lib/logger";
import { validateBlindPoints, cleanBlindPoints } from "@/lib/deal-card/blind-guard";
import { parseTsvRentRoll } from "@/lib/rent-roll/tsv-parser";

export const dynamic = "force-dynamic";

const log = createModuleLogger("qa-workbench-route");

const DEFAULT_WORKBENCH_ID = "newsletter-inbox-mece-v1";
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{6,128}$/;
const RAW_UUID_SUBSTR_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const UNMASKED_LOT_RE = /\d+-\d+(?!\s*(?:층|F|f))/;
const UNMASKED_ROAD_BLDG_RE = /(?:로|길)\s+\d+(?!\d|\s*(?:길|번길|일대|인근|권역))/;

const ALLOWED_PROBE_HOSTS = new Set([
  "credeal.net",
  "www.credeal.net",
  "localhost",
  "127.0.0.1",
]);

interface StoredQaSessionSnapshot {
  workbenchId: string;
  sessionId: string;
  mode: "sync" | "submit";
  syncedAt: string;
  testerName: string;
  testerOrg: string;
  completedCount: number;
  passCount: number;
  failCount: number;
  s0FailCount: number;
  s1FailCount: number;
  failedStepCodes: string[];
  verdictLabel: string;
  elapsedSeconds: number;
  overallComment: string;
  scratchLinks: Record<string, string>;
  records: Record<string, unknown>;
}

export interface QaFeedbackPin {
  id: string;
  sessionId: string;
  workspace: string;
  routePath: string;
  targetSelector: string;
  targetLabel: string;
  note: string;
  severity: "critical" | "major" | "minor";
  viewport: { width: number; height: number } | null;
  fontScale: string | null;
  createdAt: string;
  authorId?: string | null;
  authorEmail?: string | null;
  buildSha?: string | null;
  builtAt?: string | null;
  userAgent?: string | null;
  authorRole?: "tester" | "broker";
  pinMode?: "issue" | "redpen";
  originalText?: string | null;
  suggestedText?: string | null;
  screenshotDataUrl?: string | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __CRE_QA_WORKBENCH_SESSIONS__: Map<string, StoredQaSessionSnapshot> | undefined;
  // eslint-disable-next-line no-var
  var __CRE_QA_WORKBENCH_PINS__: QaFeedbackPin[] | undefined;
}

function getMemorySessionStore(): Map<string, StoredQaSessionSnapshot> {
  if (!globalThis.__CRE_QA_WORKBENCH_SESSIONS__) {
    globalThis.__CRE_QA_WORKBENCH_SESSIONS__ = new Map();
  }
  return globalThis.__CRE_QA_WORKBENCH_SESSIONS__;
}

function getMemoryPinStore(): QaFeedbackPin[] {
  if (!globalThis.__CRE_QA_WORKBENCH_PINS__) {
    globalThis.__CRE_QA_WORKBENCH_PINS__ = [];
  }
  return globalThis.__CRE_QA_WORKBENCH_PINS__;
}

function saveMemoryPin(pin: QaFeedbackPin): void {
  const store = getMemoryPinStore();
  const next = [pin, ...store.filter((p) => p.id !== pin.id)].slice(0, 200);
  globalThis.__CRE_QA_WORKBENCH_PINS__ = next;
}

async function loadMergedQaPins(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any | null,
  filterSessionId?: string
): Promise<QaFeedbackPin[]> {
  const byId = new Map<string, QaFeedbackPin>();
  for (const p of getMemoryPinStore()) {
    byId.set(p.id, p);
  }

  if (supabase) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase
        .from("activity_events")
        .select("id, actor_id, metadata, created_at")
        .eq("entity_type", "qa_pin")
        .eq("event_type", "qa_pin_created");
      if (typeof q.order === "function") {
        q = q.order("created_at", { ascending: false });
      }
      if (typeof q.limit === "function") {
        q = q.limit(50);
      }
      const res = await q;
      if (Array.isArray(res?.data)) {
        for (const row of res.data) {
          const meta = row?.metadata as Record<string, unknown> | undefined;
          if (!meta || typeof meta.note !== "string") continue;
          const pinId = String(meta.id || row?.id || "").trim();
          if (!pinId) continue;
          if (!byId.has(pinId)) {
            byId.set(pinId, {
              id: pinId,
              sessionId: String(meta.sessionId || "qa-pin-global"),
              workspace: String(meta.workspace || "common"),
              routePath: String(meta.routePath || "/broker/w"),
              targetSelector: String(meta.targetSelector || "viewport"),
              targetLabel: String(meta.targetLabel || "화면 전체"),
              note: meta.note,
              severity:
                meta.severity === "critical" || meta.severity === "minor"
                  ? meta.severity
                  : "major",
              viewport:
                meta.viewport && typeof meta.viewport === "object"
                  ? (meta.viewport as { width: number; height: number })
                  : null,
              fontScale:
                typeof meta.fontScale === "string" ? meta.fontScale : null,
              createdAt: String(
                meta.createdAt || row?.created_at || new Date().toISOString()
              ),
              authorId:
                typeof meta.authorId === "string"
                  ? meta.authorId
                  : typeof row?.actor_id === "string"
                  ? row.actor_id
                  : null,
              authorEmail:
                typeof meta.authorEmail === "string" ? meta.authorEmail : null,
              buildSha:
                typeof meta.buildSha === "string" ? meta.buildSha.slice(0, 24) : null,
              builtAt:
                typeof meta.builtAt === "string" ? meta.builtAt.slice(0, 40) : null,
              userAgent:
                typeof meta.userAgent === "string" ? meta.userAgent.slice(0, 240) : null,
              authorRole: meta.authorRole === "broker" ? "broker" : "tester",
              pinMode: meta.pinMode === "redpen" ? "redpen" : "issue",
              originalText:
                typeof meta.originalText === "string"
                  ? meta.originalText.slice(0, 300)
                  : null,
              suggestedText:
                typeof meta.suggestedText === "string"
                  ? meta.suggestedText.slice(0, 300)
                  : null,
              screenshotDataUrl:
                typeof meta.screenshotDataUrl === "string" &&
                meta.screenshotDataUrl.startsWith("data:image/") &&
                meta.screenshotDataUrl.length <= 150_000
                  ? meta.screenshotDataUrl
                  : null,
            });
          }
        }
      }
    } catch {
      // Fall back to in-memory pins
    }
  }

  let list = Array.from(byId.values());
  if (filterSessionId && filterSessionId !== "all") {
    list = list.filter((p) => p.sessionId === filterSessionId);
  }
  list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return list.slice(0, 100);
}

function saveMemorySession(snapshot: StoredQaSessionSnapshot): void {
  const store = getMemorySessionStore();
  if (store.size >= 200 && !store.has(snapshot.sessionId)) {
    const oldestKey = store.keys().next().value;
    if (oldestKey) store.delete(oldestKey);
  }
  store.set(snapshot.sessionId, snapshot);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryCreateServiceClient(): any | null {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

async function resolveOptionalBrokerUser(
  req: NextRequest
): Promise<{ id: string; email?: string; role?: string } | null> {
  try {
    const guard = await requireBroker(req);
    if (!guard.error && guard.user?.id) {
      return guard.user as { id: string; email?: string; role?: string };
    }
    return null;
  } catch {
    return null;
  }
}

function sanitizePinForViewer(
  pin: QaFeedbackPin,
  isAuthenticated: boolean
): QaFeedbackPin {
  if (isAuthenticated) return pin;
  return {
    ...pin,
    authorEmail: null,
    screenshotDataUrl: null,
  };
}

function resolveQaKeyRole(req: NextRequest): QaKeyRole {
  return resolveQaKeyFromRequest(req).role;
}

function hasValidQaAccessKeyHeader(req: NextRequest): boolean {
  return resolveQaKeyFromRequest(req).allowed;
}

function isQaEnforceFlagEnabled(): boolean {
  return process.env.CRE_ENFORCE_QA_GATE === "1";
}

function isQaApiGateEnforced(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    isQaEnforceFlagEnabled() ||
    isPublicQaFlagEnabled()
  );
}

function createQaGateDeniedResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Not Found" },
    { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } }
  );
}

function createQaForbiddenResponse(
  message = "QA 액세스 키가 필요합니다."
): NextResponse {
  return NextResponse.json(
    { ok: false, error: message },
    { status: 403, headers: { "X-Robots-Tag": "noindex, nofollow" } }
  );
}

function hasQaApiAccess(
  req: NextRequest,
  brokerUser: { id: string } | null
): boolean {
  if (isPublicQaFlagEnabled()) {
    // Fail closed when QA_PORTAL_PASSCODE / QA keys are all unset even if CREDEAL_ENABLE_PUBLIC_QA=true
    if (!getConfiguredQaSecrets().anyConfigured) {
      return false;
    }
    return hasValidQaAccessKeyHeader(req);
  }
  if (isRealProductionRuntime()) {
    // Real production fails closed unless a valid QA access key is supplied
    return hasValidQaAccessKeyHeader(req);
  }
  if (!isQaApiGateEnforced()) {
    return true;
  }
  return Boolean(brokerUser?.id) || hasValidQaAccessKeyHeader(req);
}

function classifyQaSessionOwner(
  sessionId: string
): "tester" | "broker" | "shared" {
  const normalized = sessionId.trim().toLowerCase();
  if (!normalized) return "shared";
  if (normalized.includes("broker") && !normalized.includes("tester")) {
    return "broker";
  }
  if (normalized.includes("tester") && !normalized.includes("broker")) {
    return "tester";
  }
  return "shared";
}

function checkRoleSessionForbidden(
  keyRole: QaKeyRole,
  sessionId: string
): string | null {
  if (keyRole !== "tester" && keyRole !== "broker") {
    return null;
  }
  const owner = classifyQaSessionOwner(sessionId);
  if (keyRole === "tester" && owner === "broker") {
    return "테스터 키로는 중개인 검수 세션을 수정할 수 없습니다. (/qa-tester 포털을 이용해 주세요)";
  }
  if (keyRole === "broker" && owner === "tester") {
    return "중개인 키로는 테스터 리허설 세션을 수정할 수 없습니다. (/qa-broker 포털을 이용해 주세요)";
  }
  return null;
}

function hasQaWriteAuthorization(
  req: NextRequest,
  brokerUser: { id: string } | null
): boolean {
  if (isPublicQaFlagEnabled()) {
    if (!getConfiguredQaSecrets().anyConfigured) {
      return false;
    }
    return hasValidQaAccessKeyHeader(req);
  }
  if (isRealProductionRuntime()) {
    return hasValidQaAccessKeyHeader(req);
  }
  if (!isQaEnforceFlagEnabled() && process.env.NODE_ENV !== "production") {
    return true;
  }
  if (hasValidQaAccessKeyHeader(req)) {
    return true;
  }
  return Boolean(brokerUser?.id);
}

function parseSafeSameOriginUrl(
  rawUrl: string
): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: "검증할 URL이 비어 있습니다." };
  }

  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
      return {
        ok: false,
        error: "외부 프로토콜 상대 경로(//)는 허용되지 않습니다.",
      };
    }
    try {
      return { ok: true, url: new URL(trimmed, "https://credeal.net") };
    } catch {
      return { ok: false, error: "올바르지 않은 상대 경로 형식입니다." };
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "http/https URL만 검증할 수 있습니다." };
    }
    if (!ALLOWED_PROBE_HOSTS.has(parsed.hostname.toLowerCase())) {
      return {
        ok: false,
        error:
          "허용된 도메인(credeal.net / www.credeal.net / localhost) 또는 상대 경로만 검증할 수 있습니다.",
      };
    }
    return { ok: true, url: parsed };
  } catch {
    return { ok: false, error: "올바른 URL 형식이 아닙니다." };
  }
}

function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = String(err.message || "");
  return msg.includes("column") && (msg.includes("does not exist") || msg.includes("schema cache"));
}

function formatDashedKrPhone(digits: string): string {
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function computeWorkbenchSummary(rawRecords: unknown, workbenchId = "") {
  const recMap =
    rawRecords && typeof rawRecords === "object" && !Array.isArray(rawRecords)
      ? (rawRecords as Record<
          string,
          { status?: string; note?: string; overrideSeverity?: string }
        >)
      : {};

  const steps: Array<{ key: string; severity: string }> =
    workbenchId === QA_SIGNOFF_WORKBENCH_ID
      ? FASTTRACK_STEPS.map((s) => ({
          key: s.id,
          severity: s.severityOnFail,
        }))
      : workbenchId === QA_TESTER_MISSIONS_WORKBENCH_ID
      ? TESTER_MISSIONS_8.map((m) => ({
          key: m.id,
          severity: m.mandatoryEveryCycle ? "S0" : "S1",
        }))
      : workbenchId === QA_BROKER_SESSION_WORKBENCH_ID
      ? Object.keys(recMap).map((key) => ({
          key,
          severity: "S1",
        }))
      : workbenchId === QA_OUTPUT_SHOWCASE_WORKBENCH_ID
      ? OUTPUT_SHOWCASE_SCENARIOS.map((s) => ({
          key: s.id,
          severity: "S1",
        }))
      : workbenchId === QA_BROKER_FOLLOWUP_WORKBENCH_ID
      ? BROKER_FOLLOWUP_QUESTION_IDS.map((id) => ({
          key: id,
          severity: "S1",
        }))
      : workbenchId === QA_ROUND2_WORKBENCH_ID
      ? [
          ...ROUND1_REMEDIATION_28_ITEMS.map((r) => ({
            key: r.id,
            severity: "S1",
          })),
          ...ROUND2_CORE_MISSIONS_6.map((m) => ({
            key: m.id,
            severity: m.mandatoryEveryCycle ? "S0" : "S1",
          })),
          ...V6_PHYSICAL_DEVICE_MISSIONS_5.map((m) => ({
            key: m.id,
            severity: "S0",
          })),
        ]
      : workbenchId === QA_FULL_LOOP_WORKBENCH_ID
      ? FULL_LOOP_ALL_STEPS.map((s) => ({
          key: s.id,
          severity: s.severityOnFail,
        }))
      : workbenchId === QA_FULL_LOOP_V2_WORKBENCH_ID
      ? FULL_LOOP_V2_ALL_STEPS.map((s) => ({
          key: s.id,
          severity: s.severityOnFail,
        }))
      : workbenchId === QA_BROKER_FULL_LOOP_WORKBENCH_ID
      ? BROKER_FULL_LOOP_ALL_STEPS.map((s) => ({
          key: s.id,
          severity: s.severityOnFail,
        }))
      : workbenchId.startsWith("dealcard-im")
      ? CLICK_THROUGH_STEPS.map((s) => ({
          key: s.id,
          severity: s.defaultSeverityIfFail,
        }))
      : MECE_36_STEPS.map((s) => ({ key: s.code, severity: s.severity }));

  const recStatus = (entry: { status?: string } | undefined) =>
    typeof entry?.status === "string" ? entry.status.toUpperCase() : "";

  let passCount = 0;
  let polishCount = 0;
  let failCount = 0;
  let s0FailCount = 0;
  let s1FailCount = 0;
  let s2FailCount = 0;
  const failedStepCodes: string[] = [];

  for (const step of steps) {
    const entry = recMap[step.key];
    const st = recStatus(entry);
    if (!entry || !st || st === "PENDING") continue;
    if (st === "PASS" || st === "PASSED") {
      passCount += 1;
    } else if (st === "NEEDS_POLISH") {
      polishCount += 1;
    } else if (st === "FAIL" || st === "FAILED") {
      failCount += 1;
      failedStepCodes.push(step.key);
      const sev =
        entry.overrideSeverity === "S0" ||
        entry.overrideSeverity === "S1" ||
        entry.overrideSeverity === "S2" ||
        entry.overrideSeverity === "S3"
          ? entry.overrideSeverity
          : step.severity;
      if (sev === "S0") s0FailCount += 1;
      else if (sev === "S1") s1FailCount += 1;
      else s2FailCount += 1;
    }
  }

  const totalCount = steps.length;
  const completedCount = passCount + polishCount + failCount;

  let verdictLabel =
    workbenchId === QA_BROKER_FOLLOWUP_WORKBENCH_ID
      ? completedCount === totalCount
        ? `중개인 질문지 응답 완료 (${completedCount}/${totalCount})`
        : `질문지 응답 진행 중 (${completedCount}/${totalCount})`
      : `점검 진행 중 (${completedCount}/${totalCount})`;
  if (workbenchId !== QA_BROKER_FOLLOWUP_WORKBENCH_ID) {
    if (s0FailCount > 0) {
      verdictLabel = `즉시 출시 중단 (S0 치명 ${s0FailCount}건)`;
    } else if (s1FailCount > 0) {
      verdictLabel = `당일 핫픽스 후 재승인 (S1 ${s1FailCount}건)`;
    } else if (completedCount === totalCount && s2FailCount > 0) {
      verdictLabel = `조건부 상용화 승인 (S2 경미 ${s2FailCount}건)`;
    } else if (completedCount === totalCount && polishCount > 0) {
      verdictLabel = `산출물 손질 후 확정 (손질 요청 ${polishCount}건 · ${completedCount}/${totalCount})`;
    } else if (polishCount > 0) {
      verdictLabel = `점검 진행 중 (통과 ${passCount} · 손질 ${polishCount}/${totalCount})`;
    } else if (completedCount === totalCount && passCount === totalCount) {
      verdictLabel = `상용화 최종 승인 (GO — ${totalCount}/${totalCount} PASS)`;
    }
  }

  return {
    completedCount,
    passCount,
    polishCount,
    failCount,
    s0FailCount,
    s1FailCount,
    s2FailCount,
    failedStepCodes,
    verdictLabel,
  };
}

function collectDealsFromContent(content: MagazineContent): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const key of ["featured_deals", "featuredDeals", "dealHighlights"] as const) {
    const arr = content?.[key];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && typeof item === "object") {
          out.push(item as Record<string, unknown>);
        }
      }
    }
  }
  return out;
}

function hasUnmaskedAddressString(val: string): boolean {
  const s = val.trim();
  if (!s) return false;
  return UNMASKED_LOT_RE.test(s) || UNMASKED_ROAD_BLDG_RE.test(s);
}

async function attachShowcaseImShareTokens(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rawManifest: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const entriesObj = rawManifest.entries;
  if (!entriesObj || typeof entriesObj !== "object" || Array.isArray(entriesObj)) {
    return rawManifest;
  }
  const sourceEntries = entriesObj as Record<string, unknown>;
  const clonedEntries: Record<string, unknown> = { ...sourceEntries };
  const minExpiryIso = new Date(Date.now() + 86_400_000).toISOString();

  await Promise.all(
    Object.entries(sourceEntries).map(async ([caseId, rawEntry]) => {
      if (!rawEntry || typeof rawEntry !== "object") return;
      const entry = { ...(rawEntry as Record<string, unknown>) };
      const category = String(entry.category || "");
      const buildingId = typeof entry.buildingId === "string" ? entry.buildingId.trim() : "";
      const liveUrl = typeof entry.liveUrl === "string" ? entry.liveUrl.trim() : "";
      if (
        category !== "im" ||
        !buildingId ||
        !liveUrl.startsWith("/im-lite/") ||
        liveUrl.includes("token=")
      ) {
        return;
      }

      try {
        let token: string | null = null;
        if (supabase && typeof supabase.from === "function") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = supabase.from("im_share_links");
          if (typeof q?.select === "function") q = q.select("token, status, expires_at");
          if (typeof q?.eq === "function") q = q.eq("building_id", buildingId);
          if (typeof q?.eq === "function") q = q.eq("status", "active");
          if (typeof q?.gt === "function") q = q.gt("expires_at", minExpiryIso);
          if (typeof q?.order === "function") q = q.order("created_at", { ascending: false });
          if (typeof q?.limit === "function") q = q.limit(1);
          const res = q && typeof q.then === "function" ? await q : null;
          const firstRow = Array.isArray(res?.data) ? res.data[0] : null;
          const candidateToken =
            typeof firstRow?.token === "string" ? firstRow.token.trim() : "";
          if (candidateToken.startsWith("slk.")) {
            const check = await verifyShareLinkToken({
              token: candidateToken,
              buildingId,
            });
            if (check.valid) {
              token = candidateToken;
            }
          }
        }

        if (!token) {
          const issued = await issueShareLinkToken({
            buildingId,
            kind: "im",
            ttlDays: 30,
          });
          token = issued.token;
        }

        if (token) {
          entry.liveUrl = `${liveUrl}${liveUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
          clonedEntries[caseId] = entry;
        }
      } catch {
        // Non-blocking fallback for offline/mock environments
      }
    })
  );

  return {
    ...rawManifest,
    entries: clonedEntries,
  };
}

/**
 * GET /api/public/qa-workbench?sessionId=<id>
 * Recover latest synced or submitted QA workbench session.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "test") {
    const ip = getClientIp(req) ?? "anonymous";
    const allowed = await checkRateLimit(ip, "public_qa_workbench_get", 60, 60_000);
    if (!allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        },
        { status: 429 }
      );
    }
  }

  const hasQaKey = hasValidQaAccessKeyHeader(req);
  if (isRealProductionRuntime() && !hasQaKey) {
    return createQaGateDeniedResponse();
  }
  if (req.nextUrl.searchParams.get("verifyQaKey") === "1" && !hasQaKey) {
    return createQaForbiddenResponse("유효한 QA 액세스 키가 필요합니다.");
  }

  const brokerUser = await resolveOptionalBrokerUser(req);
  if (!hasQaApiAccess(req, brokerUser)) {
    return createQaGateDeniedResponse();
  }

  const isEnforcedWithoutKey =
    !isRealProductionRuntime() && isQaEnforceFlagEnabled() && !hasQaKey;

  const queryMode = (req.nextUrl.searchParams.get("mode") || "").trim();
  const sessionId = (req.nextUrl.searchParams.get("sessionId") || "").trim();

  if (queryMode === "pins") {
    const isAuthenticated = Boolean(brokerUser?.id) || hasQaKey;
    const supabase = tryCreateServiceClient();
    const filterSid =
      sessionId && SESSION_ID_RE.test(sessionId) ? sessionId : undefined;
    let rawPins = await loadMergedQaPins(supabase, filterSid);
    if (isEnforcedWithoutKey) {
      if (!brokerUser?.id) {
        return createQaGateDeniedResponse();
      }
      rawPins = rawPins.filter((p) => p.authorId === brokerUser.id);
    }
    const pins = rawPins.map((p) => sanitizePinForViewer(p, isAuthenticated));
    return NextResponse.json({
      ok: true,
      pins,
    });
  }

  if (isEnforcedWithoutKey) {
    return brokerUser?.id
      ? createQaForbiddenResponse("매니페스트 및 관리자 조회는 QA 액세스 키가 필요합니다.")
      : createQaGateDeniedResponse();
  }

  if (queryMode === "showcase") {
    const supabase = tryCreateServiceClient();
    let manifest: Record<string, unknown> | null = null;
    let publishedAt: string | null = null;

    if (supabase) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = supabase
          .from("activity_events")
          .select("id, metadata, created_at")
          .eq("entity_type", "qa_showcase_manifest")
          .eq("event_type", "qa_showcase_published");
        if (typeof q.order === "function") {
          q = q.order("created_at", { ascending: false });
        }
        if (typeof q.limit === "function") {
          q = q.limit(1);
        }
        const res = await q;
        const row = Array.isArray(res?.data) ? res.data[0] : null;
        if (row?.metadata && typeof row.metadata === "object") {
          const meta = row.metadata as Record<string, unknown>;
          const rawManifest =
            meta.manifest && typeof meta.manifest === "object"
              ? (meta.manifest as Record<string, unknown>)
              : meta.entries && typeof meta.entries === "object"
              ? meta
              : null;
          if (rawManifest) {
            manifest = await attachShowcaseImShareTokens(supabase, rawManifest);
            publishedAt =
              typeof rawManifest.generatedAt === "string"
                ? rawManifest.generatedAt
                : String(row.created_at || "");
          }
        }
      } catch {
        manifest = null;
      }
    }

    return NextResponse.json({
      ok: true,
      manifest,
      publishedAt,
      buildStamp: getBuildStampInfo(),
      channelPolicy: QA_OUTBOUND_CHANNEL_POLICY,
    });
  }

  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    return NextResponse.json(
      { ok: false, error: "유효한 sessionId 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  const supabase = tryCreateServiceClient();
  if (supabase) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from("activity_events")
        .select("id, event_type, metadata, created_at")
        .eq("entity_type", "qa_workbench")
        .in("event_type", ["qa_workbench_submitted", "qa_workbench_synced"]);

      if (typeof query.eq === "function") {
        query = query.eq("metadata->>session_id", sessionId);
      }
      if (typeof query.order === "function") {
        query = query.order("created_at", { ascending: false });
      }
      if (typeof query.limit === "function") {
        query = query.limit(5);
      }

      const res = await query;
      let matchedRow = Array.isArray(res?.data)
        ? res.data.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (r: any) => r?.metadata && r.metadata.session_id === sessionId
          )
        : null;

      // Fallback scan if JSON path operator wasn't supported by mock/client
      if (!matchedRow && res?.error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fbQuery: any = supabase
          .from("activity_events")
          .select("id, event_type, metadata, created_at")
          .eq("entity_type", "qa_workbench")
          .in("event_type", ["qa_workbench_submitted", "qa_workbench_synced"]);
        if (typeof fbQuery.order === "function") {
          fbQuery = fbQuery.order("created_at", { ascending: false });
        }
        if (typeof fbQuery.limit === "function") {
          fbQuery = fbQuery.limit(50);
        }
        const fbRes = await fbQuery;
        if (Array.isArray(fbRes?.data)) {
          matchedRow = fbRes.data.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (r: any) => r?.metadata && r.metadata.session_id === sessionId
          );
        }
      }

      if (matchedRow?.metadata) {
        const meta = matchedRow.metadata as Record<string, unknown>;
        return NextResponse.json({
          ok: true,
          found: true,
          session: {
            workbenchId: String(meta.workbench_id || DEFAULT_WORKBENCH_ID),
            sessionId,
            mode:
              matchedRow.event_type === "qa_workbench_submitted" ? "submit" : "sync",
            syncedAt: String(matchedRow.created_at || new Date().toISOString()),
            testerName: typeof meta.tester_name === "string" ? meta.tester_name : "",
            testerOrg: typeof meta.tester_org === "string" ? meta.tester_org : "",
            overallComment:
              typeof meta.overall_comment === "string" ? meta.overall_comment : "",
            elapsedSeconds:
              typeof meta.elapsed_seconds === "number" ? meta.elapsed_seconds : 0,
            scratchLinks:
              meta.scratch_links && typeof meta.scratch_links === "object"
                ? meta.scratch_links
                : {},
            records:
              meta.records && typeof meta.records === "object" ? meta.records : {},
            summary: {
              completedCount: Number(meta.completed_count || 0),
              passCount: Number(meta.pass_count || 0),
              failCount: Number(meta.fail_count || 0),
              s0FailCount: Number(meta.s0_fail_count || 0),
              verdictLabel: String(meta.verdict_label || ""),
            },
          },
        });
      }
    } catch {
      // Fall through to memory store
    }
  }

  const mem = getMemorySessionStore().get(sessionId);
  if (mem) {
    return NextResponse.json({
      ok: true,
      found: true,
      session: {
        workbenchId: mem.workbenchId,
        sessionId: mem.sessionId,
        mode: mem.mode,
        syncedAt: mem.syncedAt,
        testerName: mem.testerName,
        testerOrg: mem.testerOrg,
        overallComment: mem.overallComment,
        elapsedSeconds: mem.elapsedSeconds,
        scratchLinks: mem.scratchLinks,
        records: mem.records,
        summary: {
          completedCount: mem.completedCount,
          passCount: mem.passCount,
          failCount: mem.failCount,
          s0FailCount: mem.s0FailCount,
          verdictLabel: mem.verdictLabel,
        },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    found: false,
    session: null,
  });
}

/**
 * POST /api/public/qa-workbench
 * Supports mode: "sync" | "submit" | "probe" | "seed_axis456"
 */
export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== "test") {
      const ip = getClientIp(req) ?? "anonymous";
      const allowed = await checkRateLimit(ip, "public_qa_workbench", 60, 60_000);
      if (!allowed) {
        return NextResponse.json(
          {
            ok: false,
            error: "요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          },
          { status: 429 }
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: Record<string, any> = {};
    try {
      body = (await req.json()) || {};
    } catch {
      if (isRealProductionRuntime() && !hasValidQaAccessKeyHeader(req)) {
        return createQaGateDeniedResponse();
      }
      return NextResponse.json(
        { ok: false, error: "유효한 JSON 요청 본문이 필요합니다." },
        { status: 400 }
      );
    }

    const mode = String(body?.mode || "").trim();
    const hasQaKey = hasValidQaAccessKeyHeader(req);

    if ((isRealProductionRuntime() || isPublicQaFlagEnabled()) && !hasQaKey) {
      if (!getConfiguredQaSecrets().anyConfigured) {
        return createQaGateDeniedResponse();
      }
      if (mode === "sync" || mode === "submit" || mode === "pin") {
        return NextResponse.json(
          {
            ok: false,
            error: "운영 환경에서 QA 워크벤치 쓰기는 유효한 QA 액세스 키가 필요합니다.",
          },
          { status: 401 }
        );
      }
      return createQaGateDeniedResponse();
    }

    const isEnforcedWithoutKey =
      !isRealProductionRuntime() && isQaEnforceFlagEnabled() && !hasQaKey;

    // ════════════════════════════════════════════════════════════════════════
    // MODE 1: "sync" | "submit" (A-1: Server Persistence of QA Execution Records)
    // ════════════════════════════════════════════════════════════════════════
    if (mode === "sync" || mode === "submit") {
      const workbenchId =
        typeof body.workbenchId === "string" && body.workbenchId.trim()
          ? body.workbenchId.trim().slice(0, 80)
          : DEFAULT_WORKBENCH_ID;
      const rawSessionId =
        typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      const sessionId = SESSION_ID_RE.test(rawSessionId)
        ? rawSessionId
        : `qa-${Date.now().toString(36)}`;
      const testerName =
        typeof body.testerName === "string"
          ? body.testerName.trim().slice(0, 80)
          : "";
      const testerOrg =
        typeof body.testerOrg === "string"
          ? body.testerOrg.trim().slice(0, 80)
          : "";
      const overallComment =
        typeof body.overallComment === "string"
          ? body.overallComment.slice(0, 2000)
          : "";
      const elapsedSeconds =
        typeof body.elapsedSeconds === "number" &&
        Number.isFinite(body.elapsedSeconds) &&
        body.elapsedSeconds >= 0
          ? Math.floor(body.elapsedSeconds)
          : 0;

      const safeScratchLinks: Record<string, string> = {};
      if (body.scratchLinks && typeof body.scratchLinks === "object") {
        for (const [k, v] of Object.entries(body.scratchLinks)) {
          if (typeof v === "string") {
            safeScratchLinks[k.slice(0, 40)] = v.slice(0, 600);
          }
        }
      }

      const safeRecords: Record<string, unknown> =
        body.records && typeof body.records === "object" && !Array.isArray(body.records)
          ? (body.records as Record<string, unknown>)
          : {};

      const summary = computeWorkbenchSummary(safeRecords, workbenchId);
      const brokerUser = await resolveOptionalBrokerUser(req);
      if (isEnforcedWithoutKey) {
        return brokerUser?.id
          ? createQaForbiddenResponse("QA 세션 동기화·제출은 QA 액세스 키가 필요합니다.")
          : NextResponse.json(
              {
                ok: false,
                error: "QA 세션 동기화는 로그인 또는 QA 액세스 키가 필요합니다.",
              },
              { status: 401 }
            );
      }
      if (!hasQaWriteAuthorization(req, brokerUser)) {
        return NextResponse.json(
          {
            ok: false,
            error: "운영 환경에서 QA 세션 동기화는 로그인 또는 QA 액세스 키가 필요합니다.",
          },
          { status: 401 }
        );
      }
      const keyRole = resolveQaKeyRole(req);
      const forbiddenReason = checkRoleSessionForbidden(keyRole, sessionId);
      if (forbiddenReason) {
        return NextResponse.json(
          {
            ok: false,
            code: "FORBIDDEN_QA_ROLE",
            error: forbiddenReason,
          },
          { status: 403 }
        );
      }
      const resolvedSyncActorRole = brokerUser
        ? "broker"
        : keyRole === "broker"
        ? "qa_broker"
        : keyRole === "master"
        ? "qa_master"
        : "qa_tester";
      const actorUuid =
        brokerUser?.id && isUuid(brokerUser.id) ? brokerUser.id : null;
      const syncedAt = new Date().toISOString();

      saveMemorySession({
        workbenchId,
        sessionId,
        mode,
        syncedAt,
        testerName,
        testerOrg,
        completedCount: summary.completedCount,
        passCount: summary.passCount,
        failCount: summary.failCount,
        s0FailCount: summary.s0FailCount,
        s1FailCount: summary.s1FailCount,
        failedStepCodes: summary.failedStepCodes,
        verdictLabel: summary.verdictLabel,
        elapsedSeconds,
        overallComment,
        scratchLinks: safeScratchLinks,
        records: safeRecords,
      });

      const eventPayload = {
        actor_id: actorUuid,
        actor_role: resolvedSyncActorRole,
        event_type:
          mode === "submit" ? "qa_workbench_submitted" : "qa_workbench_synced",
        entity_type: "qa_workbench",
        entity_id: actorUuid,
        metadata: {
          workbench_id: workbenchId,
          session_id: sessionId,
          tester_name: testerName,
          tester_org: testerOrg,
          completed_count: summary.completedCount,
          pass_count: summary.passCount,
          fail_count: summary.failCount,
          s0_fail_count: summary.s0FailCount,
          s1_fail_count: summary.s1FailCount,
          failed_codes: summary.failedStepCodes,
          verdict_label: summary.verdictLabel,
          elapsed_seconds: elapsedSeconds,
          overall_comment: overallComment,
          scratch_links: safeScratchLinks,
          records: safeRecords,
        },
      };

      const supabase = tryCreateServiceClient();
      let persistedToDb = false;
      if (supabase) {
        try {
          const { error: insErr } = await supabase
            .from("activity_events")
            .insert(eventPayload);
          if (!insErr) {
            persistedToDb = true;
          } else if (actorUuid && insErr.code === "23503") {
            // Retry with null actor_id if test/dev user has no profiles row yet
            const { error: retryErr } = await supabase
              .from("activity_events")
              .insert({
                ...eventPayload,
                actor_id: null,
                entity_id: null,
              });
            persistedToDb = !retryErr;
          } else {
            log.warn("[qa-workbench] activity_events insert degraded", {
              code: insErr.code || "UNKNOWN",
            });
          }
        } catch {
          persistedToDb = false;
        }
      }

      return NextResponse.json({
        ok: true,
        mode,
        sessionId,
        persistedToDb,
        syncedAt,
        summary: {
          completedCount: summary.completedCount,
          passCount: summary.passCount,
          polishCount: summary.polishCount,
          failCount: summary.failCount,
          s0FailCount: summary.s0FailCount,
          verdictLabel: summary.verdictLabel,
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODE 2: "probe" (A-2: Live Auto-Verifier Probe — Zero External SSRF)
    // ════════════════════════════════════════════════════════════════════════
    if (mode === "probe") {
      const brokerUser = await resolveOptionalBrokerUser(req);
      if (isEnforcedWithoutKey) {
        return brokerUser?.id
          ? createQaForbiddenResponse("프로브 점검은 QA 액세스 키가 필요합니다.")
          : createQaGateDeniedResponse();
      }
      if (!hasQaApiAccess(req, brokerUser)) {
        return createQaGateDeniedResponse();
      }

      const rawNewsletterUrl = String(
        body.publicNewsletterUrl ?? body.newsletterPublicUrl ?? body.newsletterUrl ?? ""
      ).trim();
      const rawImShareUrl = String(
        body.imShareUrl ?? body.imTokenUrl ?? ""
      ).trim();
      const rawSecondaryImShareUrl = String(
        body.secondaryImShareUrl ?? body.imTokenUrl2 ?? ""
      ).trim();
      const rawDealCardUrl = String(
        body.dealCardUrl ?? body.dcUrl ?? ""
      ).trim();
      const rawClientContact = String(body.testClientContact ?? "").trim();
      const expectedLoopId =
        body.expectedLoopId === "loop1" ||
        body.expectedLoopId === "loop2" ||
        body.expectedLoopId === "v2-loop1" ||
        body.expectedLoopId === "v2-loop2" ||
        body.expectedLoopId === "broker-loop1" ||
        body.expectedLoopId === "broker-byod"
          ? (body.expectedLoopId as
              | "loop1"
              | "loop2"
              | "v2-loop1"
              | "v2-loop2"
              | "broker-loop1"
              | "broker-byod")
          : null;
      const customForbiddenTokens: string[] = Array.isArray(
        body.customForbiddenTokens
      )
        ? body.customForbiddenTokens
            .map((t: unknown) => String(t ?? "").trim())
            .filter((t: string) => t.length >= 2)
            .slice(0, 25)
        : [];
      const matchedLoopDef = expectedLoopId
        ? FULL_LOOP_CASES.find(
            (c) => c.id === expectedLoopId || c.probeLoopId === expectedLoopId
          ) ||
          FULL_LOOP_V2_CASES.find((c) => c.probeLoopId === expectedLoopId) ||
          BROKER_FULL_LOOP_CASES.find((c) => c.probeLoopId === expectedLoopId)
        : undefined;
      const effectiveForbiddenTokens: string[] = Array.from(
        new Set([
          ...(matchedLoopDef?.groundTruth.forbiddenPublicTokens ?? []),
          ...customForbiddenTokens,
        ])
      );

      const supabase = tryCreateServiceClient();
      const callerBrokerKeys: string[] = [];
      if (brokerUser?.id) {
        callerBrokerKeys.push(brokerUser.id);
        if (supabase) {
          try {
            const { data: callerBp } = await supabase
              .from("broker_profiles")
              .select("slug")
              .eq("user_id", brokerUser.id)
              .maybeSingle();
            if (callerBp?.slug) {
              callerBrokerKeys.push(String(callerBp.slug));
            }
          } catch {
            // non-blocking
          }
        }
      }

      // ── 2A. Newsletter Check ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let newsletterCheck: Record<string, any> | null = null;
      let resolvedNewsletterBrokerKeys: string[] = [];

      if (rawNewsletterUrl) {
        const parsedRes = parseSafeSameOriginUrl(rawNewsletterUrl);
        if (!parsedRes.ok) {
          newsletterCheck = {
            validUrl: false,
            existsAndPublished: false,
            addressBlindPass: false,
            offendingCount: 0,
            brokerPhonePass: false,
            noRawUuidPass: false,
            error: parsedRes.error,
          };
        } else {
          const u = parsedRes.url;
          const magMatch = u.pathname.match(/^\/(?:magazine|m)\/([^/?#]+)\/([^/?#]+)/);
          if (!magMatch) {
            newsletterCheck = {
              validUrl: false,
              existsAndPublished: false,
              addressBlindPass: false,
              offendingCount: 0,
              brokerPhonePass: false,
              noRawUuidPass: false,
              error:
                "/magazine/<중개사슬러그>/<발행일> (또는 /m/<슬러그>/<발행일>) 형식의 공개 뉴스레터 URL을 입력해 주세요.",
            };
          } else {
            const brokerSlug = decodeURIComponent(magMatch[1]);
            const issueDate = decodeURIComponent(magMatch[2]);
            const editionId = u.searchParams.get("edition")?.trim() || null;

            let keys = [brokerSlug];
            if (supabase) {
              try {
                const resolvedBroker = await resolvePublicBroker(
                  supabase,
                  brokerSlug,
                  "user_id, slug, name"
                );
                if (resolvedBroker) {
                  keys = brokerKeys(resolvedBroker);
                }
              } catch {
                keys = [brokerSlug];
              }
            }
            resolvedNewsletterBrokerKeys = keys;

            let existsAndPublished = false;
            let rawContent: MagazineContent | null = null;
            let rowTitle: string | null = null;
            let editionOwnerBrokerId: string | null = null;

            if (supabase) {
              const editionSelect =
                "id, broker_id, status, edition_type, edition_label, title, market_temp, cover_keywords, cover_image_url, field_note, theme_title, theme_body_md, theme_asset_types, theme_color, content, published_at";

              // 1) If ?edition= is provided, inspect that edition first
              if (editionId) {
                try {
                  const lookupCol = isUuid(editionId) ? "id" : "edition_label";
                  const { data: edRows } = await supabase
                    .from("magazine_editions")
                    .select(editionSelect)
                    .in("broker_id", keys)
                    .eq(lookupCol, editionId)
                    .limit(1);
                  const edRow = Array.isArray(edRows) ? edRows[0] : edRows;
                  if (edRow) {
                    const merged = mergeEditionContent(edRow);
                    rawContent = merged;
                    rowTitle = typeof edRow.title === "string" ? edRow.title : null;
                    editionOwnerBrokerId =
                      typeof edRow.broker_id === "string" ? edRow.broker_id : null;
                    existsAndPublished =
                      edRow.status === "published" && !isUnpublishedContent(merged);
                  }
                } catch {
                  // continue fallback lookup
                }
              }

              // 2) Check magazine_issues(issue_date) and magazine_editions(edition_label / published_at)
              if (!rawContent) {
                try {
                  const { data: issRows } = await supabase
                    .from("magazine_issues")
                    .select("id, broker_id, content, updated_at")
                    .in("broker_id", keys)
                    .eq("issue_date", issueDate)
                    .order("updated_at", { ascending: false })
                    .limit(1);
                  const issRow = Array.isArray(issRows) ? issRows[0] : null;
                  if (issRow?.content && typeof issRow.content === "object") {
                    const c = issRow.content as MagazineContent;
                    rawContent = c.id ? c : { ...c, id: issRow.id };
                    editionOwnerBrokerId =
                      typeof issRow.broker_id === "string" ? issRow.broker_id : null;
                    existsAndPublished =
                      !isUnpublishedContent(rawContent) &&
                      (!rawContent.status || rawContent.status === "published");
                  }
                } catch {
                  // continue
                }
              }

              if (!rawContent) {
                try {
                  const { data: byLabelRows } = await supabase
                    .from("magazine_editions")
                    .select(editionSelect)
                    .in("broker_id", keys)
                    .eq("edition_label", issueDate)
                    .order("published_at", { ascending: false })
                    .limit(1);
                  const lblRow = Array.isArray(byLabelRows) ? byLabelRows[0] : null;
                  if (lblRow) {
                    const merged = mergeEditionContent(lblRow);
                    rawContent = merged;
                    rowTitle = typeof lblRow.title === "string" ? lblRow.title : null;
                    editionOwnerBrokerId =
                      typeof lblRow.broker_id === "string" ? lblRow.broker_id : null;
                    existsAndPublished =
                      lblRow.status === "published" && !isUnpublishedContent(merged);
                  }
                } catch {
                  // continue
                }
              }

              if (!rawContent && /^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
                try {
                  const startIso = new Date(`${issueDate}T00:00:00+09:00`).toISOString();
                  const endIso = new Date(
                    `${addDays(issueDate, 1)}T00:00:00+09:00`
                  ).toISOString();
                  const { data: byPubRows } = await supabase
                    .from("magazine_editions")
                    .select(editionSelect)
                    .in("broker_id", keys)
                    .gte("published_at", startIso)
                    .lt("published_at", endIso)
                    .order("published_at", { ascending: false })
                    .limit(1);
                  const pubRow = Array.isArray(byPubRows) ? byPubRows[0] : null;
                  if (pubRow) {
                    const merged = mergeEditionContent(pubRow);
                    rawContent = merged;
                    rowTitle = typeof pubRow.title === "string" ? pubRow.title : null;
                    editionOwnerBrokerId =
                      typeof pubRow.broker_id === "string" ? pubRow.broker_id : null;
                    existsAndPublished =
                      pubRow.status === "published" && !isUnpublishedContent(merged);
                  }
                } catch {
                  // continue
                }
              }
            }

            if (!rawContent) {
              newsletterCheck = {
                validUrl: true,
                brokerSlug,
                issueDate,
                editionId,
                existsAndPublished: false,
                addressBlindPass: false,
                offendingCount: 0,
                brokerPhonePass: false,
                noRawUuidPass: false,
                error: "해당 경로의 발행된 뉴스레터를 찾을 수 없습니다.",
              };
            } else {
              const maskedContent = maskPublicAddresses(rawContent);
              const rawDeals = collectDealsFromContent(rawContent);
              const maskedDeals = collectDealsFromContent(maskedContent);

              // Inspect both raw stored content AND masked public output
              const offendingSet = new Set<string>();
              for (const deal of [...rawDeals, ...maskedDeals]) {
                for (const field of ["address", "areaSignal", "area_signal"] as const) {
                  const v = deal[field];
                  if (typeof v === "string" && hasUnmaskedAddressString(v)) {
                    offendingSet.add(v.trim());
                  }
                }
              }
              if (effectiveForbiddenTokens.length > 0) {
                const publicMagSerialized = `${rowTitle || ""} ${JSON.stringify(maskedContent)}`;
                for (const tok of effectiveForbiddenTokens) {
                  if (tok && publicMagSerialized.includes(tok)) {
                    offendingSet.add(tok);
                  }
                }
              }
              const offendingAddresses = Array.from(offendingSet);
              const addressBlindPass = offendingAddresses.length === 0;

              const brokerObj =
                rawContent.broker && typeof rawContent.broker === "object"
                  ? (rawContent.broker as Record<string, unknown>)
                  : {};
              const brokerPhone =
                typeof brokerObj.phone === "string" ? brokerObj.phone.trim() : "";
              const brokerPhonePass = !brokerPhone.includes("@");

              const uuidOffendingSet = new Set<string>();
              const headlineCandidates = [
                typeof rawContent.headline === "string" ? rawContent.headline : "",
                rowTitle || "",
              ];
              for (const h of headlineCandidates) {
                if (h && RAW_UUID_SUBSTR_RE.test(h)) {
                  uuidOffendingSet.add(h.trim());
                }
              }
              for (const deal of rawDeals) {
                const t =
                  typeof deal.title === "string"
                    ? deal.title
                    : typeof deal.headline === "string"
                      ? deal.headline
                      : "";
                if (t && RAW_UUID_SUBSTR_RE.test(t)) {
                  uuidOffendingSet.add(t.trim());
                }
              }
              const offendingUuidTitles = Array.from(uuidOffendingSet);
              const noRawUuidPass = offendingUuidTitles.length === 0;

              const ownsNewsletterEdition = Boolean(
                brokerUser?.id &&
                  (brokerUser.role === "admin" ||
                    resolvedNewsletterBrokerKeys.some((k) =>
                      callerBrokerKeys.includes(k)
                    ) ||
                    (editionOwnerBrokerId &&
                      callerBrokerKeys.includes(editionOwnerBrokerId)))
              );

              newsletterCheck = {
                validUrl: true,
                brokerSlug,
                issueDate,
                editionId,
                existsAndPublished,
                addressBlindPass,
                offendingCount: offendingAddresses.length,
                ...(ownsNewsletterEdition
                  ? { offendingAddresses, offendingUuidTitles }
                  : {}),
                brokerPhonePass,
                noRawUuidPass,
                dealCount: rawDeals.length,
              };
            }
          }
        }
      }

      // ── 2B. Share Link Check ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let shareLinkCheck: Record<string, any> | null = null;
      if (rawImShareUrl) {
        const parsedRes = parseSafeSameOriginUrl(rawImShareUrl);
        if (!parsedRes.ok) {
          shareLinkCheck = {
            validUrl: false,
            buildingId: "",
            hasToken: false,
            isLocked: true,
            statusLabel: "URL 형식 오류",
            error: parsedRes.error,
          };
        } else {
          const u = parsedRes.url;
          const imMatch = u.pathname.match(/^\/im-lite\/([^/?#]+)/);
          if (!imMatch) {
            shareLinkCheck = {
              validUrl: false,
              buildingId: "",
              hasToken: false,
              isLocked: true,
              statusLabel: "URL 경로 오류 (/im-lite/<buildingId> 필요)",
              error: "/im-lite/<매물ID> 형식의 공유 링크를 입력해 주세요.",
            };
          } else {
            const buildingId = decodeURIComponent(imMatch[1]);
            const token = u.searchParams.get("token")?.trim() || null;

            let tokenBlocked = false;
            let tokenReason: string | null = null;
            if (token) {
              const tokenCheck = await verifyShareLinkToken({ token, buildingId });
              if (!tokenCheck.valid) {
                tokenBlocked = true;
                tokenReason = tokenCheck.reason || "invalid";
              }
            }

            // Check building-level lock across memory + activity_events + document_objects.body.is_revoked
            let dbGovRevoked: boolean | undefined;
            let dbGovTs = 0;
            let docBodyRevoked = false;
            let dbDocExists = false;
            let dbHasOfficialLandPrice = false;

            if (supabase) {
              try {
                const { data: govEvents } = await supabase
                  .from("activity_events")
                  .select("event_type, entity_id, metadata, created_at")
                  .in("event_type", ["link_revoked", "link_restored"])
                  .order("created_at", { ascending: false })
                  .limit(100);
                if (Array.isArray(govEvents)) {
                  for (const ev of govEvents) {
                    const meta =
                      ev?.metadata && typeof ev.metadata === "object"
                        ? (ev.metadata as Record<string, unknown>)
                        : {};
                    const evBld = String(meta.building_id || ev?.entity_id || "").trim();
                    if (evBld !== buildingId) continue;
                    if (ev.event_type === "link_revoked") {
                      dbGovRevoked = true;
                      dbGovTs = Date.parse(String(meta.revoked_at || ev.created_at || "")) || 0;
                      break;
                    }
                    if (ev.event_type === "link_restored") {
                      dbGovRevoked = false;
                      dbGovTs = Date.parse(String(meta.restored_at || ev.created_at || "")) || 0;
                      break;
                    }
                  }
                }
              } catch {
                // non-blocking
              }

              if (isUuid(buildingId)) {
                try {
                  const { data: docRows } = await supabase
                    .from("document_objects")
                    .select("id, body, updated_at, created_at")
                    .eq("building_id", buildingId)
                    .order("created_at", { ascending: false })
                    .limit(3);
                  if (Array.isArray(docRows) && docRows.length > 0) {
                    dbDocExists = true;
                    const docBody = (docRows[0]?.body || {}) as Record<string, unknown>;
                    if (docBody.is_revoked === true || docBody.isRevoked === true) {
                      docBodyRevoked = true;
                    }
                    const basicDoc =
                      docBody.basicImDocument && typeof docBody.basicImDocument === "object"
                        ? (docBody.basicImDocument as Record<string, unknown>)
                        : null;
                    const basicFacts =
                      basicDoc?.facts && typeof basicDoc.facts === "object"
                        ? (basicDoc.facts as Record<string, unknown>)
                        : null;
                    const ssotSum =
                      docBody.ssot_summary && typeof docBody.ssot_summary === "object"
                        ? (docBody.ssot_summary as Record<string, unknown>)
                        : null;
                    const rawPrice = Number(
                      docBody.officialLandPricePerSqm ??
                        ssotSum?.officialLandPricePerSqm ??
                        basicFacts?.officialLandPricePerSqm ??
                        0
                    );
                    if (
                      (Number.isFinite(rawPrice) && rawPrice > 0) ||
                      (Array.isArray(docBody.landPriceHistory) &&
                        docBody.landPriceHistory.length > 0)
                    ) {
                      dbHasOfficialLandPrice = true;
                    }
                  }
                } catch {
                  // non-blocking
                }

                if (!dbHasOfficialLandPrice) {
                  try {
                    const { data: ssotRow } = await supabase
                      .from("building_ssot_lite")
                      .select("id, layers")
                      .eq("id", buildingId)
                      .maybeSingle();
                    if (ssotRow) {
                      dbDocExists = true;
                      const pubLayer = (ssotRow.layers as Record<string, unknown> | null | undefined)?.public_data as Record<string, unknown> | undefined;
                      const priceVal = Number(
                        (ssotRow as Record<string, unknown>).official_land_price_per_sqm ??
                          pubLayer?.officialLandPricePerSqm ??
                          0
                      );
                      if (Number.isFinite(priceVal) && priceVal > 0) {
                        dbHasOfficialLandPrice = true;
                      }
                    }
                  } catch {
                    // non-blocking
                  }
                }
              }
            }

            const quickRec = getQuickImRecord(buildingId);
            const inboxRevokedEntry = getInboxState().revokedBuildings?.[buildingId];
            const localRevoked = Boolean(
              inboxRevokedEntry?.revoked ||
                isBuildingShareLinkRevoked(buildingId) ||
                quickRec?.isRevoked
            );
            const localTs = inboxRevokedEntry?.revokedAt
              ? Date.parse(inboxRevokedEntry.revokedAt)
              : 0;

            const effectiveBuildingRevoked =
              typeof dbGovRevoked === "boolean" && (!localTs || dbGovTs >= localTs)
                ? dbGovRevoked
                : localRevoked || dbGovRevoked === true;

            const isLocked =
              tokenBlocked || effectiveBuildingRevoked || docBodyRevoked;
            const docExists = dbDocExists || Boolean(quickRec);
            const quickAny = quickRec as unknown as Record<string, unknown> | null;
            const hasOfficialLandPrice =
              dbHasOfficialLandPrice ||
              Boolean(
                quickAny &&
                  ((typeof quickRec?.officialLandPriceWonSqm === "number" &&
                    quickRec.officialLandPriceWonSqm > 0) ||
                    (typeof quickAny.officialLandPricePerSqm === "number" &&
                      quickAny.officialLandPricePerSqm > 0) ||
                    (Array.isArray(quickAny.landPriceHistory) &&
                      quickAny.landPriceHistory.length > 0))
              );

            shareLinkCheck = {
              validUrl: true,
              buildingId,
              hasToken: Boolean(token),
              tokenReason,
              docExists,
              hasOfficialLandPrice,
              docRevoked: docBodyRevoked,
              isLocked,
              statusLabel: isLocked
                ? "잠금 차단 활성 (403 예상)"
                : docExists
                ? "열람 허용 · 공적장부 확인 (200 예상)"
                : "열람 허용 상태 (200 예상)",
            };
          }
        }
      }

      // ── 2C. Subscriber Check (Zero Third-Party PII Leak — Auth Required) ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let subscriberCheck: Record<string, any> | null = null;
      if (rawClientContact) {
        if (!brokerUser?.id) {
          subscriberCheck = {
            checked: false,
            reason: "AUTH_REQUIRED",
          };
        } else {
          const isEmailInput = rawClientContact.includes("@");
          const emailNorm = isEmailInput ? rawClientContact.toLowerCase() : null;
          const krDigits = !isEmailInput
            ? normalizeKrPhone(rawClientContact) || rawClientContact.replace(/\D/g, "")
            : null;
          const krDashed = krDigits ? formatDashedKrPhone(krDigits) : null;
          const krE164 = krDigits ? toE164Kr(krDigits) : null;

          let foundInMagazineSubscribers = false;
          let confirmStatus: string | null = null;
          let subscriberStatus: string | null = null;
          let foundInBrokerClients = false;

          if (supabase && (emailNorm || (krDigits && krDigits.length >= 8))) {
            const scopedBrokerKeys =
              callerBrokerKeys.length > 0 ? callerBrokerKeys : [brokerUser.id];

            // Check magazine_subscribers strictly scoped to authenticated broker
            try {
              const candidateSubRows: Array<Record<string, unknown>> = [];
              const phoneCandidates = Array.from(
                new Set([krDigits, krDashed].filter((x): x is string => Boolean(x)))
              );

              if (emailNorm) {
                const { data } = await supabase
                  .from("magazine_subscribers")
                  .select("status, confirm_status, unsubscribed_at")
                  .eq("subscriber_email", emailNorm)
                  .in("broker_id", scopedBrokerKeys)
                  .limit(5);
                if (Array.isArray(data)) candidateSubRows.push(...data);
              }

              if (phoneCandidates.length > 0) {
                const { data } = await supabase
                  .from("magazine_subscribers")
                  .select("status, confirm_status, unsubscribed_at")
                  .in("subscriber_phone", phoneCandidates)
                  .in("broker_id", scopedBrokerKeys)
                  .limit(5);
                if (Array.isArray(data)) candidateSubRows.push(...data);

                if (candidateSubRows.length === 0 && krE164) {
                  const { data: e164Data } = await supabase
                    .from("magazine_subscribers")
                    .select("status, confirm_status, unsubscribed_at")
                    .eq("phone_e164", krE164)
                    .in("broker_id", scopedBrokerKeys)
                    .limit(5);
                  if (Array.isArray(e164Data)) candidateSubRows.push(...e164Data);
                }
              }

              if (candidateSubRows.length > 0) {
                const primary =
                  candidateSubRows.find((r) => r.status === "active") ||
                  candidateSubRows[0];
                foundInMagazineSubscribers = true;
                subscriberStatus =
                  typeof primary.status === "string" ? primary.status : null;
                confirmStatus =
                  typeof primary.confirm_status === "string"
                    ? primary.confirm_status
                    : subscriberStatus;
              }
            } catch {
              // ignore
            }

            // Check broker_clients (strictly scoped to brokerUser.id)
            if (isUuid(brokerUser.id)) {
              try {
                const { data: cliRows } = await supabase
                  .from("broker_clients")
                  .select("phone, notes")
                  .eq("broker_id", brokerUser.id)
                  .limit(100);
                if (Array.isArray(cliRows)) {
                  foundInBrokerClients = cliRows.some((r: Record<string, unknown>) => {
                    const pDigits =
                      typeof r.phone === "string" ? r.phone.replace(/\D/g, "") : "";
                    if (krDigits && pDigits && pDigits === krDigits) return true;
                    if (
                      emailNorm &&
                      typeof r.notes === "string" &&
                      r.notes.toLowerCase().includes(emailNorm)
                    ) {
                      return true;
                    }
                    return false;
                  });
                }
              } catch {
                // ignore
              }
            }
          }

          subscriberCheck = {
            checked: true,
            foundInMagazineSubscribers,
            status: subscriberStatus,
            confirmStatus,
            foundInBrokerClients,
            brokerAuthenticated: true,
          };
        }
      }

      // ── 2D. DealCard Check (/dc/[id]) ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let dealCardCheck: Record<string, any> | null = null;
      if (rawDealCardUrl) {
        const normalizedDcInput =
          /^[a-z0-9-]+$/i.test(rawDealCardUrl) && !rawDealCardUrl.includes("/")
            ? `/dc/${rawDealCardUrl}`
            : rawDealCardUrl;
        const parsedRes = parseSafeSameOriginUrl(normalizedDcInput);
        if (!parsedRes.ok) {
          dealCardCheck = {
            validUrl: false,
            dealId: "",
            exists: false,
            addressBlindPass: false,
            offendingCount: 0,
            brokerPhonePass: false,
            statusLabel: "URL 형식 오류",
            error: parsedRes.error,
          };
        } else {
          const dcMatch = parsedRes.url.pathname.match(/^\/(?:dc|d)\/([^/?#]+)/i);
          if (!dcMatch) {
            dealCardCheck = {
              validUrl: false,
              dealId: "",
              exists: false,
              addressBlindPass: false,
              offendingCount: 0,
              brokerPhonePass: false,
              statusLabel: "URL 경로 오류 (/dc/<id> 필요)",
              error: "/dc/<딜카드ID> 형식의 링크 또는 ID를 입력해 주세요.",
            };
          } else {
            const dealId = decodeURIComponent(dcMatch[1]);
            let exists = false;
            let addressBlindPass = true;
            let brokerPhonePass = true;
            let dealCardOwnerId: string | null = null;
            const offendingTexts: string[] = [];

            if (supabase) {
              try {
                if (isUuid(dealId)) {
                  const [ssotRes, cardRes] = await Promise.all([
                    supabase
                      .from("building_ssot_lite")
                      .select("id, area_signal, asset_type, price_band, owner_id")
                      .eq("id", dealId)
                      .maybeSingle(),
                    supabase
                      .from("building_signal_cards")
                      .select("id, title, area_signal, deal_points, body")
                      .eq("building_id", dealId)
                      .maybeSingle(),
                  ]);
                  const ssot = ssotRes.data as Record<string, unknown> | null;
                  const card = cardRes.data as Record<string, unknown> | null;
                  if (ssot || card) {
                    exists = true;
                    const dealPts = Array.isArray(card?.deal_points)
                      ? (card.deal_points as unknown[])
                      : [];
                    const candidates = [
                      ssot?.area_signal,
                      card?.title,
                      card?.area_signal,
                      ...dealPts,
                      card?.headline,
                      card?.region,
                      card?.point_1,
                      card?.point_2,
                      card?.point_3,
                    ];
                    for (const val of candidates) {
                      if (typeof val === "string") {
                        if (hasUnmaskedAddressString(val)) {
                          addressBlindPass = false;
                          offendingTexts.push(val.slice(0, 60));
                        }
                        for (const tok of effectiveForbiddenTokens) {
                          if (tok && val.includes(tok)) {
                            addressBlindPass = false;
                            offendingTexts.push(tok);
                          }
                        }
                      }
                    }
                    const ownerId =
                      typeof ssot?.owner_id === "string" ? ssot.owner_id : null;
                    dealCardOwnerId = ownerId;
                    if (ownerId) {
                      const { data: prof } = await supabase
                        .from("profiles")
                        .select("phone")
                        .eq("id", ownerId)
                        .maybeSingle();
                      if (
                        typeof prof?.phone === "string" &&
                        prof.phone.includes("@")
                      ) {
                        brokerPhonePass = false;
                      }
                    }
                  }
                } else {
                  const { data: evRows } = await supabase
                    .from("activity_events")
                    .select("actor_id, metadata")
                    .in("event_type", ["dealcard_saved", "dealcard_created"])
                    .order("created_at", { ascending: false })
                    .limit(40);
                  if (Array.isArray(evRows)) {
                    for (const row of evRows) {
                      const meta = (row?.metadata || {}) as Record<string, unknown>;
                      const cardId = String(
                        meta.buildingId || meta.building_id || meta.id || ""
                      );
                      if (cardId !== dealId) continue;
                      exists = true;
                      dealCardOwnerId =
                        typeof row?.actor_id === "string"
                          ? row.actor_id
                          : typeof meta.ownerId === "string"
                          ? meta.ownerId
                          : typeof meta.brokerId === "string"
                          ? meta.brokerId
                          : null;
                      const c4 = (meta.card4 || {}) as Record<string, unknown>;
                      const pts = Array.isArray(c4.points) ? c4.points : [];
                        for (const val of [c4.headline, c4.region, ...pts]) {
                          if (typeof val === "string") {
                            if (hasUnmaskedAddressString(val)) {
                              addressBlindPass = false;
                              offendingTexts.push(val.slice(0, 60));
                            }
                            for (const tok of effectiveForbiddenTokens) {
                              if (tok && val.includes(tok)) {
                                addressBlindPass = false;
                                offendingTexts.push(tok);
                              }
                            }
                          }
                        }
                      break;
                    }
                  }
                }
              } catch {
                // non-blocking
              }
            }

            if (!exists && getQuickImRecord(dealId)) {
              exists = true;
            }

            const ownsDealCard = Boolean(
              brokerUser?.id &&
                (brokerUser.role === "admin" ||
                  (dealCardOwnerId && dealCardOwnerId === brokerUser.id))
            );

            dealCardCheck = {
              validUrl: true,
              dealId,
              exists,
              addressBlindPass,
              brokerPhonePass,
              offendingCount: offendingTexts.length,
              ...(ownsDealCard ? { offendingTexts } : {}),
              statusLabel: !exists
                ? "생성 기록 미확인 (로컬 전용이거나 미저장)"
                : addressBlindPass && brokerPhonePass
                ? "블라인드·연락처 검증 통과"
                : "블라인드/연락처 점검 필요",
            };
          }
        }
      }

      // ── 2E. Optional Secondary Share Link Check (Buyer #2 Orthogonal Revoke Comparison) ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let secondaryShareLinkCheck: Record<string, any> | null = null;
      if (rawSecondaryImShareUrl) {
        const parsedSec = parseSafeSameOriginUrl(rawSecondaryImShareUrl);
        if (!parsedSec.ok) {
          secondaryShareLinkCheck = {
            validUrl: false,
            buildingId: "",
            hasToken: false,
            isLocked: true,
            statusLabel: "URL 형식 오류",
            error: parsedSec.error,
          };
        } else {
          const secMatch = parsedSec.url.pathname.match(/^\/im-lite\/([^/?#]+)/);
          if (!secMatch) {
            secondaryShareLinkCheck = {
              validUrl: false,
              buildingId: "",
              hasToken: false,
              isLocked: true,
              statusLabel: "URL 경로 오류 (/im-lite/<buildingId> 필요)",
            };
          } else {
            const secBldId = decodeURIComponent(secMatch[1]);
            const secToken = parsedSec.url.searchParams.get("token")?.trim() || null;
            let secTokenBlocked = false;
            let secTokenReason: string | null = null;
            if (secToken) {
              const tCheck = await verifyShareLinkToken({
                token: secToken,
                buildingId: secBldId,
              });
              if (!tCheck.valid) {
                secTokenBlocked = true;
                secTokenReason = tCheck.reason || "invalid";
              }
            }
            const secBldRevoked = await isBuildingShareLinkRevoked(secBldId);
            const secLocked = secTokenBlocked || secBldRevoked;
            secondaryShareLinkCheck = {
              validUrl: true,
              buildingId: secBldId,
              hasToken: Boolean(secToken),
              tokenReason: secTokenReason,
              buildingRevoked: secBldRevoked,
              isLocked: secLocked,
              statusLabel: secLocked
                ? "매수자 2 링크 잠김 (403 차단 활성)"
                : "매수자 2 링크 열람 허용 (활성 유지)",
            };
          }
        }
      }

      // ── 2F. Optional Ground-Truth Area & Blind Oracle Check for Full-Loop Cases ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let groundTruthOracleCheck: Record<string, any> | null = null;
      if (expectedLoopId) {
        const loopDef = matchedLoopDef;
        const candidateBldId =
          (shareLinkCheck?.validUrl && shareLinkCheck?.buildingId
            ? String(shareLinkCheck.buildingId)
            : "") ||
          (dealCardCheck?.validUrl && dealCardCheck?.dealId
            ? String(dealCardCheck.dealId)
            : "");
        if (loopDef?.isByodMode && !candidateBldId) {
          groundTruthOracleCheck = {
            loopId: expectedLoopId,
            buildingId: "",
            isByodMode: true,
            landMatch: true,
            gfaMatch: true,
            singleParcelTrapTriggered: false,
            customKeywordCount: customForbiddenTokens.length,
            statusLabel:
              customForbiddenTokens.length > 0
                ? `내 매물 BYOD 보안 모드 · 비공개 키워드 ${customForbiddenTokens.length}개 노출 0건 검사 준비 완료`
                : "내 매물 BYOD 보안 모드 · ① 딜카드 링크 및 비공개 키워드를 입력해 검사하세요",
          };
        } else if (loopDef && candidateBldId) {
          let actualLandSqm: number | null = null;
          let actualGfaSqm: number | null = null;
          let hiddenSectionCount = 0;

          if (supabase && isUuid(candidateBldId)) {
            try {
              const [ssotRes, docRes] = await Promise.all([
                supabase
                  .from("building_ssot_lite")
                  .select("id, layers")
                  .eq("id", candidateBldId)
                  .maybeSingle(),
                supabase
                  .from("document_objects")
                  .select("body")
                  .eq("building_id", candidateBldId)
                  .order("created_at", { ascending: false })
                  .limit(1),
              ]);
              const ssotRow = ssotRes?.data as Record<string, unknown> | null;
              const ssotLayers =
                ssotRow?.layers && typeof ssotRow.layers === "object"
                  ? (ssotRow.layers as Record<string, unknown>)
                  : null;
              const ssotPublicLayer =
                ssotLayers?.public_data && typeof ssotLayers.public_data === "object"
                  ? (ssotLayers.public_data as Record<string, unknown>)
                  : null;
              const ssotRegLayer =
                ssotLayers?.building_register && typeof ssotLayers.building_register === "object"
                  ? (ssotLayers.building_register as Record<string, unknown>)
                  : null;
              const ssotSpecsLayer =
                ssotLayers?.specs && typeof ssotLayers.specs === "object"
                  ? (ssotLayers.specs as Record<string, unknown>)
                  : null;

              const docBody = (
                Array.isArray(docRes?.data) && docRes.data[0]?.body
                  ? docRes.data[0].body
                  : {}
              ) as Record<string, unknown>;
              const docSsot =
                docBody.ssot && typeof docBody.ssot === "object"
                  ? (docBody.ssot as Record<string, unknown>)
                  : null;
              const docSsotSummary =
                docBody.ssot_summary && typeof docBody.ssot_summary === "object"
                  ? (docBody.ssot_summary as Record<string, unknown>)
                  : null;
              const basicDoc =
                docBody.basicImDocument && typeof docBody.basicImDocument === "object"
                  ? (docBody.basicImDocument as Record<string, unknown>)
                  : null;
              const basicFacts =
                basicDoc?.facts && typeof basicDoc.facts === "object"
                  ? (basicDoc.facts as Record<string, unknown>)
                  : null;
              const basicLand =
                basicFacts?.land && typeof basicFacts.land === "object"
                  ? (basicFacts.land as Record<string, unknown>)
                  : null;
              const basicBuilding =
                basicFacts?.building && typeof basicFacts.building === "object"
                  ? (basicFacts.building as Record<string, unknown>)
                  : null;

              const hiddenSet = new Set<string>();
              for (const list of [
                docBody.hidden_sections,
                docBody.hiddenSections,
                basicDoc?.hiddenSections,
                basicDoc?.hidden_sections,
              ]) {
                if (Array.isArray(list)) {
                  for (const item of list) {
                    if (typeof item === "string" && item.trim()) {
                      hiddenSet.add(item.trim());
                    }
                  }
                }
              }
              hiddenSectionCount = hiddenSet.size;

              const pickPositiveSqm = (...cands: unknown[]): number | null => {
                for (const c of cands) {
                  const n = Number(String(c ?? "").replace(/,/g, ""));
                  if (Number.isFinite(n) && n > 0) return n;
                }
                return null;
              };

              const ssotPhysical = (ssotLayers?.physical as Record<string, unknown> | undefined) || undefined;
              const docHeroCard = (docBody?.heroCard as Record<string, unknown> | undefined) || undefined;

              actualLandSqm = pickPositiveSqm(
                basicLand?.landAreaSqm,
                basicFacts?.landAreaSqm,
                docSsot?.land_area_sqm,
                docSsot?.land_area_m2,
                docSsotSummary?.landAreaSqm,
                docSsotSummary?.land_area_sqm,
                docBody.landAreaSqm,
                docBody.land_area_sqm,
                ssotPhysical?.land_area_sqm,
                ssotPublicLayer?.landAreaSqm,
                ssotPublicLayer?.land_area_sqm,
                ssotRegLayer?.platArea,
                ssotRegLayer?.landAreaSqm,
                ssotSpecsLayer?.landAreaSqm,
                ssotLayers?.land_area_sqm
              );
              actualGfaSqm = pickPositiveSqm(
                basicBuilding?.totalGrossAreaSqm,
                basicBuilding?.grossFloorAreaSqm,
                basicFacts?.grossFloorAreaSqm,
                docSsot?.total_gross_area_sqm,
                docSsot?.gross_floor_area_sqm,
                docSsotSummary?.total_gross_area_sqm,
                docSsotSummary?.total_gross_area_m2,
                docSsotSummary?.grossFloorAreaSqm,
                docHeroCard?.totalGrossAreaSqm,
                docHeroCard?.totalArea,
                ssotPhysical?.total_floor_area_sqm,
                docBody.gfaSqm,
                docBody.gross_floor_area_sqm,
                docBody.total_gross_area_sqm,
                ssotPublicLayer?.grossFloorAreaSqm,
                ssotPublicLayer?.totalAreaSqm,
                ssotRegLayer?.totArea,
                ssotRegLayer?.grossFloorAreaSqm,
                ssotSpecsLayer?.gfaSqm,
                ssotLayers?.total_gross_area_sqm
              );
            } catch {
              // non-blocking
            }
          }

          if (actualLandSqm === null || actualGfaSqm === null) {
            const qRec = getQuickImRecord(candidateBldId) as unknown as Record<string, unknown> | null;
            if (qRec) {
              const qSpecs = (qRec.specs as Record<string, unknown> | undefined) || undefined;
              const qBasic = (qRec.basicImDoc as Record<string, unknown> | undefined) || undefined;
              const qFacts = (qBasic?.facts as Record<string, unknown> | undefined) || undefined;
              const qBld = (qFacts?.building as Record<string, unknown> | undefined) || undefined;
              if (actualLandSqm === null) {
                const lVal = Number(qRec.landAreaSqm ?? qRec.land_area_sqm ?? qSpecs?.landAreaSqm ?? 0);
                if (Number.isFinite(lVal) && lVal > 0) actualLandSqm = lVal;
              }
              if (actualGfaSqm === null) {
                const gVal = Number(
                  qRec.gfaSqm ??
                    qRec.gross_floor_area_sqm ??
                    qSpecs?.gfaSqm ??
                    qBld?.totalGrossAreaSqm ??
                    0
                );
                if (Number.isFinite(gVal) && gVal > 0) actualGfaSqm = gVal;
              }
            }
          }

          const gt = loopDef.groundTruth;
          if (loopDef.isByodMode) {
            groundTruthOracleCheck = {
              loopId: expectedLoopId,
              buildingId: candidateBldId,
              isByodMode: true,
              actualLandAreaSqm: actualLandSqm,
              actualGfaSqm: actualGfaSqm,
              landMatch: true,
              gfaMatch: true,
              singleParcelTrapTriggered: false,
              hiddenSectionCount,
              customKeywordCount: customForbiddenTokens.length,
              areaEvaluated: actualLandSqm !== null || actualGfaSqm !== null,
              statusLabel:
                actualLandSqm !== null || actualGfaSqm !== null
                  ? `내 매물 공부 면적 확인 (대지 ${actualLandSqm ?? "-"}㎡ / 연면적 ${actualGfaSqm ?? "-"}㎡) · 비공개 키워드 ${customForbiddenTokens.length}개 검사 완료`
                  : `내 매물 BYOD 보안 점검 완료 · 비공개 키워드 ${customForbiddenTokens.length}개 검사 적용`,
            };
          } else {
            const singleParcelTrapTriggered = Boolean(
              gt.singleParcelTrapSqm &&
                actualLandSqm !== null &&
                Math.abs(actualLandSqm - gt.singleParcelTrapSqm) <= 2.0
            );
            const landMatch =
              actualLandSqm !== null &&
              Math.abs(actualLandSqm - gt.expectedLandAreaSqm) <= gt.areaToleranceSqm;
            const gfaMatch =
              actualGfaSqm !== null &&
              Math.abs(actualGfaSqm - gt.expectedGfaSqm) <= gt.areaToleranceSqm;

            groundTruthOracleCheck = {
              loopId: expectedLoopId,
              buildingId: candidateBldId,
              expectedLandAreaSqm: gt.expectedLandAreaSqm,
              actualLandAreaSqm: actualLandSqm,
              landMatch,
              singleParcelTrapTriggered,
              expectedGfaSqm: gt.expectedGfaSqm,
              actualGfaSqm: actualGfaSqm,
              gfaMatch,
              hiddenSectionCount,
              areaEvaluated: actualLandSqm !== null || actualGfaSqm !== null,
              statusLabel: singleParcelTrapTriggered
                ? `다필지 오판 경고 (단일 대표필지 ${actualLandSqm}㎡로 저장됨 · 기대값 ${gt.expectedLandAreaSqm}㎡)`
                : actualLandSqm === null && actualGfaSqm === null
                ? "저장된 면적 레코드 대기 중 (IM 저장 후 재실행)"
                : landMatch && gfaMatch
                ? `정답 오라클 일치 (대지 ${actualLandSqm}㎡ / 연면적 ${actualGfaSqm}㎡)`
                : `면적 편차 점검 필요 (실측 대지 ${actualLandSqm ?? "-"}㎡ / 연면적 ${actualGfaSqm ?? "-"}㎡)`,
            };
          }
        }
      }

      return NextResponse.json({
        ok: true,
        checkedAt: new Date().toISOString(),
        newsletterCheck,
        shareLinkCheck,
        secondaryShareLinkCheck,
        subscriberCheck,
        dealCardCheck,
        groundTruthOracleCheck,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODE 3: "seed_axis456" (A-3: One-Click Axis 4~6 Test Lead & Subscriber Fixture)
    // ════════════════════════════════════════════════════════════════════════
    if (mode === "seed_axis456") {
      const guard = await requireBroker(req);
      if (isEnforcedWithoutKey) {
        return guard.user?.id
          ? createQaForbiddenResponse("시드 픽스처 생성은 QA 액세스 키가 필요합니다.")
          : createQaGateDeniedResponse();
      }
      if (guard.error || !guard.user?.id) {
        return (
          guard.error ??
          NextResponse.json(
            { ok: false, error: "중개사 계정으로 로그인한 뒤 실행해 주세요." },
            { status: 401 }
          )
        );
      }

      const user = guard.user;
      const supabase = tryCreateServiceClient();
      if (!supabase) {
        return NextResponse.json(
          { ok: false, error: "데이터베이스 연결을 초기화할 수 없습니다." },
          { status: 503 }
        );
      }

      // 1) Resolve broker slug & latest active building_ssot_lite row
      let brokerSlug: string | null = null;
      try {
        const { data: bp } = await supabase
          .from("broker_profiles")
          .select("slug")
          .eq("user_id", user.id)
          .maybeSingle();
        if (bp?.slug && typeof bp.slug === "string") {
          brokerSlug = bp.slug.trim();
        }
      } catch {
        brokerSlug = null;
      }

      let seededBuildingId: string | null = null;
      try {
        const { data: bldRows } = await supabase
          .from("building_ssot_lite")
          .select("id, status, created_at")
          .eq("owner_id", user.id)
          .neq("status", "archived")
          .order("created_at", { ascending: false })
          .limit(5);
        if (Array.isArray(bldRows) && bldRows[0]?.id) {
          seededBuildingId = String(bldRows[0].id);
        }
      } catch {
        seededBuildingId = null;
      }

      // 2) If active building exists, insert QA inquiry + matching gate_request_created event
      let seededInquiryId: string | null = null;
      if (seededBuildingId) {
        const baseInquiryPayload = {
          building_id: seededBuildingId,
          broker_user_id: user.id,
          requester_name: "[QA검증] 박매수 대표",
          requester_phone: "01099998888",
          requester_email: "qa-buyer@credeal.test",
          message: "[QA 자동시드] 상세 IM 열람 및 수익률 검토 요청드립니다.",
          source: "qa_workbench",
        };

        try {
          let inqRes = await supabase
            .from("im_inquiry_requests")
            .insert({ ...baseInquiryPayload, status: "submitted" })
            .select("id")
            .single();

          if (inqRes.error && isMissingColumnError(inqRes.error)) {
            inqRes = await supabase
              .from("im_inquiry_requests")
              .insert(baseInquiryPayload)
              .select("id")
              .single();
          }

          if (!inqRes.error && inqRes.data?.id) {
            seededInquiryId = String(inqRes.data.id);
          }
        } catch {
          seededInquiryId = null;
        }

        const effectiveGateReqId = seededInquiryId || `qa-inq-${Date.now()}`;
        if (!seededInquiryId) seededInquiryId = effectiveGateReqId;

        try {
          await supabase.from("activity_events").insert({
            actor_id: null,
            actor_role: "anonymous",
            event_type: "gate_request_created",
            entity_type: "building",
            entity_id: isUuid(seededBuildingId) ? seededBuildingId : null,
            metadata: {
              gate_request_id: effectiveGateReqId,
              source: "qa_workbench",
              building_id: seededBuildingId,
              broker_id: user.id,
              requester_name: "[QA검증] 박매수 대표",
              requester_phone: "01099998888",
              requester_email: "qa-buyer@credeal.test",
              message: "[QA 자동시드] 상세 IM 열람 및 수익률 검토 요청드립니다.",
              requested_level: "G2",
              privacy_agreed: true,
            },
          });
        } catch {
          // non-blocking if activity_events insert degraded
        }
      }

      // 3) Upsert / existing-check QA subscriber in magazine_subscribers (idempotent on double-click!)
      const nowIso = new Date().toISOString();
      const targetBrokerId = brokerSlug || user.id;
      const ownedBrokerKeys = Array.from(
        new Set([brokerSlug, user.id].filter((x): x is string => Boolean(x)))
      );

      const subscriberBase = {
        broker_id: targetBrokerId,
        subscriber_name: "[QA검증] 김구독 상무",
        subscriber_email: "qa-sub@credeal.test",
        subscriber_phone: "01077776666",
        channel: "email",
        status: "active",
        source: "qa_workbench",
        subscribed_at: nowIso,
        interest_profile: {
          origin: "qa_workbench",
          tags: {
            regions: ["강남/서초(GBD)"],
            assetTypes: ["꼬마빌딩"],
          },
        },
      };

      const subscriberConsentFields = {
        broker_user_id: user.id,
        phone_e164: "+821077776666",
        confirm_status: "confirmed",
        privacy_consent_at: nowIso,
        marketing_consent_at: nowIso,
      };

      let existingSubId: string | null = null;
      try {
        const { data: byPhone } = await supabase
          .from("magazine_subscribers")
          .select("id")
          .in("broker_id", ownedBrokerKeys)
          .in("subscriber_phone", ["01077776666", "010-7777-6666"])
          .limit(1);
        if (Array.isArray(byPhone) && byPhone[0]?.id) {
          existingSubId = String(byPhone[0].id);
        } else {
          const { data: byEmail } = await supabase
            .from("magazine_subscribers")
            .select("id")
            .in("broker_id", ownedBrokerKeys)
            .eq("subscriber_email", "qa-sub@credeal.test")
            .limit(1);
          if (Array.isArray(byEmail) && byEmail[0]?.id) {
            existingSubId = String(byEmail[0].id);
          }
        }
      } catch {
        existingSubId = null;
      }

      if (existingSubId) {
        const updRes = await supabase
          .from("magazine_subscribers")
          .update({
            ...subscriberBase,
            ...subscriberConsentFields,
            unsubscribed_at: null,
          })
          .eq("id", existingSubId);
        if (updRes.error && isMissingColumnError(updRes.error)) {
          await supabase
            .from("magazine_subscribers")
            .update(subscriberBase)
            .eq("id", existingSubId);
        }
      } else {
        let insSub = await supabase
          .from("magazine_subscribers")
          .insert({ ...subscriberBase, ...subscriberConsentFields })
          .select("id")
          .single();

        if (insSub.error && isMissingColumnError(insSub.error)) {
          // Retry with core consent columns supported by migration 000006
          insSub = await supabase
            .from("magazine_subscribers")
            .insert({
              ...subscriberBase,
              broker_user_id: user.id,
              phone_e164: "+821077776666",
              confirm_status: "confirmed",
              marketing_consent_at: nowIso,
            })
            .select("id")
            .single();

          if (insSub.error && isMissingColumnError(insSub.error)) {
            insSub = await supabase
              .from("magazine_subscribers")
              .insert(subscriberBase)
              .select("id")
              .single();
          }
        }

        // Handle concurrent click unique constraint gracefully
        if (insSub.error && insSub.error.code === "23505") {
          await supabase
            .from("magazine_subscribers")
            .update({ status: "active", subscribed_at: nowIso })
            .eq("broker_id", targetBrokerId)
            .eq("subscriber_phone", "01077776666");
        }
      }

      const message = seededBuildingId
        ? "✅ [QA검증] 박매수 대표(IM 열람 문의)와 김구독 상무(뉴스레터 구독자) 시드가 생성되었습니다. 소통관리함(/broker/w/inbox)에서 축 4~6을 즉시 점검하세요!"
        : "✅ [QA검증] 김구독 상무(뉴스레터 구독자) 시드가 생성되었습니다. (보유 활성 매물이 없어 IM 문의 시드는 생략되었습니다 — 먼저 딜카드/IM 매물 1건을 등록하면 문의 시드도 자동 생성됩니다.)";

      return NextResponse.json({
        ok: true,
        seededInquiryId,
        seededBuildingId,
        seededSubscriberContact: "010-7777-6666",
        message,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODE 4: "pin" (In-App QA Pin Dropped From Workspace ?qa=1 Overlay)
    // ════════════════════════════════════════════════════════════════════════
    if (mode === "pin") {
      const rawNote = typeof body.note === "string" ? body.note.trim() : "";
      if (!rawNote) {
        return NextResponse.json(
          { ok: false, error: "메모 내용을 입력해 주세요." },
          { status: 400 }
        );
      }

      const note = rawNote.slice(0, 1000);
      const rawSessionId =
        typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      const sessionId = SESSION_ID_RE.test(rawSessionId)
        ? rawSessionId
        : "qa-pin-global";
      const severity: "critical" | "major" | "minor" =
        body.severity === "critical" || body.severity === "minor"
          ? body.severity
          : "major";
      const workspace =
        typeof body.workspace === "string" && body.workspace.trim()
          ? body.workspace.trim().slice(0, 40)
          : "common";
      const routePath =
        typeof body.routePath === "string" && body.routePath.trim()
          ? body.routePath.trim().slice(0, 200)
          : "/broker/w";
      const targetSelector =
        typeof body.targetSelector === "string" && body.targetSelector.trim()
          ? body.targetSelector.trim().slice(0, 200)
          : "viewport";
      const targetLabel =
        typeof body.targetLabel === "string" && body.targetLabel.trim()
          ? body.targetLabel.trim().slice(0, 120)
          : "화면 전체";

      const rawVp =
        body.viewport && typeof body.viewport === "object"
          ? (body.viewport as { width?: unknown; height?: unknown })
          : null;
      const viewport =
        rawVp &&
        Number.isFinite(Number(rawVp.width)) &&
        Number.isFinite(Number(rawVp.height))
          ? {
              width: Math.max(0, Math.round(Number(rawVp.width))),
              height: Math.max(0, Math.round(Number(rawVp.height))),
            }
          : null;
      const fontScale =
        typeof body.fontScale === "string" ? body.fontScale.slice(0, 24) : null;
      const buildSha =
        typeof body.buildSha === "string" && body.buildSha.trim()
          ? body.buildSha.trim().slice(0, 24)
          : getBuildStampInfo().shortSha;
      const builtAt =
        typeof body.builtAt === "string" && body.builtAt.trim()
          ? body.builtAt.trim().slice(0, 40)
          : getBuildStampInfo().builtAt;
      const userAgent =
        typeof body.userAgent === "string" && body.userAgent.trim()
          ? body.userAgent.trim().slice(0, 240)
          : null;
      const requestedAuthorRole: "tester" | "broker" =
        body.authorRole === "broker" ? "broker" : "tester";
      const pinMode: "issue" | "redpen" =
        body.pinMode === "redpen" ? "redpen" : "issue";
      const originalText =
        typeof body.originalText === "string" && body.originalText.trim()
          ? body.originalText.trim().slice(0, 300)
          : null;
      const suggestedText =
        typeof body.suggestedText === "string" && body.suggestedText.trim()
          ? body.suggestedText.trim().slice(0, 300)
          : null;
      const screenshotDataUrl =
        typeof body.screenshotDataUrl === "string" &&
        body.screenshotDataUrl.startsWith("data:image/") &&
        body.screenshotDataUrl.length <= 150_000
          ? body.screenshotDataUrl
          : null;

      const brokerUser = await resolveOptionalBrokerUser(req);
      if (!hasQaWriteAuthorization(req, brokerUser)) {
        return NextResponse.json(
          {
            ok: false,
            error: "운영 환경에서 글로벌 QA 핀 또는 스크린샷 저장은 로그인 또는 QA 액세스 키가 필요합니다.",
          },
          { status: 401 }
        );
      }
      const keyRole = resolveQaKeyRole(req);
      const forbiddenReason = checkRoleSessionForbidden(keyRole, sessionId);
      if (forbiddenReason) {
        return NextResponse.json(
          {
            ok: false,
            code: "FORBIDDEN_QA_ROLE",
            error: forbiddenReason,
          },
          { status: 403 }
        );
      }
      const authorRole: "tester" | "broker" =
        keyRole === "tester" || keyRole === "broker"
          ? keyRole
          : requestedAuthorRole;
      const isAuthenticated =
        Boolean(brokerUser?.id) || hasValidQaAccessKeyHeader(req);
      const actorUuid =
        brokerUser?.id && isUuid(brokerUser.id) ? brokerUser.id : null;
      const createdAt = new Date().toISOString();
      const pin: QaFeedbackPin = {
        id: `pin-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        sessionId,
        workspace,
        routePath,
        targetSelector,
        targetLabel,
        note,
        severity,
        viewport,
        fontScale,
        createdAt,
        authorId: brokerUser?.id ?? null,
        authorEmail: brokerUser?.email ?? null,
        buildSha,
        builtAt,
        userAgent,
        authorRole,
        pinMode,
        originalText,
        suggestedText,
        screenshotDataUrl,
      };

      saveMemoryPin(pin);

      const supabase = tryCreateServiceClient();
      let persistedToDb = false;
      if (supabase) {
        try {
          const pinEvent = {
            actor_id: actorUuid,
            actor_role: brokerUser
              ? "broker"
              : authorRole === "broker"
              ? "qa_broker"
              : "qa_tester",
            event_type: "qa_pin_created",
            entity_type: "qa_pin",
            entity_id: actorUuid,
            metadata: pin,
          };
          const { error: insErr } = await supabase
            .from("activity_events")
            .insert(pinEvent);
          if (!insErr) {
            persistedToDb = true;
          } else if (actorUuid && insErr.code === "23503") {
            const { error: retryErr } = await supabase
              .from("activity_events")
              .insert({
                ...pinEvent,
                actor_id: null,
                entity_id: null,
              });
            persistedToDb = !retryErr;
          }
        } catch {
          persistedToDb = false;
        }
      }

      let rawPins = await loadMergedQaPins(supabase);
      if (isEnforcedWithoutKey && brokerUser?.id) {
        rawPins = rawPins.filter((p) => p.authorId === brokerUser.id);
      }
      const pins = rawPins.map((p) => sanitizePinForViewer(p, isAuthenticated));
      return NextResponse.json({
        ok: true,
        persistedToDb,
        pin: sanitizePinForViewer(pin, isAuthenticated),
        pins,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODE 5: "auto_probe_all" (1-Click Machine Invariant Probe for /qa-signoff)
    // ════════════════════════════════════════════════════════════════════════
    if (mode === "auto_probe_all") {
      const checkedAt = new Date().toISOString();
      const brokerUser = await resolveOptionalBrokerUser(req);
      if (isEnforcedWithoutKey) {
        return brokerUser?.id
          ? createQaForbiddenResponse("자동 무결성 프로브는 QA 액세스 키가 필요합니다.")
          : createQaGateDeniedResponse();
      }
      if (!hasQaApiAccess(req, brokerUser)) {
        return createQaGateDeniedResponse();
      }
      const supabase = tryCreateServiceClient();

      // 1) DealCard Blind Guard Check
      let blindPass = false;
      let blindDetail = "블라인드 방역 검사를 실행하지 못했습니다.";
      try {
        const dirtyPoints = ["서울 마포구 동교동 189-6 스타벅스 앞 010-1234-5678"];
        const detected = validateBlindPoints(dirtyPoints);
        const cleaned = cleanBlindPoints([
          "성수동2가 315-4 스타벅스 옆 한신빌딩",
        ]);
        const cleanedText = cleaned[0] || "";
        const blockedUnsafe = !detected.isValid && detected.violations.length > 0;
        const maskedCleanly =
          !cleanedText.includes("315-4") &&
          !cleanedText.includes("스타벅스") &&
          !cleanedText.includes("한신빌딩");
        blindPass = blockedUnsafe && maskedCleanly;
        blindDetail = blindPass
          ? `지번·브랜드·건물명·연락처 탐지(${detected.violations.length}건) 및 자동 마스킹 정상`
          : "블라인드 규칙 탐지 또는 마스킹 결과가 기준에 미달합니다.";
      } catch {
        blindPass = false;
      }

      // 2) Rent-Roll TSV Engine + Missing Floor Vacancy Synthesis Check
      let rentRollPass = false;
      let rentRollDetail = "렌트롤 TSV 파서 검사를 실행하지 못했습니다.";
      try {
        const sampleTsv =
          "층\t업종\t보증금\t월세\n1층\t카페\t50000000\t350\n3층\t사무실\t3000\t200";
        const parsed = parseTsvRentRoll(sampleTsv);
        const noFabricated2F = !parsed.rows.some(
          (r) => r.floor === "2F"
        );
        rentRollPass =
          parsed.hasUnitMistakes === true &&
          noFabricated2F &&
          parsed.totalDepositManwon === 8000 &&
          parsed.totalMonthlyRentManwon === 550;
        rentRollDetail = rentRollPass
          ? "원→만원 자동 보정, 미입력 층 허위 공실 합성 차단, 합계(8000/550) 일치"
          : "TSV 단위 보정 또는 공실·합계 무결성 불일치";
      } catch {
        rentRollPass = false;
      }

      // 3) Share Token Governance & Revocation Check
      let shareTokenPass = false;
      let shareTokenDetail = "공유 토큰 검증을 실행하지 못했습니다.";
      try {
        const [tamperA, tamperB, revokedNonexistent] = await Promise.all([
          verifyShareLinkToken({ token: "qa-tampered-invalid-token" }),
          verifyShareLinkToken({ token: "invalidPayload.invalidSig" }),
          isBuildingShareLinkRevoked("__qa_probe_nonexistent__"),
        ]);
        shareTokenPass =
          tamperA.valid === false &&
          tamperB.valid === false &&
          revokedNonexistent === false;
        shareTokenDetail = shareTokenPass
          ? "위조 토큰 거부(invalid) 및 폐기 상태 조회 정상 동작"
          : "토큰 서명 또는 폐기 조회 응답 이상";
      } catch {
        shareTokenPass = false;
      }

      // 4) Public Address & Broker Phone Placeholder Masking Check
      let publicMaskPass = false;
      let publicMaskDetail = "공개 페이지 지번 마스킹 검사를 실행하지 못했습니다.";
      try {
        const masked = maskPublicAddresses({
          featured_deals: [
            {
              title: "마포구 동교동 189-6 꼬마빌딩",
              address: "서울시 마포구 동교동 189-6",
            },
          ],
          broker: { phone: "01092423438@credeal.local" },
        } as unknown as MagazineContent);
        const deal0 = Array.isArray(masked.featured_deals)
          ? (masked.featured_deals[0] as Record<string, unknown> | undefined)
          : undefined;
        const addrOut = typeof deal0?.address === "string" ? deal0.address : "";
        const phoneOut =
          masked.broker && typeof masked.broker === "object"
            ? String((masked.broker as Record<string, unknown>).phone || "")
            : "";
        publicMaskPass =
          !addrOut.includes("189-6") && !phoneOut.includes("@");
        publicMaskDetail = publicMaskPass
          ? "공개 매물 상세 지번(189-6) 및 이메일형 가짜 연락처 자동 차단 완료"
          : "공개 데이터 지번 또는 가짜 연락처 마스킹 누락";
      } catch {
        publicMaskPass = false;
      }

      const checks = [
        {
          id: "dealcard-blind-guard",
          title: "딜카드 블라인드 방어 (지번·브랜드·건물명)",
          passed: blindPass,
          detail: blindDetail,
        },
        {
          id: "rent-roll-tsv-engine",
          title: "IM 렌트롤 TSV 단위 보정 & 공실 보간",
          passed: rentRollPass,
          detail: rentRollDetail,
        },
        {
          id: "share-token-governance",
          title: "공유 토큰 서명 위조 차단 & 폐기 상태 검증",
          passed: shareTokenPass,
          detail: shareTokenDetail,
        },
        {
          id: "public-address-masking",
          title: "공개 뉴스레터 지번·계정형 연락처 마스킹",
          passed: publicMaskPass,
          detail: publicMaskDetail,
        },
      ];

      let liveIm: string | null = null;
      let liveNewsletter: string | null = null;
      if (supabase && brokerUser?.id && isUuid(brokerUser.id)) {
        try {
          const [bldRes, edRes] = await Promise.all([
            supabase
              .from("building_ssot_lite")
              .select("id")
              .eq("owner_id", brokerUser.id)
              .neq("status", "archived")
              .order("created_at", { ascending: false })
              .limit(1),
            supabase
              .from("magazine_editions")
              .select("id, edition_label")
              .eq("broker_id", brokerUser.id)
              .eq("status", "published")
              .order("published_at", { ascending: false })
              .limit(1),
          ]);
          const bldId = Array.isArray(bldRes?.data) ? bldRes.data[0]?.id : null;
          if (bldId) {
            liveIm = `/broker/w/im?id=${encodeURIComponent(String(bldId))}&qa=1`;
          }
          const edRow = Array.isArray(edRes?.data) ? edRes.data[0] : null;
          if (edRow?.id) {
            liveNewsletter = `/broker/w/newsletter?id=${encodeURIComponent(
              String(edRow.id)
            )}&qa=1`;
          }
        } catch {
          // non-blocking
        }
      }

      const passedCount = checks.filter((c) => c.passed).length;
      return NextResponse.json({
        ok: true,
        checkedAt,
        authenticated: Boolean(brokerUser?.id),
        passedCount,
        totalCount: checks.length,
        checks,
        buildStamp: getBuildStampInfo(),
        channelPolicy: QA_OUTBOUND_CHANNEL_POLICY,
        readyLinks: {
          dealcards: "/broker/w/dealcards?qa=1",
          im: "/broker/w/im?qa=1",
          newsletter: "/broker/w/newsletter?qa=1",
          inbox: "/broker/w/inbox?qa=1",
          liveIm,
          liveNewsletter,
        },
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "지원하지 않는 mode입니다. ('sync' | 'submit' | 'probe' | 'seed_axis456' | 'pin' | 'auto_probe_all')",
      },
      { status: 400 }
    );
  } catch (err) {
    log.error("[qa-workbench] Unexpected error", {
      message: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
    return NextResponse.json(
      { ok: false, error: "QA 워크벤치 요청 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
