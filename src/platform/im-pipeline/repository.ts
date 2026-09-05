import { randomUUID } from 'crypto';
import type {
  DealRun,
  ArtifactRun,
  StageRun,
  ArtifactEnvelope,
  DealRunTrigger,
  ArtifactType,
} from './types';

export interface PipelineRepository {
  createDealRun(dealId: string, triggerType: DealRunTrigger, idempotencyKey: string): Promise<DealRun>;
  getDealRun(id: string): Promise<DealRun | null>;
  getDealRunByIdempotencyKey(key: string): Promise<DealRun | null>;
  updateDealRunStatus(id: string, status: DealRun['status']): Promise<void>;

  createArtifactRun(dealRunId: string, artifactType: ArtifactType): Promise<ArtifactRun>;
  getArtifactRun(id: string): Promise<ArtifactRun | null>;
  updateArtifactRunStatus(id: string, status: ArtifactRun['status']): Promise<void>;

  getStageRun(artifactRunId: string, stage: string, inputHash: string, ruleVersion: string): Promise<StageRun | null>;
  recordStageRun(run: Omit<StageRun, 'id' | 'startedAt'>): Promise<StageRun>;
  completeStageRun(id: string, outputHash: string): Promise<void>;
  failStageRun(id: string, errorDetail: Record<string, unknown>): Promise<void>;

  storeEnvelope<T>(envelope: Omit<ArtifactEnvelope<T>, 'id' | 'createdAt'>): Promise<ArtifactEnvelope<T>>;
  getEnvelope(id: string): Promise<ArtifactEnvelope | null>;
  getEnvelopeByHash(contentHash: string): Promise<ArtifactEnvelope | null>;
}

export class InMemoryPipelineRepository implements PipelineRepository {
  private dealRuns = new Map<string, DealRun>();
  private idempotencyIndex = new Map<string, string>();
  private artifactRuns = new Map<string, ArtifactRun>();
  private stageRuns = new Map<string, StageRun>();
  private stageExecutionIndex = new Map<string, string>();
  private envelopes = new Map<string, ArtifactEnvelope>();
  private envelopeHashIndex = new Map<string, string>();

  async createDealRun(dealId: string, triggerType: DealRunTrigger, idempotencyKey: string): Promise<DealRun> {
    const existingId = this.idempotencyIndex.get(idempotencyKey);
    if (existingId) {
      return this.dealRuns.get(existingId)!;
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
    this.dealRuns.set(run.id, run);
    this.idempotencyIndex.set(idempotencyKey, run.id);
    return run;
  }

  async getDealRun(id: string): Promise<DealRun | null> {
    return this.dealRuns.get(id) ?? null;
  }

  async getDealRunByIdempotencyKey(key: string): Promise<DealRun | null> {
    const id = this.idempotencyIndex.get(key);
    return id ? this.dealRuns.get(id) ?? null : null;
  }

  async updateDealRunStatus(id: string, status: DealRun['status']): Promise<void> {
    const run = this.dealRuns.get(id);
    if (run) {
      run.status = status;
      run.updatedAt = new Date().toISOString();
    }
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
    this.artifactRuns.set(run.id, run);
    return run;
  }

  async getArtifactRun(id: string): Promise<ArtifactRun | null> {
    return this.artifactRuns.get(id) ?? null;
  }

  async updateArtifactRunStatus(id: string, status: ArtifactRun['status']): Promise<void> {
    const run = this.artifactRuns.get(id);
    if (run) {
      run.status = status;
      run.updatedAt = new Date().toISOString();
    }
  }

  async getStageRun(artifactRunId: string, stage: string, inputHash: string, ruleVersion: string): Promise<StageRun | null> {
    const key = `${artifactRunId}:${stage}:${inputHash}:${ruleVersion}`;
    const id = this.stageExecutionIndex.get(key);
    return id ? this.stageRuns.get(id) ?? null : null;
  }

  async recordStageRun(runData: Omit<StageRun, 'id' | 'startedAt'>): Promise<StageRun> {
    const key = `${runData.artifactRunId}:${runData.stage}:${runData.inputHash}:${runData.ruleVersion}`;
    const existingId = this.stageExecutionIndex.get(key);
    if (existingId) {
      return this.stageRuns.get(existingId)!;
    }
    const run: StageRun = {
      ...runData,
      id: randomUUID(),
      startedAt: new Date().toISOString(),
    };
    this.stageRuns.set(run.id, run);
    this.stageExecutionIndex.set(key, run.id);
    return run;
  }

  async completeStageRun(id: string, outputHash: string): Promise<void> {
    const run = this.stageRuns.get(id);
    if (run) {
      run.outputHash = outputHash;
      run.status = 'succeeded';
      run.finishedAt = new Date().toISOString();
    }
  }

  async failStageRun(id: string, errorDetail: Record<string, unknown>): Promise<void> {
    const run = this.stageRuns.get(id);
    if (run) {
      run.errorDetail = errorDetail;
      run.status = 'failed';
      run.finishedAt = new Date().toISOString();
    }
  }

  async storeEnvelope<T>(envelopeData: Omit<ArtifactEnvelope<T>, 'id' | 'createdAt'>): Promise<ArtifactEnvelope<T>> {
    const existingId = this.envelopeHashIndex.get(envelopeData.contentHash);
    if (existingId) {
      return this.envelopes.get(existingId) as ArtifactEnvelope<T>;
    }
    const envelope: ArtifactEnvelope<T> = {
      ...envelopeData,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.envelopes.set(envelope.id, envelope as ArtifactEnvelope);
    this.envelopeHashIndex.set(envelope.contentHash, envelope.id);
    return envelope;
  }

  async getEnvelope(id: string): Promise<ArtifactEnvelope | null> {
    return this.envelopes.get(id) ?? null;
  }

  async getEnvelopeByHash(contentHash: string): Promise<ArtifactEnvelope | null> {
    const id = this.envelopeHashIndex.get(contentHash);
    return id ? this.envelopes.get(id) ?? null : null;
  }
}
