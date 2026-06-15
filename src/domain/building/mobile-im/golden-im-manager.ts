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
        judge_score:  effectiveScore,
        was_edited:   !!editedVersion,
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
 * 동적 Few-shot 블록 생성
 * 같은 자산 유형 + 비슷한 가격대의 과거 승인 IM에서 해당 섹션 예시를 검색
 */
export async function buildIMFewShotBlock(
  assetType: string,
  priceBand: string,
  sectionType: MobileIMSectionType,
  limit: number = 2,
): Promise<string> {
  try {
    const supabase = createServiceClient();

    // 같은 자산 유형 우선, 같은 가격대 우선
    const { data } = await supabase
      .from('im_golden_sets')
      .select('markdown, asset_type, price_band, judge_score')
      .eq('section_type', sectionType)
      .eq('asset_type', assetType)
      .order('judge_score', { ascending: false })
      .limit(limit * 3); // 더 많이 가져와서 필터링

    if (!data || data.length === 0) {
      // 같은 자산 유형이 없으면 전체에서 검색
      const { data: fallbackData } = await supabase
        .from('im_golden_sets')
        .select('markdown, asset_type, price_band, judge_score')
        .eq('section_type', sectionType)
        .order('judge_score', { ascending: false })
        .limit(limit);

      if (!fallbackData || fallbackData.length === 0) return '';
      return formatFewShotBlock(fallbackData, sectionType);
    }

    // 같은 가격대 우선 정렬
    interface GoldenRow {
      markdown: string;
      asset_type: string;
      price_band: string;
      judge_score: number;
    }
    const sorted = (data as GoldenRow[]).sort((a, b) => {
      const aMatch = a.price_band === priceBand ? 1 : 0;
      const bMatch = b.price_band === priceBand ? 1 : 0;
      return bMatch - aMatch || b.judge_score - a.judge_score;
    });

    return formatFewShotBlock(sorted.slice(0, limit), sectionType);
  } catch (err) {
    console.warn(`[golden-im] Failed to build few-shot block:`, err);
    return '';
  }
}

function formatFewShotBlock(
  entries: Array<{ markdown: string; asset_type: string; price_band: string }>,
  sectionType: string,
): string {
  if (entries.length === 0) return '';

  const blocks = entries.map((e, i) =>
    `예시${i + 1} (${e.asset_type} / ${e.price_band}):\n${e.markdown.slice(0, 500)}`
  );

  return `[우수 IM 사례 — ${sectionType} 섹션 (참조용, 이 스타일로 작성하세요)]\n${blocks.join('\n\n')}`;
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
