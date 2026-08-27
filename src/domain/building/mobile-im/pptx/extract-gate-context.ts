/**
 * extractGateContext — ParsedSlide[] → GateContext
 *
 * PPTX 파서 출력을 기존 품질 게이트에 연결하여
 * 실제 산출물에서 위반을 탐지합니다.
 */
import type { ParsedSlide, ParsedImage, ParsedShape } from './pptx-parser';
import type { GateContext } from '../quality-gates-v02';

// ─── 슬라이드 물리 상수 (16:9 LAYOUT_WIDE) ──────────
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const SAFE_MARGIN = 0.31; // 절반 여백

// ─── 텍스트 넘침 추정 ────────────────────────────────
// CJK 문자 너비 계수: text-budget.ts와 동일
const CJK_CHAR_WIDTH_AT_10PT = 0.19; // inches

function estimateTextOverflow(shape: ParsedShape): boolean {
  if (!shape.text || shape.position.cx <= 0 || shape.position.cy <= 0) return false;
  const fontSize = shape.fontSize ?? 10;
  const charWidth = CJK_CHAR_WIDTH_AT_10PT * (fontSize / 10);
  const lineHeight = fontSize / 72 * 1.4; // pt→in, 140% line height
  const charsPerLine = Math.floor(shape.position.cx / charWidth);
  if (charsPerLine <= 0) return false;
  const lineCount = Math.ceil(shape.text.length / charsPerLine);
  const neededHeight = lineCount * lineHeight;
  return neededHeight > shape.position.cy * 1.05; // 5% tolerance
}

// ─── 요소 겹침 계산 ─────────────────────────────────
function calculateOverlap(a: ParsedShape, b: ParsedShape): number {
  const ax1 = a.position.x, ax2 = a.position.x + a.position.cx;
  const ay1 = a.position.y, ay2 = a.position.y + a.position.cy;
  const bx1 = b.position.x, bx2 = b.position.x + b.position.cx;
  const by1 = b.position.y, by2 = b.position.y + b.position.cy;

  const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
  const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));

  if (overlapX <= 0 || overlapY <= 0) return 0;
  return Math.max(overlapX, overlapY); // max overlap in inches
}

// ─── 지면 이탈 검사 ─────────────────────────────────
function isBleed(shape: ParsedShape): boolean {
  if (shape.position.cx <= 0 && shape.position.cy <= 0) return false;
  const right = shape.position.x + shape.position.cx;
  const bottom = shape.position.y + shape.position.cy;
  return (
    shape.position.x < -0.01 ||
    shape.position.y < -0.01 ||
    right > SLIDE_W + 0.01 ||
    bottom > SLIDE_H + 0.01
  );
}

// ─── 만실↔공실 서술어 모순 탐지 ─────────────────────
const FULL_OCCUPANCY_PATTERNS = /만실|전실|공실\s*(없|0%|zero)|100%\s*입주|full\s*occupancy/i;
const VACANCY_MENTION_PATTERNS = /공실률?\s*(\d+[\d.]*)\s*%/g;

function detectVacancyContradiction(allTexts: string[]): boolean {
  const fullText = allTexts.join('\n');
  const hasFull = FULL_OCCUPANCY_PATTERNS.test(fullText);

  let maxVacancy = 0;
  const matches = fullText.matchAll(VACANCY_MENTION_PATTERNS);
  for (const m of matches) {
    const pct = parseFloat(m[1]);
    if (!isNaN(pct)) maxVacancy = Math.max(maxVacancy, pct);
  }

  // 만실 서술 + 공실률 > 5%
  if (hasFull && maxVacancy > 5) return true;
  // 공실 강조 + 공실률 0%
  const hasVacancyEmphasis = /높은\s*공실|공실\s*심각|공실\s*리스크|공실\s*우려/i.test(fullText);
  if (hasVacancyEmphasis && maxVacancy === 0) return true;

  return false;
}

