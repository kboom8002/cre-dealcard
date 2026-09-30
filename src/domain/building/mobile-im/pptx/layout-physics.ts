/**
 * @file layout-physics.ts
 * @description CJK/Latin TextPhysicsEngine & Precision Layout Physics for PPTX Basic IM
 *
 * Implements precision typography metrics and binary-search font/wrap solvers (M2 / R2):
 * 1. getCharWidthInches: exact character width metrics for CJK, Latin, numbers, spaces, and punctuation
 * 2. simulateTextWrap: Korean word-boundary wrapping preserving spaces with single-word fallback
 * 3. fitTextToBox: binary-search dynamic font fitting and ellipsis truncation solver
 * 4. fitTableCell: table cell single/multi-line fitting preventing DrawingML table row expansion
 */

// Re-export existing layout physics utilities (textH, fitBox, gridFit, DPI checks, etc.)
export * from './utils/layout-physics';

/**
 * Returns physical character width in inches based on typographic class.
 *
 * Metrics:
 * - CJK (Hangul, Hanja, fullwidth forms): 1.0 * (fontSizePt / 72)
 * - ASCII uppercase: 0.65 * (fontSizePt / 72)
 * - ASCII lowercase / digits: 0.55 * (fontSizePt / 72)
 * - Space: 0.28 * (fontSizePt / 72)
 * - Narrow punctuation (,.:;!|'"): 0.35 * (fontSizePt / 72)
 * - Other symbols: 0.50 * (fontSizePt / 72)
 */
