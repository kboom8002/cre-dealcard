/**
 * Mobile IM Lite 생성 핸들러 — 순수 비즈니스 로직
 *
 * route.ts (HTTP) 와 actions.ts (Server Action) 양쪽에서 호출 가능하도록
 * HTTP 레이어를 분리한 핵심 함수.
 */
import { createServiceClient } from "@/lib/supabase/service";
// Readiness deprecated in favor of grade-engine
import { generateMobileIM } from "@/domain/building/mobile-im/writer";
import { enrichBuildingData } from "@/lib/external/external-data-orchestrator";
import { enrichBuildingDataByPNU } from "@/lib/external/enrich-by-pnu";
import type { MobileIMSupplementalInput } from "@/domain/building/mobile-im/types";
import { sanitizeComplianceText } from '@/domain/building/guardrails';
import { computeDataGrade } from '@/domain/asset/grade-engine';
import { resolveTier } from '@/domain/building/im-core';
import { calculateNOI, calculateCapRate } from '@/domain/building/financials';
import { buildAttrsFromSsotLite, buildProvenanceFromSsotLite, readWithMigration } from '@/lib/ssot-adapter';
import { getIMDisclaimers } from '@/domain/building/legal-copy';
import { validateCombination } from '@/domain/ontology';
import { hasMinimumBasicData } from '@/domain/building/mobile-im/data-quality-badge';

export interface GenerateMobileIMInput {
  buildingId: string;
  userId: string;
  supplemental: MobileIMSupplementalInput;
  skipApproval?: boolean;
  directData?: Record<string, unknown> | null;
  identity?: {
    buildingUse?: string;
    assetType?: string;
    investmentPosture?: string;
  };
  tier?: 'basic' | 'pro';
}

export interface GenerateMobileIMResult {
  ok: boolean;
  im_lite_id?: string | null;
  url?: string;
  readiness_score?: number;
  ai_used?: boolean;
  sections_count?: number;
  external_data_loaded?: boolean;
  message?: string;
  dataGrade?: string;
  financialWarnings?: string[];
  // Error cases
  error?: string;
  score?: number;
  threshold?: number;
  missing?: string[];
  hint?: string;
  statusCode?: number;
}

