/**
 * WP-7.3A P1-1 — error telemetry must satisfy the live `activity_events` schema.
 *
 * Before: error-reporter inserted `entity_id: "ERR-XXXX"` (not a uuid → 22P02) and
 * `source_app: 'dealcard'` (violates the 00005 CHECK), plus an `ai_anomalies` insert
 * into a table no migration creates — so no error report ever persisted. These tests
 * assert the payload *shape against the schema*, not merely "never throws".
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

function makeFakeSupabase() {
  return {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload });
          const result = { data: { id: "00000000-0000-4000-8000-000000000001" }, error: null };
          const chain = {
            select: () => chain,
            single: async () => result,
            then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve),
          };
          return chain;
        },
      };
    },
  };
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => makeFakeSupabase(),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn(async () => true),
}));

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Allowed `activity_events.source_app` values parsed from the latest CHECK migration. */
function readAllowedSourceApps(): string[] {
  const sql = fs.readFileSync(
    path.join(REPO_ROOT, "supabase/migrations/00005_activity_events_source_app.sql"),
    "utf8",
  );
  const m = sql.match(/source_app\s+IS\s+NULL\s+OR\s+source_app\s+IN\s*\(([\s\S]*?)\)/i);
  expect(m, "00005 CHECK constraint must be parseable").toBeTruthy();
  return Array.from(m![1].matchAll(/'([^']+)'/g)).map((x) => x[1]);
}

function assertActivityEventsSchema(payload: Record<string, unknown>) {
  // entity_id uuid NULL (00001_mvp_schema.sql)
  const entityId = payload.entity_id;
  expect(
    entityId === null || entityId === undefined || (typeof entityId === "string" && UUID_RE.test(entityId)),
    `entity_id must be uuid-or-null, got ${JSON.stringify(entityId)}`,
  ).toBe(true);
  // source_app CHECK (00005): NULL or one of the allowed apps
  if ("source_app" in payload && payload.source_app !== null && payload.source_app !== undefined) {
    expect(readAllowedSourceApps()).toContain(payload.source_app);
  }
  // event_type text NOT NULL, metadata jsonb NOT NULL
  expect(typeof payload.event_type).toBe("string");
  expect(payload.metadata && typeof payload.metadata === "object").toBe(true);
}

describe("WP-7.3A P1-1: schema sanity of the migrations this test relies on", () => {
  it("activity_events.entity_id is a uuid column and source_app is CHECK-constrained", () => {
    const mvp = fs.readFileSync(path.join(REPO_ROOT, "supabase/migrations/00001_mvp_schema.sql"), "utf8");
    const table = mvp.match(/create table activity_events \(([\s\S]*?)\);/i);
    expect(table).toBeTruthy();
    expect(table![1]).toMatch(/entity_id\s+uuid\s*,/i);
    const allowed = readAllowedSourceApps();
    expect(allowed).not.toContain("dealcard");
    expect(allowed.length).toBeGreaterThan(0);
  });
});

