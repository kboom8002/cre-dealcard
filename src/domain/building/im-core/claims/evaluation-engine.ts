import { validateNoFormulaCycles, type FormulaDefinition } from './formula-registry';

export type ClaimUseStatus =
  | 'confirmed'
  | 'inferred'
  | 'unverified'
  | 'conflict'
  | 'not_available'
  | 'not_evaluated';

export interface EvaluatedClaim {
  subject: string;
  value: number;
  unit: string;
  basisLabel: string;
  status: ClaimUseStatus;
  lineage?: {
    formulaId: string;
    inputsUsed: Record<string, number>;
    calculatedAt: string;
  };
}

export class ClaimEvaluationEngine {
  private formulas: Map<string, FormulaDefinition> = new Map();

  registerFormula(formula: FormulaDefinition): void {
    const list = Array.from(this.formulas.values());
    validateNoFormulaCycles([...list, formula]);
    this.formulas.set(formula.outputSubject, formula);
  }

  evaluate(
    baseClaims: Record<string, { value: number; status: ClaimUseStatus }>
  ): Record<string, EvaluatedClaim> {
    const results: Record<string, EvaluatedClaim> = {};

    // 1. Seed base claims
    for (const [subj, data] of Object.entries(baseClaims)) {
      results[subj] = {
        subject: subj,
        value: data.value,
        unit: 'KRW',
        basisLabel: '원천 관측값',
        status: data.status,
      };
    }

    // 2. Evaluate registered formulas
    for (const [outputSubject, formula] of this.formulas.entries()) {
      const inputValues: Record<string, number> = {};
      let isUnverified = false;
      let isMissing = false;

      for (const reqInput of formula.inputs) {
        const claim = results[reqInput];
        if (!claim) {
          isMissing = true;
          break;
        }
        if (claim.status === 'unverified' || claim.status === 'not_available' || claim.status === 'conflict') {
          isUnverified = true;
        }
        inputValues[reqInput] = claim.value;
      }

      if (isMissing) {
        results[outputSubject] = {
          subject: outputSubject,
          value: 0,
          unit: formula.unit,
          basisLabel: formula.basisLabel,
          status: 'not_available',
        };
        continue;
      }

      const calculatedValue = formula.calculate(inputValues);
      const status: ClaimUseStatus = isUnverified ? 'unverified' : 'inferred';

      results[outputSubject] = {
        subject: outputSubject,
        value: calculatedValue,
        unit: formula.unit,
        basisLabel: formula.basisLabel,
        status,
        lineage: {
          formulaId: formula.formulaId,
          inputsUsed: inputValues,
          calculatedAt: new Date().toISOString(),
        },
      };
    }

    return results;
  }
}
