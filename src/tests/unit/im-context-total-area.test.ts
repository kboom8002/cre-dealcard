import { describe, it, expect, vi } from 'vitest';
import { buildIMContext } from '@/domain/building/mobile-im/im-context-builder';

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({})) }));
vi.mock('@/domain/building/mobile-im/cre-rag-service', () => ({ generateRAGContext: vi.fn(async () => '') }));

const PY = 3.305785;
const leases = [
  { floor: '1F', area_sqm: 700, tenant_name: 'A' },
  { floor: '2F', area_sqm: 779, tenant_name: 'B' },
]; // 렌트롤 합 1,479㎡

const mk = (over: Record<string, any> = {}) => ({
  building_ssot_lite: { id: 'b', ...(over.ssot ?? {}) } as any,
  supplemental: { floor_leases: leases, ...(over.supp ?? {}) } as any,
  readiness: { score: 80, missing: [] },
  external_data: over.ext as any,
  identity: over.identity,
}) as any;

describe('im-context-builder — 연면적 가드 입력 (B3)', () => {
  it('렌트롤 임대면적 합(1,479㎡)은 연면적 후보가 아니다 — 후보 전무면 0', async () => {
    const ctx = await buildIMContext(mk());
    expect(ctx.totalAreaSqm).toBe(0);
  });

  it('렌트롤 합이 있어도 대장 연면적이 있으면 대장 값 (렌트롤 합으로 대체 금지)', async () => {
    const ctx = await buildIMContext(mk({ ext: { buildingRegister: { totalArea: 1687.51 } } }));
    expect(ctx.totalAreaSqm).toBe(1687.51);
  });

  it('handler 해석값(flat.total_area_sqm) 이 대장보다 우선', async () => {
    const ctx = await buildIMContext(mk({
      ssot: { total_area_sqm: 3842.6 },
      ext: { buildingRegister: { totalArea: 231.4 } },
    }));
    expect(ctx.totalAreaSqm).toBe(3842.6);
  });

  it('메모 SSoT 평 키(layers.total_floor_area_pyung)도 읽는다 (handler 미경유 경로)', async () => {
    const ctx = await buildIMContext(mk({
      ssot: { layers: { total_floor_area_pyung: 1162.4 } },
      ext: { buildingRegister: { totalArea: 231.4 } },
    }));
    expect(ctx.totalAreaSqm).toBeCloseTo(1162.4 * PY, 1);
  });

  it('개발 포스처: 신축 가능 연면적 2,500평 은 기존 연면적으로 읽지 않는다', async () => {
    const ctx = await buildIMContext(mk({
      ssot: { layers: { total_floor_area_pyung: 2500 }, raw_input: '대지면적 197평\n신축 가능 연면적 2,500평' },
      identity: { investmentPosture: 'development' },
      supp: { floor_leases: undefined },
    }));
    expect(ctx.totalAreaSqm).toBe(0);
  });

  it('명시 입력(㎡/평)이 대장보다 우선', async () => {
    const a = await buildIMContext(mk({ supp: { total_gross_area_m2: 1000 }, ext: { buildingRegister: { totalArea: 1100 } } }));
    expect(a.totalAreaSqm).toBe(1000);
    const b = await buildIMContext(mk({ supp: { total_gross_area_pyeong: 100 }, ext: { buildingRegister: { totalArea: 1100 } } }));
    expect(b.totalAreaSqm).toBeCloseTo(100 * PY, 2);
  });
});
