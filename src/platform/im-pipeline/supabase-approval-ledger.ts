/**
 * src/platform/im-pipeline/supabase-approval-ledger.ts
 *
 * Infrastructure Adapter: Supabase PostgreSQL implementation of ApprovalLedgerPort.
 * Encapsulates table schemas ('approval_events', 'release_records'), queries, and
 * snake_case <-> camelCase transformations outside of im-core.
 */

import { createClient } from '@supabase/supabase-js';
import type {
  ApprovalEvent,
  ApprovalLedgerPort,
  ReleaseRecord,
  ReleaseRecordUpdates,
} from '@/domain/building/im-core/approval/ledger-port';
import { ApprovalLedgerService } from '@/domain/building/im-core/approval/ledger-service';

export class SupabaseApprovalLedgerAdapter implements ApprovalLedgerPort {
  private client: any | null = null;

  constructor(client?: any) {
    if (client !== undefined) {
      this.client = client;
    } else {
      this.client = this.initClient();
    }
  }

  private initClient(): any | null {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && key) {
        return createClient(url, key, { auth: { persistSession: false } });
      }
    } catch {
      // Graceful offline fallback
    }
    return null;
  }

  async recordApprovalEvent(event: ApprovalEvent): Promise<void> {
    if (!this.client) return;

    const { error } = await this.client.from('approval_events').insert({
      id: event.id,
      artifact_run_id: event.artifactRunId,
      event_type: event.eventType,
      actor_id: event.actorId ?? null,
      actor_role: event.actorRole ?? null,
      target_hash: event.targetHash,
      harness_report_id: event.harnessReportId ?? null,
      predecessor_approval_id: event.predecessorApprovalId ?? null,
      reason: event.reason ?? null,
      expires_at: event.expiresAt ?? null,
      created_at: event.createdAt,
    });

    if (error) {
      throw new Error(`SUPABASE_APPROVAL_EVENT_INSERT_FAILED: ${error.message}`);
    }
  }

  async getLatestApproval(artifactRunId: string): Promise<ApprovalEvent | null> {
    if (!this.client) return null;

    const { data, error } = await this.client
      .from('approval_events')
      .select('*')
      .eq('artifact_run_id', artifactRunId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      artifactRunId: data.artifact_run_id,
      eventType: data.event_type,
      actorId: data.actor_id ?? undefined,
      actorRole: data.actor_role ?? undefined,
      targetHash: data.target_hash,
      harnessReportId: data.harness_report_id ?? undefined,
      predecessorApprovalId: data.predecessor_approval_id ?? undefined,
      reason: data.reason ?? undefined,
      expiresAt: data.expires_at ?? undefined,
      createdAt: data.created_at,
    };
  }

  async getApprovalHistory(artifactRunId: string): Promise<ApprovalEvent[]> {
    if (!this.client) return [];

    const { data, error } = await this.client
      .from('approval_events')
      .select('*')
      .eq('artifact_run_id', artifactRunId)
      .order('created_at', { ascending: true });

    if (error || !data) return [];

    return data.map((d: any) => ({
      id: d.id,
      artifactRunId: d.artifact_run_id,
      eventType: d.event_type,
      actorId: d.actor_id ?? undefined,
      actorRole: d.actor_role ?? undefined,
      targetHash: d.target_hash,
      harnessReportId: d.harness_report_id ?? undefined,
      predecessorApprovalId: d.predecessor_approval_id ?? undefined,
      reason: d.reason ?? undefined,
      expiresAt: d.expires_at ?? undefined,
      createdAt: d.created_at,
    }));
  }

  async saveReleaseRecord(record: ReleaseRecord): Promise<void> {
    if (!this.client) return;

    const { error } = await this.client.from('release_records').insert({
      id: record.id,
      artifact_run_id: record.artifactRunId,
      channel: record.channel,
      status: record.status,
      public_url: record.publicUrl ?? null,
      artifact_file_hash: record.artifactFileHash ?? null,
      approved_approval_id: record.approvedApprovalId ?? null,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    });

    if (error) {
      throw new Error(`SUPABASE_RELEASE_RECORD_INSERT_FAILED: ${error.message}`);
    }
  }

  async updateReleaseStatus(releaseId: string, updates: ReleaseRecordUpdates): Promise<void> {
    if (!this.client) return;

    const dbUpdates: Record<string, any> = {
      status: updates.status,
      updated_at: updates.updatedAt,
    };
    if (updates.approvedApprovalId) {
      dbUpdates.approved_approval_id = updates.approvedApprovalId;
    }
    if (updates.artifactFileHash) {
      dbUpdates.artifact_file_hash = updates.artifactFileHash;
    }

    const { error } = await this.client
      .from('release_records')
      .update(dbUpdates)
      .eq('id', releaseId);

    if (error) {
      throw new Error(`SUPABASE_RELEASE_RECORD_UPDATE_FAILED: ${error.message}`);
    }
  }

  async getReleaseRecord(releaseId: string): Promise<ReleaseRecord | null> {
    if (!this.client) return null;

    const { data, error } = await this.client
      .from('release_records')
      .select('*')
      .eq('id', releaseId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      artifactRunId: data.artifact_run_id,
      channel: data.channel,
      status: data.status,
      publicUrl: data.public_url ?? undefined,
      artifactFileHash: data.artifact_file_hash ?? undefined,
      approvedApprovalId: data.approved_approval_id ?? undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getReleaseByArtifact(artifactRunId: string): Promise<ReleaseRecord | null> {
    if (!this.client) return null;

    const { data, error } = await this.client
      .from('release_records')
      .select('*')
      .eq('artifact_run_id', artifactRunId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      artifactRunId: data.artifact_run_id,
      channel: data.channel,
      status: data.status,
      publicUrl: data.public_url ?? undefined,
      artifactFileHash: data.artifact_file_hash ?? undefined,
      approvedApprovalId: data.approved_approval_id ?? undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}

/**
 * Factory to create an ApprovalLedgerService pre-configured with the Supabase adapter.
 */
export function createPersistentApprovalLedger(client?: any): ApprovalLedgerService {
  const adapter = new SupabaseApprovalLedgerAdapter(client);
  return new ApprovalLedgerService({ isolatedStore: false, port: adapter });
}
