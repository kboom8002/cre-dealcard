/**
 * 매거진 LLM 가드 단위 테스트 (B3a, T3-LLM-1 / DC-8 / Rule 11·48)
 *  - Mock 응답은 던진다(저장 0건) / 프롬프트 위생 / 독자 문구 정제
 *  - vitest 환경(NODE_ENV=test)의 실제 llm-client 는 MockOpenAIProvider 를 사용한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  MAX_PROMPT_CHARS,
  MagazineLlmError,
  callMagazineJson,
  callMagazineLlm,
  cleanNewsSummary,
  hasReaderTextLeak,
  parseLlmJson,
  sanitizeReaderText,
  serializeForPrompt,
  withGroundingRules,
  zReaderText,
} from '@/lib/magazine/llm-guard';

beforeEach(() => {
  vi.stubEnv('MAGAZINE_ALLOW_LLM_MOCK', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('callMagazineLlm — Mock 차단', () => {
  it('Mock 프로바이더 응답은 MOCK_RESPONSE 로 던지고 저장 로직에 도달하지 않는다', async () => {
    const save = vi.fn();
    const run = async () => {
      const { data } = await callMagazineJson(
        { label: 'test', systemPrompt: 'sys', userPrompt: 'user' },
        z.object({ headline: z.string() }),
      );
      save(data);
    };
    await expect(run()).rejects.toMatchObject({ name: 'MagazineLlmError', code: 'MOCK_RESPONSE' });
    expect(save).toHaveBeenCalledTimes(0);
  });

  it('오류 메시지에 "Mock" 이 포함된다 (cron 의 /mock/i 스킵 판정 호환)', async () => {
    await expect(callMagazineLlm({ label: 't', systemPrompt: 's', userPrompt: 'u' })).rejects.toThrow(/mock/i);
  });

  it('MAGAZINE_ALLOW_LLM_MOCK=true (비프로덕션)에서만 isMock:true 로 통과 — 호출부가 발행 금지 책임', async () => {
    vi.stubEnv('MAGAZINE_ALLOW_LLM_MOCK', 'true');
    const res = await callMagazineLlm({ label: 't', systemPrompt: 's', userPrompt: 'u' });
    expect(res.isMock).toBe(true);
  });

  it('프로덕션에서는 플래그가 true 여도 Mock 을 허용하지 않는다', async () => {
    vi.stubEnv('MAGAZINE_ALLOW_LLM_MOCK', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    // production 이면 allowMock=false → 어떤 경로든 Mock 은 던져야 한다 (프로바이더가 실물이면 네트워크 실패도 LLM_FAILED)
    await expect(callMagazineLlm({ label: 't', systemPrompt: 's', userPrompt: 'u' })).rejects.toBeInstanceOf(MagazineLlmError);
  });
});

describe('프롬프트 위생 (Rule 11 / Rule 48)', () => {
  it('base64/데이터 URI 가 포함된 프롬프트는 호출 전에 거부한다 (PROMPT_REJECTED)', async () => {
    await expect(
      callMagazineLlm({ label: 't', systemPrompt: 's', userPrompt: 'img data:image/png;base64,AAAA' }),
    ).rejects.toMatchObject({ code: 'PROMPT_REJECTED' });
    await expect(
      callMagazineLlm({ label: 't', systemPrompt: 's', userPrompt: 'A'.repeat(2100) }),
    ).rejects.toMatchObject({ code: 'PROMPT_REJECTED' });
  });

  it(`총 길이가 ${MAX_PROMPT_CHARS}자를 넘으면 거부한다`, async () => {
    const long = '가나다라 '.repeat(8000);
    await expect(callMagazineLlm({ label: 't', systemPrompt: 's', userPrompt: long })).rejects.toMatchObject({
      code: 'PROMPT_REJECTED',
    });
  });

  it('serializeForPrompt 는 이미지/바이너리 키와 base64 문자열을 제거한다', () => {
    const out = serializeForPrompt({
      id: 'x',
      layers: { photos: ['a'] },
      photo_urls: ['u'],
      cadastralMapImage: 'AAAA',
      note: 'data:image/png;base64,AAAA',
      ok: '정상',
    });
    expect(out).toContain('정상');
    expect(out).not.toContain('layers');
    expect(out).not.toContain('photo_urls');
    expect(out).not.toContain('cadastralMapImage');
    expect(out).not.toContain('base64');
  });

  it('공통 근거 규칙이 시스템 프롬프트에 항상 붙는다', () => {
    expect(withGroundingRules('가이드')).toContain('입력(사용자 프롬프트)에 없는 수치');
  });
});

describe('독자 문구 정제 (U2-08)', () => {
  it('뉴스 요약의 내부 라벨(핵심 팩트/임플리케이션)을 제거한다', () => {
    expect(cleanNewsSummary('핵심 팩트: 성수동 거래 증가 | 브로커 임플리케이션: 매수 검토')).toBe('성수동 거래 증가');
    expect(cleanNewsSummary(null)).toBe('');
  });

  it('HTML 엔티티·코드펜스·내부 라벨을 정리한다', () => {
    expect(sanitizeReaderText('```json\nA &amp; B\n```')).toBe('A & B');
    expect(sanitizeReaderText('핵심 팩트: 내용')).toBe('내용');
  });

  it('undefined/NaN/[object Object]/mocked 누수를 감지한다', () => {
    expect(hasReaderTextLeak('공실률 NaN%')).toBe(true);
    expect(hasReaderTextLeak('값은 undefined 입니다')).toBe(true);
    expect(hasReaderTextLeak('[object Object]')).toBe(true);
    expect(hasReaderTextLeak('정상 문장입니다')).toBe(false);
  });

  it('zReaderText 는 누수 문자열과 빈 값을 거부한다', () => {
    const s = zReaderText(3, 50);
    expect(s.safeParse('정상 문장입니다').success).toBe(true);
    expect(s.safeParse('공실률 NaN% 입니다').success).toBe(false);
    expect(s.safeParse('  ').success).toBe(false);
  });
});

describe('parseLlmJson', () => {
  it('코드펜스·앞뒤 설명을 제거하고 파싱한다', () => {
    expect(parseLlmJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseLlmJson('결과: {"a":2} 끝')).toEqual({ a: 2 });
  });
  it('잘못된 JSON 은 INVALID_JSON 으로 던진다', () => {
    expect(() => parseLlmJson('not json')).toThrowError(MagazineLlmError);
    try {
      parseLlmJson('{bad');
    } catch (e) {
      expect((e as MagazineLlmError).code).toBe('INVALID_JSON');
    }
  });
});
