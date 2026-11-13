/**
 * @file src/app/api/public/qa-workbench/route.ts
 * @description Server-synced QA Workbench persistence (A-1), Live Auto-Verifier Probe (A-2),
 * and 1-Click Axis 4~6 Test Lead & Subscriber Fixture Seeder (A-3) for /newsletter-inbox-test.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBroker } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limiter";
import {
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
import { createModuleLogger } from "@/lib/logger";

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

declare global {
  // eslint-disable-next-line no-var
  var __CRE_QA_WORKBENCH_SESSIONS__: Map<string, StoredQaSessionSnapshot> | undefined;
}

function getMemorySessionStore(): Map<string, StoredQaSessionSnapshot> {
  if (!globalThis.__CRE_QA_WORKBENCH_SESSIONS__) {
    globalThis.__CRE_QA_WORKBENCH_SESSIONS__ = new Map();
  }
  return globalThis.__CRE_QA_WORKBENCH_SESSIONS__;
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
): Promise<{ id: string; email?: string } | null> {
  try {
    const guard = await requireBroker(req);
    if (!guard.error && guard.user?.id) {
      return guard.user;
    }
    return null;
  } catch {
    return null;
  }
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

function computeWorkbenchSummary(rawRecords: unknown) {
  const recMap =
    rawRecords && typeof rawRecords === "object" && !Array.isArray(rawRecords)
      ? (rawRecords as Record<
          string,
          { status?: string; note?: string; overrideSeverity?: MeceSeverity }
        >)
      : {};

  let passCount = 0;
  let failCount = 0;
  let s0FailCount = 0;
  let s1FailCount = 0;
  let s2FailCount = 0;
  const failedStepCodes: string[] = [];

  for (const step of MECE_36_STEPS) {
    const entry = recMap[step.code];
    if (!entry || !entry.status || entry.status === "PENDING") continue;
    if (entry.status === "PASS") {
      passCount += 1;
    } else if (entry.status === "FAIL") {
      failCount += 1;
      failedStepCodes.push(step.code);
      const sev =
        entry.overrideSeverity === "S0" ||
        entry.overrideSeverity === "S1" ||
        entry.overrideSeverity === "S2"
          ? entry.overrideSeverity
          : step.severity;
      if (sev === "S0") s0FailCount += 1;
      else if (sev === "S1") s1FailCount += 1;
      else s2FailCount += 1;
    }
  }

  const totalCount = MECE_36_STEPS.length;
  const completedCount = passCount + failCount;

  let verdictLabel = `점검 진행 중 (${completedCount}/${totalCount})`;
  if (s0FailCount > 0) {
    verdictLabel = `즉시 출시 중단 (S0 치명 ${s0FailCount}건)`;
  } else if (s1FailCount > 0) {
    verdictLabel = `당일 핫픽스 후 재승인 (S1 ${s1FailCount}건)`;
  } else if (completedCount === totalCount && s2FailCount > 0) {
    verdictLabel = `조건부 상용화 승인 (S2 경미 ${s2FailCount}건)`;
  } else if (completedCount === totalCount && passCount === totalCount) {
    verdictLabel = `상용화 최종 승인 (GO — ${totalCount}/${totalCount} PASS)`;
  }

  return {
    completedCount,
    passCount,
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

/**
 * GET /api/public/qa-workbench?sessionId=<id>
 * Recover latest synced or submitted QA workbench session.
 */