// ─── 폴백 중복 탐지 ─────────────────────────────────
function countFallbackDuplicates(slides: ParsedSlide[]): number {
  const contentMap = new Map<string, number>();
  for (const slide of slides) {
    for (const text of slide.texts) {
      const normalized = text.trim().substring(0, 200);
      if (normalized.length < 30) continue; // 짧은 텍스트 제외
      contentMap.set(normalized, (contentMap.get(normalized) ?? 0) + 1);
    }
  }
  let dupes = 0;
  for (const count of contentMap.values()) {
    if (count > 1) dupes += count - 1;
  }
  return dupes;
}

// ─── 괄호 균형 검사 ─────────────────────────────────
function countUnclosedBrackets(allTexts: string[]): number {
  let count = 0;
  for (const text of allTexts) {
    // 문장 끝에 열린 괄호/인용부호
    if (/[(\[「『"']\s*$/.test(text.trim())) count++;
    // 닫히지 않은 괄호 (단순 카운트)
    const opens = (text.match(/[(\[「『]/g) ?? []).length;
    const closes = (text.match(/[)\]」』]/g) ?? []).length;
    if (opens > closes) count++;
  }
  return count;
}

// ─── 라벨↔내용 정합 검사 ────────────────────────────
function countLabelMismatch(slides: ParsedSlide[]): number {
  let mismatches = 0;
  for (const slide of slides) {
    // 제목(kicker/title)과 내용 텍스트의 키워드 일치 여부
    const titleShapes = slide.shapes.filter(s =>
      s.type === 'text' && s.text &&
      (s.position.y < 1.0) && // 상단 영역
      s.text.length < 50, // 짧은 텍스트 = 제목
    );
    const bodyTexts = slide.texts.filter(t => t.length > 50);
    if (titleShapes.length === 0 || bodyTexts.length === 0) continue;

    // 제목에 "입지" 있는데 본문에 입지/위치/교통/역세 없으면 불일치
    // 간소화: 특정 키워드 매칭
    // 복잡한 구현은 추후 — 현재는 구조적 검사만
  }
  return mismatches;
}

// ─── 메인 함수 ───────────────────────────────────────
export function extractGateContext(slides: ParsedSlide[]): Partial<GateContext> {
  const allTexts: string[] = [];
  const allImages: ParsedImage[] = [];
  const allShapes: ParsedShape[] = [];

  for (const slide of slides) {
    allTexts.push(...slide.texts);
    allImages.push(...slide.images);
    allShapes.push(...slide.shapes);
  }

  // ── 이미지 물리 (G31~G37) ──
  const maxCropRatio = allImages.length > 0
    ? Math.max(...allImages.map(img => img.cropRatio))
    : 0;

  const minEffectiveDpi = allImages.length > 0
    ? Math.min(...allImages.filter(img => img.effectiveDpi > 0).map(img => img.effectiveDpi))
    : 999;

  const aspectDistortionMaxPct = allImages.length > 0
    ? Math.max(...allImages.map(img => img.aspectDistortionPct))
    : 0;

  // ── 텍스트 넘침 (G33) ──
  let textOverflowCount = 0;
  for (const shape of allShapes) {
    if (shape.type === 'text' && estimateTextOverflow(shape)) {
      textOverflowCount++;
    }
  }

  // ── 요소 겹침 (G34) ──
  let overlapMaxInches = 0;
  for (let si = 0; si < slides.length; si++) {
    const slideShapes = slides[si].shapes.filter(s => s.position.cx > 0);
    for (let a = 0; a < slideShapes.length; a++) {
      for (let b = a + 1; b < slideShapes.length; b++) {
        const ov = calculateOverlap(slideShapes[a], slideShapes[b]);
        if (ov > overlapMaxInches) overlapMaxInches = ov;
      }
    }
  }
  overlapMaxInches = Math.round(overlapMaxInches * 1000) / 1000;

  // ── 지면 이탈 (G35) ──
  let bleedCount = 0;
  for (const shape of allShapes) {
    if (isBleed(shape)) bleedCount++;
  }

  // ── 만실↔공실 서술어 모순 (G41) ──
  const vacancyNarrativeContradiction = detectVacancyContradiction(allTexts);

  // ── 폴백 중복 (G42) ──
  const fallbackDuplicateCount = countFallbackDuplicates(slides);

  // ── 괄호 균형 (G44) ──
  const unclosedBracketCount = countUnclosedBrackets(allTexts);

  // ── 라벨↔내용 불일치 (G39) ──
  const labelContentMismatchCount = countLabelMismatch(slides);

  // ── 면수 (G52) ──
  const pageCountExceeded = slides.length > 16;

  // ── 외국 사진 (G37): 0으로 초기화 (런타임에서만 판정 가능) ──
  const foreignPhotoCount = 0;

  return {
    maxCropRatio,
    minEffectiveDpi: minEffectiveDpi === Infinity ? 0 : minEffectiveDpi,
    textOverflowCount,
    overlapMaxInches,
    bleedCount,
    aspectDistortionMaxPct,
    vacancyNarrativeContradiction,
    fallbackDuplicateCount,
    unclosedBracketCount,
    labelContentMismatchCount,
    pageCountExceeded,
    foreignPhotoCount,
  };
}

// ─── 요약 리포트 생성 ────────────────────────────────
export interface PptxAuditReport {
  slideCount: number;
  imageCount: number;
  textCount: number;
  gateContext: Partial<GateContext>;
  layoutViolations: string[];
  standardViolations: string[];
}

export function generateAuditReport(
  slides: ParsedSlide[],
  gateCtx: Partial<GateContext>,
): PptxAuditReport {
  const layoutViolations: string[] = [];
  const standardViolations: string[] = [];

  // Layout violations (G31~G36)
  if ((gateCtx.maxCropRatio ?? 0) >= 0.45)
    layoutViolations.push(`G31: 크로핑률 ${((gateCtx.maxCropRatio ?? 0) * 100).toFixed(1)}% ≥ 45%`);
  if ((gateCtx.minEffectiveDpi ?? 999) < 150)
    layoutViolations.push(`G32: DPI ${gateCtx.minEffectiveDpi} < 150`);
  if ((gateCtx.textOverflowCount ?? 0) > 0)
    layoutViolations.push(`G33: 텍스트 넘침 ${gateCtx.textOverflowCount}건`);
  if ((gateCtx.overlapMaxInches ?? 0) > 0.015)
    layoutViolations.push(`G34: 겹침 ${gateCtx.overlapMaxInches}in > 0.015in`);
  if ((gateCtx.bleedCount ?? 0) > 0)
    layoutViolations.push(`G35: 지면 이탈 ${gateCtx.bleedCount}건`);
  if ((gateCtx.aspectDistortionMaxPct ?? 0) > 5)
    layoutViolations.push(`G36: 왜곡 ${gateCtx.aspectDistortionMaxPct}% > 5%`);

  // Standard violations (G41~G44)
  if (gateCtx.vacancyNarrativeContradiction)
    standardViolations.push('G41: 만실↔공실 서술어 모순');
  if ((gateCtx.fallbackDuplicateCount ?? 0) > 0)
    standardViolations.push(`G42: 폴백 중복 ${gateCtx.fallbackDuplicateCount}건`);
  if ((gateCtx.unclosedBracketCount ?? 0) > 0)
    standardViolations.push(`G44: 열린 괄호 ${gateCtx.unclosedBracketCount}건`);
  if ((gateCtx.labelContentMismatchCount ?? 0) > 0)
    standardViolations.push(`G39: 라벨 불일치 ${gateCtx.labelContentMismatchCount}건`);
  if (gateCtx.pageCountExceeded)
    standardViolations.push(`G52: 면수 초과 (${slides.length} > 16)`);

  return {
    slideCount: slides.length,
    imageCount: slides.reduce((s, sl) => s + sl.images.length, 0),
    textCount: slides.reduce((s, sl) => s + sl.texts.length, 0),
    gateContext: gateCtx,
    layoutViolations,
    standardViolations,
  };
}
