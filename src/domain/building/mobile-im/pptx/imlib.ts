/**
 * @file imlib.ts
 * @description CREDEAL PPTX 컴포넌트 라이브러리 — PPTX_TEMPLATE_SPEC.md §2~§10 구현
 *
 * 골든 덱(24p)에서 추출한 디자인 시스템의 TypeScript 구현체.
 * 모든 아키타입 빌더는 이 라이브러리의 함수만 조합하여 슬라이드를 구성합니다.
 *
 * 단위: 인치 (pptxgenjs 기본)
 */
import type PptxGenJS from 'pptxgenjs';

// ════════════════════════════════════════
// §2 기하
// ════════════════════════════════════════

export const W = 13.333;   // LAYOUT_WIDE 캔버스 폭
export const H = 7.5;      // 높이
export const M = 0.62;     // 좌우 마진
export const CW = 12.093;  // 콘텐츠 폭 = W - M*2

/** §6 컬럼 패턴 — 컬럼 폭 계산 */
export const col = (n: number, gap: number): number => (CW - gap * (n - 1)) / n;

/** §6 컬럼 패턴 — i번째 컬럼 x 좌표 */
export const colX = (i: number, w: number, gap: number): number => M + i * (w + gap);

// ════════════════════════════════════════
// §3 색 팔레트
// ════════════════════════════════════════

export const C = {
  // 무채 — 지배색
  ink:   '10161F',
  ink2:  '1B2531',
  ink3:  '27333F',
  slate: '2E3A4A',
  body:  '2B3440',
  mute:  '7A8794',
  mute2: '9AA5B1',
  line:  'DDE3E8',
  line2: 'EEF1F4',
  bg:    'FFFFFF',
  tint:  'F5F7F9',

  // 액센트 — 황동 (유일한 장식색)
  brass:  'B98A2E',
  brassD: '8E6A20',
  brassL: 'F2E7CF',
  brassT: 'FBF6EC',

  // 의미색 — 장식 금지, 의미가 있을 때만
  green:   '3A7350',
  greenL:  'E7F0EA',
  red:     'A33A3D',
  redL:    'F6E9E9',
  amber:   '96702A',
  amberL:  'F7EFDC',
  blue:    '44637F',
  blueL:   'E9EEF3',
  violet:  '6D4AA8',
  violetL: 'EDE7F6',
} as const;

/** 다크 슬라이드 전용 색상 */
export const CD = {
  card:          C.ink2,
  block:         '232F3C',
  border:        '2A3644',
  body:          'A8B2BC',
  mute:          '8A96A2',
  faint:         '6B7885',
  accentBg:      '2A1F12',
  accentBorder:  '5C4620',
  accentText:    'D3C6AC',
} as const;

// ════════════════════════════════════════
// §4 타이포
// ════════════════════════════════════════

export const KR = '맑은 고딕';
export const NUM = 'Arial';

// ════════════════════════════════════════
// §10 provenance 배지
// ════════════════════════════════════════

export type ProvenanceKind = 'pub' | 'exp' | 'sel' | 'brk' | 'ai';

export const PV: Record<ProvenanceKind, [string, string, string]> = {
  pub: ['✓ 공부확인',    C.green,  C.greenL ],
  exp: ['★ 전문가검증',  C.amber,  C.amberL ],
  sel: ['▲ 매도인고지',  C.violet, C.violetL],
  brk: ['● 중개인입력',  C.blue,   C.blueL  ],
  ai:  ['◇ AI추정·가정', C.mute,   C.line2  ],
};

// ════════════════════════════════════════
// §8.1 구조 컴포넌트
// ════════════════════════════════════════

type Slide = ReturnType<PptxGenJS['addSlide']>;

/** 밝은 슬라이드 생성 — 미묘한 틴트 배경 + 상단 brass 스트라이프 */
export function light(pres: PptxGenJS): Slide {
  const s = pres.addSlide();
  s.background = { fill: C.tint };  // F5F7F9 — 순백 대신 미묘한 웜그레이
  // 상단 brass 스트라이프 (3px)
  s.addShape('rect' as any, { x: 0, y: 0, w: W, h: 0.04, fill: { color: C.brass } });
  return s;
}

