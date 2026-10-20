/**
 * @file src/tests/unit/tutorial/third-property-tutorial-completeness.test.ts
 * @description 당산동(p1)·양평동(p5) 외 제3의 실매물 3종(쌍림동 114 운남빌딩 · 창신동 464-6 선일빌딩 · 서초동 1364-28 FM빌딩)을
 *              활용하여 60대 중개인 튜토리얼(제0장~제9장 + ★ 준비편)의 전 과정 완전성을 검증하는 골든 단위·통합 테스트.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import {
  BROKER_TUTORIAL_MODULES,
  BROKER_FAQ_LIST,
  BROKER_GLOSSARY_LIST,
  BROKER_USAGE_CHECKLIST_GROUPS,
  BROKER_FEEDBACK_SCENARIOS,
  BROKER_FEEDBACK_SYSTEM_GUIDE,
} from '@/lib/tutorial/broker-tutorial-data';
import { parseRentRollWorkbook } from '@/lib/rentroll/parse-rentroll-workbook';
import { computeRentrollChecks } from '@/domain/building/mobile-im/rentroll-checks';
import { parseCompsPasteText } from '@/domain/building/mobile-im/comps-paste-parser';
import { parseBrokerExtras } from '@/domain/building/mobile-im/broker-extras';
import { buildYieldSet } from '@/domain/building/mobile-im/yield-set';

const BLANK_TEMPLATE_PATH = path.resolve(process.cwd(), 'public', 'CREDEAL_rentroll_template_v1.5.xlsx');

/**
 * 튜토리얼 [준비편 3~4단계 · 방법 A] 절차 그대로:
 * 1) public/CREDEAL_rentroll_template_v1.5.xlsx 빈 양식을 열고
 * 2) '렌트롤' 시트의 머리 정보(C3, C4, C5, G9, J3, J4, J8, M8)를 채운 뒤
 * 3) A13 셀부터 16열 탭 구분 표(TSV)를 붙여넣어 워크북을 반환한다.
 */
function applyTutorialMethodAToBlankTemplate(params: {
  c3BuildingName: string;
  c4Address: string;
  c5AsOf: string;
  g9AreaUnit: '㎡' | '평';
  j3AskingPriceKrw: number;
  j4GfaSqm: number;
  j8OtherIncomeKrw?: number;
  m8OtherIncomeNote?: string;
  tsv16Cols: string;
}): XLSX.WorkBook {
  const buf = fs.readFileSync(BLANK_TEMPLATE_PATH);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets['렌트롤'];
  expect(ws).toBeDefined();

  // 출력 1 — 머리 정보 기입 (C3, C4, C5, G9, J3, J4, J8, M8)
  ws['C3'] = { t: 's', v: params.c3BuildingName };
  ws['C4'] = { t: 's', v: params.c4Address };
  ws['C5'] = { t: 's', v: params.c5AsOf };
  ws['G9'] = { t: 's', v: params.g9AreaUnit };
  ws['J3'] = { t: 'n', v: params.j3AskingPriceKrw };
  ws['J4'] = { t: 'n', v: params.j4GfaSqm };
  if (params.j8OtherIncomeKrw != null) {
    ws['J8'] = { t: 'n', v: params.j8OtherIncomeKrw };
  }
  if (params.m8OtherIncomeNote) {
    ws['M8'] = { t: 's', v: params.m8OtherIncomeNote };
  }

  // 출력 2 — A13부터 16열(A~P) 탭 구분 표 붙여넣기 (기존 13행 예시 행 덮어쓰기)
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
  const lines = params.tsv16Cols.trim().split(/\r?\n/);

  // 먼저 기존 13~30행 A~P를 비운다
  for (let r = 13; r <= 30; r++) {
    for (const c of cols) {
      delete ws[`${c}${r}`];
    }
  }

  lines.forEach((line, idx) => {
    const rowNum = 13 + idx;
    const cells = line.split('\t');
    expect(cells.length, `행 ${rowNum}의 열 개수가 16열이어야 합니다: ${line}`).toBe(16);
    cells.forEach((rawVal, colIdx) => {
      const col = cols[colIdx];
      const val = rawVal.trim();
      if (!val) return;
      // 숫자 열(임대면적 C=2, 전용면적 D=3, 보증금 G=6, 월세 H=7, 관리비 I=8)
      if ([2, 3, 6, 7, 8].includes(colIdx) && /^-?\d+(?:\.\d+)?$/.test(val)) {
        ws[`${col}${rowNum}`] = { t: 'n', v: Number(val) };
      } else {
        ws[`${col}${rowNum}`] = { t: 's', v: val };
      }
    });
  });

  return wb;
}

