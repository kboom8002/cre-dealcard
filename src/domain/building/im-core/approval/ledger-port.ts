/**
 * src/domain/building/im-core/approval/ledger-port.ts
 *
 * Pure domain port interface for Approval and Release persistence.
 * Implemented by infrastructure adapters (e.g. SupabaseApprovalLedgerAdapter)
 * or in-memory stores. Zero external dependencies (Rule 12 compliant).
 */

export type ApprovalEventType =
  | 'machine_check'
  | 'human_approve'
  | 'human_reject'
  | 'invalidate'
  | 'withdraw';

export interface ApprovalEvent {
  id: string;
  artifactRunId: string;
  eventType: ApprovalEventType;
  actorId?: string;
  actorRole?: string;
  targetHash: string;
  harnessReportId?: string;
  predecessorApprovalId?: string;
  reason?: string;
  expiresAt?: string;
  createdAt: string;
}

export type ReleaseChannel = 'dealcard' | 'mobile' | 'pptx';

export type ReleaseStatus =
  | 'DRAFT'
  | 'MACHINE_CHECKED'
  | 'HUMAN_APPROVED'
  | 'PUBLISHED'
  | 'STALE'
  | 'WITHDRAWN'
  | 'SUPERSEDED';

export interface ReleaseRecord {
  id: string;
  artifactRunId: string;
  channel: ReleaseChannel;
  status: ReleaseStatus;
  publicUrl?: string;
  artifactFileHash?: string;
  approvedApprovalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseRecordUpdates {
  status: ReleaseStatus;
  approvedApprovalId?: string;
  artifactFileHash?: string;
  updatedAt: string;
}

/**
 * Pure domain port for ledger persistence.
 */
export interface ApprovalLedgerPort {
  /**
   * Persists an approval event to backing storage.
   */
  recordApprovalEvent(event: ApprovalEvent): Promise<void>;

  /**
   * Retrieves the latest approval event for an artifact run.
   */
  getLatestApproval(artifactRunId: string): Promise<ApprovalEvent | null>;

  /**
   * Retrieves the full history of approval events for an artifact run.
   */
  getApprovalHistory(artifactRunId: string): Promise<ApprovalEvent[]>;

  /**
   * Persists a newly created release record.
   */
  saveReleaseRecord(record: ReleaseRecord): Promise<void>;

  /**
   * Updates an existing release record status and metadata.
   */
  updateReleaseStatus(releaseId: string, updates: ReleaseRecordUpdates): Promise<void>;

  /**
   * Retrieves a release record by its release ID.
   */
  getReleaseRecord(releaseId: string): Promise<ReleaseRecord | null>;

  /**
   * Retrieves the most recent release record for an artifact run.
   */
  getReleaseByArtifact(artifactRunId: string): Promise<ReleaseRecord | null>;
}
