/**
 * @file pptx-renderer.ts
 * @description CREDEAL PPTX 렌더러 — 슬림 오케스트레이터
 *
 * 기존 17개 build*Slide 메서드를 전면 교체.
 * imlib.ts 컴포넌트 + 아키타입 레지스트리 + 덱 시퀀서로 동작.
 */
import PptxGenJS from 'pptxgenjs';
import { getPptxTheme, getPptxThemeAsync, DEFAULT_PPTX_PRESET, type PptxThemeTokens, type ThemePresetDbReader } from './pptx-theme';
import { SLIDE_ARCHETYPE_REGISTRY, type ArchetypeInput } from './archetypes';
import { buildDeckSequence, buildProDeckSequence, type DeckSequenceInput, type SlideSpec, type IncomeArchetype } from './deck-sequencer';
import { BASIC_IM_EXCLUSION, BASIC_IM_ALLOWED } from './basic-im-contract';
import { bindSectionData } from './data-binder';
import { validateTextBudgets } from './text-budget';
import type { ProvenanceKind } from './imlib';
import type { InvestmentPosture } from '@/domain/ontology';
import { resolvePhotos } from '../photo-url-transformer';
import { planGallerySlides, GALLERY_EXCLUDE_CATEGORIES, type GallerySlideSpec } from './gallery-planner';
import {
  BROKER_IMAGE_CATEGORIES,
  applyBrokerLocation,
  applyBrokerRentRollPlan,
  buildBrokerExtrasDataMap,
  deriveBrokerAvailability,
  extractBrokerImages,
  readBrokerExtras,
} from './broker-extras-slides';

import { M, CW, KR, NUM, C, setActiveTheme, withThemeIsolation } from './imlib';
import { validateLayout } from './layout-validator';
import { validateYield, type Yield } from './yield-object';
import { buildYieldSetFromBody } from '../yield-set';
import { summarizeLeaseOccupancy } from '../lease-vacancy';
import { addFallbackContent, resetFallbackTracker, parseInlineMarkdown } from './pptx-markdown-fallback';
import { sqmToPyeong, formatPyeong } from '@/lib/utils/area-conversion';
import { collectBrokerMentionTexts } from './utils/broker-mention-texts';
import { resolvePhysicalSpecs } from '../resolve-physical-specs';
import { summarizeParcels, withParcelCountSuffix } from '../parcel-input';
import { resolveBrokerMemoFacts } from './binder/broker-memo-facts';
import { buildSummaryHighlights, extractSummaryFacts, isBoilerplateHighlight } from './summary-highlights';
import { resolveOverviewSpecs, buildOverviewSpecRows, isMissingSpecValue } from './spec-resolver';
import { brokerMemoTextOf, parseBuildingSpecMemoFacts } from './binder/broker-memo-facts';
import { normalizeAreaRowsPrecision } from './binder/area-precision';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('pptx-renderer');


export { resetFallbackTracker, addFallbackContent, parseInlineMarkdown };

export interface MobileImPptxInput {
  buildingId: string;
  preset?: string;
  posture?: InvestmentPosture;
  grade?: 'A' | 'B' | 'C' | 'D';
  incomeArchetype?: IncomeArchetype;
  hasViolation?: boolean;
  hasJointCollateral?: boolean;
  docno?: string;
  doc: {
    title?: string;
    body: Record<string, any>;
    sections?: Array<{
      title: string;
      markdown: string;
      confidence?: string;
      boundary_note?: string;
      section_type?: string;
    }>;
  };
  building?: {
    area_signal?: string;
    asset_type?: string;
    price_band?: string;
    owner_id?: string;
    [key: string]: any;
  };
  broker?: {
    display_name?: string;
    company_name?: string;
    phone?: string;
    specialty?: string;
    email?: string;
    registration_no?: string;
  };
  watermark?: {
    requesterName: string;
    phoneLast4: string;
    timestamp: string;
  };
  provenance?: Record<string, ProvenanceKind>;
  supabase?: ThemePresetDbReader;
  logoUrl?: string;  // Phase 4: 중개법인 로고 URL (Supabase Storage)
  /** V5 감사 §5.1 시정: 게이트 차단 시 경고 워터마크 표시 */
  publishBlocked?: boolean;
  publishBlockReasons?: string[];
  /** D37 C-3: 5종 발행 등급 */
  releaseTier?: import('../../im-core/release-tier').ReleaseTier;
  core?: any;
  /** Pro IM 발행 모드 (30+ 슬라이드, 5대 핵심 챕터) */
  isPro?: boolean;
  proMode?: boolean;
  /** 입지도 랜드마크 풀 오프라인 픽스처 (렌더 경로 전용, LLM 프롬프트와 무관) */
  landmarkPoolFixture?: import('@/lib/external/landmark-pool').LandmarkPool | null;
}

export interface MobileImPptxOutput {
  buffer: Buffer;
  slideCount: number;
  fileSizeBytes: number;
  generatedAt: string;
  warnings: string[];
  /** D35 §4: 셀프 검증 감사 리포트 — 렌더 후 파서로 산출물 자체 검증 */
  auditReport?: {
    layoutViolations: string[];
    standardViolations: string[];
    totalViolations: number;
    imageCount: number;
    textCount: number;
    gateContext: Record<string, unknown>;
  };
}

