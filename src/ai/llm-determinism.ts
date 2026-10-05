/**
 * H4 결정성 헬퍼 — fs 의존 없음 (어떤 모듈에서도 import 가능).
 *
 * LLM_MODE 가 record / replay / record-missing 이면 녹화 키(=정규화 프롬프트 해시)가
 * 실행마다 같아야 재생이 성립한다. 이 모드에서는 프롬프트/호출 집합을 흔드는
 * 비결정 입력(무작위 A/B 변형, 확률적 Judge 샘플링, DB 상태 의존 RAG·동적 few-shot)을
 * 고정하거나 끈다. live(운영) 동작은 바뀌지 않는다.
 */
export function isDeterministicLLMMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const m = (env.LLM_MODE ?? '').toLowerCase();
  return m === 'record' || m === 'replay' || m === 'record-missing';
}
