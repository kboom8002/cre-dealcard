/**
 * GET /api/public/im-lite/[buildingId]
 *
 * Public Mobile IM Lite viewer endpoint.
 * - Demo buildings: returns hardcoded demo data (no auth required)
 * - Real buildings: queries building_ssot_lite, requires completenessScore ≥ 80
 *   and public disclosure settings (G2-gate, same pattern as snapshot API)
 *
 * No auth required for demo buildings (public demo access).
 */
import { NextRequest, NextResponse } from "next/server";
import { getDemoMobileIM } from "@/lib/demo/mobile-im-demo-data";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> },
) {
  const { buildingId } = await params;

  // ── 1. Check demo data first ─────────────────────────────────────
  const demo = getDemoMobileIM(buildingId);
  if (demo) {
    return NextResponse.json(
      { ok: true, data: demo, source: "demo" },
      {
        headers: {
          // Revalidate every 24h (demo data is static but may update)
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
        },
      },
    );
  }

  // ── 2. Real building lookup ───────────────────────────────────────
  const supabase = createServiceClient();

  const { data: ssot, error } = await supabase
    .from("building_ssot_lite")
    .select(
      `id, area_signal, asset_type, price_band, size_signal,
       vacancy_signal, lease_summary, completeness_score,
       layers, disclosure, status, confidence`,
    )
    .eq("id", buildingId)
    .single();

  if (error || !ssot) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "매물 정보를 찾을 수 없습니다." } },
      { status: 404 },
    );
  }

  // Gate: completeness ≥ 80 required for IM Lite
  const score = ssot.completeness_score ?? 0;
  if (score < 80) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "COMPLETENESS_INSUFFICIENT",
          message: `IM Lite는 완성도 80점 이상이 필요합니다. 현재: ${score}점`,
          currentScore: score,
          requiredScore: 80,
        },
      },
      { status: 403 },
    );
  }

  // Gate: G2 — only public_signal_ready status
  if (ssot.status !== "public_signal_ready") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "NOT_PUBLIC",
          message: "이 매물은 아직 공개 준비가 완료되지 않았습니다.",
        },
      },
      { status: 403 },
    );
  }

  // For real buildings, we return the raw SSoT fields and let the
  // frontend compose a simpler version. Full AI content generation
  // is a future capability (v0.4).
  return NextResponse.json(
    {
      ok: true,
      data: {
        buildingId: ssot.id,
        areaSignal: ssot.area_signal,
        assetType: ssot.asset_type,
        priceBand: ssot.price_band,
        sizeSignal: ssot.size_signal,
        completenessScore: ssot.completeness_score,
        layers: ssot.layers,
        // Real buildings show a "coming soon" notice for full sections
        source: "real",
        notice: "실제 매물의 AI 섹션 생성 기능은 v0.4에서 제공됩니다.",
      },
    },
    { status: 200 },
  );
}
