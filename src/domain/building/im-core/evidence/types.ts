export type SourceType = 'public_registry' | 'broker_input' | 'seller_notice';

export type ConfidenceKind = 'confirmed' | 'inferred' | 'ambiguous';

export interface Locator {
  sourceArtifactId: string;
  fieldPath: string;
  position?: { start: number; end: number };
}

export interface SourceArtifact {
  id: string;
  dealId: string;
  sourceType: SourceType;
  rawHash: string;
  retrievedAt: string;
  asOf?: string;
  provider?: string;
  payload: Record<string, unknown>;
}

export interface Observation<T = unknown> {
  id: string;
  sourceArtifactId: string;
  fieldPath: string;
  observedValue: T;
  confidence: ConfidenceKind;
  asOf?: string;
  locator: Locator;
}

export interface Conflict {
  id: string;
  dealId: string;
  kind: 'numeric_threshold' | 'categorical_mismatch';
  leftObservationId: string;
  rightObservationId: string;
  diffPercent?: number;
  resolution?: Record<string, unknown> | null;
  createdAt: string;
}

export interface Correction<T = unknown> {
  id: string;
  dealId: string;
  originalObservationId: string;
  correctedValue: T;
  reason: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}
