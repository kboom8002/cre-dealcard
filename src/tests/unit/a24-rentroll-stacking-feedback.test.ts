/**
 * A24 렌트롤 + 스태킹 플랜 — 사용자 피드백 회귀 테스트 (p5 양평 수익형 골든 floor_leases)
 *
 *  1) 같은 물리 층(9F-A·9F-B)은 스태킹 도식에서 한 행('9F') + 면적 비례 2개 세그먼트
 *  2) 전용면적 미입력 → '-' (임대면적 복사 금지), 입력 시 실제 값 매핑
 *  3) 스태킹 라벨 단위 ㎡ (표와 같은 문자열) — '평' 표기 없음
 *  4) 용도 칸에 임차인명 복사 금지 (Rule 4)
 *  5) 관리비·만기일 실데이터 매핑, 공실 금액은 '-'
 *
 * Rule 7: Positive/Negative pair 포함
 */
import { describe, it, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { bindRentRollTable, resolveTenantAndUse } from '@/domain/building/mobile-im/pptx/binder/rent-roll-table-builder';
import { formatLeaseArea } from '@/domain/building/mobile-im/pptx/binder/lease-area-format';
import { PYEONG_TO_SQM_V15 } from '@/domain/building/mobile-im/rentroll-meta';
import {
  buildA24RentrollStacking,
  physicalFloorKey,
  groupStackingFloors,
  chooseStackLabel,
  formatNumericCell,
  computeRentRollColumnWidths,
  type StackingUnit,
} from '@/domain/building/mobile-im/pptx/archetypes/a24-rentroll-stacking';

const FIXTURE = path.resolve(process.cwd(), 'docs/golden-test-data/p5-yangpyeong-income/r3-verified/bottom_sheet.json');
const p5Leases: any[] = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).floor_leases;

function bind(floorLeases: any[]) {
  const result: Record<string, any> = { rentRoll: { title: '렌트롤', content: '', tables: [] } };
  bindRentRollTable({ body: { preset: 'credeal_basic', floor_leases: floorLeases } }, '', result);
  return result.rentRoll as { tableHead: string[]; tableRows: string[][] };
}

