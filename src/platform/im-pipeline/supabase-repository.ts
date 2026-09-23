import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type {
  DealRun,
  ArtifactRun,
  StageRun,
  ArtifactEnvelope,
  DealRunTrigger,
  ArtifactType,
} from './types';
import type { PipelineRepository } from './repository';

export class SupabasePipelineRepository implements PipelineRepository {
  private client: any;

  constructor(client?: any) {
    if (client) {
      this.client = client;
    } else {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && key) {
        this.client = createClient(url, key, { auth: { persistSession: false } });
      } else {
        throw new Error('Supabase configuration missing');
      }
    }
  }

  async createDealRun(dealId: string, triggerType: DealRunTrigger, idempotencyKey: string): Promise<DealRun> {
    const { data: existing } = await this.client
      .from('deal_runs')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      return this.mapDealRun(existing);
    }

    const run: DealRun = {
      id: randomUUID(),
      dealId,
      triggerType,
      idempotencyKey,
      status: 'accepted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { error } = await this.client.from('deal_runs').insert({
      id: run.id,
      deal_id: run.dealId,
      trigger_type: run.triggerType,
      idempotency_key: run.idempotencyKey,
      status: run.status,
      created_at: run.createdAt,
      updated_at: run.updatedAt,
    });

    if (error) {
      // Possible race condition constraint violation
      if (error.code === '23505') {
        const { data: retry } = await this.client.from('deal_runs').select('*').eq('idempotency_key', idempotencyKey).single();
        if (retry) return this.mapDealRun(retry);
      }
      throw new Error(`SUPABASE_CREATE_DEAL_RUN_FAILED: ${error.message}`);
    }

    return run;
  }

  async getDealRun(id: string): Promise<DealRun | null> {
    const { data } = await this.client.from('deal_runs').select('*').eq('id', id).maybeSingle();
    return data ? this.mapDealRun(data) : null;
  }

  async getDealRunByIdempotencyKey(key: string): Promise<DealRun | null> {
    const { data } = await this.client.from('deal_runs').select('*').eq('idempotency_key', key).maybeSingle();
    return data ? this.mapDealRun(data) : null;
  }

  async updateDealRunStatus(id: string, status: DealRun['status']): Promise<void> {
    const { error } = await this.client
      .from('deal_runs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`SUPABASE_UPDATE_DEAL_RUN_FAILED: ${error.message}`);
  }

  async createArtifactRun(dealRunId: string, artifactType: ArtifactType): Promise<ArtifactRun> {
    const run: ArtifactRun = {
      id: randomUUID(),
      dealRunId,
      artifactType,
      status: 'accepted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { error } = await this.client.from('artifact_runs').insert({
      id: run.id,
      deal_run_id: run.dealRunId,
      artifact_type: run.artifactType,
      status: run.status,
      created_at: run.createdAt,
      updated_at: run.updatedAt,
    });

    if (error) throw new Error(`SUPABASE_CREATE_ARTIFACT_RUN_FAILED: ${error.message}`);
    return run;
  }

  async getArtifactRun(id: string): Promise<ArtifactRun | null> {
    const { data } = await this.client.from('artifact_runs').select('*').eq('id', id).maybeSingle();
    return data ? this.mapArtifactRun(data) : null;
  }

  async updateArtifactRunStatus(id: string, status: ArtifactRun['status']): Promise<void> {
    const { error } = await this.client
      .from('artifact_runs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`SUPABASE_UPDATE_ARTIFACT_RUN_FAILED: ${error.message}`);
  }

  async getStageRun(artifactRunId: string, stage: string, inputHash: string, ruleVersion: string): Promise<StageRun | null> {
    const { data } = await this.client
      .from('stage_runs')
      .select('*')
      .eq('artifact_run_id', artifactRunId)
      .eq('stage', stage)
      .eq('input_hash', inputHash)
      .eq('rule_version', ruleVersion)
      .maybeSingle();
    return data ? this.mapStageRun(data) : null;
  }

  async recordStageRun(runData: Omit<StageRun, 'id' | 'startedAt'>): Promise<StageRun> {
    const existing = await this.getStageRun(runData.artifactRunId, runData.stage, runData.inputHash, runData.ruleVersion);
    if (existing) return existing;

    const run: StageRun = {
      ...runData,
      id: randomUUID(),
      startedAt: new Date().toISOString(),
    };

    const { error } = await this.client.from('stage_runs').insert({
      id: run.id,
      artifact_run_id: run.artifactRunId,
      stage: run.stage,
      attempt: run.attempt,
      input_hash: run.inputHash,
      rule_version: run.ruleVersion,
      code_version: run.codeVersion,
      output_hash: run.outputHash || null,
      status: run.status,
      error_detail: run.errorDetail || null,
      started_at: run.startedAt,
      finished_at: run.finishedAt || null,
    });

    if (error) {
      if (error.code === '23505') {
        const retry = await this.getStageRun(run.artifactRunId, run.stage, run.inputHash, run.ruleVersion);
        if (retry) return retry;
      }
      throw new Error(`SUPABASE_RECORD_STAGE_RUN_FAILED: ${error.message}`);
    }
    return run;
  }

  async completeStageRun(id: string, outputHash: string): Promise<void> {
    const { error } = await this.client
      .from('stage_runs')
      .update({
        output_hash: outputHash,
        status: 'succeeded',
        finished_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(`SUPABASE_COMPLETE_STAGE_RUN_FAILED: ${error.message}`);
  }

  async failStageRun(id: string, errorDetail: Record<string, unknown>): Promise<void> {
    const { error } = await this.client
      .from('stage_runs')
      .update({
        error_detail: errorDetail,
        status: 'failed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(`SUPABASE_FAIL_STAGE_RUN_FAILED: ${error.message}`);
  }

  async storeEnvelope<T>(envelopeData: Omit<ArtifactEnvelope<T>, 'id' | 'createdAt'>): Promise<ArtifactEnvelope<T>> {
    const { data: existing } = await this.client
      .from('artifact_envelopes')
      .select('*')
      .eq('content_hash', envelopeData.contentHash)
      .maybeSingle();

    if (existing) return this.mapEnvelope<T>(existing);

    const envelope: ArtifactEnvelope<T> = {
      ...envelopeData,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    const { error } = await this.client.from('artifact_envelopes').insert({
      id: envelope.id,
      stage_run_id: envelope.stageRunId,
      artifact_type: envelope.artifactType,
      schema_version: envelope.schemaVersion,
      content_hash: envelope.contentHash,
      parent_hash: envelope.parentHash || null,
      payload: envelope.payload,
      created_at: envelope.createdAt,
    });

    if (error) {
      if (error.code === '23505') {
        const retry = await this.getEnvelopeByHash(envelope.contentHash);
        if (retry) return retry as ArtifactEnvelope<T>;
      }
      throw new Error(`SUPABASE_STORE_ENVELOPE_FAILED: ${error.message}`);
    }
    return envelope;
  }

  async getEnvelope(id: string): Promise<ArtifactEnvelope | null> {
    const { data } = await this.client.from('artifact_envelopes').select('*').eq('id', id).maybeSingle();
    return data ? this.mapEnvelope(data) : null;
  }

  async getEnvelopeByHash(contentHash: string): Promise<ArtifactEnvelope | null> {
    const { data } = await this.client.from('artifact_envelopes').select('*').eq('content_hash', contentHash).maybeSingle();
    return data ? this.mapEnvelope(data) : null;
  }

  private mapDealRun(dbObj: any): DealRun {
    return {
      id: dbObj.id,
      dealId: dbObj.deal_id,
      triggerType: dbObj.trigger_type,
      idempotencyKey: dbObj.idempotency_key,
      status: dbObj.status,
      createdAt: dbObj.created_at,
      updatedAt: dbObj.updated_at,
    };
  }

  private mapArtifactRun(dbObj: any): ArtifactRun {
    return {
      id: dbObj.id,
      dealRunId: dbObj.deal_run_id,
      artifactType: dbObj.artifact_type,
      status: dbObj.status,
      createdAt: dbObj.created_at,
      updatedAt: dbObj.updated_at,
    };
  }

  private mapStageRun(dbObj: any): StageRun {
    return {
      id: dbObj.id,
      artifactRunId: dbObj.artifact_run_id,
      stage: dbObj.stage,
      attempt: dbObj.attempt,
      inputHash: dbObj.input_hash,
      ruleVersion: dbObj.rule_version,
      codeVersion: dbObj.code_version,
      outputHash: dbObj.output_hash || undefined,
      status: dbObj.status,
      errorDetail: dbObj.error_detail || undefined,
      startedAt: dbObj.started_at,
      finishedAt: dbObj.finished_at || undefined,
    };
  }

  private mapEnvelope<T>(dbObj: any): ArtifactEnvelope<T> {
    return {
      id: dbObj.id,
      stageRunId: dbObj.stage_run_id,
      artifactType: dbObj.artifact_type,
      schemaVersion: dbObj.schema_version,
      contentHash: dbObj.content_hash,
      parentHash: dbObj.parent_hash || undefined,
      payload: dbObj.payload,
      createdAt: dbObj.created_at,
    };
  }
}
