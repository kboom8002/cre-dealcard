/**
 * Server-side data fetcher for /im-lite/[buildingId] page.
 *
 * Directly queries Supabase instead of calling the API route,
 * avoiding self-fetch deadlocks in Vercel serverless.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { getDemoMobileIM } from "@/lib/demo/mobile-im-demo-data";
import { computeDataQualityBadge } from "@/domain/building/mobile-im/data-quality-badge";
import type { MobileIMDocument } from "@/lib/demo/mobile-im-demo-data";

function buildBrokerObject(profile: any) {
  if (!profile) {
    return {
      userId: "system",
      displayName: "담당 중개인",
      company: "크리딜 파트너스",
      phone: "1588-0000",
      tagline: "당신의 성공적인 부동산 투자를 돕습니다.",
      photoUrl: "/default-avatar.png",
      slug: "cre-dealcard-default",
      vibeTemplateId: "default",
    };
  }
  return {
    userId: profile.id,
    displayName: profile.display_name || "담당 중개인",
    company: profile.company || "크리딜 부동산중개법인",
    phone: profile.phone || "010-0000-0000",
    tagline: profile.tagline || "최고의 파트너",
    photoUrl: profile.photo_url || "/default-avatar.png",
    slug: profile.slug || "cre-dealcard-default",
    vibeTemplateId: profile.vibe_template_id || "default",
  };
}

/**
 * Fetch IM Lite data for a building. Returns null if not found.
 */
export async function fetchIMData(
  buildingId: string,
  docId?: string
): Promise<MobileIMDocument | null> {
  // 1. Demo data
  const demo = getDemoMobileIM(buildingId);
  if (demo) return demo;

  const supabase = createServiceClient();

  // 2. Document from document_objects (generated IM)
  if (docId) {
    const { data: document, error: docError } = await supabase
      .from("document_objects")
      .select("body, owner_id, created_at, status, metadata")
      .eq("id", docId)
      .eq("building_id", buildingId)
      .single();

    if (!docError && document?.body?.sections) {
      const { data: brokerProfile } = await supabase
        .from("profiles")
        .select("id, display_name, company, phone, tagline, photo_url, slug, vibe_template_id")
        .eq("id", document.owner_id)
        .single();

      const ssotSummary = document.body.ssot_summary || {};
      return {
        buildingId,
        blindName: `${ssotSummary.area_signal || "핵심 상권"} ${ssotSummary.asset_type || "상업용 자산"}`,
        fullName: `${ssotSummary.area_signal || "핵심 상권"} ${ssotSummary.asset_type || "상업용 자산"}`,
        areaSignal: ssotSummary.area_signal || "",
        assetType: ssotSummary.asset_type || "",
        priceBand: ssotSummary.price_band || "",
        sizeSignal: ssotSummary.size_signal || "",
        completenessScore: document.body.readiness_score ?? 0,
        broker: buildBrokerObject(brokerProfile),
        sections: (document.body.sections || []).map((s: any) => {
          if ("content" in s) return s;
          let icon = "📄";
          if (s.section_type === "overview") icon = "🏢";
          if (s.section_type === "location") icon = "📍";
          if (s.section_type === "tenant") icon = "📋";
          if (s.section_type === "financial") icon = "💰";
          if (s.section_type === "risk") icon = "⚠️";
          if (s.section_type === "buyer_fit") icon = "🎯";
          if (s.section_type === "next_steps") icon = "🚀";

          return {
            sectionId: s.section_type || `section_${s.section_order}`,
            title: s.title || "섹션",
            icon,
            content: s.markdown || "",
            dataSource: s.confidence === "inferred" ? "AI 분석" : "SSoT 데이터",
            aiRole: s.confidence === "inferred" ? "ai_generated" : "auto",
            confidence: s.confidence,
            locked: false,
            boundaryNote: s.boundary_note,
          };
        }),
        generatedAt: document.body.generated_at || document.created_at || new Date().toISOString(),
        status: document.status || "draft",
        approvedAt: document.metadata?.approved_at,
        disclaimer: "본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.",
        fullImUpgradeCta: {
          enabled: true,
          label: "상세 투자설명서(IM) 요청",
          description: "렌트롤, 캐시플로우, 도면 등이 포함된 30페이지 분량의 Full IM은 중개인 승인 후 열람 가능합니다.",
        },
        protectedFieldsRemoved: ["상세 지번", "건물명", "소유주명"],
        photos: [],
        dataQualityBadge: computeDataQualityBadge({
          hasAddress: !!(document.body.external_data || ssotSummary.address || ssotSummary.raw_address),
          hasPublicData: !!document.body.external_data?.hasPublicData,
          hasMonthlyRent: !!ssotSummary.monthly_rent_total_krw || !!ssotSummary.monthly_rent_total,
          hasVacancy: !!ssotSummary.vacancy_signal || !!ssotSummary.vacancy_pct,
          hasPhotos: false, // TODO: Load photos from DB
        }),
      };
    }
  }

  // 3. Fallback: SSoT Lite
  const { data: ssot, error } = await supabase
    .from("building_ssot_lite")
    .select(
      `id, owner_id, area_signal, asset_type, price_band, size_signal,
       vacancy_signal, lease_summary, fit_summary, caution_summary, completeness_score,
       layers, disclosure, status, confidence`
    )
    .eq("id", buildingId)
    .single();

  if (error || !ssot) return null;

  const score = ssot.completeness_score ?? 0;
  if (score < 30) return null;

  const { data: brokerProfile } = await supabase
    .from("profiles")
    .select("id, display_name, company, phone, tagline, photo_url, slug, vibe_template_id")
    .eq("id", ssot.owner_id)
    .single();

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
      content: ssot.lease_summary || ssot.vacancy_signal
        ? `| 항목 | 내용 |\n|---|---|\n| 공실 | ${ssot.vacancy_signal || "확인 필요"} |\n\n${ssot.lease_summary || "세부 임대차 정보는 중개인에게 문의하세요."}`
        : "임대 현황 데이터가 부족합니다.",
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
    },
  ];

  const layers = (ssot.layers as Record<string, any>) || {};

  return {
    buildingId: ssot.id,
    blindName: `${ssot.area_signal} ${ssot.asset_type}`,
    fullName: `${ssot.area_signal} ${ssot.asset_type}`,
    areaSignal: ssot.area_signal,
    assetType: ssot.asset_type,
    priceBand: ssot.price_band,
    sizeSignal: ssot.size_signal,
    completenessScore: score,
    broker: buildBrokerObject(brokerProfile),
    sections,
    generatedAt: new Date().toISOString(),
    status: ssot.status || "draft",
    disclaimer: "본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.",
    fullImUpgradeCta: {
      enabled: true,
      label: "상세 투자설명서(IM) 요청",
      description: "렌트롤, 캐시플로우, 도면 등이 포함된 30페이지 분량의 Full IM은 중개인 승인 후 열람 가능합니다.",
    },
    protectedFieldsRemoved: ssot.disclosure?.guard_checked ? ["상세 지번", "건물명", "소유주명"] : [],
    photos: layers.photos || [],
    coordinates: layers.coordinates || undefined,
  };
}
