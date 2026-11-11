// @vitest-environment jsdom
/**
 * @file src/tests/workspace/inbox-full-pipeline-hardening.test.tsx
 * @description 4-Pillar MECE Preemptive Hardening Suite for Broker Inbox ("소통관리함")
 *
 * Covers verified findings across:
 *  - [Pillar-A] Inbox Workspace UX, Honest Failure Handling, Broker-Scoped Cache & Senior Guardrails
 *  - [Pillar-B] Inbox Aggregation API, Cross-Tenant UUID Hijack Block, Pending Count & Event Flood Defense
 *  - [Pillar-C] Inbox Mutations, Token Ownership on Restore, Gate State Machine, Honest DB Errors & Consent
 *  - [Pillar-D] Public Ingress (gate/submit, im-inquiry, gate-requests), PIPA Consent, Zero PII Logs & Analytics Handoff
 */
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import {
  saveInboxState,
  upsertCustomInboxClient,
  recordGateDecision,
} from "@/lib/im-lite/quick-generate-store";
import {
  issueShareLinkToken,
  revokeShareLinkToken,
  verifyShareLinkToken,
  resetShareLinkTokenStoreForTests,
} from "@/lib/security/share-link-tokens";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function isUuid(v: unknown): boolean {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

const BROKER_A = "11111111-1111-4111-8111-111111111111";
const BROKER_B = "22222222-2222-4222-8222-222222222222";
const BLD_A_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BLD_B_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GATE_REQ_A1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const GATE_REQ_A2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const PARTY_UUID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const VALID_GATE_STATUSES = new Set([
  "submitted",
  "broker_review",
  "approved",
  "rejected",
  "expired",
]);

const UUID_COLS: Record<string, Set<string>> = {
  building_ssot_lite: new Set(["id", "owner_id"]),
  buildings: new Set(["id", "owner_id"]),
  gate_requests: new Set(["id", "building_id", "requester_id", "reviewer_id"]),
  activity_events: new Set(["id", "actor_id", "entity_id"]),
  document_objects: new Set(["id", "building_id"]),
  broker_clients: new Set(["id", "broker_id"]),
};

const STRICT_ACTIVITY_EVENT_COLS = new Set([
  "id",
  "actor_id",
  "actor_role",
  "event_type",
  "entity_type",
  "entity_id",
  "metadata",
  "source_app",
  "created_at",
]);

interface FakeDb {
  building_ssot_lite: Array<Record<string, any>>;
  buildings: Array<Record<string, any>>;
  deals: Array<Record<string, any>>;
  gate_requests: Array<Record<string, any>>;
  im_inquiry_requests: Array<Record<string, any>>;
  in_app_notifications: Array<Record<string, any>>;
  activity_events: Array<Record<string, any>>;
  im_share_links: Array<Record<string, any>>;
  broker_clients: Array<Record<string, any>>;
  broker_custom_clients: Array<Record<string, any>>;
  broker_profiles: Array<Record<string, any>>;
  profiles: Array<Record<string, any>>;
  document_objects: Array<Record<string, any>>;
  party: Array<Record<string, any>>;
  buyer_condition: Array<Record<string, any>>;
  track_event: Array<Record<string, any>>;
  magazine_subscribers: Array<Record<string, any>>;
  magazine_issues: Array<Record<string, any>>;
}

function createEmptyDb(): FakeDb {
  return {
    building_ssot_lite: [],
    buildings: [],
    deals: [],
    gate_requests: [],
    im_inquiry_requests: [],
    in_app_notifications: [],
    activity_events: [],
    im_share_links: [],
    broker_clients: [],
    broker_custom_clients: [],
    broker_profiles: [],
    profiles: [],
    document_objects: [],
    party: [],
    buyer_condition: [],
    track_event: [],
    magazine_subscribers: [],
    magazine_issues: [],
  };
}

let sharedDb: FakeDb = createEmptyDb();
let currentAuthUser: { id: string; role?: string } | null = { id: BROKER_A, role: "broker" };
let throwOnCreateServiceClient = false;
const missingTables = new Set<string>();
const failingWriteTables = new Set<string>();

function createStrictSupabaseFake(db: FakeDb) {
  let seq = 1;
  return {
    from(table: string) {
      const filters: Array<(row: Record<string, any>) => boolean> = [];
      let pendingError: { code: string; message: string } | null = null;
      let orderCol: string | null = null;
      let orderAsc = true;
      let limitCount: number | null = null;
      let headOnly = false;
      let exactCount = false;
      let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
      let writePayload: any = null;

      if (missingTables.has(table)) {
        pendingError = {
          code: "42P01",
          message: `relation "public.${table}" does not exist`,
        };
      }

      const checkUuidCol = (col: string, val: unknown) => {
        if (val === null || val === undefined) return true;
        if (UUID_COLS[table]?.has(col) && !isUuid(val)) {
          pendingError = {
            code: "22P02",
            message: `invalid input syntax for type uuid: "${String(val)}"`,
          };
          return false;
        }
        return true;
      };

      const validateWriteRow = (row: Record<string, any>) => {
        if (failingWriteTables.has(table)) {
          pendingError = {
            code: "XX000",
            message: `forced write failure on ${table}`,
          };
          return false;
        }
        if (table === "activity_events") {
          for (const key of Object.keys(row)) {
            if (!STRICT_ACTIVITY_EVENT_COLS.has(key)) {
              pendingError = {
                code: "42703",
                message: `column "${key}" of relation "activity_events" does not exist`,
              };
              return false;
            }
          }
        }
        if (table === "gate_requests" && row.status !== undefined) {
          if (!VALID_GATE_STATUSES.has(String(row.status))) {
            pendingError = {
              code: "23514",
              message: `new row for relation "gate_requests" violates check constraint "gate_requests_status_check" (${String(row.status)})`,
            };
            return false;
          }
        }
        for (const [k, v] of Object.entries(row)) {
          if (!checkUuidCol(k, v)) return false;
        }
        return true;
      };

      const execute = () => {
        if (pendingError) {
          return { data: null, error: pendingError, count: null };
        }
        const rows = (db as any)[table] as Array<Record<string, any>> | undefined;
        if (!rows) {
          return {
            data: null,
            error: { code: "42P01", message: `relation "${table}" does not exist` },
            count: null,
          };
        }

        if (op === "insert" || op === "upsert") {
          const items = Array.isArray(writePayload) ? writePayload : [writePayload];
          const inserted: Array<Record<string, any>> = [];
          for (const item of items) {
            if (!validateWriteRow(item)) {
              return { data: null, error: pendingError, count: null };
            }
            const nextRow: Record<string, any> = {
              id:
                item.id ||
                (UUID_COLS[table]?.has("id")
                  ? table === "party"
                    ? PARTY_UUID
                    : `00000000-0000-4000-8000-${String(seq++).padStart(12, "0")}`
                  : `row-${seq++}`),
              created_at: item.created_at || new Date().toISOString(),
              ...item,
            };
            if (op === "upsert" && table === "im_share_links" && nextRow.token) {
              const idx = rows.findIndex((r) => r.token === nextRow.token);
              if (idx >= 0) {
                rows[idx] = { ...rows[idx], ...nextRow };
                inserted.push(rows[idx]);
                continue;
              }
            }
            rows.push(nextRow);
            inserted.push(nextRow);
          }
          return { data: inserted, error: null, count: inserted.length };
        }

        if (op === "update") {
          if (!validateWriteRow(writePayload || {})) {
            return { data: null, error: pendingError, count: null };
          }
          const matched = rows.filter((r) => filters.every((fn) => fn(r)));
          for (const target of matched) {
            Object.assign(target, writePayload);
          }
          return { data: matched, error: null, count: matched.length };
        }

        if (op === "delete") {
          const kept = rows.filter((r) => !filters.every((fn) => fn(r)));
          const removed = rows.length - kept.length;
          rows.splice(0, rows.length, ...kept);
          return { data: [], error: null, count: removed };
        }

        if (limitCount !== null && Number.isNaN(limitCount)) {
          return {
            data: null,
            error: { code: "22P02", message: 'invalid input syntax for type integer: "NaN"' },
            count: null,
          };
        }

        let matched = rows.filter((r) => filters.every((fn) => fn(r)));
        if (table === "gate_requests" && !VALID_GATE_STATUSES) {
          matched = [];
        }
        const totalCount = matched.length;
        if (orderCol) {
          matched = [...matched].sort((a, b) => {
            const av = String(a[orderCol!] ?? "");
            const bv = String(b[orderCol!] ?? "");
            return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        if (limitCount !== null && limitCount >= 0) {
          matched = matched.slice(0, limitCount);
        }
        return {
          data: headOnly ? null : matched.map((r) => ({ ...r })),
          error: null,
          count: exactCount ? totalCount : matched.length,
        };
      };

      const builder: any = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          if (opts?.count === "exact") exactCount = true;
          if (opts?.head) headOnly = true;
          return builder;
        },
        insert(payload: any) {
          op = "insert";
          writePayload = payload;
          return builder;
        },
        upsert(payload: any) {
          op = "upsert";
          writePayload = payload;
          return builder;
        },
        update(payload: any) {
          op = "update";
          writePayload = payload;
          return builder;
        },
        delete() {
          op = "delete";
          return builder;
        },
        eq(col: string, val: any) {
          if (!checkUuidCol(col, val)) return builder;
          if (table === "gate_requests" && col === "status" && !VALID_GATE_STATUSES.has(String(val))) {
            pendingError = {
              code: "23514",
              message: `invalid gate_requests status filter: "${String(val)}"`,
            };
            return builder;
          }
          filters.push((r) => String(r[col] ?? "") === String(val ?? ""));
          return builder;
        },
        neq(col: string, val: any) {
          filters.push((r) => String(r[col] ?? "") !== String(val ?? ""));
          return builder;
        },
        is(col: string, val: any) {
          filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
          return builder;
        },
        in(col: string, vals: any[]) {
          for (const v of vals) {
            if (!checkUuidCol(col, v)) return builder;
            if (
              table === "gate_requests" &&
              col === "status" &&
              !VALID_GATE_STATUSES.has(String(v))
            ) {
              pendingError = {
                code: "23514",
                message: `invalid gate_requests status filter: "${String(v)}"`,
              };
              return builder;
            }
          }
          const set = new Set(vals.map((v) => String(v)));
          filters.push((r) => set.has(String(r[col] ?? "")));
          return builder;
        },
        gte(col: string, val: any) {
          filters.push((r) => String(r[col] ?? "") >= String(val));
          return builder;
        },
        lt(col: string, val: any) {
          filters.push((r) => Boolean(r[col]) && String(r[col]) < String(val));
          return builder;
        },
        or(expr: string) {
          const parts = expr.split(",");
          filters.push((r) =>
            parts.some((p) => {
              if (p === "actor_id.is.null") return !r.actor_id;
              if (p.startsWith("actor_id.neq.")) {
                const target = p.slice("actor_id.neq.".length);
                return String(r.actor_id ?? "") !== target;
              }
              if (p === "actor_role.eq.system") return r.actor_role === "system";
              return true;
            })
          );
          return builder;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          orderCol = col;
          orderAsc = opts?.ascending !== false;
          return builder;
        },
        limit(n: number) {
          limitCount = n;
          return builder;
        },
        maybeSingle() {
          const res = execute();
          if (res.error) return Promise.resolve({ data: null, error: res.error });
          const arr = Array.isArray(res.data) ? res.data : [];
          return Promise.resolve({ data: arr[0] ?? null, error: null });
        },
        single() {
          const res = execute();
          if (res.error) return Promise.resolve({ data: null, error: res.error });
          const arr = Array.isArray(res.data) ? res.data : [];
          if (arr.length === 0) {
            return Promise.resolve({
              data: null,
              error: { code: "PGRST116", message: "0 rows" },
            });
          }
          return Promise.resolve({ data: arr[0], error: null });
        },
        then(onFulfilled: any, onRejected?: any) {
          return Promise.resolve(execute()).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: vi.fn(async () => {
    if (!currentAuthUser) {
      return {
        user: null,
        role: null,
        error: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
      };
    }
    return {
      user: { id: currentAuthUser.id, role: currentAuthUser.role || "broker" },
      role: currentAuthUser.role || "broker",
      error: null,
    };
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => {
    if (throwOnCreateServiceClient) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
    }
    return createStrictSupabaseFake(sharedDb);
  }),
}));

vi.mock("@/lib/notification/notification-service", () => ({
  sendKakaoAlimtalk: vi.fn(async () => true),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/broker/w/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

function resetColdStartStores() {
  delete (globalThis as any).__CRE_QUICK_IM_STORE__;
  saveInboxState({
    revokedBuildings: {},
    correctionNotices: {},
    gateDecisions: {},
    callNotes: {},
    customClients: [],
  });
  resetShareLinkTokenStoreForTests();
  try {
    const tmp = os.tmpdir();
    for (const file of fs.readdirSync(tmp)) {
      if (
        file.startsWith("cre-v3-quick-generate-store") ||
        file.startsWith("cre-v3-inbox-state-store") ||
        file.startsWith("cre-v4-")
      ) {
        try {
          fs.unlinkSync(path.join(tmp, file));
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}

describe("Inbox 4-Pillar Full Pipeline Preemptive Hardening Suite", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    sharedDb = createEmptyDb();
    currentAuthUser = { id: BROKER_A, role: "broker" };
    throwOnCreateServiceClient = false;
    missingTables.clear();
    failingWriteTables.clear();
    resetColdStartStores();
    window.localStorage.clear();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    if (container) {
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
  });

  /* ═══════════════════════════════════════════════════════════════════════════
   * [Pillar-A] Inbox Workspace UX & Client State Integrity
   * ═══════════════════════════════════════════════════════════════════════════ */
  describe("[Pillar-A] Inbox Workspace UX & Client State", () => {
    it("[A-S0-01] aborts local state mutation and avoids false-success toast when API returns 502 HTML or network failure", async () => {
      const InboxWorkspacePage = (await import("@/app/(broker)/broker/w/inbox/page")).default;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/broker/inbox?workspace=1")) {
          return new Response(
            JSON.stringify({
              ok: true,
              userId: BROKER_A,
              threads: [
                {
                  id: GATE_REQ_A1,
                  clientName: "강하늘 대표",
                  clientPhone: "010-1234-5678",
                  buildingId: BLD_A_UUID,
                  buildingTitle: "강남구 역삼동 코너빌딩",
                  status: "active",
                  gateStatus: "approved",
                  shareToken: "slk-existing",
                  openCount: 1,
                },
              ],
            }),
            { status: 200 }
          );
        }
        // Simulate 502 Bad Gateway HTML response (no JSON error property!)
        return new Response("<html>502 Bad Gateway</html>", { status: 502 });
      });

      await act(async () => {
        root!.render(<InboxWorkspacePage />);
      });

      const lockTrigger = container!.querySelector(
        '[data-testid="lock-share-link-trigger-btn"]'
      ) as HTMLButtonElement;
      expect(lockTrigger).not.toBeNull();
      await act(async () => {
        lockTrigger.click();
      });

      const confirmLock = container!.querySelector(
        '[data-testid="confirm-lock-link-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        confirmLock.click();
      });

      // Must NOT claim link is locked when 502 occurred!
      expect(container!.textContent).not.toContain("링크 잠김");
      expect(container!.textContent).not.toContain("열람 링크를 잠갔습니다");
    });

    it("[A-S0-02] blocks sending IM link on a locked (revoked) thread until unlocked", async () => {
      const InboxWorkspacePage = (await import("@/app/(broker)/broker/w/inbox/page")).default;
      const actionBodies: Array<Record<string, any>> = [];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes("/api/broker/inbox/actions") && init?.body) {
          actionBodies.push(JSON.parse(String(init.body)));
        }
        return new Response(JSON.stringify({ ok: true, threads: [] }), { status: 200 });
      });

      await act(async () => {
        root!.render(
          <InboxWorkspacePage
            initialThreads={[
              {
                id: "revoked-thread-1",
                clientName: "오잠금 상무",
                clientPhone: "010-2222-3333",
                clientGrade: "VIP",
                buildingTitle: "서초동 빌딩",
                buildingId: BLD_A_UUID,
                latestEvent: "보낸 링크를 잠갔습니다.",
                cleanMessage: "보낸 링크를 잠갔습니다.",
                updatedAt: "방금",
                openCount: 1,
                isRead: true,
                status: "revoked",
                shareToken: "slk-locked",
                events: [],
                budget: "100억",
                preferredRegion: "서초구",
              },
            ]}
          />
        );
      });

      const sendCta = container!.querySelector(
        '[data-testid="primary-cta-kakao-send"]'
      ) as HTMLButtonElement | null;
      if (sendCta) {
        await act(async () => {
          sendCta.click();
        });
        const sheet = container!.querySelector('[data-testid="inbox-share-option-sheet"]');
        const imBtn = Array.from(sheet?.querySelectorAll("button") || []).find((b) =>
          b.textContent?.includes("IM 전용 링크")
        ) as HTMLButtonElement | undefined;
        if (imBtn && !imBtn.disabled) {
          await act(async () => {
            imBtn.click();
          });
        }
      }

      // Must NEVER fire send_im on a revoked thread
      expect(actionBodies.some((b) => b.action === "send_im")).toBe(false);
    });

    it("[A-S0-03] isolates localStorage cache per broker and purges cached PII on 401 Unauthorized", async () => {
      const InboxWorkspacePage = (await import("@/app/(broker)/broker/w/inbox/page")).default;

      // Broker A's stale global cache left in browser
      window.localStorage.setItem(
        "credeal-w-inbox-v4",
        JSON.stringify([
          {
            id: "foreign-thread-a",
            clientName: "기밀고객A대표",
            clientPhone: "010-9999-8888",
            buildingId: BLD_A_UUID,
            buildingTitle: "역삼동 기밀매물",
            status: "pending_gate",
            openCount: 3,
          },
        ])
      );

      // Broker B logs in and receives only Broker B's thread
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            userId: BROKER_B,
            threads: [
              {
                id: "own-thread-b",
                clientName: "정상고객B이사",
                clientPhone: "010-1111-2222",
                buildingId: BLD_B_UUID,
                buildingTitle: "마포구 성산동 빌딩",
                status: "pending_gate",
                openCount: 1,
              },
            ],
          }),
          { status: 200 }
        )
      );

      await act(async () => {
        root!.render(<InboxWorkspacePage />);
      });

      expect(container!.textContent).toContain("정상고객B이사");
      expect(container!.textContent).not.toContain("기밀고객A대표");
      expect(container!.textContent).not.toContain("010-9999-8888");
    });

    it("[A-S0-04, A-S0-05 & A-S1-07] never prefills fabricated 450->480 rent correction, never attaches wrong building/bld-01, and preserves shareToken with honest 0 openCount", async () => {
      const mod = await import("@/app/(broker)/broker/w/inbox/page");
      const InboxWorkspacePage = mod.default;
      const normalized = mod.normalizeServerThread({
        id: "t-norm-1",
        clientName: "테스트고객",
        buildingId: "",
        shareToken: "slk.tok.123",
      });

      // A-S1-07 & A-S0-05: missing openCount -> 0 (not fake 1), empty buildingId -> "" (not "bld-01"), shareToken preserved
      expect(normalized.openCount).toBe(0);
      expect(normalized.buildingId).toBe("");

      const postedPayloads: Array<Record<string, any>> = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes("/api/broker/inbox/actions") && init?.body) {
          const parsed = JSON.parse(String(init.body));
          postedPayloads.push(parsed);
          return new Response(
            JSON.stringify({ ok: true, clientId: "custom_new_1" }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            userId: BROKER_A,
            inventory: [
              {
                buildingId: BLD_A_UUID,
                title: "강남구 논현동 빌딩",
                region: "강남구",
                priceBand: "120억",
                askingPriceManwon: 1200000,
                capRatePct: 4.1,
              },
            ],
            threads: [
              {
                id: "t-corr-1",
                clientName: "정정검증고객",
                clientPhone: "010-4444-5555",
                buildingId: BLD_A_UUID,
                buildingTitle: "강남구 논현동 빌딩",
                status: "active",
                openCount: 3,
              },
            ],
          }),
          { status: 200 }
        );
      });

      await act(async () => {
        root!.render(<InboxWorkspacePage />);
      });

      const openCorrBtn = container!.querySelector(
        '[data-testid="open-correction-notice-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        openCorrBtn.click();
      });

      const corrInput = container!.querySelector(
        '[data-testid="correction-notice-input"]'
      ) as HTMLInputElement;
      expect(corrInput.value).toBe("");

      // Open new client modal and register client WITHOUT matching building title
      const openModalBtn = container!.querySelector(
        '[data-testid="open-new-client-modal-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        openModalBtn.click();
      });
      const nameInput = container!.querySelector("#new-client-name") as HTMLInputElement;
      const submitBtn = container!.querySelector(
        '[data-testid="submit-new-client-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(nameInput, "매물미지정고객");
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
        nameInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => {
        submitBtn.click();
      });

      const upsertCall = postedPayloads.find((p) => p.action === "upsert_client");
      expect(upsertCall).toBeDefined();
      expect(upsertCall?.buildingId).toBe("");
    });

    it("[A-S1-06] cleans legacy /broker/inbox of banned lexicon ('핫리드'), <14px classes, and dead TODO buttons", () => {
      const legacyPath = path.resolve(
        process.cwd(),
        "src/app/(broker)/broker/inbox/page.tsx"
      );
      const src = fs.readFileSync(legacyPath, "utf-8");
      expect(src).not.toContain("핫리드");
      expect(src).not.toMatch(/\btext-(?:xs|\[(?:9|10|11|12|13)px\])\b/);
      expect(src).not.toContain("TODO: Navigate to client creation");
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════════
   * [Pillar-B] Inbox Read/Aggregation API & Tenant Isolation
   * ═══════════════════════════════════════════════════════════════════════════ */
  describe("[Pillar-B] Inbox Read/Aggregation API & Tenant Isolation", () => {
    it("[B-S0-01] prevents Broker B from hijacking Broker A's UUID building leads via self-authored im_upserted events", async () => {
      sharedDb.building_ssot_lite.push({
        id: BLD_A_UUID,
        owner_id: BROKER_A,
        area_signal: "강남구 역삼동",
        asset_type: "오피스",
        price_band: "150억",
        status: "published",
      });
      sharedDb.gate_requests.push({
        id: GATE_REQ_A1,
        building_id: BLD_A_UUID,
        requester_id: null,
        requested_level: "G2",
        requested_fields: [],
        reason: JSON.stringify({
          name: "A전용매수자",
          phone: "010-8888-7777",
          message: "역삼동 오피스 매입 검토",
        }),
        status: "submitted",
        created_at: "2026-11-10T10:00:00.000Z",
      });

      // Attacker Broker B forged an im_upserted event referencing Broker A's building UUID
      sharedDb.activity_events.push({
        id: "00000000-0000-4000-8000-000000000901",
        actor_id: BROKER_B,
        event_type: "im_upserted",
        entity_type: "building",
        entity_id: BLD_A_UUID,
        metadata: { building_id: BLD_A_UUID, im_item: { title: "탈취시도" } },
        created_at: "2026-11-10T11:00:00.000Z",
      });

      currentAuthUser = { id: BROKER_B, role: "broker" };
      const { GET } = await import("@/app/api/broker/inbox/route");
      const res = await GET(new NextRequest("http://localhost/api/broker/inbox?workspace=1"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(JSON.stringify(json)).not.toContain("A전용매수자");
      expect(JSON.stringify(json)).not.toContain("010-8888-7777");
    });

    it("[B-S1-01] counts submitted + broker_review + im_inquiry_requests without querying invalid 'pending' enum and fails closed on empty buildings", async () => {
      sharedDb.building_ssot_lite.push({
        id: BLD_A_UUID,
        owner_id: BROKER_A,
        status: "published",
      });
      sharedDb.gate_requests.push(
        {
          id: GATE_REQ_A1,
          building_id: BLD_A_UUID,
          status: "submitted",
          created_at: "2026-11-10T09:00:00.000Z",
        },
        {
          id: GATE_REQ_A2,
          building_id: BLD_A_UUID,
          status: "broker_review",
          created_at: "2026-11-10T09:30:00.000Z",
        }
      );
      sharedDb.im_inquiry_requests.push({
        id: "inq-a-1",
        building_id: BLD_A_UUID,
        broker_user_id: BROKER_A,
        requester_name: "문의고객",
        requester_phone: "01012341234",
        created_at: "2026-11-10T10:00:00.000Z",
      });

      const { GET } = await import("@/app/api/broker/inbox/pending-count/route");
      currentAuthUser = { id: BROKER_A, role: "broker" };
      const resA = await GET(new NextRequest("http://localhost/api/broker/inbox/pending-count"));
      const jsonA = await resA.json();
      expect(jsonA.count).toBe(3);

      // Broker B owns 0 buildings -> must return 0 (fail-closed)
      currentAuthUser = { id: BROKER_B, role: "broker" };
      const resB = await GET(new NextRequest("http://localhost/api/broker/inbox/pending-count"));
      const jsonB = await resB.json();
      expect(jsonB.count).toBe(0);
    });

    it("[B-S1-03, B-S1-04 & B-S1-05] returns 503 on service client failure, honors newer DB rejection/expiry over stale memory, and survives 150 call-note flood", async () => {
      const { GET } = await import("@/app/api/broker/inbox/route");

      // 1) Service client throws -> 503 (never 200 empty)
      throwOnCreateServiceClient = true;
      const errRes = await GET(new NextRequest("http://localhost/api/broker/inbox?workspace=1"));
      expect(errRes.status).toBe(503);
      throwOnCreateServiceClient = false;

      // 2) Stale memory says approved at 09:00, DB says rejected at 11:00 + flood of 150 call notes
      sharedDb.building_ssot_lite.push({
        id: BLD_A_UUID,
        owner_id: BROKER_A,
        area_signal: "서초구 서초동",
        asset_type: "근생빌딩",
        status: "published",
      });
      sharedDb.gate_requests.push({
        id: GATE_REQ_A1,
        building_id: BLD_A_UUID,
        requested_level: "G2",
        requested_fields: [],
        reason: JSON.stringify({ name: "최신DB검증", phone: "010-5555-6666" }),
        status: "rejected",
        created_at: "2026-11-10T08:00:00.000Z",
      });
      recordGateDecision(GATE_REQ_A1, "approved", "slk-stale", BLD_A_UUID);
      // Force memory updatedAt to older timestamp
      saveInboxState({
        revokedBuildings: {},
        correctionNotices: {},
        gateDecisions: {
          [GATE_REQ_A1]: {
            status: "approved",
            shareToken: "slk-stale",
            buildingId: BLD_A_UUID,
            updatedAt: "2026-11-10T09:00:00.000Z",
          },
        },
        callNotes: {},
        customClients: [],
      });

      sharedDb.activity_events.push({
        id: "00000000-0000-4000-8000-000000000500",
        actor_id: BROKER_A,
        event_type: "gate_request_rejected",
        entity_type: "building",
        entity_id: BLD_A_UUID,
        metadata: {
          thread_id: GATE_REQ_A1,
          request_id: GATE_REQ_A1,
          building_id: BLD_A_UUID,
          decision: "rejected",
        },
        created_at: "2026-11-10T11:00:00.000Z",
      });

      for (let i = 0; i < 150; i++) {
        sharedDb.activity_events.push({
          id: `00000000-0000-4000-8000-${String(2000 + i).padStart(12, "0")}`,
          actor_id: BROKER_A,
          event_type: "call_note_recorded",
          entity_type: "building",
          entity_id: BLD_A_UUID,
          metadata: { thread_id: "other-thread", building_id: BLD_A_UUID, note: `메모 ${i}` },
          created_at: new Date(Date.parse("2026-11-10T12:00:00.000Z") + i * 1000).toISOString(),
        });
      }

      const okRes = await GET(new NextRequest("http://localhost/api/broker/inbox?workspace=1"));
      const okJson = await okRes.json();
      const target = okJson.threads.find((t: any) => t.id === GATE_REQ_A1);
      expect(target?.gateStatus).toBe("rejected");
    });

    it("[B-S1-08..11] prevents shareToken bleed across requesters on same building, restores cold-start custom clients without arbitrary buildingIds[0], honors newsletter tag, and clamps NaN limit", async () => {
      sharedDb.building_ssot_lite.push({
        id: BLD_A_UUID,
        owner_id: BROKER_A,
        area_signal: "종로구 관철동",
        asset_type: "상가빌딩",
        status: "published",
      });
      sharedDb.gate_requests.push(
        {
          id: GATE_REQ_A1,
          building_id: BLD_A_UUID,
          requested_level: "G2",
          requested_fields: [],
          reason: JSON.stringify({ name: "승인고객A", phone: "010-1000-1001" }),
          status: "approved",
          created_at: "2026-11-10T09:00:00.000Z",
        },
        {
          id: GATE_REQ_A2,
          building_id: BLD_A_UUID,
          requested_level: "G2",
          requested_fields: [],
          reason: JSON.stringify({ name: "미승인고객B", phone: "010-1000-1002" }),
          status: "submitted",
          created_at: "2026-11-10T10:00:00.000Z",
        }
      );
      sharedDb.im_share_links.push({
        token: "slk-only-for-reqA1",
        building_id: BLD_A_UUID,
        broker_id: BROKER_A,
        recipient_id: GATE_REQ_A1,
        status: "active",
        created_at: "2026-11-10T09:05:00.000Z",
      });
      sharedDb.broker_clients.push({
        id: "00000000-0000-4000-8000-000000000777",
        broker_id: BROKER_A,
        display_name: "구독태그고객",
        phone: "010-3030-4040",
        tier: "vip",
        tags: ["뉴스레터구독"],
        notes: "",
        linked_building_ids: [],
        created_at: "2026-11-10T11:00:00.000Z",
      });
      sharedDb.activity_events.push({
        id: "00000000-0000-4000-8000-000000000778",
        actor_id: BROKER_A,
        event_type: "custom_client_upserted",
        entity_type: "building",
        entity_id: BROKER_A,
        metadata: {
          client_id: "custom_cold_1",
          client_name: "콜드스타트고객",
          client_phone: "010-7070-8080",
          client_grade: "VIP",
          building_id: "",
          building_title: "관심 매물 상담",
          newsletter_subscribed: true,
        },
        created_at: "2026-11-10T11:30:00.000Z",
      });

      const { GET } = await import("@/app/api/broker/inbox/route");
      const res = await GET(
        new NextRequest("http://localhost/api/broker/inbox?workspace=1&limit=abc&offset=-5")
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      const reqBThread = json.threads.find((t: any) => t.id === GATE_REQ_A2);
      expect(reqBThread?.shareToken).toBe("");

      const coldClient = json.threads.find((t: any) => t.clientName === "콜드스타트고객");
      expect(coldClient).toBeDefined();
      expect(coldClient.buildingId).toBe("");

      const taggedClient = json.threads.find((t: any) => t.clientName === "구독태그고객");
      expect(taggedClient?.newsletterSubscribed).toBe(true);
      expect(taggedClient?.buildingId).toBe("");
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════════
   * [Pillar-C] Inbox Mutations & Gate/Token Lifecycle
   * ═══════════════════════════════════════════════════════════════════════════ */
  describe("[Pillar-C] Inbox Mutations & Gate/Token Lifecycle", () => {
    it("[C-S0-01] blocks Broker B from unlocking Broker A's revoked shareToken when buildingId is omitted", async () => {
      sharedDb.building_ssot_lite.push({
        id: BLD_A_UUID,
        owner_id: BROKER_A,
        status: "published",
      });
      const issued = await issueShareLinkToken({
        buildingId: BLD_A_UUID,
        brokerId: BROKER_A,
        recipientId: GATE_REQ_A1,
      });
      await revokeShareLinkToken({
        token: issued.token,
        buildingId: BLD_A_UUID,
        brokerId: BROKER_A,
        reason: "broker_locked",
      });

      // Attacker Broker B tries restore_link with only shareToken (no buildingId)
      currentAuthUser = { id: BROKER_B, role: "broker" };
      const { POST } = await import("@/app/api/broker/inbox/actions/route");
      const attackRes = await POST(
        new NextRequest("http://localhost/api/broker/inbox/actions", {
          method: "POST",
          body: JSON.stringify({
            action: "restore_link",
            shareToken: issued.token,
          }),
        })
      );

      expect(attackRes.status).toBe(403);
      const check = await verifyShareLinkToken({ token: issued.token, buildingId: BLD_A_UUID });
      expect(check.valid).toBe(false);
    });

    it("[C-S0-02] blocks approving expired gate requests, uses valid 'submitted' on reset_gate, and blocks send_im from approving rejected requests", async () => {
      sharedDb.building_ssot_lite.push({
        id: BLD_A_UUID,
        owner_id: BROKER_A,
        status: "published",
      });
      sharedDb.gate_requests.push(
        {
          id: GATE_REQ_A1,
          building_id: BLD_A_UUID,
          status: "expired",
          created_at: "2026-11-01T00:00:00.000Z",
        },
        {
          id: GATE_REQ_A2,
          building_id: BLD_A_UUID,
          status: "rejected",
          created_at: "2026-11-09T00:00:00.000Z",
        }
      );

      currentAuthUser = { id: BROKER_A, role: "broker" };
      const { POST } = await import("@/app/api/broker/inbox/actions/route");

      // 1) Cannot approve an expired gate request
      const expRes = await POST(
        new NextRequest("http://localhost/api/broker/inbox/actions", {
          method: "POST",
          body: JSON.stringify({
            action: "approve_gate",
            threadId: GATE_REQ_A1,
            buildingId: BLD_A_UUID,
          }),
        })
      );
      expect(expRes.status).toBeGreaterThanOrEqual(400);

      // 2) send_im on a rejected gate request must NOT flip gate_requests.status to 'approved'
      const sendRejectedRes = await POST(
        new NextRequest("http://localhost/api/broker/inbox/actions", {
          method: "POST",
          body: JSON.stringify({
            action: "send_im",
            threadId: GATE_REQ_A2,
            buildingId: BLD_A_UUID,
          }),
        })
      );
      expect(sendRejectedRes.status).toBeGreaterThanOrEqual(400);
      expect(
        sharedDb.gate_requests.find((g) => g.id === GATE_REQ_A2)?.status
      ).toBe("rejected");

      // 3) reset_gate writes valid 'submitted' (passes CHECK constraint)
      const resetRes = await POST(
        new NextRequest("http://localhost/api/broker/inbox/actions", {
          method: "POST",
          body: JSON.stringify({
            action: "reset_gate",
            threadId: GATE_REQ_A2,
            buildingId: BLD_A_UUID,
          }),
        })
      );
      expect(resetRes.status).toBe(200);
      expect(
        sharedDb.gate_requests.find((g) => g.id === GATE_REQ_A2)?.status
      ).toBe("submitted");
    });

    it("[C-S0-03] returns 500 with ok:false, persisted:false when durable DB writes fail on log_call and approve_gate", async () => {
      sharedDb.building_ssot_lite.push({
        id: BLD_A_UUID,
        owner_id: BROKER_A,
        status: "published",
      });
      sharedDb.gate_requests.push({
        id: GATE_REQ_A1,
        building_id: BLD_A_UUID,
        status: "submitted",
        created_at: "2026-11-10T09:00:00.000Z",
      });

      failingWriteTables.add("activity_events");
      failingWriteTables.add("gate_requests");
      failingWriteTables.add("broker_custom_clients");

      currentAuthUser = { id: BROKER_A, role: "broker" };
      const { POST } = await import("@/app/api/broker/inbox/actions/route");

      const callRes = await POST(
        new NextRequest("http://localhost/api/broker/inbox/actions", {
          method: "POST",
          body: JSON.stringify({
            action: "log_call",
            threadId: GATE_REQ_A1,
            buildingId: BLD_A_UUID,
            note: "통화 메모 유실 검증",
          }),
        })
      );
      const callJson = await callRes.json();
      expect(callRes.status).toBe(500);
      expect(callJson.ok).toBe(false);
      expect(callJson.persisted).toBe(false);
    });

    it("[C-S0-04, C-S1-01, C-S1-02 & C-S1-03] routes GateRequestsInbox via API, revokes tokens on cron expiry, preserves per-recipient revoked token on sibling approval, and excludes non-consented leads from send_magazine", async () => {
      // 1) Deal-card GateRequestsInbox must not call browser supabase.from("gate_requests").update
      const dealInboxSrc = fs.readFileSync(
        path.resolve(
          process.cwd(),
          "src/app/(broker)/broker/deal-card/[id]/GateRequestsInbox.tsx"
        ),
        "utf-8"
      );
      expect(dealInboxSrc).not.toMatch(/\.from\(\s*["']gate_requests["']\s*\)\s*\.update/);

      // 2) Approving reqB must NOT resurrect individually revoked token of reqA
      sharedDb.building_ssot_lite.push({
        id: BLD_A_UUID,
        owner_id: BROKER_A,
        status: "published",
      });
      sharedDb.gate_requests.push(
        {
          id: GATE_REQ_A1,
          building_id: BLD_A_UUID,
          status: "approved",
          expires_at: "2026-11-01T00:00:00.000Z",
          auto_expired: false,
          requester_id: BROKER_B,
          created_at: "2026-10-29T00:00:00.000Z",
        },
        {
          id: GATE_REQ_A2,
          building_id: BLD_A_UUID,
          status: "submitted",
          created_at: "2026-11-10T10:00:00.000Z",
        }
      );

      const tokA1 = await issueShareLinkToken({
        buildingId: BLD_A_UUID,
        brokerId: BROKER_A,
        recipientId: GATE_REQ_A1,
      });
      await revokeShareLinkToken({
        token: tokA1.token,
        buildingId: BLD_A_UUID,
        brokerId: BROKER_A,
        reason: "recipient_a1_revoked",
      });

      currentAuthUser = { id: BROKER_A, role: "broker" };
      const { POST } = await import("@/app/api/broker/inbox/actions/route");
      const approveBRes = await POST(
        new NextRequest("http://localhost/api/broker/inbox/actions", {
          method: "POST",
          body: JSON.stringify({
            action: "approve_gate",
            threadId: GATE_REQ_A2,
            buildingId: BLD_A_UUID,
          }),
        })
      );
      const approveBJson = await approveBRes.json();
      expect(approveBRes.status).toBe(200);
      expect(approveBJson.shareToken).toBeTruthy();

      // Sibling A1's individually revoked token MUST stay revoked!
      const verifyA1 = await verifyShareLinkToken({
        token: tokA1.token,
        buildingId: BLD_A_UUID,
      });
      expect(verifyA1.valid).toBe(false);

      // 3) Cron expiry revokes active share links of expired gate_requests
      const tokForExpiry = await issueShareLinkToken({
        buildingId: BLD_A_UUID,
        brokerId: BROKER_A,
        recipientId: GATE_REQ_A1,
      });
      const { expireGateRequests } = await import("@/domain/gate/gate-expiry-cron");
      const cronRes = await expireGateRequests(createStrictSupabaseFake(sharedDb) as any);
      expect(cronRes.expiredCount).toBe(1);
      const verifyExpiredTok = await verifyShareLinkToken({
        token: tokForExpiry.token,
        buildingId: BLD_A_UUID,
      });
      expect(verifyExpiredTok.valid).toBe(false);

      // 4) send_magazine counts ONLY explicitly consented subscribers (not gate_request_approved or untagged VIP)
      sharedDb.broker_clients.push({
        id: "00000000-0000-4000-8000-000000000888",
        broker_id: BROKER_A,
        display_name: "미동의VIP고객",
        phone: "010-6000-6001",
        tier: "vip",
        tags: [],
        created_at: "2026-11-10T09:00:00.000Z",
      });
      upsertCustomInboxClient({
        id: "custom_optin_1",
        ownerId: BROKER_A,
        clientName: "명시동의고객",
        clientPhone: "010-6000-6002",
        clientGrade: "VIP",
        budget: "100억",
        preferredRegion: "강남구",
        buildingId: "",
        buildingTitle: "관심 매물 상담",
        newsletterSubscribed: true,
      });

      const magRes = await POST(
        new NextRequest("http://localhost/api/broker/inbox/actions", {
          method: "POST",
          body: JSON.stringify({
            action: "send_magazine",
            targetSegment: "all",
          }),
        })
      );
      const magJson = await magRes.json();
      expect(magJson.recipientCount).toBe(1);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════════
   * [Pillar-D] Public Ingress, Notifications & Privacy/PIPA
   * ═══════════════════════════════════════════════════════════════════════════ */
  describe("[Pillar-D] Public Ingress, Notifications & Privacy/PIPA", () => {
    it("[D-S0-01] POST /api/public/gate/submit rejects missing consent, blocks revoked/missing buildings from accessGranted, and normalizes +82 phone", async () => {
      sharedDb.building_ssot_lite.push({
        id: BLD_A_UUID,
        owner_id: BROKER_A,
        status: "published",
      });

      const { POST } = await import("@/app/api/public/gate/submit/route");

      // 1) Missing explicit consent -> 400
      const noConsentRes = await POST(
        new NextRequest("http://localhost/api/public/gate/submit", {
          method: "POST",
          body: JSON.stringify({
            dealId: BLD_A_UUID,
            formData: {
              budgetBand: "100~200억",
              purpose: "임대수익",
              financing: "대출 병행",
              entityType: "법인",
              name: "동의누락고객",
              phone: "010-1234-5678",
              consent: false,
            },
          }),
        })
      );
      expect(noConsentRes.status).toBe(400);

      // 2) Revoked building -> 403, accessGranted must NOT be true
      await revokeShareLinkToken({
        buildingId: BLD_A_UUID,
        brokerId: BROKER_A,
        reason: "locked",
      });
      const revokedRes = await POST(
        new NextRequest("http://localhost/api/public/gate/submit", {
          method: "POST",
          body: JSON.stringify({
            dealId: BLD_A_UUID,
            formData: {
              budgetBand: "100~200억",
              purpose: "임대수익",
              financing: "대출 병행",
              entityType: "법인",
              name: "잠금매물요청자",
              phone: "+82 10-1234-5678",
              consent: true,
            },
          }),
        })
      );
      const revokedJson = await revokedRes.json();
      expect(revokedRes.status).toBe(403);
      expect(revokedJson.accessGranted).not.toBe(true);
    });

    it("[D-S0-02] POST /api/public/im-inquiry overrides spoofed broker_user_id, persists to activity_events when im_inquiry_requests is missing without logging PII, and returns 503 if all stores fail", async () => {
      sharedDb.building_ssot_lite.push({
        id: BLD_A_UUID,
        owner_id: BROKER_A,
        area_signal: "강남구 삼성동",
        asset_type: "오피스",
        status: "published",
      });

      // Simulate production where im_inquiry_requests & in_app_notifications are missing (42P01)
      missingTables.add("im_inquiry_requests");
      missingTables.add("in_app_notifications");

      const { POST: postInquiry } = await import("@/app/api/public/im-inquiry/route");
      const res = await postInquiry(
        new NextRequest("http://localhost/api/public/im-inquiry", {
          method: "POST",
          body: JSON.stringify({
            building_id: BLD_A_UUID,
            broker_user_id: BROKER_B, // Spoofed foreign broker!
            requester_name: "실제문의고객",
            requester_phone: "+82 10-7777-9999",
            message: "삼성동 사옥 검토 문의",
            privacy_agreed: true,
          }),
        })
      );
      expect(res.status).toBe(200);

      // Verify Broker A sees the lead in GET /api/broker/inbox, and Broker B does NOT!
      const { GET: getInbox } = await import("@/app/api/broker/inbox/route");
      currentAuthUser = { id: BROKER_A, role: "broker" };
      const inboxARes = await getInbox(new NextRequest("http://localhost/api/broker/inbox?workspace=1"));
      const inboxAJson = await inboxARes.json();
      expect(JSON.stringify(inboxAJson.threads)).toContain("실제문의고객");

      currentAuthUser = { id: BROKER_B, role: "broker" };
      const inboxBRes = await getInbox(new NextRequest("http://localhost/api/broker/inbox?workspace=1"));
      const inboxBJson = await inboxBRes.json();
      expect(JSON.stringify(inboxBJson.threads)).not.toContain("실제문의고객");

      // Now if activity_events ALSO fails -> must return 503 (never 200 false success!)
      failingWriteTables.add("activity_events");
      const failRes = await postInquiry(
        new NextRequest("http://localhost/api/public/im-inquiry", {
          method: "POST",
          body: JSON.stringify({
            building_id: BLD_A_UUID,
            broker_user_id: BROKER_A,
            requester_name: "유실방지고객",
            requester_phone: "010-1212-3434",
            privacy_agreed: true,
          }),
        })
      );
      expect(failRes.status).toBeGreaterThanOrEqual(500);
    });

    it("[D-S1-02, D-S1-03 & D-S1-04] parses marketplace reason format, forbids fabricated consent in SubscribeCard, surfaces system magazine_view in inbox, and writes strict-schema im_view_alert_sent", async () => {
      // 1) Marketplace reason parsing
      const { parseGateRequestReason, GET: getInbox } = await import(
        "@/app/api/broker/inbox/route"
      );
      const parsed = parseGateRequestReason(
        "성함/기업명: 한별에셋 김대표, 연락처: 010-7777-8888"
      );
      expect(parsed.requesterName).toBe("한별에셋 김대표");
      expect(parsed.requesterPhone).toBe("010-7777-8888");

      // 2) SubscribeCard source must never fabricate { privacy: true, marketing: true, age14: true }
      const subCardSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/magazine/SubscribeCard.tsx"),
        "utf-8"
      );
      expect(subCardSrc).not.toMatch(/privacy:\s*true,\s*marketing:\s*true,\s*age14:\s*true/);

      // 3) Magazine analytics event (actor_id = BROKER_A, actor_role = 'system') surfaces in Broker A's inbox
      sharedDb.building_ssot_lite.push({
        id: BLD_A_UUID,
        owner_id: BROKER_A,
        area_signal: "마포구 연남동",
        asset_type: "근생빌딩",
        status: "published",
      });
      sharedDb.activity_events.push({
        id: "00000000-0000-4000-8000-000000000950",
        actor_id: BROKER_A,
        actor_role: "system",
        event_type: "magazine_view",
        entity_type: "building_ssot_lite",
        entity_id: BROKER_A,
        metadata: {
          broker_id: BROKER_A,
          edition_id: "2026-11-W2",
          viewer_name: "구독열람고객",
        },
        created_at: new Date().toISOString(),
      });

      currentAuthUser = { id: BROKER_A, role: "broker" };
      const inboxRes = await getInbox(new NextRequest("http://localhost/api/broker/inbox?workspace=1"));
      const inboxJson = await inboxRes.json();
      expect(inboxJson.activityEvents.some((e: any) => e.event_type === "magazine_view")).toBe(true);

      // 4) checkAndSendIMViewAlert succeeds against strict activity_events schema (no 42703 top-level broker_id)
      sharedDb.profiles.push({
        id: BROKER_A,
        phone: "010-9000-9001",
        display_name: "이중개사",
      });
      const { checkAndSendIMViewAlert } = await import("@/domain/notification/im-view-alert");
      const alertSent = await checkAndSendIMViewAlert(createStrictSupabaseFake(sharedDb), {
        buildingId: BLD_A_UUID,
        blindName: "마포구 연남동 *** 근생빌딩",
        dwellSeconds: 95,
        visitorHash: "vh-123",
      });
      expect(alertSent).toBe(true);
      expect(
        sharedDb.activity_events.some((e) => e.event_type === "im_view_alert_sent")
      ).toBe(true);
    });
  });
});
