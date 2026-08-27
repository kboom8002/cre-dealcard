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
import type { PptxThemeTokens } from './pptx-theme';
import { textH as computeTextH } from './utils/layout-physics';

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
// §3 색 팔레트 (테마 동적 주입 — setActiveTheme)
// ════════════════════════════════════════

/**
 * C: 라이트 슬라이드 색상 팔레트.
 * 기본값은 golden_institutional. setActiveTheme() 호출 시 프리셋별 값으로 교체됩니다.
 * ⚠️ 반드시 `as const` 제거 — Object.assign으로 런타임 교체 가능해야 함.
 */
export const C: Record<string, string> = {
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

  // 액센트 — 프리셋에 따라 황동/네온그린/에메랄드/시안/골드
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
};

/** 다크 슬라이드 전용 색상 — setActiveTheme()에 의해 교체 */
export const CD: Record<string, string> = {
  card:          '1B2531',
  block:         '232F3C',
  border:        '2A3644',
  body:          'A8B2BC',
  mute:          '8A96A2',
  faint:         '6B7885',
  accentBg:      '2A1F12',
  accentBorder:  '5C4620',
  accentText:    'D3C6AC',
};

// ════════════════════════════════════════
// §4 타이포
// ════════════════════════════════════════

export let KR = '맑은 고딕';
export let TITLE_KR = '맑은 고딕';
export let NUM = 'Arial';

// ════════════════════════════════════════
// §3.1 테마 동적 주입
// ════════════════════════════════════════

/** 활성 테마 메타데이터 (coverStyle 등 비-색상 속성) */
export const THEME_META: {
  coverStyle: string;
  layoutStyle: string;
  companyName: string;
  companyTagline: string;
  presetId: string;
} = {
  coverStyle: 'institutional_masses',
  layoutStyle: 'classic',
  companyName: '크리딜',
  companyTagline: '상업용 부동산 투자 플랫폼',
  presetId: 'golden_institutional',
};

/**
 * 활성 테마를 설정합니다.
 * pptx-renderer에서 렌더링 전에 호출하면,
 * 이후 모든 아키타입/imlib 함수가 해당 프리셋의 색상을 사용합니다.
 */
export function setActiveTheme(theme: PptxThemeTokens): void {
  // ── 라이트 팔레트 ──
  Object.assign(C, {
    ink:     theme.ink,
    ink2:    theme.ink2,
    ink3:    theme.ink3,
    slate:   theme.slate,
    body:    theme.body,
    mute:    theme.mute,
    mute2:   theme.mute2,
    line:    theme.line,
    line2:   theme.line2,
    bg:      theme.bg,
    tint:    theme.tint,
    // 액센트: theme.accent → C.brass (모든 아키타입이 brass로 참조)
    brass:   theme.accent,
    brassD:  theme.accentD,
    brassL:  theme.accentL,
    brassT:  theme.accentT,
    // 의미색
    green:   theme.green,
    greenL:  theme.greenL,
    red:     theme.red,
    redL:    theme.redL,
    amber:   theme.amber,
    amberL:  theme.amberL,
    blue:    theme.blue,
    blueL:   theme.blueL,
    violet:  theme.violet,
    violetL: theme.violetL,
  });

  // ── 다크 팔레트 ──
  Object.assign(CD, {
    card:          theme.darkCard,
    block:         theme.darkBlock,
    border:        theme.darkBorder,
    body:          theme.darkBody,
    mute:          theme.darkMute,
    faint:         theme.darkFaint,
    accentBg:      theme.darkAccentBg,
    accentBorder:  theme.darkAccentBorder,
    accentText:    theme.darkAccentText,
  });

  // ── 타이포 ──
  KR = theme.bodyFont || '맑은 고딕';
  TITLE_KR = theme.titleFont || KR;
  // NUM은 항상 Arial (숫자/라틴 전용)

  // ── 메타 ──
  Object.assign(THEME_META, {
    coverStyle:     theme.coverStyle,
    layoutStyle:    theme.layoutStyle,
    companyName:    theme.companyName,
    companyTagline: theme.companyTagline,
    presetId:       theme.presetId,
  });

  // ── PV (provenance 배지) 색상 갱신 — D29 M-5 정본 9종 ──
  PV.registry   = ['✓ 등기·대장',    C.green,  C.greenL ];
  PV.public_api = ['✓ 공공데이터',   C.green,  C.greenL ];
  PV.broker_aug = ['● 현장확인',     C.blue,   C.blueL  ];
  PV.expert     = ['★ 전문가검증',   C.amber,  C.amberL ];
  PV.ledger     = ['✓ 원장확인',     C.green,  C.greenL ];
  PV.seller     = ['▲ 매도인고지',   C.violet, C.violetL];
  PV.broker     = ['● 중개인입력',   C.blue,   C.blueL  ];
  PV.derived    = ['◈ 파생계산',     C.mute,   C.line2  ];
  PV.assumed    = ['◇ AI추정·가정',  C.mute,   C.line2  ];
}

