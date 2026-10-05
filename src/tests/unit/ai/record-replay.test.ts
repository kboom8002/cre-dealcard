import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  RecordReplayProvider, LLMReplayMissError, computeRecordingKey, normalizePrompt, resolveLLMMode,
} from '@/ai/providers/record-replay';
import type { LLMProvider, LLMChatParams, LLMChatResult } from '@/ai/providers/types';

const base: LLMChatParams = { systemPrompt: 'sys', userPrompt: 'hello', model: 'm1', responseFormat: 'json_object' };

function fakeProvider(content = '{"ok":true}'): LLMProvider & { calls: number } {
  const p = {
    name: 'openai',
    calls: 0,
    async chat(): Promise<LLMChatResult> {
      p.calls++;
      return { content, tokens: 7, model: 'm1', provider: 'openai', latencyMs: 123 };
    },
  };
  return p;
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'llm-rec-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('H4 record-replay: 키', () => {
  it('UUID/타임스탬프/epoch 는 정규화되어 같은 키', () => {
    const a = computeRecordingKey({ ...base, userPrompt: 'doc 3f2504e0-4f89-11d3-9a0c-0305e82c3301 at 2026-10-03T10:11:12.345Z t=1791038035465' });
    const b = computeRecordingKey({ ...base, userPrompt: 'doc aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee at 2026-10-04T01:02:03Z t=1791099999999' });
    expect(a).toBe(b);
  });

  it('실제 내용이 다르면 다른 키', () => {
    expect(computeRecordingKey(base)).not.toBe(computeRecordingKey({ ...base, userPrompt: 'hello!' }));
    expect(computeRecordingKey(base)).not.toBe(computeRecordingKey({ ...base, model: 'm2' }));
    expect(computeRecordingKey(base)).not.toBe(computeRecordingKey({ ...base, responseFormat: 'text' }));
  });

  it('temperature/maxTokens 는 키에 영향 없음', () => {
    expect(computeRecordingKey(base)).toBe(computeRecordingKey({ ...base, temperature: 0.1, maxTokens: 10 } as any));
  });

  it('normalizePrompt: 숫자 가격 등 일반 숫자는 보존', () => {
    expect(normalizePrompt('매매가 250억, 면적 518.7')).toBe('매매가 250억, 면적 518.7');
  });
});

describe('H4 record-replay: 모드', () => {
  it('record → 파일 저장, replay → inner 호출 없이 동일 응답', async () => {
    const inner = fakeProvider('{"v":42}');
    const rec = new RecordReplayProvider(inner, 'record', dir);
    const r1 = await rec.chat(base);
    expect(inner.calls).toBe(1);
    expect(readdirSync(dir)).toHaveLength(1);

    const rep = new RecordReplayProvider(null, 'replay', dir);
    const r2 = await rep.chat(base);
    expect(r2.content).toBe(r1.content);
    expect(r2.latencyMs).toBe(0);
    expect(r2.provider).toContain(':replay');
  });

  it('replay 미스 → LLMReplayMissError (Mock 폴백 없음)', async () => {
    const rep = new RecordReplayProvider(null, 'replay', dir);
    await expect(rep.chat(base)).rejects.toBeInstanceOf(LLMReplayMissError);
  });

  it('record 모드에 inner 없으면 실패', async () => {
    const rec = new RecordReplayProvider(null, 'record', dir);
    await expect(rec.chat(base)).rejects.toThrow(/실제 제공자/);
  });

  it('replay embed 는 결정론적 더미 벡터', async () => {
    const rep = new RecordReplayProvider(null, 'replay', dir);
    const v = await rep.embed('x');
    expect(v).toHaveLength(1536);
  });

  it('resolveLLMMode: 기본 live, 잘못된 값도 live', () => {
    expect(resolveLLMMode({} as any)).toBe('live');
    expect(resolveLLMMode({ LLM_MODE: 'REPLAY' } as any)).toBe('replay');
    expect(resolveLLMMode({ LLM_MODE: 'record' } as any)).toBe('record');
    expect(resolveLLMMode({ LLM_MODE: 'weird' } as any)).toBe('live');
    expect(resolveLLMMode({ LLM_MODE: 'record-missing' } as any)).toBe('record-missing');
  });

  it('record-missing: 성공 녹화가 있으면 실호출 없이 재생', async () => {
    const first = fakeProvider('{"v":1}');
    await new RecordReplayProvider(first, 'record', dir).chat(base);
    const inner = fakeProvider('{"v":2}');
    const rm = new RecordReplayProvider(inner, 'record-missing', dir);
    const r = await rm.chat(base);
    expect(inner.calls).toBe(0);
    expect(r.content).toBe('{"v":1}');
  });

  it('record-missing: 녹화 없음 → 실호출 후 저장, 이후 replay 가능', async () => {
    const inner = fakeProvider('{"v":3}');
    const rm = new RecordReplayProvider(inner, 'record-missing', dir);
    await rm.chat(base);
    expect(inner.calls).toBe(1);
    const r = await new RecordReplayProvider(null, 'replay', dir).chat(base);
    expect(r.content).toBe('{"v":3}');
  });

  it('record-missing: 실패 녹화는 재호출하여 성공으로 덮어씀', async () => {
    const failing: LLMProvider = { name: 'openai', async chat() { throw new Error('Request was aborted.'); } };
    await expect(new RecordReplayProvider(failing, 'record', dir).chat(base)).rejects.toThrow(/aborted/);
    await expect(new RecordReplayProvider(null, 'replay', dir).chat(base)).rejects.toThrow(/LLM_REPLAYED_FAILURE/);

    const inner = fakeProvider('{"v":4}');
    await new RecordReplayProvider(inner, 'record-missing', dir).chat(base);
    expect(inner.calls).toBe(1);
    const r = await new RecordReplayProvider(null, 'replay', dir).chat(base);
    expect(r.content).toBe('{"v":4}');
  });
});

