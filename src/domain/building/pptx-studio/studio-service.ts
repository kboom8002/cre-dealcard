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
  private projects: Map<string, PptxProject>;

  constructor(isolatedStore?: boolean) {
    if (isolatedStore) {
      this.projects = new Map<string, PptxProject>();
    } else {
      if (!(globalThis as any).__pptxGlobalProjectsMap) {
        (globalThis as any).__pptxGlobalProjectsMap = new Map<string, PptxProject>();
      }
      this.projects = (globalThis as any).__pptxGlobalProjectsMap;
    }
  }

  /**
   * Initialize a standard 16 body slides + appendices project satisfying Rule 10
   */
  createProject(
    dealId: string,
    packageId: string,
    title: string,
    themeId = 'institutional_dark_gold',
    options?: CreateProjectOptions
  ): PptxProject {
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
      // 16 Body Slides (Rule 10 Page Hard Limit)
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
      // 4 Appendix Slides (Excluded from 16 Body Limit)
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

    this.projects.set(projectId, project);
    return project;
  }

  getProject(projectId: string): PptxProject {
    let project = this.projects.get(projectId);
    if (!project) {
      // Fallback check by dealId
      for (const p of this.projects.values()) {
        if (p.dealId === projectId) {
          project = p;
          break;
        }
      }
    }

    if (!project) {
      throw new Error(`PPTX_PROJECT_NOT_FOUND: Project ${projectId} does not exist`);
    }
    return project;
  }

  findProjectByDealId(dealId: string): PptxProject | undefined {
    for (const project of this.projects.values()) {
      if (project.dealId === dealId) {
        return project;
      }
    }
    return undefined;
  }

  updateSlideLayout(
    projectId: string,
    slideIndex: number,
    layoutType: string,
    expectedLockVersion?: number
  ): PptxProject {
    const project = this.getProject(projectId);

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

    return project;
  }

  reorderSlides(
    projectId: string,
    orderedSlideIds: string[],
    expectedLockVersion?: number
  ): PptxProject {
    const project = this.getProject(projectId);

    if (expectedLockVersion !== undefined && project.lockVersion !== expectedLockVersion) {
      throw new Error(
        `STALE_LOCK_ERROR: Concurrent edit detected on project ${projectId} (expected ${expectedLockVersion}, actual ${project.lockVersion})`
      );
    }

    const slideMap = new Map(project.slides.map((s) => [s.id, s]));
    const reordered: PptxSlide[] = [];

    // Place slides in specified order
    for (const id of orderedSlideIds) {
      const slide = slideMap.get(id);
      if (slide) {
        reordered.push(slide);
        slideMap.delete(id);
      }
    }

    // Append any slides that weren't in orderedSlideIds
    for (const remaining of slideMap.values()) {
      reordered.push(remaining);
    }

    // Re-index sequentially starting from 1
    reordered.forEach((slide, idx) => {
      slide.slideIndex = idx + 1;
    });

    project.slides = reordered;
    project.lockVersion += 1;
    project.version += 1;
    project.updatedAt = new Date().toISOString();

    return project;
  }

  toggleSlideVisibility(
    projectId: string,
    slideId: string,
    hidden?: boolean,
    expectedLockVersion?: number
  ): PptxProject {
    const project = this.getProject(projectId);

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

    return project;
  }

  patchSlideOverrides(
    projectId: string,
    slideId: string,
    overrides: Record<string, unknown>,
    expectedLockVersion?: number
  ): PptxProject {
    const project = this.getProject(projectId);

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

    return project;
  }

  advanceStage(
    projectId: string,
    nextStage: StudioStage,
    expectedLockVersion?: number
  ): PptxProject {
    const project = this.getProject(projectId);

    if (expectedLockVersion !== undefined && project.lockVersion !== expectedLockVersion) {
      throw new Error(
        `STALE_LOCK_ERROR: Lock mismatch advancing stage on project ${projectId}`
      );
    }

    project.stage = nextStage;
    project.lockVersion += 1;
    project.updatedAt = new Date().toISOString();

    return project;
  }

  saveProject(project: PptxProject): void {
    project.updatedAt = new Date().toISOString();
    this.projects.set(project.id, project);
  }
}

export const studioService = new PptxStudioService();