export class MobileImPptxRenderer {
  async render(input: MobileImPptxInput): Promise<MobileImPptxOutput> {
    // D-03: 구형 PPTX 렌더러 직접 호출 차단 가드 (PPTX Studio 전환 시 활성화)
    if (process.env.DEPRECATE_LEGACY_WRITES === 'true') {
      throw new Error(
        'LEGACY_PPTX_RENDERER_DEPRECATED: 구형 MobileImPptxRenderer.render()는 폐기되었습니다. ' +
        'PPTX Studio API(/api/broker/pptx-studio/projects)를 통해 독립 프로젝트를 생성하십시오.'
      );
    }
    const warnings: string[] = [];
    resetFallbackTracker(); // D33 BL-F: 렌더 시작 시 폴백 중복 추적기 초기화

    // 골디락스: D등급 전면 차단 (tier 무관)
    if (input.grade === 'D') {
      throw new Error('[G30] D등급은 IM을 발행할 수 없습니다. 데이터를 보강해주세요.');
    }

    const pres = new PptxGenJS();
    // §2 — 반드시 슬라이드 추가 전에 설정
    pres.layout = 'LAYOUT_WIDE';

    const theme: PptxThemeTokens = await getPptxThemeAsync(
      input.preset ?? DEFAULT_PPTX_PRESET,
      input.supabase
    );

    // G5: 커스텀 프리셋의 logo_url을 input.logoUrl에 폴백 머지
    const resolvedLogoUrl = input.logoUrl ?? theme.logoUrl;
    if (resolvedLogoUrl && !input.logoUrl) {
      input = { ...input, logoUrl: resolvedLogoUrl };
    }

    // ★ 핵심: 테마 토큰을 C/CD/KR에 주입 — 이후 모든 아키타입이 프리셋 색상 사용
    return await withThemeIsolation(theme, async () => {
    try {
      // ── 0. 사진 메타 도출 및 갤러리 플래닝 (v0.6.0) ──
      const posture = (input.posture ?? 'income') as InvestmentPosture;
      const resolvedPhotos = resolvePhotos(input.doc.body, input.buildingId);
      const gallerySpecs = planGallerySlides(resolvedPhotos, posture, theme.presetId);
      // D4: 위치도/지구단위계획도/도면은 문서 이미지 — 대표·외관 사진 후보에서 제외 (전용 면으로 렌더)
      const realPhotos = resolvedPhotos.filter(p => !BROKER_IMAGE_CATEGORIES.has(String(p.category || (p as any).type || '').toLowerCase()));
      // role 기반 이미지 선택 (사용자 지정 → isHero → 첫 번째)
      const heroPhoto = realPhotos.find(p => p.role === 'cover')
        || realPhotos.find(p => p.isHero)
        || realPhotos[0];
      const exteriorPhoto = realPhotos.find(p => p.role === 'exterior')
        || realPhotos.find(p => p.category === 'exterior' || p.type === 'exterior')
        || heroPhoto;

      // ── 1. 덱 시퀀스 결정 ──
      let enrichment = input.doc.body?.enrichment ?? {} as any;

      // D45: 좌표 있지만 지적도 또는 공시지가 미제공 시 자동 enrichment (프로덕션 폴백)
      const coords = input.doc.body?.coordinates 
        ?? input.doc.body?.ssot_summary?.coordinates
        ?? (input.building?.lat && input.building?.lng ? { lat: Number(input.building.lat), lng: Number(input.building.lng) } : undefined);
      // 다필지: handler 단계의 지적도는 대표 PNU 1개만 하이라이트하므로, 2필지 이상이면 전 필지 기준으로 재생성한다.
      const multiPnus: string[] = (input.doc.body?.ssot_summary?.pnus ?? input.doc.body?.pnus ?? []) as string[];
      const isMultiParcelDeck = Array.isArray(multiPnus) && multiPnus.filter(Boolean).length > 1;
      if (coords?.lat && coords?.lng && (!enrichment.cadastralMapImage || !enrichment.landPriceHistory || isMultiParcelDeck)) {
        try {
          const { enrichForBasicIm } = await import('./basic-im-enrichment');
          const pnu = input.doc.body?.ssot_summary?.pnu
            ?? input.doc.body?.pnu
            ?? input.building?.pnu;
          const pnus = input.doc.body?.ssot_summary?.pnus
            ?? input.doc.body?.pnus;
          const autoEnrichment = await enrichForBasicIm(coords, {
            pnu,
            pnus,
            address: input.doc.body?.ssot_summary?.address ?? input.building?.address,
            landAreaSqm: Number(input.doc.body?.ssot_summary?.land_area_sqm ?? input.building?.land_area_sqm ?? 0),
            posture,
            assetType: input.building?.asset_type ?? input.doc.body?.ssot_summary?.asset_type,
            landmarkPoolFixture: input.landmarkPoolFixture ?? null,
          });
          enrichment = {
            ...enrichment,
            ...autoEnrichment,
            cadastralMapImage: isMultiParcelDeck
              ? (autoEnrichment.cadastralMapImage || enrichment.cadastralMapImage)
              : (enrichment.cadastralMapImage || autoEnrichment.cadastralMapImage),
            landPriceHistory: enrichment.landPriceHistory || autoEnrichment.landPriceHistory,
            // auto 결과의 null 이 handler 단계의 유효 값을 덮어쓰지 않도록 보호
            locationPoi: autoEnrichment.locationPoi ?? enrichment.locationPoi,
            landUsePlan: enrichment.landUsePlan ?? autoEnrichment.landUsePlan,
          };
        } catch (err) {
          // Graceful degradation: enrichment 실패 시 기존 데이터로 진행 (Rule 43)
          console.warn('[pptx-renderer] Auto-enrichment failed (graceful skip):', err);
        }
      }
      const externalData = input.doc.body?.external_data ?? {};
      const sequenceInput: DeckSequenceInput = {
        posture,
        grade: (input.grade ?? 'B') as 'A' | 'B' | 'C',
        incomeArchetype: input.incomeArchetype,
        hasViolation: input.hasViolation,
        hasJointCollateral: input.hasJointCollateral,
        hasPhotos: realPhotos.length > 0,
        gallerySpecs,
        dataAvailability: {
          hasLandUsePlan: !!(enrichment.landUsePlan ?? externalData.hasPublicData ?? input.doc.body?.ssot_summary?.land_area_sqm),
          hasLandPrice: !!(enrichment.landPrice),
          hasBuildingRegister: !!(enrichment.buildingRegister ?? externalData.hasPublicData ?? input.doc.body?.ssot_summary?.total_gross_area_sqm ?? input.doc.body?.ssot_summary?.size_signal),
          hasRegistryData: !!(enrichment.registryData),
          hasComparables: (enrichment.comparableTransactions?.length ?? 0) > 0 || (input.doc.body?.manual_comps?.length ?? 0) > 0,
          hasCommercialDistrict: !!(enrichment.commercialDistrict),
          hasCadastralMap: !!(enrichment.cadastralMapImage),
          hasFloorPlan: false,
          hasRentRoll: !!(
            input.doc.body?.floor_leases?.length 
            || input.doc.body?.ssot_summary?.monthly_rent_total_krw
            || input.doc.body?.ssot_summary?.total_deposit_manwon
            || input.doc.sections?.some((s: any) => s.section_type === 'lease_status')
          ),
          hasStackingPlan: !!(input.doc.body?.floor_leases?.length || input.doc.body?.stackingPlan?.length),
          // D4/D8: 중개인 제공 정보 면 (body.broker_extras + photos_v2 문서 이미지) — 입력 없으면 모두 false
          ...deriveBrokerAvailability(input.doc.body),
        },
        // D37 C-3: ReleaseTier 전달 → tier 기반 면 제어 활성화
        releaseTier: input.releaseTier,
        // Basic IM 전용 슬라이드 편성 (A23 산식 등)
        preset: theme.presetId,
        isPro: input.isPro || input.proMode || (input.releaseTier as string) === 'pro',
      };

      // Basic IM preset이면 모든 포스처에서 Basic 시퀀스 강제 (trading/owner_occupied 포함)
      const isBasicForced = theme.presetId === 'credeal_basic';
      const isProDeck = !isBasicForced && (input.isPro || input.proMode || input.preset === 'credeal_pro' || (input.releaseTier as string) === 'pro');
      if (isBasicForced) {
        sequenceInput.isPro = false;
      }
      let sequence: SlideSpec[] = isProDeck
        ? buildProDeckSequence(sequenceInput)
        : buildDeckSequence(sequenceInput);

      if (sequence.length === 0) {
        throw new Error('덱 시퀀스가 비어 있습니다. posture/grade 설정을 확인하세요.');
      }

      // ── 2. 섹션 데이터 바인딩 ──
      // RENDER_PATH 환경변수에 따라 IMCore 직접 바인딩 또는 레거시 마크다운 파싱 분기
      const renderPath = process.env.RENDER_PATH ?? 'legacy_md';
      let dataMap: Record<string, import('./data-binder').SectionData>;

      if (renderPath === 'imcore' && input.core) {
        // Phase 2-3: IMCore 정형 객체 직접 바인딩 (마크다운 파싱 우회)
        const { bindFromIMCore } = await import('./data-binder');
        dataMap = bindFromIMCore(input.core, undefined, input.doc?.body);
      } else {
        // 레거시: 마크다운 파싱 기반 바인딩
        const normalizedDoc = {
          ...input.doc,
          sections: input.doc.sections ?? input.doc.body?.sections ?? [],
        };
        dataMap = bindSectionData(normalizedDoc, input.building, input.preset);
      }

      // cover/closing 데이터 보강
      const companyName = input.broker?.company_name ?? '';
      const docno = input.docno ?? '';

      // Basic IM 프리셋: 표지 건물 사진 차단 → 추상 기하학 커버 자동 적용 (basic-im-guide.md §2 #1)
      const isBasicPreset = theme.presetId === 'credeal_basic';

      // S9: Basic IM 프리셋 혼입 방지 가드 (basic-im-contract.ts §3)
      if (isBasicPreset) {
        const forbidden: Set<string> = new Set(BASIC_IM_EXCLUSION);
        const violations = sequence.filter(s => forbidden.has(s.archetype));
        if (violations.length > 0) {
          log.error(`[G-BASIC] Basic IM에 금지 아키타입 혼입: ${violations.map(v => v.archetype).join(', ')}`);
          // 금지 아키타입을 시퀀스에서 자동 제거 (하드 에러 대신 방어적 제거)
          sequence = sequence.filter(s => !forbidden.has(s.archetype));
        }
        // B8 Fix: Allowlist 기반 2차 방어 — 허용 목록에 없는 아키타입도 제거
        const allowlistViolations = sequence.filter(s => !BASIC_IM_ALLOWED.has(s.archetype as any));
        if (allowlistViolations.length > 0) {
          log.warn(`[G-BASIC] Basic IM Allowlist 위반 제거: ${allowlistViolations.map(v => v.archetype).join(', ')}`);
          sequence = sequence.filter(s => BASIC_IM_ALLOWED.has(s.archetype as any));
        }
      }

      dataMap['cover'] = {
        title: input.doc.title ?? '',
        content: '',
        tables: [],
        metrics: {},
        subtitle: input.building?.asset_type ?? '',
        assetType: input.building?.asset_type ?? '',
        priceBand: input.building?.price_band ?? '',
        areaSignal: input.building?.area_signal ?? '',
        brokerName: input.broker?.display_name ?? '',
        companyName,
        tags: [input.building?.asset_type, input.building?.price_band].filter(Boolean) as string[],
        docno,
        logoUrl: input.logoUrl,
        coverImageUrl: isBasicPreset ? null : (heroPhoto?.url
          ?? input.doc.body?.photo_urls?.[0]
          ?? input.doc.body?.photos?.[0]?.url
          ?? null),
      };

      // Basic IM 표지 필수 4요소 바인딩 (basic-im-guide.md §2 #1)
      if (isBasicPreset) {
        const ssotCover = input.doc.body?.ssot_summary ?? {};
        dataMap['cover'].address = ssotCover.address ?? input.doc.body?.resolved_address ?? '';
        const rawCoverAsk = Number(ssotCover.asking_price_manwon);
        const safeCoverAsk = (Number.isFinite(rawCoverAsk) && rawCoverAsk > 0)
          ? `${Number((rawCoverAsk / 10000).toFixed(2))}억 원`
          : (ssotCover.price_band && !String(ssotCover.price_band).includes('Infinity') ? ssotCover.price_band : '');
        dataMap['cover'].askingPrice = safeCoverAsk;
        dataMap['cover'].documentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
      }

      // ── Basic IM 물건 개요 (building) 슬라이드 데이터 보강 ──
      // D07: LLM이 building 섹션을 생성하더라도 스펙이 불완전할 수 있으므로
      // enrichment/SSoT/건축물대장에서 11대 제원을 항상 구성하고 누락분을 병합
      if (isBasicPreset) {
        const ssot = input.doc.body?.ssot_summary ?? {};
        const bldg = input.building ?? {};
        const br = enrichment?.buildingRegister ?? {};
        const heroCard = input.doc.body?.heroCard ?? {};

        // 면적 포맷 헬퍼
        const fmtArea = (sqm: number | string | undefined) => {
          const v = Number(sqm);
          if (!v || isNaN(v) || !Number.isFinite(v) || v <= 0) return '-';
          return `${v.toLocaleString()}㎡ (${formatPyeong(v, 1)}평)`;
        };

        // D5: 대장(bcRat/vlRat/useAprDay/floorsAbove…) > 토지이용계획(용도지역·법정 상한) > ssot 폴백을 단일 리졸버로 처리
        const overviewSpecs = resolveOverviewSpecs(
          enrichment, ssot, heroCard, input.doc.body?.parcels,
          // 대장/SSoT 가 비어 있을 때만 중개인 메모 명시 층수·준공연도로 폴백 (● 중개인입력 라벨 병기)
          { building: bldg, core: input.core?.physical, memo: parseBuildingSpecMemoFacts(brokerMemoTextOf(input.doc.body, bldg)) },
        );
        const overviewSpecRows = buildOverviewSpecRows(overviewSpecs);
        const specHeadRows = overviewSpecRows.filter(([k]) => k !== '주용도' && k !== '주구조');
        const specTailRows = overviewSpecRows.filter(([k]) => k === '주용도' || k === '주구조');

        const enrichedRows: [string, string][] = [
          ['소재지', (() => {
            const addr = ssot.address || bldg.address || heroCard.address || '-';
            const cnt = Number(ssot.parcel_count ?? (Array.isArray(input.doc.body?.parcels) ? input.doc.body.parcels.length : 0));
            return addr === '-' ? addr : withParcelCountSuffix(String(addr), cnt);
          })()],
          ['대지면적', fmtArea(ssot.land_area_sqm || br.platArea || heroCard.landAreaM2 || bldg.land_area_sqm)],
          ['지목', ssot.land_category || br.jimok || '-'],
          ['건축면적', fmtArea(overviewSpecs.archArea)],
          ['연면적', fmtArea(ssot.total_gross_area_sqm || heroCard.totalGrossAreaSqm || bldg.total_area_sqm)],
          ...specHeadRows, // 용도지역 / 건폐율·용적률(현황+법정) / 사용승인일 / 층수 (알 수 없으면 행 생략)
          ['주차 / 승강기', (() => {
            // D4: 건축물대장(br) 값 우선 → 기존 SSoT/hero/bldg 체인 → 중개인 입력(fallback). 전부 없으면 undefined → '-'
            const brokerSpecs = input.doc.body?.broker_physical_inputs;
            const resolvedSpecs = resolvePhysicalSpecs({
              register: {
                parkingCount: br.parkingCount || ssot.parking_count || heroCard.parkingCount || bldg.parking_count || br.parkingCnt,
                elevatorCount: br.elevatorCount || ssot.elevator_count || heroCard.elevatorCount || bldg.elevator_count || br.rideUseLiftCnt,
              },
              broker: { parkingCount: brokerSpecs?.parking_count, elevatorCount: brokerSpecs?.elevator_count },
            });
            const park = resolvedSpecs.parkingCount;
            const elev = resolvedSpecs.elevatorCount;
            if (!park && !elev) return '-'; // 둘 다 부재 → 행 제거 ('-대 / -대' 방지, Rule 37)
            return `${park ? `${park}대` : '-'} / ${elev ? `${elev}대` : '-'}`;
          })()],
          ...specTailRows, // 주용도 / 주구조 (알 수 없으면 행 생략)
        ].filter(([, v]) => !isMissingSpecValue(v)) as [string, string][]; // 값이 없는 행 제거 ('-' / '확인 필요' 행은 출력하지 않음)

        if (!dataMap['building']) {
          // LLM이 building 섹션을 생성하지 않은 경우: 전체 신규 생성
          dataMap['building'] = {
            title: '물건 개요',
            content: '',
            tables: [],
            metrics: {},
            left: {
              sub: '건축물대장·토지이용계획확인서 기준',
              rows: enrichedRows,
            },
          };
        } else if (dataMap['building'].left?.rows) {
          // LLM이 building 섹션을 생성한 경우: 누락 스펙 병합
          const specGroup = (k: string): string => {
            const c = String(k).replace(/\s+/g, '');
            if (/준공|사용승인|건축연도/.test(c)) return '#준공';
            if (/용도지역|지역\/지구|지역지구/.test(c)) return '#용도지역';
            if (/건폐율|용적률/.test(c)) return '#건폐용적';
            if (/층수|건축규모/.test(c)) return '#층수';
            if (/주차|승강기|엘리베이터/.test(c)) return '#주차승강기';
            if (/^주용도|^주요용도|^용도$/.test(c)) return '#주용도';
            if (/^주구조|^건물구조|^구조$/.test(c)) return '#주구조';
            return c;
          };
          // D5: LLM 표의 '-' / 공란 / '확인 필요' 행은 값이 없는 행이므로 제거 (실값 병합을 막거나 '-' 행으로 남지 않도록)
          dataMap['building'].left.rows = dataMap['building'].left.rows.filter(
            (r: [string, string]) => !isMissingSpecValue(r?.[1]),
          );
          // Rule 4: 같은 제원이 다른 라벨(예: 건축연도(사용승인일) vs 준공시점)로 이중 렌더되지 않도록 그룹 단위로 중복 제거
          // D5: 기존 값이 유효하면 LLM 값 유지, 없으면 공부(리졸버) 값 추가. 건폐율/용적률은 현황치 2개가 모두 있는 경우에만 LLM 행을 유지.
          const existingGroupRows = (g: string) =>
            (dataMap['building'].left.rows as [string, string][]).filter(([k]) => specGroup(k) === g);
          for (const [key, val] of enrichedRows) {
            const g = specGroup(key);
            const existing = existingGroupRows(g);
            if (g === '#건폐용적' && existing.length > 0) {
              const joined = existing.map(([k, v]) => `${k}:${v}`).join('|').replace(/\s+/g, '');
              const llmComplete = (/건폐율/.test(joined) && /용적률/.test(joined)) || (existing.length === 1 && /\d\s*%?\s*\/\s*\d/.test(String(existing[0][1])));
              if (llmComplete) continue;
              // 불완전한 LLM 행(한쪽만 있는 경우)은 공부 값으로 교체
              dataMap['building'].left.rows = (dataMap['building'].left.rows as [string, string][]).filter(([k]) => specGroup(k) !== g);
            }
            if (existingGroupRows(g).length === 0) {
              dataMap['building'].left.rows.push([key, val]);
            }
          }
          // a04 가 right.rows 를 left 와 통합 렌더하므로, 값 없는 행/이미 left 에 있는 제원 그룹은 right 에서도 제거
          if (Array.isArray(dataMap['building'].right?.rows)) {
            const leftGroups = new Set((dataMap['building'].left.rows as [string, string][]).map(([k]) => specGroup(k)));
            dataMap['building'].right.rows = dataMap['building'].right.rows.filter((r: any) => {
              if (!Array.isArray(r) || r.length < 2) return true;
              if (isMissingSpecValue(r[1])) return false;
              const g = specGroup(String(r[0] ?? ''));
              return !(g.startsWith('#') && leftGroups.has(g));
            });
          }
          // Rule 4: 제원 표에는 제원만 — LLM 이 '**자산 하이라이트**: • …' 같은 서술형 항목을 key-value 로 써서
          // 좌측 표에 하이라이트가 한 번 더(말줄임 포함) 렌더되던 문제 제거. 하이라이트는 우측 박스가 정본.
          {
            const isNarrativeSpecRow = ([k, v]: [string, string]) => {
              const key = String(k ?? '').replace(/\s+/g, '');
              if (/하이라이트|투자포인트|핵심포인트|요약|특장점|강점|투자매력/.test(key)) return true;
              const val = String(v ?? '').trim();
              return val.startsWith('•') || (val.match(/•/g) ?? []).length >= 2;
            };
            dataMap['building'].left.rows = dataMap['building'].left.rows.filter((r: [string, string]) => !isNarrativeSpecRow(r));
          }

          // 소재지는 SSoT 주소(다필지 표기 포함)를 정본으로 하고 항상 첫 행에 둔다 (LLM 이 도로명 주소 등으로 바꿔 쓰는 것 방지)
          {
            const rows: any[] = dataMap['building'].left.rows;
            const ssotAddr = enrichedRows.find(([k]) => k === '소재지')?.[1];
            const addrIdx = rows.findIndex((r: any[]) => String(r?.[0] ?? '').replace(/\s+/g, '') === '소재지');
            if (addrIdx >= 0) {
              if (ssotAddr && ssotAddr !== '-') rows[addrIdx] = [rows[addrIdx][0], ssotAddr];
              if (addrIdx > 0) rows.unshift(rows.splice(addrIdx, 1)[0]);
            }
          }
        } else {
          // left.rows가 없는 경우: enrichment rows로 대체
          dataMap['building'].left = {
            sub: '건축물대장·토지이용계획확인서 기준',
            rows: enrichedRows,
          };
        }
      }

      if (dataMap['building']) {
        const ssotBldg = input.doc.body?.ssot_summary ?? {};
        
        // Phase 2: 포스처별 표준 제원 보강 — 누락 필드 자동 추가
        if (dataMap['building'].left && Array.isArray(dataMap['building'].left.rows)) {
          const bldgRows = dataMap['building'].left.rows;
          const existingLabels = new Set(bldgRows.map((r: [string, string]) => r[0]));
          const ssotEx = input.doc.body?.ssot_summary ?? {};
          const bldg = input.building ?? {};

          // 건축면적
          if (!existingLabels.has('건축면적') && (ssotEx.arch_area_sqm || bldg.arch_area_sqm)) {
            const archM2 = Number(ssotEx.arch_area_sqm || bldg.arch_area_sqm);
            if (Number.isFinite(archM2) && archM2 > 0) {
              const archPy = (archM2 * 0.3025).toFixed(1);
              bldgRows.push(['건축면적', `${archM2.toLocaleString()}㎡ (${archPy}평)`]);
            }
          }

          // 건폐율/용적률
          if (!existingLabels.has('건폐율') && !existingLabels.has('건폐율/용적률') && !existingLabels.has('건폐율 / 용적률')) {
            const bcr = Number(ssotEx.bcr_pct ?? bldg.bcr_pct);
            const far = Number(ssotEx.far_pct ?? bldg.far_pct);
            if (Number.isFinite(bcr) && Number.isFinite(far) && bcr > 0 && far > 0) {
              let bcrFarStr = `${bcr}% / ${far}%`;
              const maxBcr = Number(ssotEx.max_bcr_pct);
              const maxFar = Number(ssotEx.max_far_pct);
              if (Number.isFinite(maxBcr) && Number.isFinite(maxFar)) {
                bcrFarStr += ` (법정 ${maxBcr}% / ${maxFar}%)`;
              }
              bldgRows.push(['건폐율 / 용적률', bcrFarStr]);
            }
          }

          // 지목
          if (!existingLabels.has('지목') && ssotEx.land_category) {
            bldgRows.push(['지목', String(ssotEx.land_category)]);
          }

          // 주차 상세
          if (!existingLabels.has('주차') && !existingLabels.has('주차대수') && ssotEx.parking_detail) {
            bldgRows.push(['주차', String(ssotEx.parking_detail)]);
          }

          // 도로조건
          if (!existingLabels.has('도로조건') && !existingLabels.has('접면도로') && (ssotEx.road_condition || bldg.road_condition)) {
            bldgRows.push(['도로조건', String(ssotEx.road_condition || bldg.road_condition)]);
          }
        }

        const rawAskManwon = Number(ssotBldg.asking_price_manwon ?? input.doc.body?.asking_price_manwon ?? 0);
        const askManwon = Number.isFinite(rawAskManwon) && rawAskManwon > 0 ? rawAskManwon : 0;
        const askFmt = (v: number) => Number.isFinite(v) && v >= 10000
          ? `${(v / 10000).toLocaleString()}억 원`
          : (Number.isFinite(v) && v > 0) ? `${v.toLocaleString()}만원` : '';
        const rawHeroAsk = input.doc.body?.heroCard?.askingPriceDisplay ?? input.doc.body?.askingPrice ?? '';
        const safeHeroAsk = typeof rawHeroAsk === 'string' && !rawHeroAsk.includes('Infinity') && !rawHeroAsk.includes('NaN') ? rawHeroAsk : '';
        const askStr = askFmt(askManwon) || safeHeroAsk;

        // 매각가 테이블 (하단 별도 표)
        if (askStr) {
          dataMap['building'].priceTable = {
            label: '매매 희망가',
            value: `${askStr} (VAT 별도)`,
          };

          // 토지평당가 추가
          const rawLandPy = Number(ssotBldg.land_area_pyeong || 0);
          const rawLandSqm = Number(ssotBldg.land_area_sqm || 0);
          const landPy = (Number.isFinite(rawLandPy) && rawLandPy > 0)
            ? rawLandPy
            : (Number.isFinite(rawLandSqm) && rawLandSqm > 0 ? sqmToPyeong(rawLandSqm) : 0);
          if (Number.isFinite(landPy) && landPy > 0 && Number.isFinite(askManwon) && askManwon > 0) {
            const unitPrice = Math.round(askManwon / landPy);
            // Rule 34: 중개인이 메모에 명시한 토지평당가가 있으면 계산값보다 우선(두 숫자 동시 표기 금지) — 출처 라벨 병기
            const statedLandPrice = resolveBrokerMemoFacts(input.doc.body, input.building).development.landPricePerPyeongManwon;
            if (statedLandPrice) {
              dataMap['building'].priceTable2 = {
                label: '토지평당가',
                value: `약 ${statedLandPrice.toLocaleString()}만 원/평 (중개인 제시)`,
              };
            } else if (Number.isFinite(unitPrice) && unitPrice > 0) {
              dataMap['building'].priceTable2 = {
                label: '토지평당가',
                value: `약 ${unitPrice.toLocaleString()}만 원/평`,
              };
            }
          }
        }
      }

      // ── 2-1. V-World / 공공 API 구조화 데이터 직접 바인딩 ──
      if (Object.keys(enrichment).length > 0) {
        const { bindFromExternalData } = await import('./data-binder');
        bindFromExternalData(enrichment, dataMap, input.doc.body);
      }

      if (!dataMap['location']) {
        const locAddress = input.doc.body?.ssot_summary?.address ?? input.doc.body?.resolved_address ?? input.doc.body?.address ?? '';
        const locRoad = input.doc.body?.ssot_summary?.road_condition ?? '';
        const locArea = input.building?.area_signal ?? input.doc.body?.ssot_summary?.area_signal ?? '';

        // G-04: locationPoi가 있으면 구체적 역명+도보시간 사용, 없으면 ssot/일반 폴백
        const poiData = enrichment?.locationPoi;
        let locTransit: string;
        if (poiData?.nearestStation?.name && !poiData._isFallback) {
          const sName = poiData.nearestStation.name.replace(/역$/, '') + '역';
          const wMin = poiData.nearestStation.walkMinutes ?? Math.max(1, Math.round((poiData.nearestStation.distanceM ?? 400) / 80));
          const dM = poiData.nearestStation.distanceM;
          locTransit = `${sName} 도보 ${wMin}분` + (dM ? ` (약 ${dM}m)` : '');
        } else {
          const locWalk = input.doc.body?.ssot_summary?.station_walk_min;
          locTransit = locWalk ? `지하철역 도보 ${locWalk}분 역세권` : '지하철 및 간선버스 인접';
        }

        const locRows: [string, string][] = [
          ['소재지', locAddress || '본건 소재지'],
          ['접면도로', locRoad],
          ['대중교통', locTransit],
          ['권역특성', `${locArea ? locArea + ' 주요 상업·업무 권역' : '본건 소재지 주변'}`],
        ];

        // G-04: 주요 랜드마크(역 제외) 행 추가
        if (poiData?.keySpots && !poiData._isFallback) {
          const landmarks = poiData.keySpots
            .filter((s: any) => s.category !== 'subway' && s.name && s.distanceM)
            .slice(0, 2);
          for (const lm of landmarks) {
            const lmWalk = Math.max(1, Math.round(lm.distanceM / 80));
            const catLabels: Record<string, string> = { hospital: '의료시설', university: '교육시설', shopping: '상업시설', landmark: '주요시설' };
            locRows.push([catLabels[lm.category] || '주요시설', `${lm.name} 도보 ${lmWalk}분 (약 ${lm.distanceM}m)`]);
          }
        }

        dataMap['location'] = {
          title: '입지 분석',
          kicker: 'Location',
          content: '',
          tables: [],
          metrics: {},
          left: {
            sub: locArea,
            source: '© 카카오맵 · 국토교통부 공간정보',
          },
          right: {
            sub: '광역 교통망 및 접근성',
            rows: locRows.slice(0, 6),
          },
        };
      }

      if (dataMap['location']) {
        dataMap['location'].coordinates = input.doc.body?.coordinates ?? null;
        dataMap['location'].mapImageUrl = input.doc.body?.mapImageUrl ?? null;
        dataMap['location'].address = input.doc.body?.ssot_summary?.address ?? input.doc.body?.resolved_address ?? input.doc.body?.address;
        dataMap['location'].areaSignal = input.building?.area_signal ?? input.doc.body?.ssot_summary?.area_signal ?? input.doc.body?.areaSignal;
        // POI 주요 스폿 (역, 상권 랜드마크) — 지도 마커 오버레이용
        const externalPoi = enrichment?.locationPoi ?? input.doc.body?.external_data?.locationPoi ?? input.doc.body?.enrichment?.locationPoi;
        dataMap['location'].poiSpots = externalPoi?.keySpots ?? input.doc.body?.poiSpots ?? [];
        // 입지 POI 정밀 선별(location-poi-selector)용: 실조회 후보 풀 + 포스처/자산유형
        dataMap['location'].poiCandidates = externalPoi?.candidateSpots ?? null;
        // 랜드마크 풀(렌더 경로 전용): enrichment 가 이미 풀을 갖고 있으면 재사용, 없으면 해석(캐시/픽스처/라이브). 실패 시 레거시 후보로 폴백.
        try {
          const locCoords = input.doc.body?.coordinates ?? input.doc.body?.ssot_summary?.coordinates;
          let lmPool = (enrichment as any)?.landmarkPool ?? null;
          if (!lmPool && locCoords?.lat && locCoords?.lng) {
            const { resolveLandmarkPool } = await import('@/lib/external/landmark-pool');
            lmPool = await resolveLandmarkPool(
              { lat: Number(locCoords.lat), lng: Number(locCoords.lng) },
              {
                posture,
                assetType: input.building?.asset_type ?? input.doc.body?.ssot_summary?.asset_type ?? null,
                fixture: input.landmarkPoolFixture ?? null,
              },
            );
          }
          if (lmPool?.candidates?.length) {
            dataMap['location'].poiCandidates = lmPool.candidates;
          }
        } catch (err) {
          log.warn('[pptx-renderer] landmark pool skipped (graceful)', err);
        }
        dataMap['location'].posture = posture;
        dataMap['location'].assetType = input.building?.asset_type ?? input.doc.body?.ssot_summary?.asset_type ?? null;
        // 중개인 실입력 원문(메모·입지 설명·소재지)에 언급된 대형 기관은 지도에서 누락하지 않는다 (렌더 전용 — LLM 프롬프트 무관)
        dataMap['location'].mentionTexts = collectBrokerMentionTexts(input.building, input.doc.body);

        // D8: 우측 입지 조건 구조화 행 — ssot/POI 데이터에서 동적 생성 (하드코딩 금지)
        const ssot = input.doc.body?.ssot_summary ?? {};
        const locRows: Array<[string, string]> = [];
        const locAddress = input.doc.body?.ssot_summary?.address ?? input.doc.body?.resolved_address ?? input.doc.body?.address ?? '';
        if (locAddress) {
          locRows.push(['소재지', locAddress]);
        }
        const nearestSt = externalPoi?.nearestStation;
        if (nearestSt?.name) {
          locRows.push(['대중교통', `${nearestSt.name} 도보 ${nearestSt.walkMinutes ?? Math.round((nearestSt.distanceM ?? 400) / 80)}분 (약 ${nearestSt.distanceM ?? ''}m)`]);
        } else if (ssot.station_walk_min) {
          locRows.push(['대중교통', `지하철역 도보 ${ssot.station_walk_min}분 역세권`]);
        } else {
          locRows.push(['대중교통', '지하철 및 간선버스 인접']);
        }

        const road = ssot.road_condition ?? input.building?.road_condition;
        if (road) {
          locRows.push(['도로접면', String(road)]);
        }

        const area = input.building?.area_signal ?? ssot.area_signal ?? '';
        if (area) {
          locRows.push(['상권권역', `${area} 주요 상업·업무 권역`]);
        }

        // 비지하철 랜드마크 행 추가
        if (externalPoi?.keySpots && !externalPoi._isFallback) {
          const landmarks = externalPoi.keySpots
            .filter((s: any) => s.category !== 'subway' && s.name && s.distanceM)
            .slice(0, 2);
          for (const lm of landmarks) {
            const lmWalk = Math.max(1, Math.round(lm.distanceM / 80));
            const catLabels: Record<string, string> = { hospital: '의료시설', university: '교육시설', shopping: '상업시설', landmark: '주요시설', public: '공공기관' };
            locRows.push([catLabels[lm.category] || '주요시설', `${lm.name} 도보 ${lmWalk}분 (약 ${lm.distanceM}m)`]);
          }
        }

        if (!dataMap['location'].right) dataMap['location'].right = { sub: '입지 및 접근성 분석' };
        dataMap['location'].right.rows = locRows.slice(0, 6);

        // 입지 종합 분석 callout — 동적 데이터에서 생성 (하드코딩 금지)
        const calloutBullets: string[] = [];
        if (nearestSt?.name) {
          calloutBullets.push(`• ${nearestSt.name} 도보 역세권으로 양호한 대중교통 접근성`);
        }
        if (road) {
          calloutBullets.push(`• ${road} 접면 차량 진출입 양호`);
        }
        if (area) {
          calloutBullets.push(`• ${area} 배후 상권 기반 안정적 임대 수요`);
        }
        if (calloutBullets.length > 0) {
          dataMap['location'].right.callout = {
            kind: 'info',
            title: '입지 종합 분석',
            body: calloutBullets.join('\n'),
          };
        }
      }

      if (dataMap['commute']) {
        dataMap['commute'].coordinates = dataMap['location']?.coordinates ?? input.doc.body?.coordinates ?? null;
        dataMap['commute'].mapImageUrl = dataMap['location']?.mapImageUrl ?? input.doc.body?.mapImageUrl ?? null;
        dataMap['commute'].address = dataMap['location']?.address ?? input.doc.body?.resolved_address ?? input.doc.body?.address;
        dataMap['commute'].areaSignal = dataMap['location']?.areaSignal;
      }

      // 건물 개요 슬라이드에 외관 사진 우선 사용
      if (dataMap['building'] && exteriorPhoto) {
        dataMap['building'].photoUrl = exteriorPhoto.url;
      }

      // Phase 4: SSoT 기반 토지 콜아웃 보강 — V-World 데이터 없이도 실데이터 표시
      if (dataMap['land'] && !dataMap['land'].right?.callouts?.length) {
        const ssot = input.doc.body?.ssot_summary ?? {};
        const bldg = input.building ?? {};
        dataMap['land'].ssot_summary = ssot;
        dataMap['land'].building = bldg;
      }

      // D45 M-6: 객체(CadastralMapResult) 유입 시 .base64 추출 방어
      const cadastralImgRaw = enrichment?.cadastralMapImage
        ?? input.doc.body?.cadastralMapImage
        ?? input.doc.body?.cadastralImage
        ?? input.doc.body?.enrichment?.cadastralMapImage;
      const cadastralImg = typeof cadastralImgRaw === 'object' && cadastralImgRaw !== null
        ? (cadastralImgRaw as any).base64 ?? null
        : cadastralImgRaw;
      
      if (cadastralImg) {
        if (dataMap['cadastralMap']) {
          dataMap['cadastralMap'].cadastralImage = cadastralImg;
          dataMap['cadastralMap'].mapImageUrl = cadastralImg;
        }
        // 지적도를 토지 슬라이드에도 전달 (좌측 이미지 영역용)
        if (dataMap['land']) {
          dataMap['land'].cadastralImage = cadastralImg;
          dataMap['land'].mapImageUrl = cadastralImg;
          dataMap['land'].photoUrl = cadastralImg;

          // A06 호환: left.rows의 토지 제원을 right.rows로 매핑
          const leftRows = dataMap['land'].left?.rows ?? [];
          if (!dataMap['land'].right) dataMap['land'].right = {};
          if (leftRows.length > 0 && (!dataMap['land'].right.rows || dataMap['land'].right.rows.length === 0)) {
            dataMap['land'].right.rows = leftRows;
          }
          if (!dataMap['land'].right.sub) {
            dataMap['land'].right.sub = '토지이용계획 · 규제 분석';
          }

          // A06 호환: right.callout 단일 객체 보장
          if (!dataMap['land'].right.callout && dataMap['land'].right.callouts?.length > 0) {
            const first = dataMap['land'].right.callouts[0];
            dataMap['land'].right.callout = {
              kind: first.kind || 'info',
              title: first.title || '토지 규제 및 공법 분석',
              body: first.body || '',
            };
          } else if (!dataMap['land'].right.callout) {
            const ssot = input.doc.body?.ssot_summary ?? {};
            const bcr = ssot.bcr_pct;
            const far = ssot.far_pct;
            const maxBcr = ssot.max_bcr_pct ?? 50;
            const maxFar = ssot.max_far_pct ?? 250;
            const road = ssot.road_condition ?? '';
            const zoning = ssot.zoning ?? '';
            const bullets: string[] = [];
            if (bcr && far) {
              bullets.push(`• 현 건폐율 ${bcr}%, 용적률 ${far}% (법정 상한: 건폐율 ${maxBcr}%, 용적률 ${maxFar}%)`);
              const farGap = Number(maxFar) - Number(far);
              if (farGap > 5) {
                bullets.push(`• ${zoning} 기준 법정 상한 대비 용적률 ${farGap.toFixed(1)}%p 여유 — 밸류애드 잠재력`);
              }
            }
            if (road) {
              bullets.push(`• ${road} 접면 차량 진출입 및 보행자 접근성 우수`);
            }
            if (bullets.length > 0) {
              dataMap['land'].right.callout = {
                kind: 'info',
                title: '토지 규제 및 공법 분석',
                body: bullets.join('\n'),
              };
            }
          }

          if (!dataMap['land'].left) dataMap['land'].left = {};
          dataMap['land'].left.source = '© V-World 국토교통부 | 2026';
        }
      }

      // ── D4/D8: 중개인 제공 정보 (body.broker_extras + photos_v2 문서 이미지) — Basic IM 전용, 입력 없으면 no-op ──
      //   · 신규 면(투자 포인트·규제·계획·도면·시세 비교): 원문 그대로 + 결정론 통계만 (AI·재작성 없음)
      //   · 기존 면 보강(면 추가 없음): 입지 callout/위치도, 렌트롤 '매입 후 전략'
      if (isBasicPreset) {
        const brokerExtras = readBrokerExtras(input.doc.body);
        const brokerImages = extractBrokerImages(input.doc.body);
        const brokerMap = buildBrokerExtrasDataMap(input.doc.body, { ssot: input.doc.body?.ssot_summary ?? null, body: input.doc.body ?? null });
        for (const [k, v] of Object.entries(brokerMap)) dataMap[k] = v as any;
        applyBrokerLocation(dataMap['location'], brokerExtras, brokerImages);
        applyBrokerRentRollPlan(dataMap['rentRoll'], brokerExtras);
        // 면적 행 표기 정밀도 통일: 평→㎡ 환산 잔여 소수(3,842.644㎡)는 소수 1자리로 (표시 전용, 값 불변)
        normalizeAreaRowsPrecision(dataMap, {
          totArea: Number(enrichment?.buildingRegister?.totalArea ?? enrichment?.buildingRegister?.totArea) || null,
          platArea: Number(enrichment?.buildingRegister?.platArea) || null,
          archArea: Number(enrichment?.buildingRegister?.archArea) || null,
        });
      }

      // 면책 조항과 provenance 배지 설명은 법적 고정 텍스트 (§10, §18)
      // 사용자 입력이 있으면 우선 적용, 없으면 기본값 사용
      const disclaimerText = input.doc.body?.disclaimer
        ?? input.doc.body?.closingDisclaimer
        ?? '본 자료는 투자 권유가 아니며, 기재된 정보의 정확성을 보증하지 않습니다.';

      dataMap['closing'] = {
        title: input.doc.body?.closingTitle ?? '표기 기준 및 면책',
        content: '',
        tables: [],
        metrics: {},
        disclaimer: disclaimerText,
        footerText: companyName ? `${companyName} · ${docno}` : docno,
        logoUrl: input.logoUrl,
        badges: input.doc.body?.provenanceBadges ?? [
          // §10 provenance 배지 — 법적 고정 라벨
          { label: '✓ 공부확인', description: '등기부·대장 등 공적 장부 직접 확인', score: '1.00' },
          { label: '★ 전문가검증', description: '세무사·감정평가사 등 전문가 확인', score: '0.95' },
          { label: '▲ 매도인고지', description: '매도인이 구두 또는 서면으로 고지', score: '0.65' },
          { label: '● 중개인입력', description: '중개인 현장 조사 및 경험 기반 입력', score: '0.60' },
          { label: '◇ AI추정·가정', description: '시나리오 분석 및 AI 모델 추정', score: '0.30' },
        ],
      };

      // Basic IM: 클로징 타이틀 및 브로커 연락처 (basic-im-guide §2 #9)
      if (isBasicPreset) {
        dataMap['closing'].title = '문의 및 유의사항';
        // 실제 DB 값만 사용 — 부재 필드는 '' → A10이 해당 행 생략 (Rule 34/37: 더미 플레이스홀더 금지)
        dataMap['closing'].brokerContact = {
          name: input.broker?.display_name?.trim() || '',
          phone: input.broker?.phone?.trim() || '',
          email: input.broker?.email?.trim() || '',
          company: input.broker?.company_name?.trim() || '',
          registrationNo: input.broker?.registration_no?.trim() || '',
        };
      }

      // ── 갤러리 데이터 (v0.6.0: 동적 멀티 슬라이드 바인딩) ──
      if (gallerySpecs.length > 0) {
        gallerySpecs.forEach((spec) => {
          dataMap[spec.dataKey] = {
            kicker: spec.kicker,
            title: spec.title,
            content: '',
            tables: [],
            metrics: {},
            photos: spec.photos,
            photoUrls: spec.photos.map(p => p.url),
            layout: spec.layout,
            group: spec.group,
          };
        });
      }

      // 레거시 키 fallback (단일 gallery 호출 대응, 비표준 .wdp 필터링)
      const rawPhotoUrls = input.doc.body?.photo_urls ?? [];
      const rawPhotos = input.doc.body?.photos ?? [];
      const photoUrls = rawPhotoUrls.filter((u: string) => typeof u === 'string' && !u.toLowerCase().endsWith('.wdp'));
      const photos = rawPhotos.filter((p: any) => typeof p?.url === 'string' && !p.url.toLowerCase().endsWith('.wdp')
        && p.excluded !== true
        && !GALLERY_EXCLUDE_CATEGORIES.has(String(p.category || p.type || '').toLowerCase()));
      dataMap['gallery'] = {
        title: gallerySpecs[0]?.title || '건물 사진',
        kicker: gallerySpecs[0]?.kicker || 'GALLERY',
        content: '',
        tables: [],
        metrics: {},
        photoUrls: (gallerySpecs[0]?.photos.map(p => p.url) || (rawPhotos.length > 0 ? photos.map((p: any) => p.url) : photoUrls)).filter((u: string) => !u?.toLowerCase().endsWith('.wdp')),
        photos: (gallerySpecs[0]?.photos || photos).filter((p: any) => !p?.url?.toLowerCase().endsWith('.wdp')),
        layout: gallerySpecs[0]?.layout,
      };

      // Basic IM 전용: 투자수익률 산식 슬라이드 데이터 바인딩 (basic-im-guide.md §3.3)
      if (theme.presetId === 'credeal_basic') {
        // --- SSoT 우선 참조 (Phase 2-c) ---
        const fin = input.doc.body?.financials as Record<string, any> | undefined;
        const hasSsotYield = fin?.grossYieldOnEquity != null && Number.isFinite(fin.grossYieldOnEquity);

        // --- Fallback: 기존 자체 계산 로직 (기존 DB 문서 하위 호환) ---
        const ssot = input.doc.body?.ssot_summary ?? {};
        const askManwon = Number(ssot.asking_price_manwon ?? input.doc.body?.asking_price_manwon ?? 0);
        const depositKrw = Number(ssot.total_deposit_manwon ?? 0) * 10000;
        const monthlyRentKrw = Number(ssot.monthly_rent_total_krw ?? 0);
        const annualRentKrw = monthlyRentKrw * 12;
        let vacPct = Number(ssot.vacancy_pct ?? 0);
        // floor_leases에서 공실률 직접 산출 (ssot_summary.vacancy_pct 미설정 방어)
        if (vacPct === 0 && input.doc.body?.floor_leases?.length) {
          const leases = ((input.doc.body.floor_leases || []) as Record<string, any>[]).filter(Boolean);
          // 점유 상태 SSOT(lease-vacancy): 자가사용은 공실·분모에서 제외, 월세 0 추정 공실 오판 방지
          const occ = summarizeLeaseOccupancy(leases);
          if (occ.vacant > 0 && occ.vacancyPct != null) {
            vacPct = occ.vacancyPct;
          }
        }
        const askKrw = askManwon * 10000;
        const denominator = askKrw - depositKrw;
        const rawCapRateAsIs = (denominator > 0 && Number.isFinite(denominator) && Number.isFinite(annualRentKrw))
          ? (annualRentKrw / denominator * 100)
          : 0;
        const fallbackCapRateAsIs = Number.isFinite(rawCapRateAsIs) && rawCapRateAsIs > 0 ? rawCapRateAsIs : 0;

        // D10: 단일 YieldSet — 요약 슬라이드(heroCard.capRateBase)와 같은 body.financials에서 값·가정을 읽는다.
        //   안정화 수익률 = (a) 실제 공실·자가사용 면적 × 중개인 목표임대료 (입력·면적이 있을 때만), 아니면
        //   (b) '공실충당 N% 제외 기준 (참고)' — 시세 임대를 가정했다는 문구는 계산이 뒷받침할 때만 표기한다.
        const yieldSet = buildYieldSetFromBody(input.doc.body as Record<string, any>);
        const capRateAsIs = yieldSet.grossYieldNetOfDeposit ?? (hasSsotYield ? fin!.grossYieldOnEquity : fallbackCapRateAsIs);
        const capRateStabilized = yieldSet.stabilized?.value;

        dataMap['yieldFormula'] = {
          title: '투자수익률 분석',
          kicker: 'Yield',
          content: '',
          tables: [],
          metrics: {},
          annualRent: (hasSsotYield && fin?.annualRentBil) ? fin.annualRentBil * 1_0000_0000 : annualRentKrw,
          totalDeposit: depositKrw,
          askingPrice: askKrw,
          vacancyPct: vacPct,
          capRateAsIs,
          capRateStabilized,
          // D10: 목표임대료 계산이 실제로 뒷받침할 때만 캡션 존재 (공실충당 기준(참고)에는 캡션 없음)
          stabilizedAssumption: yieldSet.stabilized?.caption ?? undefined,
          yieldSet,
          // Phase C가 추가하는 중개인 입력(없을 수 있음) — 토지 평당가 서술에만 사용, 수익률 비교 근거로는 쓰지 않는다
          marketComps: Array.isArray((input.doc.body as any)?.broker_extras?.market_comps)
            ? (input.doc.body as any).broker_extras.market_comps
            : undefined,
          // Phase 2: 공시지가 10년 추이 (수익률 슬라이드 고도화)
          ...(() => {
            // 다필지: 대표 필지 단가 × 전체 면적 은 토지 비중을 왜곡하므로 기준을 명시/보정한다.
            const baseLph = enrichment?.landPriceHistory ?? input.doc.body?.enrichment?.landPriceHistory ?? null;
            const ps = summarizeParcels(input.doc.body?.parcels);
            const totalLand = Number(ssot.land_area_sqm ?? 0);
            if (!ps.isMulti || !baseLph) return { landPriceHistory: baseLph, landAreaSqm: totalLand };
            if (ps.weightedOfficialPricePerM2) {
              return {
                landPriceHistory: { ...baseLph, latestPricePerSqm: ps.weightedOfficialPricePerM2 },
                landAreaSqm: totalLand,
                landPriceBasis: 'weighted',
              };
            }
            // 전 필지 단가 미입력: 단가는 대표 필지 기준으로 표기하고, 전체 면적과 곱하는 토지 비중은 산출하지 않는다.
            return { landPriceHistory: baseLph, landAreaSqm: 0, landPriceBasis: 'representative' };
          })(),
          areaSignal: input.building?.area_signal ?? ssot.area_signal ?? '',
        };
      }

      // heroCard 데이터를 summary에 매핑
      const heroCard = input.doc.body?.heroCard ?? {};
      if (!dataMap['summary']) {
        dataMap['summary'] = {
          title: '핵심 투자 지표',
          content: '',
          tables: [],
          metrics: [],
          leadSentence: heroCard.hookText ?? '',
          callouts: [],
        };
      }
      dataMap['summary'].heroCard = heroCard;
      dataMap['summary'].ssot_summary = input.doc.body?.ssot_summary;
      dataMap['summary'].enrichment = enrichment;
      dataMap['summary'].station_name = input.doc.body?.ssot_summary?.station_name ?? (enrichment?.locationPoi?.nearestStation?.name);
      dataMap['summary'].station_walk_min = input.doc.body?.ssot_summary?.station_walk_min ?? (enrichment?.locationPoi?.nearestStation?.walkMinutes);
      dataMap['summary'].asking_price_manwon = input.doc.body?.ssot_summary?.asking_price_manwon ?? input.doc.body?.asking_price_manwon;
      dataMap['summary'].askingPrice = dataMap['cover']?.askingPrice ?? dataMap['building']?.priceTable?.value;

      // 2026-10-05: Basic IM 요약 — 실데이터 기반 리드 문장 / 3대 투자 포인트 / 물건 개요 하이라이트
      //   - 템플릿 상투 문구(premium-template-engine 폴백) 대체, 리드 == 포인트01 중복 제거 (Rule 4)
      //   - 데이터가 없는 항목은 만들지 않음 (Rule 34) — 부족분만 템플릿이 아닌 기존 포인트로 보충
      if (theme.presetId === 'credeal_basic') {
        const summaryFacts = extractSummaryFacts({
          posture,
          body: input.doc.body ?? {},
          building: input.building ?? {},
          enrichment: enrichment ?? {}, core: (input as any).core ?? null, specRows: dataMap['building']?.left?.rows ?? [],
        });
        const priorPoints: string[] = [
          ...(Array.isArray(dataMap['summary'].keyPoints) ? dataMap['summary'].keyPoints : []),
          ...(Array.isArray(heroCard.keyPoints) ? heroCard.keyPoints : []),
        ].map((p: unknown) => String(p ?? ''));
        const hl = buildSummaryHighlights(summaryFacts, priorPoints);
        if (hl.points.length > 0) dataMap['summary'].keyPoints = hl.points;
        if (hl.lead) dataMap['summary'].leadSentence = hl.lead;
        else if (isBoilerplateHighlight(String(dataMap['summary'].leadSentence ?? ''))) dataMap['summary'].leadSentence = '';
        if (dataMap['building'] && hl.shortHighlights.length > 0) dataMap['building'].assetHighlights = hl.shortHighlights;
      }

      if (posture === 'owner_occupied' && (!dataMap['summary'].keyPoints || dataMap['summary'].keyPoints.length === 0)) {
        const areaSig = input.building?.area_signal ?? input.doc.body?.ssot_summary?.area_signal ?? '도심 업무권역';
        dataMap['summary'].keyPoints = [
          `사옥 가치: ${areaSig} 내 독립 사옥 확보를 통한 중장기 자산 가치 확보`,
          '비용 절감: 임차료 지출을 법인 자산 축적으로 전환하는 재무 타당성 분석',
          '기업 브랜딩: 사옥 단독 명칭 표기(간판 설치권) 및 기업 대외 신인도 제고',
        ];
      }

      // I-03 fix + FIX-RC5: dataMap['summary'].metrics나 heroCard.stats가 비어 있을 때만 SSoT/body/building에서 자동 구성
      const existingMetrics = dataMap['summary']?.metrics;
      if ((!existingMetrics || existingMetrics.length === 0) && (!heroCard.stats || heroCard.stats.length === 0)) {
        const ssot = input.doc.body?.ssot_summary ?? {};
        const bldg = input.building ?? {};
        const autoStats: Array<{label: string; value: string; unit?: string}> = [];
        // SSoT 우선 소스
        if (ssot.price_band) autoStats.push({ label: '매각 희망가', value: ssot.price_band });
        else if (ssot.asking_price_manwon) {
          const val = Number(ssot.asking_price_manwon);
          const formatted = val >= 10000 ? `${(val / 10000).toFixed(val % 10000 === 0 ? 0 : 1)}억원` : `${val.toLocaleString()}만원`;
          autoStats.push({ label: '매각 희망가', value: formatted });
        }
        if (ssot.size_signal) autoStats.push({ label: '연면적', value: ssot.size_signal });
        else if (bldg.total_area_pyeong) autoStats.push({ label: '연면적', value: `${bldg.total_area_pyeong}평` });
        // G-02: 사옥형 공실률 카드 압축 — 긴 vacancy_signal 대신 간결 텍스트
        if (posture === 'owner_occupied') {
          const vacVal = Number(ssot.vacancy_pct ?? 0);
          autoStats.push({ label: '공실률', value: vacVal === 0 ? '사옥 자가사용' : `${vacVal}%` });
        } else if (ssot.vacancy_signal) {
          autoStats.push({ label: '공실률', value: ssot.vacancy_signal });
        } else if (ssot.vacancy_pct != null) {
          autoStats.push({ label: '공실률', value: `${ssot.vacancy_pct}%` });
        }
        if (input.grade) autoStats.push({ label: '데이터 등급', value: input.grade });
        if (ssot.area_signal) autoStats.push({ label: '소재지', value: ssot.area_signal });
        else if (bldg.area_signal) autoStats.push({ label: '소재지', value: bldg.area_signal });
        // FIX-RC5: building 테이블 폴백 소스 확대
        if (autoStats.length < 4) {
          if (bldg.built_year && !autoStats.some(s => s.label === '준공연도')) {
            autoStats.push({ label: '준공연도', value: `${bldg.built_year}년` });
          }
          if (bldg.floors_above && !autoStats.some(s => s.label === '규모')) {
            const floorStr = bldg.floors_below ? `B${bldg.floors_below}/F${bldg.floors_above}` : `${bldg.floors_above}층`;
            autoStats.push({ label: '규모', value: floorStr });
          }
          if (bldg.asset_type && !autoStats.some(s => s.label === '자산유형')) {
            autoStats.push({ label: '자산유형', value: bldg.asset_type });
          }
        }
        if (autoStats.length > 0) {
          dataMap['summary'].metrics = autoStats;
        }
      }
      // ── 2b. 공동담보 경고 블록 주입 (hasJointCollateral) ──
      if (input.hasJointCollateral && dataMap['risk']) {
        const riskData = dataMap['risk'];
        if (!riskData.blocks) riskData.blocks = [];
        riskData.blocks.push({
          label: '공동담보 설정',
          value: '근저당 공동담보 확인 필요',
          description: '본 물건에 타 부동산과의 공동담보(근저당)가 설정되어 있습니다.\n담보 해지 조건 및 말소 가능 여부를 법률 전문가와 사전 확인하시기 바랍니다.\n매매 시 담보 분리 또는 대환 절차가 필요할 수 있습니다.',
        });
      }

      // ── 3. 아키타입별 슬라이드 생성 ──
      const slides: any[] = [];
      let pageNum = 1;
      const watermarkText = input.watermark
        ? `${input.watermark.requesterName} · ${input.watermark.phoneLast4} · ${input.watermark.timestamp}`
        : undefined;

      // V5 감사 §5.1 시정: 게이트 차단 시 경고 워터마크
      const blockedWarning = input.publishBlocked
        ? `⚠ 발행 차단 [${(input.publishBlockReasons ?? []).join(', ')}] — 내부 검토용`
        : undefined;

      for (const spec of sequence) {
        if (spec.suppress) continue;

        const slideData = dataMap[spec.dataKey];
        const isStaticSlide = ['cover', 'closing', 'gallery', 'summary', 'yieldFormula', 'stackingPlan', 'agenda', 'rentRoll', 'land', 'location'].includes(spec.dataKey)
          || spec.dataKey.startsWith('gallery_')
          || spec.dataKey.includes('divider')
          || spec.archetype === 'A06'
          || spec.archetype === 'A14'
          || spec.archetype === 'A22'
          || spec.archetype === 'A23'
          || spec.archetype === 'A24'
          || spec.archetype === 'A25';
        const hasContent = slideData && (
          (slideData.content && slideData.content.trim().length > 0) ||
          (slideData.tables && slideData.tables.length > 0) ||
          (slideData.photos && slideData.photos.length > 0) ||
          (slideData.photoUrls && slideData.photoUrls.length > 0) ||
          // FIX-RC4: 빈 배열 []도 truthy이므로, 배열 길이를 명시적으로 검사
          ((slideData.left?.rows?.length ?? 0) > 0 || !!slideData.left?.sub) ||
          ((slideData.right?.stats?.length ?? 0) > 0 || (slideData.right?.callouts?.length ?? 0) > 0 || (slideData.right?.rows?.length ?? 0) > 0) ||
          ((slideData.blocks?.length ?? 0) > 0) ||
          ((slideData.table1?.rows?.length ?? 0) > 0) ||
          ((slideData.tableRows?.length ?? 0) > 0) ||
          ((slideData.steps?.length ?? 0) > 0) ||
          // D38: 고도화 아키타입 전수 콘텐츠 검사 가드 (Silent Drop 방지)
          (slideData.stackingPlan && slideData.stackingPlan.length > 0) ||
          (slideData.capRateAsIs != null) ||
          ((slideData.kpiRows?.length ?? 0) > 0) ||
          ((slideData.statCards?.length ?? 0) > 0) ||
          (slideData.equityBreakdown != null) ||
          ((slideData.ltvScenarios?.length ?? 0) > 0) ||
          ((slideData.ownershipRows?.length ?? 0) > 0) ||
          ((slideData.roomTypes?.length ?? 0) > 0) ||
          ((slideData.checkItems?.length ?? 0) > 0) ||
          ((slideData.pillars?.length ?? 0) > 0) ||
          ((slideData.agendaItems?.length ?? 0) > 0) ||
          (slideData.romanNumeral != null) ||
          (slideData.mapImageUrl != null || slideData.coordinates != null || slideData.cadastralImage != null) ||
          (Boolean(slideData.markdown && slideData.markdown.trim().length > 0))
        );

        if (!hasContent && !isStaticSlide) {
          warnings.push(`[Graceful Degradation] ${spec.title} 슬라이드 억제: 바인딩할 데이터(dataKey: ${spec.dataKey})가 충분하지 않습니다.`);
          continue;
        }

        const builder = SLIDE_ARCHETYPE_REGISTRY[spec.archetype];
        if (!builder) {
          warnings.push(`아키타입 ${spec.archetype} 빌더를 찾을 수 없습니다.`);
          continue;
        }

        const archetypeInput: ArchetypeInput = {
          pres,
          slideNum: pageNum,
          docno,
          watermarkText: blockedWarning ?? (input.watermark ? watermarkText : undefined),
          data: {
            ...(dataMap[spec.dataKey] ?? {}),
            kicker: spec.kicker,
            // cover/closing 외에는 정형 PPTX 슬라이드 표준 제목(spec.title)을 최종 권위로 사용 (Rule 6)
            title: (['cover', 'closing'].includes(spec.dataKey) && dataMap[spec.dataKey]?.title)
              ? dataMap[spec.dataKey]?.title
              : (spec.title || dataMap[spec.dataKey]?.title || '세부 정보'),
          },
          grade: (input.grade ?? 'B') as 'A' | 'B' | 'C',
          provenance: input.provenance ?? {},
        };

        try {
          const result = await Promise.resolve(builder(archetypeInput));
          // W-PPTX-6: 빌더가 suppress 신호를 반환하면 슬라이드 생략 (유령 백지 슬라이드 방지)
          // M4: Basic IM 9면 계약 준수 — A24/rentRoll 및 canonical 기본 슬라이드는 pop/drop 방지
          if (result.suppress) {
            if (spec.archetype === 'A24' || spec.dataKey === 'rentRoll' || (isBasicPreset && ['A06', 'A14', 'A23', 'A24'].includes(spec.archetype) && !archetypeInput.data?.suppressOnEmpty)) {
              log.warn(`[PPTX] [Suppress Prevented] ${spec.archetype}(${spec.dataKey}) — canonical basic slide preserved`);
            } else {
              log.info(`[PPTX] [Suppress] ${spec.archetype}(${spec.dataKey}) — data keys: ${Object.keys(archetypeInput.data).join(', ')}, tableRows: ${archetypeInput.data?.tableRows?.length ?? 'N/A'}, tables[0].rows: ${archetypeInput.data?.tables?.[0]?.rows?.length ?? 'N/A'}, stackingPlan: ${archetypeInput.data?.stackingPlan?.length ?? 'N/A'}`);
              if (Array.isArray((pres as unknown as { slides: PptxGenJS.Slide[] }).slides) && (pres as unknown as { slides: PptxGenJS.Slide[] }).slides.length > 0) {
                const lastIdx = (pres as unknown as { slides: PptxGenJS.Slide[] }).slides.length - 1;
                if ((pres as unknown as { slides: PptxGenJS.Slide[] }).slides[lastIdx] === result.slide) {
                  (pres as unknown as { slides: PptxGenJS.Slide[] }).slides.pop();
                }
              }
              warnings.push(...result.warnings);
              warnings.push(`[Suppress] ${spec.archetype}(${spec.title}) 슬라이드 억제`);
              continue;
            }
          }
          // W-PPTX-1: addFallbackContent가 false 반환 시 슬라이드 차단 (A03 BLOCK 등)
          const fallbackOk = addFallbackContent(result.slide, archetypeInput.data, theme, {
            archetype: spec.archetype,
            slideIndex: pageNum,
            warnings,
          });
          if (!fallbackOk) {
            if (Array.isArray((pres as unknown as { slides: PptxGenJS.Slide[] }).slides) && (pres as unknown as { slides: PptxGenJS.Slide[] }).slides.length > 0) {
              const lastIdx = (pres as unknown as { slides: PptxGenJS.Slide[] }).slides.length - 1;
              if ((pres as unknown as { slides: PptxGenJS.Slide[] }).slides[lastIdx] === result.slide) {
                (pres as unknown as { slides: PptxGenJS.Slide[] }).slides.pop();
              }
            }
            warnings.push(`[BL-5 BLOCK] ${spec.archetype}(${spec.title}) 슬라이드 제거: 폴백 차단`);
            continue;
          }
          slides.push(result.slide);
          warnings.push(...result.warnings);
          pageNum++;
        } catch (err) {
          warnings.push(
            `슬라이드 ${spec.archetype}(${spec.title}) 생성 실패: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      if (slides.length === 0) {
        throw new Error('생성된 슬라이드가 없습니다.');
      }

      // ── 4. 텍스트 예산 검증 ──
      // 각 슬라이드의 텍스트 요소를 수집하여 검증
      const textItems: { type: string; text: string }[] = [];
      if (input.doc.title) {
        textItems.push({ type: 'slideTitle', text: input.doc.title });
      }
      const budgetWarnings = validateTextBudgets(textItems);
      warnings.push(...budgetWarnings);

      // ── 4b. 지면 물리 검증 (D33 BL-A: G31~G36 실행 경로 연결) ──
      const layoutResult = validateLayout(pres);
      if (layoutResult.violations.length > 0) {
        // G34(겹침)는 warn 수준이므로 throw 대상에서 제외, 나머지는 차단
        const blockingViolations = layoutResult.violations.filter(v => v.gate !== 'G34');
        if (blockingViolations.length > 0) {
          const msg = blockingViolations
            .map(v => `[${v.gate}] slide ${v.slideIndex}: ${v.message}`)
            .join('; ');
          throw new Error(`[LAYOUT_GATE] 지면 물리 위반 ${blockingViolations.length}건: ${msg}`);
        }
        // G34 warn만 있으면 경고에 추가
        for (const v of layoutResult.violations.filter(v => v.gate === 'G34')) {
          warnings.push(`[${v.gate}] slide ${v.slideIndex}: ${v.message}`);
        }
      }

      // ── 4c. 수익률 정합 검증 (D33 BL-C: G38) ──
      const yieldObj = (dataMap as Record<string, any>)._yield as Yield | undefined;
      if (yieldObj && !validateYield(yieldObj)) {
        throw new Error(`[G38] 수익률 정합 위반: basis='${yieldObj.basis}'인데 deductions가 비어있습니다. NOI를 주장하면서 공제 항목이 없으면 총임대료와 구분 불가합니다.`);
      }

      // ── 5. 출력 ──
      const buffer = (await pres.write({
        outputType: 'nodebuffer',
        compression: true,
      })) as Buffer;

      // ── 6. 셀프 검증 (D35 §4: 렌더 후 산출물 자체 파싱 → 게이트 검증) ──
      let auditReport: MobileImPptxOutput['auditReport'];
      const shouldAudit = process.env.PPTX_SELF_AUDIT === 'true' || process.env.NODE_ENV === 'test';
      if (shouldAudit) {
        try {
          const { parsePptx } = await import('./pptx-parser');
          const { extractGateContext, generateAuditReport } = await import('./extract-gate-context');
          const parseResult = await parsePptx(buffer);
          const gateCtx = extractGateContext(parseResult.slides);
          const report = generateAuditReport(parseResult.slides, gateCtx);

          auditReport = {
            layoutViolations: report.layoutViolations,
            standardViolations: report.standardViolations,
            totalViolations: report.layoutViolations.length + report.standardViolations.length,
            imageCount: report.imageCount,
            textCount: report.textCount,
            gateContext: gateCtx as Record<string, unknown>,
          };

          // 감사 위반을 warnings에 추가
          for (const v of report.layoutViolations) {
            warnings.push(`[AUDIT] ${v}`);
          }
          for (const v of report.standardViolations) {
            warnings.push(`[AUDIT] ${v}`);
          }
        } catch (auditErr) {
          // 셀프 검증 실패는 렌더를 차단하지 않음 (graceful degradation)
          warnings.push(`[AUDIT] 셀프 검증 실패: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`);
        }
      }

      // ── 6b. H1 출력 불변식 감사 (D3) ──
      // 기본: warn 모드(렌더 비차단, warnings + 구조화 로그 텔레메트리).
      // IM_INVARIANT_MODE=block 이면 error 위반 시 렌더를 실패시켜 결함 산출물의 다운로드를 차단한다.
      let h1BlockMessage: string | null = null;
      try {
        const { auditPptxBufferInvariants } = await import('../quality/pptx-invariant-audit');
        const { resolveInvariantMode, summarizeViolations } = await import('../quality/invariant-telemetry');
        const h1 = await auditPptxBufferInvariants(buffer);
        for (const v of h1.violations) {
          warnings.push(`[H1:${v.id}] slide ${v.unit + 1}: ${v.sample}`);
        }
        const h1Errors = h1.violations.filter(v => v.severity === 'error');
        const mode = resolveInvariantMode();
        if (h1.violations.length > 0) {
          // 텔레메트리: 로그 집계 쿼리용 구조화 이벤트
          console.warn('[PPTX-H1] ' + JSON.stringify({ event: 'im_invariant_violation', mode, isPro: !!input.isPro, slideCount: h1.slideCount, ...summarizeViolations(h1.violations) }));
        }
        if (h1Errors.length > 0 && mode === 'block') {
          h1BlockMessage = `H1 출력 불변식 위반 ${h1Errors.length}건으로 PPTX 생성을 차단했습니다: ` + h1Errors.slice(0, 3).map(v => `${v.id}@slide${v.unit + 1}`).join(', ');
        }
      } catch (h1Err) {
        warnings.push(`[H1] 불변식 감사 실패: ${h1Err instanceof Error ? h1Err.message : String(h1Err)}`);
      }
      if (h1BlockMessage) throw new Error(h1BlockMessage);

      return {
        buffer,
        slideCount: slides.length,
        fileSizeBytes: buffer.length,
        generatedAt: new Date().toISOString(),
        warnings,
        auditReport,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('D등급')) {
        throw error;
      }
      throw new Error(
        `PPTX 렌더링 실패 (프리셋: ${theme.presetName ?? input.preset}): ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
    });
  }

  /**
   * Renders an institutional Pro IM deck (30+ slides across 5 core chapters).
   */
  async renderPro(input: MobileImPptxInput): Promise<MobileImPptxOutput> {
    return this.render({
      ...input,
      isPro: true,
      preset: input.preset || 'credeal_pro',
    });
  }
}
