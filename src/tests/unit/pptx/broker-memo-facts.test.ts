/**
 * broker-memo-facts: 중개인 메모 명시값 결정론 추출 (골든 오라클 결함 — 호텔 KPI / 개발 허가용적률·토지평당·신축연면적 / 사옥 절감액·손익분기)
 * 값 창작 금지(Rule 34): 메모에 없으면 undefined.
 */
import { describe, it, expect } from 'vitest';
import {
  parseBrokerMemoFacts,
  parseHospitalityMemoFacts,
  resolveHotelOperating,
  brokerMemoTextOf,
} from '@/domain/building/mobile-im/pptx/binder/broker-memo-facts';
import { buildSummaryFromOverview } from '@/domain/building/mobile-im/pptx/binder/archetype-builders';
import { buildOperatingKpiProps } from '@/domain/building/mobile-im/pptx/binder/posture-builders';

const HOTEL_MEMO = [
  '에이치에비뉴호텔 이대점 매각',
  '매각가 300억',
  '총 객실 94실 (스탠다드 더블 46, 트윈 28, 디럭스 14, 스위트 6)',
  '운영: 에이치 에비뉴 위탁운영 (2029년 만료)',
  'ADR 95,000원, OCC 78%, RevPAR 74,100원',
  '연간 총매출 약 28.2억, GOP 약 10.7억 (GOP 마진 38%)',
  'Cap Rate (GOP 기준) 약 3.57%',
].join('\n');

describe('parseHospitalityMemoFacts', () => {
  it('POSITIVE: 호텔 메모의 객실·ADR·OCC·RevPAR·GOP마진·매출·GOP·운영사 복원', () => {
    const h = parseHospitalityMemoFacts(HOTEL_MEMO);
    expect(h.totalRooms).toBe(94);
    expect(h.adrKrw).toBe(95000);
    expect(h.occPct).toBe(78);
    expect(h.revparKrw).toBe(74100);
    expect(h.gopMarginPct).toBe(38);
    expect(h.annualRevenueKrw).toBe(2_820_000_000);
    expect(h.annualGopKrw).toBe(1_070_000_000);
    expect(h.operatorName).toBe('에이치 에비뉴');
    expect(h.operatingModel).toBe('management_contract');
  });

  it('POSITIVE: 만원 단위 ADR', () => {
    expect(parseHospitalityMemoFacts('ADR 9.5만원, OCC 80%').adrKrw).toBe(95000);
  });

  it('POSITIVE: RevPAR 미기재 + ADR/OCC 기재 → ADR×OCC 결정론 파생', () => {
    expect(parseHospitalityMemoFacts('ADR 100,000원 OCC 70%').revparKrw).toBe(70000);
  });

  it('NEGATIVE: RevPAR 은 ADR/OCC 중 하나라도 없으면 파생하지 않는다', () => {
    expect(parseHospitalityMemoFacts('ADR 100,000원').revparKrw).toBeUndefined();
    expect(parseHospitalityMemoFacts('OCC 70%').revparKrw).toBeUndefined();
  });

  it('NEGATIVE: 호텔 수치가 없는 일반 메모는 빈 객체 (창작 금지)', () => {
    const h = parseHospitalityMemoFacts('서초동 1364-28 FM빌딩 매각\n매각가 230억\n대지 180.3평');
    expect(h).toEqual({});
  });

  it('NEGATIVE: 범위 밖 OCC(150%)는 무시', () => {
    expect(parseHospitalityMemoFacts('OCC 150%').occPct).toBeUndefined();
  });
});

