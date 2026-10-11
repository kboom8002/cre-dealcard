/**
 * Task B — 명도(eviction) 분석의 Pro·개발형 PPTX 노출
 *  - 표시 텍스트는 lease-adapter.analyzeEviction 출력(SSOT)에서만 온다 (재계산 없음)
 *  - 평가 기준일·'추정' 표기, 명도 대상이 없으면 생략
 *  - Basic(fact_om 9면)은 불변 — 어떤 availability 플래그로도 명도 면이 들어가지 않는다
 *  - 개발형이 아닌 Pro 덱에는 들어가지 않는다 (뷰어와 동일: posture === 'development')
 */
import { describe, it, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import { analyzeEviction, normalizeFloorLeases } from '@/domain/building/mobile-im/lease-adapter';
import {
  buildProEvictionData,
  PRO_EVICTION_DATA_KEY,
  resolveEvictionBasis,
} from '@/domain/building/mobile-im/pptx/binder/pro-eviction';
import { bindProImChapterData } from '@/domain/building/mobile-im/pptx/binder/pro-chapter-binder';
import { buildProDeckSequence } from '@/domain/building/mobile-im/pptx/pro-deck-sequencer';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { buildA26BrokerExtras } from '@/domain/building/mobile-im/pptx/archetypes/a26-broker-extras';
import { BASIC_IM_BOUNDS } from '@/domain/building/mobile-im/pptx/basic-im-contract';
import { assertZeroEvasivePhrases, extractSlideTexts } from '@/assurance/im-harness/golden-test-utils';

const LEASES = [
  { floor: '3F', tenant_name: '알파상사', area_pyeong: 30, deposit_manwon: 5000, rent_manwon: 400, lease_end: '2027-06-30' },
  { floor: '2F', tenant_name: '베타클리닉', area_pyeong: 30, deposit_manwon: 6000, rent_manwon: 500, lease_end: '2028-03-31' },
  { floor: '1F', tenant_name: '감마카페', area_pyeong: 20, deposit_manwon: 4000, rent_manwon: 600, lease_end: '2026-12-31' },
  { floor: 'B1', area_pyeong: 25, deposit_manwon: 0, rent_manwon: 0, is_vacant: true },
];
const AS_OF = '2026-10-05';
const BODY = { floor_leases: LEASES, rent_roll_meta: { rentroll_as_of: AS_OF } };

describe('buildProEvictionData — analyzeEviction 단일 진실원', () => {
  const data = buildProEvictionData(BODY)!;
  const analysis = analyzeEviction(normalizeFloorLeases(LEASES as any), AS_OF);

  it('분석 원본이 analyzeEviction 출력과 동일 (재계산 아님)', () => {
    expect(data).not.toBeNull();
    expect(data.analysis).toEqual(analysis);
    expect(data.mode).toBe('eviction');
  });

  it('카드 텍스트가 analysis 값에서 나온다 (뷰어 표와 같은 자릿수)', () => {
    const vals = (data.statCards as Array<{ label: string; value: string; sub: string }>).map(s => s.value).join(' | ');
    expect(analysis.totalTenants).toBe(3);
    expect(vals).toContain(`${analysis.totalTenants}건`);
    expect(vals).toContain(`약 ${(analysis.depositRefundKrw / 1e8).toFixed(1)}억 원`);
    expect(vals).toContain(`약 ${(analysis.estimatedEvictionCostKrw / 1e8).toFixed(2)}억 원`);
    expect(vals).toContain(`약 ${analysis.estimatedMonths}개월`);
    const subs = (data.statCards as Array<{ sub: string }>).map(s => s.sub).join(' | ');
    expect(subs).toContain(String(analysis.latestLeaseEnd));
  });

  it('평가 기준일과 추정 표기가 라벨에 있다', () => {
    expect(data.basisDate).toBe(AS_OF);
    expect(data.basisLabel).toContain(AS_OF);
    expect(data.basisLabel).toContain('추정');
    expect((data.assumptions as string[]).join(' ')).toContain(`평가 기준일 ${AS_OF}`);
  });

  it('가정 문구의 수치(이사비 300만원·월세 6개월분)가 analyzeEviction 산식과 일치', () => {
    const rentSum = LEASES.filter(l => !(l as any).is_vacant).reduce((a, l) => a + l.rent_manwon * 10000, 0);
    expect(analysis.estimatedEvictionCostKrw).toBe(analysis.totalTenants * 3_000_000 + rentSum * 6);
    const txt = (data.assumptions as string[]).join(' ');
    expect(txt).toContain('300만원');
    expect(txt).toContain('6개월분');
    expect(txt).toContain('가정 기반 추정');
  });

  it('렌트롤 기준일이 없으면 작성일(오늘 KST)로 표기', () => {
    const now = new Date('2026-10-11T03:00:00Z');
    const d = buildProEvictionData({ floor_leases: LEASES }, { now })!;
    expect(d.basisDate).toBe('2026-10-11');
    expect(d.assumptions.join(' ')).toContain('작성일');
    expect(resolveEvictionBasis(null, now)).toEqual({ ymd: '2026-10-11', fromRentRoll: false });
    expect(resolveEvictionBasis('2026-10-05', now)).toEqual({ ymd: '2026-10-05', fromRentRoll: true });
  });

  it('명도 대상이 없으면 생략 (null)', () => {
    expect(buildProEvictionData({})).toBeNull();
    expect(buildProEvictionData({ floor_leases: [] })).toBeNull();
    expect(buildProEvictionData({ floor_leases: [{ floor: 'B1', area_pyeong: 10, is_vacant: true }] })).toBeNull();
    expect(buildProEvictionData(null)).toBeNull();
  });

  it('최장 만기일이 없으면 "-" (회피 문구 "미정" 금지)', () => {
    const d = buildProEvictionData({ floor_leases: [{ floor: '1F', tenant_name: '무기한', area_pyeong: 10, deposit_manwon: 1000, rent_manwon: 100 }] })!;
    expect(JSON.stringify(d.statCards)).not.toContain('미정');
    expect(JSON.stringify(d.statCards)).toContain('최장 만기일 -');
  });
});

describe('Pro 바인더 — 데이터 키', () => {
  it('명도 대상이 있으면 evictionEstimate 키 생성, 없으면 생성하지 않음', () => {
    const withData = bindProImChapterData({ title: 't', body: { ...BODY } } as any, {}, {});
    expect(withData[PRO_EVICTION_DATA_KEY]).toBeTruthy();
    const without = bindProImChapterData({ title: 't', body: { floor_leases: [] } } as any, {}, {});
    expect(without[PRO_EVICTION_DATA_KEY]).toBeUndefined();
  });

  it('시퀀서의 dataKey 리터럴과 일치', () => {
    const seq = buildProDeckSequence({ posture: 'development', grade: 'B', dataAvailability: { hasEvictionEstimate: true } } as any);
    expect(seq.some(s => s.dataKey === PRO_EVICTION_DATA_KEY)).toBe(true);
  });
});

describe('시퀀서 — 노출 범위', () => {
  const keys = (input: any) => buildProDeckSequence(input).map(s => s.dataKey);

  it('Pro·개발형 + 명도 대상 → 임대차 현황 직후 1면 추가', () => {
    const base = keys({ posture: 'development', grade: 'B' });
    const withEv = keys({ posture: 'development', grade: 'B', dataAvailability: { hasEvictionEstimate: true } });
    expect(withEv.length).toBe(base.length + 1);
    expect(withEv.indexOf('evictionEstimate')).toBe(withEv.indexOf('rentRollPart2') + 1);
    expect(withEv.indexOf('facility_mep')).toBe(withEv.indexOf('evictionEstimate') + 1);
  });

  it('Pro·개발형이라도 명도 대상이 없으면(플래그 false) 변화 없음', () => {
    expect(keys({ posture: 'development', grade: 'B', dataAvailability: { hasEvictionEstimate: false } }))
      .toEqual(keys({ posture: 'development', grade: 'B' }));
  });

  it('Pro·비개발형(수익형 등)은 플래그가 있어도 추가하지 않음', () => {
    for (const posture of ['income', 'owner_occupied', 'trading', 'operating']) {
      const k = keys({ posture, grade: 'B', dataAvailability: { hasEvictionEstimate: true } });
      expect(k, posture).not.toContain('evictionEstimate');
    }
  });

  it('Basic(credeal_basic) 시퀀스는 불변 — 개발형 + 플래그에도 명도 면 없음, 면수 동일', () => {
    const da = { hasRentRoll: true, hasStackingPlan: true, hasPhotos: true, hasCadastralMap: true };
    const mk = (extra: Record<string, unknown>) => buildDeckSequence({
      posture: 'development', preset: 'credeal_basic', grade: 'B', dataAvailability: { ...da, ...extra },
    } as any).map(s => s.dataKey);
    const plain = mk({});
    const flagged = mk({ hasEvictionEstimate: true });
    expect(flagged).toEqual(plain);
    expect(flagged).not.toContain('evictionEstimate');
    expect(flagged.length).toBe(plain.length);
    expect(flagged.length).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);
  });
});