describe('H4 callLLM 통합: replay 미스는 즉시 실패 (재시도/Mock 폴백 없음)', () => {
  const saved = { mode: process.env.LLM_MODE, dir: process.env.LLM_RECORDINGS_DIR };
  afterEach(() => {
    if (saved.mode === undefined) delete process.env.LLM_MODE; else process.env.LLM_MODE = saved.mode;
    if (saved.dir === undefined) delete process.env.LLM_RECORDINGS_DIR; else process.env.LLM_RECORDINGS_DIR = saved.dir;
    vi.resetModules();
  });

  it('LLM_MODE=replay + 녹화 없음 → LLMReplayMissError, 1초 내 실패', async () => {
    process.env.LLM_MODE = 'replay';
    process.env.LLM_RECORDINGS_DIR = dir;
    vi.resetModules();
    const { callLLM } = await import('@/ai/llm-client');
    const t = Date.now();
    await expect(callLLM(base)).rejects.toMatchObject({ name: 'LLMReplayMissError' });
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it('LLM_MODE=replay + 녹화 있음 → 녹화 응답 반환', async () => {
    new RecordReplayProvider(fakeProvider('{"from":"recording"}'), 'record', dir).chat(base);
    await new Promise(r => setTimeout(r, 50));
    process.env.LLM_MODE = 'replay';
    process.env.LLM_RECORDINGS_DIR = dir;
    vi.resetModules();
    const { callLLM } = await import('@/ai/llm-client');
    const r = await callLLM(base);
    expect(r.content).toBe('{"from":"recording"}');
  });
});

describe('H4 record-replay: 실패 녹화/재생', () => {
  const failing: LLMProvider = {
    name: 'openai',
    async chat(): Promise<LLMChatResult> { throw new Error('boom 429'); },
  };

  it('record 중 실패 → 마커 저장, replay 에서 LLMReplayedFailure 로 재현', async () => {
    const rec = new RecordReplayProvider(failing, 'record', dir);
    await expect(rec.chat(base)).rejects.toThrow('boom');
    expect(readdirSync(dir)).toHaveLength(1);
    const rep = new RecordReplayProvider(null, 'replay', dir);
    await expect(rep.chat(base)).rejects.toMatchObject({ name: 'LLMReplayedFailure' });
  });

  it('성공 녹화가 있으면 이후 실패가 덮어쓰지 않음, 이후 성공은 마커를 덮어씀', async () => {
    await new RecordReplayProvider(fakeProvider('{"a":1}'), 'record', dir).chat(base);
    await expect(new RecordReplayProvider(failing, 'record', dir).chat(base)).rejects.toThrow();
    const r = await new RecordReplayProvider(null, 'replay', dir).chat(base);
    expect(r.content).toBe('{"a":1}');

    const dir2 = mkdtempSync(join(tmpdir(), 'llm-rec2-'));
    try {
      await expect(new RecordReplayProvider(failing, 'record', dir2).chat(base)).rejects.toThrow();
      await new RecordReplayProvider(fakeProvider('{"b":2}'), 'record', dir2).chat(base);
      const r2 = await new RecordReplayProvider(null, 'replay', dir2).chat(base);
      expect(r2.content).toBe('{"b":2}');
    } finally { rmSync(dir2, { recursive: true, force: true }); }
  });
});
