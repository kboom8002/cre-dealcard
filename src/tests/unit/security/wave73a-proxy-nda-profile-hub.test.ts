import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  QA_GATED_PREFIXES,
  isQaGateEnforced,
  isQaGatedPath,
  isValidQaGateRequest,
  proxy,
  resolveProxySecret,
} from "@/proxy";
import {
  NDA_FALLBACK_TITLE,
  resolveNdaPublicBuildingTitle,
  toAreaLevelLabel,
} from "@/app/(public)/nda/[id]/nda-display";
import { metadata as ndaPageMetadata } from "@/app/(public)/nda/[id]/page";
import { findPublicBrokerProfile } from "@/app/(public)/broker-profile/[slug]/load-broker-profile";
import { kstWeekStartIso } from "@/app/(public)/hub/hub-week";
import {
  buildKakaoExternalOpenUrl,
  isInAppWebView,
} from "@/lib/ux/inapp-webview";

type BrokerSupabaseClient = Parameters<typeof findPublicBrokerProfile>[0];

interface BrokerProfileFixture {
  user_id: string;
  slug: string | null;
  is_public: boolean;
  is_verified: boolean | null;
}

interface ProfileFixture {
  id: string;
  display_name: string | null;
  role: string;
}

function escapeRegexChar(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Evaluates PostgreSQL ILIKE with default backslash escape semantics. */
function matchesPostgresIlike(value: unknown, pattern: string): boolean {
  if (typeof value !== "string") return false;
  let regexBody = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) {
      regexBody += escapeRegexChar(pattern[i + 1]);
      i += 1;
    } else if (ch === "%") {
      regexBody += ".*";
    } else if (ch === "_") {
      regexBody += ".";
    } else {
      regexBody += escapeRegexChar(ch);
    }
  }
  return new RegExp(`^${regexBody}$`, "i").test(value);
}

function createMockBrokerSupabase(fixtures: {
  broker_profiles: BrokerProfileFixture[];
  profiles: ProfileFixture[];
}): BrokerSupabaseClient {
  const from = (table: "broker_profiles" | "profiles") => {
    const sourceRows: Array<Record<string, unknown>> =
      table === "broker_profiles"
        ? fixtures.broker_profiles.map((r) => ({ ...r }))
        : fixtures.profiles.map((r) => ({ ...r }));

    const predicates: Array<(row: Record<string, unknown>) => boolean> = [];
    let maxRows: number | undefined;

    const evaluate = () => {
      const filtered = sourceRows.filter((row) => predicates.every((fn) => fn(row)));
      return typeof maxRows === "number" ? filtered.slice(0, maxRows) : filtered;
    };

    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        predicates.push((row) => row[column] === value);
        return builder;
      },
      ilike(column: string, pattern: string) {
        predicates.push((row) => matchesPostgresIlike(row[column], pattern));
        return builder;
      },
      limit(count: number) {
        maxRows = count;
        return builder;
      },
      async maybeSingle() {
        const rows = evaluate();
        return { data: rows[0] ?? null, error: null };
      },
      then<TResult1 = { data: Array<Record<string, unknown>>; error: null }, TResult2 = never>(
        onfulfilled?:
          | ((value: { data: Array<Record<string, unknown>>; error: null }) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve({ data: evaluate(), error: null }).then(onfulfilled, onrejected);
      },
    };

    return builder;
  };

  return { from } as unknown as BrokerSupabaseClient;
}

