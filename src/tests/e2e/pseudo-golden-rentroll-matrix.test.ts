/**
 * @file src/tests/e2e/pseudo-golden-rentroll-matrix.test.ts
 * @description 실제 지번(공적장부 실측 제원) + 6대 가상 렌트롤 스트레스 시나리오(Cases R1~R6)
 *              Mobile IM 및 Basic PPTX IM 양방향 통합 슈도 골든 E2E 테스트 스위트.
 *
 * 검증 축:
 *   [Axis A — Mobile IM (extractPureBuildingFacts + buildBasicImDocument)]
 *     1. 임대차 보증금 총액 / 월 임대료 총액 수학적 오라클 일치
 *     2. 3-State 점유 분류(임대 / 자가사용 / 공실) 호실 수 오라클 일치 (Rule 75)
 *     3. 단일 면적 해석기(㎡ / 평 전용면적 입력) 이중 환산 무결성 (Rule 74)
 *     4. 수익률(Gross Yield) 오라클 일치 및 임대료 0원(R6) 사옥형 시 0.00%/0만원 노출 차단
 *     5. 전 섹션 JSON 내 Poison Token ('임차인 미상', 'NaN', 'undefined', '[object Object]') 0건
 *
 *   [Axis B — Basic PPTX IM (MobileImPptxRenderer + Strict Geometry Audit + 4 Binary Gates)]
 *     1. 기대 슬라이드 면수(9면, 시세비교 포함 시 10면) 정확 일치
 *     2. 엄격 기하 감사(boundsTolerance: 0.002, overflowRatio: 1.15, overlapRatio: 0.10) 위반 0건
 *     3. 4대 물리 바이너리 게이트(Poison Token, Evasive Phrase, Mock Data Leak, Physical Binary) 통과
 *     4. 시나리오별 특화 슬라이드 콘텐츠 단언(16호실 과밀 스태킹, 현행vs안정화 수익률, 통합계약·기타수입, 평 단위 표기, 시세비교 10면)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  buildPseudoGoldenScenarios,
  type PseudoGoldenScenario,
} from './fixtures/pseudo-golden-generator';
import { createBasicImTestInput } from './fixtures/basic-im-factory';
import { extractPureBuildingFacts } from '@/domain/building/im-core/facts';
import { buildBasicImDocument } from '@/domain/building/im-core/basic-im-document';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { resolvePhotos } from '@/domain/building/mobile-im/photo-url-transformer';
import { planGallerySlides } from '@/domain/building/mobile-im/pptx/gallery-planner';
import { auditPptxGeometry } from '@/domain/building/mobile-im/quality/pptx-geometry-audit';
import {
  extractSlideTexts,
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
  assertZeroMockLeaks,
  assertAllPhysicalBinaryGates,
} from '@/assurance/im-harness/golden-test-utils';

const SCRATCH_OUTPUT_DIR = join(process.cwd(), 'scratch', 'pseudo-golden-pptx');

describe('MECE 6-Case Parametric Pseudo-Golden Rent Roll Matrix (Mobile IM + PPTX IM)', () => {
  const scenarios = buildPseudoGoldenScenarios();

  beforeAll(() => {
    if (!existsSync(SCRATCH_OUTPUT_DIR)) {
      mkdirSync(SCRATCH_OUTPUT_DIR, { recursive: true });
    }
  });

  for (const scenario of scenarios) {
    describe(`[${scenario.caseId}] ${scenario.label}`, () => {
      const { oracle } = scenario;

      it('Axis A (Mobile IM): extractPureBuildingFacts & buildBasicImDocument 수학적 오라클 및 무결성 검증', () => {
        // Mobile IM 도메인 입력 조립 (DB/워크스페이스 저장 포맷과 동일)
        const rawPayload = {
          title: `${scenario.buildingName} 투자설명서`,
          building_name: scenario.buildingName,
          address: scenario.bottomSheet.address,
          posture: scenario.posture,
          asking_price_manwon: scenario.bottomSheet.askingPriceManwon,
          land_area_sqm: scenario.bottomSheet.landAreaM2,
          total_gross_area_sqm: scenario.bottomSheet.grossFloorAreaM2,
          completion_year: scenario.bottomSheet.completionYear,
          zoning: scenario.bottomSheet.zoning,
          floors_above: scenario.ssotExtra.floors_above ?? 5,
          floors_below: scenario.ssotExtra.floors_below ?? 1,
          parking_count: scenario.bottomSheet.parking,
          elevator_count: scenario.bottomSheet.elevator,
          floor_leases: scenario.bottomSheet.floor_leases,
          photos: scenario.photos,
          ...scenario.ssotExtra,
          ...(scenario.docBodyExtra || {}),
        };

        const facts = extractPureBuildingFacts(rawPayload);
        const basicImDoc = buildBasicImDocument(facts);

        // 1. 보증금·임대료 오라클 일치
        expect(facts.rent.depositTotalManwon).toBe(oracle.totalDepositManwon);
        expect(facts.rent.monthlyRentTotalManwon).toBe(oracle.monthlyRentManwon);
        expect(facts.rent.units.length).toBe(oracle.totalUnits);

        // 2. 3-State 점유 상태(Rule 75) 오라클 일치
        expect(facts.rent.vacantCount).toBe(oracle.vacantUnits);
        expect(facts.rent.ownerOccupiedCount ?? 0).toBe(oracle.ownerOccupiedUnits);
        expect(facts.rent.occupiedCount).toBe(oracle.leasedUnits + oracle.ownerOccupiedUnits);

        // 3. 면적 단위(Rule 74) 검증
        const sumUnitPyeong =
          Math.round(
            facts.rent.units.reduce((acc, u) => acc + (u.areaPyeong || 0), 0) * 10,
          ) / 10;
        expect(sumUnitPyeong).toBeCloseTo(oracle.totalInputAreaPyeong, 0);

        // 4. 수익률 오라클 일치
        expect(facts.valuation.grossYieldPct).toBeCloseTo(oracle.grossYieldPct, 2);

        // 5. 모바일 IM 문서 섹션 내 오염 문자열 0건 검증
        const serializedDoc = JSON.stringify(basicImDoc.sections);
        expect(serializedDoc).not.toContain('임차인 미상');
        expect(serializedDoc).not.toContain('NaN');
        expect(serializedDoc).not.toContain('undefined');
        expect(serializedDoc).not.toContain('[object Object]');

        // 6. 사진 매트릭스(2장~12장) Mobile IM 검증: 개수, 대표사진(Hero) 우선순위, IM제외/도면 분리
        expect(facts.photos?.length).toBe(oracle.expectedPhotoCount);
        const photosSec = basicImDoc.sections.find((s) => s.id === '09_photos');
        expect(photosSec?.data.photoCount).toBe(oracle.expectedPhotoCount);
        expect(photosSec?.data.photos).toHaveLength(oracle.expectedPhotoCount);

        const coverSec = basicImDoc.sections.find((s) => s.id === '01_cover');
        expect(String(coverSec?.data.primaryPhotoUrl || '')).toContain(
          oracle.expectedHeroPhotoSubstring,
        );

        // 7. 시나리오별 Mobile IM 특화 검증
        if (scenario.caseId === 'R4_MULTI_FLOOR_INTEGRATED_OTHER_INCOME') {
          expect(facts.rent.otherIncomeMonthlyManwon).toBe(180);
          expect(serializedDoc).not.toContain('IM 제외 지정 테스트 이미지');
        }

        if (scenario.caseId === 'R6_ZERO_RENT_OWNER_HQ_WITH_COMPS') {
          expect(facts.posture).toBe('owner_occupier');
          const summarySec = basicImDoc.sections.find((s) => s.id === '02_summary');
          expect(summarySec).toBeDefined();
          const summaryJson = JSON.stringify(summarySec?.data);
          // 임대료 0원인 사옥형 매물에서 '0.00%'나 '0만원'이 헤드라인에 노출되면 안 됨
          expect(summaryJson).not.toContain('0.00%');
          expect(summaryJson).not.toContain('월 임대수익 0만원');
          expect(summaryJson).toContain('토지 평당가');
          expect(summaryJson).toContain('연면적 평당가');

          const compsSec = basicImDoc.sections.find((s) => s.id === '08_comps');
          expect(compsSec?.data.comparableTransactions.length).toBe(3);
        }
      });

      it(
        'Axis B (Basic PPTX IM): 렌더링 + 엄격 기하 감사(0건) + 4대 바이너리 게이트 + 슬라이드 오라클 검증',
        { timeout: 60_000 },
        async () => {
          const pptxInput = await createBasicImTestInput(scenario.bottomSheet, {
            coordinates: scenario.coordinates,
            buildingName: scenario.buildingName,
            posture: scenario.posture,
            photos: scenario.photos,
            pnu: scenario.pnu,
            pnus: scenario.pnus,
            skipEnrichment: true,
            ssotExtra: scenario.ssotExtra,
            buildingExtra: scenario.buildingExtra,
            broker: {
              display_name: '정현우 수석팀장',
              company_name: '제이에스부동산중개법인',
              phone: '010-3344-5566',
              registration_no: '11680-2024-00156',
            },
          });

          // docBodyExtra 병합 (broker_extras, rent_roll_meta, 기타수입 등)
          if (scenario.docBodyExtra) {
            Object.assign(pptxInput.doc.body, scenario.docBodyExtra);
          }

          // 0. 갤러리 플래너(2장~12장 레이아웃 및 슬라이드 분할) 오라클 검증
          const resolvedPhotos = resolvePhotos(pptxInput.doc.body, pptxInput.buildingId);
          const plannedGallery = planGallerySlides(
            resolvedPhotos,
            scenario.posture as any,
            'credeal_basic',
          );
          expect(plannedGallery).toHaveLength(oracle.expectedGallerySlideCount);
          expect(plannedGallery.map((g) => g.layout)).toEqual(oracle.expectedGalleryLayouts);
          const totalPlannedPhotos = plannedGallery.reduce((sum, g) => sum + g.photos.length, 0);
          expect(totalPlannedPhotos).toBe(oracle.expectedPhotoCount);
          if (oracle.expectedHeroPhotoSubstring) {
            expect(String(plannedGallery[0]?.photos[0]?.url || '')).toContain(
              oracle.expectedHeroPhotoSubstring,
            );
          }

          const renderer = new MobileImPptxRenderer();
          const result = await renderer.render(pptxInput);

          // 스크래치 경로에 PPTX 저장 (시각 캡처 및 검수용)
          const outPath = join(SCRATCH_OUTPUT_DIR, `${scenario.caseId}.pptx`);
          writeFileSync(outPath, result.buffer);

          // 1. 슬라이드 면수 검증
          expect(result.slideCount).toBe(oracle.expectedSlideCount);

          // 2. 엄격 기하학 감사 (boundsTolerance: 0.002, overflowRatio: 1.15, overlapRatio: 0.10)
          const violations = await auditPptxGeometry(result.buffer, {
            boundsTolerance: 0.002,
            overflowRatio: 1.15,
            overlapRatio: 0.10,
          });
          if (violations.length > 0) {
            console.error(
              `[${scenario.caseId}] Geometry Violations:`,
              JSON.stringify(violations, null, 2),
            );
          }
          expect(violations.filter((v) => v.id === 'OUT_OF_BOUNDS')).toHaveLength(0);
          expect(violations.filter((v) => v.id === 'TEXT_OVERFLOW')).toHaveLength(0);
          expect(violations.filter((v) => v.id === 'TEXT_OVERLAP')).toHaveLength(0);
          expect(violations).toHaveLength(0);

          // 3. 4대 바이너리 품질 게이트
          await assertZeroPoisonTokens(result.buffer);
          await assertZeroEvasivePhrases(result.buffer);
          await assertZeroMockLeaks(result.buffer);
          await assertAllPhysicalBinaryGates(result.buffer);

          // 4. 슬라이드 텍스트 추출 및 시나리오별 오라클 단언
          const slides = await extractSlideTexts(result.buffer);
          const fullText = slides.map((s) => s.text).join(' ');

          // 공통: 소재지 지번 및 매매가 표기 확인
          expect(fullText).toContain(scenario.bottomSheet.address.split(' ').slice(-1)[0]);

          // 공통 사진 갤러리 슬라이드 제목 검증 (0~1면: '현장 사진', 2면 분할: '현장 사진 (1/2)' & '현장 사진 (2/2)')
          if (oracle.expectedGallerySlideCount <= 1) {
            expect(fullText).toContain('현장 사진');
          } else {
            expect(fullText).toContain('현장 사진 (1/2)');
            expect(fullText).toContain('현장 사진 (2/2)');
          }

          if (scenario.caseId === 'R1_FULL_OCCUPANCY_SINGLE_FLOOR') {
            expect(fullText).toContain(oracle.monthlyRentManwon.toLocaleString()); // 월 임대료 3,650만
            expect(fullText).toContain(oracle.totalDepositManwon.toLocaleString()); // 보증금 55,000만
            expect(fullText).toContain(`${oracle.grossYieldPct.toFixed(2)}%`); // 수익률 4.00%
            expect(fullText).toContain('당산역세권 전면 코너 외관');
            expect(fullText).toContain('측면 도로변 가시성 외관');
          }

          if (scenario.caseId === 'R2_HIGH_DENSITY_18_UNIT_SPLIT') {
            // 16개 분할 호실 과밀 렌트롤이 2면(1/2, 2/2)으로 분할되어 잘림·넘침 없이 표기되고 공실 1개 호실 반영
            expect(fullText).toContain(oracle.monthlyRentManwon.toLocaleString()); // 월 임대료 합계 6,580만
            expect(fullText).toContain(oracle.totalDepositManwon.toLocaleString()); // 보증금 합계 103,000만
            expect(fullText).toContain(`${oracle.grossYieldPct.toFixed(2)}%`); // 수익률 3.29%
            expect(fullText).toContain('101호');
            expect(fullText).toContain('102호');
            expect(fullText).toContain('103호');
            expect(fullText).toContain('602호');
            expect(fullText).toContain('1001호');
            // 4장 GRID_2X2 캡션/칩 표기 확인
            expect(fullText).toContain('양평로 25m 대로변 코너 외관');
            expect(fullText).toContain('현대엘리베이터 15인승 홀 리모델링 완료');
          }

          if (scenario.caseId === 'R3_VALUE_ADD_VACANT_OWNER_MIX') {
            // 임대 3 + 자가사용 2 + 공실 1 혼합 및 안정화(Stabilized) 수익률 병기
            expect(fullText).toContain(oracle.monthlyRentManwon.toLocaleString()); // 현행 월세 2,000만
            expect(fullText).toContain(`${oracle.grossYieldPct.toFixed(2)}%`); // 현행 수익률 2.14%
            expect(fullText).toContain('자가');
            expect(fullText).toContain('공실');
            expect(fullText).toContain('안정화'); // 안정화 수익률 카드
            // 3장 ONE_LARGE_TWO_SMALL_H 캡션 확인
            expect(fullText).toContain('2층 공실 원상복구 완료 내부');
            expect(fullText).toContain('자주식 10대 구역 및 진입로');
          }

          if (scenario.caseId === 'R4_MULTI_FLOOR_INTEGRATED_OTHER_INCOME') {
            // 복층 통합계약 및 임대료 합계(월 3,050만) 반영 + 5장 GRID_2X3 (excluded:true 제외)
            expect(fullText).toContain('통합계약');
            expect(fullText).toContain(oracle.monthlyRentManwon.toLocaleString()); // 임대료 3,050만
            expect(fullText).toContain(oracle.totalDepositManwon.toLocaleString()); // 보증금 40,000만
            expect(fullText).toContain('통신중계기 설치 구역 및 방수 현황');
            expect(fullText).not.toContain('IM 제외 지정 테스트 이미지');
          }

          if (scenario.caseId === 'R5_EXCLUSIVE_AREA_PYEONG_INPUT') {
            // 평(py) 단위 전용면적 단독 입력 시 면적 합계 355.00평(이중 환산 없음) + 8장 갤러리 2면 분할(총 10면)
            expect(result.slideCount).toBe(10);
            expect(fullText).toContain('355.00');
            expect(fullText).toContain('층별 스태킹 플랜 (평)');
            expect(fullText).toContain(oracle.monthlyRentManwon.toLocaleString()); // 월세 합계 4,250만
            expect(fullText).toContain(oracle.totalDepositManwon.toLocaleString()); // 보증금 합계 60,000만
            expect(fullText).toContain('남부순환로 코너 전면 파사드');
            expect(fullText).toContain('6층 루프탑 및 강남권 스카이뷰');
          }

          if (scenario.caseId === 'R6_ZERO_RENT_OWNER_HQ_WITH_COMPS') {
            // 전층 자가사용(임대료 0원) 사옥형 + 도면 슬라이드(1면) + 시세 비교(1면) + 12장 갤러리 2면 분할(6+6) = 총 11면
            expect(result.slideCount).toBe(11);
            expect(fullText).toContain('서초동 1362-15');
            expect(fullText).toContain('12,757'); // 본건 토지 평당가 약 12,757만/평
            expect(fullText).toContain('전 층 명도 인도가 확약된 서초구 내 희소 단독 사옥 매물');
            expect(fullText).toContain('지구단위계획·도면');
            expect(fullText).toContain('기준층(2F~5F) 사옥 레이아웃 평면도');
            expect(fullText).toContain('임직원 휴게 루프탑 가든 및 조망');
          }

          if (scenario.caseId === 'R7_ZERO_PHOTO_JEONSE_MIX') {
            // 사진 0장일 때 건축물 현황 실사 안내 대체 카드가 표출되고, 전세 8억(50,000 + 30,000)이 보증금 총액(125,000만)에 정확히 합산됨
            expect(fullText).toContain('건축물 현황 및 물리적 실사 점검 안내');
            expect(fullText).toContain(oracle.totalDepositManwon.toLocaleString()); // 보증금 합계 125,000만
            expect(fullText).toContain(oracle.monthlyRentManwon.toLocaleString()); // 월세 합계 2,800만
            expect(fullText).toContain(`${oracle.grossYieldPct.toFixed(2)}%`); // 순투하자본 수익률 3.28%
          }

          if (scenario.caseId === 'R8_SINGLE_PHOTO_AND_BROKEN_URL') {
            // 깨진 URL 1장이 섞여 있어도 크래시 없이 유효 사진 1장(FULL_WIDE)과 원본 캡션이 정확히 매칭됨
            expect(fullText).toContain('남부순환로 코너 전면 파사드 단독 전경');
            expect(fullText).not.toContain('깨진 URL 이미지 (스킵 대상)');
          }

          if (scenario.caseId === 'R9_MULTI_PARCEL_3LOTS_MESSY_STRINGS') {
            // 다필지 주소 자동 해석 검증 (19자리 대표 PNU + 부속 PNU 2건) 및 비정형 한글 금액·면적 파싱 검증
            const { resolveAddress } = await import('@/lib/external/address-resolver');
            const resolved = await resolveAddress(scenario.bottomSheet.address);
            expect(resolved?.pnu).toBe('1156012800101170000');
            expect(resolved?.allPnus).toEqual([
              '1156012800101170000',
              '1156012800101340000',
              '1156012800101250002',
            ]);
            expect(fullText).toContain(oracle.monthlyRentManwon.toLocaleString()); // 월세 합계 3,220만
            expect(fullText).toContain(oracle.totalDepositManwon.toLocaleString()); // 보증금 합계 50,000만
          }
        },
      );
    });
  }
});
