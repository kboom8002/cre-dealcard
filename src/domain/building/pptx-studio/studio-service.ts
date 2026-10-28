import { createServiceClient } from '@/lib/supabase/service';
import { randomUUID } from 'crypto';
import type { StudioStage } from './project/types';
import type { HeaderFooterConfig } from '../mobile-im/pptx/header-footer';
import { DEFAULT_HEADER_FOOTER } from '../mobile-im/pptx/header-footer';
import { parseStationName, formatStationLabel } from '../mobile-im/pptx/binder/station-name';

export interface PptxSlide {
  id: string;
  projectId: string;
  slideIndex: number;
  layoutType: string;
  category: 'body' | 'appendix';
  contentUnitIds: string[];
  slideOverrides: Record<string, unknown>;
  initialOverrides?: Record<string, unknown>;
  hidden?: boolean;
  title?: string;
  kicker?: string;
  dataKey?: string;
  createdAt: string;
}

export interface PptxProject {
  id: string;
  dealId: string;
  packageId: string;
  version: number;
  title: string;
  themeId: string;
  visualPreset?: string;
  brandAccent?: string;
  coverStyle?: 'institutional_masses' | 'split' | 'hero_dark' | 'corporate_card' | 'obsidian_glow';
  layoutStyle?: 'classic' | 'modern' | 'executive' | 'minimal' | 'dramatic' | 'open_frame';
  headerFooter?: HeaderFooterConfig;
  buildingContext?: Record<string, any>;
  targetAudience: string;
  lockVersion: number;
  stage: StudioStage;
  slides: PptxSlide[];
  editorialApprovedBy?: string;
  editorialApprovedAt?: string;
  fileApprovedBy?: string;
  fileApprovedAt?: string;
  artifactFileHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectOptions {
  themeId?: string;
  targetAudience?: string;
  bodySlideCount?: number;
  customSlides?: Partial<PptxSlide>[];
}

export function buildBasicImSlideDefaults(
  buildingName: string,
  docBody: Record<string, any> = {},
  brokerInfo?: Record<string, any>
): Record<string, Record<string, any>> {
  const ssot = docBody.ssot_summary ?? {};
  const enrichment = docBody.enrichment ?? {};
  const br = enrichment.buildingRegister ?? {};
  const poi = enrichment.locationPoi ?? {};
  const hero = docBody.heroCard ?? {};
  const brokerExtras = docBody.broker_extras ?? {};
  const fin = docBody.financials ?? {};

  const askManwon = Number(ssot.asking_price_manwon ?? docBody.asking_price_manwon ?? 0);
  const askEokStr = askManwon > 0
    ? `${Number((askManwon / 10000).toFixed(2))}억 원`
    : (hero.askingPriceBil || ssot.price_band || '');

  const landSqm = Math.round(Number(br.platArea || ssot.land_area_sqm || hero.landAreaM2 || 0) * 100) / 100;
  const landPy = landSqm > 0 ? Number((landSqm * 0.3025).toFixed(1)) : 0;
  const grossSqm = Math.round(Number(br.totalArea || br.totArea || ssot.total_gross_area_sqm || hero.totalGrossAreaSqm || 0) * 100) / 100;
  const grossPy = grossSqm > 0 ? Number((grossSqm * 0.3025).toFixed(1)) : 0;
  const archSqm = Math.round(Number(br.archArea || ssot.arch_area_sqm || 0) * 100) / 100;
  const archPy = archSqm > 0 ? Number((archSqm * 0.3025).toFixed(1)) : 0;

  const unitPriceManwon = (askManwon > 0 && landPy > 0)
    ? Math.round(askManwon / landPy)
    : Number(ssot.price_per_pyeong || 0);

  const depositManwon = Number(ssot.total_deposit_manwon ?? 0);
  const monthlyRentKrw = Number(ssot.monthly_rent_total_krw ?? 0);
  const monthlyRentManwon = monthlyRentKrw > 0 ? Math.round(monthlyRentKrw / 10000) : 0;
  const annualRentManwon = monthlyRentManwon * 12;
  const netInvestManwon = askManwon - depositManwon;
  const calcCapRate = (netInvestManwon > 0 && annualRentManwon > 0)
    ? `${((annualRentManwon / netInvestManwon) * 100).toFixed(2)}%`
    : '';

  const capRateBase = fin.grossYieldOnEquity
    ? `${Number(fin.grossYieldOnEquity).toFixed(2)}%`
    : (hero.capRateBase || ssot.cap_rate_base || calcCapRate || '');

  const capRateStabilized = fin.stabilizedYield
    ? `${Number(fin.stabilizedYield).toFixed(2)}%`
    : (ssot.cap_rate_stabilized || '');

  const above = br.floorsAbove ?? br.grndFlrCnt ?? ssot.floors_above ?? ssot.total_floors ?? '';
  const below = br.floorsBelow ?? br.ugrndFlrCnt ?? ssot.floors_below ?? '';
  const floorsStr = above
    ? (below ? `지하 ${below}층 / 지상 ${above}층` : `지상 ${above}층`)
    : '';

  const bcr = ssot.bcr_pct ?? br.bcRat;
  const far = ssot.far_pct ?? br.vlRat;
  const bcrFarStr = (bcr && far) ? `${Number(Number(bcr).toFixed(2))}% / ${Number(Number(far).toFixed(2))}%` : '';

  const park = (Number(br.parkingCount) > 0 ? br.parkingCount : null) ?? docBody.broker_physical_inputs?.parking_count ?? ssot.parking_count ?? br.parkingCount ?? br.parkingCnt;
  const elev = (Number(br.elevatorCount) > 0 ? br.elevatorCount : null) ?? docBody.broker_physical_inputs?.elevator_count ?? ssot.elevator_count ?? br.elevatorCount ?? br.rideUseLiftCnt;
  const parkElevStr = (park != null || elev != null)
    ? `${park ?? 0}대 / ${elev ?? 0}대`
    : '';

  const nearestStation = poi.nearestStation;
  const transitStr = nearestStation?.name
    ? `${(() => { const ps = parseStationName(nearestStation.name); return formatStationLabel(ps.name, ps.lines); })()} 도보 ${nearestStation.walkMinutes ?? Math.max(1, Math.round((nearestStation.distanceM ?? 400) / 80))}분${nearestStation.distanceM ? ` (약 ${nearestStation.distanceM}m)` : ''}`
    : (ssot.station_name
      ? `${ssot.station_name} 도보 ${ssot.station_walk_min ?? 5}분`
      : (ssot.station_walk_min ? `지하철역 도보 ${ssot.station_walk_min}분 역세권` : '주요 간선도로 및 대중교통 인접'));

  const addressStr = ssot.road_address || ssot.address || docBody.resolved_address || docBody.address || '';
  const jibunStr = ssot.jibun_address || enrichment.landUsePlan?.jibunAddress || '';
  const zoningStr = ssot.zoning || enrichment.landUsePlan?.zoningDistrict || enrichment.landUsePlan?.zoning || br.zoning || '';

  const invPoints: string[] = Array.isArray(brokerExtras.investment_points) && brokerExtras.investment_points.length > 0
    ? brokerExtras.investment_points
    : (Array.isArray(hero.keyPoints) && hero.keyPoints.length > 0 ? hero.keyPoints : []);

  const rawLeases = docBody.floor_leases ?? docBody.rentRoll ?? ssot.floor_leases ?? [];
  const rawComps = docBody.manual_comps ?? brokerExtras.market_comps ?? enrichment.comparableTransactions ?? [];
  const rawPhotos = docBody.photos_v2 ?? docBody.photos ?? docBody.buildingPhotos ?? [];

  const lph = enrichment.landPriceHistory;
  const latestOfficialSqm = Number(lph?.latestPricePerSqm ?? ssot.official_land_price_krw ?? 0);
  const officialPriceStr = latestOfficialSqm > 0
    ? `${Math.round(latestOfficialSqm / 10000).toLocaleString()}만원/㎡ (약 ${Math.round((latestOfficialSqm * 3.305785) / 10000).toLocaleString()}만원/평)`
    : '';

  const brokerCompany = brokerInfo?.company_name || docBody.brokerCompany || 'CRE DEAL 파트너스 중개법인';
  const brokerName = brokerInfo?.display_name || docBody.brokerName || '';
  const brokerPhone = brokerInfo?.phone || docBody.brokerPhone || '';
  const brokerEmail = brokerInfo?.email || docBody.brokerEmail || '';
  const brokerRegNo = brokerInfo?.registration_no || docBody.brokerRegNo || '';

  return {
    cover: {
      title: String(docBody.title || buildingName).replace(/기타\s*매각/g, '빌딩 매각'),
      subtitle: docBody.subtitle || ssot.main_use || ssot.asset_type || '상업용 빌딩 매각 투자설명서',
      askingPrice: askEokStr,
      address: addressStr,
      date: new Date().toISOString().slice(0, 10),
      brokerCompany,
      brokerName,
      brokerPhone,
    },
    highlights: {
      leadSentence: hero.hookText || invPoints[0] || `${addressStr || buildingName} 핵심 수익형 빌딩 매각 요약`,
      keyInvestmentPoint: invPoints[0] || hero.keyInvestmentPoint || `${transitStr} 입지 및 안정적 임대수익 구조`,
      investmentPoint2: invPoints[1] || (zoningStr ? `${zoningStr} · 대지 ${landPy ? `${landPy}평` : '-'} / 연면적 ${grossPy ? `${grossPy}평` : '-'}` : ''),
      investmentPoint3: invPoints[2] || (capRateBase ? `현행 수익률 ${capRateBase}${capRateStabilized ? ` → 안정화 시 ${capRateStabilized}` : ''}` : ''),
      askingPrice: askEokStr,
      grossYield: capRateBase,
      stabilizedYield: capRateStabilized,
      vacancySignal: hero.vacancySignal || ssot.vacancy_signal || (ssot.vacancy_pct != null ? `공실률 ${ssot.vacancy_pct}%` : '안정 운영'),
      landArea: landSqm > 0 ? `${landSqm.toLocaleString()}㎡ (${landPy}평)` : '',
      grossArea: grossSqm > 0 ? `${grossSqm.toLocaleString()}㎡ (${grossPy}평)` : '',
    },
    overview: {
      buildingName: String(ssot.building_name || '').trim() || buildingName,
      address: jibunStr && addressStr && jibunStr !== addressStr ? `${addressStr} (${jibunStr})` : addressStr,
      landArea: landSqm > 0 ? `${landSqm.toLocaleString()}㎡ (${landPy}평)` : '',
      grossArea: grossSqm > 0 ? `${grossSqm.toLocaleString()}㎡ (${grossPy}평)` : '',
      archArea: archSqm > 0 ? `${archSqm.toLocaleString()}㎡ (${archPy}평)` : '',
      floors: floorsStr,
      completionYear: (() => { const y = String(ssot.completion_year || br.useAprDay?.slice(0, 4) || '').trim(); return /^\d{4}$/.test(y) ? `${y}년` : y; })(),
      zoning: zoningStr,
      bcrFar: bcrFarStr,
      parkingElevator: parkElevStr,
      mainUse: br.mainPurpose || br.mainPurpsCdNm || ssot.main_use || ssot.asset_type || '근린생활시설·업무시설',
      structureType: br.structure || br.strctCdNm || ssot.structure_type || '철근콘크리트구조',
      askingPrice: askEokStr ? `${askEokStr} (VAT 별도)` : '',
      landUnitPrice: unitPriceManwon > 0 ? `약 ${unitPriceManwon.toLocaleString()}만 원/평` : '',
      rightCallout: invPoints.length > 0
        ? invPoints.map((p: string) => `• ${p}`).join('\n')
        : (ssot.rights_analysis || '• 건축물대장·토지이용계획확인서 공적장부 대조 완료\n• 역세권 가시성 및 임차 수요 우수 구간'),
    },
    location: {
      address: addressStr,
      transitInfo: transitStr,
      roadInfo: ssot.road_condition || enrichment.landUsePlan?.roadCondition || '차량 진·출입 및 보행 접근성 양호',
      areaInfo: ssot.area_signal ? `${ssot.area_signal} 핵심 상업·업무 권역` : '역세권 배후 상업·업무 밀집 권역',
      locationCallout: brokerExtras.location_note || `${transitStr} 중심의 유동인구 및 배후 오피스·주거 수요가 탄탄한 입지`,
      mapImageUrl: docBody.mapImageUrl || '',
      coordinates: docBody.coordinates || ssot.coordinates || null,
    },
    land: {
      landArea: landSqm > 0 ? `${landSqm.toLocaleString()}㎡ (${landPy}평)` : '',
      landCategory: ssot.land_category || br.jimok || '대',
      zoningInfo: zoningStr,
      bcrFar: bcrFarStr,
      officialLandPrice: officialPriceStr,
      nationalLaw: Array.isArray(enrichment.landUsePlan?.nationalLawItems)
        ? enrichment.landUsePlan.nationalLawItems.join(', ')
        : (zoningStr || '국토의 계획 및 이용에 관한 법률 지역·지구'),
      otherLaws: Array.isArray(enrichment.landUsePlan?.otherLawItems)
        ? enrichment.landUsePlan.otherLawItems.join(', ')
        : '건축법 · 주차장법 · 하수도법 등 관계 법령 적용',
      landCallout: brokerExtras.regulation_note || ssot.land_use_plan || '',
      cadastralMapImage: typeof enrichment.cadastralMapImage === 'object'
        ? enrichment.cadastralMapImage?.base64 || ''
        : (enrichment.cadastralMapImage || ''),
    },
    rentroll: {
      monthlyRentTotal: monthlyRentManwon > 0 ? `${monthlyRentManwon.toLocaleString()}만 원/월` : '',
      depositTotal: depositManwon > 0 ? `${depositManwon.toLocaleString()}만 원` : '',
      occupancyRate: ssot.occupancy_pct != null ? `${ssot.occupancy_pct}%` : (ssot.vacancy_pct != null ? `${100 - Number(ssot.vacancy_pct)}%` : '100%'),
      vacancySignal: ssot.vacancy_signal || (ssot.vacancy_pct != null ? `공실률 ${ssot.vacancy_pct}%` : '전실 임대 가동'),
      turnaroundStrategy: Array.isArray(brokerExtras.post_acquisition_plan)
        ? brokerExtras.post_acquisition_plan.join('\n')
        : (docBody.turnaround_plan?.summary || ''),
      stabilizedYieldTitle: capRateStabilized
        ? `매입 후 전략 — 전환 시 안정화 기대수익률 ${capRateStabilized}`
        : '층별 임대차 현황 및 매입 후 가치 제고(Value-Add) 포인트',
      rentrollNotes: docBody.rentroll_notes || '',
      tenantData: Array.isArray(rawLeases) ? rawLeases : [],
    },
    yield: {
      askingPrice: askEokStr,
      totalDeposit: depositManwon > 0 ? `${(depositManwon / 10000).toFixed(2)}억 원 (${depositManwon.toLocaleString()}만 원)` : '',
      annualRent: annualRentManwon > 0 ? `${(annualRentManwon / 10000).toFixed(2)}억 원/년 (월 ${monthlyRentManwon.toLocaleString()}만 원)` : '',
      capRateBase,
      capRateStabilized,
      pricePerPyeong: unitPriceManwon > 0 ? `${unitPriceManwon.toLocaleString()}만 원/평` : '',
      stabilizedAssumption: fin.stabilizedCaption || '공실 해소 및 주변 시세 수준 재계약 가정 시 기대 수익률',
      yieldNotes: '실투자금 = 매매 희망가 − 총 보증금 기준 (취득세·중개보수 및 대출 레버리지 별도)',
    },
    comps: {
      compsTitle: '인근 유사 매매·임대 실거래 비교 사례',
      targetLandPricePerPy: unitPriceManwon > 0 ? `${unitPriceManwon.toLocaleString()}만 원/평` : '',
      compsNotes: brokerExtras.comps_note || '인근 동일 용도지역 내 최근 거래 사례 및 시장 호가 비교 (중개인 조사 및 국토교통부 실거래가 기준)',
      compsRows: Array.isArray(rawComps) ? rawComps : [],
    },
    gallery: {
      galleryTitle: '현장 실사 사진 및 내·외관 컨디션',
      galleryLayout: 'grid_4',
      photos: Array.isArray(rawPhotos) ? rawPhotos : [],
    },
    closing: {
      closingLine: brokerExtras.closing_line || `${buildingName} 매입 검토 및 현장 실사 일정은 아래 담당 중개법인에 문의해 주시기 바랍니다.`,
      brokerCompany,
      brokerName,
      brokerPhone,
      brokerEmail,
      brokerRegNo,
      disclaimer: docBody.disclaimer || '본 자료는 매수인의 투자 판단을 돕기 위한 참고자료로서 법적 효력이 없으며, 최종 계약 전 공적장부 및 현장 실사를 통해 제반 사항을 직접 확인하시기 바랍니다.',
    },
  };
}

export class PptxStudioService {
  private projects = new Map<string, PptxProject>();

