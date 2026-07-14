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

// ─── Geocode: 주소 → 좌표 변환 (Kakao Local API, 한국 주소 정확도 높음) ────────
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null;
  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
  if (KAKAO_KEY) {
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
        { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }, signal: AbortSignal.timeout(3000) }
      );
      const data = await res.json();
      if (data.documents?.[0]) {
        return { lat: parseFloat(data.documents[0].y), lng: parseFloat(data.documents[0].x) };
      }
      // 주소 검색 실패 시 키워드 검색 fallback
      const res2 = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}`,
        { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }, signal: AbortSignal.timeout(3000) }
      );
      const data2 = await res2.json();
      if (data2.documents?.[0]) {
        return { lat: parseFloat(data2.documents[0].y), lng: parseFloat(data2.documents[0].x) };
      }
    } catch {}
  }
  // Kakao 실패 시 Nominatim fallback
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=kr`,
      { headers: { 'User-Agent': 'credeal.net/1.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.[0]?.lat && data?.[0]?.lon) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {}
  return null;
}

function buildBrokerObject(profile: any) {
  if (!profile) {
    return {
      userId: "system",
      displayName: "담당 중개인",
      company: "크리딜 파트너스",
      phone: "",
      tagline: "",
      photoUrl: "/default-avatar.png",
      slug: "cre-dealcard-default",
      vibeTemplateId: "default",
      specialtyRegions: [] as string[],
      specialtyAssets: [] as string[],
      bio: null as string | null,
      vibeVector: null as Record<string, number> | null,
      vibeVti: null as string | null,
      vibeComplement: null as Record<string, number> | null,
      vibeValence: null as number | null,
      vibeTrust: null as number | null,
      vibeAnalyzedAt: null as string | null,
      logoCompanyUrl: null as string | null,
      logoPartnerUrl: null as string | null,
      latestMagazine: null as { date: string; headline: string; url: string; marketTemp?: string } | null,
    };
  }
  return {
    userId: profile.id || profile.user_id || "system",
    displayName: profile.display_name || profile.name || "담당 중개인",
    company: profile.company || "크리딜 부동산중개법인",
    phone: profile.phone || "",
    tagline: profile.tagline || "",
    photoUrl: profile.photo_url || "/default-avatar.png",
    slug: profile.slug || "cre-dealcard-default",
    vibeTemplateId: profile.vibe_template_id || "default",
    specialtyRegions: (profile.specialty_regions as string[]) ?? [],
    specialtyAssets: (profile.specialty_assets as string[]) ?? [],
    bio: (profile.bio as string) ?? null,
    vibeVector: (profile.vibe_vector as Record<string, number>) ?? null,
    vibeVti: (profile.vibe_vti as string) ?? null,
    vibeComplement: (profile.vibe_complement as Record<string, number>) ?? null,
    vibeValence: (profile.vibe_valence as number) ?? null,
    vibeTrust: (profile.vibe_trust as number) ?? null,
    vibeAnalyzedAt: (profile.vibe_analyzed_at as string) ?? null,
    logoCompanyUrl: (profile.logo_company_url as string) ?? null,
    logoPartnerUrl: (profile.logo_partner_url as string) ?? null,
    contactEmail: (profile.contact_email as string) ?? null,
    latestMagazine: null as { date: string; headline: string; url: string; marketTemp?: string } | null,
  };
}

/**
 * owner_id로 프로필을 조회. profiles + broker_profiles를 병합하여 slug/vibe를 확보.
 */
async function fetchBrokerProfile(supabase: any, ownerId: string) {
  // 두 테이블을 동시에 조회
  const [{ data: profile }, { data: brokerProfile }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, company, phone, tagline, photo_url")
      .eq("id", ownerId)
      .single(),
    supabase
      .from("broker_profiles")
      .select("user_id, name, slug, vibe_template_id, avatar_url, photo_url, specialty_regions, specialty_assets, bio, vibe_vector, vibe_vti, vibe_complement, vibe_valence, vibe_trust, vibe_analyzed_at, logo_company_url, logo_partner_url, contact_email")
      .eq("user_id", ownerId)
      .single(),
  ]);

  if (!profile && !brokerProfile) return null;

  // broker_profiles가 없으면 profiles 정보로 자동 생성 (비블로킹)
  let slug = brokerProfile?.slug || null;
  if (!brokerProfile && profile) {
    const baseName = (profile.display_name || ownerId.substring(0, 8)) as string;
    const slugBase = baseName.toLowerCase().replace(/[^a-z0-9\uAC00-\uD7A3]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    slug = `${slugBase}-${ownerId.substring(0, 6)}`;
    
    // broker_profiles 자동 생성 (비블로킹)
    supabase
      .from("broker_profiles")
      .upsert({
        user_id: ownerId,
        name: profile.display_name || "중개인",
        slug,
        photo_url: profile.photo_url || null,
      }, { onConflict: "user_id" })
      .then(() => {});
  } else if (brokerProfile && !slug) {
    // broker_profiles는 있지만 slug가 없는 경우
    const baseName = (profile?.display_name || brokerProfile?.name || ownerId.substring(0, 8)) as string;
    const slugBase = baseName.toLowerCase().replace(/[^a-z0-9\uAC00-\uD7A3]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    slug = `${slugBase}-${ownerId.substring(0, 6)}`;
    
    supabase
      .from("broker_profiles")
      .update({ slug })
      .eq("user_id", ownerId)
      .then(() => {});
  }

  // profiles + broker_profiles 병합 (phone, company, tagline은 profiles에서)
  return {
    id: ownerId,
    display_name: profile?.display_name || brokerProfile?.name || "담당 중개인",
    company: profile?.company || "",
    phone: profile?.phone || "",
    tagline: profile?.tagline || "",
    photo_url: profile?.photo_url || brokerProfile?.avatar_url || brokerProfile?.photo_url || "/default-avatar.png",
    slug: slug || "cre-dealcard-default",
    vibe_template_id: brokerProfile?.vibe_template_id || "default",
    // Vibe & professional data
    specialty_regions: brokerProfile?.specialty_regions ?? null,
    specialty_assets: brokerProfile?.specialty_assets ?? null,
    bio: brokerProfile?.bio ?? null,
    vibe_vector: brokerProfile?.vibe_vector ?? null,
    vibe_vti: brokerProfile?.vibe_vti ?? null,
    vibe_complement: brokerProfile?.vibe_complement ?? null,
    vibe_valence: brokerProfile?.vibe_valence ?? null,
    vibe_trust: brokerProfile?.vibe_trust ?? null,
    vibe_analyzed_at: brokerProfile?.vibe_analyzed_at ?? null,
    // Logo URLs
    logo_company_url: brokerProfile?.logo_company_url ?? null,
    logo_partner_url: brokerProfile?.logo_partner_url ?? null,
    // Contact email
    contact_email: (brokerProfile as any)?.contact_email ?? null,
  };
}

/**
 * 브로커의 최신 매거진을 조회하여 broker 객체에 주입합니다.
 */
async function injectLatestMagazine(supabase: any, brokerObj: ReturnType<typeof buildBrokerObject>) {
  if (brokerObj.slug === "cre-dealcard-default") return;
  try {
    const { data: latestMag } = await supabase
      .from("magazine_issues")
      .select("issue_date, content")
      .eq("broker_id", brokerObj.slug)
      .order("issue_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestMag) {
      brokerObj.latestMagazine = {
        date: latestMag.issue_date,
        headline: (latestMag.content as any)?.headline || '주간 시장 리포트',
        url: `/magazine/${brokerObj.slug}/${latestMag.issue_date}`,
        marketTemp: (latestMag.content as any)?.market_temp ?? undefined,
      };
    }
  } catch {
    // non-blocking
  }
}

/**
 * 브로커의 딜카드 통계를 조회하여 broker 객체에 주입합니다.
 */
async function injectBrokerStats(supabase: any, brokerObj: ReturnType<typeof buildBrokerObject>) {
  if (brokerObj.slug === "cre-dealcard-default") return;
  try {
    const [{ count: totalCount }, { count: activeCount }] = await Promise.all([
      supabase
        .from("deal_cards")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", brokerObj.userId),
      supabase
        .from("deal_cards")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", brokerObj.userId)
        .in("status", ["active", "published"]),
    ]);
    (brokerObj as any).dealCount = totalCount ?? 0;
    (brokerObj as any).activeCount = activeCount ?? 0;
  } catch {
    // non-blocking — default to 0
  }
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
      .select("body, owner_id, created_at, status, updated_at")
      .eq("id", docId)
      .eq("building_id", buildingId)
      .single();

    if (!docError && document?.body?.sections) {
      const brokerProfile = await fetchBrokerProfile(supabase, document.owner_id);

      const ssotSummary = document.body.ssot_summary || {};
      const brokerObj = buildBrokerObject(brokerProfile);
      await injectLatestMagazine(supabase, brokerObj);
      await injectBrokerStats(supabase, brokerObj);
      return {
        buildingId,
        blindName: `${ssotSummary.area_signal || "핵심 상권"} ${ssotSummary.asset_type || "상업용 자산"}`,
        fullName: `${ssotSummary.area_signal || "핵심 상권"} ${ssotSummary.asset_type || "상업용 자산"}`,
        areaSignal: ssotSummary.area_signal || "",
        assetType: ssotSummary.asset_type || "",
        priceBand: ssotSummary.price_band || "",
        sizeSignal: ssotSummary.size_signal || "",
        completenessScore: document.body.readiness_score ?? 0,
        broker: brokerObj,
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
            provenance: s.provenance || [],
          };
        }),
        generatedAt: document.body.generated_at || document.created_at || new Date().toISOString(),
        status: document.status || "draft",
        approvedAt: document.status === 'broker_reviewed' ? (document.updated_at || document.created_at) : undefined,
        disclaimer: "본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.",
        fullImUpgradeCta: {
          enabled: true,
          label: "상세 투자설명서(IM) 요청",
          description: "렌트롤, 캐시플로우, 도면 등이 포함된 30페이지 분량의 Full IM은 중개인 승인 후 열람 가능합니다.",
        },
        protectedFieldsRemoved: ["상세 지번", "건물명", "소유주명"],
        photos: document.body.photos
          ?? (document.body.photo_urls || []).map((url: string, i: number) => ({
            url,
            type: i === 0 ? 'exterior' as const : 'interior' as const,
            label: i === 0 ? '건물 외관' : `건물 사진 ${i + 1}`,
            caption: undefined as string | undefined,
          })),
        hiddenSections: Array.isArray(document.body.hidden_sections) ? document.body.hidden_sections : [],
        coordinates: document.body.coordinates || await (async () => {
          // 좌표가 없으면 주소에서 자동 변환
          const addr = document.body.external_data?.address
            || ssotSummary.address
            || document.body.ssot_summary?.address
            || ssotSummary.raw_address;
          if (addr) return geocodeAddress(String(addr));
          return undefined;
        })(),
        dataQualityBadge: computeDataQualityBadge({
          hasAddress: !!(document.body.external_data || ssotSummary.address || ssotSummary.raw_address),
          hasPublicData: !!(document.body.external_data?.hasPublicData || document.body.external_data?.fallbackStatus || document.body.external_data?.enrichedAt),
          hasMonthlyRent: !!ssotSummary.monthly_rent_total_krw || !!ssotSummary.monthly_rent_total,
          hasVacancy: !!ssotSummary.vacancy_signal || !!ssotSummary.vacancy_pct,
          hasPhotos: (document.body.photos || document.body.photo_urls || []).length > 0,
          hasAskingPrice: !!(document.body.heroCard?.askingPriceBil || ssotSummary.asking_price_manwon),
          hasLoanAmount: !!(document.body.financials?.loanAmountBil || ssotSummary.loan_amount_manwon),
          hasFloorLeases: !!(document.body.heroCard?.waleTotalYears),
        }),
        // [C1] Hero Card — 기존 IM에 heroCard가 없으면 SSoT에서 동적 합성
        heroCard: document.body.heroCard ?? (() => {
          const s = ssotSummary;
          const sections = document.body.sections || [];
          const investSection = sections.find((sec: any) => sec.section_type === 'investment_thesis' || sec.section_type === 'buyer_fit');
          const riskSection = sections.find((sec: any) => sec.section_type === 'risk_check');
          const finSection = sections.find((sec: any) => sec.section_type === 'income_analysis');
          // Extract first sentence from section markdown as summary
          const firstLine = (md: string | undefined) => md?.split('\n').find(l => l.trim().length > 10)?.replace(/^[#*\-\s>]+/, '').trim() || '';
          return {
            assetType: s.asset_type || '꺼마빌딩',
            askingPriceDisplay: s.price_band || '',
            capRateBase: null,
            noiBaseBil: null,
            keyInvestmentPoint: firstLine(investSection?.markdown) || s.fit_summary || '투자 포인트는 IM 본문을 참조하세요.',
            keyRisk: firstLine(riskSection?.markdown) || s.caution_summary || '리스크 요인은 IM 본문을 참조하세요.',
            equityRequiredBil: null,
            leveragedYieldPct: null,
            readinessScore: document.body.readiness_score ?? 0,
            dcf10YearNpvBil: null,
          };
        })(),
        // [C2] DCF 10년 민감도
        dcf10Year: document.body.dcf10Year ?? undefined,
        // [C4] 레버리지 자금 구조
        financials: document.body.financials ? {
          equityRequiredBil: document.body.financials.equityRequired ?? null,
          totalDepositBil: document.body.financials.totalDepositBil ?? null,
          loanAmountBil: document.body.financials.loanAmountBil ?? null,
          leveragedYieldPct: document.body.financials.leveragedYield ?? null,
          waccPct: document.body.financials.wacc ? parseFloat((document.body.financials.wacc * 100).toFixed(1)) : null,
        } : undefined,
      };
    }
  }

  // 3. Fallback: SSoT Lite
  const { data: ssot, error } = await supabase
    .from("building_ssot_lite")
    .select(
      `id, owner_id, area_signal, asset_type, price_band, size_signal,
       vacancy_signal, lease_summary, fit_summary, caution_summary, completeness_score,
       layers, disclosure, status, confidence, photo_urls`
    )
    .eq("id", buildingId)
    .single();

  if (error || !ssot) return null;

  const score = ssot.completeness_score ?? 0;
  if (score < 30) return null;

  const brokerProfile = await fetchBrokerProfile(supabase, ssot.owner_id);

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

  const brokerObj2 = buildBrokerObject(brokerProfile);
  await injectLatestMagazine(supabase, brokerObj2);
  await injectBrokerStats(supabase, brokerObj2);

  return {
    buildingId: ssot.id,
    blindName: `${ssot.area_signal} ${ssot.asset_type}`,
    fullName: `${ssot.area_signal} ${ssot.asset_type}`,
    areaSignal: ssot.area_signal,
    assetType: ssot.asset_type,
    priceBand: ssot.price_band,
    sizeSignal: ssot.size_signal,
    completenessScore: score,
    broker: brokerObj2,
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
    photos: Array.isArray(layers.photos) && layers.photos.length > 0
      ? layers.photos
          .filter((p: any) => p && typeof p.url === "string")
          .map((p: any) => ({ url: p.url, type: p.type || "exterior", label: p.label || "건물 사진" }))
      : Array.isArray(ssot.photo_urls) && ssot.photo_urls.length > 0
      ? ssot.photo_urls.map((url: string, i: number) => ({
          url,
          type: i === 0 ? "exterior" : "interior",
          label: i === 0 ? "건물 외관" : `건물 사진 ${i + 1}`,
        }))
      : [],
    coordinates: layers.coordinates || undefined,
    dataQualityBadge: computeDataQualityBadge({
      hasAddress: !!(ssot.layers as any)?.asset_identity?.address || !!(ssot.layers as any)?.asset_identity?.raw_address,
      hasPublicData: !!(ssot.layers as any)?.public_data,
      hasMonthlyRent: !!(ssot.layers as any)?.rent_roll?.monthly_rent_total_krw || !!(ssot.layers as any)?.rent_roll?.monthly_rent_total,
      hasVacancy: !!ssot.vacancy_signal,
      hasPhotos: (Array.isArray(layers.photos) && layers.photos.length > 0) || (Array.isArray(ssot.photo_urls) && ssot.photo_urls.length > 0),
    }),
  };
}
