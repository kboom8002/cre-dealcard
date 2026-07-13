/**
 * POST /api/broker/im-lite/generate
 *
 * 딜카드 SSoT Lite 데이터를 기반으로 Mobile IM Lite (7섹션)를 자동 생성합니다.
 *
 * v3 — 핵심 로직을 handler.ts로 분리. HTTP 레이어만 담당.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { generateMobileIMHandler } from "./handler";
import type { MobileIMSupplementalInput } from "@/domain/building/mobile-im/types";

// IM 생성은 7섹션 AI 생성 + 외부 데이터 수집 + Judge 검증으로 60초 이상 소요 가능
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  // ─── 요청 파싱
  let buildingId: string;
  let supplemental: MobileIMSupplementalInput;
  let skipApproval = false;
  let directData: Record<string, unknown> | null = null;

  try {
    const body = await req.json();
    buildingId = body.building_id;
    skipApproval = body.skip_approval === true;
    directData = body.direct_data ?? null;
    supplemental = {
      monthly_rent_total_krw: body.monthly_rent_total_krw,
      vacancy_status: body.vacancy_status,
      vacancy_pct: body.vacancy_pct,
      resolved_address: body.resolved_address,
      resolved_pnu: body.resolved_pnu,
      photo_urls: body.photo_urls,
      broker_highlight: body.broker_highlight,
      estimated_yield_pct: body.estimated_yield_pct,
      total_deposit_manwon: body.total_deposit_manwon,
      mgmt_fee_total_manwon: body.mgmt_fee_total_manwon,
      loan_amount_manwon: body.loan_amount_manwon,
      asking_price_manwon: body.asking_price_manwon,
    };

    if (!buildingId) {
      return NextResponse.json({ error: "building_id is required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // ─── 핸들러 호출
  const result = await generateMobileIMHandler({
    buildingId,
    userId: user!.id,
    supplemental,
    skipApproval,
    directData,
  });

  if (!result.ok) {
    const status = result.statusCode || 500;
    return NextResponse.json(
      {
        error: result.error,
        score: result.score,
        threshold: result.threshold,
        missing: result.missing,
        hint: result.hint,
      },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    im_lite_id: result.im_lite_id,
    url: result.url,
    readiness_score: result.readiness_score,
    ai_used: result.ai_used,
    sections_count: result.sections_count,
    external_data_loaded: result.external_data_loaded,
    message: result.message,
  });
}
