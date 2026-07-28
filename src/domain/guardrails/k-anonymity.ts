/**
 * CREDEAL v3 K-Anonymity Re-identification Simulator (S3-T9)
 * 
 * Prevents publishing blind teasers if public property candidates < K threshold.
 * Uses differential K thresholds: K=30 for high-density districts (Gangnam, Seocho, Seongdong), K=20 default.
 */

export interface KAnonymityCheckInput {
  districtName: string; // e.g. '강남구', '서초구', '성동구', '마포구'
  totalCandidateCountInPublicDb: number;
}

export interface KAnonymityCheckResult {
  passed: boolean;
  requiredK: number;
  candidateCount: number;
  status: 'safe' | 'blocked_reident_risk';
  reason: string;
}

const HIGH_DENSITY_DISTRICTS = ['강남구', '서초구', '성동구'];

export function getKThresholdForDistrict(districtName: string): number {
  if (HIGH_DENSITY_DISTRICTS.includes(districtName)) {
    return 30; // High-density CRE transactions -> stricter K
  }
  return 20;   // Default standard K
}

export function evaluateKAnonymity(input: KAnonymityCheckInput): KAnonymityCheckResult {
  const requiredK = getKThresholdForDistrict(input.districtName);
  const passed = input.totalCandidateCountInPublicDb >= requiredK;

  if (!passed) {
    return {
      passed: false,
      requiredK,
      candidateCount: input.totalCandidateCountInPublicDb,
      status: 'blocked_reident_risk',
      reason: `[KAnonymityViolation] Candidate count (${input.totalCandidateCountInPublicDb}) in ${input.districtName} is below safety threshold K=${requiredK}. Teaser publishing blocked to prevent physical property re-identification.`,
    };
  }

  return {
    passed: true,
    requiredK,
    candidateCount: input.totalCandidateCountInPublicDb,
    status: 'safe',
    reason: `[KAnonymityPassed] Candidate count (${input.totalCandidateCountInPublicDb}) meets safety threshold K=${requiredK}.`,
  };
}
