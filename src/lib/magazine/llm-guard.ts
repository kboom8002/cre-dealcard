/**
 * src/lib/magazine/llm-guard.ts — 매거진 LLM 호출 단일 래퍼 (C-02, DC-8, M2-08/M2-19/U2-08)
 *
 * 원칙
 *  1. Mock 응답은 공개 콘텐츠가 될 수 없다. 운영(NODE_ENV=production)에서는 항상 `allowMock:false`로 호출하고,
 *     Mock/실패 시 **예외**를 던진다. 호출부는 예외를 잡아 저장하지 않고 상위로 전달한다.
 *     (공유 llm-client 의 기본 동작은 바꾸지 않았다. 로컬 개발에서만 MAGAZINE_ALLOW_LLM_MOCK=true 로 허용.)
 *  2. 모델명 하드코딩 금지 → `getModel(tier)` (AI_MODEL_* / AI_DEFAULT_MODEL).
 *  3. 모든 시스템 프롬프트에 "입력에 없는 수치·기관·법령·사례 생성 금지" 규칙을 주입한다.
 *  4. 출력은 zod 스키마로 검증하고 독자에게 노출되면 안 되는 내부 문구("핵심 팩트|" 등)를 정제한다.
 *  5. Rule 11/48: 프롬프트에 바이너리/거대 페이로드가 들어가면 호출 전에 차단하고, 토큰 사용량을 로그/반환으로 남긴다.
 */
import { z } from 'zod';
import { callLLM, LLMMockNotAllowedError } from '@/ai/llm-client';
import { getModel, type ModelTier } from '@/ai/model-selector';
import { isMagazineLlmMockAllowed } from '@/lib/magazine/send-flags';
import { decodeEntities } from '@/lib/magazine/escape';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('magazine-llm-guard');

// ── 오류 ────────────────────────────────────────────────────────────

export type MagazineLlmFailureCode =
  | 'MOCK_RESPONSE'
  | 'LLM_FAILED'
  | 'EMPTY_RESPONSE'
  | 'INVALID_JSON'
  | 'SCHEMA_MISMATCH'
  | 'PROMPT_REJECTED';

export class MagazineLlmError extends Error {
  readonly code: MagazineLlmFailureCode;
  constructor(code: MagazineLlmFailureCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'MagazineLlmError';
    this.code = code;
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

// ── 프롬프트 공통 규칙 ───────────────────────────────────────────────

export const MAGAZINE_GROUNDING_RULES = `[공통 작성 규칙 — 반드시 준수]
- 입력(사용자 프롬프트)에 없는 수치·기관명·법령·사례·인물·회사명을 만들지 마십시오. 모르면 생략하십시오.
- 입력에 있는 숫자는 그대로 인용하고, 임의로 계산·반올림·추정하지 마십시오.
- 입력에 없는 지표(공실률, 거래량, 수익률, 세율 등)를 언급하지 마십시오.
- 근거가 부족한 문단은 쓰지 말고 짧게 끝내십시오. 일반론으로 분량을 채우지 마십시오.
- 매수/매도 권유, 수익 보장, 세무·법률 자문처럼 읽히는 표현을 쓰지 마십시오.
- 내부 라벨(예: "핵심 팩트", "임플리케이션")이나 JSON 키 이름을 본문에 노출하지 마십시오.`;

export function withGroundingRules(systemPrompt: string): string {
  return `${systemPrompt.trim()}\n\n${MAGAZINE_GROUNDING_RULES}`;
}

// ── 프롬프트 위생 (Rule 11) ──────────────────────────────────────────

/** LLM 프롬프트에 직렬화하면 안 되는 바이너리/이미지 필드 (Rule 11). */
export const PROMPT_FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  'cadastralMapImage',
  'mapImageUrl',
  'buffer',
  'staticMapImage',
  'mapImage',
  'thumbnailImage',
  'photos_v2',
  'photo_urls',
  'photoUrl',
  'photos',
  'layers',
]);

