// src/domain/building/mobile-im/golden-im-manager.ts
// Golden IM Set 자동 진화 파이프라인
// 브로커 승인된 IM → 자동 Golden 등록 → 동적 Few-shot 블록 생성
// 원본 참조: aihompyhub/goldenSetManager.ts

import { createServiceClient } from "@/lib/supabase/service";
import type { MobileIMSection, MobileIMSectionType } from "./types";

// ─── 인터페이스 ─────────────────────────────────────────────────────────────

export interface GoldenIMEntry {
  documentId: string;
  buildingId: string;
  assetType: string;
  priceBand: string;
  sectionType: string;
  markdown: string;
  judgeScore: number;
  approvedAt: string;
}

interface BrokerEdit {
  sectionType: string;
  originalMarkdown: string;
  editedMarkdown: string;
}

// ─── Golden 등록 기준 ────────────────────────────────────────────────────────

const MIN_JUDGE_SCORE = 3.5;    // Judge 점수 3.5 이상만 Golden
const MIN_MARKDOWN_LENGTH = 100; // 100자 이상의 콘텐츠만

/**
 * 브로커가 IM을 승인할 때 호출 — 품질이 충분하면 Golden Set에 자동 등록
 */
export async function markAsGoldenIM(
  documentId: string,
  buildingId: string,
  assetType: string,
  priceBand: string,
  sections: MobileIMSection[],
  brokerEdits?: BrokerEdit[],
  avgJudgeScore?: number,
): Promise<number> {
  const effectiveScore = avgJudgeScore ?? 4.0; // Judge 미실행 시 기본 4.0
  if (effectiveScore < MIN_JUDGE_SCORE) return 0;

  let goldenCount = 0;
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  for (const section of sections) {
    if (section.markdown.length < MIN_MARKDOWN_LENGTH) continue;
    if (section.confidence === 'needs_check') continue;

    const sectionScore = section.judge_score ?? effectiveScore;
    if (sectionScore < MIN_JUDGE_SCORE) continue;

    // 브로커가 수정한 최종본을 우선 사용
    const editedVersion = brokerEdits?.find(e => e.sectionType === section.section_type);
    const finalMarkdown = editedVersion?.editedMarkdown || section.markdown;

    try {
      await supabase.from('im_golden_sets').upsert({
        document_id:  documentId,
        building_id:  buildingId,
        asset_type:   assetType,
        price_band:   priceBand,
        section_type: section.section_type,
        markdown:     finalMarkdown.slice(0, 2000),
        judge_score:  sectionScore,
        was_edited:   !!editedVersion,
        source_type:  'auto_approve',
        approved_at:  now,
      }, {
        onConflict: 'document_id,section_type',
      });
      goldenCount++;
    } catch (err) {
      console.warn(`[golden-im] Failed to upsert golden for ${section.section_type}:`, err);
    }
  }

  return goldenCount;
}

/**
 * 동적 Few-shot 블록 생성 (Phase K)
 * 복합 가중치(품질 x 가격대 관련성 x 신선도 x 다양성)를 기반으로 최적의과거 IM 예시를 선택합니다.
 */
