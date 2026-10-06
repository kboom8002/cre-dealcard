// src/domain/building/mobile-im/cre-gate-repair.ts
// ──────────────────────────────────────────────────────────────────────────────
// CRE Quality Gate high-risk 1회 교정 (self-refine)
//
// 배경 (2026-10-05 p5 실측): investment_thesis AI 초안이 '원금 보전력' 같은 문구 1개로
// investment_guarantee(high) 판정 → 섹션 전체가 프리미엄 템플릿으로 교체되어
// 수치 근거가 풍부한 AI 문장이 사라졌다.
//
// 원칙
// - 게이트가 지적한 발췌만 최소 수정 (구조·수치 유지). 새 수치 도입 금지 (Rule 34).
// - 결정적 검증: 교정본의 모든 수치 토큰이 원문에 존재해야 하고, 길이가 원문의 50% 이상이어야 함.
// - 교정본은 반드시 게이트를 다시 통과(low/medium)해야 채택 — 아니면 기존 fail-closed(템플릿) 유지.
// - 게이트 시스템 실패(SAFE_DEFAULT)는 교정 대상이 아님 (BL-6 fail-closed 그대로).
// ──────────────────────────────────────────────────────────────────────────────

import { callLLM } from "@/ai/llm-client";
import type { CREQualityIssue } from "./cre-quality-gate";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('cre-gate-repair');

const SYSTEM_FAILURE_EXCERPT = '[LLM 검사기 호출 실패]';
const REPAIR_TIMEOUT_MS = 60_000;

/** 게이트 시스템 실패(fail-closed 기본값)인지 — 이 경우 교정하지 않는다 */
export function isGateSystemFailure(issues: CREQualityIssue[]): boolean {
  return issues.some((i) => i.excerpt === SYSTEM_FAILURE_EXCERPT);
}

/** 수치 토큰 추출 (천단위 콤마 제거, 소수 포함) */
export function extractNumberTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = m[0].replace(/,/g, '').replace(/\.0+$/, '');
    if (n) out.add(n);
  }
  return out;
}

/**
 * 교정본 결정적 검증.
 * - 비어있지 않고 원문 길이의 50% 이상
 * - 원문에 없던 수치를 새로 만들지 않음 (데이터 창작 차단)
 */
export function validateRepair(original: string, repaired: string): { ok: boolean; reason?: string } {
  const r = repaired.trim();
  if (!r) return { ok: false, reason: 'empty' };
  if (r.length < original.trim().length * 0.5) return { ok: false, reason: 'too_short' };
  const orig = extractNumberTokens(original);
  const added = [...extractNumberTokens(r)].filter((n) => !orig.has(n));
  if (added.length > 0) return { ok: false, reason: `new_numbers:${added.slice(0, 5).join(',')}` };
  return { ok: true };
}

export function buildRepairPrompts(markdown: string, sectionType: string, issues: CREQualityIssue[]): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `당신은 한국 상업용 부동산(CRE) 투자 자료의 컴플라이언스 편집자입니다.
검토자가 지적한 문장만 최소한으로 고쳐 쓰고, 나머지 문장·마크다운 구조·불릿 수·모든 수치는 그대로 유지하세요.

규칙
- 지적된 표현을 객관적 사실 서술로 바꾸세요 (보장·단정·권유·주관적 가격평가 표현 제거).
- 원문에 없는 수치·사실·출처를 새로 추가하지 마세요.
- 지적되지 않은 문장은 한 글자도 바꾸지 마세요.
- 원문의 문체(존댓말 '~습니다/~입니다')와 불릿 제목 형식을 그대로 유지하세요.
- 설명 없이 교정된 마크다운 본문만 출력하세요.`;
  const issueLines = issues
    .map((i, idx) => `${idx + 1}. [${i.type}] 발췌: "${i.excerpt}"\n   수정 제안: ${i.suggestion || '객관적 사실 서술로 변경'}`)
    .join('\n');
  const userPrompt = `## 섹션: ${sectionType}

## 검토자 지적 사항
${issueLines}

## 원문
\`\`\`markdown
${markdown}
\`\`\``;
  return { systemPrompt, userPrompt };
}

/**
 * high-risk 지적 사항을 1회 교정한다. 결정적 검증 실패/LLM 실패 시 null.
 * (채택 여부의 최종 판단은 호출부에서 게이트 재검증으로 수행)
 */
export async function repairDraftForGate(
  markdown: string,
  sectionType: string,
  issues: CREQualityIssue[],
  model: string,
  maxTokens: number,
): Promise<string | null> {
  if (issues.length === 0 || isGateSystemFailure(issues)) return null;
  try {
    const { systemPrompt, userPrompt } = buildRepairPrompts(markdown, sectionType, issues);
    const result = await callLLM(
      { systemPrompt, userPrompt, model, temperature: 0, maxTokens },
      { timeoutMs: REPAIR_TIMEOUT_MS, allowMock: process.env.NODE_ENV === 'test' },
    );
    const repaired = result.content.trim()
      .replace(/^```(?:markdown|md)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    const v = validateRepair(markdown, repaired);
    if (!v.ok) {
      log.warn(`[cre-gate-repair] ${sectionType} 교정본 거부 (${v.reason})`);
      return null;
    }
    return repaired;
  } catch (err) {
    log.warn({ err }, `[cre-gate-repair] ${sectionType} 교정 호출 실패`);
    return null;
  }
}