/** 호출 1회당 허용하는 프롬프트 총 길이(문자). 초과 시 호출 전에 차단 — 토큰 폭증 방지(Rule 48). */
export const MAX_PROMPT_CHARS = 30_000;

const DATA_URI_RE = /data:[a-z]+\/[a-z0-9.+-]+;base64,/i;
const LONG_BASE64_RE = /[A-Za-z0-9+/]{2000,}={0,2}/;

/** 객체를 프롬프트용 JSON 으로 직렬화하되 바이너리 필드·긴 문자열을 제거한다. */
export function serializeForPrompt(value: unknown, maxStringLen = 600): string {
  return JSON.stringify(
    value,
    (key, v) => {
      if (key && PROMPT_FORBIDDEN_KEYS.has(key)) return undefined;
      if (typeof v === 'string') {
        if (DATA_URI_RE.test(v) || LONG_BASE64_RE.test(v)) return undefined;
        return v.length > maxStringLen ? `${v.slice(0, maxStringLen)}…` : v;
      }
      return v;
    },
    0,
  );
}

function assertPromptSafe(systemPrompt: string, userPrompt: string): void {
  const total = systemPrompt.length + userPrompt.length;
  if (total > MAX_PROMPT_CHARS) {
    throw new MagazineLlmError('PROMPT_REJECTED', `프롬프트가 너무 깁니다 (${total}자 > ${MAX_PROMPT_CHARS}자)`);
  }
  if (DATA_URI_RE.test(userPrompt) || LONG_BASE64_RE.test(userPrompt)) {
    throw new MagazineLlmError('PROMPT_REJECTED', '프롬프트에 바이너리(base64) 데이터가 포함되어 있습니다');
  }
}

// ── 독자 노출 문구 정제 (U2-08) ──────────────────────────────────────

const INTERNAL_LABEL_RE = /(핵심\s*팩트|브로커\s*임플리케이션|임플리케이션)\s*[:：|]\s*/g;
const LEAK_RE = /\b(undefined|NaN|null)\b|\[object Object\]|"mocked"\s*:|mocked":true/i;

/** 뉴스 요약 "핵심 팩트: A | 브로커 임플리케이션: B" → "A" (U2-08 권장 정제). */
export function cleanNewsSummary(summary: string | null | undefined): string {
  if (!summary) return '';
  const first = decodeEntities(summary).split('|')[0] ?? '';
  return first.replace(/^\s*핵심\s*팩트\s*[:：]\s*/, '').replace(/\s+/g, ' ').trim();
}