/**
 * 테마 격리 래퍼: 동시 렌더링 시 테마 오염을 방지합니다.
 * setActiveTheme으로 글로벌 상태를 변경한 후, 작업 완료 시 원래 상태로 복원합니다.
 */
export async function withThemeIsolation<T>(theme: PptxThemeTokens, fn: () => Promise<T>): Promise<T> {
  const savedC = { ...C };
  const savedCD = { ...CD };
  const savedKR = KR;
  const savedTITLE_KR = TITLE_KR;
  const savedMeta = { ...THEME_META };
  const savedPV = { ...PV };
  try {
    setActiveTheme(theme);
    return await fn();
  } finally {
    Object.assign(C, savedC);
    Object.assign(CD, savedCD);
    KR = savedKR;
    TITLE_KR = savedTITLE_KR;
    Object.assign(THEME_META, savedMeta);
    Object.assign(PV, savedPV);
  }
}

// ════════════════════════════════════════
// §10 provenance 배지
// ════════════════════════════════════════

// D29 M-5: 정본 9종(+1) 출처 체계 (ontology/provenance.ts 정본)
export type ProvenanceKind =
  | 'registry'               // S1: 등기·대장 (공적 장부)
  | 'public_api'             // S2a: 공공 API (국토부 실거래가, 공시지가 등)
  | 'public_api_identified'  // S2b: 공공 API + 중개인 식별 (D36 §4.3)
  | 'broker_aug'             // S2a: 중개인 보강 (현장 실측 등)
  | 'expert'                 // S2b: 전문가 검증 (감정평가사 등)
  | 'ledger'                 // S2a: 원장 (임대차 계약서 원본)
  | 'seller'                 // S3: 매도인 고지
  | 'broker'                 // S3: 중개인 입력
  | 'derived'                // S4: 파생 계산
  | 'assumed';               // S5: AI 추정·가정

export const PV: Record<ProvenanceKind, [string, string, string]> = {
  registry:               ['✓ 등기·대장',    C.green,  C.greenL ],
  public_api:             ['✓ 공공데이터',   C.green,  C.greenL ],
  public_api_identified:  ['✓ 공공+중개인',  C.green,  C.greenL ],
  broker_aug:             ['● 현장확인',     C.blue,   C.blueL  ],
  expert:                 ['★ 전문가검증',   C.amber,  C.amberL ],
  ledger:                 ['✓ 원장확인',     C.green,  C.greenL ],
  seller:                 ['▲ 매도인고지',   C.violet, C.violetL],
  broker:                 ['● 중개인입력',   C.blue,   C.blueL  ],
  derived:                ['◈ 파생계산',     C.mute,   C.line2  ],
  assumed:                ['◇ AI추정·가정',  C.mute,   C.line2  ],
};

