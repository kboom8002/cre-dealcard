import { randomUUID, createHash } from 'crypto';

export interface RenderJob {
  jobId: string;
  deckId: string;
  deckHash: string;
  status: 'QUEUED' | 'RENDERING' | 'COMPLETED' | 'FAILED';
  isDraftPreview: boolean;
  artifactFileUrl?: string;
  expiresAt?: string; // 14-day TTL for draft previews
  createdAt: string;
  updatedAt: string;
}

export class PPTXRenderManager {
  private jobs = new Map<string, RenderJob>();

  createRenderJob(deckId: string, deckHash: string, isDraftPreview: boolean): RenderJob {
    const jobId = randomUUID();
    const now = new Date();
    const createdAt = now.toISOString();

    // Invariant Principle #3: 14-day retention for draft preview
    let expiresAt: string | undefined;
    if (isDraftPreview) {
      const expiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      expiresAt = expiry.toISOString();
    }

    const job: RenderJob = {
      jobId,
      deckId,
      deckHash,
      status: 'QUEUED',
      isDraftPreview,
      expiresAt,
      createdAt,
      updatedAt: createdAt,
    };

    this.jobs.set(jobId, job);
    return job;
  }

  async processJob(jobId: string): Promise<RenderJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`JOB_NOT_FOUND: Render job ${jobId} does not exist`);
    }

    job.status = 'RENDERING';
    job.updatedAt = new Date().toISOString();

    // Deterministic mock artifact file hash & URL
    const fileHash = createHash('sha256').update(`${job.deckHash}:rendered`).digest('hex');
    job.artifactFileUrl = `/storage/pptx/${job.deckId}/${fileHash}.pptx`;
    job.status = 'COMPLETED';
    job.updatedAt = new Date().toISOString();

    return job;
  }

  getJob(jobId: string): RenderJob | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    // If expired draft preview, purge
    if (job.expiresAt && new Date(job.expiresAt) < new Date()) {
      this.jobs.delete(jobId);
      return null;
    }
    return job;
  }
}