/** 독자에게 보일 텍스트 정제: 엔티티 디코드, 코드펜스·내부 라벨 제거. */
export function sanitizeReaderText(text: string | null | undefined): string {
  if (!text) return '';
  return decodeEntities(text)
    .replace(/```[a-z]*\s*/gi, '')
    .replace(INTERNAL_LABEL_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** 정제 후에도 "undefined/NaN/[object Object]/mocked" 등 누수가 남았는지. */
export function hasReaderTextLeak(text: string): boolean {
  return LEAK_RE.test(text);
}

/** zod: 독자 노출 문자열 (정제 + 길이 + 누수 검사). */
export const zReaderText = (min = 1, max = 4000) =>
  z
    .string()
    .transform((s) => sanitizeReaderText(s))
    .pipe(z.string().min(min, '내용이 비어 있습니다').max(max, '내용이 너무 깁니다'))
    .refine((s) => !hasReaderTextLeak(s), '내부 값이 독자 문구에 노출되었습니다');

// ── 호출 ────────────────────────────────────────────────────────────

export interface MagazineLlmRequest {
  /** 로그/비용 집계용 호출 식별자 (예: 'weekly.briefing') */
  label: string;
  systemPrompt: string;
  userPrompt: string;
  /** 모델 계층. 기본 terra. 모델 슬러그는 getModel()이 결정한다. */
  tier?: ModelTier;
  temperature?: number;
  maxTokens?: number;
  /** true면 JSON object 응답 요청 (기본 false) */
  json?: boolean;
  timeoutMs?: number;
}

export interface MagazineLlmResponse {
  content: string;
  tokens: number;
  model: string;
  latencyMs: number;
  /** 로컬 MAGAZINE_ALLOW_LLM_MOCK=true 에서만 true 가 될 수 있다. 호출부는 isMock 콘텐츠를 발행하면 안 된다. */
  isMock: boolean;
}

/**
 * 매거진 LLM 호출. Mock/실패/빈 응답이면 MagazineLlmError 를 던진다 (호출부는 저장하지 말 것).
 */
export async function callMagazineLlm(req: MagazineLlmRequest): Promise<MagazineLlmResponse> {
  const systemPrompt = withGroundingRules(req.systemPrompt);
  assertPromptSafe(systemPrompt, req.userPrompt);
  const allowMock = isMagazineLlmMockAllowed();
  const model = getModel(req.tier ?? 'terra');

  let res;
  try {
    res = await callLLM(
      {
        systemPrompt,
        userPrompt: req.userPrompt,
        model,
        temperature: req.temperature ?? 0.4,
        maxTokens: req.maxTokens ?? 1200,
        responseFormat: req.json ? 'json_object' : undefined,
      },
      { allowMock, timeoutMs: req.timeoutMs ?? 60_000 },
    );
  } catch (err) {
    if (err instanceof LLMMockNotAllowedError || (err as { name?: string })?.name === 'LLMMockNotAllowedError') {
      throw new MagazineLlmError('MOCK_RESPONSE', 'AI 생성 실패: 실제 AI 응답을 받지 못했습니다 (Mock 응답 차단)', { cause: err });
    }
    throw new MagazineLlmError(
      'LLM_FAILED',
      `AI 생성 실패: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const isMock = (res as { isMock?: boolean }).isMock === true;
  if (isMock && !allowMock) {
    // 방어: allowMock:false 인데 Mock 이 반환된 경우(이론상 불가) — 저장 방지.
    throw new MagazineLlmError('MOCK_RESPONSE', 'AI 생성 실패: Mock 응답이 반환되었습니다');
  }
  const content = (res.content ?? '').trim();
  if (!content) {
    throw new MagazineLlmError('EMPTY_RESPONSE', 'AI 생성 실패: 빈 응답');
  }
  log.info(`[magazine-llm] ${req.label} model=${res.model ?? model} tokens=${res.tokens ?? 0} mock=${isMock}`);
  return { content, tokens: res.tokens ?? 0, model: res.model ?? model, latencyMs: res.latencyMs ?? 0, isMock };
}

/** LLM 출력에서 JSON 객체를 안전하게 꺼낸다 (코드펜스·앞뒤 설명 제거). */
export function parseLlmJson(content: string): unknown {
  const t = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  const body = start >= 0 && end > start ? t.slice(start, end + 1) : t;
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new MagazineLlmError('INVALID_JSON', 'AI 생성 실패: JSON 형식이 올바르지 않습니다', { cause: err });
  }
}

/** 호출 + JSON 파싱 + zod 검증. 스키마 불일치는 예외(저장 금지). */
export async function callMagazineJson<S extends z.ZodTypeAny>(
  req: MagazineLlmRequest,
  schema: S,
): Promise<{ data: z.infer<S>; response: MagazineLlmResponse }> {
  const response = await callMagazineLlm({ ...req, json: true });
  const raw = parseLlmJson(response.content);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new MagazineLlmError(
      'SCHEMA_MISMATCH',
      `AI 생성 실패: 출력 검증 실패 (${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')})`,
    );
  }
  return { data: parsed.data as z.infer<S>, response };
}