describe('A26 eviction 렌더', () => {
  async function renderEviction() {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    const data = buildProEvictionData(BODY)!;
    const out = buildA26BrokerExtras({ pres, slideNum: 16, docno: 'T-EV', data, grade: 'B', provenance: {} } as any);
    const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
    const [slide] = await extractSlideTexts(buffer);
    return { out, text: slide.text, buffer };
  }

  it('analysis 값·평가 기준일·추정 표기가 슬라이드 텍스트에 나온다', async () => {
    const analysis = analyzeEviction(normalizeFloorLeases(LEASES as any), AS_OF);
    const { out, text } = await renderEviction();
    expect(out.suppress).toBeFalsy();
    for (const s of [
      '명도 대상 임차인 및 예상 비용 (추정)',
      `평가 기준일 ${AS_OF}`,
      `${analysis.totalTenants}건`,
      `약 ${(analysis.estimatedEvictionCostKrw / 1e8).toFixed(2)}억 원`,
      `약 ${analysis.estimatedMonths}개월`,
      '산정 기준 및 유의사항',
      '300만원',
    ]) expect(text).toContain(s);
    // 중개인 출처 칩은 달지 않는다 (중개인 입력이 아님)
    expect(text).not.toContain('중개인 제공 · 미검증');
  });

  it('회피 문구/오염 토큰 없음', async () => {
    const { buffer, text } = await renderEviction();
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('undefined');
    await assertZeroEvasivePhrases(buffer);
  });
});