async function renderSlideXml(data: Record<string, any>) {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  const out = buildA24RentrollStacking({ pres, slideNum: 6, docno: 'DOC-T', grade: 'A', provenance: {}, data });
  const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  const texts = (xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map(t => t.replace(/<\/?a:t>/g, ''));
  const tbl = xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/)![0];
  const nonTable = xml.replace(tbl, '');
  const nonTableTexts = (nonTable.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map(t => t.replace(/<\/?a:t>/g, ''));
  const tableTexts = (tbl.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map(t => t.replace(/<\/?a:t>/g, ''));
  const gridCols = (tbl.match(/<a:gridCol /g) ?? []).length;
  const trs = tbl.match(/<a:tr [\s\S]*?<\/a:tr>/g) ?? [];
  const cellCounts = trs.map(tr => (tr.match(/<a:tc>|<a:tc /g) ?? []).length);
  return { out, xml, texts, nonTableTexts, tableTexts, gridCols, cellCounts };
}

describe('physicalFloorKey / groupStackingFloors — 같은 물리 층 묶기', () => {
  it('POSITIVE: 9F-A·9F-B·9층 901호는 같은 9F', () => {
    expect(physicalFloorKey('9F-A').key).toBe('9F');
    expect(physicalFloorKey('9F-B').key).toBe('9F');
    expect(physicalFloorKey('9층 901호').key).toBe('9F');
    expect(physicalFloorKey('지하1층').key).toBe('B1');
    expect(physicalFloorKey('B1').isSubterranean).toBe(true);
  });

  it('NEGATIVE: 병합/범위 층 라벨(3F~4F, 1-2F)은 다른 층으로 합치지 않는다', () => {
    expect(physicalFloorKey('3F~4F').key).toBe('3F~4F');
    expect(physicalFloorKey('1-2F').key).toBe('1-2F');
    expect(physicalFloorKey('10F').key).not.toBe('1F');
  });

  it('POSITIVE: p5 렌트롤 12개 호실 → 11개 물리 층, 9F 한 행에 2개 세그먼트', () => {
    const rr = bind(p5Leases);
    const units: StackingUnit[] = rr.tableRows.map(r => ({
      unitLabel: r[0], tenant: r[1], areaSqm: parseFloat(r[3].replace(/,/g, '')) || 0, areaText: r[3], isVacant: r[1] === '공실',
    }));
    const groups = groupStackingFloors(units);
    expect(groups).toHaveLength(11);
    expect(groups[0].key).toBe('B1'); // 바닥(지하)부터
    const nine = groups.find(g => g.key === '9F')!;
    expect(nine.units.map(u => u.tenant)).toEqual(['임차인 H', '임차인 I']); // D6: 상호 미입력 → 마스킹 라벨
    expect(nine.totalArea).toBeCloseTo(105.8 + 103.8, 1);
    expect(groups.some(g => g.key === '9F-A' || g.key === '9F-B')).toBe(false);
  });
});

describe('bindRentRollTable — 면적·용도·관리비/만기일 매핑 (p5 골든)', () => {
  const rr = bind(p5Leases);
  const byFloor = (f: string) => rr.tableRows.find(r => r[0] === f)!;

  it('POSITIVE: 임대면적은 area_pyeong ㎡ 환산(천 단위 구분), 전용면적 미입력은 "-"', () => {
    // v1.5 §9.1: 단일 단위 · 소수 2자리 ('(63.4평)' 병기 제거)
    expect(byFloor('2F')[3]).toBe('209.59');
    expect(byFloor('B1')[3]).toBe('422.15');
    for (const r of rr.tableRows) expect(r[4]).toBe('-');
    expect(rr.tableHead.slice(3, 5)).toEqual(['임대면적(㎡)', '전용면적(㎡)']);
  });

  it('NEGATIVE: 전용면적 칸에 임대면적 값을 복사하지 않는다 / 입력이 있으면 실제 값', () => {
    for (const r of rr.tableRows) expect(r[4]).not.toBe(r[3]);
    const withExc = bind([{ floor: '1F', tenant_type: '카페', area_sqm: 1234.5, exclusive_area_sqm: 987.6, deposit_manwon: 1, rent_manwon: 1 }]);
    expect(withExc.tableRows[0][3]).toBe('1,234.50');
    expect(withExc.tableRows[0][4]).toBe('987.60');
    const withExcPy = bind([{ floor: '1F', tenant_type: '카페', area_pyeong: 30, exclusive_area_pyeong: 20 }]);
    expect(withExcPy.tableRows[0][4]).toBe(formatLeaseArea(20 * PYEONG_TO_SQM_V15, 'sqm'));
  });

  it('POSITIVE: 용도는 임차인과 다를 때만 — 업종(상호) 문자열은 분해', () => {
    expect(byFloor('1F').slice(1, 3)).toEqual(['스타벅스', '카페']);
    expect(resolveTenantAndUse({ tenant_name: '스타벅스', tenant_type: '카페' })).toMatchObject({ tenant: '스타벅스', use: '카페' });
  });

  it('NEGATIVE: 용도 칸에 임차인명을 복사하지 않고, 임차인 칸에 업종을 복사하지 않는다 (D6/Rule 4)', () => {
    for (const r of rr.tableRows) {
      if (r[2] !== '-') expect(r[2]).not.toBe(r[1]);
    }
    // 상호 미입력 → 임차인은 마스킹 라벨, 용도는 업종 그대로 표시
    expect(byFloor('2F').slice(1, 3)).toEqual(['임차인 A', '디자인 스튜디오']);
    const same = resolveTenantAndUse({ tenant_name: '세무사', tenant_type: '세무사' }, { maskSeq: 2 });
    // 오너 결정(2026-10): IM 은 실제 임차인명 — 상호==업종 동일 문자열도 임차인 칸에 그대로, 용도 칸은 중복 방지 '-'
    expect(same.use).toBe('-');
    expect(same.tenant).toBe('세무사');
    // 공실: 임차인 '공실', 용도에 공실 표식 반복 금지
    expect(byFloor('B1').slice(1, 3)).toEqual(['공실', '-']);
  });

  it('POSITIVE: 관리비·만기일 실데이터 매핑 (월합계 = 월세 + 관리비)', () => {
    expect(byFloor('1F').slice(5, 10)).toEqual(['7,600', '715', '57', '772', '2026-11-30']);
    expect(byFloor('9F-B').slice(7, 10)).toEqual(['33', '278', '2028-05-31']);
  });

  it('NEGATIVE: 공실의 0원 금액은 "0"이 아니라 "-"', () => {
    expect(byFloor('B1').slice(5, 9)).toEqual(['-', '-', '-', '-']);
  });
});

describe('A24 슬라이드 렌더 (OpenXML) — p5 렌트롤', () => {
  it('POSITIVE: 스태킹 도식 9F 한 행(라벨 1회) + 컨설팅/세무사 세그먼트, 표는 9F-A/9F-B 행 유지', async () => {
    const r = await renderSlideXml(bind(p5Leases));
    expect(r.nonTableTexts.filter(t => t === '9F')).toHaveLength(1);
    expect(r.nonTableTexts).not.toContain('9F-A');
    expect(r.nonTableTexts.some(t => t.startsWith('컨설팅'))).toBe(true);
    expect(r.nonTableTexts.some(t => t.startsWith('세무사'))).toBe(true);
    expect(r.tableTexts).toEqual(expect.arrayContaining(['9F-A', '9F-B']));
  });

  it('POSITIVE: 스태킹 라벨 단위는 ㎡ (표와 같은 숫자), 합계는 표시값의 합 · 천 단위 구분 · 평 병기 없음', async () => {
    const r = await renderSlideXml(bind(p5Leases));
    expect(r.nonTableTexts.some(t => /209\.59㎡$/.test(t))).toBe(true);
    expect(r.nonTableTexts.some(t => /422\.15㎡$/.test(t))).toBe(true);
    // 합계: 행 표기값(소수 2자리)의 합 — v1.5 §9.1, '(N평)' 병기 없음
    expect(r.tableTexts).toContain('2,490.28');
    expect(r.tableTexts.some(t => /\(\d+(\.\d)?평\)/.test(t))).toBe(false);
    expect(r.tableTexts).not.toContain('2490.28');
    expect(r.nonTableTexts).toContain('층별 스태킹 플랜 (㎡)');
    expect(r.nonTableTexts).toContain('면적 ㎡ · 금액 만원');
  });

  it('POSITIVE(평 모드): 머리글·라벨·합계·캡션·스트립 제목이 모두 평 단일 단위, 대장 스냅 없음', async () => {
    const pyBody = { preset: 'credeal_basic', floor_leases: p5Leases, rent_roll_meta: { area_input_unit: 'pyeong' } };
    const result: Record<string, any> = { rentRoll: { title: '렌트롤', content: '', tables: [] } };
    bindRentRollTable({ body: pyBody }, '', result);
    const r = await renderSlideXml({ ...result.rentRoll, registerTotalAreaSqm: 8230.55 });
    expect(r.tableTexts).toEqual(expect.arrayContaining(['임대면적(평)', '63.40']));
    expect(r.tableTexts).not.toContain('임대면적(㎡)');
    expect(r.nonTableTexts.some(t => /63\.40평$/.test(t))).toBe(true);
    expect(r.nonTableTexts).toContain('층별 스태킹 플랜 (평)');
    expect(r.nonTableTexts).toContain('면적 평 · 금액 만원');
    expect(r.nonTableTexts.some(t => /㎡/.test(t) && !/면적/.test(t) && !/비고/.test(t))).toBe(false);
    // 합계 = 표시값의 합 (127.70+55.00+63.40×8+32.00+31.40 = 753.30)
    expect(r.tableTexts).toContain('753.30');
  });

  it('POSITIVE: 계산된 사실 각주(rentrollFactsNote)는 한 줄·하단 안전선 이내, 없으면 생략', async () => {
    const base = bind(p5Leases);
    const withNote = await renderSlideXml({ ...base, rentrollFactsNote: '12개월 내 만기·만료 경과 월세 12.5% · 근거 계약서 원본 3건 · 렌트프리 잔여 2개 호실' });
    expect(withNote.nonTableTexts.some(t => t.startsWith('12개월 내 만기·만료 경과 월세'))).toBe(true);
    const EMU = 914400;
    const offs = [...withNote.xml.matchAll(/<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)]
      .map(m => ({ y: +m[2] / EMU, h: +m[4] / EMU }));
    for (const o of offs.filter(o => o.y >= 1.5 && o.y < 6.8)) expect(o.y + o.h).toBeLessThanOrEqual(6.76);
    const without = await renderSlideXml(base);
    expect(without.nonTableTexts.some(t => t.startsWith('12개월 내'))).toBe(false);
  });

  it('NEGATIVE: 스태킹 도식에 평 라벨·겹치는 각주 없음 (㎡ 모드), 열 수 = 셀 수 (Rule 68/70)', async () => {
    const r = await renderSlideXml(bind(p5Leases));
    expect(r.nonTableTexts.some(t => /\d평/.test(t) && !/면적/.test(t))).toBe(false);
    expect(r.texts.some(t => t.includes('렌트롤 현황 기준'))).toBe(false);
    expect(r.gridCols).toBe(10); // 전용면적 미입력 → 면적 열 투영(임대면적만) + 비고(분할임대 입력 있음)
    expect(new Set(r.cellCounts)).toEqual(new Set([r.gridCols]));
  });

  it('POSITIVE: 모든 도형이 슬라이드 하단 안전선(6.75") 위, 스태킹 폭 ≤ 2.2" 영역', async () => {
    const r = await renderSlideXml(bind(p5Leases));
    const EMU = 914400;
    const offs = [...r.xml.matchAll(/<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)]
      .map(m => ({ x: +m[1] / EMU, y: +m[2] / EMU, w: +m[3] / EMU, h: +m[4] / EMU }));
    const content = offs.filter(o => o.y >= 1.5 && o.y < 6.8);
    for (const o of content) expect(o.y + o.h).toBeLessThanOrEqual(6.76);
  });
});

describe('라벨/열폭 헬퍼', () => {
  it('POSITIVE: 넓으면 "임차인 면적㎡", 좁으면 임차인명만 (한 줄)', () => {
    expect(chooseStackLabel('건축설계사무소', '209.6', 1.5, 8)!.text).toBe('건축설계사무소 209.6㎡');
    expect(chooseStackLabel('컨설팅', '105.8', 0.5, 8)!.text).toBe('컨설팅');
    expect(chooseStackLabel('건축설계사무소', '63.40', 1.5, 8, 7, false, '평')!.text).toBe('건축설계사무소 63.40평');
  });

  it('NEGATIVE: 매우 좁은 세그먼트는 라벨 생략, 숫자 아닌 셀은 포맷하지 않음', () => {
    expect(chooseStackLabel('컨설팅', '105.8', 0.1, 8)).toBeNull();
    expect(formatNumericCell('2490.3')).toBe('2,490.3');
    expect(formatNumericCell('7600')).toBe('7,600');
    expect(formatNumericCell('2026-11-30')).toBe('2026-11-30');
    expect(formatNumericCell('〃')).toBe('〃');
  });

  it('POSITIVE: 열폭 합계 = 표 폭, 열 수 = 헤더 수', () => {
    const w = computeRentRollColumnWidths(['층', '임차인', '월합계'], [['10F', '건축설계사무소', '5,147']], 3, 9, 8.5);
    expect(w).toHaveLength(3);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(3, 2);
  });
});
