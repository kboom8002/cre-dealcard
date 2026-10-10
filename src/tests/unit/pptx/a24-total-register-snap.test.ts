/**
 * 렌트롤 자동 합계 행 면적 정밀도 정합 (2026-10-10)
 * 행은 소수 1자리 반올림 표기 → 행 합(1,441.2)이 대장 연면적(1,441.15)과 반올림 오차 이내면 대장값을 표기해 개요와 일치.
 * 오차 범위를 넘으면(= 임대면적 합 ≠ 연면적) 행 합 그대로.
 */
import { describe, it, expect } from 'vitest';
import pptxgen from 'pptxgenjs';
import AdmZip from 'adm-zip';
import { buildA24RentrollStacking } from '@/domain/building/mobile-im/pptx/archetypes/a24-rentroll-stacking';

const HEADER = ['층', '임차인', '용도', '임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계', '만기일'];
// v1.5 §9.1: 면적 셀은 단일 단위(㎡) — '(76.3평)' 병기 없음. 소수 1자리 레거시 행은 합계가 대장 연면적과 반올림 오차 이내면 대장값 표기.
const ROWS = [
  ['3F', '임차인 C', '사무실', '252.1', '-', '5,000', '455', '-', '455', '2027-09-17'],
  ['2F', '임차인 B', '사무실', '252.1', '-', '5,000', '455', '-', '455', '2027-09-17'],
  ['1F', '임차인 A', '약국', '78.4', '-', '6,000', '183', '-', '183', '2028-01-31'],
];

async function slideXml(registerTotalAreaSqm?: number): Promise<string> {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  buildA24RentrollStacking({
    pres, slideNum: 1, docno: 'T',
    data: { title: '렌트롤', tableRows: [HEADER, ...ROWS], ...(registerTotalAreaSqm ? { registerTotalAreaSqm } : {}) },
    grade: 'A', provenance: {},
  } as any);
  const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  return new AdmZip(buf).readAsText('ppt/slides/slide1.xml');
}

describe('A24 합계 면적 — 대장 연면적 정밀도 정합', () => {
  it('행 합(582.6)이 대장값(582.55)과 반올림 오차 이내면 대장값 표기', async () => {
    const xml = await slideXml(582.55);
    expect(xml).toContain('>582.55<');
    expect(xml).not.toContain('>582.6<');
    expect(xml).not.toMatch(/582\.55 \(/); // 평 병기 없음
  });

  it('오차 범위 밖(임대면적 합 ≠ 연면적)이면 행 합 그대로', async () => {
    const xml = await slideXml(700);
    expect(xml).toContain('>582.6<');
    expect(xml).not.toMatch(/>700(\.0+)?</);
  });

  it('대장값이 없으면 행 합 그대로', async () => {
    const xml = await slideXml();
    expect(xml).toContain('>582.6<');
  });

  it('평 모드(areaInputUnit)에서는 대장(㎡) 스냅을 하지 않는다', async () => {
    const pres = new pptxgen();
    pres.layout = 'LAYOUT_WIDE';
    buildA24RentrollStacking({
      pres, slideNum: 1, docno: 'T',
      data: {
        title: '렌트롤',
        tableHead: ['층', '임차인', '용도', '임대면적(평)', '전용면적(평)', '보증금', '월임대료', '관리비', '월합계', '만기일'],
        tableRows: [
          ['3F', '임차인 C', '사무실', '76.26', '-', '5,000', '455', '-', '455', '2027-09-17'],
          ['1F', '임차인 A', '약국', '23.71', '-', '6,000', '183', '-', '183', '2028-01-31'],
        ],
        areaInputUnit: 'pyeong',
        registerTotalAreaSqm: 330.6, // ≈ 100.0평 — 스냅되면 안 된다
      },
      grade: 'A', provenance: {},
    } as any);
    const xml = new AdmZip((await pres.write({ outputType: 'nodebuffer' })) as Buffer).readAsText('ppt/slides/slide1.xml');
    expect(xml).toContain('>99.97<'); // 행 표기값의 합
    expect(xml).not.toContain('>330.6');
  });
});