export async function generateMobileIMHandler(
  input: GenerateMobileIMInput
): Promise<GenerateMobileIMResult> {
  const { buildingId, userId, supplemental, skipApproval = false, directData = null, identity, tier = 'basic' } = input;
  const supabase = createServiceClient();

  if (identity?.assetType && identity?.investmentPosture) {
    const combo = validateCombination(identity.assetType as any, identity.investmentPosture as any);
    if (combo.status === 'blocked') {
      return { ok: false, error: `Invalid combination: ${combo.message}`, statusCode: 400 };
    }
  }

  // ─── SSoT Lite 로드 (PK = id)
  const result = await readWithMigration(buildingId);
  const ssotRow = result.data as any;

  if (!ssotRow || Object.keys(ssotRow).length === 0) {
    console.error("[im-handler] SSoT Error: Not found");
    return {
      ok: false,
      error: `SSoT 데이터를 찾을 수 없습니다. 딜카드를 먼저 생성해 주세요.`,
      statusCode: 404,
    };
  }

  // DB 컬럼을 readiness가 이해하는 flat 구조로 매핑
  const bssotFlat: Record<string, unknown> = {
    area_signal: ssotRow.area_signal,
    asset_type: ssotRow.asset_type,
    price_band: ssotRow.price_band,
    size_signal: ssotRow.size_signal,
    current_use_signal: ssotRow.current_use_signal,
    vacancy_signal: ssotRow.vacancy_signal,
    fit_summary: ssotRow.fit_summary,
    caution_summary: ssotRow.caution_summary,
    raw_input: ssotRow.raw_input,
    layers: ssotRow.layers,
    ...(directData ?? {}),
  };

  // vacancy를 supplemental에 자동 채움
  if (!supplemental.vacancy_status && ssotRow.vacancy_signal) {
    supplemental.vacancy_status = ssotRow.vacancy_signal;
  }

  // ─── Readiness 동적 점수 계산 (주소 25, 권역 10, 매각가 20, 임대료 20, 공공데이터 15, 사진 10) ───
  const hasExactAddr = !!(supplemental.resolved_address || supplemental.resolved_pnu || ssotRow.raw_address || ssotRow.pnu);
  let calculatedReadiness = 0;
  if (hasExactAddr) calculatedReadiness += 25;
  if (ssotRow.area_signal) calculatedReadiness += 10;
  if (supplemental.asking_price_manwon || ssotRow.price_band) calculatedReadiness += 20;
  if (supplemental.monthly_rent_total_krw || ssotRow.gross_annual_income_krw) calculatedReadiness += 20;
  if (supplemental.photo_urls?.length || supplemental.photos_v2?.length || (ssotRow.photo_urls && (ssotRow.photo_urls as string[]).length > 0)) calculatedReadiness += 10;
  if (ssotRow.vacancy_signal || supplemental.vacancy_pct != null) calculatedReadiness += 5;
  const readiness = { can_generate: true, score: Math.min(100, calculatedReadiness), missing: [] };

  // ─── v3 Data Grade Gating ───
  const gradeAttrs = buildAttrsFromSsotLite({
    ...ssotRow,
    lease_summary: supplemental,
    layers: ssotRow.layers,
  });
  const gradeProvenance = buildProvenanceFromSsotLite({
    ...ssotRow,
    lease_summary: supplemental,
  });
  const gradeResult = computeDataGrade(gradeAttrs, gradeProvenance);
  console.log('[im-handler] gradeResult:', gradeResult.grade, gradeResult.scorePct, 'directData present:', !!directData);

  if (directData?.qualityGrade) {
    const rawGrade = directData.qualityGrade as string;
    gradeResult.grade = (rawGrade === 'D' ? 'C' : rawGrade) as 'A' | 'B' | 'C';
    console.log('[im-handler] Overriding grade with directData.qualityGrade:', gradeResult.grade);
  }

  // Pro IM tier gate: requires at least B-grade (completeness >= 60%)
  if (tier === 'pro' && (gradeResult.grade === 'D' || gradeResult.grade === 'C' || (typeof ssotRow.completeness_score === 'number' && ssotRow.completeness_score < 60))) {
    return {
      ok: false,
      error: 'Pro IM은 B등급(완성도 60%) 이상의 데이터가 필요합니다.',
      statusCode: 422,
    };
  }

  // ─── 등급 기반 자동 결정 (Basic/Pro 구분 제거 → 단일 IM) ───
  {
    const posture = (
      identity?.investmentPosture
      || ssotRow.investment_posture
      || 'income'
    ) as any;
    const hasBasicData = hasMinimumBasicData({
      hasAskingPrice: !!supplemental.asking_price_manwon || !!ssotRow.price_band,
      hasMonthlyRent: !!supplemental.monthly_rent_total_krw || !!ssotRow.gross_annual_income_krw || !!ssotRow.lease_summary,
      hasAddress: !!supplemental.resolved_address || !!ssotRow.area_signal,
      hasPublicData: !!ssotRow.layers?.location?.pnu || !!ssotRow.pnu || true,
    }, posture);

    if (!hasBasicData) {
      return {
        ok: false,
        error: posture === 'development'
          ? '개발형 IM 생성에 필요한 주소 또는 대지/건물 정보가 부족합니다.'
          : 'IM 생성을 위해 매각 희망가 또는 월 임대료 입력이 필요합니다.',
        statusCode: 422,
      };
    }
  }

  // Grade B: Strictly block DCF/NPV/Sensitivity (prevents over-precision)
  const dcfEligible = gradeResult.grade === 'A';

  // ─── v3 Financial Validation ───
  const monthlyRent = supplemental.monthly_rent_total_krw ?? 0;
  const askingPrice = (supplemental.asking_price_manwon ?? 0) * 10000;
  let financialWarnings: string[] = [];
  if (monthlyRent > 0 && askingPrice > 0) {
    const noiResult = calculateNOI(monthlyRent * 12, 10, 5);
    const capRateResult = calculateCapRate(noiResult.value, askingPrice);
    if (capRateResult.value !== null) {
      if (capRateResult.value < 2) financialWarnings.push(`Cap Rate ${capRateResult.value.toFixed(1)}%: 권역 평균 대비 매우 낮음`);
      if (capRateResult.value > 15) financialWarnings.push(`Cap Rate ${capRateResult.value.toFixed(1)}%: 비정상적으로 높음 — 데이터 확인 필요`);
    }
  }

  // ─── 주소 미입력 경고 (soft warning) ───
  const addressMissing = !supplemental.resolved_address && !supplemental.resolved_pnu;
  if (addressMissing) {
    financialWarnings.push(
      '주소가 입력되지 않아 건축물대장·토지이용계획 등 공적장부를 조회하지 못했습니다. 주소를 입력하면 데이터 등급이 향상됩니다.'
    );
  }

  // ─── 공공데이터 수집 (fault-tolerant)
  let externalData = null;
  let externalDataStatus: 'loaded' | 'partial' | 'failed' | 'skipped' = 'skipped';

  if (supplemental.resolved_pnu) {
    try {
      externalData = await enrichBuildingDataByPNU(
        supplemental.resolved_pnu,
        supplemental.resolved_address || "",
        ssotRow.id
      );
      externalDataStatus = externalData?.buildingRegister ? 'loaded' : 'partial';
    } catch (err) {
      console.error("[im-handler] External data enrichment by PNU failed:", err);
      externalDataStatus = 'failed';
    }
  } else if (supplemental.resolved_address) {
    try {
      externalData = await enrichBuildingData(supplemental.resolved_address, ssotRow.id);
      externalDataStatus = externalData?.buildingRegister ? 'loaded' : 'partial';
    } catch (err) {
      console.error("[im-handler] External data enrichment by Address failed:", err);
      externalDataStatus = 'failed';
    }
  } else {
    let rawAddress: string | null = null;
    if (ssotRow.raw_input) {
      const fullAdminMatch = String(ssotRow.raw_input).match(
        /(?:(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|도|특별자치도)?\s*)?[가-힣0-9]+(?:시|군|구)\s+[가-힣0-9]+(?:읍|면|동|가|로|길)\s*\d+(?:-\d+)?(?:번지)?/
      );
      const dongJibunMatch = String(ssotRow.raw_input).match(
        /[가-힣0-9]+(?:읍|면|동|가|로|길)\s*\d+(?:-\d+)?(?:번지)?/
      );
      if (fullAdminMatch) rawAddress = fullAdminMatch[0].trim();
      else if (dongJibunMatch) rawAddress = dongJibunMatch[0].trim();
    }
    if (!rawAddress) {
      const layers = (ssotRow.layers ?? {}) as Record<string, any>;
      const locAddr = layers?.location?.address || layers?.location?.raw_address || layers?.location?.exact_address;
      if (locAddr && !locAddr.includes("권역") && !locAddr.endsWith("권")) {
        rawAddress = locAddr;
      }
    }

    // ── 단계 B: raw_input에서 랜드마크 추출 → 카카오 키워드 검색 ──
    if ((!rawAddress || rawAddress.length <= 3) && ssotRow.raw_input) {
      const landmarkMatch = String(ssotRow.raw_input).match(
        /([가-힣]+(?:역|사거리|IC))/
      );
      if (landmarkMatch) {
        try {
          const { searchLandmarkAddress } = await import('./landmark-resolver');
          const resolved = await searchLandmarkAddress(landmarkMatch[1]);
          if (resolved) rawAddress = resolved;
        } catch (err: any) {
          console.warn('[im-handler] Landmark resolution failed:', err?.message);
        }
      }
    }

    // ── 단계 C: area_signal 기반 fallback (최후 수단) ──
    if ((!rawAddress || rawAddress.length <= 3) && ssotRow.area_signal) {
      rawAddress = `서울시 ${ssotRow.area_signal}`;
    }

    if (rawAddress && rawAddress.length > 3) {
      try {
        externalData = await enrichBuildingData(rawAddress, ssotRow.id);
        externalDataStatus = externalData?.buildingRegister ? 'loaded' : 'partial';
      } catch (err) {
        console.error("[im-handler] External data enrichment failed:", err);
        externalDataStatus = 'failed';
      }
    }
  }

  // ─── 수동 입력 실거래가 병합 (Pro IM용) ───
  if (supplemental.manual_comps?.length) {
    const manualAsComps = supplemental.manual_comps.map((mc: any) => ({
      address: mc.address,
      dealAmount: mc.dealAmount * 10000,  // 만원 → 원
      area: mc.area,
      dealYear: mc.dealYear,
      dealMonth: mc.dealMonth,
      dealDay: 1,
      pricePerSqm: (mc.dealAmount * 10000) / mc.area,
      pricePerPyeong: ((mc.dealAmount * 10000) / mc.area) * 3.30579,
      buildingUse: mc.buildingUse || '상업용',
      floors: mc.floors || 0,
      _isManual: true,
    }));
    if (!externalData) externalData = {} as any;
    externalData!.comparableTransactions = [
      ...manualAsComps,
      ...(externalData!.comparableTransactions || []),
    ].slice(0, 15);
    console.log('[im-handler] Merged manual comps:', manualAsComps.length, 'total:', externalData!.comparableTransactions?.length);
  }

  // ─── 7섹션 AI 생성
  const writerResult = await generateMobileIM({
    building_ssot_lite: bssotFlat as any,
    supplemental,
    readiness,
    external_data: externalData,
    dcfEligible,
    dataGrade: gradeResult.grade,
    identity: {
      buildingUse: identity?.buildingUse,
      assetType: identity?.assetType || String(bssotFlat.asset_type ?? ''),
      investmentPosture: identity?.investmentPosture || ssotRow.investment_posture || (supplemental as any).investmentPosture || 'income',
    } as any,
  });

  // ─── v3 Guardrails: Sanitize all generated sections ───
  if (writerResult.sections) {
    for (const section of writerResult.sections) {
      if (section.markdown && typeof section.markdown === 'string') {
        section.markdown = sanitizeComplianceText(section.markdown);
      }
    }
  }

  // Grade C: Mask Cap Rate in sections
  if (gradeResult.grade === 'C' && writerResult.sections) {
    for (const section of writerResult.sections) {
      if (section.markdown && typeof section.markdown === 'string') {
        section.markdown = section.markdown.replace(
          /Cap\s*Rate[^.]*\d+\.?\d*\s*%/gi,
          'Cap Rate: 검증 중'
        );
      }
    }
  }

  const disclaimers = getIMDisclaimers('basic');
  if (writerResult.sections) {
    writerResult.sections.push({
      title: '면책 조항',
      markdown: disclaimers
    } as any);
  }

  // IM 제목: CRE IM 업계 표준 문체 적용 (골든셋 참조: @/lib/ai/im-title-golden-set)
  const resolvedAddr = supplemental.resolved_address || (ssotRow.layers as any)?.location?.address || '';
  let extractedAreaFromAddr = '';
  if (resolvedAddr) {
    const m = resolvedAddr.match(/([가-힣]+(?:구|군|시))\s+([가-힣0-9]+(?:동|가|로|읍|면))/);
    if (m) {
      extractedAreaFromAddr = `${m[1]} ${m[2]}`;
    }
  }

  const rawArea = (directData?.area_signal as string) 
    || ssotRow.area_signal 
    || extractedAreaFromAddr 
    || "소재 권역";

  const areaLabel = rawArea.endsWith("권") && !rawArea.endsWith("권역") ? `${rawArea}역` : rawArea;

  const rawAssetType = (directData?.asset_type as string) 
    || identity?.assetType 
    || ssotRow.asset_type 
    || "상업용 자산";

  const cleanAssetType = rawAssetType
    .replace(/(으로|로)\s*추정(되는|됨|)\s*/g, "")
    .replace(/\s*또는\s+[^\s]+\s*(계열로|계열)\s*(추정|)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  let title = (directData?.title || directData?.deal_title) as string | undefined;
  if (!title || title.includes("핵심 입지") || title.includes("비공개 권역") || title === "매물 매각") {
    title = `${areaLabel} ${cleanAssetType} 매각`;
  }

  // ── Hero/OG 메타 자동 생성 (fallback 의존도 제거) ──
  const autoHeroTitle = title;
  const priceBandLabel = ssotRow.price_band 
    || (supplemental.asking_price_manwon ? `${Math.round(supplemental.asking_price_manwon / 10000)}억 원대` : '');
  // 부제목: 권역 + 자산유형 + 매각가 + 첫 섹션에서 핵심 문장 추출
  const firstSectionText = writerResult.sections?.[0]?.markdown
    ?.replace(/[#*`\n>|]/g, ' ')
    ?.replace(/\s+/g, ' ')
    ?.trim()
    ?.slice(0, 60) || '';
  const autoHeroSubtitle = [
    areaLabel !== '소재 권역' && areaLabel !== '핵심 입지' ? `${areaLabel} 소재` : '',
    cleanAssetType !== '상업용 자산' ? cleanAssetType : '',
    priceBandLabel ? `매각 희망가 ${priceBandLabel}` : '',
  ].filter(Boolean).join(', ') 
    + (firstSectionText ? `. ${firstSectionText}` : '');
  // OG 설명: 간결한 한 줄 요약
  const autoOgDescription = [
    areaLabel !== '소재 권역' && areaLabel !== '핵심 입지' ? `${areaLabel}` : '',
    cleanAssetType !== '상업용 자산' ? cleanAssetType : '',
    priceBandLabel,
    firstSectionText.slice(0, 40),
  ].filter(Boolean).join(' · ');

  const imDocPayload = {
    owner_id: userId,
    source_type: "building_ssot_lite" as const,
    source_id: buildingId,
    building_id: buildingId,
    document_type: "blind_teaser" as const,
    visibility: "public_blind" as const,
    status: skipApproval ? "broker_reviewed" as const : "draft" as const,
    title,
    body: {
      im_type: "mobile_im_lite",
      tier,
      // D37 C-4: 5종 발행 등급 산출 및 영속화
      releaseTier: resolveTier({
        grade: gradeResult.grade as 'A' | 'B' | 'C' | 'D',
        posture: (identity?.investmentPosture || ssotRow.investment_posture || 'income') as any,
        dataAvailability: {
          hasBuildingRegister: !!(externalData?.hasPublicData),
          hasLandUsePlan: !!(externalData?.hasPublicData),
          hasRentRoll: !!(supplemental.floor_leases?.length || supplemental.monthly_rent_total_krw),
          hasComparables: !!(externalData?.comparableTransactions?.length),
          hasPhotos: !!(supplemental.photo_urls?.length || supplemental.photos_v2?.length),
        },
        hasExpertReview: false,
      }),
      investmentPosture: identity?.investmentPosture || ssotRow.investment_posture || 'income',
      // Hero/OG 메타 자동 세팅 — 브로커가 im-approval에서 수정 가능
      heroTitle: autoHeroTitle,
      heroSubtitle: autoHeroSubtitle,
      ogTitle: autoHeroTitle,
      ogDescription: autoOgDescription,
      keyInvestmentPoint: autoHeroSubtitle,
      sections: writerResult.sections,
      boundary_note: writerResult.boundary_note,
      generated_at: writerResult.generated_at,
      ai_used: writerResult.ai_used,
      readiness_score: readiness.score,
      ssot_summary: {
        area_signal: ssotRow.area_signal,
        asset_type: ssotRow.asset_type,
        price_band: ssotRow.price_band,
        size_signal: ssotRow.size_signal,
        investment_posture: identity?.investmentPosture || ssotRow.investment_posture || 'income',
        vacancy_signal: supplemental.vacancy_status || (supplemental.vacancy_pct != null ? (supplemental.vacancy_pct === 0 ? '만실' : `공실률 ${supplemental.vacancy_pct}%`) : null) || ssotRow.vacancy_signal,
        vacancy_status: supplemental.vacancy_status || ssotRow.vacancy_signal,
        fit_summary: ssotRow.fit_summary,
        caution_summary: ssotRow.caution_summary,
        monthly_rent_total_krw: supplemental.monthly_rent_total_krw,
        asking_price_manwon: supplemental.asking_price_manwon,
        loan_amount_manwon: supplemental.loan_amount_manwon,
        total_deposit_manwon: supplemental.total_deposit_manwon,
        vacancy_pct: supplemental.vacancy_pct,
        address: supplemental.resolved_address || ssotRow.raw_address || (ssotRow.layers as any)?.location?.raw_address || (ssotRow.layers as any)?.location?.address || null,
        pnu: supplemental.resolved_pnu || ssotRow.pnu || (ssotRow.layers as any)?.location?.pnu || (ssotRow.layers as any)?.pnu || null,
      },
      external_data: externalData
        ? {
            enrichedAt: externalData.enrichedAt,
            hasPublicData: !!(externalData.buildingRegister || externalData.landUsePlan),
            address: supplemental.resolved_address || null,
            errors: externalData.errors,
            fallbackStatus: {
              buildingRegister: externalData.buildingRegister?._isFallback ?? null,
              landPrice: externalData.landPrice?._isFallback ?? null,
              landUsePlan: externalData.landUsePlan?._isFallback ?? null,
              locationPoi: externalData.locationPoi?._isFallback ?? null,
            },
          }
        : null,
      // Phase 2: V-World / 공공 API 원본 데이터 → PPTX bindFromExternalData 직접 바인딩용
      enrichment: externalData
        ? {
            landUsePlan: externalData.landUsePlan ?? null,
            landPrice: externalData.landPrice ?? null,
            buildingRegister: externalData.buildingRegister ?? null,
            registryData: externalData.registryData ?? null,
            comparableTransactions: externalData.comparableTransactions ?? null,
            locationPoi: externalData.locationPoi ?? null,
            commercialDistrict: externalData.commercialDistrict ?? null,
            cadastralMapImage: externalData.cadastralMapImage ?? null,
          }
        : null,
      coordinates: externalData?.resolvedAddress
        ? { lat: externalData.resolvedAddress.lat, lng: externalData.resolvedAddress.lng }
        : (ssotRow.layers as Record<string, any>)?.coordinates
        ? { lat: (ssotRow.layers as Record<string, any>).coordinates.lat, lng: (ssotRow.layers as Record<string, any>).coordinates.lng }
        : null,
      mapImageUrl: externalData?.mapImageUrl ?? null,
      photo_urls: (() => {
        const userPhotos = supplemental.photo_urls ?? [];
        if (userPhotos.length > 0) return userPhotos;
        const layerPhotos = (ssotRow.layers as any)?.photos;
        if (Array.isArray(layerPhotos) && layerPhotos.length > 0) {
          return layerPhotos.map((p: any) => p.url).filter((url: any): url is string => typeof url === 'string' && url.length > 0);
        }
        if (Array.isArray(ssotRow.photo_urls) && ssotRow.photo_urls.length > 0) {
          return ssotRow.photo_urls;
        }
        return [];
      })(),
      dataGrade: gradeResult.grade,
      financialWarnings,
      dcfEligible,
      // 데이터 완전성 메타데이터 — PPTX 엔드포인트에서 게이트에 활용
      dataCompleteness: {
        buildingRegister: externalDataStatus === 'loaded' || externalDataStatus === 'partial',
        buildingRegisterSource: externalDataStatus,
        qualityGrade: gradeResult.grade,
        pptxExportAllowed: externalDataStatus !== 'failed' && externalDataStatus !== 'skipped',
        generatedAt: new Date().toISOString(),
      },
      // 신규 writer 출력: heroCard, photos (기존 writer 미지원 시 undefined → JSON에서 제외)
      heroCard: writerResult.heroCard ?? undefined,
      photos: writerResult.photos ?? undefined,
      // DCF 감응도 매트릭스 + 레버리지 자금 구조 (뷰어 DCFHeatmap/LeverageChart용)
      dcf10Year: writerResult.dcf10Year ?? undefined,
      financials: writerResult.financials ?? undefined,
    },
  };

  let savedDocId = null;
  try {
    const { data: savedDoc, error: saveError } = await supabase
      .from("document_objects")
      .insert([imDocPayload])
      .select("id")
      .single();

    if (saveError) {
      console.error("[im-handler] Save error:", saveError);
      return {
        ok: false,
        error: `문서 저장에 실패했습니다: ${saveError.message}`,
        statusCode: 500,
      };
    } else {
      savedDocId = savedDoc?.id;
      
      // ── IM 저장 성공 후: 매거진 브릿지 자동 추출 ──
      try {
        // const { extractAndAppendDealSnippet } = await import(
        //   "@/domain/magazine/im-to-magazine-bridge"
        // );
        // if (writerResult.heroCard) {
        //   await extractAndAppendDealSnippet({
        //     userId,
        //     buildingId,
        //     heroCard: writerResult.heroCard,
        //     ssot: {
        //       area_signal: ssotRow.area_signal || undefined,
        //       asset_type: ssotRow.asset_type || undefined,
        //       price_band: ssotRow.price_band || undefined,
        //     },
        //     photoUrls: writerResult.photos?.map((p: any) => p.url),
        //   });
        // }

      } catch (bridgeErr) {
        console.warn("[im-handler] Magazine bridge execution skipped:", bridgeErr);
      }
    }
  } catch (err: any) {
    console.error("[im-handler] Save failed:", err);
    return {
      ok: false,
      error: `문서 저장 중 오류가 발생했습니다: ${err.message}`,
      statusCode: 500,
    };
  }

  const imUrl = `/im-lite/${buildingId}${savedDocId ? `?doc=${savedDocId}` : ""}`;

  return {
    ok: true,
    im_lite_id: savedDocId,
    url: imUrl,
    readiness_score: readiness.score,
    ai_used: writerResult.ai_used,
    sections_count: writerResult.sections.length,
    external_data_loaded: !!externalData,
    message: `Mobile IM 생성 완료 (${writerResult.sections.length}섹션${writerResult.ai_used ? ", AI 서사" : ", 템플릿"}, Grade ${gradeResult.grade})`,
    dataGrade: gradeResult.grade,
    financialWarnings,
  };
}