  async createProject(
    dealId: string,
    packageId: string,
    title: string,
    themeId = 'institutional_dark_gold',
    options?: CreateProjectOptions
  ): Promise<PptxProject> {
    const projectId = randomUUID();
    const now = new Date().toISOString();

    const defaultSlidesSpec: Array<{
      layoutType: string;
      category: 'body' | 'appendix';
      title: string;
      kicker: string;
      dataKey: string;
      contentUnitIds: string[];
    }> = [
      { layoutType: 'A01_COVER', category: 'body', title, kicker: 'INVESTMENT MEMORANDUM', dataKey: 'cover', contentUnitIds: ['cover-title', 'cover-meta'] },
      { layoutType: 'A02_OVERVIEW', category: 'body', title: '투자 하이라이트 및 자산 개요', kicker: 'EXECUTIVE SUMMARY', dataKey: 'overview', contentUnitIds: ['spec-table', 'price-card'] },
      { layoutType: 'A04_SPLIT_VALUE', category: 'body', title: '입지 및 자산 가치 제안', kicker: 'VALUE PROPOSITION', dataKey: 'thesis', contentUnitIds: ['thesis-lead', 'thesis-cards'] },
      { layoutType: 'A07_THREE_BLOCK', category: 'body', title: '교통 및 권역 입지 분석', kicker: 'LOCATION ANALYSIS', dataKey: 'location', contentUnitIds: ['transport-card', 'infra-card', 'catchment-card'] },
      { layoutType: 'A08_RENTROLL', category: 'body', title: '임대차 현황 및 렌트롤 상세', kicker: 'RENT ROLL OVERVIEW', dataKey: 'rentRoll', contentUnitIds: ['rent-table', 'wale-summary'] },
      { layoutType: 'A03_TABLE', category: 'body', title: '층별 면적 및 임대료 현황', kicker: 'TENANCY & CASH FLOW', dataKey: 'tenancy', contentUnitIds: ['floor-table', 'deposit-summary'] },
      { layoutType: 'A05_ASYMMETRIC_ALT', category: 'body', title: '인근 권역 실거래 비교 사례', kicker: 'MARKET COMPARABLES', dataKey: 'comparables', contentUnitIds: ['comp-lead', 'comp-metric-stack'] },
      { layoutType: 'A06_DIAGRAM', category: 'body', title: '자산 MD 구성 및 앵커 테넌트', kicker: 'MD PLANNING & ANCHORS', dataKey: 'mdPlan', contentUnitIds: ['diagram-center', 'diagram-nodes'] },
      { layoutType: 'A11_ROOM_SPEC', category: 'body', title: '기준층 공간 제원 및 전용율', kicker: 'FLOOR SPECIFICATIONS', dataKey: 'specs', contentUnitIds: ['space-grid-1', 'space-grid-2'] },
      { layoutType: 'A09_PROCESS', category: 'body', title: '매각 자문 및 우선협상 프로세스', kicker: 'TRANSACTION PROCESS', dataKey: 'process', contentUnitIds: ['step-pipeline', 'timeline-table'] },
      { layoutType: 'A14_GALLERY', category: 'body', title: '자산 내외부 주요 사진', kicker: 'PROPERTY GALLERY', dataKey: 'gallery', contentUnitIds: ['photo-grid-main', 'photo-grid-sub'] },
      { layoutType: 'A02_FINANCIAL', category: 'body', title: 'NOI 및 연 순수익률(Cap Rate) 분석', kicker: 'FINANCIAL ANALYSIS', dataKey: 'financials', contentUnitIds: ['noi-card', 'yield-chart'] },
      { layoutType: 'A07_ZONING', category: 'body', title: '용도지역 및 도시계획 조례 검토', kicker: 'LEGAL & ZONING', dataKey: 'zoning', contentUnitIds: ['zone-type', 'far-bcr', 'permit-note'] },
      { layoutType: 'A04_TENANCY', category: 'body', title: '주요 임차인 신용도 및 만기 구조', kicker: 'TENANT CREDIT & WALE', dataKey: 'tenantCredit', contentUnitIds: ['wale-chart', 'credit-rating'] },
      { layoutType: 'A08_EXPENSE', category: 'body', title: '운영비용(OPEX) 및 순영업소득 추정', kicker: 'OPEX & NET OPERATING INCOME', dataKey: 'opex', contentUnitIds: ['opex-breakdown', 'gop-card'] },
      { layoutType: 'A10_CLOSING', category: 'body', title: '자문단 정보 및 법적 면책 고지', kicker: 'DISCLAIMER & CONTACT', dataKey: 'closing', contentUnitIds: ['advisory-team', 'legal-disclaimer'] },
      { layoutType: 'A03_LAND_USE', category: 'appendix', title: '[부록] 토지이용계획 확인원 발췌', kicker: 'APPENDIX 01', dataKey: 'landUseAppendix', contentUnitIds: ['land-use-table'] },
      { layoutType: 'A03_BUILDING_REGISTER', category: 'appendix', title: '[부록] 일반건축물대장 총괄표', kicker: 'APPENDIX 02', dataKey: 'registerAppendix', contentUnitIds: ['register-table'] },
      { layoutType: 'A14_CADASTRAL', category: 'appendix', title: '[부록] 지적도 및 도시계획선 현황', kicker: 'APPENDIX 03', dataKey: 'cadastralAppendix', contentUnitIds: ['cadastral-map'] },
      { layoutType: 'A02_COMMERCIAL_DATA', category: 'appendix', title: '[부록] 상권 유동인구 및 배후세대 통계', kicker: 'APPENDIX 04', dataKey: 'commercialAppendix', contentUnitIds: ['commercial-stats'] },
    ];

    const initialSlides: PptxSlide[] = defaultSlidesSpec.map((spec, idx) => ({
      id: randomUUID(),
      projectId,
      slideIndex: idx + 1,
      layoutType: spec.layoutType,
      category: spec.category,
      title: spec.title,
      kicker: spec.kicker,
      dataKey: spec.dataKey,
      contentUnitIds: spec.contentUnitIds,
      slideOverrides: {},
      hidden: false,
      createdAt: now,
    }));

    const project: PptxProject = {
      id: projectId,
      dealId,
      packageId,
      version: 1,
      title,
      themeId: options?.themeId || themeId,
      targetAudience: options?.targetAudience || 'investor',
      lockVersion: 1,
      stage: 'S00_INIT',
      slides: initialSlides,
      createdAt: now,
      updatedAt: now,
    };

    await this.saveProject(project);
    return project;
  }

