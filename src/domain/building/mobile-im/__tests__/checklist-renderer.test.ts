import { describe, it, expect } from 'vitest';
import { renderChecklist } from '../checklist-renderer';

describe('Checklist Renderer (S3-7, 불변조건 9, 13, 18)', () => {
  it('결손 데이터, 게이트 경고, AI 가정값, 잠긴 지표를 누락 없이 전량 렌더해야 한다', () => {
    const section = renderChecklist({
      deficiencies: [
        { field: 'officialLandPrice', label: '공시지가', affects: ['yield_noi'] as any, severity: 'degrade' as const, nextBest: null },
        { field: 'rentRoll', label: '임대차 원장', affects: ['yield_gross'] as any, severity: 'block' as const, nextBest: null },
      ],
      gateWarnings: [
        { id: 'QG14', label: '최초계약일 미확인 호실 존재' },
      ],
      assumptions: [
        { slot: 'opexRatio', label: '운영비 비율', value: 10 },
      ],
      lockedMetrics: [
        { metric: '연 순수익률 (Cap Rate)', missingSlots: ['임대차 원장', '운영비'] },
      ],
    });

    expect(section.section_type).toBe('checklist');
    expect(section.masking).toBe(false); // 불변조건 9: 공개 단계에서도 마스킹 금지
    expect(section.truncation).toBe('never'); // 불변조건 18: 전량 표기
    expect(section.items.length).toBe(5);

    // 마크다운 검증
    expect(section.markdown).toContain('확인사항 및 실사 점검 체크리스트');
    expect(section.markdown).toContain('공시지가');
    expect(section.markdown).toContain('임대차 원장');
    expect(section.markdown).toContain('QG14');
    expect(section.markdown).toContain('운영비 비율');
    expect(section.markdown).toContain('연 순수익률 (Cap Rate)');
  });

  it('결손이 없는 완비 상태일 때도 긍정적 완료 안내문이 출력되어야 한다', () => {
    const section = renderChecklist({});
    expect(section.items.length).toBe(0);
    expect(section.markdown).toContain('현재 식별된 결손 또는 확인 필요 항목이 없습니다');
  });
});
