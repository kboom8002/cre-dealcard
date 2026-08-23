/**
 * phase6-screens.test.ts — Phase 6 화면 확장, 7축 준비도 및 F/S 엔진 단위 테스트
 * Spec: docs/imup/IM_고도화_Phase6_테스트계획.md (§6-1, §6-2, §6-3, §6-4)
 */

import { describe, it, expect } from 'vitest';
import { isTeaserVisible, formatBandedPrice, formatBandedYield, TEASER_CTA_ACTIONS } from '@/domain/dealcard/teaser-rules';
import { calculate7AxisReadiness } from '@/domain/workspace/deal-readiness-7axis';
import { evaluateFreshness } from '@/domain/postpublish/freshness-engine';
import { evaluateSignals } from '@/domain/postpublish/signal-engine';
import { createRepublishRecord } from '@/domain/postpublish/republish-manager';
import { evaluateContamination } from '@/domain/distribution/contamination';
import type { PublishRecord, AIOutput } from '@/domain/postpublish/types';

describe('Phase 6 Screens, Readiness & Post-Publish Engines', () => {
  // ── 6-1. 딜카드 블라인드 티저 ──
  describe('6-1: Deal Card Teaser Rules & Banding', () => {
    it('isTeaserVisible: returns true only for public, non-internal slot with b2cLabel', () => {
      expect(isTeaserVisible({ key: 'price', visibility: 'public', audience: 'public', b2cLabel: '매매가' })).toBe(true);
      expect(isTeaserVisible({ key: 'price', visibility: 'full', audience: 'public', b2cLabel: '매매가' })).toBe(false); // full
      expect(isTeaserVisible({ key: 'score', visibility: 'public', audience: 'broker_internal', b2cLabel: '점수' })).toBe(false); // internal
      expect(isTeaserVisible({ key: 'r02Code', visibility: 'public', audience: 'public' })).toBe(false); // b2cLabel 없음
    });

    it('formatBandedPrice: bands exact price into round ranges', () => {
      expect(formatBandedPrice(19_500_000_000)).toBe('190억 원대');
      expect(formatBandedPrice(8_500_000_000)).toBe('80억 원대');
      expect(formatBandedPrice(12_500_000_000)).toBe('120억 원대');
      expect(formatBandedPrice(0)).toBe('가격 협의');
    });

    it('formatBandedYield: bands decimal yields into qualitative ranges', () => {
      expect(formatBandedYield(2.1)).toBe('2%대 초반');
      expect(formatBandedYield(4.5)).toBe('4%대 중반');
      expect(formatBandedYield(5.8)).toBe('5%대 후반');
      expect(formatBandedYield(null)).toBe('수익률 산정 중');
    });

    it('3-stage CTA actions: detail_request requires party authentication', () => {
      expect(TEASER_CTA_ACTIONS.inquiry.requiresPartyAuth).toBe(false);
      expect(TEASER_CTA_ACTIONS.curiosity.requiresPartyAuth).toBe(false);
      expect(TEASER_CTA_ACTIONS.detail_request.requiresPartyAuth).toBe(true);
    });
  });

  // ── 6-2. 중개인 워크스페이스 7축 준비도 ──
  describe('6-2: 7-Axis Deal Readiness Engine', () => {
    it('calculates full readiness (준비완료) when all 7 axes are satisfied', () => {
      const report = calculate7AxisReadiness({
        hasBuildingRegister: true,
        hasTitleRegistry: true,
        hasLandUsePlan: true,
        hasRentRoll: true,
        hasPhotos: true,
        hasAskingPrice: true,
        isMarketComparableAligned: true,
        hasExclusiveContract: true,
        sellerMeetingConfirmed: true,
        hasCleanTitle: true,
        vacatePlanEstablished: true,
        noIllegalBuilding: true,
        isZoningPermissible: true,
        isLeverageViable: true,
        hasAppraisalValue: true,
        buyerInquiryCount: 8,
        staleDays: 5,
      });

      expect(report.totalScore).toBe(100);
      expect(report.state).toBe('준비완료');
      expect(report.axes).toHaveLength(7);
      expect(report.nextBestActions).toHaveLength(0);
    });

    it('returns "보완필요" (60~79) and recommends top 3 point-gain actions', () => {
      const report = calculate7AxisReadiness({
        hasBuildingRegister: true,
        hasTitleRegistry: true,
        hasAskingPrice: true,
        hasCleanTitle: true,
        sellerMeetingConfirmed: true,
        noIllegalBuilding: true,
        staleDays: 10,
      });

      expect(report.totalScore).toBeGreaterThanOrEqual(40);
      expect(report.nextBestActions.length).toBeGreaterThanOrEqual(1);
      expect(report.nextBestActions.length).toBeLessThanOrEqual(3);
    });

    it('flags "정체" when staleDays > 60 even if score is high', () => {
      const report = calculate7AxisReadiness({
        hasBuildingRegister: true,
        hasTitleRegistry: true,
        hasAskingPrice: true,
        staleDays: 65, // 65일 정체
      });

      expect(report.state).toBe('정체');
      expect(report.isStalled).toBe(true);
    });
  });

  // ── 6-3. 발행 후 관리 F/S 엔진 & AI 계약 ──
  describe('6-3: Post-Publish F/S Engine & AI Contract', () => {
    it('evaluates F01 (등기부 30일 경과) and F09 (만기 6개월 이내)', () => {
      const verdicts = evaluateFreshness({
        registryDays: 45, // F01
        monthsToMinExpiry: 4, // F09
      });

      expect(verdicts.some(v => v.code === 'F01' && v.severity === 'warn')).toBe(true);
      expect(verdicts.some(v => v.code === 'F09' && v.severity === 'block')).toBe(true);
      expect(verdicts.every(v => v.source === 'rule')).toBe(true); // AI 판정 금지
    });

    it('evaluates S01 (섹션 이탈 집중) and S03 (공유 재전달 급증)', () => {
      const verdicts = evaluateSignals({
        totalViews: 25,
        distinctDevices: 5, // S03
        publishedDays: 10,
        maxSectionBounceRate: 0.48, // S01
        bouncedSectionKey: 'rentRoll',
      });

      expect(verdicts.some(v => v.code === 'S01' && v.severity === 'warn')).toBe(true);
      expect(verdicts.some(v => v.code === 'S03')).toBe(true);
    });

    it('AI Output contract: AI output can be Hypothesis or Suggestion, but never Verdict', () => {
      const hypothesis: AIOutput = {
        source: 'ai',
        signalCode: 'S01',
        text: '렌트롤 섹션의 임대료 갭이 주변 시세 대비 높아 매수자가 초기에 이탈하는 것으로 추정됩니다.',
        evidence: [{ type: 'bounce_rate', source: 'track_event', timestamp: '2026-08-23', value: 0.48 }],
      };

      expect(hypothesis.source).toBe('ai');
      expect(hypothesis.evidence.length).toBeGreaterThan(0);
    });

    it('republish-manager supersedes previous publish record and bumps version', () => {
      const prevRecord: PublishRecord = {
        id: 'pub_b1_v1',
        buildingId: 'b1',
        version: 1,
        status: 'active',
        publishedAt: '2026-08-01T00:00:00Z',
        findings: [
          { source: 'rule', code: 'F01', severity: 'warn', resolved: false, message: '등기부 경과' },
        ],
        resolvedFindings: [],
      };

      const result = createRepublishRecord({
        currentRecord: prevRecord,
        resolvedFindingCodes: ['F01'],
        remainingFindings: [],
      });

      expect(result.previousRecord.status).toBe('superseded');
      expect(result.newRecord.version).toBe(2);
      expect(result.newRecord.status).toBe('active');
      expect(result.newRecord.resolvedFindings).toContain('F01');
    });
  });

  // ── 6-4. 배포 및 신원 체계 ──
  describe('6-4: Distribution & Contamination Detection', () => {
    it('detects contamination when distinct viewers exceed 3', () => {
      expect(evaluateContamination(2).contaminated).toBe(false);
      expect(evaluateContamination(4).contaminated).toBe(true);
      expect(evaluateContamination(4).attributeToRecipient).toBe(false);
    });
  });
});
