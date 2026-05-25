import { describe, test, expect } from 'vitest';
import { validateSnapshotOutput } from '@/domain/building/snapshot-generator';
import { SnapshotDraftSchema } from '@/ai/schemas/snapshot-schema';

describe('B1: Snapshot AI Agent', () => {

  test('B1-01: Zod 스키마 - 경계 문구 없으면 검증 실패', () => {
    const invalidSnapshot = {
      headline: '강남구 우량 상가',
      area_signal: '강남구 역삼동권',
      asset_type: '근생빌딩',
      size_signal: '연면적 약 2,400㎡',
      price_band: '80억대',
      current_use_summary: '복합 근생',
      deal_thesis: '우량 임차인 구성.',
      risk_summary: '공실 위험 낮음.',
      financial_snapshot: {
        vacancy_rate_note: '공실률 약 5%',
        walt_note: 'WALT 약 2년',
        income_note: '임대소득 참고 수준',
      },
      buyer_fit_types: ['수익형 투자자'],
      missing_data_note: '수선 이력 미확보',
      boundary_disclaimer: '잘못된 문구', // 실패해야 함
      document_version: 'v0.3-snapshot',
    };
    const result = SnapshotDraftSchema.safeParse(invalidSnapshot);
    expect(result.success).toBe(false);
  });

  test('B1-02: 올바른 스냅샷 스키마 통과', () => {
    const validSnapshot = {
      headline: '강남권역 역세권 복합 근생빌딩',
      area_signal: '강남구 역삼동권',
      asset_type: '근생빌딩',
      size_signal: '연면적 약 2,400㎡',
      price_band: '80억대',
      current_use_summary: '복합 근생 (1F 리테일 + 2-5F 오피스)',
      deal_thesis: '역세권 입지와 안정적 임차인 구성이 강점입니다.',
      risk_summary: '상층부 오피스 만기 공실 리스크 있음.',
      financial_snapshot: {
        vacancy_rate_note: '현재 공실률 약 5% (추정, 브로커 제공)',
        walt_note: 'WALT 약 2.1년 (참고용)',
        income_note: '연간 잠정 임대소득 참고 수준 (확정 아님)',
      },
      buyer_fit_types: ['수익형 투자자', '법인 사옥 겸용'],
      missing_data_note: '수선 이력 서류 미확보',
      boundary_disclaimer: '본 자료는 중개인이 제공한 참고용 정보로, 투자 권유나 법적 확약이 아닙니다. 상세 실사 및 전문가 검토가 필요합니다.',
      document_version: 'v0.3-snapshot',
    };
    const result = SnapshotDraftSchema.safeParse(validSnapshot);
    expect(result.success).toBe(true);
  });

  test('B1-03: 정확한 임차인명 포함 시 가드레일 실패', () => {
    const result = validateSnapshotOutput({
      deal_thesis: '1층 스타벅스 입점 우량 건물',  // 임차인명 노출 위험
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('tenant_name_detected');
  });

  test('B1-04: 가격 확정 표현 포함 시 가드레일 실패', () => {
    const result = validateSnapshotOutput({
      financial_snapshot: {
        income_note: '연간 NOI는 3.2억원으로 확정됩니다',  // 확정 표현 금지
      },
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('definitive_financial_claim');
  });
});