describe("Wave 7.3A security & public-surface hardening", () => {
  describe("P1-4: proxy QA-gate fail-closed & spoofed internal header stripping", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("CRE_ENFORCE_QA_GATE", "");
      vi.stubEnv("QA_ACCESS_KEY", "");
      vi.stubEnv("QA_TESTER_ACCESS_KEY", "");
      vi.stubEnv("QA_BROKER_ACCESS_KEY", "");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("identifies QA-gated paths strictly by segment boundary", () => {
      for (const prefix of QA_GATED_PREFIXES) {
        expect(isQaGatedPath(prefix)).toBe(true);
        expect(isQaGatedPath(`${prefix}/sub/route`)).toBe(true);
      }
      expect(isQaGatedPath("/qa-tester-public")).toBe(false);
      expect(isQaGatedPath("/hub")).toBe(false);
      expect(isQaGatedPath("/broker/w/dealcards")).toBe(false);
    });

    it("enforces QA gate when NODE_ENV=production or CRE_ENFORCE_QA_GATE=1", () => {
      expect(isQaGateEnforced({ NODE_ENV: "production" })).toBe(true);
      expect(isQaGateEnforced({ NODE_ENV: "development", CRE_ENFORCE_QA_GATE: "1" })).toBe(true);
      expect(isQaGateEnforced({ NODE_ENV: "test", CRE_ENFORCE_QA_GATE: "1" })).toBe(true);
      expect(isQaGateEnforced({ NODE_ENV: "test", CRE_ENFORCE_QA_GATE: "0" })).toBe(false);
      expect(isQaGateEnforced({ NODE_ENV: "development" })).toBe(false);
    });

    it("fails closed (404 + noindex) when CRE_ENFORCE_QA_GATE=1 or NODE_ENV=production without a valid key", async () => {
      // 1. Enforced via CRE_ENFORCE_QA_GATE=1 with no configured keys -> fail closed even if caller supplies a key
      vi.stubEnv("CRE_ENFORCE_QA_GATE", "1");
      const reqWithoutServerKey = new NextRequest("https://dealcard.kr/qa-tester", {
        headers: { "x-qa-access-key": "attacker-guess" },
      });
      expect(isValidQaGateRequest(reqWithoutServerKey)).toEqual({
        allowed: false,
        queryKey: "",
      });
      const resNoConfig = await proxy(reqWithoutServerKey);
      expect(resNoConfig.status).toBe(404);
      expect(resNoConfig.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");

      // 2. Enforced via NODE_ENV=production with configured key, missing or mismatched client key -> fail closed
      vi.stubEnv("CRE_ENFORCE_QA_GATE", "");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("QA_ACCESS_KEY", "qa-secret-token-2026");

      const missingKeyReq = new NextRequest("https://dealcard.kr/qa-showcase");
      expect(isValidQaGateRequest(missingKeyReq).allowed).toBe(false);
      const missingKeyRes = await proxy(missingKeyReq);
      expect(missingKeyRes.status).toBe(404);

      for (const badKey of ["qa-secret-token-2025", "qa-secret", "qa-secret-token-2026-extra"]) {
        const wrongKeyReq = new NextRequest("https://dealcard.kr/qa-signoff", {
          headers: { "x-qa-access-key": badKey },
        });
        expect(isValidQaGateRequest(wrongKeyReq)).toEqual({
          allowed: false,
          queryKey: "",
        });
        const wrongKeyRes = await proxy(wrongKeyReq);
        expect(wrongKeyRes.status).toBe(404);
      }
    });

    it("accepts valid constant-time key via x-qa-access-key header, query param, or cre_qa_key cookie", async () => {
      vi.stubEnv("CRE_ENFORCE_QA_GATE", "1");
      vi.stubEnv("QA_ACCESS_KEY", "qa-primary-key-9f8e7d");
      vi.stubEnv("QA_BROKER_ACCESS_KEY", "qa-broker-key-1a2b3c");

      // Header auth
      const headerReq = new NextRequest("https://dealcard.kr/qa-tester", {
        headers: { "x-qa-access-key": "qa-primary-key-9f8e7d" },
      });
      expect(isValidQaGateRequest(headerReq)).toEqual({
        allowed: true,
        queryKey: "",
      });
      const headerRes = await proxy(headerReq);
      expect(headerRes.status).toBe(200);
      expect(headerRes.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(headerRes.cookies.get("cre_qa_key")).toBeUndefined();

      // Query param auth (also persists HttpOnly cookie)
      const queryReq = new NextRequest(
        "https://dealcard.kr/qa-broker?qaKey=qa-broker-key-1a2b3c",
      );
      expect(isValidQaGateRequest(queryReq)).toEqual({
        allowed: true,
        queryKey: "qa-broker-key-1a2b3c",
      });
      const queryRes = await proxy(queryReq);
      expect(queryRes.status).toBe(200);
      expect(queryRes.cookies.get("cre_qa_key")?.value).toBe("qa-broker-key-1a2b3c");

      // Cookie auth
      const cookieReq = new NextRequest("https://dealcard.kr/testguide", {
        headers: { cookie: "cre_qa_key=qa-primary-key-9f8e7d" },
      });
      expect(isValidQaGateRequest(cookieReq)).toEqual({
        allowed: true,
        queryKey: "",
      });
      const cookieRes = await proxy(cookieReq);
      expect(cookieRes.status).toBe(200);
    });

    it("strips spoofed x-cre-proxy-secret and x-cre-verified-user headers before forwarding", async () => {
      vi.stubEnv("CRE_ENFORCE_QA_GATE", "1");
      vi.stubEnv("QA_ACCESS_KEY", "qa-gate-valid");

      const spoofedPublicReq = new NextRequest("https://dealcard.kr/hub", {
        headers: {
          "x-cre-proxy-secret": "forged-proxy-secret",
          "x-cre-verified-user": encodeURIComponent(JSON.stringify({ id: "spoofed-admin" })),
          "x-request-id": "req-keep-me",
        },
      });
      const publicRes = await proxy(spoofedPublicReq);
      expect(spoofedPublicReq.headers.get("x-cre-proxy-secret")).toBeNull();
      expect(spoofedPublicReq.headers.get("x-cre-verified-user")).toBeNull();
      expect(publicRes.headers.get("x-middleware-request-x-cre-proxy-secret")).toBeNull();
      expect(publicRes.headers.get("x-middleware-request-x-cre-verified-user")).toBeNull();
      expect(publicRes.headers.get("x-middleware-request-x-request-id")).toBe("req-keep-me");

      const spoofedQaReq = new NextRequest("https://dealcard.kr/qa-tester", {
        headers: {
          "x-qa-access-key": "qa-gate-valid",
          "x-cre-proxy-secret": "forged-proxy-secret",
          "x-cre-verified-user": "forged-user",
        },
      });
      const qaRes = await proxy(spoofedQaReq);
      expect(qaRes.status).toBe(200);
      expect(spoofedQaReq.headers.get("x-cre-proxy-secret")).toBeNull();
      expect(spoofedQaReq.headers.get("x-cre-verified-user")).toBeNull();
      expect(qaRes.headers.get("x-middleware-request-x-cre-proxy-secret")).toBeNull();
      expect(qaRes.headers.get("x-middleware-request-x-cre-verified-user")).toBeNull();

      const generatedSecret = resolveProxySecret();
      expect(generatedSecret).not.toBeNull();
      expect((generatedSecret ?? "").length).toBeGreaterThanOrEqual(32);
    });
  });

  describe("P1-2: pre-NDA address masking & /nda/[id] noindex metadata", () => {
    it("masks full street, road, and lot (jibun) numbers in toAreaLevelLabel and resolveNdaPublicBuildingTitle", () => {
      const fromJibun = toAreaLevelLabel("서울특별시 강남구 역삼동 123-45 3층");
      expect(fromJibun).toBe("서울특별시 강남구 역삼동 일대");
      expect(fromJibun).not.toContain("123");
      expect(fromJibun).not.toContain("45");
      expect(fromJibun).not.toContain("3층");

      const fromGaJibun = toAreaLevelLabel("서울특별시 영등포구 당산동5가 11-47");
      expect(fromGaJibun).toBe("서울특별시 영등포구 당산동5가 일대");
      expect(fromGaJibun).not.toContain("11-47");

      const fromRoad = toAreaLevelLabel("서울특별시 강남구 테헤란로 152 강남파이낸스센터");
      expect(fromRoad).toBe("서울특별시 강남구 일대");
      expect(fromRoad).not.toContain("152");
      expect(fromRoad).not.toContain("강남파이낸스센터");

      // Defence in depth when area_signal or workspaceTitle accidentally contains a raw number
      const contaminatedArea = resolveNdaPublicBuildingTitle({
        areaSignal: "서울 영등포구 영신로 259",
        address: "서울 영등포구 당산동5가 11-47",
      });
      expect(contaminatedArea).toBe("서울 영등포구 영신로 일대");
      expect(contaminatedArea).not.toContain("259");
      expect(contaminatedArea).not.toContain("11-47");

      const maskedWorkspace = resolveNdaPublicBuildingTitle({
        address: "테헤란로 152",
        workspaceTitle: "테헤란로 152 프라임 오피스",
      });
      expect(maskedWorkspace).toBe("테헤란로 일대 프라임 오피스");
      expect(maskedWorkspace).not.toContain("152");

      expect(resolveNdaPublicBuildingTitle({ assetType: "상업용 부동산" })).toBe("상업용 부동산");
      expect(resolveNdaPublicBuildingTitle({})).toBe(NDA_FALLBACK_TITLE);
    });

    it("exports robots noindex/nofollow metadata on /nda/[id]/page.tsx", () => {
      expect(ndaPageMetadata.robots).toBeDefined();
      expect(typeof ndaPageMetadata.robots).toBe("object");
      if (ndaPageMetadata.robots && typeof ndaPageMetadata.robots === "object") {
        expect(ndaPageMetadata.robots.index).toBe(false);
        expect(ndaPageMetadata.robots.follow).toBe(false);
        if (
          ndaPageMetadata.robots.googleBot &&
          typeof ndaPageMetadata.robots.googleBot === "object"
        ) {
          expect(ndaPageMetadata.robots.googleBot.index).toBe(false);
          expect(ndaPageMetadata.robots.googleBot.follow).toBe(false);
        }
      }
    });
  });

  describe("P1-3: load-broker-profile verification truthiness & private profile rejection", () => {
    const client = createMockBrokerSupabase({
      broker_profiles: [
        {
          user_id: "11111111-1111-4111-8111-111111111111",
          slug: "unverified-false",
          is_public: true,
          is_verified: false,
        },
        {
          user_id: "22222222-2222-4222-8222-222222222222",
          slug: "unverified-null",
          is_public: true,
          is_verified: null,
        },
        {
          user_id: "33333333-3333-4333-8333-333333333333",
          slug: "verified-true",
          is_public: true,
          is_verified: true,
        },
        {
          user_id: "44444444-4444-4444-8444-444444444444",
          slug: "private-broker",
          is_public: false,
          is_verified: true,
        },
      ],
      profiles: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          display_name: "김미검증",
          role: "broker",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "이미설정",
          role: "broker",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          display_name: "박검증",
          role: "broker",
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          display_name: "최비공개",
          role: "broker",
        },
      ],
    });

    it("preserves isVerified: false when broker_profiles.is_verified is false or null, and true only when strictly true", async () => {
      const falseProfile = await findPublicBrokerProfile(client, "unverified-false");
      expect(falseProfile).not.toBeNull();
      expect(falseProfile?.isVerified).toBe(false);
      expect(falseProfile?.canonicalPath).toBe("/broker-profile/unverified-false");

      const nullProfile = await findPublicBrokerProfile(client, "unverified-null");
      expect(nullProfile).not.toBeNull();
      expect(nullProfile?.isVerified).toBe(false);

      const trueProfile = await findPublicBrokerProfile(client, "verified-true");
      expect(trueProfile).not.toBeNull();
      expect(trueProfile?.isVerified).toBe(true);
      expect(trueProfile?.displayName).toBe("박검증");
    });

    it("rejects private (is_public: false) broker profiles across slug, UUID, and display_name lookups", async () => {
      expect(await findPublicBrokerProfile(client, "private-broker")).toBeNull();
      expect(
        await findPublicBrokerProfile(client, "44444444-4444-4444-8444-444444444444"),
      ).toBeNull();
      expect(await findPublicBrokerProfile(client, "최비공개")).toBeNull();
      // Wildcard characters in display_name lookup must be escaped, never matching arbitrary brokers
      expect(await findPublicBrokerProfile(client, "%")).toBeNull();
      expect(await findPublicBrokerProfile(client, "박%")).toBeNull();
    });
  });

  describe("P2: kstWeekStartIso Sunday-night UTC boundary & inapp-webview detection/intent URL", () => {
    it("computes Monday 00:00 KST accurately across Sunday night UTC (15:00Z–23:59Z = Monday morning KST)", () => {
      // 2026-01-04 is Sunday; 2026-01-05 00:00:00+09:00 == 2026-01-04T15:00:00.000Z
      // One millisecond before Monday 00:00 KST (Sunday 23:59:59.999 KST) still belongs to 2025-12-29 KST week
      expect(kstWeekStartIso(new Date("2026-01-04T14:59:59.999Z"))).toBe(
        "2025-12-28T15:00:00.000Z",
      );

      // Sunday 15:00Z..23:59Z UTC is already Monday 00:00..08:59 KST on 2026-01-05
      expect(kstWeekStartIso(new Date("2026-01-04T15:00:00.000Z"))).toBe(
        "2026-01-04T15:00:00.000Z",
      );
      expect(kstWeekStartIso(new Date("2026-01-04T20:30:00.000Z"))).toBe(
        "2026-01-04T15:00:00.000Z",
      );
      expect(kstWeekStartIso(new Date("2026-01-04T23:59:59.000Z"))).toBe(
        "2026-01-04T15:00:00.000Z",
      );

      // End of that KST week (Sunday 2026-01-11 23:59:59 KST == 14:59:59Z) vs next Monday 00:00 KST (15:00:00Z)
      expect(kstWeekStartIso(new Date("2026-01-11T14:59:59.000Z"))).toBe(
        "2026-01-04T15:00:00.000Z",
      );
      expect(kstWeekStartIso(new Date("2026-01-11T15:00:00.000Z"))).toBe(
        "2026-01-11T15:00:00.000Z",
      );
    });

    it("matches Line/14.0 without false-matching OnLineBrowser and includes S.browser_fallback_url on Android", () => {
      const lineIosUa =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1 Line/14.0.0";
      const lineAndroidUa =
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36 Line/14.0";

      expect(isInAppWebView(lineIosUa)).toBe(true);
      expect(isInAppWebView(lineAndroidUa)).toBe(true);
      expect(isInAppWebView("Line/14.0")).toBe(true);

      // Must NOT false-match words containing "Line" without a standalone "Line/" token
      expect(isInAppWebView("OnLineBrowser")).toBe(false);
      expect(isInAppWebView("Mozilla/5.0 (Linux; Android 14) OnLineBrowser/2.4")).toBe(false);
      expect(isInAppWebView("Mozilla/5.0 Outline/1.2 Pipeline/3.0")).toBe(false);

      const targetUrl = "https://dealcard.kr/dc/deal-123?utm_source=line";
      const intentUrl = buildKakaoExternalOpenUrl(targetUrl, lineAndroidUa);
      expect(intentUrl).toBe(
        `intent://dealcard.kr/dc/deal-123?utm_source=line#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(
          targetUrl,
        )};end`,
      );

      // Non-in-app browser on Android returns null
      expect(
        buildKakaoExternalOpenUrl(
          targetUrl,
          "Mozilla/5.0 (Linux; Android 14) OnLineBrowser/2.4",
        ),
      ).toBeNull();
    });
  });
});
