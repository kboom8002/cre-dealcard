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
import { textH as computeTextH, fitTextToBox, fitTableCell, getCharWidthInches, simulateTextWrap } from './layout-physics';
import { AsyncLocalStorage } from 'node:async_hooks';

// ════════════════════════════════════════
// §2 기하
// ════════════════════════════════════════

export const W = 13.333;   // LAYOUT_WIDE 캔버스 폭
export const H = 7.5;      // 높이
export const M = 0.62;     // 좌우 표준 안전 마진 (SSoT 정본: im.budget.yaml)
export const CW = 12.093;  // 콘텐츠 폭 = W - M*2 (13.333 - 1.24 = 12.093)
export const SAFE_BOTTOM = 6.75; // 안전 지면 하한 (푸터 침범 차단)

/** §6 컬럼 패턴 — 컬럼 폭 계산 */
export const col = (n: number, gap: number): number => (CW - gap * (n - 1)) / n;

/** §6 컬럼 패턴 — i번째 컬럼 x 좌표 */
export const colX = (i: number, w: number, gap: number): number => M + i * (w + gap);

/** §6.1 표준 2컬럼 분할 바운더리 */
export interface TwoColBounds {
  left: { x: number; y: number; w: number; h: number };
  right: { x: number; y: number; w: number; h: number };
  gap: number;
}

/**
 * §6.2 정규 2컬럼 분할 프리셋 계산기
 * - 60_40: lw = 7.30", gap = 0.40", rw = 4.393"
 * - 50_50: lw = 5.846", gap = 0.40", rw = 5.847"
 * - 45_55: lw = 5.45", gap = 0.28", rw = 6.363"
 * - stacking: lw = 3.40", gap = 0.30", rw = 8.393"
 */
export function split2Col(
  preset: '60_40' | '50_50' | '45_55' | 'stacking',
  y: number,
  h: number,
  customGap?: number
): TwoColBounds {
  let lw = 7.30;
  let gap = customGap ?? 0.40;

  switch (preset) {
    case '60_40':
      lw = 7.30;
      gap = customGap ?? 0.40;
      break;
    case '50_50':
      gap = customGap ?? 0.40;
      lw = customGap !== undefined ? Math.floor(((CW - gap) / 2) * 1000) / 1000 : 5.846;
      break;
    case '45_55':
      lw = 5.45;
      gap = customGap ?? 0.28;
      break;
    case 'stacking':
      lw = 3.40;
      gap = customGap ?? 0.30;
      break;
  }

  const rw = Math.round((CW - lw - gap) * 1000) / 1000;
  const left = { x: M, y, w: lw, h };
  const right = { x: Math.round((M + lw + gap) * 1000) / 1000, y, w: rw, h };

  return { left, right, gap };
}


// ════════════════════════════════════════
// §10 provenance 배지 타입 선언 (테마 컨텍스트 참조용)
// ════════════════════════════════════════

// D29 M-5: 정본 9종(+1) 출처 체계 (ontology/provenance.ts 정본)
import type { ProvenanceKind } from '@/domain/ontology';
export type { ProvenanceKind };



// ════════════════════════════════════════
// §3 색 팔레트 (테마 동적 주입 및 AsyncLocalStorage 테마 격리)
// ════════════════════════════════════════

export interface ActiveThemeContext {
  theme: PptxThemeTokens;
  C: Record<string, string>;
  CD: Record<string, string>;
  KR: string;
  TITLE_KR: string;
  THEME_META: {
    coverStyle: string;
    layoutStyle: string;
    companyName: string;
    companyTagline: string;
    presetId: string;
  };
  PV: Record<ProvenanceKind, [string, string, string]>;
}

export const ActiveThemeStore = new AsyncLocalStorage<ActiveThemeContext>();

function createThemeProxy<T extends Record<string, any>>(
  target: T,
  keyExtractor: (ctx: ActiveThemeContext) => T
): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const store = ActiveThemeStore.getStore();
      if (store && typeof prop === 'string') {
        const storeMap = keyExtractor(store);
        if (prop in storeMap) {
          return storeMap[prop];
        }
      }
      return Reflect.get(t, prop, receiver);
    },
    set(t, prop, value, receiver) {
      const store = ActiveThemeStore.getStore();
      if (store && typeof prop === 'string') {
        const storeMap = keyExtractor(store);
        (storeMap as any)[prop] = value;
        return true;
      }
      return Reflect.set(t, prop, value, receiver);
    },
    has(t, prop) {
      const store = ActiveThemeStore.getStore();
      if (store && typeof prop === 'string') {
        const storeMap = keyExtractor(store);
        return prop in storeMap || prop in t;
      }
      return Reflect.has(t, prop);
    },
    ownKeys(t) {
      const store = ActiveThemeStore.getStore();
      return store ? Reflect.ownKeys(keyExtractor(store)) : Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, prop) {
      const store = ActiveThemeStore.getStore();
      if (store && typeof prop === 'string') {
        const storeMap = keyExtractor(store);
        if (prop in storeMap) {
          return {
            configurable: true,
            enumerable: true,
            value: storeMap[prop],
            writable: true,
          };
        }
      }
      return Reflect.getOwnPropertyDescriptor(t, prop);
    },
  });
}

/**
 * C: 라이트 슬라이드 색상 팔레트.
 * 기본값은 golden_institutional. withThemeIsolation() 또는 setActiveTheme()으로 안전하게 격리/교체됩니다.
 */
const rawC: Record<string, string> = {
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

  // 브랜드 및 네이비 테마 토큰
  brand: '10161F',
  navy:  '1E3A8A',

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

export const C: Record<string, string> = createThemeProxy(rawC, ctx => ctx.C);

/** 다크 슬라이드 전용 색상 — setActiveTheme() / withThemeIsolation()에 의해 교체 */
const rawCD: Record<string, string> = {
  card:          '1B2531',
  block:         '232F3C',
  border:        '2A3644',
  body:          'A8B2BC',
  mute:          '8A96A2',
  faint:         '6B7885',
  accentBg:      '2A1F12',
  accentBorder:  '5C4620',
  accentText:    'D3C6AC',
  brand:         'FFFFFF',
  navy:          '475569',
};

export const CD: Record<string, string> = createThemeProxy(rawCD, ctx => ctx.CD);

// ════════════════════════════════════════
// §4 타이포
// ════════════════════════════════════════

const rawTypography: { KR: string; TITLE_KR: string } = {
  KR: '맑은 고딕',
  TITLE_KR: '맑은 고딕',
};

/**
 * Typography Token Proxy:
 * Wraps String.prototype to dynamically resolve the font family from ActiveThemeStore.
 * Ensures concurrent requests under different themes never bleed typography settings,
 * while remaining 100% backward-compatible with archetype call sites importing KR and TITLE_KR.
 */
function createTypographyProxy(
  key: 'KR' | 'TITLE_KR',
  fallback: string
): string {
  const target = Object.create(String.prototype);
  target[Symbol.for('nodejs.util.inspect.custom')] = function (
    _depth: number,
    opts: any
  ) {
    const store = ActiveThemeStore.getStore();
    const current = (store ? store[key] : undefined) ?? rawTypography[key] ?? fallback;
    return opts && typeof opts.stylize === 'function'
      ? opts.stylize(current, 'string')
      : current;
  };

  return new Proxy(target, {
    get(t, prop, receiver) {
      const store = ActiveThemeStore.getStore();
      const current = (store ? store[key] : undefined) ?? rawTypography[key] ?? fallback;

      if (prop === Symbol.toPrimitive) {
        return (_hint: string) => current;
      }
      if (prop === 'toString' || prop === 'valueOf') {
        return () => current;
      }
      if (prop === 'toJSON') {
        return () => current;
      }
      if (prop === 'length') {
        return current.length;
      }
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        return current[Number(prop)];
      }
      const val = (current as any)[prop];
      if (typeof val === 'function') {
        return val.bind(current);
      }
      return Reflect.get(t, prop, receiver);
    },
    set(_t, _prop, value) {
      const store = ActiveThemeStore.getStore();
      if (store) {
        (store as any)[key] = String(value);
        return true;
      }
      rawTypography[key] = String(value);
      return true;
    },
    has(t, prop) {
      const store = ActiveThemeStore.getStore();
      const current = (store ? store[key] : undefined) ?? rawTypography[key] ?? fallback;
      return prop in Object(current) || prop in t;
    },
    ownKeys(t) {
      const store = ActiveThemeStore.getStore();
      const current = (store ? store[key] : undefined) ?? rawTypography[key] ?? fallback;
      return Reflect.ownKeys(Object(current));
    },
    getOwnPropertyDescriptor(t, prop) {
      const store = ActiveThemeStore.getStore();
      const current = (store ? store[key] : undefined) ?? rawTypography[key] ?? fallback;
      if (prop === 'length') {
        return {
          configurable: true,
          enumerable: false,
          value: current.length,
          writable: false,
        };
      }
      return Reflect.getOwnPropertyDescriptor(t, prop);
    },
  }) as unknown as string;
}

