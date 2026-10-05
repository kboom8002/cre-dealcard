/**
 * @file record-replay.ts
 * @description LLM 녹화/재생 래퍼 (Hardening H4) — 결정론적 E2E/CI 용.
 *
 * LLM_MODE:
 *  - live   (기본) : 실제 제공자 호출 (래퍼 미사용)
 *  - record        : 실제 제공자를 호출하고 응답을 LLM_RECORDINGS_DIR 에 저장
 *  - replay        : 저장된 응답만 반환. 키가 없으면 LLMReplayMissError (조용한 Mock 폴백 금지)
 *  - record-missing: 성공 녹화가 있으면 재생(실호출 0), 없거나 실패 녹화면 실제 호출 후 저장.
 *                    입력이 일부만 바뀐 경우 바뀐 호출만 과금되도록 하는 증분 녹화 모드.
 *
 * 키 = sha256(model | responseFormat | systemPrompt | userPrompt) — UUID/ISO 타임스탬프/epoch 는 정규화하여
 * 실행마다 달라지는 값 때문에 재생이 빗나가지 않게 한다. temperature/maxTokens/signal 은 키에서 제외.
 */
import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { LLMProvider, LLMChatParams, LLMChatResult } from './types';

export type LLMMode = 'live' | 'record' | 'replay' | 'record-missing';

export class LLMReplayMissError extends Error {
  readonly key: string;
  constructor(key: string, preview: string) {
    super(`LLM_REPLAY_MISS key=${key} prompt="${preview}"`);
    this.name = 'LLMReplayMissError';
    this.key = key;
  }
}

/** 녹화 당시 최종 실패했던 호출 — 재생에서도 동일하게 실패시켜 호출부의 폴백 경로를 재현한다 */
export class LLMReplayedFailureError extends Error {
  constructor(key: string, original: string) {
    super(`LLM_REPLAYED_FAILURE key=${key} original=${original}`);
    this.name = 'LLMReplayedFailure';
  }
}

export function resolveLLMMode(env: NodeJS.ProcessEnv = process.env): LLMMode {
  const m = (env.LLM_MODE ?? 'live').toLowerCase();
  return m === 'record' || m === 'replay' || m === 'record-missing' ? m : 'live';
}

export function resolveRecordingsDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.LLM_RECORDINGS_DIR || join(process.cwd(), 'e2e', 'llm-recordings');
}

/** 실행마다 달라지는 값을 제거한 프롬프트 */
export function normalizePrompt(s: string): string {
  return s
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<ts>')
    .replace(/\b1[5-9]\d{11}\b/g, '<epoch>')
    .replace(/\bgen_[a-z0-9]+_/g, 'gen_<id>_');
}

export function computeRecordingKey(params: Pick<LLMChatParams, 'model' | 'responseFormat' | 'systemPrompt' | 'userPrompt'>): string {
  const canonical = JSON.stringify([
    params.model ?? '',
    params.responseFormat ?? 'text',
    normalizePrompt(params.systemPrompt ?? ''),
    normalizePrompt(params.userPrompt ?? ''),
  ]);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 40);
}

interface Recording {
  key: string;
  recordedAt: string;
  model: string;
  responseFormat: string;
  promptPreview: string;
  /** 성공 녹화 */
  result?: LLMChatResult;
  /** 실패 녹화 (성공 녹화가 없을 때만 기록) */
  failed?: boolean;
  error?: string;
}

export class RecordReplayProvider implements LLMProvider {
  readonly name: string;

  constructor(
    private readonly inner: LLMProvider | null,
    private readonly mode: Exclude<LLMMode, 'live'>,
    private readonly dir: string = resolveRecordingsDir(),
  ) {
    this.name = inner?.name ?? 'openai';
  }

  private file(key: string): string {
    return join(this.dir, `${key}.json`);
  }

