import { HarnessEvaluator, type GateReport } from '@/assurance/im-harness/evaluator';
import { registerMobileIMProfiles } from '@/assurance/im-harness/profiles/mobile-profile';
import type { MobileDraftSection } from './m20-draft-version';

export async function executeM30GateReport(
  dealId: string,
  targetLevel: 'L1' | 'L1.5',
  sections: MobileDraftSection[]
): Promise<GateReport> {
  const evaluator = new HarnessEvaluator('2026-08-31');
  registerMobileIMProfiles(evaluator);

  const profile = targetLevel === 'L1.5' ? 'P-MOBILE-L15' : 'P-MOBILE-L1';

  // Prepare harness context matching MobileIMPackage
  const mockPkg = {
    dealId,
    sections,
  };

  const report = await evaluator.evaluateProfile(profile, `m30-${dealId}`, mockPkg);

  if (report.blockerCount > 0) {
    const reasons = report.results
      .filter((r) => r.status === 'FAIL' && r.severity === 'BLOCKER')
      .map((r) => `${r.gateId}: ${r.reason}`)
      .join(', ');
    throw new Error(`M30_GATE_BLOCKED: 모바일 IM 품질 게이트 차단 (${reasons})`);
  }

  return report;
}