  async createBasicImProject(
    buildingId: string,
    buildingName: string,
    docBody: Record<string, any>,
    brokerInfo?: Record<string, any>
  ): Promise<PptxProject> {
    const projectId = randomUUID();
    const now = new Date().toISOString();
    const cleanBuildingName = String(buildingName || 'CRE 빌딩').replace(/\s*Basic\s*IM$/i, '').trim();
    const title = `${cleanBuildingName} Basic IM`;

    const defaultsByKey = buildBasicImSlideDefaults(cleanBuildingName, docBody || {}, brokerInfo);
    const hasComps = Array.isArray(defaultsByKey.comps?.compsRows) && defaultsByKey.comps.compsRows.length > 0;

    // Canonical 10-Slide Basic IM Studio Sequence (Rule 47 + Optional Market Comps)
    const basicImSlides: Array<{
      layoutType: string;
      category: 'body';
      title: string;
      kicker: string;
      dataKey: string;
      defaultHidden?: boolean;
    }> = [
      { layoutType: 'A01_COVER', category: 'body', title: cleanBuildingName, kicker: 'INVESTMENT MEMORANDUM', dataKey: 'cover' },
      { layoutType: 'A02_STAT_GRID', category: 'body', title: '투자 핵심 요약', kicker: 'KEY HIGHLIGHTS', dataKey: 'highlights' },
      { layoutType: 'A04_ASYMMETRIC', category: 'body', title: '물건 개요 및 건축물 제원', kicker: 'PROPERTY OVERVIEW', dataKey: 'overview' },
      { layoutType: 'A06_DIAGRAM', category: 'body', title: '입지 및 교통·상권 분석', kicker: 'LOCATION ANALYSIS', dataKey: 'location' },
      { layoutType: 'A27_LAND_USE_PLAN', category: 'body', title: '토지 정보 및 공법 규제', kicker: 'LAND & ZONING', dataKey: 'land' },
      { layoutType: 'A24_RENTROLL_STACKING', category: 'body', title: '렌트롤 및 스태킹 플랜', kicker: 'RENT ROLL & STACKING', dataKey: 'rentroll' },
      { layoutType: 'A23_YIELD_FORMULA', category: 'body', title: '투자수익률 및 공시지가 분석', kicker: 'YIELD ANALYSIS', dataKey: 'yield' },
      { layoutType: 'A26_BROKER_EXTRAS', category: 'body', title: '인근 시세 비교 분석', kicker: 'MARKET COMPARABLES', dataKey: 'comps', defaultHidden: !hasComps },
      { layoutType: 'A14_GALLERY', category: 'body', title: '현장 사진 갤러리', kicker: 'PROPERTY GALLERY', dataKey: 'gallery' },
      { layoutType: 'A10_CLOSING', category: 'body', title: '문의 및 유의사항', kicker: 'DISCLAIMER & CONTACT', dataKey: 'closing' },
    ];

    const slides: PptxSlide[] = basicImSlides.map((spec, idx) => {
      const initial = defaultsByKey[spec.dataKey] ? { ...defaultsByKey[spec.dataKey] } : {};
      return {
        id: randomUUID(),
        projectId,
        slideIndex: idx + 1,
        layoutType: spec.layoutType,
        category: spec.category,
        title: spec.title,
        kicker: spec.kicker,
        dataKey: spec.dataKey,
        contentUnitIds: [],
        slideOverrides: initial,
        initialOverrides: { ...initial },
        hidden: Boolean(spec.defaultHidden),
        createdAt: now,
      };
    });

    const project: PptxProject = {
      id: projectId,
      dealId: buildingId,
      packageId: `basic-im-${Date.now()}`,
      version: 1,
      title,
      themeId: 'credeal_basic',
      visualPreset: docBody?.preset || 'credeal_basic',
      coverStyle: 'institutional_masses',
      layoutStyle: 'classic',
      headerFooter: {
        ...DEFAULT_HEADER_FOOTER,
        companyName: defaultsByKey.cover?.brokerCompany || DEFAULT_HEADER_FOOTER.companyName,
      },
      buildingContext: {
        buildingName: cleanBuildingName,
        ssot_summary: docBody?.ssot_summary ?? {},
        heroCard: docBody?.heroCard ?? {},
        financials: docBody?.financials ?? {},
        floor_leases: docBody?.floor_leases ?? docBody?.rentRoll ?? [],
        manual_comps: docBody?.manual_comps ?? docBody?.broker_extras?.market_comps ?? [],
        broker_extras: docBody?.broker_extras ?? {},
        photos: docBody?.photos_v2 ?? docBody?.photos ?? docBody?.buildingPhotos ?? [],
        enrichment: {
          locationPoi: docBody?.enrichment?.locationPoi ?? null,
          landUsePlan: docBody?.enrichment?.landUsePlan ?? null,
          buildingRegister: docBody?.enrichment?.buildingRegister ?? null,
          landPriceHistory: docBody?.enrichment?.landPriceHistory ?? null,
          cadastralMapImage: typeof docBody?.enrichment?.cadastralMapImage === 'object'
            ? docBody?.enrichment?.cadastralMapImage?.base64 ?? null
            : (docBody?.enrichment?.cadastralMapImage ?? null),
        },
        broker: brokerInfo ?? null,
      },
      targetAudience: 'investor',
      lockVersion: 1,
      stage: 'S00_INIT',
      slides,
      createdAt: now,
      updatedAt: now,
    };

    await this.saveProject(project);
    return project;
  }

