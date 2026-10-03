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
import { runDisclosureGuard } from '@/domain/building/mobile-im/guardrails';

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

// ─── Wave 9.2: 2차 골든 실행(doc 6c14d338) 원문 기반 ───────────────────────────

const OVERVIEW_RAW_2 =
  '**자산 개요** **핵심 한줄 정의: 선유도역 도보 2분, 2018년 준공의 지하 1층~지상 10층 업무시설([건물명 비공개])입니다.** 서울 영등포구 양평로에 위치합니다. 선유도역 도보 2분 입지를 바탕으로 안정적인 오피스 임차수요 확보가 기대됩니다. > **자산 하이라이트**: • 선유도역 도보 2분의 역세권 도보권 접근성 • 2018년 준공, B1~10F의 753.3평(약 2490.2㎡) 업무시설';

const LEASE_RAW_2 =
  '**층별 임대 현황**\n| 층수 | 업종 | 전용면적 |\n|------|------|----------|\n| B1 | 🚫 공실 | 128평 |\n| 10F | 건축설계사무소 | 63평 | **임대차 종합 요약**\n| 구분 | 지표 분석 | 비고 |\n|------|-----------|------|\n| **공실 현황** | 8.3% | 공실 1실 |';

describe('normalizeSectionMarkdown — Wave 9.2 (Q1/T3/H2)', () => {
  it('Q1: 문장 끝 뒤에 붙은 인용구를 독립 줄로 분리한다', () => {
    const out = lines(normalizeSectionMarkdown(OVERVIEW_RAW_2));
    expect(out).toContain('> **자산 하이라이트**:');
    expect(out.some(l => /기대됩니다\.\s*>/.test(l))).toBe(false);
    expect(out).toContain('• 선유도역 도보 2분의 역세권 도보권 접근성');
  });

  it('H2: 줄 머리 짧은 볼드 라벨과 볼드 문장을 분리한다', () => {
    const out = lines(normalizeSectionMarkdown(OVERVIEW_RAW_2));
    expect(out[0]).toBe('**자산 개요**');
    expect(out[1].startsWith('**핵심 한줄 정의:')).toBe(true);
  });

  it('H2 negative: 볼드 명사 + 평문("**양평** 소재")과 조사로 끝나는 볼드는 분리하지 않는다', () => {
    const src1 = '**양평** 소재 **[건물명 비공개]** 주요 자산입니다.';
    expect(normalizeSectionMarkdown(src1)).toBe(src1);
    const src2 = '**본 자산은** **역세권 도보 2분 입지의 업무시설입니다.**';
    expect(normalizeSectionMarkdown(src2)).toBe(src2);
  });

  it('T3: 표 마지막 행 뒤 볼드 소제목을 분리하고, 규칙 7이 재접착하지 않는다', () => {
    const out = lines(normalizeSectionMarkdown(LEASE_RAW_2));
    expect(out).toContain('| 10F | 건축설계사무소 | 63평 |');
    expect(out).toContain('**임대차 종합 요약**');
    const idx = out.indexOf('**임대차 종합 요약**');
    expect(out[idx + 1]).toBe('| 구분 | 지표 분석 | 비고 |');
  });

  it('규칙 7 positive: 셀 조각 "|\\n\\n**항목** |"은 여전히 재결합한다', () => {
    const out = normalizeSectionMarkdown('| 구분 |\n\n**항목** | 값 |');
    expect(out).toBe('| 구분 | **항목** | 값 |');
  });

  it('멱등성 (Wave 9.2 픽스처)', () => {
    for (const raw of [OVERVIEW_RAW_2, LEASE_RAW_2]) {
      const once = normalizeSectionMarkdown(raw);
      expect(normalizeSectionMarkdown(once)).toBe(once);
    }
  });
});

describe('Wave 9.2 — 용어/마스킹 파편 방지', () => {
  it('"위반건축물"(법정 용어)을 "건축법 위반 사항물"로 훼손하지 않는다', () => {
    const { text } = normalizeTerminology('건축물대장상 위반건축물 여부를 확인합니다.');
    expect(text).not.toContain('사항물');
    expect(text).toContain('위반건축물');
  });

  it('"위반 건축"(구어)은 여전히 정규화된다', () => {
    expect(normalizeTerminology('위반 건축 이력 있음').text).toContain('건축법 위반 사항');
  });

  it('보증금 마스킹 시 금액 파편("3,700만원")이 남지 않는다', () => {
    const { safe_text } = runDisclosureGuard('기존 임차인의 보증금 5억 3,700만원 및 대항력을 확인합니다.');
    expect(safe_text).not.toMatch(/\]\s*3,700만/);
    expect(safe_text).not.toContain('3,700만원');
  });
});
