import { randomUUID } from 'crypto';
import type { EffectiveSnapshot } from '../evidence/effective-snapshot';
import type { EvaluatedClaim } from '../claims/evaluation-engine';
import type { ProposalUnit } from '../proposals/proposal-unit';
import type { PhotoAsset } from '../proposals/photo-asset-manager';
import type { RentrollTier } from '../evidence/rentroll-tier-engine';
import type { Conflict } from '../evidence/types';
import { EligibilityChecker } from './eligibility-checker';
import { computeTargetHash } from '../target-hash';

export interface PublicationPackage {
  packageId: string;
  dealId: string;
  snapshotHash: string;
  claimsHash: string;
  packageHash: string;
  level: 'L1' | 'L1.5' | 'L2' | 'L3';
  snapshot: EffectiveSnapshot;
  claims: Record<string, EvaluatedClaim>;
  proposals: ProposalUnit[];
  photos: PhotoAsset[];
  harnessReportId?: string;
  createdAt: string;
}

export class PublicationPackageBuilder {
  private checker = new EligibilityChecker();

  build(params: {
    dealId: string;
    targetLevel: 'L1' | 'L1.5' | 'L2' | 'L3';
    snapshot: EffectiveSnapshot;
    claims: Record<string, EvaluatedClaim>;
    proposals?: ProposalUnit[];
    photos?: PhotoAsset[];
    rentrollTier?: RentrollTier;
    conflicts?: Conflict[];
  }): PublicationPackage {
    const proposals = params.proposals ?? [];
    const photos = params.photos ?? [];
    const conflicts = params.conflicts ?? [];
    const rentrollTier = params.rentrollTier ?? 'none';

    // 1. Eligibility Check
    const eligibility = this.checker.checkEligibility(
      params.snapshot,
      proposals,
      rentrollTier,
      conflicts
    );

    if (!eligibility.eligibleLevels.includes(params.targetLevel)) {
      const reasons = eligibility.disqualifications[params.targetLevel]?.join(', ') ?? '자격 미달';
      throw new Error(
        `ELIGIBILITY_CHECK_FAILED: Deal ${params.dealId} is not eligible for ${params.targetLevel} (${reasons})`
      );
    }

    // 2. Hash bindings
    const packageId = randomUUID();
    const createdAt = new Date().toISOString();

    const claimsHash = computeTargetHash({
      body: params.claims,
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    });

    const packageHash = computeTargetHash({
      body: {
        packageId,
        dealId: params.dealId,
        snapshotHash: params.snapshot.snapshotHash,
        claimsHash,
        targetLevel: params.targetLevel,
        createdAt,
      },
      releaseTier: params.targetLevel === 'L1.5' ? 'decision_im' : 'fact_om',
      policyVersion: '2026-08-31',
    });

    return {
      packageId,
      dealId: params.dealId,
      snapshotHash: params.snapshot.snapshotHash,
      claimsHash,
      packageHash,
      level: params.targetLevel,
      snapshot: params.snapshot,
      claims: params.claims,
      proposals,
      photos,
      createdAt,
    };
  }
}
