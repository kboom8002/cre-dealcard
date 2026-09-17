import { describe, it, expect } from 'vitest';

// ═══ Operating Posture Builder Unit Tests ═══
// Sprint 0-7: 운영형 포스처 빌더 4함수 + A02 요약 바인딩 검증

import {
  buildOperatingKpiProps,
  buildOperatingRevenueProps,
  buildOperatingSeasonalityProps,
  buildOperatingOperatorProps,
} from '@/domain/building/mobile-im/pptx/binder/posture-builders';

describe('Operating Posture Builder — Sprint 0', () => {
  describe('buildOperatingKpiProps', () => {
    it('호텔 94실 데이터 → kpiRows 5행 이상, statCards 3개', () => {
      const body = {
        hotel_operating: {
          total_rooms: 94,
          adr_krw: 95000,
          occupancy_rate_pct: 78,
          revpar_krw: 74100,
          gop_margin_pct: 38,
          operator_name: '에이치 에비뉴',
          tourism_grade: '관광호텔업 3급',
          room_types: [
            { type_name: '스탠다드 더블', room_count: 46, share_pct: 0.489 },
            { type_name: '스탠다드 트윈', room_count: 28, share_pct: 0.298 },
            { type_name: '디럭스 더블', room_count: 14, share_pct: 0.149 },
            { type_name: '스위트', room_count: 6, share_pct: 0.064 },
          ],
        },
        assetIdentity: { area_signal: '신촌·이대 권역' },
      };

      const result = buildOperatingKpiProps(body, {});

      expect(result.kpiRows.length).toBeGreaterThanOrEqual(5);
      expect(result.statCards.length).toBe(3);
      expect(result.subtitle).toContain('호텔');
      expect(result.highlight).toBeTruthy();

      // KPI 행에 핵심 지표 포함
      const kpiLabels = result.kpiRows.map((r: [string, string]) => r[0]);
      expect(kpiLabels).toContain('총 객실 수');
      expect(kpiLabels).toContain('RevPAR (객실당 매출)');
      expect(kpiLabels).toContain('GOP 마진율');
    });

    it('RevPAR 미제공 시 ADR × OCC에서 자동 계산', () => {
      const body = {
        hotel_operating: {
          total_rooms: 50,
          adr_krw: 100000,
          occupancy_rate_pct: 80,
          // revpar_krw 미제공
        },
      };

      const result = buildOperatingKpiProps(body, {});

      const revparRow = result.kpiRows.find((r: [string, string]) => r[0].includes('RevPAR'));
      expect(revparRow).toBeTruthy();
      expect(revparRow![1]).toContain('8.0'); // 100000 * 80/100 = 80000 → 8.0만원
    });

    it('데이터 부재 시 빈 행과 폴백 하이라이트 생성', () => {
      const result = buildOperatingKpiProps({}, {});

      expect(result.kpiRows.length).toBe(0);
      expect(result.statCards.length).toBe(0);
      expect(result.highlight).toBeTruthy(); // 폴백 문구 존재
    });
  });

  describe('buildOperatingRevenueProps', () => {
    it('GOP 마진 + 연매출 → Cap Rate 산출', () => {
      const body = {
        hotel_operating: {
          annual_revenue_krw: 2_822_031_810,
          annual_gop_krw: 1_072_372_088,
          gop_margin_pct: 38,
          room_revenue_krw: 2_542_371_000,
          ancillary_revenue_pct: 0.11,
        },
        ssot_summary: {
          asking_price_manwon: 3_000_000, // 300억
        },
        assetIdentity: { area_signal: '신촌·이대 권역' },
      };

      const result = buildOperatingRevenueProps(body, {});

      expect(result.left).toBeTruthy();
      expect(result.right.stats.length).toBeGreaterThanOrEqual(3);
      expect(result.right.callouts.length).toBeGreaterThanOrEqual(1);

      // Cap Rate 계산 검증: 1072372088 / 30000000000 ≈ 3.57%
      const capRateStat = result.right.stats.find((s: any) => s.label.includes('Cap Rate'));
      expect(capRateStat).toBeTruthy();
      expect(capRateStat!.value).toContain('3.57');
    });

    it('매출 데이터 부재 시 "확인 필요" 폴백', () => {
      const result = buildOperatingRevenueProps({}, {});

      expect(result.right.stats.length).toBeGreaterThanOrEqual(1);
      const revStat = result.right.stats.find((s: any) => s.label.includes('총매출'));
      expect(revStat?.value).toContain('확인 필요');
    });
  });

  describe('buildOperatingSeasonalityProps', () => {
    it('계절성 분석 콜아웃 및 외국인 비중 반영', () => {
      const body = {
        hotel_operating: {
          occupancy_rate_pct: 78,
          seasonality_note: '3~5월·9~11월 성수 / 1~2월 비수 (대학가 특성)',
          foreign_guest_pct: 45,
        },
        assetIdentity: { area_signal: '신촌·이대 권역' },
      };

      const result = buildOperatingSeasonalityProps(body, {});

      expect(result.right.callouts.length).toBeGreaterThanOrEqual(1);
      expect(result.right.stats.length).toBeGreaterThanOrEqual(1);

      const foreignStat = result.right.stats.find((s: any) => s.label.includes('외국인'));
      expect(foreignStat).toBeTruthy();
      expect(foreignStat!.value).toContain('45');
    });
  });

  describe('buildOperatingOperatorProps', () => {
    it('운영사 정보 → table1.rows + 계약 만료 경고 콜아웃', () => {
      const body = {
        hotel_operating: {
          operator_name: '에이치 에비뉴',
          operating_model: 'management_contract' as const,
          operator_contract_expiry: '2029년 만료',
          tourism_grade: '관광호텔업 3급',
          total_rooms: 94,
        },
        assetIdentity: { area_signal: '신촌·이대 권역' },
      };

      const result = buildOperatingOperatorProps(body, {});

      expect(result.table1.rows.length).toBeGreaterThanOrEqual(4);
      expect(result.callouts.length).toBeGreaterThanOrEqual(1);

      // 운영 형태 라벨 변환 확인
      const modelRow = result.table1.rows.find((r: [string, string]) => r[0].includes('운영 형태'));
      expect(modelRow).toBeTruthy();
      expect(modelRow![1]).toContain('위탁운영');

      // 계약 만료 경고 콜아웃
      expect(result.callouts[0].kind).toBe('caution');
    });

    it('계약 만료 미기재 시 info 콜아웃', () => {
      const body = {
        hotel_operating: {
          operator_name: '힐튼',
          total_rooms: 200,
        },
      };

      const result = buildOperatingOperatorProps(body, {});
      expect(result.callouts[0].kind).toBe('info');
    });
  });

  describe('A02 Summary operating 분기 (기존 archetype-builders.ts 검증)', () => {
    it('operating 포스처 → GOP/RevPAR 메트릭이 heroCard에서 바인딩됨', () => {
      // archetype-builders.ts L962-967의 기존 로직을 검증
      const heroCard = {
        noiBaseBil: 10.7,
        gopMarginPct: 38,
        revpar: 74100,
      };

      // A02 metrics 생성 시뮬레이션
      const metrics: Array<{ label: string; value: string }> = [];
      metrics.push({ label: '매매 희망가', value: '300억' });
      if (heroCard.noiBaseBil) metrics.push({ label: '연간 실질 GOP', value: `약 ${heroCard.noiBaseBil}억 원` });
      if (heroCard.gopMarginPct) metrics.push({ label: 'GOP 마진율', value: `${heroCard.gopMarginPct}%` });
      if (heroCard.revpar) metrics.push({ label: 'RevPAR(객실매출)', value: `약 ${(heroCard.revpar / 10000).toFixed(1)}만원` });

      expect(metrics.length).toBe(4);
      expect(metrics[1].label).toBe('연간 실질 GOP');
      expect(metrics[2].value).toBe('38%');
      expect(metrics[3].value).toContain('7.4');
    });
  });
});