describe('parseBrokerMemoFacts — 개발/사옥', () => {
  const SUTAEK = '매각가 89억 (토지평당 4,500만원)\n용도지역: 일반상업지역 (허가 용적률 1,260%)\n신축 가능 연면적: 약 2,500평 규모 복합개발/오피스텔';
  it('POSITIVE: 허가 용적률 / 토지평당 / 신축 가능 연면적', () => {
    const d = parseBrokerMemoFacts(SUTAEK).development;
    expect(d.maxFarPct).toBe(1260);
    expect(d.landPricePerPyeongManwon).toBe(4500);
    expect(d.plannedGfaPyung).toBe(2500);
  });
  it('POSITIVE: 토지평당 억 단위 → 만원', () => {
    expect(parseBrokerMemoFacts('매각가 약 242억 (토지평당 1.3억)').development.landPricePerPyeongManwon).toBe(13000);
  });
  it('NEGATIVE: 법정 용적률은 허가 용적률로 취급하지 않는다', () => {
    expect(parseBrokerMemoFacts('법정 용적률 800%').development.maxFarPct).toBeUndefined();
  });
  it('NEGATIVE: "2023년 신축 연면적 300평"처럼 계획 표현이 아니면 별도 신축 키워드 필요 — 현황 연면적은 plannedGfa 로 오인하지 않는다', () => {
    expect(parseBrokerMemoFacts('대지면적 596㎡, 연면적 2,104.88㎡ (636.7평)').development.plannedGfaPyung).toBeUndefined();
  });
  it('POSITIVE: 사옥 임대료 절감액 / 손익분기', () => {
    const o = parseBrokerMemoFacts('연 임대료 절감액 약 7.5억원, 자가전환 손익분기 약 4.2년').owner;
    expect(o.annualSavingsBil).toBe(7.5);
    expect(o.breakevenYears).toBe(4.2);
  });
});

describe('resolveHotelOperating — 구조화 입력 우선, 메모는 빈 키만 보충', () => {
  it('구조화 ADR 이 메모 ADR 보다 우선', () => {
    const body = { hotel_operating: { adr_krw: 110000 } };
    const op = resolveHotelOperating(body, { raw_input: HOTEL_MEMO });
    expect(op.adr_krw).toBe(110000);
    expect(op.occupancy_rate_pct).toBe(78);
    expect(op.operator_name).toBe('에이치 에비뉴');
  });
  it('메모 위치: building.raw_input → body.raw_input 폴백', () => {
    expect(brokerMemoTextOf({ raw_input: 'x' }, {})).toBe('x');
    expect(brokerMemoTextOf({}, { raw_input: 'y' })).toBe('y');
    expect(brokerMemoTextOf({}, {})).toBe('');
  });
});

