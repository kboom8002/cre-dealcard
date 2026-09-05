import { randomUUID } from 'crypto';
import {
  type GateResultV2,
  type GateResultStatus,
  type GateSeverity,
  isGateBlockingPublish,
} from '@/types/gate-result';
import { computeTargetHash } from '@/domain/building/im-core/target-hash';

export interface GateRule {
  gateId: string;
  version: string;
  severity: GateSeverity;
  description: string;
  check: (context: any) => Promise<{ status: GateResultStatus; observed: unknown; expected: unknown; reason: string }>;
}

export interface GateReport {
  reportId: string;
  artifactRunId: string;
  profile: string;
  allRun: boolean;
  blockerCount: number;
  results: GateResultV2[];
  reportHash: string;
  ruleRegistryVersion: string;
  evaluatedAt: string;
}

export class HarnessEvaluator {
  private rules = new Map<string, GateRule[]>();
  private registryVersion: string;

  constructor(registryVersion = '2026-08-31') {
    this.registryVersion = registryVersion;
  }

  registerRule(profile: string, rule: GateRule): void {
    const list = this.rules.get(profile) ?? [];
    list.push(rule);
    this.rules.set(profile, list);
  }

  async evaluateProfile(
    profile: string,
    artifactRunId: string,
    context: any,
    targetArtifactHash?: string
  ): Promise<GateReport> {
    const profileRules = this.rules.get(profile) ?? [];
    const results: GateResultV2[] = [];

    for (const rule of profileRules) {
      const startTime = Date.now();
      try {
        const checkResult = await rule.check(context);
        results.push({
          gateId: rule.gateId,
          version: rule.version,
          status: checkResult.status,
          severity: rule.severity,
          observed: checkResult.observed,
          expected: checkResult.expected,
          reason: checkResult.reason,
          observerVersion: rule.version,
          targetArtifactHash,
          executedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        });
      } catch (err: any) {
        results.push({
          gateId: rule.gateId,
          version: rule.version,
          status: 'SYSTEM_ERROR',
          severity: rule.severity,
          observed: 'EXCEPTION',
          expected: 'NORMAL_EXECUTION',
          reason: `예외 발생: ${err.message}`,
          observerVersion: rule.version,
          targetArtifactHash,
          executedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        });
      }
    }

    const blockerCount = results.filter(isGateBlockingPublish).length;
    const allRun = results.every((r) => r.status !== 'NOT_RUN');

    const reportId = randomUUID();
    const evaluatedAt = new Date().toISOString();

    const reportHash = computeTargetHash({
      body: { reportId, artifactRunId, profile, results },
      releaseTier: 'report',
      policyVersion: this.registryVersion,
    });

    return {
      reportId,
      artifactRunId,
      profile,
      allRun,
      blockerCount,
      results,
      reportHash,
      ruleRegistryVersion: this.registryVersion,
      evaluatedAt,
    };
  }
}
