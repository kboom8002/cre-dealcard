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
import { planGallerySlides, type GallerySlideSpec } from './gallery-planner';

import { M, CW, KR, NUM, C, setActiveTheme, withThemeIsolation } from './imlib';
import { validateLayout } from './layout-validator';
import { validateYield, type Yield } from './yield-object';
import { addFallbackContent, resetFallbackTracker, parseInlineMarkdown } from './pptx-markdown-fallback';
import { sqmToPyeong, formatPyeong } from '@/lib/utils/area-conversion';

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
      // role 기반 이미지 선택 (사용자 지정 → isHero → 첫 번째)
      const heroPhoto = resolvedPhotos.find(p => p.role === 'cover')
        || resolvedPhotos.find(p => p.isHero)
        || resolvedPhotos[0];
      const exteriorPhoto = resolvedPhotos.find(p => p.role === 'exterior')
        || resolvedPhotos.find(p => p.category === 'exterior' || p.type === 'exterior')
        || heroPhoto;

      // ── 1. 덱 시퀀스 결정 ──
      const enrichment = input.doc.body?.enrichment ?? {};
      const externalData = input.doc.body?.external_data ?? {};
      const sequenceInput: DeckSequenceInput = {
        posture,
        grade: (input.grade ?? 'B') as 'A' | 'B' | 'C',
        incomeArchetype: input.incomeArchetype,
        hasViolation: input.hasViolation,
        hasJointCollateral: input.hasJointCollateral,
        hasPhotos: resolvedPhotos.length > 0,
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
        },
        // D37 C-3: ReleaseTier 전달 → tier 기반 면 제어 활성화
        releaseTier: input.releaseTier,
        // Basic IM 전용 슬라이드 편성 (A23 산식 등)
        preset: theme.presetId,
        isPro: input.isPro || input.proMode || (input.releaseTier as string) === 'pro',
      };

      const isProDeck = input.isPro || input.proMode || input.preset === 'credeal_pro' || (input.releaseTier as string) === 'pro';
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
        dataMap['cover'].askingPrice = ssotCover.asking_price_manwon 
          ? `${(Number(ssotCover.asking_price_manwon) / 10000).toFixed(0)}억 원` 
          : (ssotCover.price_band ?? '');
        dataMap['cover'].documentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
      }

      // ── Basic IM 물건 개요 (building) 슬라이드 데이터 보장 ──
      // basic-im-guide §2 #3: 건축물대장 정보 + 외관 사진 + 매각가 좌우 배치
      // LLM writer가 property_overview 섹션을 생성하지 않으면 dataMap['building']이 없으므로
      // SSOT/건축물대장 데이터로 직접 폴백 바인딩
      if (!dataMap['building'] && isBasicPreset) {
        const ssot = input.doc.body?.ssot_summary ?? {};
        const bldg = input.building ?? {};
        const br = enrichment?.buildingRegister ?? {};
        const heroCard = input.doc.body?.heroCard ?? {};

        // 면적 포맷 헬퍼
        const fmtArea = (sqm: number | string | undefined) => {
          const v = Number(sqm);
          if (!v || isNaN(v)) return '-';
          return `${v.toLocaleString()}㎡ (${formatPyeong(v, 1)}평)`;
        };

        const leftRows: [string, string][] = [
          ['소재지', ssot.address || bldg.address || heroCard.address || '-'],
          ['대지면적', fmtArea(ssot.land_area_sqm || br.platArea || heroCard.landAreaM2 || bldg.land_area_sqm)],
          ['지목', ssot.land_category || br.jimok || '-'],
          ['지역/지구', ssot.zoning || br.useZone || bldg.use_zone || '-'],
          ['건축면적', fmtArea(br.archArea || ssot.building_area_sqm)],
          ['건폐율', ssot.bcr_pct ? `${ssot.bcr_pct}%` : (br.bcrPct ? `${br.bcrPct}%` : '-')],
          ['연면적', fmtArea(ssot.total_gross_area_sqm || heroCard.totalGrossAreaSqm || bldg.total_area_sqm)],
          ['용적률', ssot.far_pct ? `${ssot.far_pct}%` : (br.farPct ? `${br.farPct}%` : '-')],
          ['준공시점', (() => {
            const yr = ssot.completion_year || heroCard.completionYear || bldg.built_year || br.useAprDay;
            if (!yr) return '-';
            const yrNum = Number(String(yr).slice(0, 4));
            const age = yrNum ? `(건축 후 약 ${new Date().getFullYear() - yrNum}년)` : '';
            return `${yr} ${age}`;
          })()],
          ['층수', (() => {
            const below = Number(ssot.floors_below || heroCard.floorsBelow || bldg.floors_below || br.ugrndFlrCnt || 0);
            const above = Number(ssot.floors_above || heroCard.floorsAbove || bldg.floors_above || br.grndFlrCnt || 0);
            if (!below && !above) return '-';
            return `지하${below}층 ~ 지상${above}층`;
          })()],
          ['주차 / 승강기', (() => {
            const park = ssot.parking_count || heroCard.parkingCount || bldg.parking_count || br.parkingCnt || '-';
            const elev = ssot.elevator_count || heroCard.elevatorCount || bldg.elevator_count || br.rideUseLiftCnt || '-';
            return `${park}대 / ${elev}대`;
          })()],
        ].filter(([, v]) => v !== '-') as [string, string][]; // 값이 없는 행 제거

        dataMap['building'] = {
          title: '물건 개요',
          content: '',
          tables: [],
          metrics: {},
          left: {
            sub: '건축물대장·토지이용계획확인서 기준',
            rows: leftRows,
          },
        };
      }

      if (dataMap['building']) {
        const ssotBldg = input.doc.body?.ssot_summary ?? {};
        const askManwon = Number(ssotBldg.asking_price_manwon ?? input.doc.body?.asking_price_manwon ?? 0);
        const askFmt = (v: number) => v >= 10000
          ? `${(v / 10000).toLocaleString()}억 원`
          : v > 0 ? `${v.toLocaleString()}만원` : '';
        const askStr = askFmt(askManwon) || (input.doc.body?.heroCard?.askingPriceDisplay ?? input.doc.body?.askingPrice ?? '');

        // 매각가 테이블 (하단 별도 표)
        if (askStr) {
          dataMap['building'].priceTable = {
            label: '매매 희망가',
            value: `${askStr} (VAT 별도)`,
          };

          // 토지평당가 추가
          const landPy = Number(ssotBldg.land_area_pyeong || 0) || sqmToPyeong(Number(ssotBldg.land_area_sqm || 0));
          if (landPy > 0 && askManwon > 0) {
            dataMap['building'].priceTable2 = {
              label: '토지평당가',
              value: `약 ${Math.round(askManwon / landPy).toLocaleString()}만 원/평`,
            };
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
          const locWalk = input.doc.body?.ssot_summary?.station_walk_min ? `도보 ${input.doc.body.ssot_summary.station_walk_min}분` : '인접 역세권';
          locTransit = `지하철역 역세권 (${locWalk})`;
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

        // D8: 우측 입지 조건 구조화 행 — ssot/POI 데이터에서 동적 생성 (하드코딩 금지)
        const ssot = input.doc.body?.ssot_summary ?? {};
        const locRows: Array<[string, string]> = [];
        const nearestSt = externalPoi?.nearestStation;
        if (nearestSt?.name) {
          locRows.push(['대중교통', `${nearestSt.name} 도보 ${nearestSt.walkMinutes ?? Math.round((nearestSt.distanceM ?? 400) / 80)}분 (약 ${nearestSt.distanceM ?? ''}m)`]);
        } else if (ssot.station_walk_min) {
          locRows.push(['대중교통', `지하철역 도보 ${ssot.station_walk_min}분 역세권`]);
        } else {
          locRows.push(['대중교통', '인접 지하철역 역세권 (상세 확인 필요)']);
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

      // 지적도 슬라이드에 WMS 지적도 이미지 바인딩
      if (dataMap['cadastralMap']) {
        const cadastralImg = enrichment?.cadastralMapImage
          ?? input.doc.body?.cadastralMapImage
          ?? input.doc.body?.cadastralImage
          ?? input.doc.body?.enrichment?.cadastralMapImage;
        if (cadastralImg) {
          dataMap['cadastralMap'].cadastralImage = cadastralImg;
          dataMap['cadastralMap'].mapImageUrl = cadastralImg;
        }
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
        dataMap['closing'].brokerContact = {
          name: input.broker?.display_name ?? '[담당자명]',
          phone: input.broker?.phone ?? '[연락처]',
          email: input.broker?.email ?? '',
          company: input.broker?.company_name ?? '[중개법인명]',
          registrationNo: input.broker?.registration_no ?? '',
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
      const photos = rawPhotos.filter((p: any) => typeof p?.url === 'string' && !p.url.toLowerCase().endsWith('.wdp'));
      dataMap['gallery'] = {
        title: gallerySpecs[0]?.title || '건물 사진',
        kicker: gallerySpecs[0]?.kicker || 'GALLERY',
        content: '',
        tables: [],
        metrics: {},
        photoUrls: (gallerySpecs[0]?.photos.map(p => p.url) || photoUrls).filter((u: string) => !u?.toLowerCase().endsWith('.wdp')),
        photos: (gallerySpecs[0]?.photos || photos).filter((p: any) => !p?.url?.toLowerCase().endsWith('.wdp')),
        layout: gallerySpecs[0]?.layout,
      };

      // Basic IM 전용: 투자수익률 산식 슬라이드 데이터 바인딩 (basic-im-guide.md §3.3)
      if (theme.presetId === 'credeal_basic') {
        const ssot = input.doc.body?.ssot_summary ?? {};
        const askManwon = Number(ssot.asking_price_manwon ?? input.doc.body?.asking_price_manwon ?? 0);
        const depositKrw = Number(ssot.total_deposit_manwon ?? 0) * 10000;
        const monthlyRentKrw = Number(ssot.monthly_rent_total_krw ?? 0);
        const annualRentKrw = monthlyRentKrw * 12;
        let vacPct = Number(ssot.vacancy_pct ?? 0);
        // floor_leases에서 공실률 직접 산출 (ssot_summary.vacancy_pct 미설정 방어)
        if (vacPct === 0 && input.doc.body?.floor_leases?.length) {
          const leases = (input.doc.body.floor_leases || []) as Record<string, any>[];
          const totalUnits = leases.length;
          const vacantUnits = leases.filter((l: any) => 
            l.is_vacant === true 
            || l.tenant === '공실' || l.tenant_name === '공실'
            || l.tenant_type === '공실' || l.tenant_sector === '공실'
            || (l.tenant_type?.includes?.('공실'))
            || (l.rent_manwon === 0 && l.deposit_manwon === 0 && !l.tenant_type)
          ).length;
          if (vacantUnits > 0 && totalUnits > 0) {
            vacPct = Math.round((vacantUnits / totalUnits) * 1000) / 10;
          }
        }
        const askKrw = askManwon * 10000;
        const denominator = askKrw - depositKrw;
        const capRateAsIs = denominator > 0 ? (annualRentKrw / denominator * 100) : 0;
        // 안정화: claims에서 pro_forma_cap_rate 우선 참조 (FinancialCalculator 산출값)
        const docClaims = (input.doc.body?.claims ?? []) as Array<{ subject: string; value: number }>;
        const proFormaClaim = docClaims.find(c => c.subject === 'pro_forma_cap_rate');
        // claim이 있으면 사용, 없으면 공실률 기반 fallback 재계산
        const capRateStabilized = proFormaClaim?.value != null && proFormaClaim.value > 0
          ? proFormaClaim.value
          : (vacPct > 0 && denominator > 0
            ? ((annualRentKrw * (1 + vacPct / (100 - vacPct))) / denominator * 100)
            : undefined);

        dataMap['yieldFormula'] = {
          title: '투자수익률 분석',
          kicker: 'Yield',
          content: '',
          tables: [],
          metrics: {},
          annualRent: annualRentKrw,
          totalDeposit: depositKrw,
          askingPrice: askKrw,
          vacancyPct: vacPct,
          capRateAsIs,
          capRateStabilized,
          stabilizedAssumption: '공실층을 인근 동일 용도 시세 수준으로 임대 가정',
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
        const isStaticSlide = ['cover', 'closing', 'gallery', 'summary', 'yieldFormula', 'stackingPlan', 'agenda'].includes(spec.dataKey)
          || spec.dataKey.startsWith('gallery_')
          || spec.dataKey.includes('divider')
          || spec.archetype === 'A14'
          || spec.archetype === 'A22'
          || spec.archetype === 'A23'
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
          if (result.suppress) {
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
