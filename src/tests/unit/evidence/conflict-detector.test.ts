import { describe, it, expect } from 'vitest';
import { EvidenceService } from '@/domain/building/im-core/evidence/evidence-service';

describe('Evidence Conflict Detector (PR-B1-01 / Negative-Pair Obligation)', () => {
  it('Positive Pair: Discrepancy <= 0.5% produces NO conflict', () => {
    const service = new EvidenceService();
    const dealId = 'deal-evidence-pos';

    const art1 = service.ingestSourceArtifact(
      dealId,
      'public_registry',
      { landAreaSqm: 1000 },
      'GovRegistry',
      '2026-09-01'
    );
    const art2 = service.ingestSourceArtifact(
      dealId,
      'broker_input',
      { landAreaSqm: 1003 }, // 0.3% discrepancy
      'BrokerAgent',
      '2026-09-02'
    );

    service.extractObservation(art1.id, 'physical.landAreaSqm', 1000, 'confirmed');
    service.extractObservation(art2.id, 'physical.landAreaSqm', 1003, 'confirmed');

    const conflicts = service.detectConflicts(dealId, 'physical.landAreaSqm');
    expect(conflicts.length).toBe(0);
  });

  it('Negative Pair: Discrepancy > 0.5% triggers explicit Conflict record and requires resolution', () => {
    const service = new EvidenceService();
    const dealId = 'deal-evidence-neg';

    const art1 = service.ingestSourceArtifact(
      dealId,
      'public_registry',
      { landAreaSqm: 1000 },
      'GovRegistry',
      '2026-09-01'
    );
    const art2 = service.ingestSourceArtifact(
      dealId,
      'broker_input',
      { landAreaSqm: 1020 }, // 2.0% discrepancy (> 0.5%)
      'BrokerAgent',
      '2026-09-02'
    );

    const obs1 = service.extractObservation(art1.id, 'physical.landAreaSqm', 1000, 'confirmed');
    const obs2 = service.extractObservation(art2.id, 'physical.landAreaSqm', 1020, 'confirmed');

    const conflicts = service.detectConflicts(dealId, 'physical.landAreaSqm');
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].kind).toBe('numeric_threshold');
    expect(conflicts[0].diffPercent).toBe(2);
    expect(conflicts[0].resolution).toBeNull();

    // Verify Human Broker Correction
    const correction = service.applyCorrection(
      dealId,
      obs1.id,
      1000,
      '토지대장 등기부상 면적으로 확정',
      'broker-senior-kim'
    );
    expect(correction.correctedValue).toBe(1000);
    expect(correction.approvedBy).toBe('broker-senior-kim');
  });
});