export async function buildIMFewShotBlock(
  assetType: string,
  priceBand: string,
  sectionType: MobileIMSectionType,
  limit: number = 2,
): Promise<{ formatted: string; usedIds: string[] }> {
  try {
    const supabase = createServiceClient();

    // 1. 같은 자산 유형의 활성 골든셋 조회 (버전, 편집 여부, 생성일 등 조회)
    const { data: matches } = await supabase
      .from('im_golden_sets')
      .select('id, document_id, markdown, asset_type, price_band, judge_score, usage_count, was_edited, created_at')
      .eq('section_type', sectionType)
      .eq('asset_type', assetType)
      .eq('is_active', true);

    let candidates = matches || [];

    // 2. 같은 자산 유형이 부족하면 전체 활성 골든셋에서 폴백 조회
    if (candidates.length < limit) {
      const { data: fallbackData } = await supabase
        .from('im_golden_sets')
        .select('id, document_id, markdown, asset_type, price_band, judge_score, usage_count, was_edited, created_at')
        .eq('section_type', sectionType)
        .eq('is_active', true);
      
      if (fallbackData && fallbackData.length > 0) {
        // 합치되 중복 제거
        const existingIds = new Set(candidates.map(c => c.id));
        for (const item of fallbackData) {
          if (!existingIds.has(item.id)) {
            candidates.push(item);
          }
        }
      }
    }

    if (candidates.length === 0) {
      return { formatted: '', usedIds: [] };
    }

    interface WeightedRow {
      id: string;
      document_id: string;
      markdown: string;
      asset_type: string;
      price_band: string;
      judge_score: number;
      usage_count: number;
      was_edited: boolean;
      created_at: string;
      selectionScore: number;
    }

    // 3. 각 후보별 복합 가중치 점수 계산
    const evaluated: WeightedRow[] = candidates.map(entry => {
      let score = 0;

      // A. 품질 점수 (최대 40점)
      const judgeVal = Number(entry.judge_score || 3.5);
      score += (judgeVal / 5.0) * 40;

      // B. 가격대 일치도 (최대 30점)
      if (priceBand && entry.price_band === priceBand) {
        score += 30;
      }

      // C. 신선도 점수 (최대 15점, 30일 이내 생성 시 가점)
      const ageMs = Date.now() - new Date(entry.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      score += Math.max(0, 15 - (ageDays / 30));

      // D. 다양성 패널티 (최대 15점, 과도하게 많이 사용된 퓨샷 감점)
      const usageCount = entry.usage_count || 0;
      score += Math.max(0, 15 - (usageCount * 0.5));

      // E. 브로커 검증 보너스 (5점)
      if (entry.was_edited) {
        score += 5;
      }

      return {
        ...entry,
        selectionScore: score,
      };
    });

    // 4. 가중치 점수 내림차순 정렬
    const sorted = evaluated.sort((a, b) => b.selectionScore - a.selectionScore);

    // 5. 동일 문서 중복 방지 (다양성 보장)
    const selected: WeightedRow[] = [];
    const seenDocIds = new Set<string>();
    
    for (const item of sorted) {
      if (selected.length >= limit) break;
      if (!seenDocIds.has(item.document_id)) {
        selected.push(item);
        seenDocIds.add(item.document_id);
      }
    }

    // fallback: 다 걸러져서 부족할 경우 중복 허용하여 채움
    if (selected.length < limit) {
      for (const item of sorted) {
        if (selected.length >= limit) break;
        if (!selected.some(s => s.id === item.id)) {
          selected.push(item);
        }
      }
    }

    // 6. 사용 추적 기록
    await trackGoldenUsage(supabase, selected);

    const formatted = formatFewShotBlock(selected, sectionType);
    const usedIds = selected.map(s => s.id);

    return { formatted, usedIds };
  } catch (err) {
    console.warn(`[golden-im] Failed to build few-shot block:`, err);
    return { formatted: '', usedIds: [] };
  }
}

function formatFewShotBlock(
  entries: Array<{ markdown: string; asset_type: string; price_band: string; judge_score?: number; was_edited?: boolean }>,
  sectionType: string,
): string {
  if (entries.length === 0) return '';

  const blocks = entries.map((e, i) => {
    const scoreStr = e.judge_score ? ` | 품질 ${e.judge_score.toFixed(1)}` : '';
    const editedStr = e.was_edited ? ' | 브로커 검증✅' : '';
    return `예시${i + 1} (${e.asset_type} / ${e.price_band}${scoreStr}${editedStr}):\n${e.markdown.slice(0, 700)}`;
  });

  return `[우수 IM 사례 — ${sectionType} 섹션 (참조용, 이 스타일로 작성하세요)]\n\n${blocks.join('\n\n')}`;
}

/**
 * Fine-tuning용 JSONL 내보내기
 * Golden Set의 입출력 쌍을 OpenAI/Gemini 파인튜닝 포맷으로 변환
 */
export async function exportGoldenForFinetune(
  systemPrompt: string,
  format: 'jsonl' | 'json' = 'jsonl',
): Promise<string> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('im_golden_sets')
      .select('section_type, markdown, asset_type, price_band')
      .gte('judge_score', 4.0)
      .limit(200);

    if (!data || data.length === 0) return '';

    interface GoldenRow { section_type: string; markdown: string; asset_type: string; price_band: string; }
    const records = (data as GoldenRow[]).map(r => ({
      messages: [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: `자산유형: ${r.asset_type}, 가격대: ${r.price_band}, 섹션: ${r.section_type}` },
        { role: 'assistant' as const, content: r.markdown },
      ],
    }));

    if (format === 'jsonl') return records.map(r => JSON.stringify(r)).join('\n');
    return JSON.stringify(records, null, 2);
  } catch (err) {
    console.warn('[golden-im] Failed to export for fine-tune:', err);
    return '';
  }
}

// ─── 사용 추적 헬퍼 ──────────────────────────────────────────────────────────

async function trackGoldenUsage(
  supabase: ReturnType<typeof createServiceClient>,
  entries: Array<{ id: string; usage_count: number }>,
): Promise<void> {
  const now = new Date().toISOString();
  for (const entry of entries) {
    try {
      await supabase
        .from('im_golden_sets')
        .update({
          usage_count: (entry.usage_count || 0) + 1,
          last_used_at: now,
        })
        .eq('id', entry.id);
    } catch {
      // 사용 추적 실패는 무시 (핵심 로직에 영향 없음)
    }
  }
}

// ─── Golden Version 생성 (Phase H1) ─────────────────────────────────────────

/**
 * 기존 Golden Set의 새 버전을 생성합니다.
 * 기존 레코드는 is_active=false로 비활성화하고, 새 레코드를 생성합니다.
 *
 * @param existingId - 기존 Golden Set ID
 * @param updatedMarkdown - 수정된 마크다운
 * @param updatedScore - 수정된 점수 (없으면 기존 점수 유지)
 * @returns 새로 생성된 레코드 ID 또는 null
 */
export async function createGoldenVersion(
  existingId: string,
  updatedMarkdown: string,
  updatedScore?: number,
): Promise<string | null> {
  const supabase = createServiceClient();

  // 1. 기존 레코드 조회
  const { data: existing } = await supabase
    .from('im_golden_sets')
    .select('*')
    .eq('id', existingId)
    .single();

  if (!existing) return null;

  // 2. 기존 버전 비활성화
  await supabase
    .from('im_golden_sets')
    .update({ is_active: false })
    .eq('id', existingId);

  // 3. 새 버전 생성
  const { data: newRow } = await supabase
    .from('im_golden_sets')
    .insert({
      document_id: existing.document_id,
      building_id: existing.building_id,
      section_type: existing.section_type,
      section_alias: existing.section_alias || '',
      asset_type: existing.asset_type,
      price_band: existing.price_band,
      markdown: updatedMarkdown,
      judge_score: updatedScore ?? existing.judge_score,
      was_edited: true,
      source_type: existing.source_type,
      tags: existing.tags || [],
      version: (existing.version || 1) + 1,
      parent_id: existingId,
      is_active: true,
    })
    .select('id')
    .single();

  return newRow?.id || null;
}
