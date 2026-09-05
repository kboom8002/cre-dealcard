import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { PptxStudioService } from '@/domain/building/pptx-studio/studio-service';
import { StudioApprovalService } from '@/domain/building/pptx-studio/approval/studio-approval-service';
import { POST as postProjects } from '@/app/api/broker/pptx-studio/projects/route';
import { GET as getProject } from '@/app/api/broker/pptx-studio/projects/[id]/route';
import { PATCH as patchSlides } from '@/app/api/broker/pptx-studio/projects/[id]/slides/route';
import { POST as postApproveEditorial } from '@/app/api/broker/pptx-studio/projects/[id]/approve-editorial/route';
import { POST as postApproveFile } from '@/app/api/broker/pptx-studio/projects/[id]/approve-file/route';
import { GET as downloadPptx } from '@/app/api/broker/pptx-studio/projects/[id]/download/route';

describe('PPTX Studio Interactive Editor & 2-Stage Approval Unit & Integration Test Suite', () => {
  describe('Domain Service: PptxStudioService', () => {
    it('initializes project adhering to Rule 10 16-slide body hard limit and isolated appendices', () => {
      const service = new PptxStudioService(true);
      const project = service.createProject(
        'deal-m3-001',
        'pkg-m3-001',
        '강남 테헤란로 프라임 오피스 타워'
      );

      expect(project.id).toBeDefined();
      expect(project.title).toBe('강남 테헤란로 프라임 오피스 타워');
      expect(project.stage).toBe('S00_INIT');
      expect(project.lockVersion).toBe(1);

      // Rule 10: 16 body slides hard limit
      const bodySlides = project.slides.filter((s) => s.category === 'body');
      const appendixSlides = project.slides.filter((s) => s.category === 'appendix');

      expect(bodySlides.length).toBe(16);
      expect(appendixSlides.length).toBe(4);
      expect(project.slides.length).toBe(20);

      // Verify sequential slide indexing
      project.slides.forEach((slide, idx) => {
        expect(slide.slideIndex).toBe(idx + 1);
        expect(slide.hidden).toBe(false);
      });
    });

    it('Positive Pair: Reorders slides and re-indexes sequentially from 1', () => {
      const service = new PptxStudioService(true);
      const project = service.createProject('deal-m3-002', 'pkg-m3-002', '여의도 금융센터');

      const originalFirstSlide = project.slides[0];
      const originalSecondSlide = project.slides[1];

      // Reverse first two slides
      const reorderedIds = [
        originalSecondSlide.id,
        originalFirstSlide.id,
        ...project.slides.slice(2).map((s) => s.id),
      ];

      const updated = service.reorderSlides(project.id, reorderedIds, 1);

      expect(updated.lockVersion).toBe(2);
      expect(updated.slides[0].id).toBe(originalSecondSlide.id);
      expect(updated.slides[0].slideIndex).toBe(1);
      expect(updated.slides[1].id).toBe(originalFirstSlide.id);
      expect(updated.slides[1].slideIndex).toBe(2);
    });

    it('Negative Pair: Reorder with stale lockVersion is blocked with STALE_LOCK_ERROR', () => {
      const service = new PptxStudioService(true);
      const project = service.createProject('deal-m3-003', 'pkg-m3-003', '판교 테크원 타워');

      // First reorder advances lockVersion 1 -> 2
      service.reorderSlides(project.id, project.slides.map((s) => s.id).reverse(), 1);

      // Stale reorder with lockVersion 1 must fail
      expect(() => {
        service.reorderSlides(project.id, project.slides.map((s) => s.id), 1);
      }).toThrowError(/STALE_LOCK_ERROR/);
    });

    it('Positive Pair: Toggles slide visibility between visible and hidden', () => {
      const service = new PptxStudioService(true);
      const project = service.createProject('deal-m3-004', 'pkg-m3-004', '성수동 복합오피스');

      const targetSlide = project.slides[2];
      expect(targetSlide.hidden).toBe(false);

      // Hide slide
      const hidden = service.toggleSlideVisibility(project.id, targetSlide.id, true, 1);
      expect(hidden.slides.find((s) => s.id === targetSlide.id)?.hidden).toBe(true);
      expect(hidden.lockVersion).toBe(2);

      // Unhide slide
      const unhidden = service.toggleSlideVisibility(project.id, targetSlide.id, false, 2);
      expect(unhidden.slides.find((s) => s.id === targetSlide.id)?.hidden).toBe(false);
      expect(unhidden.lockVersion).toBe(3);
    });

    it('Negative Pair: Toggling visibility of nonexistent slide throws SLIDE_NOT_FOUND', () => {
      const service = new PptxStudioService(true);
      const project = service.createProject('deal-m3-005', 'pkg-m3-005', '종로 타워');

      expect(() => {
        service.toggleSlideVisibility(project.id, 'non-existent-slide-id', true, 1);
      }).toThrowError(/SLIDE_NOT_FOUND/);
    });

    it('Positive Pair: Patches slide text overrides (title, kicker, leadSentence, price)', () => {
      const service = new PptxStudioService(true);
      const project = service.createProject('deal-m3-006', 'pkg-m3-006', '한남동 하이엔드');

      const slide = project.slides[0];
      const updated = service.patchSlideOverrides(
        project.id,
        slide.id,
        {
          title: '수정된 표지 제목',
          kicker: 'CUSTOM KICKER',
          leadSentence: '안정적인 배당 수익과 자본 이득을 제공하는 프라임 코어 자산',
          price: '2,500억',
        },
        1
      );

      const target = updated.slides.find((s) => s.id === slide.id);
      expect(target?.title).toBe('수정된 표지 제목');
      expect(target?.kicker).toBe('CUSTOM KICKER');
      expect(target?.slideOverrides.leadSentence).toBe('안정적인 배당 수익과 자본 이득을 제공하는 프라임 코어 자산');
      expect(target?.slideOverrides.price).toBe('2,500억');
      expect(updated.lockVersion).toBe(2);
    });

    it('Negative Pair: Patching overrides on nonexistent slide throws SLIDE_NOT_FOUND', () => {
      const service = new PptxStudioService(true);
      const project = service.createProject('deal-m3-007', 'pkg-m3-007', '도산대로 근생');

      expect(() => {
        service.patchSlideOverrides(project.id, 'fake-slide-id', { title: 'Invalid' }, 1);
      }).toThrowError(/SLIDE_NOT_FOUND/);
    });
  });

  describe('Sequential 2-Stage Approval (S60 Editorial -> S70 File Binary SHA-256)', () => {
    it('Positive Pair: Sequential S60 -> S70 approval flow binds immutable target and binary hashes', async () => {
      const service = new PptxStudioService(true);
      const approvalService = new StudioApprovalService();

      const project = service.createProject('deal-m3-008', 'pkg-m3-008', '마포 업무빌딩');

      // Advance to S40_PREVIEW
      service.advanceStage(project.id, 'S40_PREVIEW', 1);
      expect(project.stage).toBe('S40_PREVIEW');

      // Stage 1: S60 Editorial Approval
      const targetHash = 'sha256:target-deck-hash-001';
      const editorialEvent = await approvalService.approveEditorial(
        project,
        'broker-park',
        targetHash
      );

      expect(editorialEvent.id).toBeDefined();
      expect(project.stage).toBe('S60_EDITORIAL_APPROVAL');
      expect(project.editorialApprovedBy).toBe('broker-park');
      expect(project.editorialApprovedAt).toBeDefined();

      // Stage 2: S70 File Binary Hash Approval
      const binaryHash = 'sha256:binary-pptx-hash-002';
      const fileUrl = `/api/broker/pptx-studio/projects/${project.id}/download`;

      const { fileApproval, release } = await approvalService.approveFile(
        project,
        binaryHash,
        fileUrl,
        'broker-park'
      );

      expect(fileApproval.id).toBeDefined();
      expect(project.stage).toBe('S70_FILE_APPROVAL');
      expect(project.fileApprovedBy).toBe('broker-park');
      expect(project.artifactFileHash).toBe(binaryHash);
      expect(release.status).toBe('PUBLISHED');
      expect(release.channel).toBe('pptx');
      expect(release.publicUrl).toBe(fileUrl);
    });

    it('Negative Pair: Attempting S70 File Approval before S60 Editorial Approval strictly rejects with PRECONDITION_FAILED', async () => {
      const service = new PptxStudioService(true);
      const approvalService = new StudioApprovalService();

      const project = service.createProject('deal-m3-009', 'pkg-m3-009', '잠실 리테일 타워');

      // Project is at S00_INIT without S60 approval
      await expect(
        approvalService.approveFile(
          project,
          'sha256:premature-binary-hash',
          '/api/download',
          'broker-kim'
        )
      ).rejects.toThrowError(/PRECONDITION_FAILED.*S60/);
    });
  });

  describe('REST API Routes Integration', () => {
    const testDealId = 'deal-api-e2e-100';

    it('POST /api/broker/pptx-studio/projects creates a new project with 16 body slides + appendices', async () => {
      const req = new NextRequest('http://localhost:3000/api/broker/pptx-studio/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-broker-id': 'test-broker' },
        body: JSON.stringify({
          dealId: testDealId,
          title: '강남 프라임 오피스 API 테스트',
        }),
      });

      const res = await postProjects(req);
      expect(res.status).toBe(201);
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.project.title).toBe('강남 프라임 오피스 API 테스트');
      expect(json.project.slides.length).toBe(20);
    });

    it('GET /api/broker/pptx-studio/projects/[id] retrieves project state and slides', async () => {
      const req = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${testDealId}`, {
        method: 'GET',
        headers: { 'x-broker-id': 'test-broker' },
      });

      const res = await getProject(req, { params: Promise.resolve({ id: testDealId }) });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.project.dealId).toBe(testDealId);
      expect(json.project.slides.length).toBe(20);
    });

    it('PATCH /api/broker/pptx-studio/projects/[id]/slides supports reorder, visibility, and overrides', async () => {
      // 1. Reorder
      const getReq = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${testDealId}`);
      const getRes = await getProject(getReq, { params: Promise.resolve({ id: testDealId }) });
      const { project } = await getRes.json();

      const reversedIds = project.slides.map((s: any) => s.id).reverse();
      const reorderReq = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${project.id}/slides`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-broker-id': 'test-broker' },
        body: JSON.stringify({
          action: 'reorder',
          slideIds: reversedIds,
        }),
      });

      const reorderRes = await patchSlides(reorderReq, { params: Promise.resolve({ id: project.id }) });
      expect(reorderRes.status).toBe(200);
      const reorderJson = await reorderRes.json();
      expect(reorderJson.project.slides[0].id).toBe(reversedIds[0]);

      // 2. Toggle Visibility
      const slideIdToHide = project.slides[0].id;
      const hideReq = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${project.id}/slides`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-broker-id': 'test-broker' },
        body: JSON.stringify({
          action: 'toggle_visibility',
          slideId: slideIdToHide,
          hidden: true,
        }),
      });

      const hideRes = await patchSlides(hideReq, { params: Promise.resolve({ id: project.id }) });
      expect(hideRes.status).toBe(200);
      const hideJson = await hideRes.json();
      expect(hideJson.project.slides.find((s: any) => s.id === slideIdToHide)?.hidden).toBe(true);

      // 3. Patch Overrides
      const overrideReq = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${project.id}/slides`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-broker-id': 'test-broker' },
        body: JSON.stringify({
          action: 'patch_overrides',
          slideId: slideIdToHide,
          overrides: { title: 'API 수정된 슬라이드 제목' },
        }),
      });

      const overrideRes = await patchSlides(overrideReq, { params: Promise.resolve({ id: project.id }) });
      expect(overrideRes.status).toBe(200);
      const overrideJson = await overrideRes.json();
      expect(overrideJson.project.slides.find((s: any) => s.id === slideIdToHide)?.title).toBe('API 수정된 슬라이드 제목');
    });

    it('Negative Pair: POST /api/broker/pptx-studio/projects/[id]/approve-file fails with 412 PRECONDITION_FAILED when S60 not approved', async () => {
      // Create new project at S00_INIT
      const initReq = new NextRequest('http://localhost:3000/api/broker/pptx-studio/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-broker-id': 'test-broker' },
        body: JSON.stringify({ dealId: 'deal-neg-precondition', recreate: true }),
      });
      const initRes = await postProjects(initReq);
      const { project } = await initRes.json();

      // Call approve-file without prior S60
      const approveFileReq = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${project.id}/approve-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-broker-id': 'test-broker' },
        body: JSON.stringify({ fileHash: 'sha256:premature' }),
      });

      const approveFileRes = await postApproveFile(approveFileReq, { params: Promise.resolve({ id: project.id }) });
      expect(approveFileRes.status).toBe(412);
      const json = await approveFileRes.json();
      expect(json.ok).toBe(false);
      expect(json.code).toBe('PRECONDITION_FAILED');
    });

    it('Positive Pair: Sequential S60 Editorial Approval -> S70 File Approval via REST API completes publication', async () => {
      // Create fresh project
      const initReq = new NextRequest('http://localhost:3000/api/broker/pptx-studio/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-broker-id': 'test-broker' },
        body: JSON.stringify({ dealId: 'deal-pos-approval-chain', recreate: true }),
      });
      const initRes = await postProjects(initReq);
      const { project } = await initRes.json();

      // 1. S60 Editorial Approval
      const approveEditorialReq = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${project.id}/approve-editorial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-broker-id': 'test-broker' },
        body: JSON.stringify({ targetHash: 'sha256:deck-approved-123' }),
      });

      const editorialRes = await postApproveEditorial(approveEditorialReq, { params: Promise.resolve({ id: project.id }) });
      expect(editorialRes.status).toBe(200);
      const editorialJson = await editorialRes.json();
      expect(editorialJson.ok).toBe(true);
      expect(editorialJson.stage).toBe('S60_EDITORIAL_APPROVAL');

      // 2. S70 File Binary Approval
      const approveFileReq = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${project.id}/approve-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-broker-id': 'test-broker' },
        body: JSON.stringify({ fileHash: 'sha256:file-binary-456' }),
      });

      const fileRes = await postApproveFile(approveFileReq, { params: Promise.resolve({ id: project.id }) });
      expect(fileRes.status).toBe(200);
      const fileJson = await fileRes.json();
      expect(fileJson.ok).toBe(true);
      expect(fileJson.stage).toBe('S70_FILE_APPROVAL');
      expect(fileJson.status).toBe('PUBLISHED');
      expect(fileJson.artifactFileHash).toBe('sha256:file-binary-456');

      // 3. Official PPTX Download
      const dlReq = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${project.id}/download`);
      const dlRes = await downloadPptx(dlReq, { params: Promise.resolve({ id: project.id }) });

      expect(dlRes.status).toBe(200);
      expect(dlRes.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
      expect(dlRes.headers.get('Content-Disposition')).toContain('.pptx');
      const blob = await dlRes.blob();
      expect(blob.size).toBeGreaterThan(1000);
    });
  });
});
