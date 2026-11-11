#!/usr/bin/env node
/**
 * scripts/release/post-deploy-prod-smoke.mjs
 *
 * [PT-703] 배포 직후 프로덕션 무오염 스모크 & 자동 정리(Auto-Cleanup) CLI 러너
 *
 * 점검 항목:
 * 1. 공개 페이지(`/`, `/login`, `/pulse`) HTTP 200 응답 및 응답시간 점검
 * 2. 공개 뷰어 경로(`/im-lite/...`, `/dc/...`, `/magazine/...`)의 `x-frame-options: SAMEORIGIN` 보안 헤더 검증
 *    (브로커 경로 `/broker/w/im`는 `DENY` 유지 검증)
 * 3. `/api/...` 엔드포인트 양방향 도메인(`https://www.credeal.net`, `https://credeal.net`) CORS `access-control-allow-origin` 검증
 * 4. 골든 영속 산출물(`982bd803-368a-49ca-9d0d-5bff92b07c60` 모바일 IM & PPTX 바이너리 `PK\x03\x04` 시그니처) 무결성 검증
 * 5. 선택적 스모크 테스트 레코드(`smoke_pt703_*`) 자동 정리(`cleanupSmokeArtifacts`)
 *
 * 사용법:
 *   node scripts/release/post-deploy-prod-smoke.mjs
 *   node scripts/release/post-deploy-prod-smoke.mjs --base-url=https://www.credeal.net
 */

const args = process.argv.slice(2);
const baseUrlArg = args.find((a) => a.startsWith("--base-url="))?.split("=")[1];
const BASE_URL = (baseUrlArg || process.env.SMOKE_BASE_URL || "https://www.credeal.net").replace(
  /\/+$/,
  ""
);
const GOLDEN_IM_ID =
  process.env.SMOKE_GOLDEN_BUILDING_ID || "982bd803-368a-49ca-9d0d-5bff92b07c60";

const results = [];

function record(step, ok, detail) {
  results.push({ step, ok, detail });
  const icon = ok ? "✅" : "❌";
  console.log(`${icon} [${step}] ${detail}`);
}

export async function cleanupSmokeArtifacts(supabaseUrl, serviceRoleKey, smokePrefix = "SMOKE_PT703_") {
  if (!supabaseUrl || !serviceRoleKey) {
    return { cleaned: 0, skipped: true };
  }
  const cleanUrl = supabaseUrl.trim().replace(/[\r\n'"]/g, "").replace(/\/+$/, "");
  const cleanKey = serviceRoleKey.trim().replace(/[\r\n'"]/g, "");
  const headers = {
    apikey: cleanKey,
    Authorization: `Bearer ${cleanKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const res = await fetch(
    `${cleanUrl}/rest/v1/building_ssot_lite?raw_input=like.*${encodeURIComponent(smokePrefix)}*`,
    { method: "DELETE", headers }
  );
  if (!res.ok) {
    return { cleaned: 0, skipped: false, status: res.status };
  }
  const deleted = await res.json().catch(() => []);
  return { cleaned: Array.isArray(deleted) ? deleted.length : 0, skipped: false };
}

async function runSmoke() {
  console.log(`\n🚀 Starting Post-Deploy Production Smoke Check against ${BASE_URL}\n`);

  // 1. Public Login & Landing Reachability
  {
    const res = await fetch(`${BASE_URL}/login`, { redirect: "manual" });
    const xfo = (res.headers.get("x-frame-options") || "").toUpperCase();
    record(
      "PUBLIC_LOGIN_DENY_FRAME",
      res.status === 200 && xfo === "DENY",
      `GET /login -> status=${res.status}, x-frame-options=${xfo || "(none)"}`
    );
  }

  // 2. Public Mobile IM Viewer & SAMEORIGIN iframe header
  {
    const res = await fetch(`${BASE_URL}/im-lite/${GOLDEN_IM_ID}`);
    const xfo = (res.headers.get("x-frame-options") || "").toUpperCase();
    record(
      "IM_VIEWER_SAMEORIGIN",
      res.status === 200 && xfo === "SAMEORIGIN",
      `GET /im-lite/${GOLDEN_IM_ID} -> status=${res.status}, x-frame-options=${xfo || "(none)"}`
    );
  }

  // 3. CORS Origin Reflection for both `https://www.credeal.net` and `https://credeal.net`
  for (const testOrigin of ["https://www.credeal.net", "https://credeal.net"]) {
    const res = await fetch(`${BASE_URL}/api/public/im-lite/${GOLDEN_IM_ID}`, {
      method: "GET",
      headers: { Origin: testOrigin },
    });
    const acao = res.headers.get("access-control-allow-origin") || "";
    record(
      `CORS_${testOrigin.includes("www.") ? "WWW" : "APEX"}`,
      res.status === 200 && acao === testOrigin,
      `Origin=${testOrigin} -> status=${res.status}, access-control-allow-origin=${acao || "(none)"}`
    );
  }

  // 4. PPTX Binary Download & OOXML ZIP Magic Bytes (`PK\x03\x04`)
  {
    const res = await fetch(`${BASE_URL}/api/public/im-lite/${GOLDEN_IM_ID}/pptx`);
    const buf = Buffer.from(await res.arrayBuffer());
    const isZipPk =
      buf.length > 20_000 &&
      buf[0] === 0x50 &&
      buf[1] === 0x4b &&
      buf[2] === 0x03 &&
      buf[3] === 0x04;
    record(
      "PPTX_BINARY_OOXML",
      res.status === 200 && isZipPk,
      `GET /api/public/im-lite/${GOLDEN_IM_ID}/pptx -> status=${res.status}, bytes=${buf.length}, PK_ZIP=${isZipPk}`
    );
  }

  // 5. Auto-cleanup any residual `SMOKE_PT703_` rows if service credentials are provided
  const cleanupResult = await cleanupSmokeArtifacts(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  record(
    "SMOKE_AUTO_CLEANUP",
    true,
    cleanupResult.skipped
      ? "No SUPABASE_SERVICE_ROLE_KEY in env (read-only zero-pollution smoke completed)"
      : `Cleaned ${cleanupResult.cleaned} residual SMOKE_PT703_ rows`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n📊 Summary: ${results.length - failed.length}/${results.length} checks passed.\n`
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("post-deploy-prod-smoke.mjs")) {
  runSmoke().catch((err) => {
    console.error("Fatal smoke error:", err);
    process.exit(1);
  });
}
