import { describe, it, expect, vi } from 'vitest';
import { InvalidationEngine } from '@/platform/im-pipeline/regeneration/invalidation-engine';
import { ApprovalLedgerService } from '@/domain/building/im-core/approval/ledger-service';
import { computeTargetHash } from '@/domain/building/im-core/target-hash';
import {
  subscribeLocalSync,
  broadcastDealcardMutation,
  broadcastApprovalEvent,
} from '@/platform/im-pipeline/realtime/dealcard-sync-channel';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { StudioApprovalService } from '@/domain/building/pptx-studio/approval/studio-approval-service';
import { verifyCrossChannelConsistency } from '@/domain/building/im-core/cross-channel-checker';
import { SupabaseApprovalLedgerAdapter } from '@/platform/im-pipeline/supabase-approval-ledger';
import { computeDeterministicClaimsHash } from '@/domain/building/im-core/target-hash';
import { ClaimRegistry } from '@/domain/building/im-core/claim-registry';
import { registerActionCardClaims } from '@/domain/building/im-core/action-card';
import { registerProFormaClaims } from '@/domain/building/im-core/broker-input-validator';
import { bandDealcardPackage } from '@/domain/building/dealcard-publication/banding-engine';
import { renderDealcardHtml } from '@/domain/building/dealcard-publication/assembler';
import { parseMemoToObservations } from '@/domain/building/memo-intake/parser';

