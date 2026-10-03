/**
 * markdown-normalizer + terminology-normalizer 회귀 테스트
 *
 * 실제 골든 E2E(income-yangpyeong-r3) 문서에서 관측된 LLM 원문을 고정 픽스처로 사용합니다.
 * - Wave 9 Rule 1b 회귀: "**양평** 소재…" 문장 내 볼드 명사가 헤더로 오분리
 * - 문장 끝에 붙은 표 헤더 / 표 끝에 붙은 인용구 / 줄 끝 볼드 소제목
 * - 용어 정규화 이중 래핑: "순영업소득(순영업소득(NOI))"
 */
import { describe, it, expect } from 'vitest';
import { normalizeSectionMarkdown } from '@/lib/utils/markdown-normalizer';
import { normalizeTerminology } from '@/domain/building/mobile-im/terminology-normalizer';

const OVERVIEW_RAW =
  '**양평** 소재 **[건물명 비공개]** 주요 자산입니다. | 항목 | 내용 |\n|------|------|\n| **소재지** | 양평 |\n| **주요 용도** | 업무시설 |\n| **매도 희망가** | 250억 | > 본 매물은 양평 입지의 안정적 임대 수익형 자산입니다.';

const THESIS_RAW =
  '> 💡 **종합 가치 제안**: 양평 소재 [건물명 비공개] — 임대 수익 구조와 자산 가치 상승 시나리오를 분석합니다. **3대 핵심 투자 포인트 (Investment Highlights)** • **자산 가치 완충 여력 확보**: 핵심 입지 기반의 자산 가치가 형성되어 있습니다. • **가치 상승 및 출구 전략**: 본 자산과 비교 검토할 수 있습니다. **권역 시세 벤치마킹 (실거래 분석 · 연면적 기준)**\n| 항목 | 수치 |\n|------|------|\n| **비교 사례 수** | 10건 |';

const lines = (md: string) => md.split('\n').map(l => l.trim()).filter(Boolean);

describe('normalizeSectionMarkdown', () => {
  it('문장 시작 볼드 명사("**양평** 소재")를 헤더로 분리하지 않는다', () => {
    const out = lines(normalizeSectionMarkdown(OVERVIEW_RAW));
    expect(out[0]).toBe('**양평** 소재 **[건물명 비공개]** 주요 자산입니다.');
    expect(out).not.toContain('**양평**');
  });

  it('문장 끝에 붙은 표 헤더를 독립 줄로 분리하고 표 내부 행은 보존한다', () => {
    const out = lines(normalizeSectionMarkdown(OVERVIEW_RAW));
    expect(out[1]).toBe('| 항목 | 내용 |');
    expect(out[2]).toBe('|------|------|');
    expect(out).toContain('| **소재지** | 양평 |');
  });

  it('표 마지막 행 뒤에 붙은 인용구를 분리한다', () => {
    const out = lines(normalizeSectionMarkdown(OVERVIEW_RAW));
    expect(out).toContain('| **매도 희망가** | 250억 |');
    expect(out[out.length - 1]).toBe('> 본 매물은 양평 입지의 안정적 임대 수익형 자산입니다.');
  });

  it('문장 끝 뒤 줄을 끝맺는 볼드 소제목을 분리한다', () => {
    const out = lines(normalizeSectionMarkdown(THESIS_RAW));
    expect(out).toContain('**3대 핵심 투자 포인트 (Investment Highlights)**');
    expect(out).toContain('**권역 시세 벤치마킹 (실거래 분석 · 연면적 기준)**');
    expect(out).toContain('• **가치 상승 및 출구 전략**: 본 자산과 비교 검토할 수 있습니다.');
  });

  it('숫자로 시작하는 인라인 불릿을 분리한다', () => {
    const out = lines(normalizeSectionMarkdown('• 역세권 접근성 • 2018년 준공, 신축급 업무시설 • 기존 임대수익 기반'));
    expect(out).toEqual(['• 역세권 접근성', '• 2018년 준공, 신축급 업무시설', '• 기존 임대수익 기반']);
  });

  it('하이픈 연결어("서울-경기")는 대시 불릿으로 분리하지 않는다', () => {
    const src = '서울-경기 광역 접근성이 우수합니다.';
    expect(normalizeSectionMarkdown(src)).toBe(src);
  });

  it('멱등성: 두 번 적용해도 결과가 같다 (서버·클라이언트 이중 호출)', () => {
    const once = normalizeSectionMarkdown(THESIS_RAW);
    expect(normalizeSectionMarkdown(once)).toBe(once);
    const once2 = normalizeSectionMarkdown(OVERVIEW_RAW);
    expect(normalizeSectionMarkdown(once2)).toBe(once2);
  });
});

describe('normalizeTerminology — 괄호 내 용어 이중 래핑 방지', () => {
  it.each([
    ['순영업소득(NOI) 구조가 확인됩니다.', '순영업소득(순영업소득'],
    ['연 순수익률(Cap Rate) 2.5%', '연 순수익률(연 순수익률'],
    ['실질 영업이익(GOP) 12억', '실질 영업이익(실질 영업이익'],
  ])('%s', (input, doubled) => {
    const { text } = normalizeTerminology(input);
    expect(text).not.toContain(doubled);
    expect(normalizeTerminology(text).text).toBe(text);
  });

  it('괄호 밖 선두 NOI는 여전히 한글 병기로 치환된다', () => {
    expect(normalizeTerminology('NOI 약 6억').text).toContain('순영업소득(NOI)');
  });
});

describe('normalizeSectionMarkdown — 가운뎃점(·) 오분리 방지', () => {
  it('문장 중간 "A · B"는 불릿으로 분리하지 않는다', () => {
    const src = '주차 · 승강기 현황은 **실거래 분석 · 연면적 기준**으로 확인됩니다.';
    expect(normalizeSectionMarkdown(src)).toBe(src);
  });

  it('문장부호 뒤 "· 항목"은 불릿으로 분리한다', () => {
    const out = lines(normalizeSectionMarkdown('요약입니다. · 역세권 입지 · 신축급 건물'));
    expect(out[0]).toBe('요약입니다.');
    expect(out[1]).toBe('· 역세권 입지 · 신축급 건물');
  });
});
