/**
 * Wave 3 (Axis 5) — Supabase Disk IO Budget Diet & Multi-Broker Security Gate E2E Test Suite
 *
 * 검증 범위:
 * 1. JSONB Payload Diet (`stripHeavyBase64ForDb` & `studioService.saveProject`):
 *    - 600KB급 지적도(`cadastralMapImage`) 및 400KB급 위치도(`locationMapImage`) Base64가 포함된
 *      문서/스튜디오 프로젝트를 저장할 때, DB `document_objects.body`로 직렬화되는 페이로드에서
 *      인라인 Base64 이미지가 100% 제거되고 총 JSONB 크기가 50KB 미만인지 검증
 *    - 반면 인메모리 `studioService.getProject(id)`에는 지적도 이미지가 유지되어 즉시 렌더링 가능한지 검증
 *    - 일반 HTTPS Storage 사진 URL(`https://...`)은 손실 없이 100% 보존되는지 검증
 * 2. Cross-Broker Ownership Security Gate (`assertDealOwner` / `assertStudioDealOwner`):
 *    - 중개사 A(`broker-owner-001`) 소유의 매물/IM/스튜디오 프로젝트에 대해
 *      중개사 B(`broker-attacker-999`)가 접근·수정을 시도할 경우 즉시 `403 FORBIDDEN` 차단
 *    - `owner_id === null`인 미귀속 레코드에 대해서도 fail-closed(`403 FORBIDDEN`) 차단
 */
import { describe, it, expect, vi } from 'vitest';
import { buildPseudoGoldenScenarios } from './fixtures/pseudo-golden-generator';
import { createBasicImTestInput } from './fixtures/basic-im-factory';
import {
  stripHeavyBase64ForDb,
  isHeavyInlineBase64Image,
} from '@/lib/supabase/jsonb-diet';
import { assertDealOwner } from '@/lib/authz/assert-owner';

