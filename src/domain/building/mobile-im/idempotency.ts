/**
 * @file idempotency.ts
 * @description IM 생성 멱등키 산출 (D29 BL-7)
 * 정본: D26 §4 — sha256(dealId + inputHash + ontologyVersion + lexiconVersion + promptVersion + rendererVersion + posture)
 * 같은 키면 진행 중 작업에 붙습니다. PublishRecord에 버전 조합 Pin을 저장합니다.
 */
import { createHash } from 'crypto';
import { PROMPT_VERSION } from './prompt-version';

/** 온톨로지 버전 — ontology 모듈에서 가져오되 없으면 하드코딩 */
const ONTOLOGY_VERSION = 'v0.5.0';

/** 어휘 사전 버전 */
const LEXICON_VERSION = 'lex-2026.08.1';

export interface IdempotencyParams {
  dealId: string;
  /** JSON.stringify(requestBody) → sha256 */
  inputHash: string;
  posture: string;
  /** package.json version or renderer tag */
  rendererVersion?: string;
}

/**
 * 멱등키를 산출합니다.
 * 같은 입력 + 같은 코드 버전이면 같은 키가 나옵니다.
 * 프롬프트를 바꾸면 PROMPT_VERSION이 바뀌므로 키도 바뀌어 캐시를 무효화합니다.
 */
export function computeIdempotencyKey(params: IdempotencyParams): string {
  const source = [
    params.dealId,
    params.inputHash,
    ONTOLOGY_VERSION,
    LEXICON_VERSION,
    PROMPT_VERSION,
    params.rendererVersion ?? '1.0.0',
    params.posture,
  ].join('|');
  return createHash('sha256').update(source).digest('hex');
}

/**
 * 요청 본문에서 입력 해시를 산출합니다.
 * 사진 URL 등 비결정적 필드는 제외합니다.
 */
export function computeInputHash(requestBody: Record<string, unknown>): string {
  const { photo_urls, photos_v2, ...deterministic } = requestBody;
  const json = JSON.stringify(deterministic, Object.keys(deterministic).sort());
  return createHash('sha256').update(json).digest('hex');
}

export interface VersionPin {
  ontologyVersion: string;
  promptVersion: string;
  lexiconVersion: string;
  rendererVersion: string;
  idempotencyKey: string;
}

export function createVersionPin(params: IdempotencyParams): VersionPin {
  return {
    ontologyVersion: ONTOLOGY_VERSION,
    promptVersion: PROMPT_VERSION,
    lexiconVersion: LEXICON_VERSION,
    rendererVersion: params.rendererVersion ?? '1.0.0',
    idempotencyKey: computeIdempotencyKey(params),
  };
}