  /**
   * 기존 프로젝트가 있더라도 최신 IM 문서(docBody)의 실데이터/빌딩 컨텍스트를 보강하고,
   * 누락된 슬라이드(예: comps)나 빈 초기값을 채워 넣습니다 (사용자 편집값은 보존).
   */
  async enrichProjectFromDocBody(
    project: PptxProject,
    docBody: Record<string, any>,
    buildingName?: string,
    brokerInfo?: Record<string, any>
  ): Promise<PptxProject> {
    if (!docBody || Object.keys(docBody).length === 0) return project;
    const cleanName = String(buildingName || project.title || 'CRE 빌딩')
      .replace(/기타\s*매각/g, '빌딩 매각')
      .replace(/소재\s*기타/g, '소재 상업용 빌딩')
      .replace(/\s*Basic\s*IM$/i, '')
      .trim();
    project.title = `${cleanName} Basic IM`;
    const defaultsByKey = buildBasicImSlideDefaults(cleanName, docBody, brokerInfo);

    // Ensure comps slide exists if project was created with 9 slides
    const hasCompsSlide = project.slides.some(s => s.dataKey === 'comps' || s.dataKey === 'brokerComps');
    if (!hasCompsSlide && project.themeId === 'credeal_basic') {
      const hasCompsData = Array.isArray(defaultsByKey.comps?.compsRows) && defaultsByKey.comps.compsRows.length > 0;
      const compsSlide: PptxSlide = {
        id: randomUUID(),
        projectId: project.id,
        slideIndex: project.slides.length,
        layoutType: 'A26_BROKER_EXTRAS',
        category: 'body',
        title: '인근 시세 비교 분석',
        kicker: 'MARKET COMPARABLES',
        dataKey: 'comps',
        contentUnitIds: [],
        slideOverrides: { ...(defaultsByKey.comps || {}) },
        initialOverrides: { ...(defaultsByKey.comps || {}) },
        hidden: !hasCompsData,
        createdAt: new Date().toISOString(),
      };
      const closingIdx = project.slides.findIndex(s => s.dataKey === 'closing');
      if (closingIdx >= 0) {
        project.slides.splice(closingIdx, 0, compsSlide);
      } else {
        project.slides.push(compsSlide);
      }
      project.slides.forEach((s, idx) => { s.slideIndex = idx + 1; });
    }

    for (const slide of project.slides) {
      const key = slide.dataKey || '';
      const def = defaultsByKey[key];
      if (slide.title) {
        slide.title = slide.title.replace(/기타\s*매각/g, '빌딩 매각').replace(/소재\s*기타/g, '소재 상업용 빌딩');
      }
      if (def) {
        const oldInitial = (slide.initialOverrides || {}) as Record<string, unknown>;
        const hasOldInitial = Object.keys(oldInitial).length > 0;
        slide.initialOverrides = { ...def };
        const cleanedExisting: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(slide.slideOverrides || {})) {
          if (v !== undefined && v !== null && v !== '') {
            if (hasOldInitial && k in oldInitial && JSON.stringify(oldInitial[k]) === JSON.stringify(v)) {
              // 사용자가 수정하지 않은 구버전 초기 추출값은 최신 def 값으로 자동 갱신되도록 건너뜀
              continue;
            }
            cleanedExisting[k] = typeof v === 'string'
              ? v
                  .replace(/기타\s*매각/g, '빌딩 매각')
                  .replace(/소재\s*기타/g, '소재 상업용 빌딩')
                  .replace(/([가-힣A-Za-z0-9]+역)\s+([가-힣0-9]+(?:선|라인))역/g, '$1($2)')
                  .replace(/(\d[\d,]*)\.(\d{2})\d+(\s*㎡)/g, '$1.$2$3')
              : v;
          }
        }
        slide.slideOverrides = {
          ...def,
          ...cleanedExisting,
        };
      }
    }

