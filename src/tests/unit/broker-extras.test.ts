/**
 * D4: 중개인 추가 정보(broker-extras) — 파서 한도/정제, 폼 변환, 모바일 뷰어 블록 빌더 단위 테스트
 */
import { describe, it, expect } from 'vitest';
import {
  parseBrokerExtras,
  hasBrokerExtras,
  countBrokerExtrasFilled,
  mapBrokerExtrasStrings,
  buildBrokerExtrasBlocks,
  applyBrokerExtrasToSections,
  brokerExtrasFormToInput,
  brokerExtrasToForm,
  EMPTY_BROKER_EXTRAS_FORM,
  BROKER_EXTRAS_LIMITS as L,
  BROKER_EXTRAS_HEADINGS,
  type BrokerExtras,
} from '@/domain/building/mobile-im/broker-extras';
import { sanitizeComplianceText } from '@/domain/building/guardrails';

function ok(input: unknown): BrokerExtras | undefined {
  const r = parseBrokerExtras(input);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
function err(input: unknown): string {
  const r = parseBrokerExtras(input);
  if (r.ok) throw new Error('expected failure');
  return r.error;
}

describe('parseBrokerExtras — 빈 값/형식', () => {
  it('undefined/null/빈 객체/전부 공백 → value undefined', () => {
    expect(ok(undefined)).toBeUndefined();
    expect(ok(null)).toBeUndefined();
    expect(ok({})).toBeUndefined();
    expect(ok({ investment_points: ['  ', ''], closing_line: '   ', regulatory_notes: [], market_comps: [], location_note: '\n\t', post_acquisition_plan: [''] })).toBeUndefined();
  });
  it('객체가 아니면 오류', () => {
    expect(parseBrokerExtras('x').ok).toBe(false);
    expect(parseBrokerExtras([]).ok).toBe(false);
    expect(parseBrokerExtras(5).ok).toBe(false);
  });
  it('배열 필드가 배열이 아니면 오류', () => {
    expect(parseBrokerExtras({ investment_points: 'a' }).ok).toBe(false);
    expect(parseBrokerExtras({ regulatory_notes: {} }).ok).toBe(false);
    expect(parseBrokerExtras({ market_comps: 'x' }).ok).toBe(false);
  });
});

describe('parseBrokerExtras — 정제', () => {
  it('trim + 빈 항목 제거 + 제어문자/<> 제거 (재작성 없음)', () => {
    const v = ok({
      investment_points: ['  역세권 1분 ', '', '\u0000<b>리모델링</b>\u0007 가능'],
      closing_line: '  문의 환영\n',
    })!;
    expect(v.investment_points).toEqual(['역세권 1분', 'b리모델링/b 가능']);
    expect(v.closing_line).toBe('문의 환영');
  });
  it('개행/탭은 공백으로 평탄화', () => {
    expect(ok({ location_note: '1호선\n2호선\t환승' })!.location_note).toBe('1호선 2호선 환승');
  });
});

describe('parseBrokerExtras — 한도', () => {
  it('투자 포인트: 5개 허용, 6개 초과 오류, 61자 오류', () => {
    expect(ok({ investment_points: ['a', 'b', 'c', 'd', 'e'] })!.investment_points).toHaveLength(L.investmentPointsMax);
    expect(err({ investment_points: ['a', 'b', 'c', 'd', 'e', 'f'] })).toContain('최대 5개');
    expect(ok({ investment_points: ['가'.repeat(60)] })).toBeDefined();
    expect(err({ investment_points: ['가'.repeat(61)] })).toContain('60자');
  });
  it('빈 항목은 개수에 포함되지 않는다', () => {
    expect(ok({ investment_points: ['a', '', 'b', ' ', 'c', 'd', 'e'] })!.investment_points).toHaveLength(5);
  });
  it('마무리 한줄 80자', () => {
    expect(ok({ closing_line: '가'.repeat(80) })).toBeDefined();
    expect(err({ closing_line: '가'.repeat(81) })).toContain('80자');
  });
  it('입지 설명 200자, 매입 후 전략 3개/80자', () => {
    expect(ok({ location_note: '가'.repeat(200) })).toBeDefined();
    expect(err({ location_note: '가'.repeat(201) })).toContain('200자');
    expect(err({ post_acquisition_plan: ['a', 'b', 'c', 'd'] })).toContain('최대 3개');
    expect(err({ post_acquisition_plan: ['가'.repeat(81)] })).toContain('80자');
  });
  it('규제·계획: 4건, 내용 100자/제목 30자, 내용 필수', () => {
    const row = (i: number) => ({ kind: 'other', detail: `메모${i}` });
    expect(ok({ regulatory_notes: [0, 1, 2, 3].map(row) })!.regulatory_notes).toHaveLength(4);
    expect(err({ regulatory_notes: [0, 1, 2, 3, 4].map(row) })).toContain('최대 4건');
    expect(err({ regulatory_notes: [{ kind: 'other', detail: '가'.repeat(101) }] })).toContain('100자');
    expect(err({ regulatory_notes: [{ kind: 'other', title: '가'.repeat(31), detail: 'x' }] })).toContain('30자');
    expect(err({ regulatory_notes: [{ kind: 'other', title: '제목만' }] })).toContain('내용');
    expect(err({ regulatory_notes: [{ kind: 'nope', detail: 'x' }] })).toContain('구분');
  });
  it('구분만 선택한 빈 행은 버려진다', () => {
    expect(ok({ regulatory_notes: [{ kind: 'district_plan', detail: '', basis: '', restricted_acts: '', period: '' }] })).toBeUndefined();
  });
  it('개발행위허가제한만 근거/제한행위/기한 유지, 한도 80자', () => {
    const v = ok({
      regulatory_notes: [
        { kind: 'dev_restriction', detail: '제한구역', basis: '고시 제2025-1호', restricted_acts: '건축물 신축', period: '2027.12까지' },
        { kind: 'district_plan', detail: '1층 근생 의무', basis: '무시됨', period: '무시됨' },
      ],
    })!;
    expect(v.regulatory_notes![0]).toMatchObject({ kind: 'dev_restriction', basis: '고시 제2025-1호', restricted_acts: '건축물 신축', period: '2027.12까지' });
    expect(v.regulatory_notes![1]).toEqual({ kind: 'district_plan', detail: '1층 근생 의무' });
    expect(err({ regulatory_notes: [{ kind: 'dev_restriction', detail: 'x', basis: '가'.repeat(81) }] })).toContain('80자');
  });
  it('시세 비교: 6행, 소재지 40자/비고 40자, 소재지·수치 필수', () => {
    const row = (i: number) => ({ kind: 'transaction', location: `서울 ${i}`, price_eok: 10 + i });
    expect(ok({ market_comps: [0, 1, 2, 3, 4, 5].map(row) })!.market_comps).toHaveLength(6);
    expect(err({ market_comps: [0, 1, 2, 3, 4, 5, 6].map(row) })).toContain('최대 6행');
    expect(err({ market_comps: [{ kind: 'listing', location: '가'.repeat(41), price_eok: 1 }] })).toContain('40자');
    expect(err({ market_comps: [{ kind: 'listing', location: 'x', price_eok: 1, note: '가'.repeat(41) }] })).toContain('40자');
    expect(err({ market_comps: [{ kind: 'listing', price_eok: 5 }] })).toContain('소재지');
    expect(err({ market_comps: [{ kind: 'listing', location: '신사동' }] })).toContain('가격');
    expect(err({ market_comps: [{ kind: 'weird', location: 'x', price_eok: 1 }] })).toContain('구분');
  });
  it('시세 비교 빈 행은 버려지고, 숫자만 있으면서 소재지가 없으면 오류', () => {
    expect(ok({ market_comps: [{ kind: 'transaction', location: '', price_eok: undefined, note: '' }] })).toBeUndefined();
  });
});

describe('parseBrokerExtras — 숫자', () => {
  it('양수만 허용: 0/음수/NaN/Infinity/문자 오류', () => {
    for (const bad of [0, -1, NaN, Infinity, 'abc']) {
      expect(parseBrokerExtras({ target_rent_per_pyeong_manwon: bad }).ok).toBe(false);
      expect(parseBrokerExtras({ market_comps: [{ kind: 'transaction', location: 'x', price_eok: bad }] }).ok).toBe(false);
      expect(parseBrokerExtras({ market_comps: [{ kind: 'transaction', location: 'x', land_price_per_pyeong_manwon: bad }] }).ok).toBe(false);
    }
  });
  it('숫자 문자열(쉼표 포함)과 빈 문자열 처리', () => {
    expect(ok({ target_rent_per_pyeong_manwon: '12.5' })!.target_rent_per_pyeong_manwon).toBe(12.5);
    expect(ok({ market_comps: [{ kind: 'listing', location: 'x', land_price_per_pyeong_manwon: '12,000' }] })!.market_comps![0].land_price_per_pyeong_manwon).toBe(12000);
    expect(ok({ target_rent_per_pyeong_manwon: '' })).toBeUndefined();
  });
  it('목표 임대료만 있어도 value 가 반환된다', () => {
    expect(ok({ target_rent_per_pyeong_manwon: 9 })).toEqual({ target_rent_per_pyeong_manwon: 9 });
  });
});

describe('hasBrokerExtras / countBrokerExtrasFilled / mapBrokerExtrasStrings', () => {
  it('hasBrokerExtras', () => {
    expect(hasBrokerExtras(undefined)).toBe(false);
    expect(hasBrokerExtras({})).toBe(false);
    expect(hasBrokerExtras({ investment_points: [] })).toBe(false);
    expect(hasBrokerExtras({ closing_line: 'x' })).toBe(true);
    expect(hasBrokerExtras({ target_rent_per_pyeong_manwon: 1 })).toBe(true);
  });
  it('count (목표 임대료 제외)', () => {
    expect(countBrokerExtrasFilled({ investment_points: ['a', 'b'], closing_line: 'c', location_note: 'd', target_rent_per_pyeong_manwon: 3 })).toBe(4);
  });
  it('mapBrokerExtrasStrings: 문자열만 변환, 숫자/구조 보존', () => {
    const src: BrokerExtras = {
      investment_points: ['수익률 보장'],
      market_comps: [{ kind: 'listing', location: '확정 수익 동', price_eok: 3.5 }],
      regulatory_notes: [{ kind: 'dev_restriction', detail: '원금 보장', basis: 'b' }],
      target_rent_per_pyeong_manwon: 7,
    };
    const out = mapBrokerExtrasStrings(src, sanitizeComplianceText);
    expect(out.investment_points).toEqual(['수익률 추정']);
    expect(out.market_comps![0]).toEqual({ kind: 'listing', location: '예상 수익 동', price_eok: 3.5 });
    expect(out.regulatory_notes![0]).toMatchObject({ detail: '원금 손실 가능성 있음', basis: 'b' });
    expect(out.target_rent_per_pyeong_manwon).toBe(7);
  });
});

describe('폼 ↔ 입력 변환', () => {
  it('빈 폼 → parse → undefined', () => {
    expect(ok(brokerExtrasFormToInput(EMPTY_BROKER_EXTRAS_FORM))).toBeUndefined();
  });
  it('줄바꿈 textarea → 배열, 왕복 복원', () => {
    const form = {
      ...EMPTY_BROKER_EXTRAS_FORM,
      investmentPointsText: '포인트1\r\n\n포인트2\n',
      closingLine: '마무리',
      regulatoryRows: [{ kind: 'dev_restriction' as const, detail: '제한', basis: '고시', restricted_acts: '신축', period: '2027' }],
      compRows: [{ kind: 'transaction' as const, location: '신사동', price_eok: '45.5', land_price_per_pyeong_manwon: '', note: '2025.3' }],
      locationNote: '역세권',
      postAcquisitionPlanText: '임대료 현실화',
      targetRent: '11',
    };
    const parsed = ok(brokerExtrasFormToInput(form))!;
    expect(parsed.investment_points).toEqual(['포인트1', '포인트2']);
    expect(parsed.market_comps![0]).toEqual({ kind: 'transaction', location: '신사동', price_eok: 45.5, note: '2025.3' });
    expect(parsed.target_rent_per_pyeong_manwon).toBe(11);
    const back = brokerExtrasToForm(parsed);
    expect(back.investmentPointsText).toBe('포인트1\n포인트2');
    expect(back.regulatoryRows[0]).toMatchObject({ kind: 'dev_restriction', basis: '고시' });
    expect(back.compRows[0].price_eok).toBe('45.5');
    expect(back.targetRent).toBe('11');
    expect(brokerExtrasToForm(undefined)).toEqual(EMPTY_BROKER_EXTRAS_FORM);
  });
  it('숫자 칸에 문자가 들어가면 NaN → 파서가 거절', () => {
    const form = { ...EMPTY_BROKER_EXTRAS_FORM, targetRent: 'abc' };
    expect(parseBrokerExtras(brokerExtrasFormToInput(form)).ok).toBe(false);
  });
});

describe('buildBrokerExtrasBlocks — 결정론 텍스트 블록', () => {
  const extras: BrokerExtras = {
    investment_points: ['역세권 1분', '코너 입지'],
    closing_line: '현장 방문을 환영합니다',
    regulatory_notes: [
      { kind: 'district_plan', title: '1층 용도', detail: '근생만 허용' },
      { kind: 'dev_restriction', detail: '개발행위허가제한구역', basis: '고시 제2025-1호', restricted_acts: '건축물 신축', period: '2027.12.31까지' },
    ],
    market_comps: [
      { kind: 'transaction', location: '신사동 123 | 일대', price_eok: 45, land_price_per_pyeong_manwon: 12345.5, note: '2025.3' },
      { kind: 'listing', location: '논현동 1', price_eok: 38.256 },
    ],
    location_note: '지하철 3호선 도보 1분',
    post_acquisition_plan: ['임대료 현실화', '1층 리테일 재배치'],
    target_rent_per_pyeong_manwon: 10,
  };

  it('입력이 없으면 빈 객체', () => {
    expect(buildBrokerExtrasBlocks(undefined)).toEqual({});
    expect(buildBrokerExtrasBlocks({})).toEqual({});
    expect(buildBrokerExtrasBlocks({ target_rent_per_pyeong_manwon: 9 })).toEqual({});
  });
  it('투자 포인트·마무리 → investment_thesis 불릿 + 인용', () => {
    const b = buildBrokerExtrasBlocks(extras);
    expect(b.investment_thesis).toBe(`${BROKER_EXTRAS_HEADINGS.investmentPoints}\n\n- 역세권 1분\n- 코너 입지\n\n> 현장 방문을 환영합니다`);
  });
  it('규제·계획: 제목/구분 라벨, 개발행위허가제한만 근거·제한행위·기한 노출', () => {
    const r = buildBrokerExtrasBlocks(extras).regulatory!;
    expect(r.startsWith(BROKER_EXTRAS_HEADINGS.regulatory)).toBe(true);
    expect(r).toContain('- **지구단위계획** · 1층 용도: 근생만 허용');
    expect(r).toContain('- **개발행위허가제한**: 개발행위허가제한구역');
    expect(r).toContain('  - 근거: 고시 제2025-1호');
    expect(r).toContain('  - 제한행위: 건축물 신축');
    expect(r).toContain('  - 기한: 2027.12.31까지');
  });
  it('시세 비교 표: 파이프 이스케이프, 숫자 원문 표기, 결측은 -', () => {
    const t = buildBrokerExtrasBlocks(extras).comparables!;
    const lines = t.split('\n');
    expect(lines[0]).toBe(BROKER_EXTRAS_HEADINGS.marketComps);
    expect(lines[2]).toBe('| 구분 | 소재지 | 가격 | 토지평당가 | 비고 |');
    expect(lines[4]).toBe('| 실거래 | 신사동 123 / 일대 | 45억 | 12,345.5만원/평 | 2025.3 |');
    expect(lines[5]).toBe('| 매물 | 논현동 1 | 38.26억 | - | - |');
  });
  it('입지/전략 블록', () => {
    const b = buildBrokerExtrasBlocks(extras);
    expect(b.location_access).toBe(`${BROKER_EXTRAS_HEADINGS.locationNote}\n\n지하철 3호선 도보 1분`);
    expect(b.lease_status).toBe(`${BROKER_EXTRAS_HEADINGS.postAcquisitionPlan}\n\n- 임대료 현실화\n- 1층 리테일 재배치`);
  });
  it('마무리 한줄만 있어도 블록 생성', () => {
    expect(buildBrokerExtrasBlocks({ closing_line: '끝' }).investment_thesis).toBe(`${BROKER_EXTRAS_HEADINGS.investmentPoints}\n\n> 끝`);
  });
});

describe('applyBrokerExtrasToSections — 기존 섹션에만 덧붙임', () => {
  const mk = () => [
    { section_type: 'investment_thesis', markdown: '기존 요약\n' },
    { section_type: 'land_detail', markdown: '토지' },
    { section_type: 'risk_check', markdown: '리스크' },
    { section_type: 'comparables', markdown: '' },
    { section_type: 'location_access', markdown: '입지' },
    { section_type: 'lease_status', markdown: '임대' },
  ];
  const extras: BrokerExtras = {
    investment_points: ['a'],
    regulatory_notes: [{ kind: 'other', detail: '메모' }],
    market_comps: [{ kind: 'transaction', location: 'x', price_eok: 1 }],
    location_note: '위치',
    post_acquisition_plan: ['전략'],
  };

  it('각 섹션 끝에 블록을 덧붙이고 규제는 land_detail 에만', () => {
    const s = mk();
    const applied = applyBrokerExtrasToSections(s, extras);
    expect(applied).toEqual(['investment_thesis', 'land_detail', 'comparables', 'location_access', 'lease_status']);
    expect(s[0].markdown).toBe(`기존 요약\n\n${BROKER_EXTRAS_HEADINGS.investmentPoints}\n\n- a`);
    expect(s[1].markdown).toContain(BROKER_EXTRAS_HEADINGS.regulatory);
    expect(s[2].markdown).toBe('리스크');
    expect(s[3].markdown.startsWith(BROKER_EXTRAS_HEADINGS.marketComps)).toBe(true);
  });
  it('land_detail 이 없으면 risk_check 로 폴백', () => {
    const s = mk().filter((x) => x.section_type !== 'land_detail');
    const applied = applyBrokerExtrasToSections(s, { regulatory_notes: extras.regulatory_notes });
    expect(applied).toEqual(['risk_check']);
    expect(s.find((x) => x.section_type === 'risk_check')!.markdown).toContain(BROKER_EXTRAS_HEADINGS.regulatory);
  });
  it('대상 섹션이 없으면 새 섹션을 만들지 않는다', () => {
    const s = [{ section_type: 'property_overview', markdown: 'p' }];
    expect(applyBrokerExtrasToSections(s, extras)).toEqual([]);
    expect(s).toHaveLength(1);
    expect(s[0].markdown).toBe('p');
  });
  it('중복 덧붙임 방지(멱등)', () => {
    const s = mk();
    applyBrokerExtrasToSections(s, extras);
    const snapshot = JSON.stringify(s);
    applyBrokerExtrasToSections(s, extras);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
  it('extras/sections 없으면 no-op', () => {
    expect(applyBrokerExtrasToSections(undefined, extras)).toEqual([]);
    expect(applyBrokerExtrasToSections(mk(), undefined)).toEqual([]);
  });
  it('sanitize 후에도 블록이 유지된다 (가드레일 치환만 적용)', () => {
    const s = mk();
    applyBrokerExtrasToSections(s, { investment_points: ['수익률 보장 아님'] });
    const sanitized = sanitizeComplianceText(s[0].markdown);
    expect(sanitized).toContain(BROKER_EXTRAS_HEADINGS.investmentPoints);
    expect(sanitized).toContain('수익률 추정 아님');
  });
});
