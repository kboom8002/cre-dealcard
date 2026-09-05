/**
 * @file cbre-nh-capital-pipeline.test.ts
 * @description CBRE 모범 IM (NH농협캐피탈빌딩) 원본 데이터 기반 E2E 파이프라인 무결성 테스트
 *              Rule 6 (산출물 단언 우선) 및 Rule 7 (Negative Pair 의무) 철저 준수
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import crypto from 'crypto';
import { validateBrokerInput } from '../../domain/building/im-core/broker-input-validator';
import { verifyCrossChannelConsistency } from '../../domain/building/im-core/cross-channel-checker';
import { computeTargetHash } from '../../domain/building/im-core/target-hash';
import { MobileImPptxRenderer } from '../../domain/building/mobile-im/pptx/pptx-renderer';
import { inspectPptxBinary } from '../../assurance/im-harness/observers/pptx-binary-observer';
import { PptxStudioService } from '../../domain/building/pptx-studio/studio-service';
import { StudioApprovalService } from '../../domain/building/pptx-studio/approval/studio-approval-service';

describe('CBRE Benchmark (NH Capital Building) E2E Pipeline', () => {

  const validBrokerInput = {
    askingPriceKrw: 250000000000,
    landAreaM2: 2000.00,
    grossFloorAreaM2: 20700.61,
    statedLandPricePerPyeongKrw: 413223140,
    statedDepositKrw: 12000000000,
    statedMonthlyRentKrw: 525000000,
    rentRoll: {
      totalUnits: 12,
      units: [
        { floor: '11F', tenant: 'NH농협캐피탈(주)', deposit: 1000000000, rent: 45000000, isVacant: false },
        { floor: '10F', tenant: 'NH농협캐피탈(주)', deposit: 1000000000, rent: 48000000, isVacant: false },
        { floor: '9F',  tenant: 'NH농협캐피탈(주)', deposit: 1200000000, rent: 55000000, isVacant: false },
        { floor: '8F',  tenant: 'NH농협캐피탈(주)', deposit: 1200000000, rent: 55000000, isVacant: false },
        { floor: '7F',  tenant: 'NH농협캐피탈(주)', deposit: 1200000000, rent: 55000000, isVacant: false },
        { floor: '6F',  tenant: 'NH농협캐피탈(주)', deposit: 1200000000, rent: 55000000, isVacant: false },
        { floor: '5F',  tenant: 'NH농협캐피탈(주)', deposit: 1200000000, rent: 55000000, isVacant: false },
        { floor: '4F',  tenant: '어니스트인베스트먼트', deposit: 1000000000, rent: 42000000, isVacant: false },
        { floor: '3F',  tenant: '한국휴렛팩커드', deposit: 1000000000, rent: 42000000, isVacant: false },
        { floor: '2F',  tenant: '세광그린푸드', deposit: 800000000, rent: 35000000, isVacant: false },
        { floor: '1F',  tenant: '롤링핀 / GS25', deposit: 600000000, rent: 20000000, isVacant: false },
        { floor: 'B1F', tenant: '아비쥬의원', deposit: 600000000, rent: 18000000, isVacant: false },
      ],
    },
  };

  const photoPath = path.resolve('docs/test/real-broker-im/cbre-nh-capital-media/page_01_img_1.jpeg');

  const validDoc = {
    title: 'NH농협캐피탈빌딩 투자설명서',
    posture: 'income' as const,
    address: '서울특별시 영등포구 여의도동 45-3 (국제금융로8길 27-8)',
    body: {
      title: 'NH농협캐피탈빌딩',
      askingPrice: 250000000000,
      photo_urls: [photoPath],
      photos: [{ url: photoPath, buildingId: 'cbre-nh-capital-test' }],
      heroCard: {
        askingPriceKrw: 250000000000,
        landAreaM2: 2000.00,
        grossFloorAreaM2: 20700.61,
        capRatePct: 2.52,
        monthlyRentKrw: 525000000,
        depositKrw: 12000000000,
        useZone: '일반상업지역',
        floors: '지하 6층 ~ 지상 11층',
        completionYear: 1995,
      },
      summary: {
        leadText: '여의도 핵심 금융허브 입지의 사옥 적합형 연면적 6,262평 프라임 오피스',
        narrative: '매각희망가 2,500억 원, 대지 605.00평에 연면적 6,261.93평 규모의 여의도 프라임 자산입니다. WALE 2.1년 및 공실률 0%로 안정적인 임대수익이 발생합니다.',
      },
      ssot_summary: {
        asking_price: 250000000000,
        total_area: 20700.61,
        cap_rate: 2.52,
        deposit: 12000000000,
        monthly_rent: 525000000,
      },
    },
    sections: [
      {
        section_type: 'property_overview',
        title: '토지 및 건물 상세 제원',
        markdown: `### 건축물대장 기준 세부 제원\n- 일반상업지역 대지 605.0평, 연면적 6,261.9평\n- 지하 6층 ~ 지상 11층, 자주식 주차 102대 완비`,
      },
      {
        section_type: 'lease_status',
        title: '임대차 현황 (Rent Roll)',
        markdown: `### 만실 렌트롤 (WALE 2.1년, 공실률 0%)\n- 5F~11F 및 B2F: 앵커 테넌트 NH농협캐피탈(주) 본사 입주\n- 월 임대료 합계: 5억 2,500만 원 (연 63억 원)`,
      },
      {
        section_type: 'income_analysis',
        title: '수익성 분석',
        markdown: `### 연 순수익률 (Cap Rate) 분석\n- 연 순수익률 (Cap Rate): 2.52%\n- 연간 임대소득: 63억 원`,
      },
    ],
  };

  // ─────────────────────────────────────────────────────────────
  // 1. 중개인 입력 검증 및 Negative Pair 단언
  // ─────────────────────────────────────────────────────────────
  describe('G1: Broker Input Validation & Anomaly Detection', () => {
    it('[Positive] NH농협캐피탈 정상 입력치 0 이상치 VALID 단언', () => {
      const res = validateBrokerInput(validBrokerInput);
      expect(res.isValid).toBe(true);
      expect(res.hasCritical).toBe(false);
      expect(res.discrepancies.length).toBe(0);
    });

    it('[Negative Pair] 평당가 고의 왜곡 입력 시 LAND_PRICE_PYEONG_DISCREPANCY 검출 단언', () => {
      const tamperedInput = {
        ...validBrokerInput,
        statedLandPricePerPyeongKrw: 150000000, // 4.13억 대신 1.5억 기재 (오차 대폭 초과)
      };
      const res = validateBrokerInput(tamperedInput);
      expect(res.isValid).toBe(false);
      expect(res.hasCritical).toBe(true);
      const discrepancy = res.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
      expect(discrepancy).toBeDefined();
      expect(discrepancy?.severity).toBe('critical');
    });

    it('[Negative Pair] 렌트롤 합산 불일치 시 RENTROLL_SUM_MISMATCH 검출 단언', () => {
      const tamperedRent = {
        ...validBrokerInput,
        statedMonthlyRentKrw: 700000000, // 실제 합계 5.25억 대비 7억 기재
      };
      const res = validateBrokerInput(tamperedRent);
      const discrepancy = res.discrepancies.find(d => d.code === 'RENTROLL_SUM_MISMATCH');
      expect(discrepancy).toBeDefined();
      expect(discrepancy?.severity).toBe('warning');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. 물리 PPTX 바이너리 렌더링 및 6대 게이트 검증
  // ─────────────────────────────────────────────────────────────
  describe('G4 & Rule 6: Physical PPTX Binary Inspection & Output Assertions', () => {
    it('[Positive] 기관투자자 프라임 테마 렌더링 무결성 및 6대 게이트 PASS 단언', async () => {
      const renderer = new MobileImPptxRenderer();
      const renderResult = await renderer.render({
        buildingId: 'cbre-nh-capital-test',
        doc: validDoc as any,
        posture: 'income',
        preset: 'institutional_dark_gold',
        grade: 'A',
      });

      // Rule 10: 본문 16면 상한 준수
      expect(renderResult.slideCount).toBeLessThanOrEqual(16);
      expect(renderResult.fileSizeBytes).toBeGreaterThan(100000);

      // 물리 바이너리 인스펙션
      const inspection = await inspectPptxBinary(renderResult.buffer);
      expect(inspection.bleedCount).toBe(0);
      expect(inspection.placeholderResidueCount).toBe(0);
      expect(inspection.brokenImageCount).toBe(0);
      expect(inspection.personaViolationCount).toBe(0); // Rule 1
      expect(inspection.lexiconViolationCount).toBe(0); // Rule 2
      expect(inspection.legalRiskViolationCount).toBe(0);
      expect(inspection.isPass).toBe(true);
    });

    it('[Negative Pair] Rule 1 페르소나 단어 오염 시 바이너리 인스펙션 차단 단언', async () => {
      const contaminatedDoc = {
        ...validDoc,
        title: '60대 자산가를 위한 NH농협캐피탈빌딩 투자설명서', // Rule 1 표지 페르소나 위반
      };

      const renderer = new MobileImPptxRenderer();
      const renderResult = await renderer.render({
        buildingId: 'cbre-nh-capital-persona-test',
        doc: contaminatedDoc as any,
        posture: 'income',
        preset: 'institutional_dark_gold',
        grade: 'A',
      });

      const inspection = await inspectPptxBinary(renderResult.buffer);
      expect(inspection.personaViolationCount).toBeGreaterThan(0);
      expect(inspection.isPass).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. 옴니채널 크로스 채널 정합성 및 Negative Pair 단언
  // ─────────────────────────────────────────────────────────────
  describe('G6: Cross-Channel Consistency & Studio Approval Ledger', () => {
    it('[Positive] 웹 문서 및 Studio PPTX 프로젝트 지표 100% 일치 PASS 단언', async () => {
      const studioService = new PptxStudioService(true);
      const approvalService = new StudioApprovalService();
      const project = studioService.createProject('cbre-nh-capital', 'pkg-nh', validDoc.title, 'institutional_dark_gold');

      const targetHash = computeTargetHash({
        body: {
          asking_price: validDoc.body.askingPrice,
          address: validDoc.address,
          posture: validDoc.posture,
          sections: validDoc.sections,
        },
        releaseTier: 'analysis_im',
        policyVersion: 'v1.0.0',
      });
      expect(targetHash).toMatch(/^sha256:[a-f0-9]{64}$/);

      // Studio 2단계 승인 원장
      project.stage = 'S50_GATE_CHECK';
      const fakeSha = crypto.createHash('sha256').update('test-binary').digest('hex');
      const editorialEvent = await approvalService.approveEditorial(project, 'chief-auditor', fakeSha);
      expect(editorialEvent.id).toBeDefined();

      const { release } = await approvalService.approveFile(project, fakeSha, '/docs/demo-output/cbre-test.pptx', 'chief-auditor');
      expect(release.status).toBe('PUBLISHED');

      // 크로스 채널 일치 검증
      const report = verifyCrossChannelConsistency({
        webDoc: validDoc,
        pptxProject: project,
        ssotLite: validDoc.body.ssot_summary,
      });
      expect(report.passed).toBe(true);
      expect(report.totalDiscrepancies).toBe(0);
    });

    it('[Negative Pair] 웹 문서와 SSoT 간 가격 불일치 시 NUMERICAL_MISMATCH 검출 단언', () => {
      const studioService = new PptxStudioService(true);
      const project = studioService.createProject('cbre-nh-capital', 'pkg-nh', validDoc.title, 'institutional_dark_gold');
      // PPTX 측 overview 슬라이드 가격을 2,500억 원으로 설정
      project.slides = [
        { dataKey: 'overview', slideOverrides: { price: 250000000000 } }
      ];

      const tamperedReport = verifyCrossChannelConsistency({
        webDoc: {
          ...validDoc,
          body: {
            ...validDoc.body,
            ssot_summary: {
              ...validDoc.body.ssot_summary,
              asking_price: 300000000000, // 3,000억 원으로 왜곡
            },
          },
        },
        pptxProject: project,
      });

      expect(tamperedReport.passed).toBe(false);
      expect(tamperedReport.totalDiscrepancies).toBeGreaterThan(0);
      const priceDiscrepancy = tamperedReport.discrepancies.find(d => d.field === 'asking_price');
      expect(priceDiscrepancy).toBeDefined();
      expect(priceDiscrepancy?.discrepancyType).toBe('NUMERICAL_MISMATCH');
    });
  });
});
