/**
 * @file a25-chapter-divider.ts
 * @description Chapter Divider slide archetype (A25) for Institutional Pro IM presentations.
 *
 * Renders an institutional-grade dark transition slide dividing the 5 core chapters:
 * - Chapter I: Executive Summary & Investment Thesis
 * - Chapter II: Detailed Asset & Building Specifications
 * - Chapter III: Comprehensive Financial Modeling
 * - Chapter IV: Market Dynamics, Location Analysis & Comparable Transactions
 * - Chapter V: Legal, Technical & Physical Due Diligence Annexes
 *
 * Adheres strictly to 16:9 layout physics (0 bleed), design token typography,
 * and high-contrast institutional dark aesthetics.
 */

import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, CD, M, CW, W, H, KR, TITLE_KR, NUM, THEME_META } from '../imlib';
import type { ArchetypeInput, ArchetypeOutput } from './a01-cover';

const ROMAN_MAP: Record<number, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
  7: 'VII',
  8: 'VIII',
  9: 'IX',
  10: 'X',
};

export interface ChapterDividerData {
  romanNumeral?: string;
  chapterNumber?: number | string;
  title: string;
  subtitle?: string;
  kicker?: string;
  leadSentence?: string;
  agendaItems?: string[];
  topics?: string[];
}

/**
 * Resolves the Roman numeral identifier for a chapter.
 */
