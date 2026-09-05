import { compareShadowOutputs, type ShadowRunComparison } from './shadow-comparator';

export interface ShadowRunExecutionResult {
  dealId: string;
  comparison: ShadowRunComparison;
  executedAt: string;
  isAcceptable: boolean;
}

export class ShadowDualRunner {
  private history: ShadowRunExecutionResult[] = [];

  async runDualComparison(
    dealId: string,
    legacyOutput: Record<string, any>,
    modernOutput: Record<string, any>
  ): Promise<ShadowRunExecutionResult> {
    const comparison = compareShadowOutputs(dealId, legacyOutput, modernOutput);

    const result: ShadowRunExecutionResult = {
      dealId,
      comparison,
      executedAt: new Date().toISOString(),
      isAcceptable: comparison.allMatch,
    };

    this.history.push(result);
    return result;
  }

  getMetricsSummary(): {
    totalRuns: number;
    perfectMatchRatePct: number;
    recentRuns: ShadowRunExecutionResult[];
  } {
    const total = this.history.length;
    if (total === 0) {
      return { totalRuns: 0, perfectMatchRatePct: 100, recentRuns: [] };
    }

    const matched = this.history.filter((h) => h.isAcceptable).length;
    return {
      totalRuns: total,
      perfectMatchRatePct: Math.round((matched / total) * 10000) / 100,
      recentRuns: this.history.slice(-10),
    };
  }
}