describe('buildSummaryFromOverview — 중개인 명시값 바인딩', () => {
  const baseHero = { askingPrice: '300억 원' };

  it('operating: 객실·ADR·OCC·RevPAR·GOP마진(중개인 38% > heroCard 기본 35%)·운영사', () => {
    const body = { heroCard: { ...baseHero, posture: 'operating', gopMarginPct: 35 }, ssot_summary: { asking_price_manwon: 3000000 } };
    const m = buildSummaryFromOverview('', [], body, { raw_input: HOTEL_MEMO }).metrics as Array<{ label: string; value: string }>;
    const byLabel = Object.fromEntries(m.map(x => [x.label, x.value]));
    expect(byLabel['총 객실 수']).toBe('94실');
    expect(byLabel['ADR (객실 단가)']).toBe('95,000원');
    expect(byLabel['OCC (점유율)']).toBe('78%');
    expect(byLabel['RevPAR (객실당 매출)']).toBe('74,100원');
    expect(byLabel['GOP 마진율']).toBe('38%');
    expect(byLabel['운영사']).toBe('에이치 에비뉴');
    expect(m.length).toBeLessThanOrEqual(8);
  });

  it('operating NEGATIVE: 메모/구조화 값이 모두 없으면 KPI 행을 만들지 않는다 (heroCard 값만)', () => {
    const body = { heroCard: { ...baseHero, posture: 'operating' }, ssot_summary: {} };
    const m = buildSummaryFromOverview('', [], body, { raw_input: '서초동 매각' }).metrics as Array<{ label: string }>;
    expect(m.some(x => /ADR|OCC|RevPAR|객실/.test(x.label))).toBe(false);
  });

  it('owner_occupied: 중개인 7.5억/4.2년이 계산값 5.3억/43년을 대체 (충돌 숫자 동시 표기 금지)', () => {
    const body = { heroCard: { ...baseHero, posture: 'owner_occupied', ownVsLeaseSavingsBil: 5.3, breakevenYears: 43 }, ssot_summary: {} };
    const m = buildSummaryFromOverview('', [], body, { raw_input: '연 임대료 절감액 약 7.5억원, 자가전환 손익분기 약 4.2년' }).metrics as Array<{ label: string; value: string; sub?: string }>;
    const text = m.map(x => `${x.label}|${x.value}`).join('\n');
    expect(text).toContain('약 7.5억 원/년');
    expect(text).toContain('약 4.2년');
    expect(text).not.toContain('5.3');
    expect(text).not.toContain('43년');
    expect(m.find(x => x.label === '연 임대료 절감액')?.sub).toBe('● 중개인입력');
  });

  it('owner_occupied: 메모 없으면 기존 계산값 유지', () => {
    const body = { heroCard: { ...baseHero, posture: 'owner_occupied', ownVsLeaseSavingsBil: 5.3, breakevenYears: 43 }, ssot_summary: {} };
    const m = buildSummaryFromOverview('', [], body, { raw_input: '' }).metrics as Array<{ label: string; value: string }>;
    const text = m.map(x => `${x.label}|${x.value}`).join('\n');
    expect(text).toContain('약 5.3억 원/년');
    expect(text).toContain('약 43년');
  });

  it('owner_occupied: 중개인 절감액만 있으면 (계산 절감액 전제의) 계산 손익분기는 생략', () => {
    const body = { heroCard: { ...baseHero, posture: 'owner_occupied', ownVsLeaseSavingsBil: 5.3, breakevenYears: 43 }, ssot_summary: {} };
    const m = buildSummaryFromOverview('', [], body, { raw_input: '연 임대료 절감액 약 7.5억원' }).metrics as Array<{ label: string }>;
    expect(m.some(x => x.label === '자가전환 손익분기')).toBe(false);
  });

  it('development: 신축 목표 규모(계획 GFA)·허가 용적률·중개인 토지평당가, 현황 연면적은 별도 라벨', () => {
    const body = {
      heroCard: { ...baseHero, posture: 'development', landPricePerPyeong: 4518, totalGrossAreaM2: 2032.59 },
      developmentSpec: { targetScalePyung: 464 },
      ssot_summary: {},
    };
    const memo = '매각가 89억 (토지평당 4,500만원)\n용도지역: 일반상업지역 (허가 용적률 1,260%)';
    const m = buildSummaryFromOverview('', [], body, { raw_input: memo }).metrics as Array<{ label: string; value: string }>;
    const byLabel = Object.fromEntries(m.map(x => [x.label, x.value]));
    expect(byLabel['신축 목표 규모']).toBe('464평');
    expect(byLabel['허가 용적률']).toBe('1,260%');
    expect(byLabel['토지 평당가']).toBe('약 4,500만원/평');
    expect(byLabel['현황 연면적']).toBe('2,032.59㎡');
    expect(m.some(x => x.label === '신축 연면적')).toBe(false);
    expect(JSON.stringify(m)).not.toContain('4,518');
  });

  it('development: developmentSpec 이 없으면 메모 "신축 가능 연면적"을 계획 GFA 로 사용 (현황 연면적과 분리)', () => {
    const body = { heroCard: { ...baseHero, posture: 'development' }, ssot_summary: {} };
    const m = buildSummaryFromOverview('', [], body, { raw_input: '신축 가능 연면적: 약 2,500평 규모' }).metrics as Array<{ label: string; value: string }>;
    expect(m.find(x => x.label === '신축 목표 규모')?.value).toBe('2,500평');
    expect(m.some(x => x.label === '현황 연면적')).toBe(false);
  });
});

describe('buildOperatingKpiProps — 메모 보충 + heroCard 키(adr/occPct) 정합', () => {
  it('building.raw_input 의 호텔 KPI 가 KPI 행으로 바인딩', () => {
    const p = buildOperatingKpiProps({}, { raw_input: HOTEL_MEMO });
    const rows = p.kpiRows as [string, string][];
    expect(rows.find(r => r[0].startsWith('총 객실'))?.[1]).toBe('94실');
    expect(rows.find(r => r[0].startsWith('OCC'))?.[1]).toBe('78%');
    expect(rows.find(r => r[0].startsWith('GOP'))?.[1]).toBe('38%');
    expect(rows.find(r => r[0].startsWith('운영사'))?.[1]).toBe('에이치 에비뉴');
  });
  it('heroCard.adr / occPct (writer 저장 키)도 폴백으로 사용', () => {
    const p = buildOperatingKpiProps({ heroCard: { adr: 90000, occPct: 70 } }, {});
    const rows = p.kpiRows as [string, string][];
    expect(rows.find(r => r[0].startsWith('OCC'))?.[1]).toBe('70%');
    expect(rows.find(r => r[0].startsWith('ADR'))).toBeTruthy();
  });
});