    project.buildingContext = {
      buildingName: cleanName,
      ssot_summary: docBody?.ssot_summary ?? project.buildingContext?.ssot_summary ?? {},
      heroCard: docBody?.heroCard ?? project.buildingContext?.heroCard ?? {},
      financials: docBody?.financials ?? project.buildingContext?.financials ?? {},
      floor_leases: docBody?.floor_leases ?? docBody?.rentRoll ?? project.buildingContext?.floor_leases ?? [],
      manual_comps: docBody?.manual_comps ?? docBody?.broker_extras?.market_comps ?? project.buildingContext?.manual_comps ?? [],
      broker_extras: docBody?.broker_extras ?? project.buildingContext?.broker_extras ?? {},
      photos: docBody?.photos_v2 ?? docBody?.photos ?? docBody?.buildingPhotos ?? project.buildingContext?.photos ?? [],
      enrichment: {
        locationPoi: docBody?.enrichment?.locationPoi ?? project.buildingContext?.enrichment?.locationPoi ?? null,
        landUsePlan: docBody?.enrichment?.landUsePlan ?? project.buildingContext?.enrichment?.landUsePlan ?? null,
        buildingRegister: docBody?.enrichment?.buildingRegister ?? project.buildingContext?.enrichment?.buildingRegister ?? null,
        landPriceHistory: docBody?.enrichment?.landPriceHistory ?? project.buildingContext?.enrichment?.landPriceHistory ?? null,
        cadastralMapImage: typeof docBody?.enrichment?.cadastralMapImage === 'object'
          ? docBody?.enrichment?.cadastralMapImage?.base64 ?? null
          : (docBody?.enrichment?.cadastralMapImage ?? project.buildingContext?.enrichment?.cadastralMapImage ?? null),
      },
      broker: brokerInfo ?? project.buildingContext?.broker ?? null,
    };

