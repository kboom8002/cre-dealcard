import { describe, it, expect } from 'vitest';
import { PptxStudioService } from '@/domain/building/pptx-studio/project/studio-service';

describe('PptxStudio Project Lifecycle & Optimistic Locking (PR-B3-01 / Negative-Pair Obligation)', () => {
  const service = new PptxStudioService();

  it('Positive Pair: Project creates with default slides and safely advances stages', () => {
    const project = service.createProject('deal-pptx-1', 'pkg-1', '강남 테헤란로 빌딩 투자안내서');
    expect(project.stage).toBe('S00_INIT');
    expect(project.slides.length).toBe(6);
    expect(project.lockVersion).toBe(1);

    // Update slide layout
    const updated = service.updateSlideLayout(project.id, 2, 'A02_PHOTO_RIGHT', 1);
    expect(updated.lockVersion).toBe(2);
    expect(updated.slides[1].layoutType).toBe('A02_PHOTO_RIGHT');

    // Advance stage
    const advanced = service.advanceStage(project.id, 'S10_COMPOSITION', 2);
    expect(advanced.stage).toBe('S10_COMPOSITION');
    expect(advanced.lockVersion).toBe(3);
  });

  it('Negative Pair: Stale lockVersion edit is rejected with STALE_LOCK_ERROR', () => {
    const project = service.createProject('deal-pptx-2', 'pkg-2', '여의도 사옥 매각안내서');

    // First edit increments lockVersion from 1 -> 2
    service.updateSlideLayout(project.id, 1, 'A01_MODERN_COVER', 1);

    // Second concurrent edit attempts using old lockVersion 1
    expect(() =>
      service.updateSlideLayout(project.id, 1, 'A01_CLASSIC_COVER', 1)
    ).toThrowError(/STALE_LOCK_ERROR/);
  });
});