export function getCharWidthInches(ch: string, fontSizePt: number): number {
  if (!ch || fontSizePt <= 0) return 0;
  const em = fontSizePt / 72;
  const code = ch.charCodeAt(0);

  // CJK (Hangul syllables, Jamo, Hanja, CJK symbols, Fullwidth forms)
  if (
    (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
    (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
    (code >= 0x3130 && code <= 0x318f) || // Hangul Compatibility Jamo
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x3000 && code <= 0x303f) || // CJK Symbols and Punctuation
    (code >= 0xff01 && code <= 0xff60) || // Fullwidth ASCII / symbols
    (code >= 0xffe0 && code <= 0xffee)    // Fullwidth currency / signs
  ) {
    return 1.0 * em;
  }

  if (ch === ' ') return 0.28 * em;
  if (/[A-Z]/.test(ch)) return 0.65 * em;
  if (/[a-z0-9]/.test(ch)) return 0.55 * em;
  if (/[,.:;!|'"`]/.test(ch)) return 0.35 * em;

  return 0.50 * em;
}

/**
 * Simulates text wrapping within a bounding width in inches using Korean word boundaries.
 * Preserves spaces between words. If an individual word exceeds widthInches,
 * gracefully breaks the word character-by-character.
 */
export function simulateTextWrap(
  text: string,
  widthInches: number,
  fontSizePt: number,
): { lines: string[]; maxLineWidth: number } {
  if (!text || text.length === 0) {
    return { lines: [], maxLineWidth: 0 };
  }
  if (widthInches <= 0 || fontSizePt <= 0) {
    return { lines: [text], maxLineWidth: 0 };
  }

  const paragraphs = text.split('\n');
  const allLines: string[] = [];
  let globalMaxWidth = 0;

  for (const para of paragraphs) {
    if (para.length === 0) {
      allLines.push('');
      continue;
    }

    const words = para.split(' ');
    let currentLine = '';
    let currentLineWidth = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let wordWidth = 0;
      for (const ch of word) {
        wordWidth += getCharWidthInches(ch, fontSizePt);
      }
      const spaceWidth = currentLine.length > 0 ? getCharWidthInches(' ', fontSizePt) : 0;

      // Check if word fits on current line
      if (currentLineWidth + spaceWidth + wordWidth <= widthInches + 0.0001) {
        currentLine += (currentLine.length > 0 ? ' ' : '') + word;
        currentLineWidth += spaceWidth + wordWidth;
      } else {
        // Word cannot fit on current line
        if (wordWidth > widthInches) {
          // Word itself exceeds container width: flush current line and break character-by-character
          if (currentLine.length > 0) {
            allLines.push(currentLine);
            if (currentLineWidth > globalMaxWidth) globalMaxWidth = currentLineWidth;
            currentLine = '';
            currentLineWidth = 0;
          }
          for (const ch of word) {
            const chW = getCharWidthInches(ch, fontSizePt);
            if (currentLineWidth + chW > widthInches && currentLine.length > 0) {
              allLines.push(currentLine);
              if (currentLineWidth > globalMaxWidth) globalMaxWidth = currentLineWidth;
              currentLine = ch;
              currentLineWidth = chW;
            } else {
              currentLine += ch;
              currentLineWidth += chW;
            }
          }
        } else {
          // Word fits on next line
          if (currentLine.length > 0) {
            allLines.push(currentLine);
            if (currentLineWidth > globalMaxWidth) globalMaxWidth = currentLineWidth;
          }
          currentLine = word;
          currentLineWidth = wordWidth;
        }
      }
    }

    if (currentLine.length > 0) {
      allLines.push(currentLine);
      if (currentLineWidth > globalMaxWidth) globalMaxWidth = currentLineWidth;
    }
  }

  return { lines: allLines, maxLineWidth: globalMaxWidth };
}

export interface FitTextOptions {
  minFontSize?: number;
  maxFontSize?: number;
  targetLines?: number;
  lineSpacingMultiple?: number;
  allowTruncate?: boolean;
}

export interface FitTextResult {
  fontSize: number;
  lines: string[];
  requiredHeight: number;
  requiredWidth: number;
  wasTruncated: boolean;
  displayText: string;
}

/**
 * Fits text within a given box width and height using binary search font sizing.
 *
 * Algorithm:
 * 1. Test maxFontSize first. If it fits, return immediately.
 * 2. Binary search font sizes in 0.5pt increments down to minFontSize.
 * 3. If within bounds (totalHeight <= heightInches and lines.length <= targetLines), fit succeeds.
 * 4. If at minFontSize it still exceeds:
 *    - If allowTruncate: true, binary search truncation length with ellipsis '…'
 *    - If allowTruncate: false, return minFontSize result with wasTruncated: false (height exceeds box)
 */
export function fitTextToBox(
  text: string,
  widthInches: number,
  heightInches: number,
  opts?: FitTextOptions,
): FitTextResult {
  const minF = opts?.minFontSize ?? 8;
  const maxF = opts?.maxFontSize ?? 16;
  const targetLines = opts?.targetLines;
  const lineSpacing = opts?.lineSpacingMultiple ?? 1.15;
  const allowTruncate = opts?.allowTruncate ?? true;

  if (!text || text.trim().length === 0) {
    return {
      fontSize: maxF,
      lines: [],
      requiredHeight: 0,
      requiredWidth: 0,
      wasTruncated: false,
      displayText: text || '',
    };
  }

  // 1. Check if maxFontSize already fits
  const maxSim = simulateTextWrap(text, widthInches, maxF);
  const maxLineH = (maxF / 72) * lineSpacing;
  const maxTotalH = maxSim.lines.length * maxLineH;
  const maxFits = (maxTotalH <= heightInches + 0.01) && (!targetLines || maxSim.lines.length <= targetLines);

  if (maxFits) {
    return {
      fontSize: maxF,
      lines: maxSim.lines,
      requiredHeight: maxTotalH,
      requiredWidth: maxSim.maxLineWidth,
      wasTruncated: false,
      displayText: text,
    };
  }

  // 2. Binary search between minF and maxF in 0.5pt increments
  let bestFontSize = minF;
  let bestLines: string[] = [];
  let bestHeight = 0;
  let bestWidth = 0;
  let foundFit = false;

  const stepCount = Math.max(0, Math.round((maxF - minF) / 0.5));
  let l = 0;
  let r = stepCount;

  while (l <= r) {
    const midStep = Math.floor((l + r) / 2);
    const testSize = Math.round((minF + midStep * 0.5) * 10) / 10;
    const sim = simulateTextWrap(text, widthInches, testSize);
    const lineH = (testSize / 72) * lineSpacing;
    const totalH = sim.lines.length * lineH;
    const fitsHeight = totalH <= heightInches + 0.01;
    const fitsLines = !targetLines || sim.lines.length <= targetLines;

    if (fitsHeight && fitsLines) {
      foundFit = true;
      bestFontSize = testSize;
      bestLines = sim.lines;
      bestHeight = totalH;
      bestWidth = sim.maxLineWidth;
      l = midStep + 1; // Try larger font size
    } else {
      r = midStep - 1; // Try smaller font size
    }
  }

  if (foundFit) {
    return {
      fontSize: bestFontSize,
      lines: bestLines,
      requiredHeight: bestHeight,
      requiredWidth: bestWidth,
      wasTruncated: false,
      displayText: text,
    };
  }

  // 3. minFontSize did not fit
  const minLineH = (minF / 72) * lineSpacing;
  const minSim = simulateTextWrap(text, widthInches, minF);
  const minTotalH = minSim.lines.length * minLineH;

  if (!allowTruncate) {
    return {
      fontSize: minF,
      lines: minSim.lines,
      requiredHeight: minTotalH,
      requiredWidth: minSim.maxLineWidth,
      wasTruncated: false,
      displayText: text,
    };
  }

  // 4. Truncation with ellipsis
  const maxAllowedLines = targetLines
    ? Math.min(targetLines, Math.max(1, Math.floor((heightInches + 0.01) / minLineH)))
    : Math.max(1, Math.floor((heightInches + 0.01) / minLineH));

  let tLow = 1;
  let tHigh = text.length;
  let bestLen = 0;
  let bestTruncatedSim: { lines: string[]; maxLineWidth: number } | null = null;
  let bestTruncatedDisplay = '';

  while (tLow <= tHigh) {
    const midLen = Math.floor((tLow + tHigh) / 2);
    const candidate = text.slice(0, midLen).trimEnd() + '…';
    const sim = simulateTextWrap(candidate, widthInches, minF);
    const totalH = sim.lines.length * minLineH;
    const fits = (totalH <= heightInches + 0.01) && sim.lines.length <= maxAllowedLines;

    if (fits) {
      bestLen = midLen;
      bestTruncatedSim = sim;
      bestTruncatedDisplay = candidate;
      tLow = midLen + 1;
    } else {
      tHigh = midLen - 1;
    }
  }

  if (bestTruncatedSim && bestLen > 0) {
    return {
      fontSize: minF,
      lines: bestTruncatedSim.lines,
      requiredHeight: bestTruncatedSim.lines.length * minLineH,
      requiredWidth: bestTruncatedSim.maxLineWidth,
      wasTruncated: true,
      displayText: bestTruncatedDisplay,
    };
  }

  return {
    fontSize: minF,
    lines: ['…'],
    requiredHeight: minLineH,
    requiredWidth: getCharWidthInches('…', minF),
    wasTruncated: true,
    displayText: '…',
  };
}

/**
 * Pre-processes table cell text so it fits within colW - 0.11" on lines allowed by rowH
 * down to 7.0pt with ellipsis truncation if needed, completely preventing PowerPoint
 * DrawingML table row height expansion.
 */
export function fitTableCell(
  text: string,
  colW: number,
  rowH: number,
  baseFontSize: number = 9.0,
): { text: string; fontSize: number } {
  if (!text || text.trim().length === 0) {
    return { text: text ?? '', fontSize: baseFontSize };
  }

  // Standard DrawingML table cell margins: 4pt left + 4pt right = 8pt = 0.111"
  const usableW = Math.max(0.05, colW - 0.11);
  const usableH = Math.max(0.05, rowH - 0.06);
  const minFontSize = 7.0;
  const maxFontSize = baseFontSize;

  const minLineH = (minFontSize / 72) * 1.15;
  const allowedLines = Math.max(1, Math.floor((usableH + 0.01) / minLineH));

  const fit = fitTextToBox(text, usableW, usableH, {
    minFontSize,
    maxFontSize,
    targetLines: allowedLines,
    lineSpacingMultiple: 1.15,
    allowTruncate: true,
  });

  return {
    text: fit.displayText,
    fontSize: fit.fontSize,
  };
}
