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
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> },
) {
  const { buildingId } = await params;
  const docId = req.nextUrl.searchParams.get("doc");

  // ── 1. Check demo data first ─────────────────────────────────────
  const demo = getDemoMobileIM(buildingId);
  if (demo) {
    return NextResponse.json(
      { ok: true, data: demo, source: "demo" },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
        },
      },
    );
  }

  const supabase = createServiceClient();

  // ── 2. If docId is provided, fetch the generated document ────────
  if (docId) {
    const { data: document, error: docError } = await supabase
      .from("document_objects")
      .select("body, owner_id")
      .eq("id", docId)
      .eq("building_id", buildingId)
      .single();

    if (!docError && document && document.body?.sections) {
      // Fetch Broker Profile
      const { data: brokerProfile } = await supabase
        .from("profiles")
        .select("id, display_name, company, phone, tagline, photo_url, slug, vibe_template_id")
        .eq("id", document.owner_id)
        .single();

      const broker = brokerProfile ? {
        userId: brokerProfile.id,
        displayName: brokerProfile.display_name || "담당 중개인",
        company: brokerProfile.company || "크리딜 부동산중개법인",
        phone: brokerProfile.phone || "010-0000-0000",
        tagline: brokerProfile.tagline || "최고의 파트너",
        photoUrl: brokerProfile.photo_url || "/default-avatar.png",
        slug: brokerProfile.slug || "cre-dealcard-default",
        vibeTemplateId: brokerProfile.vibe_template_id || "default",
      } : {
        userId: "system",
        displayName: "담당 중개인",
        company: "크리딜 파트너스",
        phone: "1588-0000",
        tagline: "당신의 성공적인 부동산 투자를 돕습니다.",
        photoUrl: "/default-avatar.png",
        slug: "cre-dealcard-default",
        vibeTemplateId: "default",
      };

      const ssotSummary = document.body.ssot_summary || {};
      const score = document.body.readiness_score ?? 0;

      const doc = {
        buildingId,
        blindName: `${ssotSummary.area_signal || "핵심 상권"} ${ssotSummary.asset_type || "상업용 자산"}`,
        fullName: `${ssotSummary.area_signal || "핵심 상권"} ${ssotSummary.asset_type || "상업용 자산"}`,
        areaSignal: ssotSummary.area_signal,
        assetType: ssotSummary.asset_type,
        priceBand: ssotSummary.price_band,
        sizeSignal: ssotSummary.size_signal,
        completenessScore: score,
        broker,
        sections: document.body.sections,
        disclaimer: "본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.",
        fullImUpgradeCta: {
          enabled: true,
          label: "상세 투자설명서(IM) 요청",
          description: "렌트롤, 캐시플로우, 도면 등이 포함된 30페이지 분량의 Full IM은 중개인 승인 후 열람 가능합니다.",
        },
        protectedFieldsRemoved: ["상세 지번", "건물명", "소유주명"],
        photos: [],
        coordinates: null,
      };

      return NextResponse.json(
        { ok: true, data: doc, source: "document_objects" },
        { status: 200 }
      );
    }
  }

  // ── 3. Real building lookup (Fallback if no docId or doc not found)
  const { data: ssot, error } = await supabase
    .from("building_ssot_lite")
    .select(
      `id, owner_id, area_signal, asset_type, price_band, size_signal,
       vacancy_signal, lease_summary, fit_summary, caution_summary, completeness_score,
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

  const score = ssot.completeness_score ?? 0;
  if (score < 30) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "COMPLETENESS_INSUFFICIENT",
          message: `IM Lite는 최소한의 정보가 필요합니다. 현재: ${score}점`,
          currentScore: score,
          requiredScore: 30,
        },
      },
      { status: 403 },
    );
  }

  // Fetch Broker Profile
  const { data: brokerProfile } = await supabase
    .from("profiles")
    .select("id, display_name, company, phone, tagline, photo_url, slug, vibe_template_id")
    .eq("id", ssot.owner_id)
    .single();

  const broker = brokerProfile ? {
    userId: brokerProfile.id,
    displayName: brokerProfile.display_name || "담당 중개인",
    company: brokerProfile.company || "크리딜 부동산중개법인",
    phone: brokerProfile.phone || "010-0000-0000",
    tagline: brokerProfile.tagline || "최고의 파트너",
    photoUrl: brokerProfile.photo_url || "/default-avatar.png",
    slug: brokerProfile.slug || "cre-dealcard-default",
    vibeTemplateId: brokerProfile.vibe_template_id || "default",
  } : {
    userId: "system",
    displayName: "담당 중개인",
    company: "크리딜 파트너스",
    phone: "1588-0000",
    tagline: "당신의 성공적인 부동산 투자를 돕습니다.",
    photoUrl: "/default-avatar.png",
    slug: "cre-dealcard-default",
    vibeTemplateId: "default",
  };

  const sections = [
    {
      sectionId: "01_overview",
      title: "물건 개요",
      icon: "🏢",
      content: `| 항목 | 내용 |\n|---|---|\n| 매물명 | ${ssot.area_signal} ${ssot.asset_type} |\n| 매매희망가 | **${ssot.price_band}** |\n| 규모 | ${ssot.size_signal} |`,
      dataSource: "SSoT - asset_identity",
      aiRole: "auto" as const,
      locked: false,
    },
    {
      sectionId: "02_location",
      title: "입지·상권 분석",
      icon: "📍",
      content: "AI 입지 분석이 완료되지 않았습니다.",
      dataSource: "AI Location Agent",
      aiRole: "ai_generated" as const,
      locked: true,
      lockedReason: "공공데이터 연동 대기 중",
    },
    {
      sectionId: "03_lease",
      title: "임대 현황",
      icon: "👥",
      content: ssot.lease_summary || ssot.vacancy_signal ? `| 항목 | 내용 |\n|---|---|\n| 공실 | ${ssot.vacancy_signal || '확인 필요'} |\n\n${ssot.lease_summary || '세부 임대차 정보는 중개인에게 문의하세요.'}` : "임대 현황 데이터가 부족합니다.",
      dataSource: "SSoT - rent_roll",
      aiRole: "auto" as const,
      locked: !ssot.lease_summary && !ssot.vacancy_signal,
      lockedReason: "렌트롤 데이터 필요",
    },
    {
      sectionId: "04_finance",
      title: "수익 분석",
      icon: "💰",
      content: "금융/수익 분석 모델링 중입니다.",
      dataSource: "AI Financial Engine",
      aiRole: "ai_generated" as const,
      locked: true,
      lockedReason: "Cash Flow 데이터 필요",
    },
    {
      sectionId: "05_risk",
      title: "확인 필요 사항",
      icon: "⚠️",
      content: ssot.caution_summary || "리스크 엔진 데이터 수집 중입니다.",
      dataSource: "AI Risk Engine",
      aiRole: "ai_generated" as const,
      locked: !ssot.caution_summary,
      lockedReason: "리스크 스캔 대기 중",
    },
    {
      sectionId: "06_thesis",
      title: "투자 포인트",
      icon: "🎯",
      content: ssot.fit_summary || "매수자 적합성 분석 중입니다.",
      dataSource: "AI Matching Engine",
      aiRole: "ai_generated" as const,
      locked: false,
    },
    {
      sectionId: "07_next",
      title: "다음 단계",
      icon: "🚀",
      content: "관심 있으신 경우 아래 '중개인에게 문의하기' 버튼을 눌러 상세 자료(IM) 및 미팅을 요청해 주세요.",
      dataSource: "Static",
      aiRole: "static" as const,
      locked: false,
    }
  ];

  const layers = (ssot.layers as Record<string, any>) || {};

  const doc = {
    buildingId: ssot.id,
    blindName: `${ssot.area_signal} ${ssot.asset_type}`,
    fullName: `${ssot.area_signal} ${ssot.asset_type}`, // Blinded for now
    areaSignal: ssot.area_signal,
    assetType: ssot.asset_type,
    priceBand: ssot.price_band,
    sizeSignal: ssot.size_signal,
    completenessScore: score,
    broker,
    sections,
    disclaimer: "본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.",
    fullImUpgradeCta: {
      enabled: true,
      label: "상세 투자설명서(IM) 요청",
      description: "렌트롤, 캐시플로우, 도면 등이 포함된 30페이지 분량의 Full IM은 중개인 승인 후 열람 가능합니다.",
    },
    protectedFieldsRemoved: ssot.disclosure?.guard_checked ? ["상세 지번", "건물명", "소유주명"] : [],
    photos: layers.photos || [],
    coordinates: layers.coordinates || null,
  };

  return NextResponse.json(
    {
      ok: true,
      data: doc,
      source: "real",
    },
    { status: 200 },
  );
}