    if (!project.headerFooter) {
      project.headerFooter = {
        ...DEFAULT_HEADER_FOOTER,
        companyName: defaultsByKey.cover?.brokerCompany || DEFAULT_HEADER_FOOTER.companyName,
      };
    }

    await this.saveProject(project);
    return project;
  }

  async getProject(projectId: string): Promise<PptxProject> {
    const memoryProject = this.projects.get(projectId);
    if (memoryProject) {
      return memoryProject;
    }
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('document_objects')
      .select('body')
      .eq('id', projectId)
      .in('document_type', ['snapshot', 'owner_prep_memo', 'building_snapshot_draft', 'im_lite_draft', 'mobile_im'])
      .maybeSingle();

    if (!data?.body || !Array.isArray((data.body as any)?.slides)) {
      throw new Error(`PPTX_PROJECT_NOT_FOUND: Project ${projectId} does not exist`);
    }
    const project = data.body as unknown as PptxProject;
    this.projects.set(projectId, project);
    return project;
  }

  async findProjectByDealId(dealId: string): Promise<PptxProject | undefined> {
    for (const project of this.projects.values()) {
      if (project.dealId === dealId) {
        return project;
      }
    }
    const supabase = createServiceClient();
    const { data: rows } = await supabase
      .from('document_objects')
      .select('body')
      .eq('building_id', dealId)
      .in('document_type', ['snapshot', 'owner_prep_memo', 'building_snapshot_draft', 'im_lite_draft', 'mobile_im'])
      .order('created_at', { ascending: false })
      .limit(10);

    const match = (rows || []).find(r => r?.body && Array.isArray((r.body as any).slides));
    if (match?.body) {
      const proj = match.body as unknown as PptxProject;
      this.projects.set(proj.id, proj);
      return proj;
    }
    return undefined;
  }

