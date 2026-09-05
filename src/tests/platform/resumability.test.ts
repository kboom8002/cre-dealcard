import { describe, it, expect } from 'vitest';
import { InMemoryPipelineRepository } from '@/platform/im-pipeline/repository';
import { StageOrchestrator } from '@/platform/im-pipeline/orchestrator';

describe('Resumable Pipeline Runtime & Checkpoint Engine (CIM-0202 / PR-M2-02)', () => {
  it('should execute stage initially, store envelope, and complete stage run', () => {
    return (async () => {
      const repository = new InMemoryPipelineRepository();
      const orchestrator = new StageOrchestrator(repository);

      const dealRun = await repository.createDealRun('deal-001', 'initial', 'idemp-123');
      const artifactRun = await repository.createArtifactRun(dealRun.id, 'mobile');

      let executionCount = 0;
      const result = await orchestrator.executeStage(
        {
          artifactRunId: artifactRun.id,
          stage: 'M10',
          inputHash: 'hash-input-001',
          ruleVersion: 'v1.0.0',
          codeVersion: 'v1.0.0',
          schemaVersion: '1.0.0',
          execute: async () => {
            executionCount++;
            return {
              outputHash: 'hash-output-001',
              payload: { title: 'M10 Plan Output' },
            };
          },
        },
        {}
      );

      expect(result.wasCached).toBe(false);
      expect(result.envelope.contentHash).toBe('hash-output-001');
      expect(result.envelope.payload).toEqual({ title: 'M10 Plan Output' });
      expect(executionCount).toBe(1);

      // Verify repository records
      const stageRun = await repository.getStageRun(
        artifactRun.id,
        'M10',
        'hash-input-001',
        'v1.0.0'
      );
      expect(stageRun).toBeDefined();
      expect(stageRun?.status).toBe('succeeded');
    })();
  });

  it('should skip execution on second run and reuse cached envelope (Checkpoint / Idempotency)', () => {
    return (async () => {
      const repository = new InMemoryPipelineRepository();
      const orchestrator = new StageOrchestrator(repository);

      const dealRun = await repository.createDealRun('deal-001', 'initial', 'idemp-123');
      const artifactRun = await repository.createArtifactRun(dealRun.id, 'mobile');

      let executionCount = 0;
      const stageConfig = {
        artifactRunId: artifactRun.id,
        stage: 'M10',
        inputHash: 'hash-input-001',
        ruleVersion: 'v1.0.0',
        codeVersion: 'v1.0.0',
        schemaVersion: '1.0.0',
        execute: async () => {
          executionCount++;
          return {
            outputHash: 'hash-output-001',
            payload: { title: 'M10 Plan Output' },
          };
        },
      };

      // First run
      const firstResult = await orchestrator.executeStage(stageConfig, {});
      expect(firstResult.wasCached).toBe(false);
      expect(executionCount).toBe(1);

      // Second run (simulating process resume or crash recovery)
      const secondResult = await orchestrator.executeStage(stageConfig, {});
      expect(secondResult.wasCached).toBe(true);
      expect(secondResult.envelope.contentHash).toBe('hash-output-001');
      expect(executionCount).toBe(1); // handler was NOT invoked again!
    })();
  });
});
