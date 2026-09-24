import { createServiceClient } from '@/lib/supabase/service';
import { randomUUID } from 'crypto';
import type { StudioStage } from './project/types';

export interface PptxSlide {
  id: string;
  projectId: string;
  slideIndex: number;
  layoutType: string;
  category: 'body' | 'appendix';
  contentUnitIds: string[];
  slideOverrides: Record<string, unknown>;
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

export class PptxStudioService {
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
  ): Promise<PptxProject> {
    const projectId = randomUUID();
    const now = new Date().toISOString();
    const title = `${buildingName} Basic IM`;

    const basicImSlides: Array<{
      layoutType: string;
      category: 'body';
      title: string;
      kicker: string;
      dataKey: string;
    }> = [
      { layoutType: 'A01_COVER', category: 'body', title, kicker: 'INVESTMENT MEMORANDUM', dataKey: 'cover' },
      { layoutType: 'A02_STAT_GRID', category: 'body', title: '투자 핵심 포인트', kicker: 'KEY HIGHLIGHTS', dataKey: 'highlights' },
      { layoutType: 'A04_ASYMMETRIC', category: 'body', title: '건물 개요 및 토지 정보', kicker: 'PROPERTY OVERVIEW', dataKey: 'overview' },
      { layoutType: 'A06_DIAGRAM', category: 'body', title: '입지 분석', kicker: 'LOCATION ANALYSIS', dataKey: 'location' },
      { layoutType: 'A05_LAND_INFO', category: 'body', title: '토지 정보 및 법규 검토', kicker: 'LAND & ZONING', dataKey: 'land' },
      { layoutType: 'A14_GALLERY', category: 'body', title: '자산 사진', kicker: 'PROPERTY GALLERY', dataKey: 'gallery' },
      { layoutType: 'A24_RENTROLL_STACKING', category: 'body', title: '렌트롤 및 스태킹 플랜', kicker: 'RENT ROLL & STACKING', dataKey: 'rentroll' },
      { layoutType: 'A23_YIELD_FORMULA', category: 'body', title: '수익률 분석', kicker: 'YIELD ANALYSIS', dataKey: 'yield' },
      { layoutType: 'A10_CLOSING', category: 'body', title: '담당자 정보 및 면책', kicker: 'DISCLAIMER & CONTACT', dataKey: 'closing' },
    ];

    const slides: PptxSlide[] = basicImSlides.map((spec, idx) => ({
      id: randomUUID(),
      projectId,
      slideIndex: idx + 1,
      layoutType: spec.layoutType,
      category: spec.category,
      title: spec.title,
      kicker: spec.kicker,
      dataKey: spec.dataKey,
      contentUnitIds: [],
      slideOverrides: {},
      hidden: false,
      createdAt: now,
    }));

    if (docBody) {
      slides[0].slideOverrides = {
        title: docBody.title || buildingName,
        subtitle: docBody.subtitle || '',
        date: new Date().toISOString().slice(0, 10),
      };
      if (docBody.heroCard) {
        slides[1].slideOverrides = {
          askingPrice: docBody.heroCard.askingPriceBil || '',
          grossYield: docBody.heroCard.capRateBase || '',
          vacancySignal: docBody.heroCard.vacancySignal || '',
          keyInvestmentPoint: docBody.heroCard.keyInvestmentPoint || '',
        };
      }
      if (docBody.mapImageUrl || docBody.coordinates) {
        slides[3].slideOverrides = {
          mapImageUrl: docBody.mapImageUrl || '',
          coordinates: docBody.coordinates || null,
          address: docBody.ssot_summary?.address || docBody.address || '',
        };
      }
      if (docBody.buildingPhotos) {
        slides[5].slideOverrides = { photos: docBody.buildingPhotos };
      }

      const ssot = docBody.ssot_summary ?? {};

      {
        const overrides: Record<string, any> = {};
        if (ssot.building_name) overrides.buildingName = ssot.building_name;
        if (ssot.address || ssot.raw_address) overrides.address = ssot.address || ssot.raw_address;
        if (ssot.total_gross_area_sqm) overrides.grossArea = `${Number(ssot.total_gross_area_sqm).toLocaleString()}㎡`;
        if (ssot.total_floors || ssot.floors_above) {
          const above = ssot.floors_above ?? ssot.total_floors ?? '';
          const below = ssot.floors_below ?? '';
          overrides.floors = below ? `지하 ${below}층 / 지상 ${above}층` : `${above}층`;
        }
        if (ssot.completion_year) overrides.completionYear = String(ssot.completion_year);
        if (ssot.main_use || ssot.asset_type) overrides.mainUse = ssot.main_use || ssot.asset_type;
        if (ssot.structure_type) overrides.structureType = ssot.structure_type;
        if (ssot.rights_analysis) overrides.rightCallout = ssot.rights_analysis;
        if (Object.keys(overrides).length > 0) {
          slides[2].slideOverrides = overrides;
        }
      }

      {
        const overrides: Record<string, any> = {};
        if (ssot.land_area_sqm) overrides.landArea = `${Number(ssot.land_area_sqm).toLocaleString()}㎡`;
        if (ssot.zoning) overrides.zoningInfo = ssot.zoning;
        if (ssot.land_use_plan) overrides.landUsePlan = ssot.land_use_plan;
        if (ssot.far_pct) overrides.farPct = `${ssot.far_pct}%`;
        if (ssot.bcr_pct) overrides.bcrPct = `${ssot.bcr_pct}%`;
        if (ssot.official_land_price_krw) overrides.officialLandPrice = `${(ssot.official_land_price_krw / 10000).toLocaleString()}만원/㎡`;
        if (Object.keys(overrides).length > 0) {
          slides[4].slideOverrides = overrides;
        }
      }

      {
        const overrides: Record<string, any> = {};
        const leases = docBody.floor_leases ?? docBody.rentRoll ?? ssot.floor_leases;
        if (Array.isArray(leases) && leases.length > 0) {
          overrides.tenantData = leases;
        }
        if (ssot.monthly_rent_total_krw) {
          overrides.monthlyRentTotal = `${(ssot.monthly_rent_total_krw / 10000).toLocaleString()}만원`;
        }
        if (ssot.vacancy_signal || ssot.vacancy_pct != null) {
          overrides.vacancySignal = ssot.vacancy_signal || `${ssot.vacancy_pct}%`;
        }
        if (ssot.occupancy_pct != null) {
          overrides.occupancyRate = `${ssot.occupancy_pct}%`;
        }
        if (Object.keys(overrides).length > 0) {
          slides[6].slideOverrides = overrides;
        }
      }

      {
        const overrides: Record<string, any> = {};
        if (ssot.cap_rate_base) overrides.capRateBase = ssot.cap_rate_base;
        if (ssot.cap_rate_stabilized) overrides.capRateStabilized = ssot.cap_rate_stabilized;
        if (ssot.noi_krw) overrides.noiKrw = ssot.noi_krw;
        if (ssot.asking_price_manwon) {
          overrides.askingPrice = `${(ssot.asking_price_manwon / 10000).toLocaleString()}억원`;
        }
        if (ssot.price_per_pyeong) overrides.pricePerPyeong = `${Number(ssot.price_per_pyeong).toLocaleString()}만원/평`;
        if (Object.keys(overrides).length > 0) {
          slides[7].slideOverrides = overrides;
        }
      }

      if (docBody.brokerName || docBody.brokerPhone) {
        slides[8].slideOverrides = {
          brokerName: docBody.brokerName || '',
          brokerPhone: docBody.brokerPhone || '',
          brokerCompany: docBody.brokerCompany || '',
        };
      }
    }

    const project: PptxProject = {
      id: projectId,
      dealId: buildingId,
      packageId: `basic-im-${Date.now()}`,
      version: 1,
      title,
      themeId: 'credeal_basic',
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

  async getProject(projectId: string): Promise<PptxProject> {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('document_objects')
      .select('body')
      .eq('id', projectId)
      .in('document_type', ['im_lite_draft', 'building_snapshot_draft', 'mobile_im'])
      .maybeSingle();

    if (!data?.body) {
      throw new Error(`PPTX_PROJECT_NOT_FOUND: Project ${projectId} does not exist`);
    }
    return data.body as unknown as PptxProject;
  }

  async findProjectByDealId(dealId: string): Promise<PptxProject | undefined> {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('document_objects')
      .select('body')
      .eq('building_id', dealId)
      .in('document_type', ['im_lite_draft', 'building_snapshot_draft', 'mobile_im'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.body ? (data.body as unknown as PptxProject) : undefined;
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

    slide.hidden = hidden !== undefined ? hidden : !slide.hidden;
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
    if (typeof overrides.hidden === 'boolean') {
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
    const supabase = createServiceClient();
    const { error } = await supabase.from('document_objects').upsert({
      id: project.id,
      building_id: project.dealId,
      document_type: 'mobile_im',
      source_type: 'manual',
      title: project.title,
      body: project as any,
      status: 'draft',
      visibility: 'internal_only'
    });
    if (error) {
      console.error('[studio-service] saveProject upsert failed:', error);
      throw new Error(`Failed to save project: ${error.message}`);
    }
  }
}

export const studioService = new PptxStudioService();