  /**
   * 재생 미스 / 실호출을 JSONL 로 남긴다 (서버 stdout 이 수집되지 않는 E2E 에서도 관측 가능).
   * - LLM_MISS_LOG (기본 test-results/llm-replay-misses.jsonl)
   * - LLM_PROMPT_DUMP_DIR 지정 시 정규화된 전체 프롬프트를 <key>.txt 로 저장 (프롬프트 드리프트 diff 용)
   */
  private noteMiss(key: string, params: LLMChatParams, kind: 'replay-miss' | 'live-call'): void {
    try {
      if (process.env.VITEST && !process.env.LLM_MISS_LOG) return; // 단위 테스트에서는 저장소 파일을 더럽히지 않음
      const logFile = process.env.LLM_MISS_LOG || join(process.cwd(), 'test-results', 'llm-replay-misses.jsonl');
      mkdirSync(dirname(logFile), { recursive: true });
      appendFileSync(logFile, JSON.stringify({
        at: new Date().toISOString(), mode: this.mode, kind, key, model: params.model,
        preview: normalizePrompt(params.userPrompt ?? '').slice(0, 120).replace(/\s+/g, ' '),
      }) + '\n', 'utf8');
      const dumpDir = process.env.LLM_PROMPT_DUMP_DIR;
      if (dumpDir) {
        mkdirSync(dumpDir, { recursive: true });
        writeFileSync(join(dumpDir, `${key}.txt`),
          `MODEL: ${params.model}\nFORMAT: ${params.responseFormat ?? 'text'}\n=== SYSTEM ===\n${normalizePrompt(params.systemPrompt ?? '')}\n=== USER ===\n${normalizePrompt(params.userPrompt ?? '')}\n`, 'utf8');
      }
    } catch {
      // 관측용 — 실패해도 호출 경로에 영향 없음
    }
  }

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    const key = computeRecordingKey(params);
    const f = this.file(key);

    if (this.mode === 'replay') {
      if (!existsSync(f)) {
        this.noteMiss(key, params, 'replay-miss');
        throw new LLMReplayMissError(key, normalizePrompt(params.userPrompt ?? '').slice(0, 80).replace(/\s+/g, ' '));
      }
      const rec = JSON.parse(readFileSync(f, 'utf8')) as Recording;
      // 사용된 녹화 키 기록 (선택) — 고아 녹화 정리(prune)용
      if (process.env.LLM_USED_LOG) { try { appendFileSync(process.env.LLM_USED_LOG, key + '\n', 'utf8'); } catch { /* 관측용 */ } }
      if (rec.failed || !rec.result) throw new LLMReplayedFailureError(key, rec.error ?? 'unknown');
      return { ...rec.result, provider: `${rec.result.provider}:replay`, latencyMs: 0 };
    }

    // record-missing: 성공 녹화가 있으면 실호출 없이 재생, 없거나 실패 녹화면 아래 record 경로로 진행
    if (this.mode === 'record-missing' && existsSync(f)) {
      try {
        const rec = JSON.parse(readFileSync(f, 'utf8')) as Recording;
        if (!rec.failed && rec.result) {
          return { ...rec.result, provider: `${rec.result.provider}:replay`, latencyMs: 0 };
        }
      } catch {
        // 손상된 녹화 파일 → 재녹화
      }
    }

    // record
    if (!this.inner) throw new Error('[RecordReplayProvider] record 모드에는 실제 제공자가 필요합니다');
    this.noteMiss(key, params, 'live-call');
    let result: LLMChatResult;
    try {
      result = await this.inner.chat(params);
    } catch (err: any) {
      // 실패도 기록 (이미 성공 녹화가 있으면 덮어쓰지 않음)
      mkdirSync(this.dir, { recursive: true });
      if (!existsSync(f)) {
        const failRec: Recording = {
          key, recordedAt: new Date().toISOString(), model: params.model,
          responseFormat: params.responseFormat ?? 'text',
          promptPreview: normalizePrompt(params.userPrompt ?? '').slice(0, 120).replace(/\s+/g, ' '),
          failed: true, error: String(err?.message ?? err).slice(0, 200),
        };
        writeFileSync(f, JSON.stringify(failRec, null, 1), 'utf8');
      }
      throw err;
    }
    mkdirSync(this.dir, { recursive: true });
    const rec: Recording = {
      key,
      recordedAt: new Date().toISOString(),
      model: params.model,
      responseFormat: params.responseFormat ?? 'text',
      promptPreview: normalizePrompt(params.userPrompt ?? '').slice(0, 120).replace(/\s+/g, ' '),
      result,
    };
    writeFileSync(f, JSON.stringify(rec, null, 1), 'utf8');
    return result;
  }

  async embed(text: string): Promise<number[]> {
    // 임베딩은 녹화 대상이 아님: replay 에서는 결정론적 더미 벡터, record 에서는 실제 호출
    if (this.mode === 'replay' || !this.inner?.embed) return new Array(1536).fill(0.1);
    return this.inner.embed(text);
  }
}
