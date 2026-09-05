import { getStageBudget } from './timeout-budget';
import type { PipelineRepository } from './repository';
import type { ArtifactEnvelope, StageRun } from './types';

export interface StageExecutionContext<TInput = unknown, TOutput = unknown> {
  artifactRunId: string;
  stage: string;
  inputHash: string;
  ruleVersion: string;
  codeVersion: string;
  schemaVersion: string;
  execute: (input: TInput) => Promise<{ outputHash: string; payload: TOutput }>;
}

export class StageOrchestrator {
  private repository: PipelineRepository;

  constructor(repository: PipelineRepository) {
    this.repository = repository;
  }

  /**
   * Executes a pipeline stage with checkpoint recovery, idempotency, and timeout budget enforcement.
   * If the stage has already succeeded with the same inputHash and ruleVersion,
   * execution is skipped and the cached envelope is immediately returned.
   */
  async executeStage<TInput, TOutput>(
    ctx: StageExecutionContext<TInput, TOutput>,
    input: TInput
  ): Promise<{ envelope: ArtifactEnvelope<TOutput>; wasCached: boolean }> {
    // 1. Checkpoint lookup
    const existingRun = await this.repository.getStageRun(
      ctx.artifactRunId,
      ctx.stage,
      ctx.inputHash,
      ctx.ruleVersion
    );

    if (existingRun && existingRun.status === 'succeeded' && existingRun.outputHash) {
      const cachedEnvelope = await this.repository.getEnvelopeByHash(existingRun.outputHash);
      if (cachedEnvelope) {
        return {
          envelope: cachedEnvelope as ArtifactEnvelope<TOutput>,
          wasCached: true,
        };
      }
    }

    // 2. Record stage execution
    const run = await this.repository.recordStageRun({
      artifactRunId: ctx.artifactRunId,
      stage: ctx.stage,
      attempt: existingRun ? existingRun.attempt + 1 : 1,
      inputHash: ctx.inputHash,
      ruleVersion: ctx.ruleVersion,
      codeVersion: ctx.codeVersion,
      status: 'running',
    });

    const budget = getStageBudget(ctx.stage);

    // 3. Execute with timeout
    try {
      const result = await Promise.race([
        ctx.execute(input),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`STAGE_TIMEOUT: Stage ${ctx.stage} exceeded budget of ${budget.cancelMs}ms`)),
            budget.cancelMs
          )
        ),
      ]);

      // 4. Store output envelope
      const envelope = await this.repository.storeEnvelope<TOutput>({
        stageRunId: run.id,
        artifactType: ctx.stage,
        schemaVersion: ctx.schemaVersion,
        contentHash: result.outputHash,
        payload: result.payload,
      });

      // 5. Complete stage run
      await this.repository.completeStageRun(run.id, result.outputHash);

      return {
        envelope,
        wasCached: false,
      };
    } catch (err: any) {
      await this.repository.failStageRun(run.id, {
        message: err.message,
        stack: err.stack,
      });
      throw err;
    }
  }
}