describe('제3 실매물 기반 60대 중개인 튜토리얼 완전성 골든 검증', () => {
  it('1. 튜토리얼 데이터(준비편 포함 12개 단원 · 28개 FAQ · 20개 용어사전)에 제3 매물 엣지케이스 가드레일이 완비되어 있다', () => {
    expect(BROKER_TUTORIAL_MODULES.length).toBe(12);
    const prepMod = BROKER_TUTORIAL_MODULES.find((m) => m.id === 'module-prep');
    expect(prepMod).toBeDefined();
    expect(prepMod!.steps.length).toBe(6);

    const stepPrep3 = prepMod!.steps.find((s) => s.id === 'step-prep-3')!;
    const promptA = stepPrep3.copySample!.text;
    // 천원 단위, 기계실/무료주차장/합계행 제외, 공실/자가 괄호 희망임대료 비고 이관, 면적 열 부재 시 빈칸 규칙 포함 확인
    expect(promptA).toContain('천원');
    expect(promptA).toContain('기계실');
    expect(promptA).toContain('괄호 금액');
    expect(promptA).toContain('면적 열이 아예 없으면');

    const mod4 = BROKER_TUTORIAL_MODULES.find((m) => m.id === 'module-04')!;
    const step45 = mod4.steps.find((s) => s.id === 'step-04-5')!;
    const step46 = mod4.steps.find((s) => s.id === 'step-04-6')!;
    expect(step45.whereToClick).toContain('중개인 추가 정보 (선택)');
    expect(step45.whereToClick).toContain('+ 전환 호실 추가');
    expect(step46.whereToClick).toContain('텍스트/표 붙여넣기');
    expect(step46.whereToClick).toContain('붙여넣기 반영');
    expect(step46.whereToClick).toContain('규제·계획 메모');

    expect(BROKER_FAQ_LIST.length).toBeGreaterThanOrEqual(30);
    expect(BROKER_GLOSSARY_LIST.length).toBeGreaterThanOrEqual(20);

    // 부록 D: 실제 중개인 현장 사용 체크리스트(4단계 19항목) & 고객·시스템 피드백 가이드 검증
    expect(BROKER_USAGE_CHECKLIST_GROUPS.length).toBe(4);
    const totalChecklistItems = BROKER_USAGE_CHECKLIST_GROUPS.reduce((acc, g) => acc + g.items.length, 0);
    expect(totalChecklistItems).toBe(19);
    expect(BROKER_FEEDBACK_SCENARIOS.length).toBeGreaterThanOrEqual(6);
    expect(BROKER_FEEDBACK_SYSTEM_GUIDE.copyTemplate.text).toContain('크리딜(CRE DealCard) 중개인 현장 피드백');
  });

  it('2. [제3 실매물 A: 중구 쌍림동 114 운남빌딩 95억] 준비편 방법 A — 원본 PPTX(평 단위 + 천원 금액 + B1 공실/7F 자가 괄호 금액 + 기계실·주차장 제외) → v1.5 빈 양식 A13 붙여넣기 변환 검증', () => {
    // 원본 슬라이드 4: 계약면적(평) 78, 75, 27, 74, 70, 62, 45, 15 (기계실 16평, 2F 주차장 47평 제외)
    // 임대료 단위: 천원 (80,000 → 80,000,000원, 7,000 → 7,000,000원)
    // B1 공실 (40,000)/(4,000) 및 7F 자가 (20,000)/(1,000)은 G·H열 비우고 P열(비고)에 기재
    const tsvPyeong = [
      ['B1', '', '78', '', '공실', '상가', '', '', '', '', '', '', '모름', '미확인', '공실', '소매점 공실. 희망 보증 4,000만/월 400만(관리비 별도)'].join('\t'),
      ['1F', '', '75', '', '소매점', '상가', '80000000', '7000000', '', '', '', '', '모름', '미확인', '임대중', ''].join('\t'),
      ['2F', '', '27', '', '제조업', '상가', '20000000', '1750000', '', '', '', '', '모름', '미확인', '임대중', '2F 나머지 47평은 주차장(임대 제외)'].join('\t'),
      ['3F', '', '74', '', '소매점', '상가', '50000000', '4600000', '', '', '', '', '모름', '미확인', '임대중', ''].join('\t'),
      ['4F', '', '70', '', '사무소', '상가', '20000000', '4420000', '', '', '', '', '모름', '미확인', '임대중', ''].join('\t'),
      ['5F', '', '62', '', '사무소', '상가', '40000000', '3000000', '', '', '', '', '모름', '미확인', '임대중', ''].join('\t'),
      ['6F', '', '45', '', '기원', '상가', '30000000', '2800000', '', '', '', '', '모름', '미확인', '임대중', ''].join('\t'),
      ['7F', '', '15', '', '사무소(자가)', '상가', '', '', '', '', '', '', '모름', '미확인', '자가사용', '자가사용(환산 보증 2,000만/월 100만). 연와조 증축분'].join('\t'),
    ].join('\n');

    const wb = applyTutorialMethodAToBlankTemplate({
      c3BuildingName: '운남빌딩',
      c4Address: '서울특별시 중구 쌍림동 114',
      c5AsOf: '2026-10-05',
      g9AreaUnit: '평',
      j3AskingPriceKrw: 9_500_000_000,
      j4GfaSqm: 1687.51,
      tsv16Cols: tsvPyeong,
    });

    const parsed = parseRentRollWorkbook(wb, { now: new Date('2026-10-05T00:00:00Z') });
    expect(parsed.version).toBe('1.5');
    expect(parsed.meta?.area_input_unit).toBe('pyeong');
    expect(parsed.meta?.asking_price_krw).toBe(9_500_000_000);
    expect(parsed.meta?.gfa_sqm).toBeCloseTo(1687.51, 2);
    expect(parsed.parsedRows.length).toBe(8);

    // 공실·자가 제외 임대중 6개 호실 합계: 보증금 24,000만원 / 월세 2,357만원
    expect(parsed.totalDeposit).toBe(24000);
    expect(parsed.monthlyRent).toBe(2357);

    // V12 차단 없음 (446평 ≈ 1,474.38㎡ / 연면적 1,687.51㎡ = 87.4% → 정상 범위 45%~200%)
    const blockingIssues = parsed.issues.filter((i) => i.level === 'blocking');
    expect(blockingIssues).toEqual([]);

    const checks = computeRentrollChecks({
      rows: parsed.parsedRows,
      gfaSqm: parsed.meta?.gfa_sqm,
      askingPriceKrw: parsed.meta?.asking_price_krw,
      asOf: parsed.meta?.rentroll_as_of,
      areaInputUnit: parsed.meta?.area_input_unit,
    });
    expect(checks.V01.level).toBe('ok');
    expect(checks.V12.level).toBe('ok');
  });

  it('3. [제3 실매물 B: 종로구 창신동 464-6 선일빌딩 225억] 준비편 방법 A — 1층 3호실 분할 · 관리비 · SK안테나 기타수입(J8/M8) · 면적 열 부재(as-is) 및 공부 면적(corrected) 양방향 검증', () => {
    // 3-1) 원본(as-is)처럼 면적 열이 아예 없는 경우 → C·D열 빈칸으로 두어도 V12 차단 없이 파싱 성공해야 함
    const tsvNoArea = [
      ['B1', '', '', '', '게임장', '상가', '20000000', '9000000', '', '', '', '', '모름', '미확인', '임대중', ''].join('\t'),
      ['1F', '', '', '', '하동추어탕', '상가', '300000000', '9000000', '1000000', '', '', '', '모름', '미확인', '임대중', ''].join('\t'),
      ['1F', '', '', '', '순대국', '상가', '50000000', '2800000', '400000', '', '', '', '모름', '미확인', '임대중', ''].join('\t'),
      ['1F', '', '', '', '커피숍', '상가', '7500000', '500000', '', '', '', '', '모름', '미확인', '임대중', '부속 별동'].join('\t'),
      ['2F', '', '', '', '교촌치킨', '상가', '130000000', '15000000', '1000000', '', '', '', '모름', '미확인', '임대중', ''].join('\t'),
      ['3F', '', '', '', '게스트하우스', '상가', '110000000', '8000000', '850000', '', '', '', '모름', '미확인', '임대중', ''].join('\t'),
      ['4F', '', '', '', '게스트하우스', '상가', '130000000', '8500000', '850000', '', '', '', '모름', '미확인', '임대중', ''].join('\t'),
      ['5F', '', '', '', '치과', '상가', '50000000', '3700000', '300000', '', '', '', '모름', '미확인', '임대중', ''].join('\t'),
      ['5F', '', '', '', '공실', '상가', '', '', '', '', '', '', '모름', '미확인', '공실', '기존 자가사용. 희망 보증 7,000만/월 450만/관리비 40만'].join('\t'),
    ].join('\n');

    const wbNoArea = applyTutorialMethodAToBlankTemplate({
      c3BuildingName: '선일빌딩',
      c4Address: '서울특별시 종로구 창신동 464-6',
      c5AsOf: '2026-10-05',
      g9AreaUnit: '㎡',
      j3AskingPriceKrw: 22_500_000_000,
      j4GfaSqm: 2300.46,
      j8OtherIncomeKrw: 270833, // 연 325만원 ÷ 12개월
      m8OtherIncomeNote: 'SK 통신 안테나 수입 별도 연 325만원',
      tsv16Cols: tsvNoArea,
    });

    const parsedNoArea = parseRentRollWorkbook(wbNoArea, { now: new Date('2026-10-05T00:00:00Z') });
    expect(parsedNoArea.version).toBe('1.5');
    expect(parsedNoArea.parsedRows.length).toBe(9);
    // 공실 희망임대료(7,000/450/40)가 제외된 실수입 합계: 보증금 79,750만원 / 월세 5,650만원 / 관리비 440만원
    expect(parsedNoArea.totalDeposit).toBe(79750);
    expect(parsedNoArea.monthlyRent).toBe(5650);
    expect(parsedNoArea.mgmtFeeTotal).toBe(440);
    expect(parsedNoArea.meta?.other_income_krw).toBe(270833);
    expect(parsedNoArea.meta?.other_income_note).toContain('SK 통신 안테나');
    // 면적 열이 비어 있을 때는 blocking(AREA_UNIT_MISMATCH)이 아니라 warning(AREA_UNIT_UNCHECKED)이어야 함
    expect(parsedNoArea.issues.filter((i) => i.level === 'blocking')).toEqual([]);

    // 3-2) corrected 골든 xlsx 파일 직접 파싱 검증
    const correctedXlsxPath = path.resolve(
      process.cwd(),
      'docs/income-golden-data/ig3-changsin-464-6/corrected/CREDEAL_rentroll_ig3-changsin-464-6_corrected.xlsx',
    );
    const wbCorrected = XLSX.read(fs.readFileSync(correctedXlsxPath), { type: 'buffer' });
    const parsedCorrected = parseRentRollWorkbook(wbCorrected, { now: new Date('2026-10-05T00:00:00Z') });
    expect(parsedCorrected.version).toBe('1.5');
    expect(parsedCorrected.totalDeposit).toBe(79750);
    expect(parsedCorrected.monthlyRent).toBe(5650);
    expect(parsedCorrected.issues.filter((i) => i.level === 'blocking')).toEqual([]);
  });

  it('4. [제4장 4-5 & 4-6단계] 쌍림동 114 & 창신동 464-6의 실제 인근 시세 붙여넣기(거래/매물 · 약 N만 · 백만원/평) + 규제 메모 + 매입 후 전환 호실 수익률 계산 검증', () => {
    // 4-1) 쌍림동 114 원본 메모/슬라이드 7 인근 시세 붙여넣기 파싱
    const ssangnimPaste = [
      '거 래 쌍림동 258 토지면적 51.8평 용도지역 3종일반 매도금액 30억 평당가(토지) 약 60백만원/평',
      '거 래 묵정동 27-4 토지면적 28.2평 용도지역 3종일반 매도금액 18.3억 평당가(토지) 약 65백만원/평',
      '매 물 묵정동 29-6 토지면적 79.7평 용도지역 2종일반 매도금액 56억 평당가(토지) 약 70백만원/평',
      '매 물 묵정동 24-13 토지면적 117.8평 용도지역 2종일반 매도금액 95억 평당가(토지) 약 81백만원/평',
      '매 물 묵정동 28-6 토지면적 107.2평 용도지역 2종일반 매도금액 65억 평당가(토지) 약 61백만원/평',
    ].join('\n');

    const ssangnimComps = parseCompsPasteText(ssangnimPaste);
    expect(ssangnimComps.length).toBe(5);
    expect(ssangnimComps[0]).toMatchObject({
      kind: 'transaction',
      location: '쌍림동 258',
      price_eok: 30,
      land_area_pyeong: 51.8,
      land_price_per_pyeong_manwon: 6000,
    });
    expect(ssangnimComps[2]).toMatchObject({
      kind: 'listing',
      location: '묵정동 29-6',
      price_eok: 56,
      land_area_pyeong: 79.7,
      land_price_per_pyeong_manwon: 7000,
    });

    // 4-2) 창신동 464-6 원본 메모 인근 시세 붙여넣기 파싱 (약 1.7억/평 등)
    const changsinPaste = [
      '실거래 창신동 510 토지면적 31.3평 특성 일반상업 매도금액 53억 평당가(토지) 약 1.7억원/평',
      '실거래 창신동 497-1 토지면적 46.3평 용도지역 일반상업 매도금액 77억 평당가(토지) 약 1.7억원/평',
      '매물 창신동 446-1 토지면적 26.7평 특성 일반상업 매도금액 33억 평당가(토지) 약 1.2억원/평',
      '매물 창신동 550-1 토지면적 108.0평 특성 일반상업+준주거 매도금액 200억 평당가(토지) 약 1.9억원/평',
    ].join('\n');

    const changsinComps = parseCompsPasteText(changsinPaste);
    expect(changsinComps.length).toBe(4);
    expect(changsinComps[0]).toMatchObject({
      kind: 'transaction',
      location: '창신동 510',
      price_eok: 53,
      land_price_per_pyeong_manwon: 17000,
    });
    expect(changsinComps[2]).toMatchObject({
      kind: 'listing',
      location: '창신동 446-1',
      price_eok: 33,
      land_price_per_pyeong_manwon: 12000,
    });

    // 4-3) 쌍림동 114 매입 후 전략(B1 공실 4,000/400 + 7F 자가사용 2,000/100 전환) → buildYieldSet 검증
    const ssangnimBs = JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), 'docs/income-golden-data/ig2-ssangnim-114/corrected/bottom_sheet.json'),
        'utf-8',
      ),
    );
    const extrasRes = parseBrokerExtras({
      ...ssangnimBs.broker_extras,
      post_acquisition_units: [
        { floor: 'B1', action: 'vacant_lease', deposit_manwon: 4000, rent_manwon: 400 },
        { floor: '7F', action: 'owner_use_to_lease', deposit_manwon: 2000, rent_manwon: 100 },
      ],
    });
    expect(extrasRes.ok).toBe(true);
    if (!extrasRes.ok) throw new Error(extrasRes.error);
    const extras = extrasRes.value;
    expect(extras?.post_acquisition_units?.length).toBe(2);
    expect(extras?.regulatory_notes?.length).toBe(2);

    const yieldSet = buildYieldSet({
      askingPriceKrw: ssangnimBs.askingPriceManwon * 10_000, // 95억
      depositKrw: ssangnimBs.totalDepositManwon * 10_000, // 2.4억
      annualRentKrw: ssangnimBs.monthlyRentTotalManwon * 10_000 * 12, // 연 28,284만
      floorLeases: ssangnimBs.floor_leases,
      postAcquisitionUnits: extras?.post_acquisition_units,
    });
    // 현행 수익률(보증금 차감): 2,357 * 12 / (950,000 - 24,000) = 28,284 / 926,000 ≈ 3.05%
    expect(yieldSet.grossYieldNetOfDeposit).toBeCloseTo(3.05, 1);
    // 전환 후(보증금 +6,000만 → 30,000만, 월세 +500만 → 2,857만): 2,857 * 12 / (950,000 - 30,000) = 34,284 / 920,000 ≈ 3.73%
    expect(yieldSet.stabilized?.kind).toBe('broker_plan');
    expect(yieldSet.stabilized?.value).toBeCloseTo(3.73, 1);
    expect(yieldSet.stabilized!.value).toBeGreaterThan(yieldSet.grossYieldNetOfDeposit!);
  });

  it('5. [제3 실매물 C: 서초구 서초동 1364-28 FM빌딩 230억 (사옥형 R3)] 비수익형 포스처 렌트롤 v1.5 파싱 검증', () => {
    const seochoXlsxPath = path.resolve(
      process.cwd(),
      'docs/golden-test-data/p3-seocho-owner/r3-verified/CREDEAL_rentroll_p3-seocho-owner_r3-verified.xlsx',
    );
    expect(fs.existsSync(seochoXlsxPath)).toBe(true);
    const wb = XLSX.read(fs.readFileSync(seochoXlsxPath), { type: 'buffer' });
    const parsed = parseRentRollWorkbook(wb, { now: new Date('2026-10-05T00:00:00Z') });
    expect(parsed.version).toBe('1.5');
    expect(parsed.parsedRows.length).toBeGreaterThanOrEqual(7);
  });
});