export async function GET(req: NextRequest) {
  const sessionId = (req.nextUrl.searchParams.get("sessionId") || "").trim();
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
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
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
      return NextResponse.json(
        { ok: false, error: "유효한 JSON 요청 본문이 필요합니다." },
        { status: 400 }
      );
    }

    const mode = String(body?.mode || "").trim();

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

      const summary = computeWorkbenchSummary(safeRecords);
      const brokerUser = await resolveOptionalBrokerUser(req);
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
        actor_role: "qa_tester",
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
      const rawNewsletterUrl = String(
        body.publicNewsletterUrl ?? body.newsletterPublicUrl ?? body.newsletterUrl ?? ""
      ).trim();
      const rawImShareUrl = String(
        body.imShareUrl ?? body.imTokenUrl ?? ""
      ).trim();
      const rawClientContact = String(body.testClientContact ?? "").trim();

      const supabase = tryCreateServiceClient();
      const brokerUser = await resolveOptionalBrokerUser(req);

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
            brokerPhonePass: false,
            noRawUuidPass: false,
            offendingAddresses: [],
            offendingUuidTitles: [],
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
              brokerPhonePass: false,
              noRawUuidPass: false,
              offendingAddresses: [],
              offendingUuidTitles: [],
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

            if (supabase) {
              const editionSelect =
                "id, status, edition_type, edition_label, title, market_temp, cover_keywords, cover_image_url, field_note, theme_title, theme_body_md, theme_asset_types, theme_color, content, published_at";

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
                    .select("id, content, updated_at")
                    .in("broker_id", keys)
                    .eq("issue_date", issueDate)
                    .order("updated_at", { ascending: false })
                    .limit(1);
                  const issRow = Array.isArray(issRows) ? issRows[0] : null;
                  if (issRow?.content && typeof issRow.content === "object") {
                    const c = issRow.content as MagazineContent;
                    rawContent = c.id ? c : { ...c, id: issRow.id };
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
                brokerPhonePass: false,
                noRawUuidPass: false,
                offendingAddresses: [],
                offendingUuidTitles: [],
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

              newsletterCheck = {
                validUrl: true,
                brokerSlug,
                issueDate,
                editionId,
                existsAndPublished,
                addressBlindPass,
                offendingAddresses,
                brokerPhonePass,
                noRawUuidPass,
                offendingUuidTitles,
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
                  if (Array.isArray(docRows) && docRows[0]?.body) {
                    const docBody = docRows[0].body as Record<string, unknown>;
                    if (docBody.is_revoked === true || docBody.isRevoked === true) {
                      docBodyRevoked = true;
                    }
                  }
                } catch {
                  // non-blocking
                }
              }
            }

            const inboxRevokedEntry = getInboxState().revokedBuildings?.[buildingId];
            const localRevoked = Boolean(
              inboxRevokedEntry?.revoked ||
                isBuildingShareLinkRevoked(buildingId) ||
                getQuickImRecord(buildingId)?.isRevoked
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

            shareLinkCheck = {
              validUrl: true,
              buildingId,
              hasToken: Boolean(token),
              tokenReason,
              docRevoked: docBodyRevoked,
              isLocked,
              statusLabel: isLocked
                ? "잠금 차단 활성 (403 예상)"
                : "열람 허용 상태 (200 예상)",
            };
          }
        }
      }

      // ── 2C. Subscriber Check (Zero Third-Party PII Leak) ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let subscriberCheck: Record<string, any> | null = null;
      if (rawClientContact) {
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
          let scopedBrokerKeys: string[] = [];
          if (brokerUser?.id) {
            scopedBrokerKeys.push(brokerUser.id);
            try {
              const { data: bp } = await supabase
                .from("broker_profiles")
                .select("slug")
                .eq("user_id", brokerUser.id)
                .maybeSingle();
              if (bp?.slug) scopedBrokerKeys.push(String(bp.slug));
            } catch {
              // ignore
            }
          } else if (resolvedNewsletterBrokerKeys.length > 0) {
            scopedBrokerKeys = resolvedNewsletterBrokerKeys;
          }

          // Check magazine_subscribers
          try {
            const candidateSubRows: Array<Record<string, unknown>> = [];
            const phoneCandidates = Array.from(
              new Set([krDigits, krDashed].filter((x): x is string => Boolean(x)))
            );

            if (emailNorm) {
              let q = supabase
                .from("magazine_subscribers")
                .select("status, confirm_status, unsubscribed_at")
                .eq("subscriber_email", emailNorm);
              if (scopedBrokerKeys.length > 0) {
                q = q.in("broker_id", scopedBrokerKeys);
              }
              const { data } = await q.limit(5);
              if (Array.isArray(data)) candidateSubRows.push(...data);
            }

            if (phoneCandidates.length > 0) {
              let q = supabase
                .from("magazine_subscribers")
                .select("status, confirm_status, unsubscribed_at")
                .in("subscriber_phone", phoneCandidates);
              if (scopedBrokerKeys.length > 0) {
                q = q.in("broker_id", scopedBrokerKeys);
              }
              const { data } = await q.limit(5);
              if (Array.isArray(data)) candidateSubRows.push(...data);

              if (candidateSubRows.length === 0 && krE164) {
                let qE164 = supabase
                  .from("magazine_subscribers")
                  .select("status, confirm_status, unsubscribed_at")
                  .eq("phone_e164", krE164);
                if (scopedBrokerKeys.length > 0) {
                  qE164 = qE164.in("broker_id", scopedBrokerKeys);
                }
                const { data: e164Data } = await qE164.limit(5);
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

          // Check broker_clients & broker_custom_clients ONLY when broker is authenticated (strictly scoped to brokerUser.id)
          if (brokerUser?.id && isUuid(brokerUser.id)) {
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

            if (!foundInBrokerClients) {
              try {
                const { data: customRows } = await supabase
                  .from("broker_custom_clients")
                  .select("phone")
                  .eq("broker_id", brokerUser.id)
                  .limit(100);
                if (Array.isArray(customRows) && krDigits) {
                  foundInBrokerClients = customRows.some(
                    (r: Record<string, unknown>) =>
                      typeof r.phone === "string" &&
                      r.phone.replace(/\D/g, "") === krDigits
                  );
                }
              } catch {
                // ignore
              }
            }
          }
        }

        subscriberCheck = {
          foundInMagazineSubscribers,
          status: subscriberStatus,
          confirmStatus,
          foundInBrokerClients,
          brokerAuthenticated: Boolean(brokerUser?.id),
        };
      }

      return NextResponse.json({
        ok: true,
        checkedAt: new Date().toISOString(),
        newsletterCheck,
        shareLinkCheck,
        subscriberCheck,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODE 3: "seed_axis456" (A-3: One-Click Axis 4~6 Test Lead & Subscriber Fixture)
    // ════════════════════════════════════════════════════════════════════════
    if (mode === "seed_axis456") {
      const guard = await requireBroker(req);
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
        let updRes = await supabase
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

    return NextResponse.json(
      {
        ok: false,
        error:
          "지원하지 않는 mode입니다. ('sync' | 'submit' | 'probe' | 'seed_axis456')",
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