  async updateProjectTheme(
    projectId: string,
    themePatch: {
      themeId?: string;
      visualPreset?: string;
      brandAccent?: string;
      coverStyle?: PptxProject['coverStyle'];
      layoutStyle?: PptxProject['layoutStyle'];
      headerFooter?: Partial<HeaderFooterConfig>;
    },
    expectedLockVersion?: number
  ): Promise<PptxProject> {
    const project = await this.getProject(projectId);

    if (expectedLockVersion !== undefined && project.lockVersion !== expectedLockVersion) {
      throw new Error(
        `STALE_LOCK_ERROR: Concurrent edit detected on project ${projectId} (expected ${expectedLockVersion}, actual ${project.lockVersion})`
      );
    }

    if (themePatch.themeId !== undefined) project.themeId = themePatch.themeId;
    if (themePatch.visualPreset !== undefined) project.visualPreset = themePatch.visualPreset;
    if (themePatch.brandAccent !== undefined) project.brandAccent = themePatch.brandAccent;
    if (themePatch.coverStyle !== undefined) project.coverStyle = themePatch.coverStyle;
    if (themePatch.layoutStyle !== undefined) project.layoutStyle = themePatch.layoutStyle;
    if (themePatch.headerFooter !== undefined) {
      project.headerFooter = {
        ...(project.headerFooter ?? DEFAULT_HEADER_FOOTER),
        ...themePatch.headerFooter,
      };
    }

    project.lockVersion += 1;
    project.version += 1;
    project.updatedAt = new Date().toISOString();

    await this.saveProject(project);
    return project;
  }

  async resetSlideOverrides(
    projectId: string,
    slideId: string,
    expectedLockVersion?: number
  ): Promise<PptxProject> {
    const project = await this.getProject(projectId);

    if (expectedLockVersion !== undefined && project.lockVersion !== expectedLockVersion) {
      throw new Error(
        `STALE_LOCK_ERROR: Concurrent edit detected on project ${projectId} (expected ${expectedLockVersion}, actual ${project.lockVersion})`
      );
    }

    const slide = project.slides.find((s) => s.id === slideId);
    if (!slide) {
      throw new Error(`SLIDE_NOT_FOUND: Slide ${slideId} does not exist`);
    }

    slide.slideOverrides = slide.initialOverrides ? { ...slide.initialOverrides } : {};
    project.lockVersion += 1;
    project.version += 1;
    project.updatedAt = new Date().toISOString();

    await this.saveProject(project);
    return project;
  }

