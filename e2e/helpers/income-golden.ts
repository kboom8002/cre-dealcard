/**
 * @file e2e/helpers/income-golden.ts
 * @description income 실매물 골든(docs/income-golden-data/<id>/{corrected|as-is}) 공용 등록 헬퍼.
 *
 * - 입력은 전부 실제 UI 경로: 메모 → 딜카드 → 기본 IM 바텀시트(xlsx 업로드·사진 업로드·합계/공실률/코멘트) → 생성 → PPTX
 * - 기대값은 각 폴더의 expected.json (scripts/income-golden/golden-specs.mjs 에서 생성)
 * - 공통 Phase 1~4(팩토리) + income 전용 단언(Income-*)
 *   · corrected : 합계·수익률·연면적·임차인 등 '정답이 확정된' 값을 hard 단언
 *   · as-is     : 원본 오류가 그대로 들어간 입력 — 앱의 방어 동작(합계 제외·충돌 처리)을 관찰(annotation)하고
 *                 확정 가능한 항목(상호 보존·mustNotInclude·합계행)만 hard 단언
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createGoldenTest } from './golden-test-factory';

export type IncomeVariant = 'corrected' | 'as-is';

const ROOT = 'docs/income-golden-data';
const fmt = (n: number) => Number(n).toLocaleString('en-US');

export function registerIncomeGolden(setId: string, variant: IncomeVariant) {
  const dataDir = `${ROOT}/${setId}/${variant}`;
  const abs = path.resolve(process.cwd(), dataDir);
  const expected = JSON.parse(fs.readFileSync(path.join(abs, 'expected.json'), 'utf-8'));
  const bs = JSON.parse(fs.readFileSync(path.join(abs, 'bottom_sheet.json'), 'utf-8'));
  const leases: Array<Record<string, any>> = bs.floor_leases ?? [];
  const isCorrected = variant === 'corrected';

  const factory = createGoldenTest({
    name: `income-${setId.split('-')[0]}-${variant}`,
    dataDir,
    posture: 'income',
    askingPriceManwon: expected.askingPriceManwon,
    resolution: 'R3',
    uploadXlsx: true,
    uiPhotoUpload: true,
    multiParcel: !!bs.multiParcel,
    expectedMinSlides: expected.expectedMinSlides,
    expectedMaxSlides: expected.expectedMaxSlides,
    expectedFloors: expected.expectedFloors,
    // 키워드는 Phase 4 에서 첫 누락에 멈추지 않도록 Income-8 에서 한꺼번에 단언한다
    expectedKeywords: [],
  });

  // Phase 4 실패 시 worker 가 재시작되어 모듈 상태가 비므로, 팩토리가 디스크에 남긴 PPTX 텍스트도 읽는다
  const textFile = path.resolve(__dirname, '..', 'screenshots', `income-${setId.split('-')[0]}-${variant}`, 'pptx-full-text.txt');
  const text = () => factory.getPptxText() || (fs.existsSync(textFile) ? fs.readFileSync(textFile, 'utf-8') : '');
  const note = (type: string, description: string) => test.info().annotations.push({ type, description });

  test.describe.serial(factory.suiteName, () => {
    factory.registerCommonPhases();
  });

  // 공통 Phase 의 성패와 무관하게 마지막 PPTX 텍스트에 대해 독립 실행 (한 항목 실패가 나머지를 가리지 않음)
  test.describe(`Income 단언 [${setId}/${variant}]`, () => {
    test(`Income-1: mustNotInclude 0건 [${setId}/${variant}]`, async () => {
      const t = text();
      if (!t) { test.skip(); return; }
      for (const bad of expected.mustNotInclude ?? []) {
        expect(t, `PPTX 에 있으면 안 되는 문구: "${bad}"`).not.toContain(bad);
      }
    });

    test(`Income-2: 플레이스홀더·치환 누수 0건 [${setId}/${variant}]`, async () => {
      const t = text();
      if (!t) { test.skip(); return; }
      // [임차인H] 같은 미치환 토큰, {{…}}, 템플릿 변수
      const leaks = t.match(/\[[^\]\s]{1,12}[A-Z]\]|\{\{[^}]+\}\}|\$\{[^}]+\}|\bTODO\b|\bundefined\b|\bNaN\b/g) ?? [];
      expect(leaks, `미치환 토큰: ${leaks.join(', ')}`).toEqual([]);
    });

    test(`Income-3: 임차인 상호 보존 [${setId}/${variant}]`, async () => {
      const t = text();
      if (!t) { test.skip(); return; }
      const names = leases
        .filter((l) => l.lease_state !== '자가사용' && l.lease_state !== '공실' && l.tenant_type && !/^\(?자가\)?$/.test(String(l.tenant_type)))
        .map((l) => String(l.tenant_type));
      const missing = [...new Set(names)].filter((n) => !t.includes(n));
      expect(missing, `렌트롤 입력 상호가 PPTX 에서 사라짐: ${missing.join(', ')}`).toEqual([]);
    });

    test(`Income-4: 렌트롤 합계 행 = 임대중 행 합계 [${setId}/${variant}]`, async () => {
      const t = text();
      if (!t) { test.skip(); return; }
      const dep = fmt(expected.rentRoll.incomeDepositManwon);
      const rent = fmt(expected.rentRoll.incomeRentManwon);
      // 표 합계 행: "합계 N개 호실 - <면적> <보증금> <월세> ..." — 공실·자가 금액이 섞이면 실패
      const re = new RegExp(`합계[^|]{0,40}?\\s${dep.replace(/,/g, ',')}\\s${rent.replace(/,/g, ',')}\\s`);
      expect(t, `렌트롤 합계행에 보증금 ${dep} / 월세 ${rent} 없음`).toMatch(re);
    });

    test(`Income-5: 수익률 ${'(corrected 만 hard)'} [${setId}/${variant}]`, async () => {
      const t = text();
      if (!t) { test.skip(); return; }
      const pcts = [...t.matchAll(/(\d{1,2}\.\d{1,2})%/g)].map((m) => Number(m[1]));
      if (isCorrected) {
        const tol = expected.capRateTolerancePct ?? 0.05;
        expect(
          pcts.some((p) => Math.abs(p - expected.capRatePct) <= tol),
          `수익률 ${expected.capRatePct}% (±${tol}) 가 PPTX 에 없음. 발견된 %: ${[...new Set(pcts)].join(', ')}`,
        ).toBe(true);
      } else {
        note('observation', `PPTX 수익률 후보: ${[...new Set(pcts)].join(', ')} (정답 렌트롤 기준 ${expected.capRateFromBottomSheetPct}% 바텀시트 기준)`);
      }
    });

    test(`Income-6: 연면적은 공부값 [${setId}/${variant}]`, async () => {
      const t = text();
      if (!t) { test.skip(); return; }
      const gfa: number = expected.register?.totArea;
      const label = Number(gfa).toLocaleString('en-US', { minimumFractionDigits: 2 });
      const has = t.includes(label) || t.includes(Number(gfa).toLocaleString('en-US'));
      if (isCorrected) {
        expect(has, `연면적 ${label}㎡(건축물대장) 가 PPTX 에 없음 — 렌트롤 면적 합으로 대체 표기된 것은 아닌지 확인`).toBe(true);
      } else {
        note('observation', `연면적 공부값 ${label}㎡ PPTX 표기: ${has ? '있음' : '없음'}`);
      }
    });

    test(`Income-7: 공실·자가사용 표기 [${setId}/${variant}]`, async () => {
      const t = text();
      if (!t) { test.skip(); return; }
      if (expected.rentRoll.vacantRows > 0) expect(t, '공실 행/표기 없음').toContain('공실');
      if (expected.rentRoll.ownerUseRows > 0) {
        const hasOwner = /자가/.test(t);
        if (isCorrected) expect(hasOwner, '자가사용 행이 PPTX 에 표기되지 않음').toBe(true);
        else note('observation', `자가사용 표기: ${hasOwner ? '있음' : '없음'}`);
      }
    });

    test(`Income-8: 기대 키워드·리스크 공시 [${setId}/${variant}]`, async () => {
      const t = text();
      if (!t) { test.skip(); return; }
      const missing = (expected.expectedKeywords ?? []).filter((k: string) => !t.includes(k));
      if (isCorrected) {
        note('keywords-missing', missing.join(', ') || '(없음)');
        expect(missing, `기대 키워드 누락: ${missing.join(', ')}`).toEqual([]);
      } else {
        expect(t, '핵심 키워드 "225억" 등 가격 표기 누락').toContain(String(expected.askingPriceManwon / 10000) + '억');
        note('keywords-missing', missing.join(', ') || '(없음)');
      }
    });

    test(`Income-8b: 메모 전용 서술 반영 갭 추적 [${setId}/${variant}]`, async () => {
      const t = text();
      if (!t) { test.skip(); return; }
      const gaps: string[] = expected.gapKeywords ?? [];
      const missing = gaps.filter((k) => !t.includes(k));
      note('gap-keywords-missing', missing.join(', ') || '(없음)');
      if (missing.length) console.log(`  ⚠️ 입력 필드 없는 메모 서술 미반영(D4 갭): ${missing.join(', ')}`);
    });

    test(`Income-9: 말줄임(…) 잘림 관찰 [${setId}/${variant}]`, async () => {
      const t = text();
      if (!t) { test.skip(); return; }
      const cuts = [...t.matchAll(/.{0,14}…/g)].map((m) => m[0].trim());
      note('ellipsis', `${cuts.length}건: ${cuts.slice(0, 8).join(' | ')}`);
      console.log(`  ℹ️ 말줄임 ${cuts.length}건: ${cuts.slice(0, 8).join(' | ')}`);
    });

    for (const o of expected.observations ?? []) {
      test(`Observe: ${String(o).slice(0, 60)} [${setId}/${variant}]`, async () => {
        if (!text()) { test.skip(); return; }
        note('observation', String(o));
        console.log(`  👁️ 관찰 항목: ${o}`);
      });
    }
  });

  return { factory, expected, bs };
}
