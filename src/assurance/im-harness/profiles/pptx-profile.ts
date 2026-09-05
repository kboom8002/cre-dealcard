import type { HarnessEvaluator } from '../evaluator';
import type { PPTXDeckSpec } from '@/domain/building/pptx-publication/types';
import {
  inspectPptxBinary,
  FORBIDDEN_PERSONA_PATTERN,
  FORBIDDEN_LEXICON_PATTERN,
  FORBIDDEN_LEGAL_RISK_PATTERN,
} from '../observers/pptx-binary-observer';

export function registerPPTXProfiles(evaluator: HarnessEvaluator): void {
  // 1. Page Limit Gate (G10/Rule 10)
  const pageLimitCheck = async (deck: PPTXDeckSpec) => {
    const isExceeded = deck.bodySlideCount > 16;
    return {
      status: isExceeded ? ('FAIL' as const) : ('PASS' as const),
      observed: deck.bodySlideCount,
      expected: '<= 16면 (부록 제외)',
      reason: isExceeded ? `본문 면수(${deck.bodySlideCount}) 16면 초과` : '본문 면수 상한 준수',
    };
  };

  // 2. Non-duplication Gate (Rule 3)
  const nonDuplicationCheck = async (deck: PPTXDeckSpec) => {
    let hasDuplicate = false;
    let duplicateDetail = '';
    for (const slide of deck.slides) {
      if (slide.leftContent && slide.rightContent) {
        const narrative = slide.leftContent.narrative ?? '';
        for (const card of slide.rightContent.cards ?? []) {
          const cardVal = (card.value ?? '').trim();
          if (cardVal.length >= 10 && narrative.includes(cardVal)) {
            hasDuplicate = true;
            duplicateDetail = cardVal;
            break;
          }
        }
        if (hasDuplicate) break;
      }
    }
    return {
      status: hasDuplicate ? ('FAIL' as const) : ('PASS' as const),
      observed: hasDuplicate,
      expected: false,
      reason: hasDuplicate
        ? `좌측 리드문과 우측 카드 텍스트 중복 발생: "${duplicateDetail}"`
        : '비중복 렌더링 원칙 준수',
    };
  };

  // Register P-PPTX-PREVIEW
  evaluator.registerRule('P-PPTX-PREVIEW', {
    gateId: 'GATE-PPTX-PAGE-LIMIT',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '본문 16면 상한 검사',
    check: pageLimitCheck,
  });

  evaluator.registerRule('P-PPTX-PREVIEW', {
    gateId: 'GATE-PPTX-NON-DUPLICATION',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '좌/우 분할 레이아웃 비중복 검증',
    check: nonDuplicationCheck,
  });

  // Register P-PPTX-FINAL
  evaluator.registerRule('P-PPTX-FINAL', {
    gateId: 'GATE-PPTX-PAGE-LIMIT',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '본문 16면 상한 검사',
    check: pageLimitCheck,
  });

  evaluator.registerRule('P-PPTX-FINAL', {
    gateId: 'GATE-PPTX-NON-DUPLICATION',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '좌/우 분할 레이아웃 비중복 검증',
    check: nonDuplicationCheck,
  });

  evaluator.registerRule('P-PPTX-FINAL', {
    gateId: 'GATE-PPTX-150DPI-VISUAL',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '150 DPI 고화질 시각 레이아웃 무결성 검증',
    check: async (deck: PPTXDeckSpec & { visualOverflowCount?: number }) => {
      const overflows = deck.visualOverflowCount ?? 0;
      return {
        status: overflows === 0 ? ('PASS' as const) : ('FAIL' as const),
        observed: overflows,
        expected: 0,
        reason: overflows === 0 ? '시각 오버플로우 없음' : `텍스트/요소 넘침 ${overflows}건 검출`,
      };
    },
  });

  // Register P-PPTX-RELEASE (includes binary ZIP/XML physical inspection)
  evaluator.registerRule('P-PPTX-RELEASE', {
    gateId: 'GATE-PPTX-PAGE-LIMIT',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '본문 16면 상한 검사',
    check: pageLimitCheck,
  });

  evaluator.registerRule('P-PPTX-RELEASE', {
    gateId: 'GATE-PPTX-NON-DUPLICATION',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '좌/우 분할 레이아웃 비중복 검증',
    check: nonDuplicationCheck,
  });

  evaluator.registerRule('P-PPTX-RELEASE', {
    gateId: 'GATE-PPTX-BINARY-PHYSICAL',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '실제 PPTX ZIP/XML 바이너리 지면 물리 검사 (자리표시자 잔존, 지면 이탈)',
    check: async (context: PPTXDeckSpec & { pptxBuffer?: Buffer }) => {
      if (!context.pptxBuffer) {
        return {
          status: 'NOT_RUN' as const,
          observed: 'pptxBuffer not provided',
          expected: 'Buffer',
          reason: 'PPTX 바이너리 버퍼 미제공으로 물리 검사 스킵',
        };
      }
      const result = await inspectPptxBinary(context.pptxBuffer);
      return {
        status: result.isPass ? ('PASS' as const) : ('FAIL' as const),
        observed: { issues: result.issues.length, placeholders: result.placeholderResidueCount, bleeds: result.bleedCount },
        expected: { issues: 0, placeholders: 0, bleeds: 0 },
        reason: result.isPass ? 'PPTX 바이너리 물리 검사 통과' : `물리 결함 ${result.issues.length}건: ${result.issues.slice(0, 3).join('; ')}`,
      };
    },
  });

  evaluator.registerRule('P-PPTX-RELEASE', {
    gateId: 'GATE-PPTX-150DPI-IMAGE',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '150 DPI 고화질 이미지 자산 바이너리 패킹 및 깨진 이미지 0건 보장',
    check: async (context: PPTXDeckSpec & { pptxBuffer?: Buffer }) => {
      if (!context.pptxBuffer) {
        return {
          status: 'NOT_RUN' as const,
          observed: 'pptxBuffer not provided',
          expected: 'Buffer',
          reason: 'PPTX 바이너리 버퍼 미제공으로 이미지 물리 검사 스킵',
        };
      }
      const result = await inspectPptxBinary(context.pptxBuffer);
      const passed = result.minEffectiveDpi >= 150 && result.brokenImageCount === 0;
      return {
        status: passed ? ('PASS' as const) : ('FAIL' as const),
        observed: { minDpi: result.minEffectiveDpi, brokenImages: result.brokenImageCount },
        expected: { minDpi: '>= 150', brokenImages: 0 },
        reason: passed
          ? `이미지 물리 무결성 통과 (최소 DPI: ${result.minEffectiveDpi}, 손상 이미지: 0건)`
          : `이미지 물리 무결성 실패: DPI ${result.minEffectiveDpi} < 150 또는 손상 이미지 ${result.brokenImageCount}건`,
      };
    },
  });

  evaluator.registerRule('P-PPTX-RELEASE', {
    gateId: 'GATE-PPTX-PERSONA-ISOLATION',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '외부 노출 슬라이드 내 페르소나 직접 지칭 문구 차단 (Rule 1)',
    check: async (context: PPTXDeckSpec & { pptxBuffer?: Buffer }) => {
      if (context.pptxBuffer) {
        const result = await inspectPptxBinary(context.pptxBuffer);
        const passed = result.personaViolationCount === 0;
        return {
          status: passed ? ('PASS' as const) : ('FAIL' as const),
          observed: result.personaViolationCount === 0 ? '페르소나 문구 미검출' : '페르소나 문구 검출됨',
          expected: '페르소나 격리 원칙 준수 (0건)',
          reason: passed
            ? '페르소나 격리 통과'
            : `PPTX 슬라이드 텍스트 내 페르소나 문구 ${result.personaViolationCount}건 검출`,
        };
      }
      const allText = (context.slides ?? []).map(s => [s.title, s.leftContent?.leadText, s.leftContent?.narrative, ...(s.rightContent?.cards?.map(c => `${c.label} ${c.value}`) ?? [])].filter(Boolean).join(' ')).join(' ');
      const hasPersona = FORBIDDEN_PERSONA_PATTERN.test(allText);
      return {
        status: hasPersona ? ('FAIL' as const) : ('PASS' as const),
        observed: hasPersona ? '페르소나 문구 검출됨' : '페르소나 문구 미검출',
        expected: '페르소나 격리 원칙 준수',
        reason: hasPersona ? '슬라이드 내 페르소나 직접 지칭 문구 검출' : '페르소나 격리 통과',
      };
    },
  });

  evaluator.registerRule('P-PPTX-RELEASE', {
    gateId: 'GATE-PPTX-LEXICON-COMPLIANCE',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '한국 상업용 부동산(CRE) 실무 표준 용어 준수 (Rule 2)',
    check: async (context: PPTXDeckSpec & { pptxBuffer?: Buffer }) => {
      if (context.pptxBuffer) {
        const result = await inspectPptxBinary(context.pptxBuffer);
        const passed = result.lexiconViolationCount === 0;
        return {
          status: passed ? ('PASS' as const) : ('FAIL' as const),
          observed: result.lexiconViolationCount === 0 ? '실무 표준 용어 준수' : '부적절한 외래어 직역 표기 검출',
          expected: '한국 실무 표준 용어집 준수 (100%)',
          reason: passed
            ? '용어 준수 통과'
            : `PPTX 슬라이드 텍스트 내 금지된 직역 표기 ${result.lexiconViolationCount}건 검출`,
        };
      }
      const allText = (context.slides ?? []).map(s => [s.title, s.leftContent?.leadText, s.leftContent?.narrative, ...(s.rightContent?.cards?.map(c => `${c.label} ${c.value}`) ?? [])].filter(Boolean).join(' ')).join(' ');
      const match = allText.match(FORBIDDEN_LEXICON_PATTERN);
      return {
        status: match ? ('FAIL' as const) : ('PASS' as const),
        observed: match ? match[0] : '실무 표준 용어 준수',
        expected: '한국 실무 표준 용어집 준수',
        reason: match ? `부적절한 외래어 직역 표기: ${match[0]}` : '용어 준수 통과',
      };
    },
  });

  evaluator.registerRule('P-PPTX-RELEASE', {
    gateId: 'GATE-PPTX-LEGAL-SAFETY',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '공인중개사법 및 자본시장법 확정·보장 표현 차단 (P0)',
    check: async (context: PPTXDeckSpec & { pptxBuffer?: Buffer }) => {
      if (context.pptxBuffer) {
        const result = await inspectPptxBinary(context.pptxBuffer);
        const passed = result.legalRiskViolationCount === 0;
        return {
          status: passed ? ('PASS' as const) : ('FAIL' as const),
          observed: result.legalRiskViolationCount === 0 ? '금융/법적 확정·보장 표현 미검출' : '금지된 확정/보장 문구 검출',
          expected: '공인중개사법 및 자본시장법 준수 (수익률 보장/투자 추천 0건)',
          reason: passed
            ? '법적 안전성 통과'
            : `PPTX 슬라이드 텍스트 내 금지된 확정/보장 문구 ${result.legalRiskViolationCount}건 검출`,
        };
      }
      const allText = (context.slides ?? []).map(s => [s.title, s.leftContent?.leadText, s.leftContent?.narrative, ...(s.rightContent?.cards?.map(c => `${c.label} ${c.value}`) ?? [])].filter(Boolean).join(' ')).join(' ');
      const match = allText.match(FORBIDDEN_LEGAL_RISK_PATTERN);
      return {
        status: match ? ('FAIL' as const) : ('PASS' as const),
        observed: match ? match[0] : '금융/법적 확정·보장 표현 미검출',
        expected: '공인중개사법 및 자본시장법 준수 (수익률 보장/투자 추천 0건)',
        reason: match ? `공인중개사법상 금지된 확정/보장 문구 검출: ${match[0]}` : '법적 안전성 통과',
      };
    },
  });
}
