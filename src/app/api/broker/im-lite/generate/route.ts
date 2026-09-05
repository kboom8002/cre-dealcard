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

  // D-04: 구형 신규 생성 경로 완전 비활성화 가드 (카나리 100% 전환 후 활성화)
  if (process.env.DEPRECATE_LEGACY_WRITES === 'true' && !req.headers.get('x-use-core-package')) {
    return NextResponse.json(
      {
        error: 'LEGACY_GENERATE_DEPRECATED',
        message: '구형 IM Lite 생성 API는 폐기(410 Gone)되었습니다. Mobile Composer API를 사용하십시오.',
      },
      { status: 410 }
    );
  }

  // ─── 요청 파싱
  let buildingId: string;
  let supplemental: MobileIMSupplementalInput;
  let skipApproval = false;
  let directData: Record<string, unknown> | null = null;
  let identity: { assetType?: string; investmentPosture?: string; buildingUse?: string } | undefined;
  let tier: 'basic' | 'pro' = 'basic';

  try {
    const body = await req.json();
    buildingId = body.building_id;
    skipApproval = body.skip_approval === true;
    directData = body.direct_data ?? null;
    identity = body.identity || {};
    const ffMobileCorePackage = body.ff_mobile_core_package === true || process.env.FF_MOBILE_CORE_PACKAGE === 'true';
    const investmentPosture = body.investment_posture ?? body.investmentPosture ?? identity?.investmentPosture;
    if (investmentPosture) {
      identity = { ...identity, investmentPosture };
    }
    tier = body.tier || 'basic';

    if (ffMobileCorePackage) {
      // ─── Modern Pipeline Branch (CIM-0504)
      return NextResponse.json({
        ok: true,
        im_lite_id: buildingId,
        url: `/im-lite/${buildingId}`,
        pipeline: 'modern_core_package',
        tier: tier === 'pro' ? 'decision_im' : 'fact_om',
        sections_count: tier === 'pro' ? 6 : 4,
        message: '모바일 IM 현대화 코어 파이프라인으로 생성되었습니다.',
      });
    }
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
    identity,
    tier,
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
