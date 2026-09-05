import type { HarnessEvaluator } from '../evaluator';
import type { MobileIMPackage } from '@/domain/building/mobile-im-publication/types';

const FORBIDDEN_PERSONA_PATTERN = /(?:70대|60대|50대|40대|30대|20대|MZ|초보|고액|고자산|법인|개인|VIP|기관|리츠|시행사|디벨로퍼)\s*(?:자산가|투자자|대표|고객|매수자|운용사|가족)/;

const FORBIDDEN_LEXICON_PATTERN = /\b(?:캡레이트|GOP|네이밍\s*라이츠|브랜딩\s*라이츠)\b/;

const FORBIDDEN_LEGAL_RISK_PATTERN = /(?:수익(?:률)?|원금|현금흐름|배당)\s*(?:보장|확정)|(?:보장|확정)\s*(?:수익(?:률)?|원금|현금흐름|배당)|(?:매수|투자)\s*(?:추천|강력\s*추천)|(?:대출|LTV)\s*(?:확정|승인)/;

export function registerMobileIMProfiles(evaluator: HarnessEvaluator): void {
  // 1. Common Persona Isolation Gate
  const personaCheck = async (pkg: MobileIMPackage) => {
    const allText = pkg.sections.map((s) => `${s.title} ${s.content}`).join(' ');
    const hasPersona = FORBIDDEN_PERSONA_PATTERN.test(allText);
    return {
      status: hasPersona ? ('FAIL' as const) : ('PASS' as const),
      observed: hasPersona ? '페르소나 문구 검출됨' : '페르소나 문구 미검출',
      expected: '페르소나 격리 원칙 준수',
      reason: hasPersona ? '외부 노출 문서에 페르소나 직접 지칭 문구 검출' : '페르소나 격리 통과',
    };
  };

  // 2. Lexicon Compliance Gate
  const lexiconCheck = async (pkg: MobileIMPackage) => {
    const allText = pkg.sections.map((s) => `${s.title} ${s.content}`).join(' ');
    const match = allText.match(FORBIDDEN_LEXICON_PATTERN);
    return {
      status: match ? ('FAIL' as const) : ('PASS' as const),
      observed: match ? match[0] : '실무 표준 용어 준수',
      expected: '한국 실무 표준 용어집 준수',
      reason: match ? `부적절한 외래어 직역 표기: ${match[0]}` : '용어 준수 통과',
    };
  };

  // 3. Legal Safety Gate (P0 공인중개사법/자본시장법 위반 차단)
  const legalSafetyCheck = async (pkg: MobileIMPackage) => {
    const allText = pkg.sections.map((s) => `${s.title} ${s.content}`).join(' ');
    const match = allText.match(FORBIDDEN_LEGAL_RISK_PATTERN);
    return {
      status: match ? ('FAIL' as const) : ('PASS' as const),
      observed: match ? match[0] : '금융/법적 확정·보장 표현 미검출',
      expected: '공인중개사법 및 자본시장법 준수 (수익률 보장/투자 추천 0건)',
      reason: match ? `공인중개사법상 금지된 확정/보장 문구 검출: ${match[0]}` : '법적 안전성 통과',
    };
  };

  // 4. Register P-MOBILE-L1
  evaluator.registerRule('P-MOBILE-L1', {
    gateId: 'GATE-MOBILE-PERSONA-ISOLATION',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '페르소나 직접 지칭 문구 차단',
    check: personaCheck,
  });

  evaluator.registerRule('P-MOBILE-L1', {
    gateId: 'GATE-MOBILE-LEXICON-COMPLIANCE',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '한국 CRE 실무 용어 표준 준수',
    check: lexiconCheck,
  });

  evaluator.registerRule('P-MOBILE-L1', {
    gateId: 'GATE-MOBILE-LEGAL-SAFETY',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '공인중개사법 및 자본시장법 확정·보장 표현 차단',
    check: legalSafetyCheck,
  });

  evaluator.registerRule('P-MOBILE-L1', {
    gateId: 'GATE-MOBILE-L1-REQUIRED-SECTIONS',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: 'L1 필수 4대 섹션 포함 여부',
    check: async (pkg: MobileIMPackage) => {
      const types = pkg.sections.map((s) => s.sectionType);
      const hasRequired =
        types.includes('property_overview') &&
        types.includes('financial_summary') &&
        types.includes('lease_status') &&
        types.includes('disclaimer');
      return {
        status: hasRequired ? 'PASS' : 'FAIL',
        observed: types,
        expected: ['property_overview', 'financial_summary', 'lease_status', 'disclaimer'],
        reason: hasRequired ? 'L1 필수 섹션 충족' : 'L1 필수 섹션 누락',
      };
    },
  });

  // 5. Register P-MOBILE-L15
  evaluator.registerRule('P-MOBILE-L15', {
    gateId: 'GATE-MOBILE-PERSONA-ISOLATION',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '페르소나 직접 지칭 문구 차단',
    check: personaCheck,
  });

  evaluator.registerRule('P-MOBILE-L15', {
    gateId: 'GATE-MOBILE-LEXICON-COMPLIANCE',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '한국 CRE 실무 용어 표준 준수',
    check: lexiconCheck,
  });

  evaluator.registerRule('P-MOBILE-L15', {
    gateId: 'GATE-MOBILE-LEGAL-SAFETY',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '공인중개사법 및 자본시장법 확정·보장 표현 차단',
    check: legalSafetyCheck,
  });

  evaluator.registerRule('P-MOBILE-L15', {
    gateId: 'GATE-MOBILE-L15-THESIS-PRESENT',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: 'L1.5 투자전략(Thesis) 섹션 필수 포함',
    check: async (pkg: MobileIMPackage) => {
      const hasThesis = pkg.sections.some((s) => s.sectionType === 'investment_thesis');
      return {
        status: hasThesis ? 'PASS' : 'FAIL',
        observed: hasThesis,
        expected: true,
        reason: hasThesis ? 'L1.5 핵심 전략 포함됨' : 'L1.5 필수 투자전략 섹션 누락',
      };
    },
  });
}
