import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const llm: { result: { content: string; isMock?: boolean } | Error } = {
  result: { content: '' },
};

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: async () => ({ error: null, user: { id: 'u1' } }),
}));
vi.mock('@/ai/model-selector', () => ({ getModel: () => 'test-model' }));
vi.mock('@/lib/logger', () => ({
  createModuleLogger: () => ({ warn() {}, error() {}, info() {}, debug() {} }),
}));
vi.mock('@/ai/llm-client', () => {
  class LLMMockNotAllowedError extends Error {}
  return {
    LLMMockNotAllowedError,
    callLLM: async () => {
      if (llm.result instanceof Error) throw llm.result;
      return llm.result;
    },
  };
});

import { POST } from '@/app/api/broker/studio/ai-comment/route';
import {
  AI_COMMENT_SYSTEM_PROMPT,
  AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT,
  aiCommentRequestSchema,
  aiCommentResponseSchema,
  findNumbersNotInContext,
} from '@/lib/magazine/ai-comment-schema';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/broker/studio/ai-comment', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('ai-comment 스키마 계약', () => {
  it('{comment} 와 구 {context} 별칭을 모두 받는다', () => {
    expect(aiCommentRequestSchema.safeParse({ comment: ' 안녕 ' })).toMatchObject({ success: true, data: { comment: '안녕' } });
    expect(aiCommentRequestSchema.safeParse({ context: '별칭' })).toMatchObject({ success: true, data: { comment: '별칭' } });
    expect(aiCommentRequestSchema.safeParse({ comment: '   ' }).success).toBe(false);
    expect(aiCommentRequestSchema.safeParse({}).success).toBe(false);
  });

  it('응답 스키마: result.comment 필수', () => {
    expect(aiCommentResponseSchema.safeParse({ ok: true, result: { comment: 'x' } }).success).toBe(true);
    expect(aiCommentResponseSchema.safeParse({ ok: true, data: { comment: 'x' } }).success).toBe(false);
  });

  it("시스템 프롬프트/라우트 소스에 '지어내' 유도 문구가 없다", () => {
    expect(AI_COMMENT_SYSTEM_PROMPT).not.toContain('지어내');
    const src = fs.readFileSync(path.resolve(__dirname, '../../../app/api/broker/studio/ai-comment/route.ts'), 'utf-8');
    expect(src).not.toContain('지어내');
  });

  it('입력에 없는 숫자를 찾는다', () => {
    expect(findNumbersNotInContext('매수 문의가 30% 늘었습니다', '매수 문의가 늘어남')).toEqual(['30']);
    expect(findNumbersNotInContext('문의 30% 증가', '문의 30% 증가했다')).toEqual([]);
  });
});

describe('ai-comment 라우트', () => {
  it('Mock 응답은 502 로 거부한다', async () => {
    llm.result = { content: '모의 응답', isMock: true };
    const res = await POST(req({ comment: '금리 인하 기대' }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('LLM_UNAVAILABLE');
  });

  it('빈 응답은 502', async () => {
    llm.result = { content: '   ' };
    expect((await POST(req({ comment: '금리' }))).status).toBe(502);
  });

  it('정상 응답은 result.comment, 입력에 없는 숫자는 warnings 로 표시', async () => {
    llm.result = { content: '최근 매수 문의가 40% 늘었습니다.' };
    const res = await POST(req({ comment: '매수 문의가 늘어남' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.result.comment).toContain('매수 문의');
    expect(json.warnings).toEqual([AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT]);
  });

  it('숫자가 모두 입력에 있으면 warnings 없음, 구 {context} 요청도 처리', async () => {
    llm.result = { content: '문의가 30% 늘었습니다.' };
    const json = await (await POST(req({ context: '문의 30% 증가' }))).json();
    expect(json.ok).toBe(true);
    expect('warnings' in json).toBe(false);
  });

  it('잘못된 요청은 400', async () => {
    expect((await POST(req({}))).status).toBe(400);
  });
});