  async updateSlideLayout(
    projectId: string,
    slideIndex: number,
    layoutType: string,
    expectedLockVersion?: number
  ): Promise<PptxProject> {
    const project = await this.getProject(projectId);

    if (expectedLockVersion !== undefined && project.lockVersion !== expectedLockVersion) {
      throw new Error(
        `STALE_LOCK_ERROR: Concurrent edit detected on project ${projectId} (expected ${expectedLockVersion}, actual ${project.lockVersion})`
      );
    }

    const slide = project.slides.find((s) => s.slideIndex === slideIndex);
    if (!slide) {
      throw new Error(`SLIDE_NOT_FOUND: Slide at index ${slideIndex} does not exist`);
    }

    slide.layoutType = layoutType;
    project.lockVersion += 1;
    project.version += 1;
    project.updatedAt = new Date().toISOString();

    await this.saveProject(project);
    return project;
  }

  async reorderSlides(
    projectId: string,
    orderedSlideIds: string[],
    expectedLockVersion?: number
  ): Promise<PptxProject> {
    const project = await this.getProject(projectId);

    if (expectedLockVersion !== undefined && project.lockVersion !== expectedLockVersion) {
      throw new Error(
        `STALE_LOCK_ERROR: Concurrent edit detected on project ${projectId} (expected ${expectedLockVersion}, actual ${project.lockVersion})`
      );
    }

    const slideMap = new Map(project.slides.map((s) => [s.id, s]));
    const reordered: PptxSlide[] = [];

    for (const id of orderedSlideIds) {
      const slide = slideMap.get(id);
      if (slide) {
        reordered.push(slide);
        slideMap.delete(id);
      }
    }

    for (const remaining of slideMap.values()) {
      reordered.push(remaining);
    }

    reordered.forEach((slide, idx) => {
      slide.slideIndex = idx + 1;
    });

    project.slides = reordered;
    project.lockVersion += 1;
    project.version += 1;
    project.updatedAt = new Date().toISOString();

    await this.saveProject(project);
    return project;
  }

  async toggleSlideVisibility(
    projectId: string,
    slideId: string,
    hidden?: boolean,
    expectedLockVersion?: number
  ): Promise<PptxProject> {
    const project = await this.getProject(projectId);

    if (expectedLockVersion !== undefined && project.lockVersion !== expectedLockVersion) {
      throw new Error(
        `STALE_LOCK_ERROR: Concurrent edit detected on project ${projectId} (expected ${expectedLockVersion}, actual ${project.lockVersion})`
      );
    }

    const slide = project.slides.find((s) => s.id === slideId);
    if (!slide) {
      throw new Error(`SLIDE_NOT_FOUND: Slide ${slideId} does not exist`);
    }

    // Protect cover and closing slides from being hidden
    if (slide.dataKey === 'cover' || slide.dataKey === 'closing') {
      slide.hidden = false;
    } else {
      slide.hidden = hidden !== undefined ? hidden : !slide.hidden;
    }

    project.lockVersion += 1;
    project.version += 1;
    project.updatedAt = new Date().toISOString();

    await this.saveProject(project);
    return project;
  }

  async patchSlideOverrides(
    projectId: string,
    slideId: string,
    overrides: Record<string, unknown>,
    expectedLockVersion?: number
  ): Promise<PptxProject> {
    const project = await this.getProject(projectId);

    if (expectedLockVersion !== undefined && project.lockVersion !== expectedLockVersion) {
      throw new Error(
        `STALE_LOCK_ERROR: Concurrent edit detected on project ${projectId} (expected ${expectedLockVersion}, actual ${project.lockVersion})`
      );
    }

    const slide = project.slides.find((s) => s.id === slideId);
    if (!slide) {
      throw new Error(`SLIDE_NOT_FOUND: Slide ${slideId} does not exist`);
    }

    slide.slideOverrides = {
      ...slide.slideOverrides,
      ...overrides,
    };

    if (typeof overrides.title === 'string') {
      slide.title = overrides.title;
    }
    if (typeof overrides.kicker === 'string') {
      slide.kicker = overrides.kicker;
    }
    if (typeof overrides.layoutType === 'string') {
      slide.layoutType = overrides.layoutType;
    }
    if (typeof overrides.hidden === 'boolean' && slide.dataKey !== 'cover' && slide.dataKey !== 'closing') {
      slide.hidden = overrides.hidden;
    }

    project.lockVersion += 1;
    project.version += 1;
    project.updatedAt = new Date().toISOString();

    await this.saveProject(project);
    return project;
  }

  async advanceStage(
    projectId: string,
    nextStage: StudioStage,
    expectedLockVersion?: number
  ): Promise<PptxProject> {
    const project = await this.getProject(projectId);

    if (expectedLockVersion !== undefined && project.lockVersion !== expectedLockVersion) {
      throw new Error(
        `STALE_LOCK_ERROR: Lock mismatch advancing stage on project ${projectId}`
      );
    }

    project.stage = nextStage;
    project.lockVersion += 1;
    project.updatedAt = new Date().toISOString();

    await this.saveProject(project);
    return project;
  }

  async saveProject(project: PptxProject): Promise<void> {
    project.updatedAt = new Date().toISOString();
    this.projects.set(project.id, project);
    try {
      const supabase = createServiceClient();
      const { error } = await supabase.from('document_objects').upsert({
        id: project.id,
        building_id: project.dealId,
        document_type: 'snapshot',
        source_type: 'manual',
        title: project.title,
        body: project as any,
        status: 'draft',
        visibility: 'internal_only'
      });
      if (error) {
        console.warn('[studio-service] saveProject upsert to DB failed, maintaining in-memory project:', error.message);
      }
    } catch (err: any) {
      console.warn('[studio-service] saveProject DB client failed, maintaining in-memory project:', err?.message || err);
    }
  }
}

export const studioService = new PptxStudioService();
