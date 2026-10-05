/**
 * src/lib/magazine/ai-comment-schema.ts — AI 코멘트 비서 요청/응답 계약 (P0-09 T1-05, D2-22, S2-21)
 *
 * 클라이언트(에디터 AI 탭)와 서버(`/api/broker/studio/ai-comment`)가 **같은 zod 스키마**를 공유한다.
 *  요청:  { comment: string }   (구 클라이언트의 { context } 도 같은 필드로 받아준다)
 *  응답:  { ok:true, result:{ comment:string }, warnings?:string[] }
 *         { ok:false, error:{ code, message } }
 * 클라이언트·서버 공용 — node 전용 모듈 import 금지.
 */
import { z } from 'zod';

export const AI_COMMENT_MAX_LENGTH = 1500;

export const aiCommentRequestSchema = z.preprocess(
  (v) => {
    if (v && typeof v === 'object' && !('comment' in v) && 'context' in v) {
      return { ...(v as Record<string, unknown>), comment: (v as Record<string, unknown>).context };
    }
    return v;
  },
  z.object({
    comment: z
      .string({ message: '코멘트 내용이 필요합니다.' })
      .trim()
      .min(1, '코멘트 내용이 필요합니다.')
      .max(AI_COMMENT_MAX_LENGTH, `코멘트는 ${AI_COMMENT_MAX_LENGTH}자 이내로 입력해 주세요.`),
  }),
);

export type AiCommentRequest = z.infer<typeof aiCommentRequestSchema>;

export const AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT = 'INPUT_NOT_IN_CONTEXT' as const;

export const aiCommentResponseSchema = z.object({
  ok: z.literal(true),
  result: z.object({ comment: z.string().min(1) }),
  warnings: z.array(z.string()).optional(),
});

export type AiCommentResponse = z.infer<typeof aiCommentResponseSchema>;

/**
 * 시스템 프롬프트. "지어내라/인용" 류 지시 금지 — 입력에 없는 수치·기관·사례는 만들지 않는다. (함정 #5)
 */
export const AI_COMMENT_SYSTEM_PROMPT = `당신은 상업용 부동산 전문 브로커를 위한 AI 화법 비서입니다.
사용자가 입력한 짧고 거친 메모나 핵심 아이디어를 바탕으로, 고객에게 보낼 수 있도록 전문적이고 설득력 있는 브로커 화법의 코멘트로 다듬어 주세요.
출력 텍스트는 친근하면서도 전문적인 존댓말이어야 합니다.
중요 규칙: 입력에 없는 수치·기관명·법령·사례·시장 통계는 절대 만들지 말고, 입력에 담긴 사실만 사용하세요. 근거가 부족하면 단정 표현 대신 완곡하게 표현하세요.
반드시 한국어로 작성하고, 마크다운 기호 없이 가독성 좋은 줄바꿈으로만 출력해 주세요.`;

const NUM_RE = /(\d[\d,]*(?:\.\d+)?)\s*(%|억|만|천|원|평|㎡|배|건|명|년|개월|층|세)?/g;

function normalizeNumber(raw: string): string {
  return raw.replace(/,/g, '').replace(/^0+(?=\d)/, '');
}

/**
 * 출력에 있는 숫자 중 입력(context)에 없는 값을 찾는다.
 * 단위 없는 1~2자리 정수(번호·소소한 수사)는 무시한다.
 */
export function findNumbersNotInContext(output: string, context: string): string[] {
  const known = new Set<string>();
  for (const m of context.matchAll(NUM_RE)) known.add(normalizeNumber(m[1]));
  const unknown: string[] = [];
  for (const m of output.matchAll(NUM_RE)) {
    const num = normalizeNumber(m[1]);
    const unit = m[2];
    const isTrivial = !unit && /^\d{1,2}$/.test(num);
    if (isTrivial) continue;
    if (!known.has(num) && !unknown.includes(num)) unknown.push(num);
  }
  return unknown;
}

/** UI 경고 배지 문구 */
export const AI_COMMENT_WARNING_LABELS: Record<string, string> = {
  [AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT]: '입력에 없는 숫자가 포함되어 있습니다. 발행 전에 사실 여부를 확인하세요.',
};
