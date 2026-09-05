import { randomUUID } from 'crypto';
import type { PptxProject, PptxSlide, StudioStage } from './types';

export class PptxStudioService {
  private projects: Map<string, PptxProject> = new Map();

  createProject(
    dealId: string,
    packageId: string,
    title: string,
    themeId = 'corporate_navy'
  ): PptxProject {
    const projectId = randomUUID();
    const now = new Date().toISOString();

    const initialSlides: PptxSlide[] = [
      {
        id: randomUUID(),
        projectId,
        slideIndex: 1,
        layoutType: 'A01_COVER',
        category: 'body',
        contentUnitIds: ['cover-title', 'cover-meta'],
        slideOverrides: {},
        createdAt: now,
      },
      {
        id: randomUUID(),
        projectId,
        slideIndex: 2,
        layoutType: 'A02_OVERVIEW',
        category: 'body',
        contentUnitIds: ['spec-table', 'price-card'],
        slideOverrides: {},
        createdAt: now,
      },
      {
        id: randomUUID(),
        projectId,
        slideIndex: 3,
        layoutType: 'A04_SPLIT_VALUE',
        category: 'body',
        contentUnitIds: ['thesis-lead', 'thesis-cards'],
        slideOverrides: {},
        createdAt: now,
      },
      {
        id: randomUUID(),
        projectId,
        slideIndex: 4,
        layoutType: 'A08_RENTROLL',
        category: 'body',
        contentUnitIds: ['rent-table'],
        slideOverrides: {},
        createdAt: now,
      },
      {
        id: randomUUID(),
        projectId,
        slideIndex: 5,
        layoutType: 'A15_CLOSING',
        category: 'body',
        contentUnitIds: ['process-step'],
        slideOverrides: {},
        createdAt: now,
      },
      {
        id: randomUUID(),
        projectId,
        slideIndex: 6,
        layoutType: 'A90_APPENDIX',
        category: 'appendix',
        contentUnitIds: ['cadastral-map', 'zoning-note'],
        slideOverrides: {},
        createdAt: now,
      },
    ];

    const project: PptxProject = {
      id: projectId,
      dealId,
      packageId,
      version: 1,
      title,
      themeId,
      targetAudience: 'investor',
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
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`PPTX_PROJECT_NOT_FOUND: Project ${projectId} does not exist`);
    }
    return project;
  }

  updateSlideLayout(
    projectId: string,
    slideIndex: number,
    layoutType: string,
    expectedLockVersion: number
  ): PptxProject {
    const project = this.getProject(projectId);

    if (project.lockVersion !== expectedLockVersion) {
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

  advanceStage(
    projectId: string,
    nextStage: StudioStage,
    expectedLockVersion: number
  ): PptxProject {
    const project = this.getProject(projectId);

    if (project.lockVersion !== expectedLockVersion) {
      throw new Error(
        `STALE_LOCK_ERROR: Lock mismatch advancing stage on project ${projectId}`
      );
    }

    project.stage = nextStage;
    project.lockVersion += 1;
    project.updatedAt = new Date().toISOString();

    return project;
  }
}