describe('Wave 3 (Axis 5): Supabase Disk IO Budget Diet & Multi-Broker Security Gate', () => {
  const scenarios = buildPseudoGoldenScenarios();

  it('[Axis 5-1] stripHeavyBase64ForDb strips 600KB+ inline Base64 maps to < 50KB while preserving HTTPS photo URLs', async () => {
    const r1 = scenarios[0]!;
    const pptxInput = await createBasicImTestInput(r1.bottomSheet, {
      coordinates: r1.coordinates,
      buildingName: r1.buildingName,
      posture: r1.posture,
      photos: r1.photos,
      pnu: r1.pnu,
      skipEnrichment: true,
      ssotExtra: r1.ssotExtra,
    });

    const fake600KbBase64 = 'data:image/png;base64,' + 'A'.repeat(600_000);
    const fake400KbRawBase64 = 'iVBORw0KGgoAAAANSUhEUgAA' + 'B'.repeat(400_000);

    expect(isHeavyInlineBase64Image(fake600KbBase64)).toBe(true);
    expect(isHeavyInlineBase64Image(fake400KbRawBase64)).toBe(true);
    expect(isHeavyInlineBase64Image('https://example.com/photo.jpg')).toBe(false);

    const bloatedDocBody: Record<string, any> = {
      ...pptxInput.doc.body,
      cadastralMapImage: fake600KbBase64,
      locationMapImage: fake400KbRawBase64,
      mapImageUrl: fake600KbBase64,
      enrichment: {
        ...(pptxInput.doc.body.enrichment || {}),
        cadastralMapImage: {
          base64: fake600KbBase64,
          width: 800,
          height: 600,
        },
        locationMapImage: fake400KbRawBase64,
      },
    };

    const beforeBytes = Buffer.byteLength(JSON.stringify(bloatedDocBody), 'utf8');
    expect(beforeBytes).toBeGreaterThan(2_000_000); // > 2MB before diet

    const slimDocBody = stripHeavyBase64ForDb(bloatedDocBody);
    const afterJson = JSON.stringify(slimDocBody);
    const afterBytes = Buffer.byteLength(afterJson, 'utf8');

    // Must be < 50KB after diet
    expect(afterBytes).toBeLessThan(50 * 1024);
    expect(afterJson).not.toContain('data:image/png;base64,');
    expect(afterJson).not.toContain('iVBORw0KGgoAAAANSUhEUgAA');

    // HTTPS photo URLs and rent roll data must remain intact
    const slimPhotos = slimDocBody.photos ?? slimDocBody.photos_v2 ?? [];
    expect(slimPhotos.length).toBe(r1.photos.length);
    expect(slimDocBody.floor_leases.length).toBe((r1.bottomSheet.floor_leases || []).length);
    expect(slimDocBody.enrichment.cadastralMapImage).toBeNull();
  });

  it('[Axis 5-2] studioService.saveProject strips heavy Base64 on DB upsert while preserving in-memory cadastralMapImage', async () => {
    const r2 = scenarios[1]!;
    const pptxInput = await createBasicImTestInput(r2.bottomSheet, {
      coordinates: r2.coordinates,
      buildingName: r2.buildingName,
      posture: r2.posture,
      photos: r2.photos,
      pnu: r2.pnu,
      skipEnrichment: true,
      ssotExtra: r2.ssotExtra,
    });

    const fake500KbMap = 'data:image/png;base64,' + 'M'.repeat(500_000);
    const upsertedPayloads: any[] = [];

    vi.resetModules();
    vi.doMock('@/lib/supabase/service', () => ({
      createServiceClient: () => ({
        from: (table: string) => ({
          upsert: async (row: any) => {
            if (table === 'document_objects') {
              upsertedPayloads.push(row);
            }
            return { data: row, error: null };
          },
        }),
      }),
    }));

    const { studioService } = await import('@/domain/building/pptx-studio/studio-service');
    const docBodyWithHeavyMap = {
      ...pptxInput.doc.body,
      enrichment: {
        ...(pptxInput.doc.body.enrichment || {}),
        cadastralMapImage: fake500KbMap,
      },
    };

    const project = await studioService.createBasicImProject(
      pptxInput.buildingId,
      pptxInput.doc.title || 'Basic IM',
      docBodyWithHeavyMap
    );

    expect(upsertedPayloads.length).toBeGreaterThanOrEqual(1);
    const lastUpsert = upsertedPayloads[upsertedPayloads.length - 1];
    const dbSerialized = JSON.stringify(lastUpsert.body);
    const dbBytes = Buffer.byteLength(dbSerialized, 'utf8');

    // DB payload must be < 50KB and contain zero inline Base64 maps
    expect(dbBytes).toBeLessThan(50 * 1024);
    expect(lastUpsert.body.buildingContext.enrichment.cadastralMapImage).toBeNull();

    // In-memory project retains cadastralMapImage for immediate rendering
    const inMemoryProject = await studioService.getProject(project.id);
    expect(inMemoryProject.buildingContext?.enrichment?.cadastralMapImage).toBe(fake500KbMap);

    vi.doUnmock('@/lib/supabase/service');
  });

  it('[Axis 5-3] Multi-Broker Ownership Security Gate blocks cross-broker access & null-owner records with 403 FORBIDDEN', async () => {
    const mockDbRows: Record<string, { id: string; owner_id: string | null }> = {
      'deal-owned-by-broker-a': { id: 'deal-owned-by-broker-a', owner_id: 'broker-owner-001' },
      'deal-orphan-no-owner': { id: 'deal-orphan-no-owner', owner_id: null },
    };

    const mockSupabase = {
      from: (_table: string) => ({
        select: (_cols: string) => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: async () => ({
              data: mockDbRows[id] ?? null,
              error: null,
            }),
          }),
        }),
      }),
    };

    // 1. Legitimate owner Broker A succeeds
    const ownerCheck = await assertDealOwner(
      mockSupabase,
      'deal-owned-by-broker-a',
      'broker-owner-001',
      { allowAdmin: true, role: 'broker' }
    );
    expect(ownerCheck.ok).toBe(true);

    // 2. Attacker Broker B attempting to read/modify/delete Broker A's deal gets 403 FORBIDDEN
    const attackerCheck = await assertDealOwner(
      mockSupabase,
      'deal-owned-by-broker-a',
      'broker-attacker-999',
      { allowAdmin: true, role: 'broker' }
    );
    expect(attackerCheck.ok).toBe(false);
    if (!attackerCheck.ok) {
      expect(attackerCheck.status).toBe(403);
      expect(attackerCheck.code).toBe('FORBIDDEN');
    }

    // 3. Orphan deal with owner_id === null fails closed with 403 FORBIDDEN
    const orphanCheck = await assertDealOwner(
      mockSupabase,
      'deal-orphan-no-owner',
      'broker-attacker-999',
      { allowAdmin: true, role: 'broker' }
    );
    expect(orphanCheck.ok).toBe(false);
    if (!orphanCheck.ok) {
      expect(orphanCheck.status).toBe(403);
      expect(orphanCheck.code).toBe('FORBIDDEN');
    }

    // 4. Non-existent deal returns 404 NOT_FOUND
    const missingCheck = await assertDealOwner(
      mockSupabase,
      'deal-does-not-exist',
      'broker-owner-001',
      { allowAdmin: true, role: 'broker' }
    );
    expect(missingCheck.ok).toBe(false);
    if (!missingCheck.ok) {
      expect(missingCheck.status).toBe(404);
      expect(missingCheck.code).toBe('NOT_FOUND');
    }
  });
});