/** 어두운 슬라이드 생성 */
export function dark(pres: PptxGenJS): Slide {
  const s = pres.addSlide();
  s.background = { fill: C.ink };
  return s;
}

/** §5 밝은 슬라이드 제목 블록 */
export function head(
  s: Slide,
  num: number | string,
  kicker: string,
  title: string,
  sub?: string,
): void {
  const numStr = typeof num === 'number' ? String(num).padStart(2, '0') : num;

  // 황동 원
  if (numStr) {
    s.addShape('ellipse' as any, {
      x: M, y: 0.50, w: 0.42, h: 0.42,
      fill: { color: C.brass },
    });
    s.addText(numStr, {
      x: M, y: 0.50, w: 0.42, h: 0.42,
      align: 'center', valign: 'middle',
      fontSize: 13, bold: true, color: 'FFFFFF',
      fontFace: NUM, margin: 0,
    });
  }

  // kicker
  s.addText(kicker, {
    x: M + 0.62, y: 0.50, w: CW - 0.62, h: 0.20,
    fontSize: 9.5, bold: true, color: C.brass,
    fontFace: NUM, charSpacing: 2, margin: 0,
  });

  // title
  s.addText(title, {
    x: M + 0.62, y: 0.70, w: CW - 0.62, h: 0.40,
    fontSize: 23, bold: true, color: C.ink,
    fontFace: KR, margin: 0,
  });

  // sub (선택)
  if (sub) {
    s.addText(sub, {
      x: M + 0.62, y: 1.10, w: CW - 0.62, h: 0.26,
      fontSize: 11, color: C.mute,
      fontFace: KR, margin: 0,
    });
  }

  // 제목 아래 brass 구분선
  s.addShape('line' as any, {
    x: M, y: 1.42, w: CW, h: 0,
    line: { color: C.brassL, width: 0.8 },
  });
}

/** §5 어두운 슬라이드 제목 블록 */
export function headD(
  s: Slide,
  num: number | string,
  kicker: string,
  title: string,
  sub?: string,
): void {
  const numStr = typeof num === 'number' ? String(num).padStart(2, '0') : num;

  if (numStr) {
    s.addShape('ellipse' as any, {
      x: M, y: 0.50, w: 0.42, h: 0.42,
      fill: { color: C.brass },
    });
    s.addText(numStr, {
      x: M, y: 0.50, w: 0.42, h: 0.42,
      align: 'center', valign: 'middle',
      fontSize: 13, bold: true, color: 'FFFFFF',
      fontFace: NUM, margin: 0,
    });
  }

  s.addText(kicker, {
    x: M + 0.62, y: 0.50, w: CW - 0.62, h: 0.20,
    fontSize: 9.5, bold: true, color: C.brass,
    fontFace: NUM, charSpacing: 2, margin: 0,
  });

  s.addText(title, {
    x: M + 0.62, y: 0.70, w: CW - 0.62, h: 0.40,
    fontSize: 23, bold: true, color: 'FFFFFF',
    fontFace: KR, margin: 0,
  });

  if (sub) {
    s.addText(sub, {
      x: M + 0.62, y: 1.10, w: CW - 0.62, h: 0.26,
      fontSize: 11, color: CD.mute,
      fontFace: KR, margin: 0,
    });
  }
}

/** §5 푸터 */
export function foot(
  s: Slide,
  page: number,
  docno: string,
  onDark?: boolean,
): void {
  const textColor = onDark ? CD.faint : C.mute;
  s.addText(`CREDEAL · 제이에스부동산중개(주)   |   ${docno}`, {
    x: M, y: 6.98, w: 8, h: 0.24,
    fontSize: 8, color: textColor, fontFace: KR, margin: 0,
  });
  s.addText(String(page), {
    x: W - M - 1.0, y: 6.98, w: 1.0, h: 0.24,
    align: 'right', fontSize: 9, bold: true, color: C.brass,
    fontFace: NUM, margin: 0,
  });
}

/** Pro 워터마크 */
export function watermark(
  s: Slide,
  text: string,
  onDark?: boolean,
): void {
  s.addText(text, {
    x: 1.5, y: 2.5, w: 10, h: 2.5,
    align: 'center', valign: 'middle',
    fontSize: 36, bold: true,
    color: onDark ? '1A2636' : 'E8ECF0',
    transparency: 85,
    rotate: -30,
    fontFace: KR, margin: 0,
  });
}

