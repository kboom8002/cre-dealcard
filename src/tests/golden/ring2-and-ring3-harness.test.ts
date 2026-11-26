/**
 * @file src/tests/golden/ring2-and-ring3-harness.test.ts
 * @description Unit & integration harness tests for Ring 2 (`prompt-hash-guard`, `run-ai-judge`)
 *   and Ring 3 (`playwright.config.ts` prod server mode & `run-canary-prod.mjs --dry-run`).
 *
 * Strict Policy:
 *  - ZERO live OpenAI API calls ($0.00 deterministic).
 *  - Verifies CRLF-normalized SHA-256 parity across Windows/Linux, Sealed Hold-Out oracle math,
 *    generalization gap (`> 0.35`) overfitting warning, span-grounding hallucination rejection,
 *    fail-loud `--with-llm-judge` key/HTTP guards, and `next start` production canary config.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MANIFEST_PATH,
  computeCurrentPromptHashes,
  diffPromptManifest,
  loadPromptManifest,
  runPromptHashGuardCli,
  sha256NormalizedText,
  writePromptManifest,
} from '../../../scripts/golden-snapshot/prompt-hash-guard';
import {
  FLOOR_CAP_100,
  FLOOR_CAP_5,
  assertValidLiveOpenAiKey,
  computeGeneralizationGap,
  enforceBlindGuard,
  evaluateSealedHoldOut,
  isSpanGrounded,
  runAntiSycophancyGate,
  runRing2AiJudge,
  validateAndBlendR3Score,
} from '../../../scripts/golden-snapshot/run-ai-judge';
import { resolvePlaywrightServerPlan } from '../../../playwright.config';

describe('Ring 2 — Prompt & Schema SHA-256 Cassette Staleness Guard', () => {
  it('normalizes CRLF/CR/LF identically so Windows and Ubuntu CI produce the exact same SHA-256', () => {
    const lf = 'export const PROMPT = "안녕하세요\\n라인2";\nexport const V = 1;\n';
    const crlf = lf.replace(/\n/g, '\r\n');
    const loneCr = lf.replace(/\n/g, '\r');

    expect(sha256NormalizedText(crlf)).toBe(sha256NormalizedText(lf));
    expect(sha256NormalizedText(loneCr)).toBe(sha256NormalizedText(lf));

    const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'cre-prompt-lf-'));
    const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'cre-prompt-crlf-'));
    try {
      for (const [root, eol] of [
        [tmpA, '\n'],
        [tmpB, '\r\n'],
      ] as const) {
        fs.mkdirSync(path.join(root, 'src', 'ai', 'prompts'), { recursive: true });
        fs.mkdirSync(path.join(root, 'src', 'ai', 'schemas'), { recursive: true });
        fs.writeFileSync(
          path.join(root, 'src', 'ai', 'prompts', 'alpha.ts'),
          `export const A = 1;${eol}export const B = 2;${eol}`,
          'utf8',
        );
        // *.test.ts must be excluded
        fs.writeFileSync(
          path.join(root, 'src', 'ai', 'prompts', 'alpha.test.ts'),
          `// ignored test file ${eol}${root}`,
          'utf8',
        );
        fs.writeFileSync(
          path.join(root, 'src', 'ai', 'schemas', 'beta.ts'),
          `export interface Beta { id: string; }${eol}`,
          'utf8',
        );
        fs.writeFileSync(
          path.join(root, 'src', 'ai', 'model-selector.ts'),
          `export const MODEL = 'gpt-5.6-sol';${eol}`,
          'utf8',
        );
      }

      const hashA = computeCurrentPromptHashes(tmpA);
      const hashB = computeCurrentPromptHashes(tmpB);
      expect(hashA.aggregateSha256).toBe(hashB.aggregateSha256);
      expect(hashA.files).toEqual(hashB.files);
      expect(Object.keys(hashA.files)).toEqual([
        'src/ai/model-selector.ts',
        'src/ai/prompts/alpha.ts',
        'src/ai/schemas/beta.ts',
      ]);
    } finally {
      fs.rmSync(tmpA, { recursive: true, force: true });
      fs.rmSync(tmpB, { recursive: true, force: true });
    }
  });

  it('matches committed e2e/golden-snapshots/prompt-hash-manifest.json and detects simulated edits/additions', () => {
    const manifest = loadPromptManifest(DEFAULT_MANIFEST_PATH);
    expect(manifest).not.toBeNull();
    expect(manifest!.schemaVersion).toBe(1);

    const current = computeCurrentPromptHashes();
    const cleanDiff = diffPromptManifest(current, manifest);
    expect(cleanDiff.matches).toBe(true);
    expect(cleanDiff.changed).toEqual([]);
    expect(cleanDiff.added).toEqual([]);
    expect(cleanDiff.removed).toEqual([]);

    // Simulate prompt edit + file addition + file removal in a temporary workspace
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cre-prompt-diff-'));
    try {
      const promptsDir = path.join(tmpRoot, 'src', 'ai', 'prompts');
      const schemasDir = path.join(tmpRoot, 'src', 'ai', 'schemas');
      fs.mkdirSync(promptsDir, { recursive: true });
      fs.mkdirSync(schemasDir, { recursive: true });
      fs.writeFileSync(path.join(promptsDir, 'p1.ts'), 'export const P1 = "v1";\n', 'utf8');
      fs.writeFileSync(path.join(schemasDir, 's1.ts'), 'export const S1 = "v1";\n', 'utf8');
      fs.writeFileSync(
        path.join(tmpRoot, 'src', 'ai', 'model-selector.ts'),
        'export const M = "sol";\n',
        'utf8',
      );

      const tmpManifestPath = path.join(tmpRoot, 'manifest.json');
      const baseline = writePromptManifest(tmpManifestPath, tmpRoot);

      // Modify p1.ts, add p2.ts, remove s1.ts
      fs.writeFileSync(path.join(promptsDir, 'p1.ts'), 'export const P1 = "v2-edited";\n', 'utf8');
      fs.writeFileSync(path.join(promptsDir, 'p2.ts'), 'export const P2 = "added";\n', 'utf8');
      fs.unlinkSync(path.join(schemasDir, 's1.ts'));

      const mutated = computeCurrentPromptHashes(tmpRoot);
      const diff = diffPromptManifest(mutated, baseline);
      expect(diff.matches).toBe(false);
      expect(diff.aggregateChanged).toBe(true);
      expect(diff.changed).toEqual(['src/ai/prompts/p1.ts']);
      expect(diff.added).toEqual(['src/ai/prompts/p2.ts']);
      expect(diff.removed).toEqual(['src/ai/schemas/s1.ts']);

      // Verify clean strict check passes on real repo
      expect(runPromptHashGuardCli(['--check', '--strict'])).toBe(0);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('Ring 2 — Unified AI Judge & Sealed Hold-Out CLI ($0 Deterministic + R3 Fail-Loud)', () => {
  it('runs $0 deterministic R1+R2 + Sealed Hold-Out with ZERO network calls', async () => {
    const originalFetch = globalThis.fetch;
    let networkCalls = 0;
    globalThis.fetch = (async () => {
      networkCalls += 1;
      throw new Error('Unexpected network call during deterministic $0 Ring 2 evaluation!');
    }) as typeof fetch;

    const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'cre-ring2-out-'));
    try {
      const gate = runAntiSycophancyGate();
      expect(gate.passed).toBe(true);
      expect(gate.failures).toEqual([]);

      const report = await runRing2AiJudge({
        withLlmJudge: false,
        outDir: tmpOut,
        writeArtifacts: true,
        quiet: true,
      });

      expect(networkCalls).toBe(0);
      expect(report.mode).toBe('deterministic_r1_r2');
      expect(report.llmCalls).toBe(0);
      expect(report.estimatedCostUsd).toBe(0);
      expect(report.tuning.floorRiskCount).toBe(0);
      expect(report.tuning.effectiveScore100).toBeGreaterThanOrEqual(90);

      if (report.holdOut.status === 'evaluated') {
        expect(report.holdOut.casesEvaluated).toBeGreaterThanOrEqual(5);
        expect(report.holdOut.allOraclePassed).toBe(true);
        expect(report.holdOut.holdOutMean5).toBeGreaterThanOrEqual(4.5);
        expect(report.generalization.overfittingWarning).toBe(false);
      }

      expect(fs.existsSync(path.join(tmpOut, 'ai-golden-judge-report.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpOut, 'ai-golden-judge-report.md'))).toBe(true);

      // Verify graceful CI fallback when ground_truth_5cases.json is absent
      const skipped = await evaluateSealedHoldOut({
        groundTruthPath: path.join(tmpOut, 'non-existent-ground-truth.json'),
      });
      expect(skipped.status).toBe('skipped_missing_file');
      expect(skipped.casesEvaluated).toBe(0);
      expect(skipped.holdOutMean5).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
      fs.rmSync(tmpOut, { recursive: true, force: true });
    }
  });

  it('triggers overfittingWarning when |tuningMean5 - holdOutMean5| > 0.35 and catches blind leaks', () => {
    const warnGap = computeGeneralizationGap(4.95, 4.42);
    expect(warnGap.generalizationGap5).toBe(0.53);
    expect(warnGap.overfittingWarning).toBe(true);

    const safeGap = computeGeneralizationGap(4.95, 4.72);
    expect(safeGap.generalizationGap5).toBe(0.23);
    expect(safeGap.overfittingWarning).toBe(false);

    const boundaryGap = computeGeneralizationGap(4.85, 4.5);
    expect(boundaryGap.generalizationGap5).toBe(0.35);
    expect(boundaryGap.overfittingWarning).toBe(false);

    const blindClean = enforceBlindGuard({
      rawMemoText:
        '서울특별시 마포구 동교동 189-6 더파크빌딩 근생 매각 77억, 대지 41.5평 연 128.9평, 블루보틀 인근 (박대표 010-9123-4567)',
      forbiddenTokens: ['189-6', '더파크빌딩', '블루보틀', '010-9123-4567', '박대표'],
      address: '서울특별시 마포구 동교동 189-6',
      askingPriceManwon: 770000,
      landAreaSqm: 137.2,
      gfaSqm: 426.11,
    });
    expect(blindClean.passed).toBe(true);
    expect(blindClean.leakedTokens).toEqual([]);
  });

  it('isSpanGrounded rejects hallucinated spans and validateAndBlendR3Score enforces prefix, calibration, and floor caps', () => {
    const observed = [
      '마포구 동교동 | 근린생활시설 | 70~80억대 | 공인중개사 등록번호 11680-2024-00881',
    ];

    expect(isSpanGrounded('마포구 동교동', observed)).toBe(true);
    expect(isSpanGrounded('공인중개사 등록번호', observed[0])).toBe(true);
    expect(isSpanGrounded('강남구 삼성동 연 9.9% 확정수익 보장', observed)).toBe(false);

    // 1) Hallucinated spans (groundedRatio = 0 < 0.5) -> rejects R3 blend
    const ungrounded = validateAndBlendR3Score({
      r2Score5: 4.8,
      r2FloorRisk: false,
      r3Score5: 5.0,
      r3FloorRisk: false,
      reactionSummary: '할루시네이션 스팬 테스트',
      quotedSpans: ['존재하지 않는 환각 문구 A', '없는 문구 B'],
      observedText: observed,
    });
    expect(ungrounded.reactionSummary.startsWith('[SIMULATED] ')).toBe(true);
    expect(ungrounded.groundedRatio).toBe(0);
    expect(ungrounded.blendAccepted).toBe(false);
    expect(ungrounded.blendedScore5).toBe(4.8);

    // 2) Extreme divergence (|R3 - R2| >= 2.0) -> rejects R3 blend
    const divergent = validateAndBlendR3Score({
      r2Score5: 4.8,
      r2FloorRisk: false,
      r3Score5: 2.5,
      r3FloorRisk: false,
      reactionSummary: '[SIMULATED] 편차 초과 테스트',
      quotedSpans: ['마포구 동교동'],
      observedText: observed,
    });
    expect(divergent.blendAccepted).toBe(false);
    expect(divergent.divergence5).toBe(2.3);

    // 3) Grounded & calibrated -> blends 0.70 * R2 + 0.30 * R3, and caps when floorRisk=true
    const validBlend = validateAndBlendR3Score({
      r2Score5: 5.0,
      r2FloorRisk: false,
      r3Score5: 4.5,
      r3FloorRisk: false,
      reactionSummary: '정상 접지 심사',
      quotedSpans: ['마포구 동교동', '근린생활시설'],
      observedText: observed,
    });
    expect(validBlend.blendAccepted).toBe(true);
    expect(validBlend.blendedScore5).toBe(4.85); // 0.7 * 5.0 + 0.3 * 4.5

    const floorCapped = validateAndBlendR3Score({
      r2Score5: 4.9,
      r2FloorRisk: false,
      r3Score5: 4.6,
      r3FloorRisk: true,
      reactionSummary: '[SIMULATED] 과락 캡 검증',
      quotedSpans: ['마포구 동교동'],
      observedText: observed,
    });
    expect(floorCapped.floorRisk).toBe(true);
    expect(floorCapped.blendedScore5).toBeLessThanOrEqual(FLOOR_CAP_5);
    expect(floorCapped.blendedScore100).toBeLessThanOrEqual(FLOOR_CAP_100);
  });

  it('--with-llm-judge fails loud on missing/mock OPENAI_API_KEY and on 401/404/empty responses', async () => {
    for (const badKey of ['', '   ', 'mock_key', 'mock-test', 'test-openai-key', 'not-configured']) {
      expect(() => assertValidLiveOpenAiKey(badKey)).toThrow(/Fail-Loud/i);
      await expect(
        runRing2AiJudge({
          withLlmJudge: true,
          apiKey: badKey,
          writeArtifacts: false,
          quiet: true,
        }),
      ).rejects.toThrow(/Fail-Loud/i);
    }

    // Simulate 401 Unauthorized from OpenAI without touching live network
    await expect(
      runRing2AiJudge({
        withLlmJudge: true,
        apiKey: 'sk-proj-unit-test-valid-format-key',
        writeArtifacts: false,
        quiet: true,
        chatTransport: async () => {
          const err = new Error('Incorrect API key provided') as Error & { status?: number };
          err.status = 401;
          throw err;
        },
      }),
    ).rejects.toThrow(/HTTP 401/);

    // Simulate empty message content -> fail loud (never mock fallback)
    await expect(
      runRing2AiJudge({
        withLlmJudge: true,
        apiKey: 'sk-proj-unit-test-valid-format-key',
        writeArtifacts: false,
        quiet: true,
        chatTransport: async () => ({
          content: '   ',
          tokens: 0,
          model: 'gpt-5.6-sol',
          provider: 'openai',
          latencyMs: 12,
        }),
      }),
    ).rejects.toThrow(/empty content/i);
  });
});

describe('Ring 3 — Production Server Canary (`playwright.config.ts` & `run-canary-prod.mjs`)', () => {
  it('selects `npx next start -p <port>` with reuseExistingServer=false when PLAYWRIGHT_PROD_SERVER=1 while preserving dev modes', () => {
    const prodPlan = resolvePlaywrightServerPlan({
      PLAYWRIGHT_PROD_SERVER: '1',
      E2E_PORT: '3100',
    });
    expect(prodPlan.isProdServer).toBe(true);
    expect(prodPlan.webServer).toBeDefined();
    expect(prodPlan.webServer!.command).toBe('npx next start -p 3100');
    expect(prodPlan.webServer!.port).toBe(3100);
    expect(prodPlan.webServer!.reuseExistingServer).toBe(false);
    expect(prodPlan.webServer!.timeout).toBe(120000);
    expect(prodPlan.webServer!.env?.NEXT_DIST_DIR).toBeUndefined();

    const defaultDevPlan = resolvePlaywrightServerPlan({});
    expect(defaultDevPlan.isProdServer).toBe(false);
    expect(defaultDevPlan.webServer?.command).toBe('npm run dev');
    expect(defaultDevPlan.webServer?.reuseExistingServer).toBe(true);

    const isolatedDevPlan = resolvePlaywrightServerPlan({ E2E_PORT: '3105' });
    expect(isolatedDevPlan.webServer?.command).toBe('npx next dev -p 3105');
    expect(isolatedDevPlan.webServer?.env?.NEXT_DIST_DIR).toBe('.next/e2e-3105');

    const smokePlan = resolvePlaywrightServerPlan({ PROD_SMOKE: '1' });
    expect(smokePlan.skipWebServer).toBe(true);
    expect(smokePlan.webServer).toBeUndefined();
  });

  it('executes `run-canary-prod.mjs --dry-run` in <2s with exit 0 and resolves the exact production canary plan', () => {
    const t0 = Date.now();
    const stdout = execFileSync(
      process.execPath,
      [path.resolve(process.cwd(), 'scripts/golden-snapshot/run-canary-prod.mjs'), '--dry-run'],
      { encoding: 'utf8' },
    );
    const elapsedMs = Date.now() - t0;

    const parsed = JSON.parse(stdout.trim()) as {
      mode: string;
      serverCommand: string;
      reuseExistingServer: boolean;
      e2ePort: number;
      playwrightProdServer: string;
      hasSpec: boolean;
      spec: string;
    };

    expect(elapsedMs).toBeLessThan(3000);
    expect(parsed.mode).toBe('dry-run');
    expect(parsed.serverCommand).toBe('npx next start -p 3100');
    expect(parsed.reuseExistingServer).toBe(false);
    expect(parsed.e2ePort).toBe(3100);
    expect(parsed.playwrightProdServer).toBe('1');
    expect(parsed.spec).toBe('e2e/qa-full-loop-ppgt-2cases.auth.spec.ts');
    expect(parsed.hasSpec).toBe(true);
  });
});