// 레거시 코드 호환 매핑
/** @deprecated D29 M-5: 레거시 5종 → 정본 9종 */
export const LEGACY_PROVENANCE_MAP: Record<string, ProvenanceKind> = {
  pub: 'public_api',
  exp: 'expert',
  sel: 'seller',
  brk: 'broker',
  ai: 'assumed',
};

// ════════════════════════════════════════
// §8.1 구조 컴포넌트
// ════════════════════════════════════════

type Slide = ReturnType<PptxGenJS['addSlide']>;

/** 밝은 슬라이드 생성 — 순백 배경 (§7 스펙) */
export function light(pres: PptxGenJS): Slide {
  const s = pres.addSlide();
  s.background = { fill: C.bg };
  return s;
}

/** 어두운 슬라이드 생성 */
export function dark(pres: PptxGenJS): Slide {
  const s = pres.addSlide();
  s.background = { fill: C.ink };
  return s;
}

/** §5 밝은 슬라이드 제목 블록 — layoutStyle 분기 */
export function head(
  s: Slide,
  num: number | string,
  kicker: string,
  title: string,
  sub?: string,
): void {
  const numStr = typeof num === 'number' ? String(num).padStart(2, '0') : num;
  const style = THEME_META.layoutStyle;

  // 프리미엄 템플릿 및 일반 템플릿 공통: 제목/키커에서 모든 이모지 및 Variation Selector, 깨진 기호 제거
  const sanitizeText = (txt: string) => (txt || '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '')
    .replace(/^[#\s•·\-*]+/g, '')
    .trim();

  const cleanTitle = sanitizeText(title) || '개요';
  const cleanKicker = sanitizeText(kicker) || kicker;

  switch (style) {
    // ── modern: 좌측 액센트 세로 바 + 좌정렬 ──
    case 'modern': {
      const barH = sub ? 0.86 : 0.62;
      // 좌측 액센트 세로 바 - sub 유무에 맞춘 완벽한 수직 정렬
      s.addShape('rect' as any, {
        x: M, y: 0.42, w: 0.05, h: barH,
        fill: { color: C.brass },
      });
      s.addText(`${numStr}  ${kicker}`, {
        x: M + 0.20, y: 0.42, w: CW - 0.20, h: 0.20,
        fontSize: 9.5, bold: true, color: C.brass,
        fontFace: NUM, charSpacing: 2, margin: 0,
      });
      s.addText(cleanTitle, {
        x: M + 0.20, y: 0.62, w: CW - 0.20, h: 0.42,
        fontSize: 22, bold: true, color: C.ink,
        fontFace: TITLE_KR, margin: 0,
      });
      if (sub) {
        s.addText(sub, {
          x: M + 0.20, y: 1.04, w: CW - 0.20, h: 0.24,
          fontSize: 10.5, color: C.mute, fontFace: KR, margin: 0,
        });
      }
      break;
    }

    // ── executive: 중앙 정렬 + 상하 골드 라인 ──
    case 'executive': {
      // 상단 가는 라인
      s.addShape('line' as any, {
        x: M, y: 0.38, w: CW, h: 0,
        line: { color: C.brass, width: 0.5 },
      });
      // 중앙 정렬 kicker
      s.addText(`${numStr}  ·  ${kicker}`, {
        x: M, y: 0.48, w: CW, h: 0.22,
        fontSize: 9, bold: true, color: C.brass,
        fontFace: NUM, charSpacing: 3, margin: 0, align: 'center',
      });
      // 중앙 정렬 title
      s.addText(cleanTitle, {
        x: M, y: 0.68, w: CW, h: 0.46,
        fontSize: 26, bold: true, color: C.ink,
        fontFace: TITLE_KR, margin: 0, align: 'center',
      });
      // 하단 골드 라인
      s.addShape('line' as any, {
        x: M + CW * 0.3, y: 1.20, w: CW * 0.4, h: 0,
        line: { color: C.brass, width: 1 },
      });
      if (sub) {
        s.addText(sub, {
          x: M, y: 1.10, w: CW, h: 0.22,
          fontSize: 11, color: C.mute, fontFace: KR, margin: 0, align: 'center',
        });
      }
      break;
    }

    // ── minimal: 깔끔한 좌정렬 + 얇은 구분선 ──
    case 'minimal': {
      // 작은 번호 (원 없이)
      if (numStr) {
        s.addText(numStr, {
          x: M, y: 0.48, w: 0.36, h: 0.24,
          fontSize: 10, bold: true, color: C.mute2,
          fontFace: NUM, margin: 0,
        });
      }
      s.addText(kicker, {
        x: M + 0.40, y: 0.48, w: CW - 0.40, h: 0.20,
        fontSize: 8.5, bold: true, color: C.mute,
        fontFace: NUM, charSpacing: 1.5, margin: 0,
      });
      s.addText(cleanTitle, {
        x: M, y: 0.72, w: CW, h: 0.38,
        fontSize: 21, bold: true, color: C.ink,
        fontFace: TITLE_KR, margin: 0,
      });
      // 미니멀 구분선
      s.addShape('line' as any, {
        x: M, y: 1.16, w: 2.5, h: 0,
        line: { color: C.brass, width: 1.5 },
      });
      if (sub) {
        s.addText(sub, {
          x: M, y: 1.08, w: CW, h: 0.22,
          fontSize: 10.5, color: C.mute, fontFace: KR, margin: 0,
        });
      }
      break;
    }

    // ── dramatic: 전폭 액센트 그라데이션 스트립 ──
    case 'dramatic': {
      // 전폭 다크 스트립
      s.addShape('rect' as any, {
        x: 0, y: 0.30, w: W, h: 1.00,
        fill: { color: C.ink },
      });
      // 좌측 액센트 블록
      s.addShape('rect' as any, {
        x: 0, y: 0.30, w: 0.12, h: 1.00,
        fill: { color: C.brass },
      });
      // 큰 번호
      if (numStr) {
        s.addText(numStr, {
          x: M, y: 0.36, w: 0.60, h: 0.50,
          fontSize: 28, bold: true, color: C.brass,
          fontFace: NUM, margin: 0,
        });
      }
      s.addText(kicker, {
        x: M + 0.70, y: 0.36, w: CW - 0.70, h: 0.22,
        fontSize: 9, bold: true, color: C.brass,
        fontFace: NUM, charSpacing: 2.5, margin: 0,
      });
      s.addText(cleanTitle, {
        x: M + 0.70, y: 0.58, w: CW - 0.70, h: 0.44,
        fontSize: 24, bold: true, color: 'FFFFFF',
        fontFace: TITLE_KR, margin: 0,
      });
      if (sub) {
        s.addText(sub, {
          x: M + 0.70, y: 1.02, w: CW - 0.70, h: 0.22,
          fontSize: 10, color: CD.mute, fontFace: KR, margin: 0,
        });
      }
      break;
    }

    // ── classic: 황동 원 + 좌정렬 (기본값) ──
    case 'classic':
    default: {
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
      s.addText(cleanTitle, {
        x: M + 0.62, y: 0.70, w: CW - 0.62, h: 0.40,
        fontSize: 23, bold: true, color: C.ink,
        fontFace: TITLE_KR, margin: 0,
      });
      if (sub) {
        s.addText(sub, {
          x: M + 0.62, y: 1.10, w: CW - 0.62, h: 0.26,
          fontSize: 11, color: C.mute,
          fontFace: KR, margin: 0,
        });
      }
      break;
    }
  }
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
  const style = THEME_META.layoutStyle;

  // 프리미엄 템플릿 및 일반 템플릿 공통: 제목/키커에서 모든 이모지 및 Variation Selector, 깨진 기호 제거
  const sanitizeText = (txt: string) => (txt || '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '')
    .replace(/^[#\s•·\-*]+/g, '')
    .trim();

  const cleanTitle = sanitizeText(title) || '개요';
  const cleanKicker = sanitizeText(kicker) || kicker;

  switch (style) {
    case 'modern': {
      const barH = sub ? 0.86 : 0.62;
      s.addShape('rect' as any, { x: M, y: 0.42, w: 0.05, h: barH, fill: { color: C.brass } });
      s.addText(`${numStr}  ${kicker}`, { x: M + 0.20, y: 0.42, w: CW - 0.20, h: 0.20, fontSize: 9.5, bold: true, color: C.brass, fontFace: NUM, charSpacing: 2, margin: 0 });
      s.addText(cleanTitle, { x: M + 0.20, y: 0.62, w: CW - 0.20, h: 0.42, fontSize: 22, bold: true, color: 'FFFFFF', fontFace: TITLE_KR, margin: 0 });
      if (sub) s.addText(sub, { x: M + 0.20, y: 1.04, w: CW - 0.20, h: 0.24, fontSize: 10.5, color: CD.mute, fontFace: KR, margin: 0 });
      break;
    }
    case 'executive': {
      s.addShape('line' as any, { x: M, y: 0.38, w: CW, h: 0, line: { color: C.brass, width: 0.5 } });
      s.addText(`${numStr}  ·  ${kicker}`, { x: M, y: 0.48, w: CW, h: 0.22, fontSize: 9, bold: true, color: C.brass, fontFace: NUM, charSpacing: 3, margin: 0, align: 'center' });
      s.addText(cleanTitle, { x: M, y: 0.68, w: CW, h: 0.46, fontSize: 26, bold: true, color: 'FFFFFF', fontFace: TITLE_KR, margin: 0, align: 'center' });
      s.addShape('line' as any, { x: M + CW * 0.3, y: 1.20, w: CW * 0.4, h: 0, line: { color: C.brass, width: 1 } });
      if (sub) s.addText(sub, { x: M, y: 1.10, w: CW, h: 0.22, fontSize: 11, color: CD.mute, fontFace: KR, margin: 0, align: 'center' });
      break;
    }
    case 'minimal': {
      if (numStr) s.addText(numStr, { x: M, y: 0.48, w: 0.36, h: 0.24, fontSize: 10, bold: true, color: CD.mute, fontFace: NUM, margin: 0 });
      s.addText(kicker, { x: M + 0.40, y: 0.48, w: CW - 0.40, h: 0.20, fontSize: 8.5, bold: true, color: CD.mute, fontFace: NUM, charSpacing: 1.5, margin: 0 });
      s.addText(cleanTitle, { x: M, y: 0.64, w: CW, h: 0.46, fontSize: 24, bold: true, color: 'FFFFFF', fontFace: TITLE_KR, margin: 0 });
      s.addShape('line' as any, { x: M, y: 1.16, w: 2.5, h: 0, line: { color: C.brass, width: 1.5 } });
      if (sub) s.addText(sub, { x: M, y: 1.08, w: CW, h: 0.22, fontSize: 10.5, color: CD.mute, fontFace: KR, margin: 0 });
      break;
    }
    case 'dramatic': {
      // Full-width dark strip + left brass accent
      s.addShape('rect' as any, { x: 0, y: 0.30, w: W, h: 1.00, fill: { color: CD.block } });
      s.addShape('rect' as any, { x: 0, y: 0.30, w: 0.12, h: 1.00, fill: { color: C.brass } });
      if (numStr) {
        s.addText(numStr, { x: M, y: 0.36, w: 0.60, h: 0.50, fontSize: 28, bold: true, color: C.brass, fontFace: NUM, margin: 0 });
      }
      s.addText(kicker, { x: M + 0.70, y: 0.36, w: CW - 0.70, h: 0.22, fontSize: 9, bold: true, color: C.brass, fontFace: NUM, charSpacing: 2.5, margin: 0 });
      s.addText(cleanTitle, { x: M + 0.70, y: 0.58, w: CW - 0.70, h: 0.44, fontSize: 24, bold: true, color: 'FFFFFF', fontFace: TITLE_KR, margin: 0 });
      if (sub) s.addText(sub, { x: M + 0.70, y: 1.02, w: CW - 0.70, h: 0.22, fontSize: 10, color: CD.mute, fontFace: KR, margin: 0 });
      break;
    }
    case 'classic':
    default: {
      // Original classic style (keep existing code)
      if (numStr) {
        s.addShape('ellipse' as any, { x: M, y: 0.50, w: 0.42, h: 0.42, fill: { color: C.brass } });
        s.addText(numStr, { x: M, y: 0.50, w: 0.42, h: 0.42, align: 'center', valign: 'middle', fontSize: 13, bold: true, color: 'FFFFFF', fontFace: NUM, margin: 0 });
      }
      s.addText(kicker, { x: M + 0.62, y: 0.50, w: CW - 0.62, h: 0.20, fontSize: 9.5, bold: true, color: C.brass, fontFace: NUM, charSpacing: 2, margin: 0 });
      s.addText(cleanTitle, { x: M + 0.62, y: 0.72, w: CW - 0.62, h: 0.46, fontSize: 24, bold: true, color: 'FFFFFF', fontFace: TITLE_KR, margin: 0 });
      if (sub) s.addText(sub, { x: M + 0.62, y: 1.10, w: CW - 0.62, h: 0.26, fontSize: 11, color: CD.mute, fontFace: KR, margin: 0 });
      break;
    }
  }
}

/** §5 푸터 — layoutStyle 분기 */
export function foot(
  s: Slide,
  page: number,
  docno: string,
  onDark?: boolean,
): void {
  const textColor = onDark ? CD.faint : C.mute;
  const style = THEME_META.layoutStyle;

  switch (style) {
    case 'modern': {
      // 중앙 도트 구분 + 액센트 페이지 번호
      const footText = `${THEME_META.companyName}  ·  ${docno}  ·  ${page}`;
      s.addText(footText, {
        x: M, y: 7.02, w: CW, h: 0.22,
        align: 'center', fontSize: 9, color: textColor, fontFace: KR, margin: 0,
      });
      // 하단 얇은 액센트 라인
      s.addShape('line' as any, {
        x: M + CW * 0.35, y: 6.98, w: CW * 0.3, h: 0,
        line: { color: C.brass, width: 0.5 },
      });
      break;
    }
    case 'executive': {
      // 중앙 정렬 + 상단 라인
      s.addShape('line' as any, {
        x: M, y: 6.94, w: CW, h: 0,
        line: { color: C.brass, width: 0.3 },
      });
      s.addText(`${docno}`, {
        x: M, y: 7.00, w: CW * 0.5, h: 0.22,
        fontSize: 9, color: textColor, fontFace: KR, margin: 0,
      });
      s.addText(String(page), {
        x: W - M - 0.6, y: 7.00, w: 0.6, h: 0.22,
        align: 'right', fontSize: 8, bold: true, color: C.brass, fontFace: NUM, margin: 0,
      });
      break;
    }
    case 'minimal': {
      // 페이지 번호만 우측
      s.addText(String(page), {
        x: W - M - 0.6, y: 7.02, w: 0.6, h: 0.22,
        align: 'right', fontSize: 8, color: C.mute2, fontFace: NUM, margin: 0,
      });
      break;
    }
    case 'dramatic': {
      // 전폭 액센트 바 + 흰 텍스트
      s.addShape('rect' as any, {
        x: 0, y: 7.08, w: W, h: 0.42,
        fill: { color: C.ink },
      });
      s.addShape('rect' as any, {
        x: 0, y: 7.08, w: 0.12, h: 0.42,
        fill: { color: C.brass },
      });
      s.addText(`${docno}`, {
        x: M, y: 7.12, w: 8, h: 0.20,
        fontSize: 9, color: onDark ? CD.faint : CD.mute, fontFace: KR, margin: 0,
      });
      s.addText(String(page), {
        x: W - M - 0.8, y: 7.12, w: 0.8, h: 0.20,
        align: 'right', fontSize: 9, bold: true, color: C.brass, fontFace: NUM, margin: 0,
      });
      break;
    }
    case 'classic':
    default: {
      s.addText(`${THEME_META.companyName || 'CREDEAL'}   |   ${docno}`, {
        x: M, y: 6.98, w: 8, h: 0.24,
        fontSize: 8, color: textColor, fontFace: KR, margin: 0,
      });
      s.addText(String(page), {
        x: W - M - 1.0, y: 6.98, w: 1.0, h: 0.24,
        align: 'right', fontSize: 9, bold: true, color: C.brass, fontFace: NUM, margin: 0,
      });
      break;
    }
  }
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
    fontSize: 11, color: onDark ? CD.faint : C.mute2,
    fontFace: KR, margin: 0, lineSpacingMultiple: 1.25,
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
  labelFontSize?: number; // 라벨 폰트 크기 (기본 9.5, 긴 라벨 자동 축소용)
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

  // M-4: 라벨 높이를 textH()로 동적 역산 (고정 0.22→실측)
  const labelFontSize = opt.labelFontSize ?? 9.5;
  const labelW = w - 0.36;
  const labelH = Math.max(0.22, computeTextH(label, labelW, labelFontSize));

  // 라벨
  s.addText(label, {
    x: x + 0.18, y: y + 0.14, w: labelW, h: labelH,
    fontSize: labelFontSize, color: labCol, fontFace: KR, margin: 0,
  });

  // M-5: 값 상자를 라벨 높이 아래에서 시작 (겹침 방지)
  const valY = y + 0.14 + labelH + 0.02;

  // 값 — FIX-RC1: 텍스트 길이에 따른 동적 폰트 사이즈
  // 짧은 숫자(6자 이하) → 25pt, 중간(12자 이하) → 18pt, 긴 한글 → 14pt
  const hasKoreanVal = /[\uAC00-\uD7AF]/.test(value);
  const dynamicVs = opt.vs ?? (
    value.length <= 6 ? 25 :
    value.length <= 12 ? 18 :
    value.length <= 20 ? 14 : 11
  );
  const valH = Math.min(0.44, h - (valY - y) - 0.40); // 남은 공간에 맞춤
  s.addText(value, {
    x: x + 0.18, y: valY, w: labelW, h: Math.max(0.30, valH),
    fontSize: dynamicVs, bold: true, color: valCol, fontFace: hasKoreanVal ? KR : NUM, margin: 0,
    shrinkText: true,
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

  // F1 fix: 배지 유무에 따라 컬럼 비율 동적 분배
  const hasBadge = list.some(r => r[2]);
  const labW = hasBadge ? w * 0.40 : w * 0.38;
  const valW = hasBadge ? w * 0.38 : w * 0.62;

  list.forEach((row, i) => {
    const ry = y + i * rh;
    const [label, value, badge, valCol] = row;

    // 라벨
    s.addText(label, {
      x, y: ry, w: labW, h: rh,
      fontSize: fs, color: labColor, fontFace: KR,
      valign: 'middle', margin: 0, lineSpacingMultiple: 1.20,
    });

    // 값
    s.addText(value, {
      x: x + labW, y: ry, w: valW, h: rh,
      fontSize: fs, bold: true, color: valCol ?? valColor, fontFace: KR,
      valign: 'middle', margin: 0, lineSpacingMultiple: 1.20,
    });

    // 배지 (선택)
    if (badge) {
      const pvKey = badge.startsWith('✓') ? 'registry'
        : badge.startsWith('★') ? 'expert'
        : badge.startsWith('▲') ? 'seller'
        : badge.startsWith('●') ? 'broker'
        : badge.startsWith('◈') ? 'derived'
        : 'assumed';
      const [, fg, bg] = PV[pvKey as ProvenanceKind] ?? PV.assumed;
      s.addText(badge, {
        x: x + w * 0.80, y: ry + 0.04, w: w * 0.20, h: rh - 0.08,
        fontSize: 9, bold: true, color: fg, fontFace: KR,
        fill: { color: bg },
        valign: 'middle', align: 'center', margin: 0,
      });
    }

    // 구분선
    if (i < list.length - 1) {
      s.addShape('line' as any, {
        x, y: ry + rh, w, h: 0,
        line: { color: opt.onDark ? CD.border : C.line, width: 0.3 },
      });
    }
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

  s.addTable(tableRows, {
    x, y, w, colW, rowH: rh,
    autoPage: true,
    autoPageRepeatHeader: true,
    autoPageLineWeight: 0.5,
  } as any);

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

  // 제목 (이모지 정제)
  const cleanCalloutTitle = (title || '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '')
    .replace(/^[#\s•·\-*]+/g, '')
    .trim();

  s.addText(cleanCalloutTitle, {
    x: x + 0.20, y: y + 0.12, w: w - 0.36, h: 0.22,
    fontSize: 10.5, bold: true, color: titleColor,
    fontFace: KR, margin: 0,
  });

  // 본문 (불릿 분리 및 행잉 인덴트 렌더링)
  const bodyLines = (body || '').split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  const textRuns = bodyLines.map((line: string) => {
    const cleanLine = line
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '')
      .replace(/^[•·\-*]+\s*/, '')
      .trim();
    const isBullet = /^[•·\-*]/.test(line) || bodyLines.length > 1;
    return {
      text: cleanLine,
      options: {
        bullet: isBullet ? { code: '2022' } : undefined,
        fontSize: 9.3,
        color: C.body,
        fontFace: KR,
        breakLine: true,
        indentLevel: 0,
        margin: [0, 0, 0, 0],
      }
    };
  });

  if (textRuns.length > 0) {
    s.addText(textRuns as any, {
      x: x + 0.20, y: y + 0.36, w: w - 0.36, h: h - 0.44,
      valign: 'top', margin: 0, lineSpacingMultiple: 1.20,
    });
  }
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
    fontSize: 9, bold: true, color: fg,
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

/** 빈 카드 (직접 채울 때) — layoutStyle 분기 */
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
  const style = THEME_META.layoutStyle;

  switch (style) {
    case 'modern': {
      // 직각 + 상단 액센트 바
      s.addShape('rect' as any, {
        x, y, w, h,
        fill: { color: fill },
        line: { color: lineCol, width: 0.3 },
      });
      s.addShape('rect' as any, {
        x, y, w, h: 0.04,
        fill: { color: C.brass },
      });
      break;
    }
    case 'executive': {
      // 큰 라운드 + 두꺼운 보더
      s.addShape('roundRect' as any, {
        x, y, w, h,
        rectRadius: 0.10,
        fill: { color: fill },
        line: { color: lineCol, width: 1 },
      });
      break;
    }
    case 'minimal': {
      // 보더 없음 + 미묘한 배경
      s.addShape('rect' as any, {
        x, y, w, h,
        fill: { color: fill },
      });
      break;
    }
    case 'dramatic': {
      // 직각 + 좌측 액센트 바
      s.addShape('rect' as any, {
        x, y, w, h,
        fill: { color: fill },
        line: { color: lineCol, width: 0.3 },
      });
      s.addShape('rect' as any, {
        x, y, w: 0.05, h,
        fill: { color: C.brass },
      });
      break;
    }
    case 'classic':
    default: {
      s.addShape('roundRect' as any, {
        x, y, w, h,
        rectRadius: opt?.radius ?? 0.06,
        fill: { color: fill },
        line: { color: lineCol, width: 0.5 },
      });
      break;
    }
  }
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
      fontSize: 9, color: C.mute, fontFace: KR,
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

// ════════════════════════════════════════
// §9 D31 BL-3: 텍스트 높이 자동 계산 (layout-physics 재수출)
// ════════════════════════════════════════
export { textH, fitBox, gridFit } from './utils/layout-physics';