/** §8.1 섹션 소제목 h=0.26 */
export function sub(
  s: Slide,
  x: number,
  y: number,
  w: number,
  text: string,
  onDark?: boolean,
): void {
  s.addText(text, {
    x, y, w, h: 0.26,
    fontSize: 11, bold: true,
    color: onDark ? 'FFFFFF' : C.ink,
    fontFace: KR, margin: 0,
  });
}

/** §8.1 주석 h=0.42 */
export function note(
  s: Slide,
  x: number,
  y: number,
  w: number,
  text: string,
  onDark?: boolean,
): void {
  s.addText(text, {
    x, y, w, h: 0.42,
    fontSize: 7.8, color: onDark ? CD.faint : C.mute2,
    fontFace: KR, margin: 0,
  });
}

// ════════════════════════════════════════
// §8.2 데이터 표시 컴포넌트
// ════════════════════════════════════════

export interface StatOpts {
  h?: number;
  vs?: number;      // 값 크기 (기본 25)
  fill?: string;
  lineCol?: string;
  valCol?: string;
  labCol?: string;
  subCol?: string;
  onDark?: boolean;
}

/** §8.2 스탯 카드 */
export function stat(
  s: Slide,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
  unit: string,
  subText: string,
  opt: StatOpts = {},
): void {
  const h = opt.h ?? 1.28;
  const vs = opt.vs ?? 25;
  const fill = opt.fill ?? (opt.onDark ? CD.card : C.tint);
  const lineCol = opt.lineCol ?? (opt.onDark ? CD.border : C.line);
  const valCol = opt.valCol ?? (opt.onDark ? 'FFFFFF' : C.ink);
  const labCol = opt.labCol ?? (opt.onDark ? CD.mute : C.mute);
  const subCol = opt.subCol ?? (opt.onDark ? CD.faint : C.mute);

  // 카드 배경
  s.addShape('roundRect' as any, {
    x, y, w, h,
    rectRadius: 0.06,
    fill: { color: fill },
    line: { color: lineCol, width: 0.5 },
  });

  // 라벨
  s.addText(label, {
    x: x + 0.18, y: y + 0.14, w: w - 0.36, h: 0.22,
    fontSize: 9.5, color: labCol, fontFace: KR, margin: 0,
  });

  // 값
  s.addText(value, {
    x: x + 0.18, y: y + 0.34, w: w - 0.36, h: 0.44,
    fontSize: vs, bold: true, color: valCol, fontFace: NUM, margin: 0,
  });

  // 단위 (값 옆)
  if (unit) {
    s.addText(unit, {
      x: x + 0.18, y: y + 0.74, w: w - 0.36, h: 0.18,
      fontSize: 8.8, color: labCol, fontFace: KR, margin: 0,
    });
  }

  // 보조 텍스트
  if (subText) {
    s.addText(subText, {
      x: x + 0.18, y: y + 0.86, w: w - 0.36, h: 0.36,
      fontSize: 8.8, color: subCol, fontFace: KR, margin: 0,
      lineSpacingMultiple: 1.15,
    });
  }
}

export type RowEntry = [string, string, string?, string?]; // [라벨, 값, 배지?, 값색?]

export interface RowOpts {
  rh?: number;
  fs?: number;
  onDark?: boolean;
}

