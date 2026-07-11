// src/domain/building/mobile-im/golden-ingestion/section-segmenter.ts
// AI 기반 IM 문서 섹션 분할기
// ParsedDocument → 7섹션 SegmentedSection[]

import type { MobileIMSectionType } from "../types";
import { MOBILE_IM_SECTIONS_7 } from "../types";
import type { ParsedDocument } from "./file-parser";
import { resolveSection, type SectionResolveResult } from "./section-alias-resolver";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SegmentedSection {
  originalTitle: string;
  mappedType: MobileIMSectionType;
  confidence: number;
  markdown: string;
  pageRange: [number, number];
  needsReview: boolean;
}

// ─── AI 응답 스키마 ──────────────────────────────────────────────────────────

interface AISegmentResponse {
  sections: Array<{
    title: string;
    content: string;
    section_type_guess: string;
    start_page?: number;
    end_page?: number;
  }>;
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 상업용 부동산 투자설명서(IM) 분석 전문가입니다.
주어진 텍스트를 아래 7개 섹션으로 분리하고, 각 섹션의 내용을 마크다운으로 변환하세요.

[7개 섹션 정의]
1. property_overview — 자산 개요 (건물 기본 정보, 면적, 구조, 용도 등)
2. location_access — 입지 분석 (위치, 교통, 주변 환경, 상권)
3. lease_status — 임대차 현황 (렌트롤, 임차인 정보, 공실률)
4. income_analysis — 수익 분석 (NOI, 수익률, 캐시플로우, Cap Rate)
5. risk_check — 리스크 (법적/물리적/시장 리스크, 실사 체크)
6. investment_thesis — 투자 포인트 (핵심 투자 가치, 매수 근거)
7. next_steps — 거래 일정 (진행 절차, 타임라인)

[규칙]
- 원문의 내용을 최대한 보존하되, 마크다운 형식으로 정리하세요.
- 여러 페이지에 걸친 내용은 하나의 섹션으로 합치세요.
- 특정 섹션에 해당하지 않는 내용은 가장 관련 있는 섹션에 포함하세요.
- 각 섹션에 start_page와 end_page를 추정해 주세요.

반드시 JSON 형식으로 응답하세요:
{ "sections": [{ "title": "원본 섹션명", "content": "마크다운 내용", "section_type_guess": "위 7개 중 하나", "start_page": 1, "end_page": 3 }] }`;

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * ParsedDocument를 AI를 활용하여 7개 섹션으로 분할합니다.
 * section-alias-resolver로 섹션 타입 매핑 후 confidence 기반 review 표시.
 */
export async function segmentDocument(
  doc: ParsedDocument,
): Promise<SegmentedSection[]> {
  if (!doc.rawText.trim()) {
    return [];
  }

  try {
    const aiSections = await callAIForSegmentation(doc);
    return mapAISectionsToSegmented(aiSections);
  } catch (err) {
    console.error('[section-segmenter] AI 세그멘테이션 실패:', err);
    // 폴백: 전체 텍스트를 property_overview로 반환
    return [{
      originalTitle: '전체 문서',
      mappedType: 'property_overview',
      confidence: 0.3,
      markdown: doc.rawText.slice(0, 3000),
      pageRange: [1, doc.metadata.pageCount || 1],
      needsReview: true,
    }];
  }
}

// ─── AI 호출 ─────────────────────────────────────────────────────────────────

async function callAIForSegmentation(
  doc: ParsedDocument,
): Promise<AISegmentResponse> {
  const model = process.env.AI_IM_MODEL || process.env.AI_DEFAULT_MODEL || 'gpt-4o';

  const { OpenAI } = await import('openai');
  const client = new OpenAI();

  const sectionDefs = MOBILE_IM_SECTIONS_7.join(', ');

  const userContent = `[파일명] ${doc.metadata.fileName}
[파일형식] ${doc.metadata.fileType.toUpperCase()}
[총 페이지] ${doc.metadata.pageCount}

[섹션 타입 목록] ${sectionDefs}

[문서 전문]
${doc.rawText.slice(0, 12000)}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI 응답이 비어 있습니다.');
  }

  const parsed = JSON.parse(content) as AISegmentResponse;
  if (!parsed.sections || !Array.isArray(parsed.sections)) {
    throw new Error('AI 응답에 sections 배열이 없습니다.');
  }

  return parsed;
}

// ─── 매핑 ────────────────────────────────────────────────────────────────────

function mapAISectionsToSegmented(
  aiResponse: AISegmentResponse,
): SegmentedSection[] {
  return aiResponse.sections.map((s) => {
    // section_type_guess가 직접 MobileIMSectionType이면 그대로 사용
    const directMatch = MOBILE_IM_SECTIONS_7.includes(
      s.section_type_guess as MobileIMSectionType,
    );

    let resolved: SectionResolveResult;
    if (directMatch) {
      resolved = {
        type: s.section_type_guess as MobileIMSectionType,
        confidence: 0.95,
        matchedAlias: s.section_type_guess,
        method: 'exact',
      };
    } else {
      // title이나 guess로 alias resolver 호출
      resolved = resolveSection(s.title || s.section_type_guess);
    }

    return {
      originalTitle: s.title,
      mappedType: resolved.type,
      confidence: resolved.confidence,
      markdown: s.content || '',
      pageRange: [s.start_page || 1, s.end_page || 1] as [number, number],
      needsReview: resolved.confidence < 0.7,
    };
  });
}