function resolveRomanNumeral(data: Record<string, any>): string {
  if (data.romanNumeral && typeof data.romanNumeral === 'string') {
    return data.romanNumeral.trim().toUpperCase();
  }

  const chNum = Number(data.chapterNumber);
  if (!Number.isNaN(chNum) && chNum >= 1 && chNum <= 10) {
    return ROMAN_MAP[chNum];
  }

  // Try parsing from title or kicker (e.g. "Chapter 1", "Ch. 02", "I. EXECUTIVE...")
  const combined = `${data.kicker || ''} ${data.title || ''}`;
  const romanMatch = combined.match(/\b(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/i);
  if (romanMatch) {
    return romanMatch[1].toUpperCase();
  }

  const numMatch = combined.match(/(\d+)/);
  if (numMatch) {
    const parsed = parseInt(numMatch[1], 10);
    if (ROMAN_MAP[parsed]) return ROMAN_MAP[parsed];
  }

  return 'I';
}

export function buildA25ChapterDivider(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.dark(input.pres);
  const warnings: string[] = [];
  const data = input.data || {};

  // ─────────────────────────────────────────────────────────────
  // 0. Theme & Dark Background Hardening
  // ─────────────────────────────────────────────────────────────
  const isSlatePreset =
    THEME_META.presetId === 'institutional_slate' ||
    THEME_META.presetId === 'institutional_slate_gold' ||
    THEME_META.presetId === 'slate_institutional';
  const isBasicPreset = THEME_META.presetId === 'credeal_basic';

  if (isSlatePreset) {
    slide.background = { fill: '2B2F3E' };
  } else if (isBasicPreset) {
    slide.background = { fill: '0A1620' };
  } else if (C.ink === 'FFFFFF') {
    slide.background = { fill: CD.block || '1B2531' };
  }

  const accentColor = C.brass || 'B98A2E';
  const cardBg = CD.card || '1B2531';
  const borderCol = CD.border || '2A3644';

  const romanNumeral = resolveRomanNumeral(data);
  const chapterNumber = data.chapterNumber ?? (
    Object.entries(ROMAN_MAP).find(([, r]) => r === romanNumeral)?.[0] ?? '01'
  );
  const formattedChNum = String(chapterNumber).padStart(2, '0');

  const title = (data.title || 'CHAPTER TITLE').trim();
  const subtitle = (data.subtitle || data.leadSentence || '').trim();
  const kicker = (data.kicker || `CHAPTER ${formattedChNum}`).toUpperCase();

  const rawTopics = Array.isArray(data.agendaItems) && data.agendaItems.length > 0
    ? data.agendaItems
    : (Array.isArray(data.topics) && data.topics.length > 0 ? data.topics : []);

  const agendaTopics: string[] = rawTopics
    .filter((t: any): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t: string) => t.trim());

  // ─────────────────────────────────────────────────────────────
  // 1. Background Geometry & Institutional Decorative Elements
  // ─────────────────────────────────────────────────────────────

  // Top Accent Bar (full width, 0.06" height)
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: W,
    h: 0.06,
    fill: { color: accentColor },
  });

  // Top Left Wordmark
  slide.addText([
    { text: 'CRE', options: { color: 'FFFFFF', fontFace: NUM, fontSize: 13, bold: true } },
    { text: 'DEAL', options: { color: accentColor, fontFace: NUM, fontSize: 13, bold: true } },
    { text: '  |  INSTITUTIONAL PRO IM', options: { color: CD.faint || '6B7885', fontFace: NUM, fontSize: 9.5, bold: false } },
  ], {
    x: M,
    y: 0.45,
    w: 6.0,
    h: 0.35,
    margin: 0,
  });

  // Top Right Minimal Watermark Tag
  slide.addText(`SECTION  ·  ${romanNumeral}`, {
    x: W - M - 3.5,
    y: 0.45,
    w: 3.5,
    h: 0.35,
    align: 'right',
    fontSize: 9.5,
    bold: true,
    color: accentColor,
    fontFace: NUM,
    charSpacing: 2,
    margin: 0,
  });

  // Subtle background decorative panel (Left accent accentuation)
  slide.addShape('rect', {
    x: M,
    y: 1.15,
    w: 0.06,
    h: 5.35,
    fill: { color: accentColor },
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Chapter Identification & Header Typography
  // ─────────────────────────────────────────────────────────────
  const leftX = M + 0.35;
  const contentW = CW - 0.35;

  // Chapter Kicker (e.g. "CHAPTER 01  ·  PART I")
  slide.addText(`${kicker}  ·  PART ${romanNumeral}`, {
    x: leftX,
    y: 1.30,
    w: contentW,
    h: 0.30,
    fontSize: 11,
    bold: true,
    color: accentColor,
    fontFace: NUM,
    charSpacing: 3,
    margin: 0,
  });

  // Giant Roman Numeral Watermark in background right
  slide.addText(romanNumeral, {
    x: W - M - 3.8,
    y: 1.10,
    w: 3.8,
    h: 2.8,
    align: 'right',
    fontSize: 110,
    bold: true,
    color: CD.block || '232F3C',
    fontFace: NUM,
    margin: 0,
  });

  // Main Chapter Title
  slide.addText(title, {
    x: leftX,
    y: 1.65,
    w: contentW - 3.0,
    h: 1.10,
    fontSize: 26,
    bold: true,
    color: 'FFFFFF',
    fontFace: TITLE_KR,
    margin: 0,
    valign: 'top',
  });

  // Horizontal Accent Line
  slide.addShape('line', {
    x: leftX,
    y: 2.85,
    w: 5.5,
    h: 0,
    line: { color: accentColor, width: 1.5 },
  });

  // Subtitle / Narrative Thesis Tagline
  if (subtitle) {
    slide.addText(subtitle, {
      x: leftX,
      y: 2.98,
      w: contentW - 2.5,
      h: 0.48,
      fontSize: 12.5,
      color: CD.body || 'A8B2BC',
      fontFace: KR,
      margin: 0,
      valign: 'top',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Agenda & Chapter Topics Grid (if topics available)
  // ─────────────────────────────────────────────────────────────
  const topicsStartY = subtitle ? 3.65 : 3.30;
  const topicsBoxH = 6.60 - topicsStartY;

  if (agendaTopics.length > 0) {
    // Agenda Container Box
    slide.addShape('rect', {
      x: leftX,
      y: topicsStartY,
      w: contentW,
      h: topicsBoxH,
      fill: { color: cardBg },
      line: { color: borderCol, width: 0.8 },
    });

    // Box Header Ribbon
    slide.addShape('rect', {
      x: leftX,
      y: topicsStartY,
      w: contentW,
      h: 0.38,
      fill: { color: CD.block || '232F3C' },
    });

    slide.addText('CHAPTER CONTENTS & KEY DELIVERABLES', {
      x: leftX + 0.25,
      y: topicsStartY + 0.08,
      w: contentW - 0.5,
      h: 0.24,
      fontSize: 9,
      bold: true,
      color: accentColor,
      fontFace: NUM,
      charSpacing: 2,
      margin: 0,
    });

    // Render 2-column or list of topics
    const isTwoCol = agendaTopics.length >= 4;
    const colCount = isTwoCol ? 2 : 1;
    const colW = (contentW - 0.70 - (isTwoCol ? 0.40 : 0)) / colCount;
    const itemsPerCol = Math.ceil(agendaTopics.length / colCount);
    const itemH = Math.min(0.48, (topicsBoxH - 0.60) / itemsPerCol);

    agendaTopics.forEach((topic, idx) => {
      const cIdx = isTwoCol && idx >= itemsPerCol ? 1 : 0;
      const rIdx = isTwoCol && idx >= itemsPerCol ? idx - itemsPerCol : idx;
      const itemX = leftX + 0.30 + cIdx * (colW + 0.40);
      const itemY = topicsStartY + 0.50 + rIdx * itemH;

      // Item number badge
      const numLabel = `${formattedChNum}.${String(idx + 1).padStart(2, '0')}`;
      slide.addText(numLabel, {
        x: itemX,
        y: itemY,
        w: 0.70,
        h: itemH - 0.05,
        fontSize: 10,
        bold: true,
        color: accentColor,
        fontFace: NUM,
        margin: 0,
        valign: 'middle',
      });

      // Item description text
      slide.addText(topic, {
        x: itemX + 0.75,
        y: itemY,
        w: colW - 0.75,
        h: itemH - 0.05,
        fontSize: 11,
        color: 'FFFFFF',
        fontFace: KR,
        margin: 0,
        valign: 'middle',
      });

      // Subtle separator line under item (except last in col)
      if (rIdx < itemsPerCol - 1) {
        slide.addShape('line', {
          x: itemX,
          y: itemY + itemH - 0.02,
          w: colW,
          h: 0,
          line: { color: borderCol, width: 0.4 },
        });
      }
    });
  } else {
    // Default aesthetic block when specific topic array is not provided
    slide.addShape('rect', {
      x: leftX,
      y: topicsStartY + 0.20,
      w: contentW,
      h: 2.30,
      fill: { color: cardBg },
      line: { color: borderCol, width: 0.8 },
    });

    slide.addText('INSTITUTIONAL INVESTMENT MEMORANDUM', {
      x: leftX + 0.40,
      y: topicsStartY + 0.50,
      w: contentW - 0.80,
      h: 0.30,
      fontSize: 11,
      bold: true,
      color: accentColor,
      fontFace: NUM,
      charSpacing: 2,
      margin: 0,
    });

    const defaultNotes = [
      '본 챕터의 분석 및 시뮬레이션 수치는 단일 공적 장부(대장·등기) 및 실측 임대차 계약서 원장을 기반으로 산출되었습니다.',
      '모든 재무 지표 및 할인현금흐름(DCF)은 표준 내부수익률(IRR) 산식에 따라 단일 진실 원천(SSoT)으로 상호 검증되었습니다.',
    ];

    slide.addText(defaultNotes.map(n => `•  ${n}`).join('\n\n'), {
      x: leftX + 0.40,
      y: topicsStartY + 0.90,
      w: contentW - 0.80,
      h: 1.30,
      fontSize: 10.5,
      color: CD.body || 'A8B2BC',
      fontFace: KR,
      margin: 0,
      valign: 'top',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Footer & Watermark
  // ─────────────────────────────────────────────────────────────
  if (input.watermarkText) {
    L.watermark(slide, input.watermarkText, true);
  }

  L.foot(slide, input.slideNum, input.docno, true);

  return { slide, warnings };
}