/** §8.2 행 목록 — 반환: 다음 요소 y */
export function rows(
  s: Slide,
  x: number,
  y: number,
  w: number,
  list: RowEntry[],
  opt: RowOpts = {},
): number {
  const rh = opt.rh ?? 0.315;
  const fs = opt.fs ?? 10.5;
  const labColor = opt.onDark ? CD.mute : C.mute;
  const valColor = opt.onDark ? 'FFFFFF' : C.ink;

  list.forEach((row, i) => {
    const ry = y + i * rh;
    const [label, value, badge, valCol] = row;

    // 교대 행 배경 (zebra)
    const rowBg = opt.onDark
      ? (i % 2 === 0 ? C.ink2 : CD.block)
      : (i % 2 === 0 ? C.bg : C.tint);
    s.addShape('rect' as any, {
      x, y: ry, w, h: rh,
      fill: { color: rowBg },
    });

    // 라벨
    s.addText(label, {
      x: x + 0.12, y: ry, w: w * 0.42, h: rh,
      fontSize: fs, color: labColor, fontFace: KR,
      valign: 'middle', margin: 0,
    });

    // 값
    s.addText(value, {
      x: x + w * 0.45, y: ry, w: w * 0.35, h: rh,
      fontSize: fs, bold: true, color: valCol ?? valColor, fontFace: KR,
      valign: 'middle', margin: 0,
    });

    // 배지 (선택)
    if (badge) {
      const pvKey = badge.startsWith('✓') ? 'pub'
        : badge.startsWith('★') ? 'exp'
        : badge.startsWith('▲') ? 'sel'
        : badge.startsWith('●') ? 'brk'
        : 'ai';
      const [, fg, bg] = PV[pvKey as ProvenanceKind] ?? PV.ai;
      s.addText(badge, {
        x: x + w * 0.80, y: ry + 0.04, w: w * 0.20, h: rh - 0.08,
        fontSize: 7.2, bold: true, color: fg, fontFace: KR,
        fill: { color: bg },
        valign: 'middle', align: 'center', margin: 0,
      });
    }

    // 하단 구분선
    s.addShape('line' as any, {
      x, y: ry + rh, w, h: 0,
      line: { color: opt.onDark ? CD.border : C.line, width: 0.3 },
    });
  });

  return y + list.length * rh;
}

export type CellValue = string | {
  t: string;
  b?: boolean;
  c?: string;
  fill?: string;
  num?: boolean;
};

export interface TableOpts {
  rh?: number;
  bfs?: number;  // body font size
  hfs?: number;  // header font size
  onDark?: boolean;
}

/** §8.2 표 — 반환: 표 하단 y */
export function table(
  s: Slide,
  x: number,
  y: number,
  w: number,
  headRow: string[],
  bodyRows: CellValue[][],
  colW: number[],
  opt: TableOpts = {},
): number {
  const rh = opt.rh ?? 0.28;
  const bfs = opt.bfs ?? 9.5;
  const hfs = opt.hfs ?? 9;
  const isDark = opt.onDark ?? false;

  const headerBg = isDark ? CD.block : C.tint;
  const headerFg = isDark ? CD.mute : C.mute;
  const cellBg = isDark ? C.ink2 : C.bg;
  const cellFg = isDark ? CD.body : C.body;
  const borderColor = isDark ? CD.border : C.line;

  const tableRows: any[][] = [];

  // 헤더
  tableRows.push(headRow.map(h => ({
    text: h,
    options: {
      fontSize: hfs, bold: true, color: headerFg, fontFace: KR,
      fill: { color: headerBg },
      border: { type: 'solid' as const, pt: 0.3, color: borderColor },
      valign: 'middle' as const, margin: [2, 4, 2, 4],
    },
  })));

  // 본문
  bodyRows.forEach((row, rIdx) => {
    tableRows.push(row.map((cell, cIdx) => {
      const isStr = typeof cell === 'string';
      const text = isStr ? cell : cell.t;
      const isBold = isStr ? cIdx === 0 : (cell.b ?? cIdx === 0);
      const color = isStr ? (cIdx === 0 ? (isDark ? 'FFFFFF' : C.ink) : cellFg) : (cell.c ?? cellFg);
      const fillColor = isStr
        ? (rIdx % 2 === 0 ? cellBg : (isDark ? CD.block : C.tint))
        : (cell.fill ?? (rIdx % 2 === 0 ? cellBg : (isDark ? CD.block : C.tint)));
      const ff = (isStr ? false : cell.num) ? NUM : KR;

      return {
        text,
        options: {
          fontSize: bfs, bold: isBold, color, fontFace: ff,
          fill: { color: fillColor },
          border: { type: 'solid' as const, pt: 0.3, color: borderColor },
          valign: 'middle' as const, margin: [2, 4, 2, 4],
        },
      };
    }));
  });

  s.addTable(tableRows, { x, y, w, colW, rowH: rh });

  return y + (bodyRows.length + 1) * rh;
}

