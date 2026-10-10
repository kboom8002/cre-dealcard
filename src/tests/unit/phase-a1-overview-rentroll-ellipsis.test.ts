/**
 * Phase A1 (D5 물건 개요 / D6 렌트롤 / D7 '…' 절단) 회귀 테스트
 *
 * D5: resolveOverviewSpecs / buildOverviewSpecRows — 대장 값이 LLM '-' 보다 우선, 법정 상한 표기, 미상 행 생략
 * D6: resolveTenantAndUse / resolveLeaseNote / formatAreaWithPyeong / 비고 열 / 임대면적 평 병기
 * D7: normalizeMissing, 공실 컴팩트 문자열, enforceTextBudget 절 경계, 스태킹 라벨 약어, imlib stat/rows 무말줄임
 *
 * Rule 7: Positive/Negative pair 포함
 */
import { describe, it, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import {
  resolveOverviewSpecs,
  buildOverviewSpecRows,
  isMissingSpecValue,
} from '@/domain/building/mobile-im/pptx/spec-resolver';
import {
  bindRentRollTable,
  resolveTenantAndUse,
  resolveLeaseNote,
  parseLeadingNumber,
} from '@/domain/building/mobile-im/pptx/binder/rent-roll-table-builder';
import { formatLeaseArea } from '@/domain/building/mobile-im/pptx/binder/lease-area-format';
import { projectBasicRentRollColumns } from '@/domain/building/mobile-im/pptx/rentroll-area-columns';
import { normalizeMissing, isMissingToken } from '@/domain/building/mobile-im/pptx/missing-values';
import {
  buildVacancyCompact,
  shortenVacancyText,
} from '@/domain/building/mobile-im/pptx/binder/archetype-builders';
import { enforceTextBudget, TEXT_LIMITS } from '@/domain/building/mobile-im/pptx/text-budget';
import {
  abbreviateTenantLabel,
  chooseStackLabel,
} from '@/domain/building/mobile-im/pptx/archetypes/a24-rentroll-stacking';
import { stat, rows } from '@/domain/building/mobile-im/pptx/imlib';

const NOW = 2026;

// ───────────────────────── D5 ─────────────────────────
describe('D5 resolveOverviewSpecs / buildOverviewSpecRows', () => {
  const enrichment = {
    buildingRegister: {
      bcRat: 58.4, vlRat: 398.8, useAprDay: '20030514',
      floorsAbove: 12, floorsBelow: 2, mainPurpose: '업무시설', structure: '철근콘크리트구조',
    },
    landUsePlan: { zoningDistrict: '일반상업지역', buildingCoverageMax: 60, floorAreaRatioMax: 400, limitsSource: 'official' },
  };

  it('POSITIVE: 대장 실제 키(bcRat/vlRat/useAprDay/floorsAbove…)를 읽어 행 생성', () => {
    const specs = resolveOverviewSpecs(enrichment, {}, {}, undefined, { nowYear: NOW });
    expect(specs).toMatchObject({ bcrNow: 58.4, farNow: 398.8, bcrMax: 60, farMax: 400, floorsAbove: 12, floorsBelow: 2 });
    expect(specs.useAprDay).toBe('2003.05.14');
    expect(specs.useAprAge).toBe(NOW - 2003);
    const map = new Map(buildOverviewSpecRows(specs));
    expect(map.get('용도지역')).toBe('일반상업지역');
    expect(map.get('건폐율 / 용적률')).toBe('58.4% / 398.8% (법정 60% / 400%)');
    expect(map.get('사용승인일')).toBe(`2003.05.14 (건축 후 약 ${NOW - 2003}년)`);
    expect(map.get('층수')).toBe('지하 2층 / 지상 12층');
    expect(map.get('주용도')).toBe('업무시설');
    expect(map.get('주구조')).toBe('철근콘크리트구조');
  });

  it('NEGATIVE: 용도지역 추정 법정 상한(공식 출처 아님)은 표기하지 않는다', () => {
    const inferred = { ...enrichment, landUsePlan: { ...enrichment.landUsePlan, limitsSource: 'inferred_zoning' } };
    const specs = resolveOverviewSpecs(inferred, {}, {}, undefined, { nowYear: NOW });
    expect(specs.bcrMax).toBeUndefined();
    expect(specs.farMax).toBeUndefined();
    expect(new Map(buildOverviewSpecRows(specs)).get('건폐율 / 용적률')).toBe('58.4% / 398.8%');
  });

  it('POSITIVE: ssot_summary(handler가 쓴 키)만 있어도 동일 행 생성 (대장 > ssot 우선순위)', () => {
    const specs = resolveOverviewSpecs(
      { buildingRegister: { bcRat: 50 } },
      { zoning: '준주거지역', bcr_pct: 40, far_pct: 250, floors_above: 5 },
      {}, undefined, { nowYear: NOW },
    );
    expect(specs.bcrNow).toBe(50); // 대장이 ssot 보다 우선
    expect(specs.farNow).toBe(250);
    expect(specs.zoning).toBe('준주거지역');
    expect(specs.floorsAbove).toBe(5);
  });

  it('NEGATIVE: 알 수 없는 제원은 "-" 가 아니라 행 자체를 생략한다 (날조 금지)', () => {
    const specs = resolveOverviewSpecs({}, {}, {}, undefined, { nowYear: NOW });
    expect(buildOverviewSpecRows(specs)).toEqual([]);
    const partial = buildOverviewSpecRows(resolveOverviewSpecs({ buildingRegister: { floorsAbove: 7 } }, {}, {}));
    expect(partial).toEqual([['층수', '지상 7층']]);
    for (const [, v] of partial) expect(v).not.toBe('-');
  });

  it('NEGATIVE: "[용도 미기재]" 등 대장 플레이스홀더는 값으로 취급하지 않는다', () => {
    const specs = resolveOverviewSpecs({ buildingRegister: { mainPurpose: '[용도 미기재]', structure: '[구조 미기재]' } }, {}, {});
    expect(specs.mainPurpose).toBeUndefined();
    expect(specs.structure).toBeUndefined();
    expect(isMissingSpecValue('확인 필요')).toBe(true);
    expect(isMissingSpecValue('-')).toBe(true);
    expect(isMissingSpecValue('일반상업지역')).toBe(false);
  });

  it('법정 상한만 있으면(공식 출처) 라벨에 (법정) 을 명시해 현황으로 오인되지 않게 한다', () => {
    const rowsOut = buildOverviewSpecRows(resolveOverviewSpecs({ landUsePlan: { buildingCoverageMax: 60, floorAreaRatioMax: 400, limitsSource: 'official' } }, {}, {}));
    expect(rowsOut).toEqual([['건폐율 / 용적률 (법정)', '60% / 400%']]);
  });

  it('NEGATIVE: 다필지 용도지역이 서로 다르면 결합 표기하고 단일 법정 상한은 생략', () => {
    const specs = resolveOverviewSpecs(
      { ...enrichment, landUseByParcel: [{ zoningDistrict: '일반상업지역' }, { zoningDistrict: '제2종일반주거지역' }] },
      {}, {}, undefined, { nowYear: NOW },
    );
    expect(specs.zoning).toBe('일반상업지역 / 제2종일반주거지역');
    expect(specs.bcrMax).toBeUndefined();
    expect(specs.farMax).toBeUndefined();
    expect(new Map(buildOverviewSpecRows(specs)).get('건폐율 / 용적률')).toBe('58.4% / 398.8%');
  });
});

// ───────────────────────── D6 ─────────────────────────
describe('D6 resolveTenantAndUse / 비고 / 임대면적 평 병기', () => {
  it('POSITIVE: 업종(용도)은 항상 표시, 상호 없으면 마스킹 임차인 A/B (업종을 임차인 칸에 복사 금지)', () => {
    expect(resolveTenantAndUse({ tenant_type: '디자인 스튜디오' }, { maskSeq: 0 })).toMatchObject({ tenant: '임차인 A', use: '디자인 스튜디오', isMasked: true });
    expect(resolveTenantAndUse({ tenant_type: '세무사' }, { maskSeq: 1 })).toMatchObject({ tenant: '임차인 B', use: '세무사' });
    expect(resolveTenantAndUse({ tenant_name: '스타벅스', tenant_type: '카페' })).toMatchObject({ tenant: '스타벅스', use: '카페', isMasked: false });
  });

  it('POSITIVE: 상호 + 업종 결합 문자열 "카페(스타벅스)" 분해, 상호 == 업종이면 입력 그대로(마스킹 금지)', () => {
    expect(resolveTenantAndUse({ tenant_type: '카페(스타벅스)' })).toMatchObject({ tenant: '스타벅스', use: '카페' });
    expect(resolveTenantAndUse({ tenant_name: '세무사', tenant_type: '세무사' }, { maskSeq: 2 })).toMatchObject({ tenant: '세무사', use: '-', isMasked: false });
  });

  it('NEGATIVE: 공실은 임차인 "공실", 용도에 공실 표식 반복 금지', () => {
    expect(resolveTenantAndUse({ tenant_type: '(공실)', is_vacant: true })).toMatchObject({ tenant: '공실', use: '-', isVacant: true });
    expect(resolveTenantAndUse({ tenant_name: '공실' }).isVacant).toBe(true);
  });

  it('resolveLeaseNote: 입력 필드에서만 구성, 없으면 빈 문자열 (날조 금지)', () => {
    expect(resolveLeaseNote({})).toBe('');
    expect(resolveLeaseNote({ note: '분할임대' })).toBe('분할임대');
    expect(resolveLeaseNote({ note: '-' })).toBe('');
    expect(resolveLeaseNote({ renewal_exercised: '있음' })).toBe('갱신요구권 행사');
    expect(resolveLeaseNote({ note: '분할임대', lease_state: '자가사용' })).toBe('분할임대 · 자가사용');
  });

  it('formatLeaseArea / parseLeadingNumber: 단일 단위 소수 2자리, 파싱은 첫 숫자 토큰만 (레거시 병기 문자열도 파싱)', () => {
    expect(formatLeaseArea(209.6, 'sqm')).toBe('209.60');
    expect(formatLeaseArea(209.6, 'pyeong')).toBe('63.40');
    expect(formatLeaseArea(undefined, 'sqm')).toBe('-');
    expect(parseLeadingNumber('1,234.5 (373.4평)')).toBeCloseTo(1234.5, 5);
    expect(parseLeadingNumber('-')).toBe(0);
  });

  const bind = (floorLeases: any[], preset = 'credeal_basic') => {
    const result: Record<string, any> = { rentRoll: { title: '렌트롤', content: '', tables: [] } };
    bindRentRollTable({ body: { preset, floor_leases: floorLeases } }, '', result);
    return result.rentRoll as { tableHead: string[]; tableRows: string[][] };
  };

  it('POSITIVE: 비고 입력이 있을 때만 "비고" 열 추가 (임대상태/갱신요구권 포함)', () => {
    const withNote = bind([
      { floor: '1F', tenant_type: '카페', area_sqm: 100, deposit_manwon: 1, rent_manwon: 1, note: '분할임대' },
      { floor: '2F', tenant_type: '병원', area_sqm: 100, deposit_manwon: 1, rent_manwon: 1 },
    ]);
    expect(withNote.tableHead[withNote.tableHead.length - 1]).toBe('비고');
    expect(withNote.tableRows[0][withNote.tableHead.length - 1]).toBe('분할임대');
    for (const r of withNote.tableRows) expect(r).toHaveLength(withNote.tableHead.length);
  });

  it('NEGATIVE: 비고 입력이 없으면 비고 열을 만들지 않는다 (빈 열 금지) / Pro 7열 불변', () => {
    const noNote = bind([{ floor: '1F', tenant_type: '카페', area_sqm: 100, deposit_manwon: 1, rent_manwon: 1 }]);
    expect(noNote.tableHead).not.toContain('비고');
    expect(noNote.tableHead).toHaveLength(10);
    const pro = bind([{ floor: '1F', tenant_type: '카페', area_sqm: 100, deposit_manwon: 1, rent_manwon: 1, note: '분할임대' }], 'credeal_pro');
    expect(pro.tableHead).toHaveLength(7);
  });

  it('NEGATIVE: 면적이 없으면 임대면적 셀은 "-" (날조 금지)', () => {
    const r = bind([{ floor: '1F', tenant_type: '카페', deposit_manwon: 1, rent_manwon: 1 }]);
    const areaIdx = r.tableHead.findIndex(h => h.startsWith('임대면적')); // 머리글은 '임대면적(㎡)'|'(평)' — 접두어 매칭
    expect(areaIdx).toBeGreaterThanOrEqual(0);
    expect(r.tableRows[0][areaIdx]).toBe('-');
  });

  it('projectBasicRentRollColumns: 비고 값이 있는 행이 있을 때만 keep 에 비고 포함, 헤더/폭/keep 길이 일치', () => {
    const base = ['1F', '임차인 A', '카페', '100.0 (30.3평)', '-', '1', '1', '0', '1', '2027-01-01'];
    const none = projectBasicRentRollColumns([base]);
    expect(none.headers).not.toContain('비고');
    const withNote = projectBasicRentRollColumns([[...base, '분할임대']]);
    expect(withNote.headers[withNote.headers.length - 1]).toBe('비고');
    expect(withNote.colW).toHaveLength(withNote.headers.length);
    expect(withNote.keep).toHaveLength(withNote.headers.length);
  });
});

// ───────────────────────── D7 ─────────────────────────
describe('D7 normalizeMissing', () => {
  it('POSITIVE: 미기재/확인 필요 류는 "-" 로 정규화', () => {
    for (const v of ['미기재', '미상', '확인 필요', 'N/A', '[용도 미기재]']) expect(normalizeMissing(v)).toBe('-');
    expect(isMissingToken('확인 필요')).toBe(true);
  });

  it('NEGATIVE: 실제 값/null 처리', () => {
    expect(normalizeMissing('스타벅스')).toBe('스타벅스');
    expect(normalizeMissing('209.6 (63.4평)')).toBe('209.6 (63.4평)');
    expect(normalizeMissing(null as any)).toBe('');
  });
});

describe('D7 공실 컴팩트 문자열', () => {
  it('POSITIVE: 공실 호실 수 · 면적 (비율%) — 입력 단위(㎡|평) 단일 표기', () => {
    const leases = [
      { floor: '1F', tenant_type: '카페', area_pyeong: 100 },
      { floor: '2F', tenant_type: '(공실)', is_vacant: true, area_pyeong: 10 },
    ];
    // v1.5 §9.1: 기본 ㎡ (10평 = 33.06㎡ → 정수 33㎡), 평 모드는 입력한 평 그대로
    expect(buildVacancyCompact(leases)).toBe('공실 1개 호실 · 33㎡ (9.1%)');
    expect(buildVacancyCompact(leases, 'pyeong')).toBe('공실 1개 호실 · 10평 (9.1%)');
    expect(buildVacancyCompact(leases, 'sqm')).not.toMatch(/평/);
  });

  it('POSITIVE: 면적 없이 공실만 → 호실 수만 / 공실 없음 → 만실', () => {
    expect(buildVacancyCompact([{ floor: 'B1', tenant_type: '공실', is_vacant: true }, { floor: '1F', tenant_type: '카페' }])).toBe('공실 1개 호실');
    expect(buildVacancyCompact([{ floor: '1F', tenant_type: '카페' }])).toBe('만실 운영 (공실 0%)');
  });

  it('NEGATIVE: 임대차 데이터가 없으면 null (날조 금지)', () => {
    expect(buildVacancyCompact(undefined)).toBeNull();
    expect(buildVacancyCompact([])).toBeNull();
  });

  it('shortenVacancyText: 문장 → 첫 절, "…" 없음', () => {
    const s = shortenVacancyText('B1층 1개 호실 공실, 나머지 전 층 임대 중이며 안정적 운영');
    expect(s).toBe('B1층 1개 호실 공실');
    expect(s).not.toContain('…');
    expect(shortenVacancyText('만실')).toBe('만실');
  });
});

describe('D7 enforceTextBudget — 절/문장 경계 절단', () => {
  it('POSITIVE: 한도 상향 (statValue 40, leadSentence 120)', () => {
    expect(TEXT_LIMITS.statValue).toBe(40);
    expect(TEXT_LIMITS.leadSentence).toBe(120);
  });

  it('POSITIVE: 쉼표/가운뎃점 절 경계에서 잘리고 "…" 이 붙지 않는다', () => {
    const text = '공실 1개 호실 · 78평 (9.6%), 나머지 전 층 임대 중이며 안정적 현금흐름을 확보하고 있음';
    const out = enforceTextBudget(text, 30);
    expect(out).not.toContain('…');
    expect(text.startsWith(out)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(30);
  });

  it('NEGATIVE: 소수점(9.6%)은 문장 종결로 취급하지 않는다', () => {
    const text = '공실률은 약 9.6% 수준으로 관리되고 있으며 임대차 계약은 순차적으로 갱신될 예정입니다';
    const out = enforceTextBudget(text, 20);
    expect(out).not.toMatch(/9\.$/);
  });

  it('NEGATIVE: 경계가 전혀 없을 때만 최후 수단으로 "…" (기존 계약 유지)', () => {
    expect(enforceTextBudget('가'.repeat(60), 20).endsWith('…')).toBe(true);
    expect(enforceTextBudget('짧은 문장', 20)).toBe('짧은 문장');
  });
});

describe('D7 스태킹 라벨 약어 / 무말줄임', () => {
  it('POSITIVE: 관행 약어 적용', () => {
    expect(abbreviateTenantLabel('제2종근린생활시설')).toBe('2종근생');
    expect(abbreviateTenantLabel('휴게음식점')).toBe('휴게음식');
    expect(abbreviateTenantLabel('스타벅스')).toBe('스타벅스');
  });

  it('POSITIVE: 좁은 세그먼트에서도 약어로 말줄임 없이 표기', () => {
    const r = chooseStackLabel('제2종근린생활시설', '105.8', 0.62, 8);
    expect(r).not.toBeNull();
    expect(r!.text).not.toContain('…');
  });

  it('NEGATIVE: 너무 좁으면 라벨 생략 (null)', () => {
    expect(chooseStackLabel('컨설팅', '105.8', 0.1, 8)).toBeNull();
  });
});

async function slideTexts(build: (s: any) => void): Promise<string[]> {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  const slide = pres.addSlide();
  build(slide);
  const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  return (xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map((t) => t.replace(/<\/?a:t>/g, ''));
}

describe('D7 imlib stat / rows — 골든 문자열 무말줄임', () => {
  it('POSITIVE: stat 값 "공실 1개 호실 · 78평 (9.6%)" 와 긴 sub 문구에 … 없음', async () => {
    const texts = await slideTexts((s) =>
      stat(s, 0.5, 1.5, 3.7, '공실 현황', '공실 1개 호실 · 78평 (9.6%)', '', 'B1층 1개 호실 공실, 나머지 전 층 임대 중이며 안정적 운영 · 평균 잔여 임대차 기간 2.1년'),
    );
    expect(texts.some((t) => t.includes('…'))).toBe(false);
    expect(texts).toContain('공실 1개 호실 · 78평 (9.6%)');
  });

  it('POSITIVE: 좁은 카드에서도 긴 stat 값은 2줄 폴백 (원문 보존, … 없음)', async () => {
    const value = '공실 3개 호실 · 1,234평 (12.3%)';
    const texts = await slideTexts((s) => stat(s, 0.5, 1.5, 1.9, '공실 현황', value, '', ''));
    expect(texts.some((t) => t.includes('…'))).toBe(false);
    expect(texts).toContain(value);
  });

  it('POSITIVE: rows 값 "58.4% / 398.8% (법정 60% / 400%)" 무말줄임', async () => {
    const value = '58.4% / 398.8% (법정 60% / 400%)';
    const texts = await slideTexts((s) => rows(s, 0.5, 1.5, 4.6, [['건폐율 / 용적률', value]], { rh: 0.315, fs: 10.5 }));
    expect(texts.some((t) => t.includes('…'))).toBe(false);
    expect(texts).toContain(value);
  });

  it('POSITIVE: rows 사용승인일 값 "2003.05.14 (건축 후 약 23년)" 무말줄임', async () => {
    const value = '2003.05.14 (건축 후 약 23년)';
    const texts = await slideTexts((s) => rows(s, 0.5, 1.5, 4.6, [['사용승인일', value]], { rh: 0.315, fs: 10.5 }));
    expect(texts.some((t) => t.includes('…'))).toBe(false);
  });
});
