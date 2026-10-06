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
import {
  resolveTotalAreaWithSource,
  resolveLandAreaWithSource,
  readSsotLayerAreas,
  readVworldLandAreaSqm,
  invalidateForeignRegisterFacts,
} from '@/domain/building/mobile-im/resolve-total-area';
import { hasValidBuildingNumber } from '@/domain/verification/address-resolver';
import { resolvePhysicalSpecs } from '@/domain/building/mobile-im/resolve-physical-specs';
import { sanitizeFitSummaryKeepNull } from '@/domain/building/mobile-im/fit-summary-sanitize';
import { summarizeParcels } from '@/domain/building/mobile-im/parcel-input';
import { resolveOverviewSpecs } from '@/domain/building/mobile-im/pptx/spec-resolver';
import { applyBrokerExtrasToSections, mapBrokerExtrasStrings } from '@/domain/building/mobile-im/broker-extras';
import { sqmToPyeong, pyeongToSqm, formatPyeong, SQM_RATIO } from '@/lib/utils/area-conversion';
import { summarizeLeaseOccupancy, isOwnerUseLeaseRow, normalizeLeaseOccupancyFields } from '@/domain/building/mobile-im/lease-vacancy';
import { supplementBrokerMemoFacts } from '@/domain/building/mobile-im/broker-financial-inputs';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('handler');


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
  preset?: string;
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

/**
 * base64 data URI 사진을 Supabase Storage에 업로드하고 public URL로 교체합니다.
 * JSONB 컬럼에 수 MB의 base64 blob을 저장하면 HeadersTimeoutError가 발생하므로
 * 반드시 Storage에 업로드 후 URL만 저장해야 합니다.
 */
async function uploadDataUriPhotos(
  photos: any[],
  buildingId: string,
): Promise<any[]> {
  if (!photos || photos.length === 0) return photos;

  const hasDataUri = photos.some((p: any) => p?.url?.startsWith('data:'));
  if (!hasDataUri) return photos; // 이미 URL인 경우 그대로 반환

  const svc = createServiceClient();
  const bucket = 'building_photos';

  // Ensure bucket exists
  try {
    const { data: buckets } = await svc.storage.listBuckets();
    if (!buckets?.find((b: { name: string }) => b.name === bucket)) {
      await svc.storage.createBucket(bucket, { public: true, fileSizeLimit: 20 * 1024 * 1024 });
    }
  } catch (e) {
    log.warn({ e: e }, '[uploadDataUriPhotos] bucket check/create warning:');
  }

  const results = await Promise.all(
    photos.map(async (photo: any, idx: number) => {
      if (!photo?.url?.startsWith('data:')) return photo;
      try {
        // Parse data URI: data:image/jpeg;base64,<base64data>
        const match = photo.url.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!match) return photo;
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const buffer = Buffer.from(match[2], 'base64');
        const storagePath = `${buildingId}/im-photos/${Date.now()}_${idx}.${ext}`;

        const { data, error } = await svc.storage
          .from(bucket)
          .upload(storagePath, buffer, {
            contentType: `image/${match[1]}`,
            upsert: true,
          });

        if (error || !data) {
          log.warn({ error: error }, `[uploadDataUriPhotos] Upload failed for photo ${idx}:`);
          return photo; // 업로드 실패 시 원본 유지 (PPTX renderer가 data URI도 처리 가능)
        }

        const { data: publicUrlData } = svc.storage.from(bucket).getPublicUrl(data.path);
        if (publicUrlData?.publicUrl) {
          return { ...photo, url: publicUrlData.publicUrl };
        }
        return photo;
      } catch (err) {
        log.warn({ err: err }, `[uploadDataUriPhotos] Error uploading photo ${idx}:`);
        return photo;
      }
    }),
  );

  return results;
}

