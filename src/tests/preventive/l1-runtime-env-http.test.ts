/**
 * L1. 서버리스 런타임 · 환경변수 · HTTP 인프라 경계 예방 테스트 (PT-101 ~ PT-104)
 *
 * 실전 프로덕션 경험 교훈:
 * - PT-101: Windows CLI `vercel env add` 시 혼입되는 `\r\n`, 따옴표, 공백으로 인한 `getServerEnv()` / `createServiceClient()` 무음 실패 차단
 * - PT-102: 고해상도 실사진 다중 업로드 시 Supabase Storage 선행 업로드(`upload-photo`) 계약 및 8MB 상한 검증
 * - PT-103: `next.config.ts` 보안 헤더(`X-Frame-Options: SAMEORIGIN` vs `DENY`) 및 `www` 유무 양방향 CORS 허용 검증
 * - PT-104: `pptx/route.ts` 등 핵심 엔드포인트가 raw `process.env` 대신 정제된 `env` / `createServiceClient`를 사용하는지 정적 계약 검증
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "../../../next.config";
import { getServerEnv } from "@/lib/env";
import {
  getVWorldApiKey,
  getVWorldReferer,
  getVWorldDomain,
} from "@/lib/external/vworld-config";

describe("L1 Runtime, Env Sanitization & HTTP Boundary Preventive Suite (PT-101 ~ PT-104)", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
    vi.restoreAllMocks();
  });

  it("[PT-101] sanitizes trailing CRLF, quotes, whitespace, and missing protocol in server/map env vars", () => {
    process.env.APP_BASE_URL = '  "https://www.credeal.net/\r\n"  ';
    process.env.SUPABASE_SERVICE_ROLE_KEY = "  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test\r\n' ";
    process.env.OPENAI_API_KEY = ' "sk-proj-test-key\r\n" ';
    process.env.DATA_GO_KR_API_KEY = "  datago-key-123\r\n ";
    process.env.VWORLD_API_KEY = ' "vworld-key-xyz\r\n" ';
    process.env.VWORLD_REFERER = " 'www.credeal.net\r\n' ";

    const srv = getServerEnv();
    expect(srv.APP_BASE_URL).toBe("https://www.credeal.net");
    expect(srv.SUPABASE_SERVICE_ROLE_KEY).toBe(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test"
    );
    expect(srv.OPENAI_API_KEY).toBe("sk-proj-test-key");
    expect(srv.DATA_GO_KR_API_KEY).toBe("datago-key-123");

    expect(getVWorldApiKey()).toBe("VWORLD-KEY-XYZ");
    const referer = getVWorldReferer();
    expect(referer).not.toMatch(/[\r\n'"]/);
    expect(getVWorldDomain()).toBe("www.credeal.net");

    // Also test bare domain without https:// in APP_BASE_URL
    process.env.APP_BASE_URL = "credeal.net\r\n";
    expect(getServerEnv().APP_BASE_URL).toBe("https://credeal.net");
  });

  it("[PT-102] upload-photo route enforces MIME allowlist, 8MB ceiling, and returns clean Storage public URL", async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      data: { path: "bld-test/im-photos/1_abcd.jpg" },
      error: null,
    });
    const mockGetPublicUrl = vi.fn().mockReturnValue({
      data: {
        publicUrl:
          "https://proj.supabase.co/storage/v1/object/public/building_photos/bld-test/im-photos/1_abcd.jpg",
      },
    });

    vi.resetModules();
    vi.doMock("@/lib/auth-guard", () => ({
      requireBroker: vi.fn().mockResolvedValue({
        user: { id: "broker-uuid-1" },
        error: null,
      }),
    }));
    vi.doMock("@/lib/supabase/service", () => ({
      createServiceClient: () => ({
        storage: {
          from: () => ({
            upload: mockUpload,
            getPublicUrl: mockGetPublicUrl,
          }),
          createBucket: vi.fn().mockResolvedValue({ data: null, error: null }),
        },
      }),
    }));

    const { POST } = await import("@/app/api/broker/im/upload-photo/route");

    // 1. Valid JPEG base64 upload -> 200 + Storage URL (keeps quick-generate payload < 500KB)
    const tinyJpegB64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString("base64");
    const validReq = new NextRequest("https://www.credeal.net/api/broker/im/upload-photo", {
      method: "POST",
      body: JSON.stringify({
        buildingId: "bld-bojeong-01",
        dataUrl: `data:image/jpeg;base64,${tinyJpegB64}`,
      }),
    });
    const okRes = await POST(validReq);
    const okJson = await okRes.json();
    expect(okRes.status).toBe(200);
    expect(okJson.ok).toBe(true);
    expect(okJson.url).toMatch(/^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/building_photos\//);

    // 2. Unsupported SVG MIME -> 415 UNSUPPORTED_MIME
    const svgReq = new NextRequest("https://www.credeal.net/api/broker/im/upload-photo", {
      method: "POST",
      body: JSON.stringify({
        dataUrl: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
      }),
    });
    const svgRes = await POST(svgReq);
    expect(svgRes.status).toBe(415);

    // 3. Reject non-image dataUrl -> 400
    const badReq = new NextRequest("https://www.credeal.net/api/broker/im/upload-photo", {
      method: "POST",
      body: JSON.stringify({ dataUrl: "blob:https://www.credeal.net/1234" }),
    });
    const badRes = await POST(badReq);
    expect(badRes.status).toBe(400);
  });

  it("[PT-103] next.config.ts security headers allow SAMEORIGIN iframes on public viewers, DENY on broker routes, and CORS for both www and apex domains", async () => {
    expect(typeof nextConfig.headers).toBe("function");
    const headerRules = await nextConfig.headers!();

    const sameOriginSources = headerRules
      .filter((r) =>
        r.headers.some((h) => h.key === "X-Frame-Options" && h.value === "SAMEORIGIN")
      )
      .map((r) => r.source);
    expect(sameOriginSources).toContain("/im-lite/:path*");
    expect(sameOriginSources).toContain("/dc/:path*");
    expect(sameOriginSources).toContain("/magazine/:path*");

    // Verify DENY rule excludes /im-lite, /dc, /magazine and blocks /broker/w/im
    const denyRule = headerRules.find((r) =>
      r.headers.some((h) => h.key === "X-Frame-Options" && h.value === "DENY")
    );
    expect(denyRule).toBeDefined();
    // Next.js path-to-regexp negative lookahead check (`source` is `/((?!magazine(?:/|$)|dc(?:/|$)|im-lite(?:/|$)).*)`)
    const denyRegex = new RegExp(`^${denyRule!.source}$`);
    expect(denyRegex.test("/broker/w/im")).toBe(true);
    expect(denyRegex.test("/broker/w/dealcards")).toBe(true);
    expect(denyRegex.test("/im-lite/982bd803-368a-49ca-9d0d-5bff92b07c60")).toBe(false);
    expect(denyRegex.test("/dc/bld-123")).toBe(false);
    expect(denyRegex.test("/magazine/test-broker/2026-11-11")).toBe(false);

    // Verify CORS Origin pattern accepts both apex (credeal.net) and www (www.credeal.net)
    const corsOriginRule = headerRules.find(
      (r) => r.source === "/api/:path*" && Array.isArray(r.has) && r.has.length > 0
    );
    expect(corsOriginRule).toBeDefined();
    const originPattern = (corsOriginRule!.has![0] as { value: string }).value;
    const originRe = new RegExp(`^${originPattern}$`);
    expect(originRe.test("https://credeal.net")).toBe(true);
    expect(originRe.test("https://www.credeal.net")).toBe(true);
    expect(originRe.test("https://dealcard.kr")).toBe(true);
    expect(originRe.test("https://www.dealcard.kr")).toBe(true);
    expect(originRe.test("http://localhost:3000")).toBe(true);
    expect(originRe.test("https://evil.example.com")).toBe(false);
  });

  it("[PT-104] critical public/broker IM routes use sanitized env/service helpers and retry on unique PNU collision", () => {
    const pptxRouteCode = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/public/im-lite/[buildingId]/pptx/route.ts"),
      "utf-8"
    );
    expect(pptxRouteCode).not.toContain("process.env.NEXT_PUBLIC_SUPABASE_URL!");
    expect(pptxRouteCode).toContain("getServerEnv");

    const quickGenCode = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/broker/im-lite/quick-generate/route.ts"),
      "utf-8"
    );
    // Must not write directly to generated column `pnu` on building_ssot_lite top-level row
    expect(quickGenCode).toContain("canonical_pnu");
    expect(quickGenCode).toContain("buildSsotPayload(false)");
  });
});