export const KR: string = createTypographyProxy('KR', '맑은 고딕');
export const TITLE_KR: string = createTypographyProxy('TITLE_KR', '맑은 고딕');
export const NUM = 'Arial';

// ════════════════════════════════════════
// §3.1 테마 동적 주입
// ════════════════════════════════════════

/** 활성 테마 메타데이터 (coverStyle 등 비-색상 속성) */
const rawTHEME_META: {
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

export const THEME_META = createThemeProxy(rawTHEME_META, ctx => ctx.THEME_META);

const rawPV: Record<ProvenanceKind, [string, string, string]> = {
  registry:               ['✓ 등기·대장',    rawC.green,  rawC.greenL ],
  public_api:             ['✓ 공공데이터',   rawC.green,  rawC.greenL ],
  public_api_identified:  ['✓ 공공+중개인',  rawC.green,  rawC.greenL ],
  broker_aug:             ['● 현장확인',     rawC.blue,   rawC.blueL  ],
  expert:                 ['★ 전문가검증',   rawC.amber,  rawC.amberL ],
  ledger:                 ['✓ 원장확인',     rawC.green,  rawC.greenL ],
  seller:                 ['▲ 매도인고지',   rawC.violet, rawC.violetL],
  broker:                 ['● 중개인입력',   rawC.blue,   rawC.blueL  ],
  derived:                ['◈ 파생계산',     rawC.mute,   rawC.line2  ],
  assumed:                ['◇ AI추정·가정',  rawC.mute,   rawC.line2  ],
};

export const PV: Record<ProvenanceKind, [string, string, string]> = createThemeProxy(rawPV, ctx => ctx.PV);

export function buildThemeContext(theme: PptxThemeTokens): ActiveThemeContext {
  const themeC: Record<string, string> = {
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
    brass:   theme.accent,
    brassD:  theme.accentD,
    brassL:  theme.accentL,
    brassT:  theme.accentT,
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
    brand:   theme.ink,
    navy:    theme.slate || '1E3A8A',
  };

  const themeCD: Record<string, string> = {
    card:          theme.darkCard,
    block:         theme.darkBlock,
    border:        theme.darkBorder,
    body:          theme.darkBody,
    mute:          theme.darkMute,
    faint:         theme.darkFaint,
    accentBg:      theme.darkAccentBg,
    accentBorder:  theme.darkAccentBorder,
    accentText:    theme.darkAccentText,
    brand:         'FFFFFF',
    navy:          theme.darkBorder || '475569',
  };

  const themeKR = theme.bodyFont || '맑은 고딕';
  const themeTITLE_KR = theme.titleFont || themeKR;

  const themeMeta = {
    coverStyle:     theme.coverStyle,
    layoutStyle:    theme.layoutStyle,
    companyName:    theme.companyName,
    companyTagline: theme.companyTagline,
    presetId:       theme.presetId,
  };

  const themePV: Record<ProvenanceKind, [string, string, string]> = {
    registry:               ['✓ 등기·대장',    themeC.green,  themeC.greenL ],
    public_api:             ['✓ 공공데이터',   themeC.green,  themeC.greenL ],
    public_api_identified:  ['✓ 공공+중개인',  themeC.green,  themeC.greenL ],
    broker_aug:             ['● 현장확인',     themeC.blue,   themeC.blueL  ],
    expert:                 ['★ 전문가검증',   themeC.amber,  themeC.amberL ],
    ledger:                 ['✓ 원장확인',     themeC.green,  themeC.greenL ],
    seller:                 ['▲ 매도인고지',   themeC.violet, themeC.violetL],
    broker:                 ['● 중개인입력',   themeC.blue,   themeC.blueL  ],
    derived:                ['◈ 파생계산',     themeC.mute,   themeC.line2  ],
    assumed:                ['◇ AI추정·가정',  themeC.mute,   themeC.line2  ],
  };

  return {
    theme,
    C: themeC,
    CD: themeCD,
    KR: themeKR,
    TITLE_KR: themeTITLE_KR,
    THEME_META: themeMeta,
    PV: themePV,
  };
}

/**
 * 활성 테마를 설정합니다.
 * pptx-renderer에서 렌더링 전에 호출하면,
 * 이후 모든 아키타입/imlib 함수가 해당 프리셋의 색상을 사용합니다.
 */
export function setActiveTheme(theme: PptxThemeTokens): void {
  const store = ActiveThemeStore.getStore();
  const targetC = store ? store.C : rawC;
  const targetCD = store ? store.CD : rawCD;
  const targetMeta = store ? store.THEME_META : rawTHEME_META;
  const targetPV = store ? store.PV : rawPV;

  // ── 라이트 팔레트 ──
  Object.assign(targetC, {
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
    brand:   theme.ink,
    navy:    theme.slate || '1E3A8A',
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
  Object.assign(targetCD, {
    card:          theme.darkCard,
    block:         theme.darkBlock,
    border:        theme.darkBorder,
    body:          theme.darkBody,
    mute:          theme.darkMute,
    faint:         theme.darkFaint,
    accentBg:      theme.darkAccentBg,
    accentBorder:  theme.darkAccentBorder,
    accentText:    theme.darkAccentText,
    brand:         'FFFFFF',
    navy:          theme.darkBorder || '475569',
  });

  // ── 타이포 ──
  const nextKR = theme.bodyFont || '맑은 고딕';
  const nextTitleKR = theme.titleFont || nextKR;
  if (store) {
    store.KR = nextKR;
    store.TITLE_KR = nextTitleKR;
  } else {
    rawTypography.KR = nextKR;
    rawTypography.TITLE_KR = nextTitleKR;
  }
  // NUM은 항상 Arial (숫자/라틴 전용)

  // ── 메타 ──
  Object.assign(targetMeta, {
    coverStyle:     theme.coverStyle,
    layoutStyle:    theme.layoutStyle,
    companyName:    theme.companyName,
    companyTagline: theme.companyTagline,
    presetId:       theme.presetId,
  });

  // ── PV (provenance 배지) 색상 갱신 — D29 M-5 정본 9종 ──
  targetPV.registry              = ['✓ 등기·대장',    targetC.green,  targetC.greenL ];
  targetPV.public_api            = ['✓ 공공데이터',   targetC.green,  targetC.greenL ];
  targetPV.public_api_identified = ['✓ 공공+중개인',  targetC.green,  targetC.greenL ];
  targetPV.broker_aug            = ['● 현장확인',     targetC.blue,   targetC.blueL  ];
  targetPV.expert                = ['★ 전문가검증',   targetC.amber,  targetC.amberL ];
  targetPV.ledger                = ['✓ 원장확인',     targetC.green,  targetC.greenL ];
  targetPV.seller                = ['▲ 매도인고지',   targetC.violet, targetC.violetL];
  targetPV.broker                = ['● 중개인입력',   targetC.blue,   targetC.blueL  ];
  targetPV.derived               = ['◈ 파생계산',     targetC.mute,   targetC.line2  ];
  targetPV.assumed               = ['◇ AI추정·가정',  targetC.mute,   targetC.line2  ];
}

/**
 * 테마 격리 래퍼: 동시 렌더링 시 테마 오염을 방지합니다.
 * AsyncLocalStorage를 사용하여 비동기 실행 컨텍스트별로 테마를 완전 격리합니다.
 */
export async function withThemeIsolation<T>(theme: PptxThemeTokens, fn: () => Promise<T>): Promise<T> {
  const ctx = buildThemeContext(theme);
  return ActiveThemeStore.run(ctx, fn);
}

/** 활성 테마 토큰 반환 */
export function getActiveTheme(): PptxThemeTokens | undefined {
  return ActiveThemeStore.getStore()?.theme;
}

/** 활성 바디 폰트 반환 */
export function getActiveKR(): string {
  return ActiveThemeStore.getStore()?.KR ?? rawTypography.KR;
}

/** 활성 타이틀 폰트 반환 */
export function getActiveTitleKR(): string {
  return ActiveThemeStore.getStore()?.TITLE_KR ?? rawTypography.TITLE_KR;
}

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

/**
 * Fits slide header title within available width using fitTextToBox.
 * Fits down to 16pt on 1 line. If title cannot fit on 1 line, expands to 2 lines
 * and flags isTwoLine = true so subtitle (sub) and following elements can be pushed down.
 */
function fitTitleHeader(cleanTitle: string, titleW: number, initialFs: number, defaultH: number = 0.42) {
  let titleFit = fitTextToBox(cleanTitle, titleW, defaultH, {
    minFontSize: 16,
    maxFontSize: initialFs,
    targetLines: 1,
    allowTruncate: false,
  });
  let isTwoLine = false;
  if (titleFit.lines.length > 1 || titleFit.requiredHeight > defaultH + 0.02) {
    titleFit = fitTextToBox(cleanTitle, titleW, 0.85, {
      minFontSize: 14,
      maxFontSize: Math.min(initialFs, 18),
      targetLines: 2,
      allowTruncate: true,
    });
    isTwoLine = titleFit.lines.length > 1;
  }
  const titleH = isTwoLine ? Math.max(0.68, titleFit.requiredHeight) : defaultH;
  return { titleFit, isTwoLine, titleH };
}

/**
 * Basic IM(credeal_basic): 슬라이드 제목 위 소형 키커(예: '요약' / '요약', 'Land & Cadastral' / '토지 정보')는
 * 큰 제목과 중복되므로 표시하지 않는다. 번호 배지와 큰 제목만 수직 정렬한다.
 */
export function isKickerSuppressed(): boolean {
  return THEME_META.presetId === 'credeal_basic';
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
  const hideKicker = isKickerSuppressed();

  switch (style) {
    // ── modern: 좌측 액센트 세로 바 + 좌정렬 ──
    case 'modern': {
      const titleW = CW - 0.20;
      const { titleFit, isTwoLine, titleH } = fitTitleHeader(cleanTitle, titleW, 22, 0.42);
      const titleY = 0.62;
      const subY = isTwoLine ? Math.max(1.04, titleY + titleH + 0.04) : 1.04;
      const barH = sub ? (subY + 0.24 - 0.42) : (titleY + titleH - 0.42);

      // 좌측 액센트 세로 바 - sub 유무에 맞춘 완벽한 수직 정렬
      s.addShape('rect', {
        x: M, y: 0.42, w: 0.05, h: barH,
        fill: { color: C.brass },
      });
      s.addText(hideKicker ? numStr : `${numStr}  ${kicker}`, {
        x: M + 0.20, y: 0.42, w: titleW, h: 0.20,
        fontSize: 9.5, bold: true, color: C.brass,
        fontFace: NUM, charSpacing: 2, margin: 0,
      });
      s.addText(titleFit.displayText, {
        x: M + 0.20, y: titleY, w: titleW, h: titleH,
        fontSize: titleFit.fontSize, bold: true, color: C.ink,
        fontFace: TITLE_KR, margin: 0, shrinkText: true,
      });
      if (sub) {
        s.addText(sub, {
          x: M + 0.20, y: subY, w: titleW, h: 0.24,
          fontSize: 10.5, color: C.mute, fontFace: KR, margin: 0,
        });
      }
      break;
    }

    // ── executive: 중앙 정렬 + 상하 골드 라인 ──
    case 'executive': {
      const titleW = CW;
      const { titleFit, isTwoLine, titleH } = fitTitleHeader(cleanTitle, titleW, 26, 0.46);
      const titleY = 0.68;
      const subY = isTwoLine ? Math.max(1.10, titleY + titleH + 0.04) : 1.10;
      const goldLineY = sub ? subY + 0.26 : titleY + titleH + 0.06;

      // 상단 가는 라인
      s.addShape('line', {
        x: M, y: 0.38, w: CW, h: 0,
        line: { color: C.brass, width: 0.5 },
      });
      // 중앙 정렬 kicker
      s.addText(hideKicker ? numStr : `${numStr}  ·  ${kicker}`, {
        x: M, y: 0.48, w: CW, h: 0.22,
        fontSize: 9, bold: true, color: C.brass,
        fontFace: NUM, charSpacing: 3, margin: 0, align: 'center',
      });
      // 중앙 정렬 title
      s.addText(titleFit.displayText, {
        x: M, y: titleY, w: CW, h: titleH,
        fontSize: titleFit.fontSize, bold: true, color: C.ink,
        fontFace: TITLE_KR, margin: 0, align: 'center', shrinkText: true,
      });
      // 하단 골드 라인
      s.addShape('line', {
        x: M + CW * 0.3, y: goldLineY, w: CW * 0.4, h: 0,
        line: { color: C.brass, width: 1 },
      });
      if (sub) {
        s.addText(sub, {
          x: M, y: subY, w: CW, h: 0.22,
          fontSize: 11, color: C.mute, fontFace: KR, margin: 0, align: 'center',
        });
      }
      break;
    }

    // ── minimal: 깔끔한 좌정렬 + 얇은 구분선 ──
    case 'minimal': {
      const titleW = CW;
      const { titleFit, isTwoLine, titleH } = fitTitleHeader(cleanTitle, titleW, 21, 0.38);
      const titleY = 0.72;
      const subY = isTwoLine ? Math.max(1.08, titleY + titleH + 0.04) : 1.08;
      const lineY = sub ? subY + 0.26 : titleY + titleH + 0.06;

      if (numStr) {
        s.addText(numStr, {
          x: M, y: 0.48, w: 0.36, h: 0.24,
          fontSize: 10, bold: true, color: C.mute2,
          fontFace: NUM, margin: 0,
        });
      }
      if (!hideKicker) s.addText(kicker, {
        x: M + 0.40, y: 0.48, w: CW - 0.40, h: 0.20,
        fontSize: 8.5, bold: true, color: C.mute,
        fontFace: NUM, charSpacing: 1.5, margin: 0,
      });
      s.addText(titleFit.displayText, {
        x: M, y: titleY, w: CW, h: titleH,
        fontSize: titleFit.fontSize, bold: true, color: C.ink,
        fontFace: TITLE_KR, margin: 0, shrinkText: true,
      });
      // 미니멀 구분선
      s.addShape('line', {
        x: M, y: lineY, w: 2.5, h: 0,
        line: { color: C.brass, width: 1.5 },
      });
      if (sub) {
        s.addText(sub, {
          x: M, y: subY, w: CW, h: 0.22,
          fontSize: 10.5, color: C.mute, fontFace: KR, margin: 0,
        });
      }
      break;
    }

    // ── dramatic: 전폭 액센트 그라데이션 스트립 ──
    case 'dramatic': {
      const titleW = CW - 0.70;
      const { titleFit, isTwoLine, titleH } = fitTitleHeader(cleanTitle, titleW, 24, 0.44);
      const titleY = 0.58;
      const subY = isTwoLine ? Math.max(1.02, titleY + titleH + 0.04) : 1.02;
      const stripH = Math.max(1.00, (sub ? subY + 0.24 : titleY + titleH + 0.08) - 0.30);

      // 전폭 다크 스트립
      s.addShape('rect', {
        x: 0, y: 0.30, w: W, h: stripH,
        fill: { color: C.ink },
      });
      // 좌측 액센트 블록
      s.addShape('rect', {
        x: 0, y: 0.30, w: 0.12, h: stripH,
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
      if (!hideKicker) s.addText(kicker, {
        x: M + 0.70, y: 0.36, w: CW - 0.70, h: 0.22,
        fontSize: 9, bold: true, color: C.brass,
        fontFace: NUM, charSpacing: 2.5, margin: 0,
      });
      s.addText(titleFit.displayText, {
        x: M + 0.70, y: titleY, w: titleW, h: titleH,
        fontSize: titleFit.fontSize, bold: true, color: 'FFFFFF',
        fontFace: TITLE_KR, margin: 0, shrinkText: true,
      });
      if (sub) {
        s.addText(sub, {
          x: M + 0.70, y: subY, w: titleW, h: 0.22,
          fontSize: 10, color: CD.mute, fontFace: KR, margin: 0,
        });
      }
      break;
    }

    // ── open_frame: 미니멀 오픈 프레임 + 직각 라인 액센트 ──
    case 'open_frame': {
      const titleW = CW - 0.54;
      const { titleFit, isTwoLine, titleH } = fitTitleHeader(cleanTitle, titleW, 23, 0.40);
      const titleY = 0.70;
      const subY = isTwoLine ? Math.max(1.05, titleY + titleH + 0.04) : 1.05;
      const lineY = isTwoLine ? titleY + titleH + 0.04 : 1.12;

      if (numStr) {
        s.addShape('rect', {
          x: M, y: 0.48, w: 0.42, h: 0.24,
          fill: { color: C.tint },
          line: { color: C.brass, width: 0.5 },
        });
        s.addText(numStr, {
          x: M, y: 0.48, w: 0.42, h: 0.24,
          align: 'center', valign: 'middle',
          fontSize: 11, bold: true, color: C.brass,
          fontFace: NUM, margin: 0,
        });
      }
      if (!hideKicker) s.addText(kicker, {
        x: M + 0.54, y: 0.50, w: CW - 0.54, h: 0.20,
        fontSize: 9.5, bold: true, color: C.brass,
        fontFace: NUM, charSpacing: 2, margin: 0,
      });
      s.addText(titleFit.displayText, {
        x: M + 0.54, y: titleY, w: titleW, h: titleH,
        fontSize: titleFit.fontSize, bold: true, color: C.ink,
        fontFace: TITLE_KR, margin: 0, shrinkText: true,
      });
      s.addShape('line', {
        x: M + 0.54, y: lineY, w: 2.0, h: 0,
        line: { color: C.brass, width: 0.5 },
      });
      if (sub) {
        s.addText(sub, {
          x: M + 0.54 + 2.15, y: isTwoLine ? lineY - 0.05 : 1.05, w: CW - 0.54 - 2.15, h: 0.24,
          fontSize: 10.5, color: C.mute,
          fontFace: KR, margin: 0,
        });
      }
      break;
    }

    // ── classic: 황동 원 + 좌정렬 (기본값) ──
    case 'classic':
    default: {
      const titleW = CW - 0.62;
      const { titleFit, isTwoLine, titleH } = fitTitleHeader(cleanTitle, titleW, 23, 0.40);
      // 키커 미표시 시: 번호 원(중심 y=0.71)과 제목 중심을 일치
      const titleY = hideKicker ? Math.max(0.42, 0.71 - titleH / 2) : 0.70;
      const subY = hideKicker
        ? Math.max(1.02, titleY + titleH + 0.06)
        : (isTwoLine ? Math.max(1.10, titleY + titleH + 0.04) : 1.10);

      if (numStr) {
        s.addShape('ellipse', {
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
      if (!hideKicker) s.addText(kicker, {
        x: M + 0.62, y: 0.50, w: CW - 0.62, h: 0.20,
        fontSize: 9.5, bold: true, color: C.brass,
        fontFace: NUM, charSpacing: 2, margin: 0,
      });
      s.addText(titleFit.displayText, {
        x: M + 0.62, y: titleY, w: titleW, h: titleH,
        fontSize: titleFit.fontSize, bold: true, color: C.ink,
        fontFace: TITLE_KR, margin: 0, shrinkText: true,
      });
      if (sub) {
        s.addText(sub, {
          x: M + 0.62, y: subY, w: titleW, h: 0.26,
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
  const hideKicker = isKickerSuppressed();

  switch (style) {
    case 'modern': {
      const titleW = CW - 0.20;
      const { titleFit, isTwoLine, titleH } = fitTitleHeader(cleanTitle, titleW, 22, 0.42);
      const titleY = 0.62;
      const subY = isTwoLine ? Math.max(1.04, titleY + titleH + 0.04) : 1.04;
      const barH = sub ? (subY + 0.24 - 0.42) : (titleY + titleH - 0.42);

      s.addShape('rect', { x: M, y: 0.42, w: 0.05, h: barH, fill: { color: C.brass } });
      s.addText(hideKicker ? numStr : `${numStr}  ${kicker}`, { x: M + 0.20, y: 0.42, w: titleW, h: 0.20, fontSize: 9.5, bold: true, color: C.brass, fontFace: NUM, charSpacing: 2, margin: 0 });
      s.addText(titleFit.displayText, { x: M + 0.20, y: titleY, w: titleW, h: titleH, fontSize: titleFit.fontSize, bold: true, color: 'FFFFFF', fontFace: TITLE_KR, margin: 0, shrinkText: true });
      if (sub) s.addText(sub, { x: M + 0.20, y: subY, w: titleW, h: 0.24, fontSize: 10.5, color: CD.mute, fontFace: KR, margin: 0 });
      break;
    }
    case 'executive': {
      const titleW = CW;
      const { titleFit, isTwoLine, titleH } = fitTitleHeader(cleanTitle, titleW, 26, 0.46);
      const titleY = 0.68;
      const subY = isTwoLine ? Math.max(1.10, titleY + titleH + 0.04) : 1.10;
      const goldLineY = sub ? subY + 0.26 : titleY + titleH + 0.06;

      s.addShape('line', { x: M, y: 0.38, w: CW, h: 0, line: { color: C.brass, width: 0.5 } });
      s.addText(hideKicker ? numStr : `${numStr}  ·  ${kicker}`, { x: M, y: 0.48, w: CW, h: 0.22, fontSize: 9, bold: true, color: C.brass, fontFace: NUM, charSpacing: 3, margin: 0, align: 'center' });
      s.addText(titleFit.displayText, { x: M, y: titleY, w: CW, h: titleH, fontSize: titleFit.fontSize, bold: true, color: 'FFFFFF', fontFace: TITLE_KR, margin: 0, align: 'center', shrinkText: true });
      s.addShape('line', { x: M + CW * 0.3, y: goldLineY, w: CW * 0.4, h: 0, line: { color: C.brass, width: 1 } });
      if (sub) s.addText(sub, { x: M, y: subY, w: CW, h: 0.22, fontSize: 11, color: CD.mute, fontFace: KR, margin: 0, align: 'center' });
      break;
    }
    case 'minimal': {
      const titleW = CW;
      const { titleFit, isTwoLine, titleH } = fitTitleHeader(cleanTitle, titleW, 24, 0.46);
      const titleY = 0.64;
      const subY = isTwoLine ? Math.max(1.08, titleY + titleH + 0.04) : 1.08;
      const lineY = sub ? subY + 0.26 : titleY + titleH + 0.06;

      if (numStr) s.addText(numStr, { x: M, y: 0.48, w: 0.36, h: 0.24, fontSize: 10, bold: true, color: CD.mute, fontFace: NUM, margin: 0 });
      if (!hideKicker) s.addText(kicker, { x: M + 0.40, y: 0.48, w: CW - 0.40, h: 0.20, fontSize: 8.5, bold: true, color: CD.mute, fontFace: NUM, charSpacing: 1.5, margin: 0 });
      s.addText(titleFit.displayText, { x: M, y: titleY, w: CW, h: titleH, fontSize: titleFit.fontSize, bold: true, color: 'FFFFFF', fontFace: TITLE_KR, margin: 0, shrinkText: true });
      s.addShape('line', { x: M, y: lineY, w: 2.5, h: 0, line: { color: C.brass, width: 1.5 } });
      if (sub) s.addText(sub, { x: M, y: subY, w: CW, h: 0.22, fontSize: 10.5, color: CD.mute, fontFace: KR, margin: 0 });
      break;
    }
    case 'dramatic': {
      const titleW = CW - 0.70;
      const { titleFit, isTwoLine, titleH } = fitTitleHeader(cleanTitle, titleW, 24, 0.44);
      const titleY = 0.58;
      const subY = isTwoLine ? Math.max(1.02, titleY + titleH + 0.04) : 1.02;
      const stripH = Math.max(1.00, (sub ? subY + 0.24 : titleY + titleH + 0.08) - 0.30);

      s.addShape('rect', { x: 0, y: 0.30, w: W, h: stripH, fill: { color: CD.block } });
      s.addShape('rect', { x: 0, y: 0.30, w: 0.12, h: stripH, fill: { color: C.brass } });
      if (numStr) {
        s.addText(numStr, { x: M, y: 0.36, w: 0.60, h: 0.50, fontSize: 28, bold: true, color: C.brass, fontFace: NUM, margin: 0 });
      }
      if (!hideKicker) s.addText(kicker, { x: M + 0.70, y: 0.36, w: CW - 0.70, h: 0.22, fontSize: 9, bold: true, color: C.brass, fontFace: NUM, charSpacing: 2.5, margin: 0 });
      s.addText(titleFit.displayText, { x: M + 0.70, y: titleY, w: titleW, h: titleH, fontSize: titleFit.fontSize, bold: true, color: 'FFFFFF', fontFace: TITLE_KR, margin: 0, shrinkText: true });
      if (sub) s.addText(sub, { x: M + 0.70, y: subY, w: titleW, h: 0.22, fontSize: 10, color: CD.mute, fontFace: KR, margin: 0 });
      break;
    }
    case 'open_frame': {
      const titleW = CW - 0.54;
      const { titleFit, isTwoLine, titleH } = fitTitleHeader(cleanTitle, titleW, 22, 0.42);
      const titleY = 0.68;
      const subY = isTwoLine ? Math.max(1.05, titleY + titleH + 0.04) : 1.05;
      const lineY = isTwoLine ? titleY + titleH + 0.04 : 1.12;

      if (numStr) {
        s.addShape('rect', {
          x: M, y: 0.46, w: 0.42, h: 0.26,
          fill: { color: CD.card },
          line: { color: C.brass, width: 0.5 },
        });
        s.addText(numStr, {
          x: M, y: 0.46, w: 0.42, h: 0.26,
          align: 'center', valign: 'middle',
          fontSize: 11, bold: true, color: C.brass,
          fontFace: NUM, margin: 0,
        });
      }
      if (!hideKicker) s.addText(kicker, {
        x: M + 0.54, y: 0.48, w: CW - 0.54, h: 0.20,
        fontSize: 9.5, bold: true, color: C.brass,
        fontFace: NUM, charSpacing: 2, margin: 0,
      });
      s.addText(titleFit.displayText, {
        x: M + 0.54, y: titleY, w: titleW, h: titleH,
        fontSize: titleFit.fontSize, bold: true, color: 'FFFFFF',
        fontFace: TITLE_KR, margin: 0, shrinkText: true,
      });
      s.addShape('line', {
        x: M + 0.54, y: lineY, w: 2.2, h: 0,
        line: { color: C.brass, width: 0.5 },
      });
      if (sub) {
        s.addText(sub, {
          x: M + 0.54 + 2.35, y: isTwoLine ? lineY - 0.05 : 1.05, w: CW - 0.54 - 2.35, h: 0.24,
          fontSize: 10.5, color: CD.mute,
          fontFace: KR, margin: 0,
        });
      }
      break;
    }
    case 'classic':
    default: {
      const titleW = CW - 0.62;
      const { titleFit, isTwoLine, titleH } = fitTitleHeader(cleanTitle, titleW, 24, 0.46);
      const titleY = hideKicker ? Math.max(0.42, 0.71 - titleH / 2) : 0.72;
      const subY = hideKicker
        ? Math.max(1.02, titleY + titleH + 0.06)
        : (isTwoLine ? Math.max(1.10, titleY + titleH + 0.04) : 1.10);

      if (numStr) {
        s.addShape('ellipse', { x: M, y: 0.50, w: 0.42, h: 0.42, fill: { color: C.brass } });
        s.addText(numStr, { x: M, y: 0.50, w: 0.42, h: 0.42, align: 'center', valign: 'middle', fontSize: 13, bold: true, color: 'FFFFFF', fontFace: NUM, margin: 0 });
      }
      if (!hideKicker) s.addText(kicker, { x: M + 0.62, y: 0.50, w: CW - 0.62, h: 0.20, fontSize: 9.5, bold: true, color: C.brass, fontFace: NUM, charSpacing: 2, margin: 0 });
      s.addText(titleFit.displayText, { x: M + 0.62, y: titleY, w: titleW, h: titleH, fontSize: titleFit.fontSize, bold: true, color: 'FFFFFF', fontFace: TITLE_KR, margin: 0, shrinkText: true });
      if (sub) s.addText(sub, { x: M + 0.62, y: subY, w: titleW, h: 0.26, fontSize: 11, color: CD.mute, fontFace: KR, margin: 0 });
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
  // B9 Fix: docno 안전 가드 — undefined/null → 빈 문자열
  const safeDocno = (docno != null && docno !== 'undefined' && docno !== 'null') ? docno : '';
  const textColor = onDark ? CD.faint : C.mute;
  const style = THEME_META.layoutStyle;

  switch (style) {
    case 'modern': {
      // 중앙 도트 구분 + 액센트 페이지 번호
      const footText = safeDocno
        ? `${THEME_META.companyName}  ·  ${safeDocno}  ·  ${page}`
        : `${THEME_META.companyName}  ·  ${page}`;
      s.addText(footText, {
        x: M, y: 7.02, w: CW, h: 0.22,
        align: 'center', fontSize: 9, color: textColor, fontFace: KR, margin: 0,
      });
      // 하단 얇은 액센트 라인
      s.addShape('line', {
        x: M + CW * 0.35, y: 6.98, w: CW * 0.3, h: 0,
        line: { color: C.brass, width: 0.5 },
      });
      break;
    }
    case 'executive': {
      // 중앙 정렬 + 상단 라인
      s.addShape('line', {
        x: M, y: 6.94, w: CW, h: 0,
        line: { color: C.brass, width: 0.3 },
      });
      s.addText(safeDocno, {
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
      s.addShape('rect', {
        x: 0, y: 7.08, w: W, h: 0.42,
        fill: { color: C.ink },
      });
      s.addShape('rect', {
        x: 0, y: 7.08, w: 0.12, h: 0.42,
        fill: { color: C.brass },
      });
      s.addText(safeDocno, {
        x: M, y: 7.12, w: 8, h: 0.20,
        fontSize: 9, color: onDark ? CD.faint : CD.mute, fontFace: KR, margin: 0,
      });
      s.addText(String(page), {
        x: W - M - 0.8, y: 7.12, w: 0.8, h: 0.20,
        align: 'right', fontSize: 9, bold: true, color: C.brass, fontFace: NUM, margin: 0,
      });
      break;
    }
    case 'open_frame': {
      s.addShape('line', {
        x: M, y: 6.94, w: CW, h: 0,
        line: { color: C.line, width: 0.5 },
      });
      const openFrameText = safeDocno
        ? `${THEME_META.companyName || 'CREDEAL'}   |   ${safeDocno}`
        : `${THEME_META.companyName || 'CREDEAL'}`;
      s.addText(openFrameText, {
        x: M, y: 7.00, w: 8, h: 0.22,
        fontSize: 8.5, color: textColor, fontFace: KR, margin: 0,
      });
      s.addText(String(page), {
        x: W - M - 0.8, y: 7.00, w: 0.8, h: 0.22,
        align: 'right', fontSize: 8.5, bold: true, color: C.brass, fontFace: NUM, margin: 0,
      });
      break;
    }
    case 'classic':
    default: {
      const classicText = safeDocno
        ? `${THEME_META.companyName || 'CREDEAL'}   |   ${safeDocno}`
        : `${THEME_META.companyName || 'CREDEAL'}`;
      s.addText(classicText, {
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
  s.addShape('roundRect', {
    x, y, w, h,
    rectRadius: 0.06,
    fill: { color: fill },
    line: { color: lineCol, width: 0.5 },
  });

  // Dynamic label font fitting
  const labelLen = label?.length ?? 0;
  const labelW = w - 0.36;
  const labelFit = fitTextToBox(label, labelW, 0.44, {
    minFontSize: 7.5,
    maxFontSize: opt.labelFontSize ?? (labelLen <= 12 ? 9.5 : labelLen <= 18 ? 8.5 : 7.5),
    targetLines: 2,
    lineSpacingMultiple: 1.15,
  });
  const labelH = Math.max(0.22, labelFit.requiredHeight);

  // 라벨
  s.addText(labelFit.displayText, {
    x: x + 0.18, y: y + 0.14, w: labelW, h: labelH,
    fontSize: labelFit.fontSize, color: labCol, fontFace: KR, margin: 0,
    shrinkText: true,
  });

  // M-5: 값 상자를 라벨 높이 아래에서 시작 (겹침 방지)
  const valY = y + 0.14 + labelH + 0.02;

  // 값 — Dynamic font fitting
  const safeValue = value != null ? String(value) : '';
  const hasKoreanVal = /[\uAC00-\uD7AF]/.test(safeValue);
  const baseVs = opt.vs ?? 22;
  const valFit = fitTextToBox(safeValue || '-', labelW, 0.44, {
    minFontSize: 10,
    maxFontSize: baseVs,
    targetLines: 1,
    lineSpacingMultiple: 1.0,
  });
  const valH = Math.max(0.30, Math.min(0.44, valFit.requiredHeight > 0 ? valFit.requiredHeight : 0.36));

  s.addText(valFit.displayText || '-', {
    x: x + 0.18, y: valY, w: labelW, h: valH,
    fontSize: valFit.fontSize, bold: true, color: valCol,
    fontFace: hasKoreanVal ? (ActiveThemeStore.getStore()?.KR ?? KR) : NUM, margin: 0,
    shrinkText: true, lineSpacingMultiple: 1.0,
  });

  // 단위 (값 옆)
  if (unit) {
    s.addText(unit, {
      x: x + 0.18, y: y + 0.74, w: w - 0.36, h: 0.18,
      fontSize: 8.8, color: labCol, fontFace: KR, margin: 0,
    });
  }

  // 보조 텍스트 — Dynamic subText Y position offset
  if (subText) {
    const subY = Math.max(y + 0.86, valY + valH + 0.02);
    const availableSubH = Math.max(0.24, h - (subY - y) - 0.04);
    const subFit = fitTextToBox(subText, w - 0.36, availableSubH, {
      minFontSize: 7.0,
      maxFontSize: 8.8,
      targetLines: 2,
      lineSpacingMultiple: 1.15,
      allowTruncate: true,
    });
    s.addText(subFit.displayText, {
      x: x + 0.18, y: subY, w: w - 0.36, h: availableSubH,
      fontSize: subFit.fontSize, color: subCol, fontFace: KR, margin: 0,
      lineSpacingMultiple: 1.15,
      shrinkText: true,
    });
  }
}

export type RowEntry = [string, string, string?, string?]; // [라벨, 값, 배지?, 값색?]

export interface RowOpts {
  rh?: number;
  fs?: number;
  onDark?: boolean;
  labRatio?: number; // 커스텀 라벨 컬럼 너비 비율 (기본: 배지 없음 0.28, 배지 있음 0.30)
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

  // 라벨 컬럼 비율 최적화: 기본 0.28로 축소하여 주소/긴 값 컬럼(0.72) 너비 최대 확보
  const hasBadge = list.some(r => r[2]);
  const labRatio = opt.labRatio ?? (hasBadge ? 0.30 : 0.28);
  const labW = w * labRatio;
  const valW = hasBadge ? w * (0.78 - labRatio) : w * (1.0 - labRatio);

  let currentY = y;

  list.forEach((row, i) => {
    const ry = currentY;
    const [label, value, badge, valCol] = row;

    // 값이 없는 단일 텍스트/불릿 행인 경우 전체 너비(w) 사용
    if (!value || value.trim() === '') {
      const labelW = hasBadge ? w * 0.78 : w;
      const labelFit = fitTextToBox(label, labelW - 0.05, rh, {
        minFontSize: 8.5,
        maxFontSize: fs,
        targetLines: 1,
        allowTruncate: true,
      });
      s.addText(labelFit.displayText, {
        x, y: ry, w: labelW, h: rh,
        fontSize: labelFit.fontSize, color: opt.onDark ? 'FFFFFF' : C.ink, fontFace: KR,
        valign: 'middle', margin: 0, lineSpacingMultiple: 1.15,
        shrinkText: true,
      });
    } else {
      // 라벨
      const labelFit = fitTextToBox(label, labW - 0.05, rh, {
        minFontSize: 8.5,
        maxFontSize: fs,
        targetLines: 1,
        allowTruncate: true,
      });
      s.addText(labelFit.displayText, {
        x, y: ry, w: labW, h: rh,
        fontSize: labelFit.fontSize, color: labColor, fontFace: KR,
        valign: 'middle', margin: 0, lineSpacingMultiple: 1.15,
        shrinkText: true,
      });

      // 값 — Dynamic font fitting
      const valFit = fitTextToBox(value, valW - 0.05, rh, {
        minFontSize: 8.0,
        maxFontSize: fs,
        targetLines: 1,
        allowTruncate: true,
      });
      s.addText(valFit.displayText, {
        x: x + labW, y: ry, w: valW, h: rh,
        fontSize: valFit.fontSize, bold: true, color: valCol ?? valColor, fontFace: KR,
        valign: 'middle', margin: 0, lineSpacingMultiple: 1.15,
        shrinkText: true,
      });
    }

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
      s.addShape('line', {
        x, y: ry + rh, w, h: 0,
        line: { color: opt.onDark ? CD.border : C.line, width: 0.3 },
      });
    }

    currentY += rh;
  });

  return currentY;
}

export type CellValue = string | {
  t: string;
  b?: boolean;
  c?: string;
  fill?: string;
  num?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  margin?: [number, number, number, number];
};

export interface TableOpts {
  rh?: number;
  bfs?: number;  // body font size
  hfs?: number;  // header font size
  onDark?: boolean;
  colAlign?: ('left' | 'center' | 'right')[];
  autoPage?: boolean;
  summaryRowIndex?: number;
  borderPt?: number;
}

export type StyledTableOpts = TableOpts;

/** 동적 셀 패딩 스케일링: 행 높이에 맞춰 여백 자동 조절 (텍스트 수직 클리핑 방지) */
export function getDynamicTableMargin(rowH: number): [number, number, number, number] {
  if (rowH < 0.16) {
    return [1, 2, 1, 2];
  }
  if (rowH < 0.22) {
    return [1.5, 3, 1.5, 3];
  }
  return [2, 4, 2, 4];
}

/** 요약/합계 행 판정 (합계, 소계, 총계 등 키워드 감지) */
export function isSummaryRow(
  row: CellValue[],
  rIdx: number,
  totalRows: number,
  optSummaryIndex?: number
): boolean {
  if (optSummaryIndex !== undefined) {
    return rIdx === optSummaryIndex;
  }
  const summaryKeywords = ['합계', '소계', '총계', '계', '총합', '총액', '소 합계', '총 합계'];
  const summaryEnRegex = /^(?:Total|Subtotal|Sum)\b/i;
  return row.some(cell => {
    const raw = typeof cell === 'string' ? cell : (cell?.t ?? '');
    const clean = raw.trim().replace(/\*\*/g, '');
    return summaryKeywords.some(k => (
      clean === k ||
      clean.startsWith(k + ' ') ||
      clean.startsWith(k + ':') ||
      clean.startsWith(k + '：') ||
      clean.startsWith(k + '(') ||
      clean.startsWith(k + '[')
    )) || summaryEnRegex.test(clean);
  });
}

/**
 * §8.2 스타일 표 (L.styledTable)
 * - 컬럼별 정렬(colAlign) 지원 (금액/면적 우측, 코드/날짜 중앙, 명칭 좌측)
 * - 행 높이에 따른 동적 패딩 (rh < 0.16" -> [1,2,1,2], rh < 0.22" -> [1.5,3,1.5,3], 기타 -> [2,4,2,4])
 * - 0.3pt 표준 테두리 (C.line / CD.border)
 * - 합계/요약 행 감지 및 하이라이트 (#F1F5F9 / #2A303C, bold, 상단 0.5pt 테두리)
 * - 모든 셀 fitTableCell 통과로 행 높이 팽창 방지
 */
export function styledTable(
  s: Slide,
  x: number,
  y: number,
  w: number,
  headRow: string[],
  bodyRows: CellValue[][],
  colW: number[],
  opt: StyledTableOpts = {},
): number {
  const rh = opt.rh ?? 0.28;
  const bfs = opt.bfs ?? 10;
  const hfs = opt.hfs ?? 9;
  const isDark = opt.onDark ?? false;
  const cellMargin = getDynamicTableMargin(rh);

  const headerBg = isDark ? CD.block : C.ink;
  const headerFg = isDark ? CD.mute : 'FFFFFF';
  const cellBg = isDark ? C.ink2 : C.bg;
  const cellFg = isDark ? CD.body : C.body;
  const borderColor = isDark ? CD.border : C.line;
  const borderPt = opt.borderPt ?? 0.3;

  const regularBorder = { type: 'solid' as const, pt: borderPt, color: borderColor };
  const summaryBorder: [any, any, any, any] = [
    { type: 'solid', pt: 0.5, color: borderColor },
    { type: 'solid', pt: borderPt, color: borderColor },
    { type: 'solid', pt: borderPt, color: borderColor },
    { type: 'solid', pt: borderPt, color: borderColor },
  ];

  const tableRows: any[][] = [];

  // 헤더
  if (headRow && headRow.length > 0) {
    tableRows.push(headRow.map((h, cIdx) => {
      const cWidth = colW[cIdx] ?? (w / Math.max(1, headRow.length));
      const cleanHeader = String(h || '').replace(/\*\*/g, '');
      const fitted = fitTableCell(cleanHeader, cWidth, rh, hfs);
      const align = opt.colAlign ? opt.colAlign[cIdx] : undefined;
      return {
        text: fitted.text,
        options: {
          fontSize: fitted.fontSize, bold: true, color: headerFg, fontFace: KR,
          fill: { color: headerBg },
          border: regularBorder,
          valign: 'middle' as const, margin: cellMargin,
          ...(align ? { align } : {}),
        },
      };
    }));
  }

  // 본문
  const totalRows = bodyRows.length;
  bodyRows.forEach((row, rIdx) => {
    const isSummary = isSummaryRow(row, rIdx, totalRows, opt.summaryRowIndex);
    tableRows.push(row.map((cell, cIdx) => {
      const isStr = typeof cell === 'string';
      const rawText = isStr ? cell : cell.t;
      const cleanText = String(rawText || '').replace(/\*\*/g, '');
      const isBold = isSummary || (isStr ? cIdx === 0 : (cell.b ?? cIdx === 0));
      const color = isStr
        ? (isSummary ? (isDark ? CD.body : C.ink) : (cIdx === 0 ? (isDark ? 'FFFFFF' : C.ink) : cellFg))
        : (cell.c ?? (isSummary ? (isDark ? CD.body : C.ink) : (cIdx === 0 ? (isDark ? 'FFFFFF' : C.ink) : cellFg)));
      const defaultBg = rIdx % 2 === 0 ? cellBg : (isDark ? CD.block : C.tint);
      let fillColor = isStr ? defaultBg : (cell.fill ?? defaultBg);
      if (isSummary) {
        fillColor = (!isStr && cell.fill && cell.fill !== 'F1F5F9' && cell.fill !== '#F1F5F9')
          ? cell.fill
          : (isDark ? '2A303C' : 'F1F5F9');
      }
      const ff = (isStr ? false : cell.num) ? NUM : KR;

      const cWidth = colW[cIdx] ?? (w / Math.max(1, row.length));
      const fitted = fitTableCell(cleanText, cWidth, rh, bfs);
      const cellAlign = (!isStr && cell.align) ? cell.align : (opt.colAlign ? opt.colAlign[cIdx] : undefined);
      const cellMarginToUse = (!isStr && cell.margin) ? cell.margin : cellMargin;

      return {
        text: fitted.text,
        options: {
          fontSize: fitted.fontSize, bold: isBold, color, fontFace: ff,
          fill: { color: fillColor.replace(/^#/, '') },
          border: isSummary ? summaryBorder : regularBorder,
          valign: 'middle' as const, margin: cellMarginToUse,
          ...(cellAlign ? { align: cellAlign } : {}),
        },
      };
    }));
  });

  s.addTable(tableRows, {
    x, y, w, colW, rowH: rh,
    autoPage: opt.autoPage ?? true,
    autoPageRepeatHeader: true,
    autoPageLineWeight: 0.5,
  });

  return y + (bodyRows.length + (headRow && headRow.length > 0 ? 1 : 0)) * rh;
}

/** §8.2 표 — 레거시 호환 래퍼 */
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
  return styledTable(s, x, y, w, headRow, bodyRows, colW, opt);
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
  const [titleColor, bgColor, barColor] = colors[kind] ?? colors.info;

  // 배경
  s.addShape('roundRect', {
    x, y, w, h,
    rectRadius: 0.06,
    fill: { color: bgColor },
  });

  // 좌측 바
  s.addShape('rect', {
    x, y: y + 0.06, w: 0.04, h: h - 0.12,
    fill: { color: barColor },
  });

  // 제목 (이모지 정제)
  const cleanCalloutTitle = (title || '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '')
    .replace(/^[#\s•·\-*]+/g, '')
    .trim();

  s.addText(cleanCalloutTitle, {
    x: x + 0.16, y: y + 0.10, w: w - 0.28, h: 0.22,
    fontSize: 10.5, bold: true, color: titleColor,
    fontFace: KR, margin: 0,
  });

  // 본문 (불릿 분리 및 행잉 인덴트 렌더링 — 박스 충전율 및 불릿 간격 최적화)
  const bodyLines = (body || '').split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  const textRuns = bodyLines.map((line: string, lineIdx: number) => {
    const cleanLine = line
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '')
      .replace(/^[•·\-*]+\s*/, '')
      .trim();
    const isBullet = /^[•·\-*]/.test(line) || bodyLines.length > 1;
    return {
      text: cleanLine,
      options: {
        bullet: isBullet ? { characterCode: '2022' } : undefined,
        fontSize: 9.8,
        color: C.body,
        fontFace: KR,
        breakLine: true,
        indentLevel: 0,
        paraSpaceBefore: lineIdx > 0 ? 3 : 0,
        margin: [0, 0, 0, 0] as [number, number, number, number],
      }
    };
  });

  if (textRuns.length > 0) {
    s.addText(textRuns, {
      x: x + 0.16, y: y + 0.32, w: w - 0.28, h: h - 0.36,
      valign: 'top', margin: 0, lineSpacingMultiple: 1.08,
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
  s.addShape('roundRect', {
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
  s.addShape('roundRect', {
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
      s.addShape('rect', {
        x, y, w, h,
        fill: { color: fill },
        line: { color: lineCol, width: 0.3 },
      });
      s.addShape('rect', {
        x, y, w, h: 0.04,
        fill: { color: C.brass },
      });
      break;
    }
    case 'executive': {
      // 큰 라운드 + 두꺼운 보더
      s.addShape('roundRect', {
        x, y, w, h,
        rectRadius: 0.10,
        fill: { color: fill },
        line: { color: lineCol, width: 1 },
      });
      break;
    }
    case 'minimal': {
      // 보더 없음 + 미묘한 배경
      s.addShape('rect', {
        x, y, w, h,
        fill: { color: fill },
      });
      break;
    }
    case 'dramatic': {
      // 직각 + 좌측 액센트 바
      s.addShape('rect', {
        x, y, w, h,
        fill: { color: fill },
        line: { color: lineCol, width: 0.3 },
      });
      s.addShape('rect', {
        x, y, w: 0.05, h,
        fill: { color: C.brass },
      });
      break;
    }
    case 'open_frame': {
      // 오픈 프레임: 미니멀 직각 지오메트리 + 정밀 0.5pt 라인 프레임
      s.addShape('rect', {
        x, y, w, h,
        fill: { color: fill },
        line: { color: lineCol, width: 0.5 },
      });
      break;
    }
    case 'classic':
    default: {
      s.addShape('roundRect', {
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

    s.addShape('rect', {
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

    s.addShape('rect', {
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
  s.addShape('roundRect', {
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

export interface FallbackCardOpts {
  badge: string;            // e.g. '공적장부 열람 대상', '현장 실사 예정', '임대차 실사 안내'
  badgeKind?: CalloutKind;  // 'info' | 'brass' | 'warn'
  title: string;            // Component heading
  leadText: string;         // Explanatory sentence (NO defensive excuses)
  checklist: string[];      // 3~4 actionable due-diligence bullet points
  onDark?: boolean;
  icon?: 'map' | 'photo' | 'chart' | 'document' | 'building';
}

/**
 * §8.5 제도권 실사 대체 UI 카드 (L.fallbackCard)
 * - 데이터 결손 시 기술적 변명(Rule G54) 대신 구조화된 실사/검증 프로토콜을 렌더링
 * - 0.5pt 미세 테두리와 테마 틴트 배경, 상태 배지, 리드문, 체크리스트 제공
 * - 바운딩 박스(x, y, w, h) 내 완벽한 여백 물리 보장 (지면 이탈/블리드 0건)
 */
export function fallbackCard(
  s: any,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: FallbackCardOpts,
): void {
  const isDark = opts.onDark ?? false;
  const bgCol = isDark ? CD.block : C.tint;
  const borderCol = isDark ? CD.border : C.line;

  // 1. 외곽 컨테이너
  s.addShape('roundRect', {
    x, y, w, h,
    rectRadius: 0.06,
    fill: { color: bgCol },
    line: { color: borderCol, width: 0.5 },
  });

  const padX = Math.min(0.28, w * 0.05);
  const padY = Math.min(0.24, h * 0.06);
  const innerW = w - padX * 2;

  // 2. 상태 배지 알약
  const kind = opts.badgeKind ?? 'brass';
  const badgeColors: Record<CalloutKind, [string, string, string]> = {
    info:  [C.blue,   C.blueL,   C.blue],
    good:  [C.green,  C.greenL,  C.green],
    warn:  [C.amber,  C.amberL,  C.amber],
    bad:   [C.red,    C.redL,    C.red],
    brass: [C.brassD, C.brassT,  C.brassD],
  };
  const [badgeFg, badgeBg, badgeLine] = badgeColors[kind] ?? badgeColors.brass;

  const rawBadge = (opts.badge || '실사 확인 안내').replace(/^\[\s*|\s*\]$/g, '').trim();
  const badgeText = `[ ${rawBadge} ]`;
  const badgeW = Math.min(innerW * 0.6, Math.max(1.30, rawBadge.length * 0.13 + 0.40));
  const badgeH = 0.24;

  s.addShape('roundRect', {
    x: x + padX, y: y + padY, w: badgeW, h: badgeH,
    rectRadius: 0.12,
    fill: { color: badgeBg },
    line: { color: badgeLine, width: 0.5 },
  });

  s.addText(badgeText, {
    x: x + padX, y: y + padY, w: badgeW, h: badgeH,
    align: 'center', valign: 'middle',
    fontSize: 8.5, bold: true, color: badgeFg,
    fontFace: KR, margin: 0,
  });

  // 3. 타이틀
  const titleY = y + padY + badgeH + 0.08;
  const titleH = 0.30;
  const cleanTitle = (opts.title || '').trim();
  s.addText(cleanTitle, {
    x: x + padX, y: titleY, w: innerW, h: titleH,
    fontSize: 12, bold: true, color: isDark ? 'FFFFFF' : C.ink,
    fontFace: TITLE_KR, margin: 0, valign: 'middle',
  });

  // 4. 설명 리드문
  const leadY = titleY + titleH + 0.04;
  const leadH = Math.min(0.50, Math.max(0.30, h * 0.10));
  const cleanLead = (opts.leadText || '').trim();
  s.addText(cleanLead, {
    x: x + padX, y: leadY, w: innerW, h: leadH,
    fontSize: 9.5, color: isDark ? CD.mute : C.slate,
    fontFace: KR, margin: 0, valign: 'top', lineSpacingMultiple: 1.15,
  });

  // 5. 구분선
  const divY = leadY + leadH + 0.06;
  s.addShape('line', {
    x: x + padX, y: divY, w: innerW, h: 0,
    line: { color: borderCol, width: 0.4 },
  });

  // 6. 실사 점검 체크리스트
  const listStartY = divY + 0.10;
  const listAvailH = Math.max(0.5, (y + h) - listStartY - padY);
  const items = (opts.checklist || []).slice(0, 4);
  const numItems = Math.max(1, items.length);
  const itemSlotH = listAvailH / numItems;

  items.forEach((itemText, i) => {
    const itemY = listStartY + i * itemSlotH;
    const cleanItem = String(itemText || '').replace(/^[•·\-*✓\s]+/, '').trim();

    // 불릿 마커
    s.addShape('rect', {
      x: x + padX + 0.04, y: itemY + 0.06, w: 0.07, h: 0.07,
      fill: { color: C.brass },
    });

    // 항목 텍스트
    const textW = innerW - 0.24;
    const itemBoxH = Math.max(0.22, itemSlotH - 0.04);
    s.addText(cleanItem, {
      x: x + padX + 0.18, y: itemY, w: textW, h: itemBoxH,
      fontSize: 9.2, color: isDark ? CD.body : C.body,
      fontFace: KR, margin: 0, valign: 'top', lineSpacingMultiple: 1.12,
    });
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
export { textH, fitBox, gridFit, fitTextToBox, fitTableCell, getCharWidthInches, simulateTextWrap } from './layout-physics';
export type { FitTextOptions, FitTextResult } from './layout-physics';
