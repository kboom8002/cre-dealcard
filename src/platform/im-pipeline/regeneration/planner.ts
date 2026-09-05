import { randomUUID } from 'crypto';
import { InvalidationEngine, type ChangeKind } from './invalidation-engine';

export interface RegenerationPlan {
  planId: string;
  changeEventId: string;
  changeKind: ChangeKind;
  reusableStageOutputs: string[];
  requiredRerunStages: string[];
  invalidatedApprovalIds: string[];
  estimatedDurationMs: number;
  estimatedTokenCost: number;
}

export function createRegenerationPlan(
  dealId: string,
  changeKind: ChangeKind,
  existingCompletedStages: string[] = ['P10', 'P20', 'P30', 'P40', 'P50', 'P60', 'M10', 'M20', 'S30', 'S70']
): RegenerationPlan {
  const engine = new InvalidationEngine();
  const scope = engine.resolveScope(changeKind);

  const affected = new Set(scope.affectedStages);
  const reusable = existingCompletedStages.filter((s) => !affected.has(s));
  const required = existingCompletedStages.filter((s) => affected.has(s));

  const planId = randomUUID();
  const changeEventId = `change-${randomUUID().slice(0, 8)}`;

  return {
    planId,
    changeEventId,
    changeKind,
    reusableStageOutputs: reusable,
    requiredRerunStages: required.length > 0 ? required : scope.affectedStages,
    invalidatedApprovalIds: scope.requiresFullReapproval ? [`appr-${dealId}-prior`] : [],
    estimatedDurationMs: Math.max(100, scope.affectedStages.length * 350),
    estimatedTokenCost: scope.affectedStages.some((s) => s.includes('M20') || s.includes('S20'))
      ? 500
      : 0,
  };
}
