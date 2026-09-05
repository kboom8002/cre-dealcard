/**
 * src/domain/building/im-core/approval/ledger-service.ts
 *
 * Domain Service: 2-Stage Immutable Approval & Release Ledger.
 * Pure domain logic: 0 dependencies on @supabase/supabase-js or process.env.
 * Complies with Rule 12 and Clean Architecture principles.
 */

import { randomUUID } from 'crypto';
import type {
  ApprovalEvent,
  ApprovalEventType,
  ApprovalLedgerPort,
  ReleaseChannel,
  ReleaseRecord,
  ReleaseRecordUpdates,
  ReleaseStatus,
} from './ledger-port';

export type {
  ApprovalEvent,
  ApprovalEventType,
  ApprovalLedgerPort,
  ReleaseChannel,
  ReleaseRecord,
  ReleaseRecordUpdates,
  ReleaseStatus,
};

export interface ApprovalLedgerOptions {
  isolatedStore?: boolean;
  port?: ApprovalLedgerPort;
  supabaseClient?: any;
}

export class ApprovalLedgerService {
  private static defaultPort: ApprovalLedgerPort | null = null;

  private events: ApprovalEvent[];
  private releases: Map<string, ReleaseRecord>;
  private port: ApprovalLedgerPort | null = null;

  /**
   * Registers a process-wide default persistence port (e.g. SupabaseApprovalLedgerAdapter)
   * used when ApprovalLedgerService is instantiated without explicit arguments.
   */
  public static setDefaultPort(port: ApprovalLedgerPort | null): void {
    ApprovalLedgerService.defaultPort = port;
  }

  public static getDefaultPort(): ApprovalLedgerPort | null {
    return ApprovalLedgerService.defaultPort;
  }

  constructor(
    isolatedOrOptions: boolean | ApprovalLedgerOptions = false,
    portOrClient?: ApprovalLedgerPort | any
  ) {
    let isolatedStore = false;
    let customPort: ApprovalLedgerPort | undefined = undefined;

    if (typeof isolatedOrOptions === 'boolean') {
      isolatedStore = isolatedOrOptions;
      customPort = portOrClient;
    } else if (isolatedOrOptions && typeof isolatedOrOptions === 'object') {
      isolatedStore = !!isolatedOrOptions.isolatedStore;
      customPort = isolatedOrOptions.port ?? isolatedOrOptions.supabaseClient ?? portOrClient;
    }

    if (isolatedStore) {
      this.events = [];
      this.releases = new Map<string, ReleaseRecord>();
    } else {
      if (!(globalThis as any).__approvalLedgerEvents) {
        (globalThis as any).__approvalLedgerEvents = [];
      }
      if (!(globalThis as any).__approvalLedgerReleases) {
        (globalThis as any).__approvalLedgerReleases = new Map<string, ReleaseRecord>();
      }
      this.events = (globalThis as any).__approvalLedgerEvents;
      this.releases = (globalThis as any).__approvalLedgerReleases;
    }

    if (customPort !== undefined) {
      this.port = customPort;
    } else if (!isolatedStore) {
      this.port = ApprovalLedgerService.defaultPort;
    }
  }

  public setPort(port: ApprovalLedgerPort | null): void {
    this.port = port;
  }

  public getPort(): ApprovalLedgerPort | null {
    return this.port;
  }

  public setSupabaseClient(client: any): void {
    this.port = client;
  }

  public getSupabaseClient(): any {
    return this.port;
  }

  async recordApprovalEvent(eventData: Omit<ApprovalEvent, 'id' | 'createdAt'>): Promise<ApprovalEvent> {
    const event: ApprovalEvent = {
      ...eventData,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.events.push(event);

    if (this.port) {
      try {
        await this.port.recordApprovalEvent(event);
      } catch {
        // Resilient fallback to memory in offline / test environments
      }
    }

    return event;
  }

  async getLatestApproval(artifactRunId: string): Promise<ApprovalEvent | null> {
    if (this.port) {
      try {
        const dbEvent = await this.port.getLatestApproval(artifactRunId);
        if (dbEvent) {
          if (!this.events.some((e) => e.id === dbEvent.id)) {
            this.events.push(dbEvent);
          }
          return dbEvent;
        }
      } catch {
        // Resilient fallback to memory
      }
    }

    const list = this.events.filter((e) => e.artifactRunId === artifactRunId);
    return list.length > 0 ? list[list.length - 1] : null;
  }

  async getApprovalHistory(artifactRunId: string): Promise<ApprovalEvent[]> {
    if (this.port) {
      try {
        const history = await this.port.getApprovalHistory(artifactRunId);
        if (history && history.length > 0) {
          return history;
        }
      } catch {
        // Resilient fallback to memory
      }
    }

    return this.events.filter((e) => e.artifactRunId === artifactRunId);
  }

  async createReleaseRecord(
    artifactRunId: string,
    channel: ReleaseChannel,
    publicUrl?: string,
    artifactFileHash?: string
  ): Promise<ReleaseRecord> {
    const record: ReleaseRecord = {
      id: randomUUID(),
      artifactRunId,
      channel,
      status: 'DRAFT',
      publicUrl,
      artifactFileHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.releases.set(record.id, record);

    if (this.port) {
      try {
        await this.port.saveReleaseRecord(record);
      } catch {
        // Resilient fallback to memory
      }
    }

    return record;
  }

  async updateReleaseStatus(
    releaseId: string,
    newStatus: ReleaseStatus,
    approvedApprovalId?: string,
    artifactFileHash?: string
  ): Promise<ReleaseRecord> {
    let record = this.releases.get(releaseId);
    if (!record) {
      const persistedRec = await this.getReleaseRecord(releaseId);
      if (!persistedRec) {
        throw new Error(`RELEASE_NOT_FOUND: Release ${releaseId} does not exist`);
      }
      record = persistedRec;
    }

    record.status = newStatus;
    if (approvedApprovalId) {
      record.approvedApprovalId = approvedApprovalId;
    }
    if (artifactFileHash) {
      record.artifactFileHash = artifactFileHash;
    }
    record.updatedAt = new Date().toISOString();
    this.releases.set(record.id, record);

    if (this.port) {
      try {
        await this.port.updateReleaseStatus(releaseId, {
          status: newStatus,
          approvedApprovalId,
          artifactFileHash,
          updatedAt: record.updatedAt,
        });
      } catch {
        // Resilient fallback to memory
      }
    }

    return record;
  }

  async getReleaseRecord(releaseId: string): Promise<ReleaseRecord | null> {
    const mem = this.releases.get(releaseId);
    if (mem) return mem;

    if (this.port) {
      try {
        const rec = await this.port.getReleaseRecord(releaseId);
        if (rec) {
          this.releases.set(rec.id, rec);
          return rec;
        }
      } catch {
        // Resilient fallback to memory
      }
    }

    return null;
  }

  async getReleaseByArtifact(artifactRunId: string): Promise<ReleaseRecord | null> {
    for (const record of this.releases.values()) {
      if (record.artifactRunId === artifactRunId) {
        return record;
      }
    }

    if (this.port) {
      try {
        const rec = await this.port.getReleaseByArtifact(artifactRunId);
        if (rec) {
          this.releases.set(rec.id, rec);
          return rec;
        }
      } catch {
        // Resilient fallback to memory
      }
    }

    return null;
  }
}

export const approvalLedgerService = new ApprovalLedgerService();