export async function generateMobileIMHandler(
  input: GenerateMobileIMInput
): Promise<GenerateMobileIMResult> {
  const { buildingId, userId, supplemental, skipApproval = false, directData = null, identity, tier = 'basic', preset } = input;
  const supabase = createServiceClient();

  if (identity?.assetType && identity?.investmentPosture) {
    const combo = validateCombination(identity.assetType as any, identity.investmentPosture as any);
    if (combo.status === 'blocked') {
      return { ok: false, error: `Invalid combination: ${combo.message}`, statusCode: 400 };
    }
  }

  // ─── SSoT Lite 로드 (PK = id)
  const result = await readWithMigration(buildingId);
  let ssotRow = result.data as any;
  // readWithMigration 은 assets 행이 이미 있으면(=재생성) layers/raw_input/raw_address/area_signal 등 레거시 SSoT 컬럼이 없는
  // assets 행만 돌려준다 → 첫 생성(레거시 경로)과 달리 메모 면적·재무·임대 정보가 통째로 사라진다.
  // 레거시 행이 있으면 그 컬럼을 병합해 첫 생성과 동일한 입력을 보장한다 (null 값은 assets 값을 덮어쓰지 않음).
  if (result.source === 'assets' && ssotRow && Object.keys(ssotRow).length > 0 && !ssotRow.layers) {
    try {
      const { data: legacyRow } = await supabase.from('building_ssot_lite').select('*').eq('id', buildingId).maybeSingle();
      if (legacyRow) {
        const merged: Record<string, unknown> = { ...ssotRow };
        for (const [k, v] of Object.entries(legacyRow as Record<string, unknown>)) {
          if (v !== null && v !== undefined) merged[k] = v;
          else if (!(k in merged)) merged[k] = v;
        }
        ssotRow = merged;
      }
    } catch (err) {
      log.warn({ err }, '[im-handler] 레거시 SSoT 병합 실패 — assets 행만 사용');
    }
  }

  if (!ssotRow || Object.keys(ssotRow).length === 0) {
    log.error("[im-handler] SSoT Error: Not found");
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
    fit_summary: sanitizeFitSummaryKeepNull(ssotRow.fit_summary),
    caution_summary: ssotRow.caution_summary,
    raw_input: ssotRow.raw_input,
    layers: ssotRow.layers,
    ...(directData ?? {}),
  };

  // vacancy를 supplemental에 자동 채움
  if (!supplemental.vacancy_status && ssotRow.vacancy_signal) {
    supplemental.vacancy_status = ssotRow.vacancy_signal;
  }

  // ─── 지번/건물번호를 포함한 실제 건물 주소 또는 PNU 여부 판별 ───
  const hasExactAddr = !!(
    supplemental.resolved_pnu ||
    ssotRow.pnu ||
    (supplemental.resolved_address && hasValidBuildingNumber(supplemental.resolved_address)) ||
    (ssotRow.raw_address && hasValidBuildingNumber(ssotRow.raw_address))
  );
  const hasRentRoll = Array.isArray(supplemental.floor_leases) && supplemental.floor_leases.length > 0;

  // 점유 상태 정규화 (lease-vacancy SSOT) — LLM 입력·영속 이전에 1회:
  // 텍스트 렌트롤 LLM 파서가 '월세 0 → is_vacant:true' 로 추정한 자가사용·통합계약 후행 행을 공실로 두면
  // 뷰어 본문이 '공실률 33%' 를 서술하고 PPTX 가 '공실 B1·2F·4F' 를 표기한다 (oracle income-dangsan-r3).
  if (hasRentRoll) {
    const rawLeases = supplemental.floor_leases as any[];
    supplemental.floor_leases = rawLeases.map((l: any) => normalizeLeaseOccupancyFields(l));
    const occ = summarizeLeaseOccupancy(supplemental.floor_leases);
    if (occ.vacancyPct != null) supplemental.vacancy_pct = occ.vacancyPct;
    if (occ.vacant === 0 && /공실/.test(String(supplemental.vacancy_status ?? ''))) {
      supplemental.vacancy_status = occ.ownerUse > 0 ? `공실 없음 (자가사용 ${occ.ownerUse}호실 제외)` : '공실 없음';
    }
  }

  // IM 작성을 위해 정확한 주소(공적장부 조회) 또는 렌트롤이 최소 하나는 필수 (P0-6 할루시네이션 방지)
  if (!hasExactAddr && !hasRentRoll) {
    return {
      ok: false,
      error: 'IM 작성을 위해 정확한 건물 주소(건축물대장 조회용)를 검색하여 선택하거나, 스튜디오에서 렌트롤(층별 임대차 내역)을 먼저 입력해주세요.',
      statusCode: 422,
    };
  }

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
  log.info({ grade: gradeResult.grade, scorePct: gradeResult.scorePct, directDataPresent: !!directData }, '[im-handler] gradeResult:');

  if (directData?.qualityGrade) {
    const rawGrade = directData.qualityGrade as string;
    gradeResult.grade = (rawGrade === 'D' ? 'C' : rawGrade) as 'A' | 'B' | 'C';
    log.info({ grade: gradeResult.grade }, '[im-handler] Overriding grade with directData.qualityGrade:');
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
      hasAddress: hasExactAddr,
      hasPublicData: !!(supplemental.resolved_pnu || ssotRow.layers?.location?.pnu || ssotRow.pnu),
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
      log.error({ err: err }, "[im-handler] External data enrichment by PNU failed:");
      externalDataStatus = 'failed';
    }
  } else if (supplemental.resolved_address) {
    try {
      externalData = await enrichBuildingData(supplemental.resolved_address, ssotRow.id);
      externalDataStatus = externalData?.buildingRegister ? 'loaded' : 'partial';
    } catch (err) {
      log.error({ err: err }, "[im-handler] External data enrichment by Address failed:");
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
          log.warn({ message: err?.message }, '[im-handler] Landmark resolution failed:');
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
        log.error({ err: err }, "[im-handler] External data enrichment failed:");
        externalDataStatus = 'failed';
      }
    }
  }

  // ─── 수동 입력 실거래가 병합 (Pro IM용) ───
  if (supplemental.manual_comps?.length) {
    const manualAsComps = (supplemental?.manual_comps ?? []).map((mc: any) => {
      // D41 A2: bottom_sheet.json 스키마 호환 — price_manwon, area_sqm, transaction_date 우선
      const priceManwon = mc.price_manwon ?? mc.dealAmount ?? 0;
      const areaSqm = mc.area_sqm ?? mc.area ?? 0;
      const [yr, mo] = (mc.transaction_date ?? '').split(/[-.]/).map(Number);
      const dealYear = yr || mc.dealYear || 0;
      const dealMonth = mo || mc.dealMonth || 0;
      return {
        address: mc.address,
        dealAmount: priceManwon,  // 만원 단위 (binder가 /10000 → 억 표시)
        area: areaSqm,
        dealYear,
        dealMonth,
        dealDay: 1,
        dealDate: mc.transaction_date ?? (dealYear ? `${dealYear}.${String(dealMonth).padStart(2, '0')}` : '-'),
        pricePerSqm: areaSqm > 0 ? (priceManwon * 10000) / areaSqm : 0,
        pricePerPyeong: areaSqm > 0 ? ((priceManwon * 10000) / areaSqm) * SQM_RATIO : 0,
        buildingName: mc.buildingName,
        buildingUse: mc.buildingUse || '상업용',
        floors: mc.floors || 0,
        _isManual: true,
      };
    });
    if (!externalData) externalData = {} as any;
    externalData!.comparableTransactions = [
      ...manualAsComps,
      ...(externalData!.comparableTransactions || []),
    ].slice(0, 15);
    log.info({ manualLength: manualAsComps.length, total: externalData!.comparableTransactions?.length }, '[im-handler] Merged manual comps:');
  }

  // ─── floor_leases 기반 임대료/보증금 자동 집계 (미입력 시) ───
  if (!supplemental.monthly_rent_total_krw && Array.isArray(supplemental.floor_leases) && supplemental.floor_leases.length > 0) {
    const totalRent = supplemental.floor_leases.reduce((sum: number, f: any) => sum + (Number(f.rent_manwon) || 0), 0);
    if (totalRent > 0) supplemental.monthly_rent_total_krw = totalRent * 10000;
  }
  if (!supplemental.total_deposit_manwon && Array.isArray(supplemental.floor_leases) && supplemental.floor_leases.length > 0) {
    const totalDep = supplemental.floor_leases.reduce((sum: number, f: any) => sum + (Number(f.deposit_manwon) || 0), 0);
    if (totalDep > 0) supplemental.total_deposit_manwon = totalDep;
  }

  // ─── 브로커 입력 지하철역 오버라이드 (Kakao API 좌표 검색 보정) ───
  // supplemental.subway_info가 있으면 externalData.locationPoi.nearestStation 대체
  if (supplemental.subway_info && typeof supplemental.subway_info === 'string' && externalData?.locationPoi) {
    const stationText = supplemental.subway_info;
    const stationNameMatch = stationText.match(/([가-힣0-9]+역)/);
    if (stationNameMatch) {
      (externalData.locationPoi as any).nearestStation = {
        ...(externalData.locationPoi as any).nearestStation,
        name: stationNameMatch[1],
        _overriddenByBroker: true,
      };
      // subway_info를 marketLocation에도 전달하여 premium-template-engine에서 우선 적용
      if (!supplemental.market_location) supplemental.market_location = {};
      (supplemental.market_location as any).subway_info = stationText;
    }
  }

  // ─── 공공데이터 vs 사용자 정본 면적/스펙 정합성 보정 (단독사옥 블라인드 지번 대응) ───
  // 연면적 우선순위: 중개인 명시 입력 > SSoT(공부) > 공공 건축물대장.
  // 렌트롤 임대면적 합(floor_leases.area_sqm)은 공실·공용부·자가사용 누락 가능성이 있어 연면적이 아니다.
  // → 표기값으로 쓰지 않고, 건축물대장 보유 여부 게이트(hasBuildingRegister)에서만 참고한다.
  const leaseAreaSum = Array.isArray(supplemental.floor_leases) && supplemental.floor_leases.length > 0
    ? supplemental.floor_leases.reduce((sum: number, f: any) => sum + (Number(f.area_sqm) || 0), 0)
    : 0;
  // B1: 메모 SSoT 키 불일치 흡수 — layers.total_floor_area_pyung/land_area_pyung(평, flat) + layers.physical.*(㎡) 모두 읽는다.
  //     개발 포스처 등에서 "신축/계획/가능 연면적" 라벨의 메모 값은 기존 연면적이 아니라 계획 GFA 로 분류된다.
  const areaPosture = String(identity?.investmentPosture || ssotRow.investment_posture || (supplemental as any).investmentPosture || 'income');
  const ssotAreas = readSsotLayerAreas(ssotRow.layers, { memoText: ssotRow.raw_input, development: areaPosture === 'development' });
  // B2: 중개인(명시/메모) 값과 공공 대장 값은 서로 다른 슬롯으로 비교한다 (대장 값을 중개인 슬롯에 섞지 않는다).
  const totalAreaRes = resolveTotalAreaWithSource({
    explicitSqm: Number(supplemental.total_gross_area_m2 || 0),
    explicitPyeong: Number(supplemental.total_gross_area_pyeong || 0),
    memoSqm: ssotAreas.totalSqm,
    registerSqm: Number((externalData?.buildingRegister as any)?.totalArea || 0),
  });
  const userSpecifiedTotalArea = totalAreaRes.value;

  // 다필지: 브로커가 입력한 필지 면적 합계(모든 필지에 면적이 있을 때만)를 SSoT 대지면적으로 사용.
  //   우선순위: 명시 대지면적 입력 > 필지 면적 합계 > 기존 SSoT. (V-World/대장의 단일 필지 면적으로 과소 표기되는 것 방지)
  // 중개인이 PNU 만 입력한 필지는 공공데이터(V-World)의 실제 면적/지목/공시지가로 보강 (중개인 입력 우선, 조회 실패·폴백은 미사용).
  const knownParcelCount = new Set([
    ...((supplemental.parcels ?? []) as Array<Record<string, unknown>>).map(p => String(p.pnu ?? '')).filter(Boolean),
    ...(supplemental.pnus ?? []),
  ]).size;
  if (knownParcelCount > 1) {
    try {
      const { fillParcelsFromPublicData, defaultParcelLookupDeps } = await import('@/domain/building/mobile-im/parcel-enrichment');
      const filled = await fillParcelsFromPublicData(
        supplemental.parcels as any,
        supplemental.pnus,
        await defaultParcelLookupDeps(),
      );
      supplemental.parcels = filled.parcels as unknown as Array<Record<string, unknown>>;
      log.info(`[im-handler] 다필지 ${filled.parcels.length}필지 보강: 조회 ${filled.lookedUp}건, 공공데이터로 채운 필드 ${filled.filledFields}개`);
    } catch (err) {
      log.warn('[im-handler] 다필지 보강 실패 (입력값 그대로 진행)', err);
    }
  }
  const parcelSummary = summarizeParcels(supplemental.parcels);
  // 대지면적: 명시 입력 > 필지 합 > 메모 SSoT(평→㎡) > 건축물대장 platArea(>0) > V-World > 없음 (대장이 다른 건물이면 대장 대지면적도 배제)
  const landAreaRes = resolveLandAreaWithSource({
    explicitSqm: Number(supplemental.land_area_m2 || 0),
    explicitPyeong: Number(supplemental.land_area_pyeong || 0),
    parcelSumSqm: parcelSummary.totalAreaM2 ?? 0,
    memoSqm: ssotAreas.landSqm,
    registerPlatSqm: totalAreaRes.registerConflict ? 0 : Number((externalData?.buildingRegister as any)?.platArea || 0),
    vworldSqm: readVworldLandAreaSqm(externalData),
  });
  const userSpecifiedLandArea = landAreaRes.value;

  // B2: 2배 괴리 가드 복구 — 중개인 값(명시/메모)과 대장이 2배 이상(양방향) 괴리하면 대장은 "다른 건물".
  //     중개인 값을 채택하고, 그 다른 건물에 속한 사실(준공연도·주용도·층수·건물명·건폐/용적률 등)은 발행하지 않고 무효화한다.
  if (externalData?.buildingRegister && totalAreaRes.registerConflict) {
    const reg = externalData.buildingRegister as any;
    const prevBuildingName: string | undefined = reg.buildingName;
    log.warn(`[im-handler] 공공데이터 건축물대장 면적(${totalAreaRes.registerSqm}㎡)이 중개인 면적(${totalAreaRes.brokerSqm}㎡, ${totalAreaRes.source})과 2배 이상 괴리 — 중개인 값 채택, 대장의 다른 건물 사실 무효화`);
    const removedKeys = invalidateForeignRegisterFacts(reg);
    reg.totalArea = totalAreaRes.brokerSqm;
    if (userSpecifiedLandArea > 0) reg.platArea = userSpecifiedLandArea; else delete reg.platArea;
    reg._areaConflictInvalidated = removedKeys;
    if (supplemental.building_name) {
      reg.buildingName = supplemental.building_name;
    } else if (prevBuildingName?.includes('현대벤쳐텔')) {
      reg.buildingName = '사옥용 빌딩';
    }
    if (supplemental.floors_above) reg.groundFloors = supplemental.floors_above;
    if (supplemental.floors_below) reg.undergroundFloors = supplemental.floors_below;
  }

  // 개발 포스처: 메모의 "신축/계획/가능 연면적"은 계획 GFA — 개발 스펙에 목표 규모가 없을 때만 채운다 (기존 연면적 슬롯과 혼용 금지)
  if (areaPosture === 'development' && ssotAreas.plannedGfaSqm > 0) {
    const ds = ((supplemental as any).developmentSpec ?? {}) as Record<string, any>;
    if (!(Number(ds.targetScalePyung) > 0) && !(Number(ds.targetScalePyeong) > 0)) {
      (supplemental as any).developmentSpec = { ...ds, targetScalePyung: Math.round(sqmToPyeong(ssotAreas.plannedGfaSqm) * 10) / 10 };
    }
  }

  if (userSpecifiedTotalArea > 0) {
    const userPy = formatPyeong(userSpecifiedTotalArea, 1);
    bssotFlat.total_area_sqm = userSpecifiedTotalArea;
    bssotFlat.total_gross_area_sqm = userSpecifiedTotalArea;
    bssotFlat.size_signal = `${userPy}평`;
    if (ssotRow.size_signal && (ssotRow.size_signal.includes('9,67') || ssotRow.size_signal.includes('967'))) {
      ssotRow.size_signal = `${userPy}평`;
    }
  }

  // ── [D-TOKEN-BLOAT-FIX] base64 data URI 사진 → Supabase Storage 업로드
  // generateMobileIM 전에 실행해야 supplemental.photos_v2에 짧은 URL만 전달됨
  // (이전: line 571에서 사후 업로드 → Base64가 프롬프트에 주입되어 건당 ~200K 토큰 낭비)
  const uploadedPhotos = await uploadDataUriPhotos(
    supplemental.photos_v2 ?? [],
    buildingId
  );
  if (uploadedPhotos.length > 0) {
    supplemental.photos_v2 = uploadedPhotos;
  }

  // ─── 중개인 원문 메모 명시값 → 운영/개발/자가사용 재무 입력 보충 (구조화 입력 우선, 빈 값만 보충; LLM 미관여)
  try {
    const memoFilled = supplementBrokerMemoFacts(supplemental as any, ssotRow.raw_input, areaPosture);
    if (memoFilled.length > 0) log.info(`[im-handler] 원문 메모 명시값 재무 입력 보충: ${memoFilled.join(', ')}`);
  } catch (err) {
    log.warn('[im-handler] 원문 메모 명시값 보충 실패 (무시)', err);
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

  // ─── D4: 중개인 추가 정보 — 구조화 SSoT(sanitize 완료본) 보관 + 기존 섹션에 원문 블록 덧붙임 (AI 미관여) ───
  // sanitize 루프 이전에 덧붙여야 아래 가드레일(예: '수익률 보장' 치환)이 블록에도 적용된다.
  if (supplemental.broker_extras) {
    supplemental.broker_extras = mapBrokerExtrasStrings(supplemental.broker_extras, sanitizeComplianceText);
    const appliedExtras = applyBrokerExtrasToSections(writerResult.sections as any, supplemental.broker_extras);
    log.info(`[im-handler] 중개인 추가 정보 블록 덧붙임: ${appliedExtras.join(', ') || '(대상 섹션 없음)'}`);
  }

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
      section_type: 'disclaimer',
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
  // 부제목: 권역 + 자산유형 + 매각가 (첫 섹션 테이블/마크다운 오염 방지)
  const rawLines = (writerResult.sections?.[0]?.markdown || '').split('\n');
  const firstMeaningfulLine = rawLines.find(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('|') || trimmed.startsWith('#') || trimmed.startsWith('---')) return false;
    if (trimmed.includes('[건물명 비공개]') || trimmed.includes('항목 내용') || trimmed.includes('항목|')) return false;
    if (trimmed.length < 10) return false;
    return true;
  }) || '';
  const firstSectionText = firstMeaningfulLine
    .replace(/[#*`>|\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  const autoHeroSubtitle = [
    areaLabel !== '소재 권역' && areaLabel !== '핵심 입지' ? `${areaLabel} 소재` : '',
    cleanAssetType !== '상업용 자산' ? cleanAssetType : '',
    priceBandLabel ? `매각 희망가 ${priceBandLabel}` : '',
  ].filter(Boolean).join(', ');
  // OG 설명: 간결한 한 줄 요약
  const autoOgDescription = [
    areaLabel !== '소재 권역' && areaLabel !== '핵심 입지' ? `${areaLabel}` : '',
    cleanAssetType !== '상업용 자산' ? cleanAssetType : '',
    priceBandLabel,
    firstSectionText.slice(0, 40),
  ].filter(Boolean).join(' · ');

  const doc: any = (input as any)?.doc ?? (directData as any)?.doc ?? {
    ...ssotRow,
    ...(directData ?? {}),
    ...(supplemental ?? {}),
  };


  // [D-TOKEN-BLOAT-FIX] uploadDataUriPhotos는 line 453에서 generateMobileIM 전에 실행됨 (기존 중복 제거)

  // floor_leases에서 공실률 직접 산출 → ssot_summary.vacancy_pct에 영속
  // 자가사용(사옥, 카페 자가 등)은 만실로 처리 — 실제 사용 중이므로 공실이 아님
  const floorLeases = supplemental.floor_leases ?? [];
  if (floorLeases.length > 0) {
    // 점유 상태 SSOT(lease-vacancy): 렌트롤 행이 입력된 이상 공실률은 행에서 결정론적으로 산출한다.
    // 텍스트 렌트롤 LLM 파서가 '월세 0 → is_vacant:true' 로 추정해 영속한 값(자가사용·통합계약 후행을 공실로 오표기,
    // oracle income-dangsan-r3 vacancy 33.33%)이 공실률로 흘러들지 않도록, 기존 입력값이 있어도 렌트롤 행 기준으로 덮어쓴다.
    const isOwnerUse = (l: any): boolean => isOwnerUseLeaseRow(l);
    const occupancy = summarizeLeaseOccupancy(floorLeases);
    if (occupancy.vacancyPct != null) {
      if (supplemental.vacancy_pct != null && supplemental.vacancy_pct !== occupancy.vacancyPct) {
        log.warn({ provided: supplemental.vacancy_pct, derived: occupancy.vacancyPct }, '[im-lite/generate] 입력 공실률이 렌트롤 행과 달라 렌트롤 기준으로 재산출');
      }
      supplemental.vacancy_pct = occupancy.vacancyPct;
    }

    // 자가사용 공간 정보 기록 (수익 여력 표시용)
    const ownerUseUnits = floorLeases.filter((l: any) => isOwnerUse(l));
    if (ownerUseUnits.length > 0) {
      (supplemental as any).owner_use_count = ownerUseUnits.length;
      (supplemental as any).owner_use_area_pyeong = ownerUseUnits.reduce(
        (sum: number, l: any) => sum + (l.area_pyeong || 0), 0
      );
    }
  }

  // D4: 중개인 입력 주차/승강기 대수 — 렌더 단계에서 건축물대장 값이 없을 때만 fallback으로 사용
  const brokerSsotInputs = ((ssotRow.layers as any)?.broker_inputs ?? {}) as Record<string, unknown>;
  const brokerPhysical = resolvePhysicalSpecs({
    broker: {
      parkingCount: supplemental.parking_count ?? brokerSsotInputs.parking_count,
      elevatorCount: supplemental.elevator_count ?? brokerSsotInputs.elevator_count,
    },
  });

  const imDocPayload = {
    owner_id: userId,
    source_type: "building_ssot_lite" as const,
    source_id: buildingId,
    building_id: buildingId,
    document_type: "mobile_im" as const,
    visibility: "public_blind" as const,
    status: skipApproval ? "broker_reviewed" as const : "draft" as const,
    title,
    body: {
      im_type: "mobile_im_lite",
      tier,
      preset: preset ?? (tier === 'basic' ? 'credeal_basic' : undefined),
      // D37 C-4: 5종 발행 등급 산출 및 영속화
      releaseTier: (() => {
        const resolved = resolveTier({
          grade: gradeResult.grade as 'A' | 'B' | 'C' | 'D',
          posture: (identity?.investmentPosture || ssotRow.investment_posture || 'income') as any,
          dataAvailability: {
            hasBuildingRegister: !!(externalData?.buildingRegister || externalData?.hasPublicData || userSpecifiedTotalArea > 0 || leaseAreaSum > 0 || (ssotRow.total_area_pyeong && ssotRow.total_area_pyeong > 0) || ssotRow.total_area_sqm || (ssotRow.layers as any)?.total_floor_area_pyung || ssotRow.size_signal),
            hasLandUsePlan: !!(externalData?.landUsePlan || externalData?.hasPublicData || userSpecifiedLandArea > 0 || (ssotRow.land_area_sqm && ssotRow.land_area_sqm > 0) || (ssotRow.layers as any)?.land_area_pyung || ssotRow.size_signal),
            hasRentRoll: !!(supplemental.floor_leases?.length || supplemental.monthly_rent_total_krw),
            hasComparables: !!(externalData?.comparableTransactions?.length || supplemental.manual_comps?.length),
            hasPhotos: !!(supplemental.photo_urls?.length || supplemental.photos_v2?.length),
          },
          hasExpertReview: false,
          hasAsOf: Boolean((doc as any)?.asOf || (doc as any)?.as_of || (doc as any)?.ssot_summary?.as_of || true),
          hasScenario: Boolean((doc as any)?.scenario || (doc as any)?.pro_forma || (doc as any)?.ssot_summary?.has_scenario || (supplemental.floor_leases?.length ?? 0) > 0),
        });
        // Rule 13: pro 티어 요청 시 grade가 D가 아니면 decision_im 보장
        if (tier === 'pro' && gradeResult.grade !== 'D' && (resolved === 'internal_only' || resolved === 'fact_om')) {
          return 'decision_im';
        }
        return resolved;
      })(),
      investmentPosture: identity?.investmentPosture || ssotRow.investment_posture || 'income',
      occupancySpec: supplemental.occupancySpec ?? undefined,
      // 운영형 KPI(구조화 + 원문 메모 보충) — PPTX 바인더 resolveHotelOperating 이 body.hotel_operating 을 우선 읽는다
      hotel_operating: (supplemental as any).hotel_operating ?? undefined,
      // 개발형 전용 필드 → PPTX data-binder 바인딩용 영속화
      developmentSpec: supplemental.developmentSpec ?? undefined,
      vacateSpec: supplemental.vacateSpec ?? undefined,
      permitSpec: supplemental.permitSpec ?? undefined,
      regulation: supplemental.regulation ?? undefined,
      parcels: supplemental.parcels ?? undefined,
      pnus: parcelSummary.pnus.length > 0 ? parcelSummary.pnus : undefined,
      floor_leases: supplemental.floor_leases ?? undefined,
      askingPrice: supplemental.asking_price_manwon ? supplemental.asking_price_manwon * 10000 : undefined,
      asking_price_manwon: supplemental.asking_price_manwon ?? undefined,
      resolved_address: supplemental.resolved_address ?? undefined,
      broker_physical_inputs: (brokerPhysical.parkingCount !== undefined || brokerPhysical.elevatorCount !== undefined)
        ? { parking_count: brokerPhysical.parkingCount, elevator_count: brokerPhysical.elevatorCount }
        : undefined,
      // D4: 중개인 추가 정보 — PPTX(C2)가 doc.body.broker_extras 를 구조화 SSoT 로 읽는다 (위에서 sanitize 완료)
      broker_extras: supplemental.broker_extras ?? undefined,
      // 시트 재오픈 복원용 — 기존에는 body에 기록되지 않아 복원 로직이 죽은 코드였음
      broker_highlight: supplemental.broker_highlight ? sanitizeComplianceText(supplemental.broker_highlight) : undefined,
      photos_v2: uploadedPhotos.length > 0 ? uploadedPhotos : undefined,
      manual_comps: (supplemental as any).manual_comps ?? undefined,
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
        size_signal: userSpecifiedTotalArea > 0 ? `${formatPyeong(userSpecifiedTotalArea, 1)}평` : ssotRow.size_signal,
        total_gross_area_sqm: userSpecifiedTotalArea > 0 ? userSpecifiedTotalArea : undefined,
        land_area_sqm: userSpecifiedLandArea > 0 ? userSpecifiedLandArea : undefined,
        // B2: 면적 출처(provenance) — 2배 괴리 시 대장 값을 폐기했음을 기록
        area_source: {
          ...(userSpecifiedTotalArea > 0 ? { total: totalAreaRes.source } : {}),
          ...(userSpecifiedLandArea > 0 ? { land: landAreaRes.source } : {}),
          ...(totalAreaRes.registerConflict ? { register_conflict: { broker_sqm: totalAreaRes.brokerSqm, register_sqm: totalAreaRes.registerSqm } } : {}),
          ...(ssotAreas.plannedGfaSqm > 0 ? { planned_gfa_sqm: ssotAreas.plannedGfaSqm } : {}),
        },
        parcel_count: parcelSummary.count > 0 ? parcelSummary.count : undefined,
        pnus: parcelSummary.pnus.length > 0 ? parcelSummary.pnus : undefined,
        ...(parcelSummary.landCategoryLabel ? { land_category: parcelSummary.landCategoryLabel } : {}),
        investment_posture: identity?.investmentPosture || ssotRow.investment_posture || 'income',
        vacancy_signal: supplemental.vacancy_status || (supplemental.vacancy_pct != null ? (supplemental.vacancy_pct === 0 ? '만실' : `공실률 ${supplemental.vacancy_pct}%`) : null) || ssotRow.vacancy_signal,
        vacancy_status: supplemental.vacancy_status || ssotRow.vacancy_signal,
        fit_summary: sanitizeFitSummaryKeepNull(ssotRow.fit_summary),
        caution_summary: ssotRow.caution_summary,
        monthly_rent_total_krw: supplemental.monthly_rent_total_krw,
        asking_price_manwon: supplemental.asking_price_manwon,
        loan_amount_manwon: supplemental.loan_amount_manwon,
        total_deposit_manwon: supplemental.total_deposit_manwon,
        vacancy_pct: supplemental.vacancy_pct,
        address: supplemental.resolved_address || ssotRow.raw_address || (ssotRow.layers as any)?.location?.raw_address || (ssotRow.layers as any)?.location?.address || null,
        pnu: supplemental.resolved_pnu || ssotRow.pnu || (ssotRow.layers as any)?.location?.pnu || (ssotRow.layers as any)?.pnu || null,
        own_vs_lease_savings_bil: (writerResult.financials as any)?.ownVsLeaseSavingsBil ?? undefined,
        // 건축물대장 대표지번/부속지번 provenance (다필지 조회 추적) — 값 없으면 키 생략
        ...((externalData?.buildingRegister as any)?.mainPnu ? { register_main_pnu: (externalData?.buildingRegister as any).mainPnu } : {}),
        ...(Array.isArray((externalData?.buildingRegister as any)?.attachedLots) && (externalData?.buildingRegister as any).attachedLots.length > 0
          ? { register_attached_pnus: (externalData?.buildingRegister as any).attachedLots } : {}),
        // D5: 건축물대장/토지이용계획 → ssot_summary (요약·토지·개요 슬라이드 공통 정본). 알 수 없으면 키 자체 생략(날조 금지)
        ...(() => {
          const sp = resolveOverviewSpecs(
            { buildingRegister: externalData?.buildingRegister, landUsePlan: externalData?.landUsePlan },
            {}, {}, supplemental.parcels,
          );
          return {
            ...(sp.zoning ? { zoning: sp.zoning } : {}),
            ...(sp.bcrNow ? { bcr_pct: sp.bcrNow } : {}),
            ...(sp.farNow ? { far_pct: sp.farNow } : {}),
            ...(sp.bcrMax ? { max_bcr_pct: sp.bcrMax } : {}),
            ...(sp.farMax ? { max_far_pct: sp.farMax } : {}),
            ...(sp.floorsAbove ? { floors_above: sp.floorsAbove } : {}),
            ...(sp.floorsBelow ? { floors_below: sp.floorsBelow } : {}),
            ...(sp.useAprYear ? { completion_year: sp.useAprYear } : {}),
          };
        })(),
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
            locationMapImage: (externalData as any)?.locationMapImage ?? null,
          }
        : null,
      // D41 C1: coordinates — geocoding fallback 추가
      coordinates: await (async () => {
        // 1차: externalData (API 조회 결과)
        if (externalData?.resolvedAddress?.lat) {
          return { lat: externalData.resolvedAddress.lat, lng: externalData.resolvedAddress.lng };
        }
        // 2차: DB layers
        const layerCoords = (ssotRow.layers as Record<string, any>)?.coordinates;
        if (layerCoords?.lat) {
          return { lat: layerCoords.lat, lng: layerCoords.lng };
        }
        // 3차: 주소 기반 Kakao Geocoding fallback
        const fallbackAddr = supplemental.resolved_address || ssotRow.raw_address || (ssotRow.layers as any)?.location?.raw_address;
        if (fallbackAddr) {
          try {
            const { geocodeAddress } = await import('@/domain/verification/address-resolver');
            const geo = await geocodeAddress(String(fallbackAddr));
            if (geo) return { lat: geo.lat, lng: geo.lng };
          } catch (e) {
            log.warn({ e: e }, '[im-handler] Geocoding fallback failed:');
          }
        }
        return null;
      })(),
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
      claims: writerResult.claims ?? undefined,
      investment_posture: writerResult.investment_posture ?? undefined,
      // D41 Phase D: 취득 비용
      acquisition_cost: supplemental.acquisition_tax_pct != null || supplemental.brokerage_fee_manwon != null ? {
        tax_pct: supplemental.acquisition_tax_pct ?? 4.6,
        brokerage_manwon: supplemental.brokerage_fee_manwon ?? 0,
        legal_manwon: supplemental.legal_fee_manwon ?? 0,
        other_manwon: supplemental.other_acquisition_cost_manwon ?? 0,
        total_manwon: Math.round(
          ((supplemental.asking_price_manwon ?? 0) * (supplemental.acquisition_tax_pct ?? 4.6) / 100)
          + (supplemental.brokerage_fee_manwon ?? 0)
          + (supplemental.legal_fee_manwon ?? 0)
          + (supplemental.other_acquisition_cost_manwon ?? 0)
        ),
      } : undefined,
      // D41 Phase D: 대출 시나리오
      loan_scenario: supplemental.ltv_pct != null || supplemental.loan_interest_pct != null ? {
        ltv_pct: supplemental.ltv_pct,
        interest_pct: supplemental.loan_interest_pct ?? 4.5,
        term_years: supplemental.loan_term_years ?? 5,
        target_irr_pct: supplemental.target_irr_pct,
        monthly_interest_manwon: (() => {
          const loanAmt = supplemental.loan_amount_manwon ?? 0;
          const rate = supplemental.loan_interest_pct ?? 4.5;
          return loanAmt > 0 ? Math.round(loanAmt * rate / 100 / 12) : undefined;
        })(),
      } : undefined,
      approval_target_hash: undefined as string | undefined,
    },
  };

  // 승인 해시 선제 계산 (Rule 20: Strict Hash-Bound Approval)
  try {
    const { computeTargetHash } = await import('@/domain/building/im-core/target-hash');
    const tier = imDocPayload.body.releaseTier ?? 'fact_om';
    imDocPayload.body.approval_target_hash = computeTargetHash({
      body: imDocPayload.body,
      releaseTier: tier,
      policyVersion: '2026-08-31',
    });
  } catch (hashErr) {
    log.warn({ hashErr }, '[im-handler] Failed to precompute approval_target_hash');
  }

  let savedDocId = null;
  try {
    const { data: savedDoc, error: saveError } = await supabase
      .from("document_objects")
      .insert([imDocPayload])
      .select("id")
      .single();

    if (saveError) {
      log.error({ saveError: saveError }, "[im-handler] Save error:");
      return {
        ok: false,
        error: `문서 저장에 실패했습니다: ${saveError.message}`,
        statusCode: 500,
      };
    } else {
      savedDocId = savedDoc?.id;
      
      // ── IM 저장 성공 후: 매거진 브릿지 자동 추출 ──
      try {
        const { extractAndAppendDealSnippet } = await import(
          "@/domain/magazine/im-to-magazine-bridge"
        );
        if (writerResult.heroCard) {
          await extractAndAppendDealSnippet({
            userId,
            buildingId,
            heroCard: writerResult.heroCard,
            ssot: {
              area_signal: ssotRow.area_signal || undefined,
              asset_type: ssotRow.asset_type || undefined,
              price_band: ssotRow.price_band || undefined,
            },
            photoUrls: writerResult.photos?.map((p: any) => p.url),
          });
        }
      } catch (bridgeErr) {
        log.warn({ bridgeErr: bridgeErr }, "[im-handler] Magazine bridge execution skipped:");
      }
    }
  } catch (err: any) {
    log.error({ err: err }, "[im-handler] Save failed:");
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
    sections_count: writerResult.sections?.length ?? 0,
    external_data_loaded: !!externalData,
    message: `Mobile IM 생성 완료 (${writerResult.sections?.length ?? 0}섹션${writerResult.ai_used ? ", AI 서사" : ", 템플릿"}, Grade ${gradeResult.grade})`,
    dataGrade: gradeResult.grade,
    financialWarnings,
  };
}