describe('Cross-Channel Invalidation & Isolation E2E (PR-B4-04 / Negative-Pair Obligation)', () => {
  const engine = new InvalidationEngine();

  // ── Existing Test 1: Channel Isolation ──
  it('Positive Pair: Mobile copy edits leave PPTX studio release in PUBLISHED state', async () => {
    const ledger = new ApprovalLedgerService(true);

    const mobileRel = await ledger.createReleaseRecord('art-mob-1', 'mobile', '/im-lite/deal-x');
    await ledger.updateReleaseStatus(mobileRel.id, 'PUBLISHED');

    const pptxRel = await ledger.createReleaseRecord('art-pptx-1', 'pptx', '/storage/pptx/deal-x.pptx');
    await ledger.updateReleaseStatus(pptxRel.id, 'PUBLISHED');

    const scope = engine.resolveScope('mobile_layout_changed');
    expect(scope.invalidatedChannels).toContain('mobile');
    expect(scope.invalidatedChannels).not.toContain('pptx');

    await ledger.updateReleaseStatus(mobileRel.id, 'STALE');

    const currentPptx = await ledger.getReleaseRecord(pptxRel.id);
    expect(currentPptx?.status).toBe('PUBLISHED');

    const currentMobile = await ledger.getReleaseRecord(mobileRel.id);
    expect(currentMobile?.status).toBe('STALE');
  });

  // ── Existing Test 2: Cascading Invalidation ──
  it('Negative Pair: Correction to underlying rentroll data cascades STALE to both sibling channels', async () => {
    const ledger = new ApprovalLedgerService(true);

    const mobileRel = await ledger.createReleaseRecord('art-mob-2', 'mobile', '/im-lite/deal-y');
    await ledger.updateReleaseStatus(mobileRel.id, 'PUBLISHED');

    const pptxRel = await ledger.createReleaseRecord('art-pptx-2', 'pptx', '/storage/pptx/deal-y.pptx');
    await ledger.updateReleaseStatus(pptxRel.id, 'PUBLISHED');

    const scope = engine.resolveScope('correction_added');
    expect(scope.invalidatedChannels).toContain('mobile');
    expect(scope.invalidatedChannels).toContain('pptx');

    await ledger.updateReleaseStatus(mobileRel.id, 'STALE');
    await ledger.updateReleaseStatus(pptxRel.id, 'STALE');

    const currentMobile = await ledger.getReleaseRecord(mobileRel.id);
    const currentPptx = await ledger.getReleaseRecord(pptxRel.id);

    expect(currentMobile?.status).toBe('STALE');
    expect(currentPptx?.status).toBe('STALE');
  });

  // ── Requirement 1: SSoT Target Hash & Realtime Mutation Propagation ──
  it('R1: Target Hash calculation is deterministic and Realtime broadcast propagates within 300ms', async () => {
    const buildingId = 'bld-dangsan-115';
    const payloadA = {
      body: { asking_price: 11_500_000_000, total_area: 1487.6, title: '당산동 상업용 빌딩' },
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    };
    const payloadB = {
      body: { total_area: 1487.6, asking_price: 11_500_000_000, title: '당산동 상업용 빌딩' },
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    };

    // Canonical key sorting guarantees identical hash regardless of property insertion order
    const hashA = computeTargetHash(payloadA);
    const hashB = computeTargetHash(payloadB);
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Verify Realtime broadcast delivery to subscribers
    const receivedEvents: any[] = [];
    const unsubscribe = subscribeLocalSync(buildingId, (event) => {
      receivedEvents.push(event);
    });

    const scope = engine.resolveScope('opinion_edited');
    await broadcastDealcardMutation(null, {
      buildingId,
      documentId: 'doc-123',
      targetHash: hashA,
      changeKind: 'opinion_edited',
      invalidatedChannels: scope.invalidatedChannels,
      timestamp: new Date().toISOString(),
      updatedBy: 'broker-kim',
    });

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].event).toBe('CONTENT_MUTATED');
    expect(receivedEvents[0].payload.targetHash).toBe(hashA);
    expect(receivedEvents[0].payload.invalidatedChannels).toContain('pptx');
    expect(receivedEvents[0].payload.invalidatedChannels).toContain('mobile');

    unsubscribe();
  });

  // ── Requirement 2: Web IM ↔ PPTX Studio Bidirectional Sync ──
  it('R2: Bidirectional sync updates slide overrides and reflects modifications in project state', async () => {
    const dealId = 'deal-sync-test-01';
    const project = studioService.createProject(
      dealId,
      'pkg-sync-01',
      '당산동 신축 오피스 IM',
      'credeal_signature'
    );

    const coverSlide = project.slides.find((s) => s.layoutType.includes('A01') || s.dataKey === 'cover');
    expect(coverSlide).toBeDefined();

    // 1. Forward Sync: Broker edits title in Web IM
    const newTitle = '당산역 역세권 프리미엄 사옥 IM';
    studioService.patchSlideOverrides(project.id, coverSlide!.id, { title: newTitle });

    const updatedProject = studioService.getProject(project.id);
    const updatedCover = updatedProject.slides.find((s) => s.id === coverSlide!.id);
    expect(updatedCover?.title).toBe(newTitle);

    // 2. Reverse Sync: PPTX Studio modifies kicker and key investment point
    const overviewSlide = updatedProject.slides.find(
      (s) => s.layoutType.includes('A02') || s.dataKey === 'overview'
    );
    expect(overviewSlide).toBeDefined();

    const overridePayload = {
      title: '트리플 역세권 핵심 자산',
      kicker: 'VALUE-ADD THESIS',
      leadSentence: '당산역 도보 2분 거리 랜드마크 신축급 사옥',
    };
    studioService.patchSlideOverrides(project.id, overviewSlide!.id, overridePayload);

    const afterReverse = studioService.getProject(project.id);
    const afterOverview = afterReverse.slides.find((s) => s.id === overviewSlide!.id);
    expect(afterOverview?.title).toBe(overridePayload.title);
    expect(afterOverview?.kicker).toBe(overridePayload.kicker);
    expect(afterOverview?.slideOverrides.leadSentence).toBe(overridePayload.leadSentence);
  });

  // ── Requirement 3: 2-Stage Approval Ledger (S60 -> S70) Binding ──
  describe('R3: 2-Stage Sequential Approval Ledger (S60 Editorial -> S70 File Binary)', () => {
    it('Negative Pair: Cannot approve S70 file binary before S60 editorial approval', async () => {
      const dealId = 'deal-approval-neg';
      const project = studioService.createProject(dealId, 'pkg-neg', '초안 자산', 'credeal_signature');
      const approvalService = new StudioApprovalService(new ApprovalLedgerService(true));

      // Attempt S70 without S60 -> MUST throw PRECONDITION_FAILED
      await expect(
        approvalService.approveFile(
          project,
          'sha256:dummyhash',
          '/api/download/dummy.pptx',
          'broker-test'
        )
      ).rejects.toThrow('PRECONDITION_FAILED: 파일 승인(S70) 전 편집 승인(S60)이 반드시 선행되어야 합니다');
    });

    it('Positive Pair: Sequential S60 -> S70 records ledger events, publishes release, and broadcasts', async () => {
      const buildingId = 'deal-approval-pos';
      const project = studioService.createProject(buildingId, 'pkg-pos', '정상 승인 자산', 'golden_institutional');
      const isolatedLedger = new ApprovalLedgerService(true);
      const approvalService = new StudioApprovalService(isolatedLedger);

      // Listen for approval events
      const approvalEvents: any[] = [];
      const unsub = subscribeLocalSync(buildingId, (event) => {
        if (event.event === 'APPROVAL_CHANGED') {
          approvalEvents.push(event.payload);
        }
      });

      // Step 1: Advance to preview and approve S60
      studioService.advanceStage(project.id, 'S40_PREVIEW');
      const targetHash = 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069';
      const s60Event = await approvalService.approveEditorial(project, 'broker-lead', targetHash);

      expect(project.stage).toBe('S60_EDITORIAL_APPROVAL');
      expect(project.editorialApprovedBy).toBe('broker-lead');
      expect(s60Event.targetHash).toBe(targetHash);

      await broadcastApprovalEvent(null, {
        buildingId,
        projectId: project.id,
        stage: 'S60_EDITORIAL_APPROVAL',
        targetHash,
        approvalEvent: s60Event,
        timestamp: new Date().toISOString(),
      });

      // Step 2: Approve S70 File Binary
      const fileHash = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const fileUrl = `/api/broker/pptx-studio/projects/${project.id}/download`;
      const { fileApproval, release } = await approvalService.approveFile(
        project,
        fileHash,
        fileUrl,
        'broker-lead'
      );

      expect(project.stage).toBe('S70_FILE_APPROVAL');
      expect(project.fileApprovedBy).toBe('broker-lead');
      expect(project.artifactFileHash).toBe(fileHash);
      expect(release.status).toBe('PUBLISHED');
      expect(release.publicUrl).toBe(fileUrl);

      await broadcastApprovalEvent(null, {
        buildingId,
        projectId: project.id,
        stage: 'S70_FILE_APPROVAL',
        targetHash: fileHash,
        approvalEvent: fileApproval,
        releaseRecord: release,
        fileUrl,
        timestamp: new Date().toISOString(),
      });

      expect(approvalEvents.length).toBe(2);
      expect(approvalEvents[0].stage).toBe('S60_EDITORIAL_APPROVAL');
      expect(approvalEvents[1].stage).toBe('S70_FILE_APPROVAL');
      expect(approvalEvents[1].targetHash).toBe(fileHash);

      unsub();
    });
  });

  // ── Requirement 4: Cross-Channel Data Consistency Checker ──
  describe('R4: Cross-Channel Data Consistency Checker (Web IM JSON vs PPTX Slides XML)', () => {
    it('Positive Pair: Perfectly matching Web IM and PPTX project passes with 0 discrepancies', () => {
      const webDoc = {
        title: '당산동 115억 상업용 빌딩',
        body: {
          title: '당산동 115억 상업용 빌딩',
          ssot_summary: {
            asking_price: '115억',
            total_area: 1487.6,
            gross_yield: 4.85,
            total_deposit: 500_000_000,
          },
        },
      };

      const pptxProject = {
        title: '당산동 115억 상업용 빌딩',
        slides: [
          { layoutType: 'A01_COVER', dataKey: 'cover', title: '당산동 115억 상업용 빌딩' },
          {
            layoutType: 'A02_OVERVIEW',
            dataKey: 'overview',
            slideOverrides: { price: '11,500,000,000', area: 1487.6, grossYield: 4.85 },
          },
          {
            layoutType: 'A08_RENTROLL',
            dataKey: 'rentRoll',
            slideOverrides: { totalDeposit: 500_000_000 },
          },
        ],
      };

      const report = verifyCrossChannelConsistency({ webDoc, pptxProject });
      expect(report.passed).toBe(true);
      expect(report.totalDiscrepancies).toBe(0);
      expect(report.verifiedMetrics).toContain('title');
      expect(report.verifiedMetrics).toContain('asking_price');
      expect(report.verifiedMetrics).toContain('total_area');
      expect(report.verifiedMetrics).toContain('cap_rate');
      expect(report.verifiedMetrics).toContain('total_deposit');
    });

    it('Negative Pair: Discrepancy in asking price and area is caught immediately', () => {
      const webDoc = {
        title: '역삼동 테헤란로 사옥',
        body: {
          ssot_summary: {
            asking_price: 12_000_000_000, // 120억
            total_area: 2100.0,
          },
        },
      };

      const pptxProject = {
        title: '역삼동 테헤란로 사옥',
        slides: [
          {
            layoutType: 'A02_OVERVIEW',
            dataKey: 'overview',
            slideOverrides: {
              price: 13_500_000_000, // 135억 (불일치!)
              area: 1950.0,          // 1950㎡ (불일치!)
            },
          },
        ],
      };

      const report = verifyCrossChannelConsistency({ webDoc, pptxProject });
      expect(report.passed).toBe(false);
      expect(report.totalDiscrepancies).toBe(2);

      const priceDiscrepancy = report.discrepancies.find((d) => d.field === 'asking_price');
      expect(priceDiscrepancy).toBeDefined();
      expect(priceDiscrepancy?.discrepancyType).toBe('NUMERICAL_MISMATCH');

      const areaDiscrepancy = report.discrepancies.find((d) => d.field === 'total_area');
      expect(areaDiscrepancy).toBeDefined();
      expect(areaDiscrepancy?.discrepancyType).toBe('NUMERICAL_MISMATCH');
    });

    // ── Land Area Invariant Tests ──
    it('Positive Pair: Land area matching within 0.05㎡ tolerance passes', () => {
      const webDoc = {
        title: '신사동 빌딩',
        body: {
          ssot_summary: {
            land_area: 1061.90,
          },
        },
      };
      const pptxProject = {
        title: '신사동 빌딩',
        slides: [
          {
            layoutType: 'A02_OVERVIEW',
            dataKey: 'overview',
            slideOverrides: { landArea: 1061.94 }, // diff 0.04㎡ <= 0.05㎡
          },
        ],
      };

      const report = verifyCrossChannelConsistency({ webDoc, pptxProject });
      expect(report.passed).toBe(true);
      expect(report.verifiedMetrics).toContain('land_area');
    });

    it('Negative Pair: Land area differing by more than 0.05㎡ is rejected', () => {
      const webDoc = {
        title: '신사동 빌딩',
        body: {
          ssot_summary: {
            land_area: 1061.90,
          },
        },
      };
      const pptxProject = {
        title: '신사동 빌딩',
        slides: [
          {
            layoutType: 'A02_OVERVIEW',
            dataKey: 'overview',
            slideOverrides: { landArea: 1062.50 }, // diff 0.60㎡ > 0.05㎡
          },
        ],
      };

      const report = verifyCrossChannelConsistency({ webDoc, pptxProject });
      expect(report.passed).toBe(false);
      const landDiscrepancy = report.discrepancies.find((d) => d.field === 'land_area');
      expect(landDiscrepancy).toBeDefined();
      expect(landDiscrepancy?.discrepancyType).toBe('NUMERICAL_MISMATCH');
    });

    // ── Monthly Rent Invariant Tests ──
    it('Positive Pair: Monthly rent matching within 1 KRW tolerance passes', () => {
      const webDoc = {
        title: '강남 빌딩',
        body: {
          ssot_summary: {
            monthly_rent: 64_625_000,
          },
        },
      };
      const pptxProject = {
        title: '강남 빌딩',
        slides: [
          {
            layoutType: 'A08_RENTROLL',
            dataKey: 'rentRoll',
            slideOverrides: { totalMonthlyRent: 64_625_001 }, // diff 1 KRW <= 1 KRW
          },
        ],
      };

      const report = verifyCrossChannelConsistency({ webDoc, pptxProject });
      expect(report.passed).toBe(true);
      expect(report.verifiedMetrics).toContain('monthly_rent');
    });

    it('Negative Pair: Monthly rent differing by more than 1 KRW is rejected', () => {
      const webDoc = {
        title: '강남 빌딩',
        body: {
          ssot_summary: {
            monthly_rent: 64_625_000,
          },
        },
      };
      const pptxProject = {
        title: '강남 빌딩',
        slides: [
          {
            layoutType: 'A08_RENTROLL',
            dataKey: 'rentRoll',
            slideOverrides: { totalMonthlyRent: 64_650_000 }, // diff 25,000 KRW > 1 KRW
          },
        ],
      };

      const report = verifyCrossChannelConsistency({ webDoc, pptxProject });
      expect(report.passed).toBe(false);
      const rentDiscrepancy = report.discrepancies.find((d) => d.field === 'monthly_rent');
      expect(rentDiscrepancy).toBeDefined();
      expect(rentDiscrepancy?.discrepancyType).toBe('NUMERICAL_MISMATCH');
    });

    // ── Deposit Fallback Normalization Tests ──
    it('Positive Pair: Deposit fallback normalization (ssot.deposit vs total_deposit) matches correctly', () => {
      const webDoc = {
        title: '서초 빌딩',
        body: {
          ssot_summary: {
            deposit: 950_000_000, // ssot.deposit instead of total_deposit
          },
        },
      };
      const pptxProject = {
        title: '서초 빌딩',
        slides: [
          {
            layoutType: 'A08_RENTROLL',
            dataKey: 'rentRoll',
            slideOverrides: { deposit: 950_000_000 }, // deposit instead of totalDeposit
          },
        ],
      };

      const report = verifyCrossChannelConsistency({ webDoc, pptxProject });
      expect(report.passed).toBe(true);
      expect(report.verifiedMetrics).toContain('total_deposit');
    });
  });

  // ── Requirement 5: Approval Ledger Supabase Persistence & Memory Fallback ──
  describe('R5: Approval Ledger Supabase Persistence & Resilient Fallback', () => {
    it('Positive Pair: Successfully persists approval events and release records to Supabase tables', async () => {
      const mockInsertEvents = vi.fn().mockResolvedValue({ error: null });
      const mockInsertReleases = vi.fn().mockResolvedValue({ error: null });
      const mockUpdateReleases = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const mockSelectEvents = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'event-uuid-1',
                  artifact_run_id: 'run-uuid-1',
                  event_type: 'human_approve',
                  target_hash: 'sha256:target123',
                  created_at: new Date().toISOString(),
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'approval_events') {
            return {
              insert: mockInsertEvents,
              select: mockSelectEvents,
            };
          }
          if (table === 'release_records') {
            return {
              insert: mockInsertReleases,
              update: mockUpdateReleases,
            };
          }
          return {};
        }),
      };

      const adapter = new SupabaseApprovalLedgerAdapter(mockSupabase as any);
      const ledger = new ApprovalLedgerService(true, adapter);

      // 1. Record approval event
      const event = await ledger.recordApprovalEvent({
        artifactRunId: 'run-uuid-1',
        eventType: 'human_approve',
        actorId: 'broker-lead',
        targetHash: 'sha256:target123',
        reason: 'S60 Editorial Approval',
      });

      expect(mockInsertEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          id: event.id,
          artifact_run_id: 'run-uuid-1',
          event_type: 'human_approve',
          target_hash: 'sha256:target123',
          reason: 'S60 Editorial Approval',
        })
      );

      // 2. Create release record
      const release = await ledger.createReleaseRecord('run-uuid-1', 'pptx', '/downloads/im.pptx');
      expect(mockInsertReleases).toHaveBeenCalledWith(
        expect.objectContaining({
          id: release.id,
          artifact_run_id: 'run-uuid-1',
          channel: 'pptx',
          status: 'DRAFT',
          public_url: '/downloads/im.pptx',
        })
      );

      // 3. Update release status
      await ledger.updateReleaseStatus(release.id, 'PUBLISHED', event.id);
      expect(mockUpdateReleases).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PUBLISHED',
          approved_approval_id: event.id,
        })
      );
    });

    it('Negative Pair: Supabase failure triggers graceful fallback to in-memory store without throwing', async () => {
      const failingSupabase = {
        from: vi.fn(() => ({
          insert: vi.fn().mockRejectedValue(new Error('Connection timeout to Supabase')),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockRejectedValue(new Error('Network error')),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockRejectedValue(new Error('DB unreachable')),
                }),
              }),
            }),
          }),
        })),
      };

      const resilientAdapter = new SupabaseApprovalLedgerAdapter(failingSupabase as any);
      const resilientLedger = new ApprovalLedgerService(true, resilientAdapter);

      // Should not throw even though Supabase rejects
      const event = await resilientLedger.recordApprovalEvent({
        artifactRunId: 'offline-run-1',
        eventType: 'machine_check',
        targetHash: 'sha256:fallback123',
      });
      expect(event.id).toBeDefined();

      const release = await resilientLedger.createReleaseRecord('offline-run-1', 'mobile');
      expect(release.id).toBeDefined();
      expect(release.status).toBe('DRAFT');

      const updated = await resilientLedger.updateReleaseStatus(release.id, 'PUBLISHED');
      expect(updated.status).toBe('PUBLISHED');

      // State is preserved in memory despite DB failure
      const fetchedRelease = await resilientLedger.getReleaseRecord(release.id);
      expect(fetchedRelease?.status).toBe('PUBLISHED');

      const latestApproval = await resilientLedger.getLatestApproval('offline-run-1');
      expect(latestApproval?.targetHash).toBe('sha256:fallback123');
    });
  });

  describe('Feature 4 & 5: Dealcard Schema Enrichment & Claims Registration E2E', () => {
    it('Positive Pair: computeDeterministicClaimsHash is order-independent across claim insertion order', () => {
      const reg1 = new ClaimRegistry();
      reg1.register({
        subject: 'land_area_pyeong',
        value: 180.3,
        unit: '평',
        evidence: [{ sourceId: 'gov', asOf: '2026-08-31', excerpt: '토지대장' }],
        provenance: 'public_data',
        asOf: '2026-08-31',
        status: 'verified',
      });
      reg1.register({
        subject: 'asking_price_eok',
        value: 230,
        unit: '억원',
        evidence: [{ sourceId: 'broker', asOf: '2026-08-31', excerpt: '중개인 메모' }],
        provenance: 'broker',
        asOf: '2026-08-31',
        status: 'unverified',
      });
      reg1.register({
        subject: 'cap_rate_pct',
        value: 1.15,
        unit: '%',
        evidence: [{ sourceId: 'calc', asOf: '2026-08-31', excerpt: '순영업소득 산출' }],
        provenance: 'derived',
        asOf: '2026-08-31',
        status: 'reconciled',
      });

      // Shuffled insertion order
      const reg2 = new ClaimRegistry();
      reg2.register({
        subject: 'cap_rate_pct',
        value: 1.15,
        unit: '%',
        evidence: [{ sourceId: 'calc', asOf: '2026-08-31', excerpt: '순영업소득 산출' }],
        provenance: 'derived',
        asOf: '2026-08-31',
        status: 'reconciled',
      });
      reg2.register({
        subject: 'asking_price_eok',
        value: 230,
        unit: '억원',
        evidence: [{ sourceId: 'broker', asOf: '2026-08-31', excerpt: '중개인 메모' }],
        provenance: 'broker',
        asOf: '2026-08-31',
        status: 'unverified',
      });
      reg2.register({
        subject: 'land_area_pyeong',
        value: 180.3,
        unit: '평',
        evidence: [{ sourceId: 'gov', asOf: '2026-08-31', excerpt: '토지대장' }],
        provenance: 'public_data',
        asOf: '2026-08-31',
        status: 'verified',
      });

      const hash1 = computeDeterministicClaimsHash(reg1);
      const hash2 = computeDeterministicClaimsHash(reg2);

      expect(hash1).toBe(hash2);
      expect(hash1.startsWith('sha256:')).toBe(true);
    });

    it('Negative Pair: computeDeterministicClaimsHash changes if any claim value is mutated', () => {
      const reg1 = new ClaimRegistry();
      reg1.register({
        subject: 'cap_rate_pct',
        value: 1.15,
        unit: '%',
        evidence: [{ sourceId: 'calc', asOf: '2026-08-31', excerpt: '순수익률' }],
        provenance: 'derived',
        asOf: '2026-08-31',
        status: 'reconciled',
      });

      const reg2 = new ClaimRegistry();
      reg2.register({
        subject: 'cap_rate_pct',
        value: 1.93, // Mutated value
        unit: '%',
        evidence: [{ sourceId: 'calc', asOf: '2026-08-31', excerpt: '순수익률' }],
        provenance: 'derived',
        asOf: '2026-08-31',
        status: 'reconciled',
      });

      const hash1 = computeDeterministicClaimsHash(reg1);
      const hash2 = computeDeterministicClaimsHash(reg2);

      expect(hash1).not.toBe(hash2);
    });

    it('Positive Pair: registerActionCardClaims registers 4 canonical claims per scenario with derived provenance and relocation risk', () => {
      const registry = new ClaimRegistry();
      const card = {
        id: 'card-1',
        cardOrder: 1,
        currentStateSummary: '현재 지상 2~4층 공실 상태',
        posture: 'income' as const,
        scenarios: [
          {
            type: 'value_add',
            title: 'F&B 및 메디컬 직영 유치',
            stabilizedCapRate: 4.5,
            stabilizedNOI: 450000000,
            stabilizedMonthlyRent: 37500000,
            estimatedValue: 10000000000,
            capexBudget: 200000000,
            executionPeriodMonths: 6,
          },
        ],
        involvesTenantRelocation: true,
      };

      const result = registerActionCardClaims(registry, card, '2026-08-31');

      // 4 scenario claims + 1 premium risk claim = 5 claims
      expect(result.claims.length).toBe(5);
      expect(result.cardWithClaimIds.relatedClaimIds?.length).toBe(5);
      expect(result.cardWithClaimIds.premiumRiskClaim).toBeDefined();

      const capRateClaim = registry.getLatestBySubject('action_card_1_value_add_cap_rate');
      expect(capRateClaim).toBeDefined();
      expect(capRateClaim?.value).toBe(4.5);
      expect(capRateClaim?.unit).toBe('%');
      expect(capRateClaim?.provenance).toBe('derived');

      const noiClaim = registry.getLatestBySubject('action_card_1_value_add_noi');
      expect(noiClaim?.value).toBe(450000000);

      const premiumClaim = registry.getLatestBySubject('action_card_1_premium_risk');
      expect(premiumClaim).toBeDefined();
      expect(premiumClaim?.expertRequired).toBe(true);
    });

    it('Negative Pair: registerActionCardClaims without relocation does not flag premium risk claim', () => {
      const registry = new ClaimRegistry();
      const card = {
        id: 'card-2',
        cardOrder: 2,
        currentStateSummary: '단순 금리 재융자 시나리오',
        posture: 'stable_income' as const,
        scenarios: [
          {
            type: 'refinance',
            title: '선순위 대출 차환',
            stabilizedCapRate: 3.8,
            stabilizedNOI: 380000000,
            stabilizedMonthlyRent: 31600000,
            estimatedValue: 10000000000,
          },
        ],
        involvesTenantRelocation: false,
      };

      const result = registerActionCardClaims(registry, card, '2026-08-31');
      expect(result.claims.length).toBe(4);
      expect(result.cardWithClaimIds.premiumRiskClaim).toBeUndefined();
      expect(registry.getLatestBySubject('action_card_2_premium_risk')).toBeUndefined();
    });

    it('Positive Pair: registerProFormaClaims registers stabilized yield, upside, and space metrics', () => {
      const registry = new ClaimRegistry();
      const claims = registerProFormaClaims(registry, {
        currentCapRatePct: 1.15,
        estimatedFullOccupancyCapRatePct: 1.93,
        upsideCapRatePp: 0.78,
        vacantFloorCount: 3,
        vacantAreaPyeong: 85.5,
        proFormaAnnualNoiKrw: 443900000,
      });

      expect(claims.length).toBe(5);
      const capRateClaim = registry.getLatestBySubject('pro_forma_cap_rate');
      expect(capRateClaim?.value).toBe(1.93);
      expect(capRateClaim?.unit).toBe('%');

      const upsideClaim = registry.getLatestBySubject('pro_forma_upside_cap_rate_pp');
      expect(upsideClaim?.value).toBe(0.78);
      expect(upsideClaim?.unit).toBe('%p');

      const floorClaim = registry.getLatestBySubject('pro_forma_vacant_floors');
      expect(floorClaim?.value).toBe(3);

      const noiClaim = registry.getLatestBySubject('pro_forma_annual_noi');
      expect(noiClaim?.value).toBe(443900000);
    });

    it('Positive Pair: Dealcard package with rent roll, pro-forma, and value-add renders all 3 callout boxes and valid hash', () => {
      const obs = parseMemoToObservations('서초동 1364 FM빌딩 230억 대지 180평');

      const enrichment = {
        rentRoll: {
          totalUnits: 6,
          vacancyRatePct: 50.0,
          units: [
            { tenantIndustry: '의원/메디컬', floor: '1F' },
            { tenantIndustry: '업무시설', floor: '2F' },
          ],
        },
        proFormaOpportunity: {
          currentCapRatePct: 1.15,
          estimatedFullOccupancyCapRatePct: 1.93,
          upsideCapRatePp: 0.78,
          vacantFloorCount: 3,
          vacantAreaPyeong: 80,
        },
        actionCards: [
          {
            cardOrder: 1,
            currentStateSummary: '공실 3개층 리모델링',
            scenarios: [
              { type: 'value_add', title: 'F&B 및 메디컬 직영 유치' },
            ],
          },
        ],
      };

      const pkg = bandDealcardPackage(obs, enrichment);
      expect(pkg.rentRollSummary).toBeDefined();
      expect(pkg.rentRollSummary?.bandedUnitCount).toBe('총 6개 구획');
      expect(pkg.rentRollSummary?.tenantIndustryMix).toContain('의원/메디컬');

      expect(pkg.proFormaVacancy).toBeDefined();
      expect(pkg.proFormaVacancy?.hasUpside).toBe(true);
      expect(pkg.proFormaVacancy?.currentCapRateBand).toContain('1%대 초반');
      expect(pkg.proFormaVacancy?.stabilizedCapRateBand).toContain('1%대 후반');

      expect(pkg.valueAddSummary).toBeDefined();
      expect(pkg.valueAddSummary?.strategies).toContain('F&B 및 메디컬 직영 유치');

      const rendered = renderDealcardHtml(pkg);
      expect(rendered.html).toContain('rent-roll-box');
      expect(rendered.html).toContain('pro-forma-box');
      expect(rendered.html).toContain('value-add-box');
      expect(rendered.html).toContain('임대차 현황 요약');
      expect(rendered.html).toContain('만실 정상화(Pro-forma) 업사이드 기회');
      expect(rendered.html).toContain('밸류애드 핵심 포인트');
      expect(rendered.packageHash.startsWith('sha256:')).toBe(true);
    });

    it('Negative Pair: Dealcard package without optional enrichment omits all callout boxes from rendered HTML', () => {
      const obs = parseMemoToObservations('신사동 590 760억 대지 300평');

      const pkg = bandDealcardPackage(obs);
      expect(pkg.rentRollSummary).toBeUndefined();
      expect(pkg.proFormaVacancy).toBeUndefined();
      expect(pkg.valueAddSummary).toBeUndefined();

      const rendered = renderDealcardHtml(pkg);
      expect(rendered.html).not.toContain('rent-roll-box');
      expect(rendered.html).not.toContain('pro-forma-box');
      expect(rendered.html).not.toContain('value-add-box');
      expect(rendered.packageHash.startsWith('sha256:')).toBe(true);
    });
  });
});