export type CalloutKind = 'info' | 'good' | 'warn' | 'bad' | 'brass';

/** §8.2 콜아웃 */
export function callout(
  s: Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: CalloutKind,
  title: string,
  body: string,
): void {
  const colors: Record<CalloutKind, [string, string, string]> = {
    info:  [C.blue,   C.blueL,   C.blue],
    good:  [C.green,  C.greenL,  C.green],
    warn:  [C.amber,  C.amberL,  C.amber],
    bad:   [C.red,    C.redL,    C.red],
    brass: [C.brassD, C.brassT,  C.brassD],
  };
  const [titleColor, bgColor, barColor] = colors[kind];

  // 배경
  s.addShape('roundRect' as any, {
    x, y, w, h,
    rectRadius: 0.06,
    fill: { color: bgColor },
  });

  // 좌측 바
  s.addShape('rect' as any, {
    x, y: y + 0.06, w: 0.04, h: h - 0.12,
    fill: { color: barColor },
  });

  // 제목
  s.addText(title, {
    x: x + 0.20, y: y + 0.12, w: w - 0.36, h: 0.22,
    fontSize: 10.5, bold: true, color: titleColor,
    fontFace: KR, margin: 0,
  });

  // 본문
  s.addText(body, {
    x: x + 0.20, y: y + 0.36, w: w - 0.36, h: h - 0.48,
    fontSize: 9.3, color: C.body, fontFace: KR, margin: 0,
    lineSpacingMultiple: 1.28,
  });
}

/** §10 provenance 알약 배지 */
export function chip(
  s: Slide,
  x: number,
  y: number,
  kind: ProvenanceKind,
  opt?: { onDark?: boolean },
): void {
  const [label, fg, bg] = PV[kind];
  s.addShape('roundRect' as any, {
    x, y, w: 1.02, h: 0.21,
    rectRadius: 0.10,
    fill: { color: bg },
  });
  s.addText(label, {
    x, y, w: 1.02, h: 0.21,
    align: 'center', valign: 'middle',
    fontSize: 7.2, bold: true, color: fg,
    fontFace: KR, margin: 0,
  });
}

/** 임의 알약 태그 */
export function tag(
  s: Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  fg: string,
  bg: string,
  fs?: number,
): void {
  s.addShape('roundRect' as any, {
    x, y, w, h,
    rectRadius: h / 2,
    fill: { color: bg },
  });
  s.addText(text, {
    x, y, w, h,
    align: 'center', valign: 'middle',
    fontSize: fs ?? 8, bold: true, color: fg,
    fontFace: KR, margin: 0,
  });
}

/** 빈 카드 (직접 채울 때) */
export function card(
  s: Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  opt?: { fill?: string; lineCol?: string; radius?: number; onDark?: boolean },
): void {
  const fill = opt?.fill ?? (opt?.onDark ? CD.card : C.tint);
  const lineCol = opt?.lineCol ?? (opt?.onDark ? CD.border : C.line);
  s.addShape('roundRect' as any, {
    x, y, w, h,
    rectRadius: opt?.radius ?? 0.06,
    fill: { color: fill },
    line: { color: lineCol, width: 0.5 },
  });
}

// ════════════════════════════════════════
// §8.3 다이어그램
// ════════════════════════════════════════

export interface WaterfallStep {
  type?: 'total';
  v: number;
  lab: string;
  val: string;
  col?: string;
}

/** §8.3 워터폴 다이어그램 */
export function waterfall(
  s: Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  steps: WaterfallStep[],
  maxV: number,
): void {
  const barW = (w - 0.4) / steps.length;
  const gap = 0.06;
  let runningTop = 0;

  steps.forEach((step, i) => {
    const bx = x + 0.2 + i * barW;
    const absV = Math.abs(step.v);
    const barH = (absV / maxV) * (h - 0.8);

    let barY: number;
    if (step.type === 'total') {
      barY = y + h - 0.4 - barH;
      runningTop = barY;
    } else if (step.v < 0) {
      barY = runningTop;
      runningTop += barH;
    } else {
      runningTop -= barH;
      barY = runningTop;
    }

    const barColor = step.col ?? (step.v < 0 ? C.red : C.green);

    s.addShape('rect' as any, {
      x: bx + gap / 2, y: barY,
      w: barW - gap, h: barH,
      fill: { color: barColor },
    });

    // 라벨 (하단)
    s.addText(step.lab, {
      x: bx, y: y + h - 0.34, w: barW, h: 0.22,
      fontSize: 7.5, color: C.mute, fontFace: KR,
      align: 'center', margin: 0,
    });

    // 값 (막대 상단)
    s.addText(step.val, {
      x: bx, y: barY - 0.28, w: barW, h: 0.22,
      fontSize: 8, bold: true, color: C.ink, fontFace: NUM,
      align: 'center', margin: 0,
    });
  });
}