describe("WP-7.3A P1-1: error-reporter DB payload", () => {
  beforeEach(() => {
    inserts.length = 0;
    delete process.env.ERROR_WEBHOOK_URL;
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it("buildSystemErrorActivityRow keeps the ERR reference in metadata, entity_id null, no source_app", async () => {
    const { buildSystemErrorActivityRow } = await import("@/lib/observability/error-reporter");
    const row = buildSystemErrorActivityRow({
      refCode: "ERR-1A2B-abc123",
      boundary: "broker",
      digest: "abc123",
      url: "/broker/w/dealcards",
      errorName: "TypeError",
    }) as unknown as Record<string, unknown>;
    assertActivityEventsSchema(row);
    expect(row.entity_id).toBeNull();
    expect("source_app" in row).toBe(false);
    expect((row.metadata as Record<string, unknown>).ref_code).toBe("ERR-1A2B-abc123");
  });

  it("reportClientOrServerError (server) writes ONE schema-valid system_error_logs row and never touches ai_anomalies", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { reportClientOrServerError } = await import("@/lib/observability/error-reporter");
    const err = Object.assign(new Error("db timeout for user@example.com"), { digest: "d1g3st" });
    const ref = await reportClientOrServerError(err, { boundary: "root", url: "/broker?token=secret" });

    expect(ref).toMatch(/^ERR-[0-9A-F]{4}-d1g3st$/);
    expect(inserts.map((i) => i.table)).toEqual(["system_error_logs"]);
    const payload = inserts[0].payload;
    expect(payload.ref_code).toBe(ref);
    expect(payload.boundary).toBe("root");
    expect(payload.digest).toBe("d1g3st");
    expect(payload.url).toBe("/broker");
    expect(typeof payload.error_stack).toBe("string");
    expect(JSON.stringify(payload)).not.toContain("user@example.com");
    expect(JSON.stringify(payload)).not.toContain("token=secret");
  });

  it("client telemetry payload no longer sends the ERR code as entityId", async () => {
    const { buildClientErrorTelemetryPayload } = await import("@/lib/observability/error-reporter");
    const body = buildClientErrorTelemetryPayload({
      refCode: "ERR-0F0F",
      boundary: "public",
      digest: null,
      path: "/dc/x",
    }) as Record<string, unknown>;
    expect("entityId" in body).toBe(false);
    expect((body.metadata as Record<string, unknown>).client_error_ref).toBe("ERR-0F0F");
  });
});

describe("WP-7.3A P1-1: recordEvent row builder", () => {
  it("moves non-uuid entity ids into metadata.entity_ref and keeps uuids", async () => {
    const { buildActivityEventRow } = await import("@/domain/analytics/record-event");
    const nonUuid = buildActivityEventRow({
      eventType: "im_view_alert_sent",
      entityType: "session",
      entityId: "ERR-ABCD",
      metadata: { a: 1 },
    }) as unknown as Record<string, unknown>;
    assertActivityEventsSchema(nonUuid);
    expect(nonUuid.entity_id).toBeNull();
    expect(nonUuid.metadata).toEqual({ a: 1, entity_ref: "ERR-ABCD" });

    const uuid = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const ok = buildActivityEventRow({
      eventType: "im_view_alert_sent",
      entityId: uuid,
    }) as unknown as Record<string, unknown>;
    assertActivityEventsSchema(ok);
    expect(ok.entity_id).toBe(uuid);
    expect("source_app" in ok).toBe(false);
  });
});

describe("WP-7.3A P1-1: POST /api/public/events client_error_reported", () => {
  beforeEach(() => {
    inserts.length = 0;
  });

  function req(body: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextRequest } = require("next/server") as typeof import("next/server");
    return new NextRequest("http://localhost/api/public/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify(body),
    });
  }

  it("accepts the browser error beacon without entityId and persists a schema-valid row", async () => {
    const { POST } = await import("@/app/api/public/events/route");
    const res = await POST(
      req({
        type: "activity_event",
        eventType: "client_error_reported",
        entityType: "system",
        metadata: { client_error_ref: "ERR-1234", boundary: "public", digest: null, path: "/dc/x" },
      }),
    );
    expect(res.status).toBe(200);
    expect(inserts).toHaveLength(1);
    assertActivityEventsSchema(inserts[0].payload);
    expect(inserts[0].payload.entity_id).toBeNull();
    expect(inserts[0].payload.actor_role).toBe("anonymous");
  });

  it("legacy beacons that still send entityId=ERR-XXXX are stored with entity_id null (no 22P02)", async () => {
    const { POST } = await import("@/app/api/public/events/route");
    const res = await POST(
      req({
        type: "activity_event",
        eventType: "client_error_reported",
        entityType: "system",
        entityId: "ERR-9999",
        metadata: { client_error_ref: "ERR-9999" },
      }),
    );
    expect(res.status).toBe(200);
    assertActivityEventsSchema(inserts[0].payload);
    expect(inserts[0].payload.entity_id).toBeNull();
    expect((inserts[0].payload.metadata as Record<string, unknown>).entity_ref).toBe("ERR-9999");
  });

  it("still requires entityId for non-system entity types (400)", async () => {
    const { POST } = await import("@/app/api/public/events/route");
    const res = await POST(req({ eventType: "im_viewed", entityType: "im" }));
    expect(res.status).toBe(400);
    expect(inserts).toHaveLength(0);
  });
});
