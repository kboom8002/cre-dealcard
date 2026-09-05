import { describe, it, expect } from 'vitest';
import { ClaimEvaluationEngine } from '@/domain/building/im-core/claims/evaluation-engine';

describe('ClaimEvaluationEngine (PR-B1-04 / Negative-Pair Obligation)', () => {
  it('Positive Pair: Linear formula chain evaluates deterministically and preserves lineage', () => {
    const engine = new ClaimEvaluationEngine();

    // monthlyRent + adminFee -> grossMonthlyIncome
    engine.registerFormula({
      formulaId: 'F-GROSS-MONTHLY',
      version: '1.0.0',
      inputs: ['monthly_rent', 'admin_fee'],
      outputSubject: 'gross_monthly_income',
      calculate: (inp) => inp.monthly_rent + inp.admin_fee,
      unit: 'KRW',
      basisLabel: '임대료와 관리비 합계',
    });

    // grossMonthlyIncome * 12 -> annualGrossIncome
    engine.registerFormula({
      formulaId: 'F-ANNUAL-GROSS',
      version: '1.0.0',
      inputs: ['gross_monthly_income'],
      outputSubject: 'annual_gross_income',
      calculate: (inp) => inp.gross_monthly_income * 12,
      unit: 'KRW',
      basisLabel: '연간 총수입',
    });

    const evaluated = engine.evaluate({
      monthly_rent: { value: 30000000, status: 'confirmed' },
      admin_fee: { value: 3000000, status: 'confirmed' },
    });

    expect(evaluated.gross_monthly_income.value).toBe(33000000);
    expect(evaluated.annual_gross_income.value).toBe(396000000);
    expect(evaluated.annual_gross_income.status).toBe('inferred');
    expect(evaluated.annual_gross_income.lineage?.formulaId).toBe('F-ANNUAL-GROSS');
  });

  it('Negative Pair: Circular formula dependencies are detected and blocked at registration', () => {
    const engine = new ClaimEvaluationEngine();

    // A depends on B
    engine.registerFormula({
      formulaId: 'F-A',
      version: '1.0.0',
      inputs: ['B'],
      outputSubject: 'A',
      calculate: (inp) => inp.B * 2,
      unit: 'KRW',
      basisLabel: 'A 공식',
    });

    // B depends on A -> Cycle!
    expect(() =>
      engine.registerFormula({
        formulaId: 'F-B',
        version: '1.0.0',
        inputs: ['A'],
        outputSubject: 'B',
        calculate: (inp) => inp.A + 10,
        unit: 'KRW',
        basisLabel: 'B 공식',
      })
    ).toThrowError(/CIRCULAR_FORMULA_CYCLE/);
  });
});