export interface FloorEntry {
  fl: string;
  use: string;
  area: string;
  rent: string;
  vacant?: boolean;
}

/** §8.3 층 스택 다이어그램 */
export function stack(
  s: Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  floors: FloorEntry[],
): void {
  const floorH = Math.min((h - 0.2) / floors.length, 0.50);
  const startY = y + (h - floors.length * floorH) / 2;

  floors.forEach((floor, i) => {
    const fy = startY + i * floorH;
    const bgColor = floor.vacant ? C.redL : C.tint;
    const borderColor = floor.vacant ? C.red : C.line;

    s.addShape('rect' as any, {
      x: x + 0.6, y: fy, w: w - 0.8, h: floorH - 0.04,
      fill: { color: bgColor },
      line: {
        color: borderColor, width: 0.5,
        dashType: floor.vacant ? 'dash' : undefined,
      },
    });

    // 층 라벨
    s.addText(floor.fl, {
      x, y: fy, w: 0.55, h: floorH - 0.04,
      fontSize: 9, bold: true, color: C.ink, fontFace: KR,
      align: 'right', valign: 'middle', margin: 0,
    });

    // 용도
    s.addText(floor.use, {
      x: x + 0.7, y: fy, w: (w - 0.8) * 0.3, h: floorH - 0.04,
      fontSize: 9, color: floor.vacant ? C.red : C.body, fontFace: KR,
      valign: 'middle', margin: [0, 4, 0, 4],
    });

    // 면적
    s.addText(floor.area, {
      x: x + 0.7 + (w - 0.8) * 0.3, y: fy, w: (w - 0.8) * 0.3, h: floorH - 0.04,
      fontSize: 9, color: C.mute, fontFace: KR,
      valign: 'middle', margin: [0, 4, 0, 4],
    });

    // 임대료
    s.addText(floor.rent, {
      x: x + 0.7 + (w - 0.8) * 0.6, y: fy, w: (w - 0.8) * 0.4, h: floorH - 0.04,
      fontSize: 9, bold: true, color: C.ink, fontFace: KR,
      align: 'right', valign: 'middle', margin: [0, 4, 0, 4],
    });
  });
}

/** §8.3 반경 개념도 (재식별 게이트용) — 위치 텍스트 플레이스홀더 */
export function locmap(
  s: Slide,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  s.addShape('roundRect' as any, {
    x, y, w, h,
    rectRadius: 0.08,
    fill: { color: C.tint },
    line: { color: C.line, width: 0.5 },
  });
  s.addText('📍 위치 개념도\n(재식별 방지를 위해 반경 표시)', {
    x, y, w, h,
    align: 'center', valign: 'middle',
    fontSize: 10, color: C.mute, fontFace: KR, margin: 0,
  });
}

// ════════════════════════════════════════
// §8.4 차트 옵션
// ════════════════════════════════════════

export function chartOpts(overrides?: Record<string, any>): Record<string, any> {
  return {
    showValue: true,
    catAxisLabelColor: C.mute,
    catAxisLabelFontSize: 8,
    catAxisLabelFontFace: KR,
    valAxisLabelColor: C.mute,
    valAxisLabelFontSize: 8,
    valAxisLabelFontFace: NUM,
    catGridLine: { color: C.line2, size: 0.3 },
    valGridLine: { color: C.line2, size: 0.3 },
    dataLabelColor: C.ink,
    dataLabelFontSize: 8,
    dataLabelFontFace: NUM,
    chartColors: [C.brass, C.blue, C.green, C.amber, C.red, C.slate],
    ...overrides,
  };
}
