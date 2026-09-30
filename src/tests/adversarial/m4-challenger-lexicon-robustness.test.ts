import { describe, it, expect } from 'vitest';
import { normalizeGeneratedMarkdown, normalizeTerminology } from '@/domain/building/mobile-im/terminology-normalizer';
import { getPosturePromptOverlay } from '@/domain/building/mobile-im/posture-prompts';
import { GOLDEN_IM_EXAMPLES_BY_POSTURE } from '@/domain/building/mobile-im/narrative-prompt';
import { generateInvestorCopyBlock, getD56InstitutionalSectionTitle } from '@/domain/building/mobile-im/investor-copywriting';
import { generatePremiumTemplate } from '@/domain/building/mobile-im/premium-template-engine';
import { formatFinancialsMarkdown, calculateFinancials } from '@/domain/building/mobile-im/financials';
import { formatNetCashFlowMarkdown, calculateNetCashFlow } from '@/domain/building/mobile-im/net-cash-flow-calculator';
import type { InvestmentPosture } from '@/domain/ontology';
import type { MobileIMSectionType } from '@/domain/building/mobile-im/types';

describe('Milestone 4 Adversarial Challenge: Persona, Colloquialisms & Normalizer Robustness', () => {
  const POSTURES: InvestmentPosture[] = ['income', 'development', 'operating', 'owner_occupied', 'trading'];

  const FORBIDDEN_PERSONAS = [
    '60대 자산가',
    '은퇴 자산가',
    '자녀 세대 가업승계용',
    '법인 대표 맞춤',
    '가업승계',
    '초보 투자자용',
  ];

  const FORBIDDEN_COLLOQUIALISMS = [
    '내 돈',
    '세입자',
    '원금 안전판',
    '땅값 비중',
  ];

  const FORBIDDEN_HYPE_WORDS = [
    '완벽한',
    '무조건',
    '초안정',
    '우량',
    '극대화',
  ];

  describe('1. Posture Prompts Overlay Leakage Check', () => {
    const SECTIONS = ['income_analysis', 'investment_thesis', 'occupancy_fit', 'cost_comparison', 'site_analysis', 'development_feasibility', 'operation_overview', 'gop_analysis', 'market_position', 'comparable_analysis'];

    it('posture-prompts overlays must NOT contain persona leaks', () => {
      const violations: string[] = [];
      for (const posture of POSTURES) {
        for (const section of SECTIONS) {
          const overlay = getPosturePromptOverlay(posture, section);
          if (!overlay) continue;
          for (const persona of FORBIDDEN_PERSONAS) {
            // Note: If prompt contains "페르소나 지칭 문구를 절대 쓰지 마세요", that's a negative constraint
            // But if it instructs the model to USE it or mentions positive persona phrases:
            if (overlay.includes('가업승계 핵심 자산화') || overlay.includes('가업승계 자산')) {
              violations.push(`[${posture}:${section}] Prompts LLM with positive persona: ${persona}`);
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('posture-prompts overlays must NOT contain banned colloquial terms as instructions', () => {
      const violations: string[] = [];
      for (const posture of POSTURES) {
        for (const section of SECTIONS) {
          const overlay = getPosturePromptOverlay(posture, section);
          if (!overlay) continue;
          if (overlay.includes('실투자금(내 돈)') || overlay.includes('내 돈 대비')) {
            violations.push(`[${posture}:${section}] Prompts LLM with colloquial "내 돈"`);
          }
          if (overlay.includes('원금 안전판:') || overlay.includes('원금 하방 경직성(안전판)')) {
            violations.push(`[${posture}:${section}] Prompts LLM with colloquial "원금 안전판"`);
          }
          if (overlay.includes('땅값 비율')) {
            violations.push(`[${posture}:${section}] Prompts LLM with colloquial "땅값"`);
          }
          if (overlay.includes('우량 테넌트')) {
            violations.push(`[${posture}:${section}] Prompts LLM with banned "우량 테넌트"`);
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('posture-prompts overlays must NOT instruct LLM to use ungrounded hype "극대화"', () => {
      const violations: string[] = [];
      for (const posture of POSTURES) {
        for (const section of SECTIONS) {
          const overlay = getPosturePromptOverlay(posture, section);
          if (!overlay) continue;
          if (overlay.includes('극대화')) {
            violations.push(`[${posture}:${section}] Uses banned hype word "극대화"`);
          }
        }
      }
      expect(violations).toEqual([]);
    });
  });

  describe('2. Financials & NetCashFlow Raw Table Generators', () => {
    it('formatFinancialsMarkdown must NOT output "내 돈" in table headers/labels', () => {
      const fin = calculateFinancials({
        purchasePriceKrw: 10000000000,
        askingPriceManwon: 1000000,
        posture: 'income',
        loanAmountManwon: 600000,
        totalDepositManwon: 100000,
        annualRentManwon: 48000,
        annualNoiManwon: 40000,
      });
      const md = formatFinancialsMarkdown(fin);
      expect(md).not.toContain('내 돈');
    });

    it('formatFinancialsMarkdown across all 5 postures must NOT contain "내 돈"', () => {
      const violations: string[] = [];
      for (const posture of POSTURES) {
        const fin = calculateFinancials({
          purchasePriceKrw: 15000000000,
          askingPriceManwon: 1500000,
          posture,
          loanAmountManwon: 800000,
          totalDepositManwon: 150000,
          annualRentManwon: 60000,
          annualNoiManwon: 50000,
          gopKrw: 800000000,
          landPricePerPyeong: 45000000,
          devProfitMarginPct: 18.5,
          marketDiscountPct: 12,
        });
        const md = formatFinancialsMarkdown(fin);
        if (md.includes('내 돈')) {
          violations.push(`[${posture}] formatFinancialsMarkdown contains "내 돈": ${md.slice(0, 100)}`);
        }
      }
      expect(violations).toEqual([]);
    });

    it('formatNetCashFlowMarkdown must NOT output "내 돈"', () => {
      const ncf = calculateNetCashFlow({
        purchasePriceKrw: 10000000000,
        monthlyRentKrw: 30000000,
        totalDepositKrw: 1000000000,
        loanAmountKrw: 6000000000,
        landPriceTotalKrw: 6500000000,
      });
      expect(ncf).not.toBeNull();
      const md = formatNetCashFlowMarkdown(ncf!);
      expect(md).not.toContain('내 돈');
    });
  });

  describe('3. Premium Template Engine Scanner', () => {
    const ALL_SECTIONS: MobileIMSectionType[] = [
      'property_overview',
      'location_access',
      'lease_status',
      'income_analysis',
      'risk_check',
      'investment_thesis',
      'next_steps',
      'occupancy_fit',
      'cost_comparison',
      'site_analysis',
      'development_feasibility',
      'operation_overview',
      'gop_analysis',
      'market_position',
      'comparable_analysis',
      'title_rights',
      'land_detail',
      'comparables',
      'decision_snapshot',
      'market_rent_gap',
      'value_add_plan',
      'stabilized_scenario',
      'evidence_status',
      'checklist',
      'closing',
    ];

    it('generatePremiumTemplate outputs must NOT contain persona leaks across all postures and sections', () => {
      const violations: string[] = [];
      const dummyAsset = { price_band: '120억 원', area_signal: '강남구 역삼동', asset_type: '근생빌딩' };
      const dummyPhysical = { plat_area_pyung: 100, total_area_pyung: 300, floors: '지하 1층 / 지상 5층' };
      const dummyMarket = { station_name: '역삼역', distance_m: 350 };
      const dummyBuyer = { target_yield: 4.5 };
      const dummySupp = { asking_price_manwon: 1200000, monthly_rent_total_krw: 35000000, total_deposit_manwon: 100000 };

      for (const posture of POSTURES) {
        for (const sec of ALL_SECTIONS) {
          const md = generatePremiumTemplate(sec, dummyAsset, dummyPhysical, dummyMarket, dummyBuyer, dummySupp, null, undefined, posture);
          for (const persona of FORBIDDEN_PERSONAS) {
            if (md.includes(persona)) {
              violations.push(`[${posture}:${sec}] Leaked persona "${persona}"`);
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('generatePremiumTemplate outputs must NOT contain banned colloquialisms across all postures and sections', () => {
      const violations: string[] = [];
      const dummyAsset = { price_band: '120억 원', area_signal: '강남구 역삼동', asset_type: '근생빌딩' };
      const dummyPhysical = { plat_area_pyung: 100, total_area_pyung: 300, floors: '지하 1층 / 지상 5층' };
      const dummyMarket = { station_name: '역삼역', distance_m: 350 };
      const dummyBuyer = { target_yield: 4.5 };
      const dummySupp = { asking_price_manwon: 1200000, monthly_rent_total_krw: 35000000, total_deposit_manwon: 100000 };

      for (const posture of POSTURES) {
        for (const sec of ALL_SECTIONS) {
          const md = generatePremiumTemplate(sec, dummyAsset, dummyPhysical, dummyMarket, dummyBuyer, dummySupp, null, undefined, posture);
          for (const term of FORBIDDEN_COLLOQUIALISMS) {
            if (md.includes(term)) {
              violations.push(`[${posture}:${sec}] Leaked colloquial term "${term}"`);
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });
  });

  describe('4. Normalizer Robustness, Idempotence & Stress Testing', () => {
    it('Normalizer Idempotence: f(f(x)) === f(x) for common CRE phrases', () => {
      const inputs = [
        '본 자산은 역세권 입지에 위치합니다.',
        '초역세권 매물로 접근성이 우수합니다.',
        '내 돈 20억 투입 시 자기자본수익률 양호',
        '원금 안전판이 확보된 알짜 매물',
        '60대 자산가를 위한 안정적 현금흐름',
        '세입자 명도 조건부 매매',
        '임대차 명세서 및 등기부등본 확인 완료',
        '평당 5,000만원 매매 희망가',
        '불법 건축물 여부 확인 필요',
      ];

      const idempotenceFailures: { input: string; pass1: string; pass2: string }[] = [];
      for (const text of inputs) {
        const pass1 = normalizeGeneratedMarkdown(text);
        const pass2 = normalizeGeneratedMarkdown(pass1);
        if (pass1 !== pass2) {
          idempotenceFailures.push({ input: text, pass1, pass2 });
        }
      }
      expect(idempotenceFailures).toEqual([]);
    });

    it('Normalizer should not create repetitive artifact "(자기자본수익률)(자기자본수익률)"', () => {
      const input = '| **내 돈 대비 수익률(자기자본수익률)** | **7.5%** |';
      const output = normalizeGeneratedMarkdown(input);
      console.log('ACTUAL OUTPUT FOR DUPLICATION TEST:', output);
      expect(output).toBe('| **자기자본수익률(Leveraged Yield)** | **7.5%** |');
    });

    it('Normalizer must strip or normalize "가업승계 핵심 자산화" from posture prompt', () => {
      const input = '• 가업승계 자산 기반: 사옥 소유를 통한 기업 신용도 제고 및 가업승계 핵심 자산화';
      const output = normalizeGeneratedMarkdown(input);
      console.log('ACTUAL OUTPUT FOR 가업승계:', output);
      expect(output).not.toContain('가업승계');
    });

    it('Normalizer handles hostile/adversarial inputs gracefully without crash', () => {
      const edgeInputs = [
        '', // empty
        '   \n\n  \t  ', // whitespace
        '🔥대박!! 꿀매물!! 60대 자산가 맞춤 완벽한 투자처! 내 돈 5억으로 월세 1000만원 보장!!',
        '역세권역세권역세권초역세권역세권',
        '평당 1억 평당가 1억 평당 3.3㎡당 평당가',
        '세입자/임차인/임대인/집주인/건물주',
        '<div><script>alert("내 돈")</script>내 돈 10억</div>',
        'A'.repeat(50000), // large string
      ];

      for (const input of edgeInputs) {
        expect(() => normalizeGeneratedMarkdown(input)).not.toThrow();
        const res = normalizeGeneratedMarkdown(input);
        expect(typeof res).toBe('string');
      }
    });

    it('Messy broker speech full text conversion check', () => {
      const rawBrokerText = `
이 빌딩은 60대 자산가용 맞춤 알짜 매물입니다.
역세권 도보 3분이고 초역세권이라 입지가 최고의 자리입니다.
세입자들이 돈 잘 내는 임차인들로 꽉 차서 만실 상태입니다.
집주인이 급매로 내놓았고 네고 가능한 꿀매물입니다.
내 돈 30억 들어가면 원금 안전판 확실하고 내 돈 대비 연 수익률 8% 나옵니다.
등기부등본 깨끗하고 불법건축물 없으며 투자의향서 제출 시 바로 미팅 가능합니다.
      `.trim();

      const normalized = normalizeGeneratedMarkdown(rawBrokerText);

      // Verify all colloquialisms converted
      expect(normalized).not.toContain('60대 자산가');
      expect(normalized).not.toContain('내 돈');
      expect(normalized).not.toContain('세입자');
      expect(normalized).not.toContain('집주인');
      expect(normalized).not.toContain('급매');
      expect(normalized).not.toContain('꿀매물');
      expect(normalized).not.toContain('만실');
      expect(normalized).not.toContain('원금 안전판');
      expect(normalized).not.toContain('등기부등본');
      expect(normalized).not.toContain('불법건축물');
      expect(normalized).not.toContain('투자의향서');
    });
  });
});
