// src/domain/building/mobile-im/translator.ts
// 다국어 IM 자동 번역 — GPT-4o 기반 (영어, 중국어 간체, 일본어)
import { callLLM } from '@/ai/llm-client';

export type IMLanguage = 'ko' | 'en' | 'zh' | 'ja';

export interface TranslationInput {
  sections: Array<{ title: string; content: string; sectionId?: string }>;
  language: IMLanguage;
  assetType?: string;
  areaSignal?: string;
  posture?: string;
}

const LANGUAGE_NAMES: Record<IMLanguage, string> = {
  ko: '한국어',
  en: 'English',
  zh: '简体中文',
  ja: '日本語',
};

const TRANSLATION_SYSTEM = `You are a professional real estate investment memorandum translator specializing in Korean commercial real estate.
Translate the provided Investment Memorandum sections accurately while:
1. Preserving all markdown formatting (tables, bold, headers, blockquotes)
2. Keeping all numbers, percentages, and KRW amounts unchanged
3. Using professional real estate terminology in the target language
4. Keeping property-specific terms (e.g. 지식산업센터, GBD, YBD) in Korean with a translation note
5. Maintaining the same professional tone as the original`;

export async function translateIMSections(
  input: TranslationInput
): Promise<TranslationInput['sections']> {
  if (input.language === 'ko') return input.sections;

  const postureGlossary = input.posture === 'development'
    ? 'Use development-specific CRE terms: FAR, BCR, land cost, feasibility, PF loan...'
    : input.posture === 'operating'
    ? 'Use hospitality/operating terms: ADR, OccRate, RevPAR, GOP margin...'
    : input.posture === 'trading'
    ? 'Use trading terms: price per pyeong, holding period, comparable transactions...'
    : input.posture === 'owner_occupied'
    ? 'Use owner-occupied terms: self-use area, own-vs-lease savings, breakeven...'
    : 'Use income CRE terms: NOI, Cap Rate, DSCR, vacancy, lease terms...';

  const targetLang = LANGUAGE_NAMES[input.language];
  const sectionsText = input.sections
    .map((s, i) => `=== SECTION ${i + 1}: ${s.title} ===\n${s.content}`)
    .join('\n\n');

  const result = await callLLM(
    {
      systemPrompt: TRANSLATION_SYSTEM + '\n' + postureGlossary,
      userPrompt: `Translate the following Korean real estate IM sections to ${targetLang}.\nReturn ONLY the translated sections in the same === SECTION N: title === format.\n\n${sectionsText}`,
      model: process.env.AI_IM_MODEL || 'gpt-5.4',
      temperature: 0.1,
      maxTokens: 4000,
    },
    {
      timeoutMs: 60000,
      cacheKey: `translate-${input.language}-${JSON.stringify(input.sections.map((s) => s.title)).slice(0, 80)}`,
    }
  );

  const text = result.content;
  const sectionMatches = [...text.matchAll(/=== SECTION \d+: (.+?) ===\n([\s\S]*?)(?==== SECTION|$)/g)];

  if (sectionMatches.length === 0) {
    return input.sections;
  }

  const results = input.sections.map((orig, i) => {
    const match = sectionMatches[i];
    if (match) {
      return { ...orig, title: match[1].trim(), content: match[2].trim() };
    }
    // fallback: 원본 유지 + 경고 로깅
    console.warn(`[translator] Section ${i} (${orig.title}) translation parse failed, keeping original`);
    return orig;
  });
  return results;
}
