import { randomUUID, createHash } from 'crypto';
import type {
  SourceArtifact,
  Observation,
  Conflict,
  Correction,
  SourceType,
  ConfidenceKind,
  Locator,
} from './types';
import { reconcilePhysicalAttribute } from '../../common-pipeline/reconciliation';

export class EvidenceService {
  private artifacts: Map<string, SourceArtifact> = new Map();
  private observations: Map<string, Observation> = new Map();
  private conflicts: Map<string, Conflict> = new Map();
  private corrections: Map<string, Correction> = new Map();

  ingestSourceArtifact(
    dealId: string,
    sourceType: SourceType,
    payload: Record<string, unknown>,
    provider?: string,
    asOf?: string
  ): SourceArtifact {
    const rawHash = 'sha256:' + createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const artifact: SourceArtifact = {
      id: randomUUID(),
      dealId,
      sourceType,
      rawHash,
      retrievedAt: new Date().toISOString(),
      asOf,
      provider,
      payload,
    };
    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }

  extractObservation<T = unknown>(
    sourceArtifactId: string,
    fieldPath: string,
    observedValue: T,
    confidence: ConfidenceKind = 'confirmed',
    position?: { start: number; end: number }
  ): Observation<T> {
    const artifact = this.artifacts.get(sourceArtifactId);
    if (!artifact) {
      throw new Error(`SOURCE_ARTIFACT_NOT_FOUND: Artifact ${sourceArtifactId} does not exist`);
    }

    const locator: Locator = {
      sourceArtifactId,
      fieldPath,
      position,
    };

    const observation: Observation<T> = {
      id: randomUUID(),
      sourceArtifactId,
      fieldPath,
      observedValue,
      confidence,
      asOf: artifact.asOf,
      locator,
    };

    this.observations.set(observation.id, observation as Observation);
    return observation;
  }

  detectConflicts(dealId: string, fieldPath: string): Conflict[] {
    const dealArtifactIds = new Set(
      Array.from(this.artifacts.values())
        .filter((a) => a.dealId === dealId)
        .map((a) => a.id)
    );

    const targetObservations = Array.from(this.observations.values()).filter(
      (o) => dealArtifactIds.has(o.sourceArtifactId) && o.fieldPath === fieldPath
    );

    if (targetObservations.length < 2) {
      return [];
    }

    const detected: Conflict[] = [];

    // Pairwise comparison
    for (let i = 0; i < targetObservations.length; i++) {
      for (let j = i + 1; j < targetObservations.length; j++) {
        const left = targetObservations[i];
        const right = targetObservations[j];

        if (typeof left.observedValue === 'number' && typeof right.observedValue === 'number') {
          const lVal = left.observedValue as number;
          const rVal = right.observedValue as number;

          const base = Math.min(lVal, rVal);
          const diffPct = base > 0 ? (Math.abs(lVal - rVal) / base) * 100 : 0;

          if (diffPct > 0.5) {
            const conflict: Conflict = {
              id: randomUUID(),
              dealId,
              kind: 'numeric_threshold',
              leftObservationId: left.id,
              rightObservationId: right.id,
              diffPercent: Math.round(diffPct * 100) / 100,
              resolution: null,
              createdAt: new Date().toISOString(),
            };
            this.conflicts.set(conflict.id, conflict);
            detected.push(conflict);
          }
        } else if (left.observedValue !== right.observedValue) {
          const conflict: Conflict = {
            id: randomUUID(),
            dealId,
            kind: 'categorical_mismatch',
            leftObservationId: left.id,
            rightObservationId: right.id,
            resolution: null,
            createdAt: new Date().toISOString(),
          };
          this.conflicts.set(conflict.id, conflict);
          detected.push(conflict);
        }
      }
    }

    return detected;
  }

  applyCorrection<T = unknown>(
    dealId: string,
    originalObservationId: string,
    correctedValue: T,
    reason: string,
    approvedBy?: string
  ): Correction<T> {
    const original = this.observations.get(originalObservationId);
    if (!original) {
      throw new Error(`OBSERVATION_NOT_FOUND: Observation ${originalObservationId} not found`);
    }

    const correction: Correction<T> = {
      id: randomUUID(),
      dealId,
      originalObservationId,
      correctedValue,
      reason,
      approvedBy,
      approvedAt: approvedBy ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    };

    this.corrections.set(correction.id, correction as Correction);
    return correction;
  }

  getDealEvidence(dealId: string) {
    const dealArtifacts = Array.from(this.artifacts.values()).filter((a) => a.dealId === dealId);
    const dealArtifactIds = new Set(dealArtifacts.map((a) => a.id));

    const dealObservations = Array.from(this.observations.values()).filter((o) =>
      dealArtifactIds.has(o.sourceArtifactId)
    );

    const dealConflicts = Array.from(this.conflicts.values()).filter((c) => c.dealId === dealId);
    const dealCorrections = Array.from(this.corrections.values()).filter((c) => c.dealId === dealId);

    return {
      dealId,
      artifacts: dealArtifacts,
      observations: dealObservations,
      conflicts: dealConflicts,
      corrections: dealCorrections,
    };
  }
}
