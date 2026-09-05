import type { HarnessEvaluator } from '../evaluator';
import type { DealcardPackage } from '@/domain/building/dealcard-publication/banding-engine';

export function registerDealcardBlindProfile(evaluator: HarnessEvaluator): void {
  // 1. GATE-BLIND-PRIVACY
  evaluator.registerRule('P-DEALCARD-BLIND', {
    gateId: 'GATE-BLIND-PRIVACY',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '상세 지번/번지 노출 차단',
    check: async (pkg: DealcardPackage) => {
      const hasBunji = /\d+(?:-\d+)?번지|\d+-\d+/.test(pkg.bandedLocation);
      return {
        status: hasBunji ? 'FAIL' : 'PASS',
        observed: pkg.bandedLocation,
        expected: '일반화된 지역/역세권 표기',
        reason: hasBunji ? '정확한 지번/번지가 노출되어 블라인드 위반' : '위치 블라인드 검증 통과',
      };
    },
  });

  // 2. GATE-PII-EXCLUSION
  evaluator.registerRule('P-DEALCARD-BLIND', {
    gateId: 'GATE-PII-EXCLUSION',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '전화번호 및 개인정보 차단',
    check: async (pkg: DealcardPackage) => {
      const textToScan = [pkg.bandedLocation, ...pkg.highlights].join(' ');
      const hasPhone = /01[0-9]-?\d{3,4}-?\d{4}/.test(textToScan);
      return {
        status: hasPhone ? 'FAIL' : 'PASS',
        observed: hasPhone,
        expected: false,
        reason: hasPhone ? '개인 연락처가 포함되어 발행 차단' : '개인정보 미포함 확인',
      };
    },
  });

  // 3. GATE-NO-FABRICATED-YIELD
  evaluator.registerRule('P-DEALCARD-BLIND', {
    gateId: 'GATE-NO-FABRICATED-YIELD',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '원문 외 임의 수익률 날조 차단',
    check: async (pkg: DealcardPackage & { sourceYieldPresent?: boolean }) => {
      if (pkg.bandedYield && pkg.sourceYieldPresent === false) {
        return {
          status: 'FAIL',
          observed: pkg.bandedYield,
          expected: undefined,
          reason: '원문에 없는 수익률 임의 생성 금지 위반',
        };
      }
      return {
        status: 'PASS',
        observed: pkg.bandedYield ?? '없음',
        expected: '원문 근거 일치',
        reason: '수익률 생성 규칙 준수',
      };
    },
  });

  // 4. GATE-PLACEHOLDER-RESIDUE
  evaluator.registerRule('P-DEALCARD-BLIND', {
    gateId: 'GATE-PLACEHOLDER-RESIDUE',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '템플릿 변수 및 NaN 잔존 검사',
    check: async (pkg: DealcardPackage) => {
      const textToScan = [pkg.bandedLocation, pkg.bandedPrice, pkg.bandedLandArea, ...pkg.highlights].join(' ');
      const hasPlaceholder = /\{\{.*?\}\}|NaN|undefined|null/i.test(textToScan);
      return {
        status: hasPlaceholder ? 'FAIL' : 'PASS',
        observed: hasPlaceholder,
        expected: false,
        reason: hasPlaceholder ? '미치환 템플릿 변수 잔존' : '잔존값 없음',
      };
    },
  });
}
