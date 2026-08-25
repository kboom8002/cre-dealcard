# CREDEAL IM Studio — AI-Pair 코딩 가이드라인

> 모바일 IM과 PPTX를 **하나의 소스에서** 생성하기 위한 레포 규약.
> 이 문서는 레포 루트 `AGENTS.md`로 두고, AI 에이전트 세션 시작 시 항상 읽힙니다.

| | |
|---|---|
| **레포** | `credeal-im-studio` |
| **책임 범위** | 온톨로지 슬롯 → IM 산출물(PPTX / PDF / 모바일 HTML) |
| **책임 아님** | 슬롯 수집(공부 크롤링), 인증, 결제, 배포 추적 |
| **런타임** | Node 22 LTS · TypeScript 5.x · pnpm workspace |
| **최종 수정** | 2026-07-27 |

---

## 0. 이 문서를 읽는 에이전트에게

작업을 시작하기 전에 다음 세 가지를 반드시 확인하십시오.

1. **어느 레이어를 건드리는 작업인가?** (§2 참조) 한 PR은 한 레이어만 수정합니다.
2. **관련 픽스처가 있는가?** 없으면 먼저 `fixtures/`에 추가하고 실패를 확인한 뒤 구현합니다.
3. **§11 안티패턴 목록을 읽었는가?** pptxgenjs는 잘못 쓰면 **파일이 조용히 손상**됩니다. PowerPoint에서만 열리지 않고, LibreOffice·python-pptx·XSD 검증은 전부 통과합니다.

> **"동작하는 것처럼 보이는 코드"에 특히 주의하십시오.**
> 이 도메인은 출력물이 열리기만 하면 성공처럼 보입니다. 실제 실패는 텍스트가 상자를 0.1인치 넘거나, 차트 라벨이 반올림되어 4.594가 5로 표시되는 형태로 나타납니다. 눈으로 이미지를 확인하지 않은 변경은 완료가 아닙니다.

---

## 1. 아키텍처 결정 (ADR 요약)

### ADR-001 — 중간표현(IR)을 도입한다

**문제.** 모바일 IM, PPTX, PDF가 각각 별도 코드로 만들어지면 수치가 어긋나고, 슬롯 하나를 추가할 때 세 곳을 고쳐야 합니다.

**결정.** 온톨로지 슬롯과 렌더러 사이에 `IMDoc`이라는 중간표현을 둡니다.

```
온톨로지 슬롯 (70개)
        │
        ▼
   ┌─────────┐   무엇을 말하는가만 담는다.
   │  IMDoc  │   어떻게 보이는가는 담지 않는다.
   └─────────┘
        │
        ▼
   레이아웃 엔진  ──▶ SlidePlan[]  (타깃별로 다르게 계획)
        │
   ┌────┴────┬──────────┐
   ▼         ▼          ▼
 PPTX      PDF      모바일 HTML
```

**핵심 규칙 — `Section ≠ Slide`.**
IR의 `Section`은 **논리 단위**입니다. 슬라이드 분할·병합은 레이아웃 엔진이 결정합니다. IR에 "3번 슬라이드"라는 개념이 들어오는 순간 유연성이 사라집니다.

### ADR-002 — 레이아웃 엔진은 순수 함수로 분리한다

```ts
export declare function plan(doc: IMDoc, target: RenderTarget): SlidePlan[];
```

부작용 없음. 파일 I/O 없음. 이 함수가 순수해야 규칙(L01~L07)을 단위 테스트할 수 있고, AI가 규칙 하나만 안전하게 고칠 수 있습니다.

### ADR-003 — 렌더러에 도메인 지식을 넣지 않는다

`packages/render-pptx` 안에 `if (deal.vacancy > 0)` 같은 코드가 있으면 **즉시 반려**합니다. 렌더러는 `SlidePlan`만 보고 그림을 그립니다. "공실이 있으면 빨간 테두리"는 레이아웃 레이어에서 `style: 'danger'`로 결정되어 내려와야 합니다.

### ADR-004 — 텍스트 폭을 실제로 측정한다

PPTX는 렌더링을 PowerPoint가 수행하므로, 우리는 생성 시점에 텍스트가 상자에 들어가는지 알 수 없습니다. 이것이 이 프로젝트의 **가장 큰 기술 난제**입니다.

**결정.** 폰트 메트릭을 JSON으로 레포에 커밋하고, 줄바꿈을 시뮬레이션합니다. (§5 상세)

### ADR-005 — 차트는 네이티브, 예외만 도형, 이미지는 금지

| 방식 | 대상 |
|---|---|
| PowerPoint 네이티브 차트 (`addChart`) | 막대 · 선 · 도넛 · 영역 |
| 네이티브 도형 조합 | 워터폴 · 히트맵 · 층별 스택 · 위치 개념도 · 게이지 |
| 이미지 | **건물 사진과 실제 지도 타일에 한정** |

차트를 이미지로 구우면 중개인이 숫자 하나를 못 고칩니다. 그 순간 도구에 대한 신뢰가 사라집니다.

### ADR-006 — 코드 조판을 기본으로, 브랜드 마스터만 템플릿 주입

| 접근 | 도구 | 장점 | 단점 |
|---|---|---|---|
| (A) 코드 조판 | `pptxgenjs` | 동적 레이아웃 가능 (호실 수 분기 등) | 디자이너가 직접 손댈 수 없음 |
| (B) 템플릿 주입 | `pptx-automizer` | 디자이너가 PowerPoint에서 직접 디자인 | 동적 분기가 어려움 |

**M1~M2는 (A) 단독.** 조직 브랜드 마스터(M3)에서 (B) 하이브리드를 검토합니다. `pptx-automizer`는 내부적으로 `pptxgenjs`를 감싸므로 나중에 붙일 수 있습니다 — 지금 도입하면 복잡도만 늘어납니다.

### ADR-007 — 출력은 결정론적이어야 한다

같은 IR에서 같은 바이트가 나와야 스냅샷 테스트가 성립합니다. 완전한 바이트 동일은 어려우므로 **정규화 후 비교**합니다. (§9.2)

---

## 2. 레포 구조

```
credeal-im-studio/
├── AGENTS.md                       ← 이 문서
├── pnpm-workspace.yaml
├── docs/
│   ├── adr/                        ← 결정 기록 (ADR-001 …)
│   ├── 01-ir-schema.md
│   ├── 02-layout-rules.md
│   ├── 03-theme-tokens.md
│   └── 04-quality-gates.md
├── packages/
│   ├── ontology/                   ← 슬롯·enum·제약 C01~C12·아키타입 R01~R10
│   │   └── src/{slots,constraints,archetypes,enums}.ts
│   ├── ir/                         ← IMDoc 스키마(zod) + 빌더 + NLG 마스크
│   │   └── src/{schema,build,narrative,provenance}.ts
│   ├── layout/                     ← 레이아웃 엔진 (순수 함수)
│   │   └── src/{plan,measure}.ts, src/rules/L01..L07.ts
│   ├── theme/                      ← 디자인 토큰 + 브랜드 오버라이드
│   │   └── src/{tokens,brand}.ts
│   ├── render-pptx/
│   │   └── src/{index}.ts, src/primitives/*, src/charts/*
│   ├── render-pdf/
│   ├── render-mobile/              ← React 컴포넌트
│   └── gates/                      ← G1~G9
├── fixtures/                       ← 골든 케이스 (§8)
├── tests/{unit,gates,visual}/
└── assets/fonts/metrics/*.json     ← 글리프 폭만 추출 (폰트 파일 아님)
```

### 레이어 의존 방향 (역방향 import 금지)

```
ontology  ←  ir  ←  layout  ←  render-*  ←  app
                      ↑
                    theme
```

`render-pptx`가 `ontology`를 import하면 반려입니다. ESLint `import/no-restricted-paths`로 강제하십시오.

---

## 3. 의존성 및 버전 고정

### 3.1 핵심 의존성

| 패키지 | 역할 | 비고 |
|---|---|---|
| `pptxgenjs` **4.0.1** | PPTX 생성 | 런타임 의존성 0, ESM/CJS 듀얼 빌드, TS 타입 내장 |
| `fontkit` | 글리프 메트릭 추출 (빌드 타임) | 런타임에는 쓰지 않음 — JSON만 씀 |
| `zod` | IR 스키마 정의·런타임 검증 | IR의 단일 진실 원천 |
| `sharp` | 사진 크롭·톤 보정 | `density` 옵션 미지정 시 SVG 확대가 흐려짐에 주의 |
| `pptx-automizer` | (M3) 브랜드 템플릿 주입 | M1~M2에는 **설치하지 않음** |
| `vitest` | 단위·게이트 테스트 | |
| `odiff-bin` | 시각 회귀 픽셀 비교 | `pixelmatch` 대비 수십 배 빠름 — CI 시간에 직결 |

> **버전 고정 규칙.** 위 표의 `pptxgenjs`를 제외한 버전은 착수 시점에 확정해 `package.json`에 **정확한 버전으로 고정**(캐럿·틸드 금지)하고 lockfile을 커밋합니다.
> PPTX 생성 라이브러리는 마이너 업데이트에서 출력 XML이 바뀌어 시각 회귀 스냅샷이 통째로 깨집니다. 범위 지정은 금지입니다.

### 3.2 도입하지 않는 것

| 후보 | 왜 안 쓰는가 |
|---|---|
| `python-pptx` | 슬라이드 복제 불가, `text_frame.text` 대입 시 서식 소실. Node 스택과 프로세스 분리 비용 |
| Satori / Takumi / resvg | HTML→SVG→PNG 경로는 결과가 **이미지**입니다. ADR-005 위반 |
| Puppeteer로 슬라이드 렌더 | 위와 동일. 편집 불가 |
| 상용 SDK (Aspose 등) | 라이선스 비용이 6개월 현금 계획을 넘어섬 |

---

## 4. IR 스키마

### 4.1 최상위

```ts
// packages/ir/src/schema.ts
import { z } from 'zod';

export const Provenance = z.enum(['public', 'expert', 'broker', 'assumed']);

export const Valued = z.object({
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  provenance: Provenance,
  /** 밴딩 표시용 문자열. tier=basic에서 value 대신 사용 */
  band: z.string().optional(),
  /** 계산 유래를 사람이 읽을 수 있게 (예: "190억 − 대출 104.5억 − 보증금 10.5억") */
  derivation: z.string().optional(),
});

export const IMDoc = z.object({
  meta: z.object({
    docNo: z.string(),
    tier: z.enum(['basic', 'pro']),
    grade: z.enum(['A', 'B', 'C']),
    gradeScore: z.number().min(0).max(100),
    issuedAt: z.string(),           // ISO8601
    version: z.number().int(),
    grant: z.object({
      id: z.string(),
      viewer: z.string(),
      viewerRef: z.string(),
      expiresAt: z.string(),
    }).nullable(),
    dealLink: z.string().url(),
  }),
  facts: z.record(z.string(), Valued),      // 온톨로지 슬롯 값
  derived: z.record(z.string(), Valued),    // 계산값 — 생성 금지 영역 (§4.3)
  archetype: z.object({
    primary: z.string(),                    // 'VALUE_ADD' …
    secondary: z.array(z.string()),
    rationale: z.string(),                  // 규칙이 만든 판정 근거 문장
  }),
  sections: z.array(Section),
  disclaimers: z.array(z.string()),
});
export type IMDoc = z.infer<typeof IMDoc>;
```

### 4.2 Section / Block

```ts
export const Block = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stats'),   items: z.array(StatItem) }),
  z.object({ kind: z.literal('kv'),      rows: z.array(KVRow) }),
  z.object({ kind: z.literal('table'),   head: z.array(z.string()), rows: z.array(z.array(Cell)) }),
  z.object({ kind: z.literal('chart'),   chart: ChartSpec }),
  z.object({ kind: z.literal('callout'), tone: z.enum(['info','good','warn','bad','brand']),
                                         title: z.string(), body: z.string() }),
  z.object({ kind: z.literal('diagram'), diagram: DiagramSpec }),  // waterfall | stack | locmap | gauge | heatmap
  z.object({ kind: z.literal('prose'),   text: z.string() }),
  z.object({ kind: z.literal('media'),   media: MediaSpec }),
]);

export const Section = z.object({
  id: z.string(),                    // 'rent-roll'
  kind: z.string(),                  // 레이아웃 규칙이 참조하는 의미 태그
  title: z.string(),
  kicker: z.string().optional(),     // 'RENT ROLL'
  subtitle: z.string().optional(),
  /** 이 섹션을 노출할 티어. 미지정 시 양쪽 */
  tiers: z.array(z.enum(['basic','pro'])).optional(),
  /** 레이아웃 힌트. 강제가 아니라 선호 */
  hint: z.object({
    preferSplit: z.boolean().optional(),
    emphasis: z.enum(['normal','feature']).optional(),  // feature = 다크 슬라이드 후보
  }).optional(),
  blocks: z.array(Block),
});
```

**주의.** `Section`에 `slideNumber`, `x`, `y`, `fontSize` 같은 필드를 추가하려는 유혹이 반드시 생깁니다. 금지입니다. 그런 필요가 생겼다면 레이아웃 규칙이나 테마 토큰이 부족한 것입니다.

### 4.3 `derived`는 생성 금지 영역

Cap Rate · NOI · CoC · NPV 등 계산으로 확정되는 값은 **언어모델이 문장을 지어내지 못하도록** 주입 전용으로 처리합니다.

```ts
// ❌ 금지 — LLM이 문장 전체를 생성
const text = await llm(`이 물건의 수익률을 설명해줘: ${JSON.stringify(deal)}`);

// ✅ 허용 — 템플릿 빈칸에 계산 결과만 주입
const MASK = '운영경비를 {opexRatio}로 가정하면 순수익(NOI)은 약 {noi}입니다.';
const text = fill(MASK, { opexRatio: fmtPct(d.opexRatio), noi: fmtEok(d.noi) });
```

LLM은 **정성 서술**(입지 해설, 아키타입 rationale 윤문)에만 사용하고, 그 출력에도 숫자가 들어가면 게이트 G4에서 차단합니다.

---

## 5. 텍스트 측정 — 이 레포의 핵심 기술

### 5.1 왜 어려운가

- PPTX는 우리가 렌더링하지 않습니다. 폭을 모른 채 상자 크기를 정해야 합니다.
- 한글은 물건마다 글자 수 편차가 큽니다. `역삼동 근린생활시설`(11자)과 `강남구 논현동 업무시설 및 근린생활시설`(21자)은 폭이 두 배 가까이 차이 납니다.
- 한글 글리프는 **대부분** full-width(1000/1000 em)이지만 전부는 아니며, 라틴·숫자·문장부호는 가변폭입니다. "한글은 다 같은 폭"이라고 가정하면 숫자가 섞인 줄에서 어긋납니다.

### 5.2 폰트 메트릭을 JSON으로 커밋한다

맑은 고딕은 Windows 전용이라 CI에서 사용할 수 없고, 폰트 파일 자체를 레포에 넣으면 라이선스 문제가 생깁니다.

**해결 — 빌드 타임에 글리프 advance width만 추출해 JSON으로 커밋합니다.** 메트릭 수치는 저작물이 아니며, 재현성과 CI 이식성을 동시에 얻습니다.

```ts
// scripts/extract-metrics.ts  (개발자 로컬에서 1회 실행, 산출 JSON을 커밋)
import fontkit from 'fontkit';
import { writeFileSync } from 'node:fs';

const font = fontkit.openSync(process.argv[2]);            // malgun.ttf
const CHARSET = buildCharset();                            // §5.3
const widths: Record<string, number> = {};
for (const ch of CHARSET) {
  const [g] = font.layout(ch).glyphs;
  widths[ch] = g.advanceWidth / font.unitsPerEm;           // em 단위 정규화
}
writeFileSync('assets/fonts/metrics/malgun-regular.json', JSON.stringify({
  family: 'Malgun Gothic', unitsPerEm: 1, defaultWidth: 1.0, widths,
}));
```

### 5.3 CHARSET 구성

```
ASCII 0x20–0x7E
KS X 1001 완성형 한글 2,350자
한글 자모 (조합 표기용)
숫자 서식 문자   , . − % ~ ± ₩
문서 기호        · ※ ─ 「」 ◇ ● ★ ✓ ① ~ ⑩ ㎡ ㎞
```

CHARSET에 없는 문자는 `defaultWidth`(1.0)로 폴백하고, **게이트 G1에서 경고**를 남깁니다. 경고가 쌓이면 CHARSET을 확장합니다.

### 5.4 측정 API

```ts
// packages/layout/src/measure.ts
export interface TextStyle { font: FontKey; sizePt: number; bold?: boolean; charSpacing?: number }

/** 단일 행 폭 (인치) */
export function measureLine(text: string, s: TextStyle): number;

/** 줄바꿈 시뮬레이션 — 한글은 글자 단위, 라틴은 단어 단위 */
export function wrapText(text: string, s: TextStyle, maxWidthIn: number): string[];

/** 상자에 들어가는지 판정 + 축소 단계 제안 */
export function fitBox(
  text: string, s: TextStyle, box: { w: number; h: number }, lineHeight = 1.32,
): { fits: boolean; lines: number; scale: 1 | 0.92 | 0.85; overflowIn: number };
```

**줄바꿈 규칙.** 한글은 어절 경계가 아니라 글자 단위로 끊깁니다(CJK 줄바꿈). 라틴 단어는 통째로 넘깁니다. 이 차이를 무시하면 실제 PowerPoint 렌더와 계산이 어긋납니다.

### 5.5 오버플로 4단계 대응

```ts
export function resolveOverflow(text: string, s: TextStyle, box: Box): Resolution {
  for (const scale of [1, 0.92, 0.85] as const) {          // ① 폰트 3단 축소
    const r = fitBox(text, { ...s, sizePt: s.sizePt * scale }, box);
    if (r.fits) return { kind: 'scale', scale };
  }
  if (canSplit(box)) return { kind: 'split' };             // ② 2단 → 1단 / 다음 슬라이드
  return { kind: 'truncate', suffix: ' … 상세는 링크 참조' }; // ③ 말줄임 + G1 경고
}
```

**보정 계수.** PowerPoint의 실제 조판과 우리 계산 사이에는 자간·커닝 차이로 1~3% 오차가 발생합니다. `SAFETY = 1.04`를 곱해 보수적으로 판정하십시오. 이 값은 `tests/visual/` 결과로 캘리브레이션합니다.

---

## 6. 테마 토큰

좌표와 색상을 코드에 흩뿌리면 손댈 수 없게 됩니다. **매직 넘버 금지**가 이 레포의 가장 강한 규칙입니다.

```ts
// packages/theme/src/tokens.ts
export const T = {
  canvas: { w: 13.333, h: 7.5 },     // LAYOUT_WIDE
  margin: 0.62,
  get content() { return this.canvas.w - this.margin * 2 },
  gap:   { xs: 0.14, sm: 0.20, md: 0.28, lg: 0.34 },
  radius: { card: 0.03, pill: 0.5 },
  type: {
    slideTitle: { sizePt: 23, bold: true },
    kicker:     { sizePt: 9.5, bold: true, charSpacing: 2 },
    sectionSub: { sizePt: 11, bold: true },
    body:       { sizePt: 10.5 },
    caption:    { sizePt: 7.8 },
    statValue:  { sizePt: 26, bold: true },
  },
  color: {
    ink: '10161F', ink2: '1B2531', slate: '2E3A4A',
    body: '2B3440', mute: '7A8794', line: 'DDE3E8', tint: 'F5F7F9',
    brand: 'B98A2E', brandDark: '8E6A20', brandTint: 'FBF6EC',
    good: '3A7350', warn: '96702A', bad: 'A33A3D', info: '44637F',
  },
  font: { kr: 'Malgun Gothic', num: 'Arial' },
} as const;
```

**폰트는 맑은 고딕으로 고정합니다.** Windows·macOS Office 양쪽에서 안전하고, 폭 예측이 가능해 오버플로 계산이 신뢰할 만합니다. 멋을 위해 특수 폰트를 쓰면 중개인 PC에서 대체 폰트로 바뀌며 레이아웃이 무너집니다. 이 위험을 감수할 이유가 없습니다.

### 브랜드 오버라이드 — 열 것과 잠글 것

```ts
export interface Brand {
  logo: Buffer; primary: string; secondary: string;    // ✅ 변수화
  companyName: string; registrationNo: string;
}
// ❌ 잠금: 그리드 · 타이포 스케일 · 슬라이드 순서 · 여백 · 표 스타일
```

레이아웃을 열면 품질이 무너지고, 결과물이 나빠지면 책임은 결국 제품에 돌아옵니다. **한 번 준 자유는 회수할 수 없으므로** 처음에는 좁게 엽니다.

---

## 7. 레이아웃 규칙

규칙은 코드가 아니라 **데이터에 가깝게** 작성합니다. 각 규칙은 독립 파일 하나, 순수 함수 하나입니다.

```ts
// packages/layout/src/rules/L01.ts
export const L01: LayoutRule = {
  id: 'L01',
  desc: '렌트롤 호실 수에 따라 슬라이드를 분할한다',
  applies: (doc) => doc.sections.some(s => s.kind === 'rent-roll'),
  apply(ctx) {
    const n = ctx.section.blocks.find(isTable)?.rows.length ?? 0;
    if (n <= 6)  return ctx.single('rent-roll/compact');
    if (n <= 12) return ctx.split(['rent-roll/table', 'rent-roll/expiry-chart']);
    return ctx.split(['rent-roll/table-1', 'rent-roll/table-2', 'rent-roll/expiry-chart']);
  },
};
```

### 규칙 목록

| 코드 | 조건 | 동작 |
|---|---|---|
| L01 | 호실 수 ≤6 / 7~12 / 13+ | 렌트롤 1p / 2p / 3p 분할 |
| L02 | 아키타입 = `VALUE_ADD` | 밸류애드 실행 계획 슬라이드 편성 |
| L02 | 아키타입 = `CORE_STABLE` | 임대 안정성 슬라이드로 교체 |
| L03 | 사진 0 / 1~2 / 3+ | 개념도 중심 / 하프블리드 / 갤러리 |
| L04 | `grade` ≤ B | **DCF·민감도 섹션 억제 + 사유 문구 삽입** (제약 C11) |
| L05 | 공실 = 0 / >0 | 안정성 프레이밍 / 개선 여지 프레이밍 |
| L06 | `capRate < debtRate` | **역레버리지 경고 블록 강제 삽입** |
| L07 | tier = basic / pro | 밴딩 + 재식별 검사 / 정밀값 + 워터마크 |

> **L06은 제거 불가 규칙입니다.** 중개인이 불리한 사실을 빼고 싶어도 뺄 수 없게 만듭니다. 매수자가 나중에 발견하면 딜이 깨지지만, 먼저 밝히면 협상 조건이 됩니다. 이 규칙은 중개인을 제약하는 것이 아니라 보호합니다.

### 규칙 충돌 해소

규칙은 **우선순위 순서로 단조 적용**합니다. `L04 → L06 → L07 → L01 → L02 → L03 → L05`.
안전 규칙(억제·경고·마스킹)이 먼저 확정되고, 그 위에 표현 규칙이 얹힙니다. 순서를 바꾸면 "밴딩된 값 위에 정밀값이 덮이는" 사고가 납니다.

---

## 8. 골든 픽스처

**기능을 추가하기 전에 픽스처를 먼저 추가합니다.** AI는 동작하는 것처럼 보이는 코드를 잘 만듭니다. 픽스처가 없으면 검증할 방법이 없습니다.

| 파일 | 무엇을 지키는가 |
|---|---|
| `yeoksam-value-add.json` | 기준 시나리오 (현 샘플 2종의 원본) |
| `seongsu-core-stable.json` | L02 분기 — 밸류애드 슬라이드가 **나오지 않아야** 함 |
| `nonhyeon-devsite.json` | 공실 100% · 임대차 0건 — 렌트롤 섹션 자체가 빠져야 함 |
| `edge-20-units.json` | L01 3분할 · 표 오버플로 |
| `edge-long-korean.json` | 47자 물건명 · 축소 3단계 전부 실패 → 말줄임 경로 |
| `edge-no-photo.json` | 사진 0장에서도 성립 |
| `edge-grade-c.json` | L04 억제 — DCF 섹션이 사유 문구로 대체되어야 함 |
| `edge-negative-cf.json` | L06 강제 삽입 · 음수 표기 |

각 픽스처는 **기대 결과**를 함께 둡니다.

```
fixtures/edge-20-units/
├── input.json
├── expected.plan.json      ← SlidePlan 스냅샷 (구조 검증)
└── expected/               ← 슬라이드 PNG 골든 이미지 (시각 검증)
```

---

## 9. 테스트

### 9.1 3계층

```bash
pnpm test:unit      # 측정·규칙·NLG 마스크 — 빠름, 매 저장마다
pnpm gate           # G1~G9 — 모든 픽스처에 대해 실행
pnpm test:visual    # soffice → PNG → odiff — 느림, PR에서만
```

### 9.2 결정론 확보

pptxgenjs는 생성 시각과 랜덤 ID를 XML에 넣으므로 바이트 비교가 불가능합니다. **정규화 후 해시**합니다.

```ts
// tests/util/normalize.ts
export async function fingerprint(pptx: Buffer): Promise<string> {
  const zip = await unzip(pptx);
  const parts = Object.keys(zip).sort()                   // ① 엔트리 순서 고정
    .filter(k => !k.startsWith('docProps/'))              // ② 생성 메타 제외
    .map(k => zip[k].toString('utf8')
      .replace(/<dcterms:(created|modified)[^<]*<\/dcterms:\1>/g, '')
      .replace(/ id="\{[0-9A-F-]{36}\}"/gi, ''));         // ③ GUID 제거
  return sha256(parts.join('\n'));
}
```

### 9.3 시각 회귀

```bash
soffice --headless --convert-to pdf out.pptx
pdftoppm -jpeg -r 110 out.pdf slide
odiff --threshold=0.02 expected/slide-01.jpg slide-01.jpg diff-01.png
```

**LibreOffice는 PowerPoint가 아닙니다.** 폰트 대체가 일어나므로 픽셀 완전 일치를 기대하지 마십시오. 임계값 2%로 두고, **구조적 변화**(요소 사라짐·큰 이동)를 잡는 용도로만 씁니다. 미세한 자간 차이는 잡지 못합니다.

> 최종 확인은 **실제 PowerPoint에서 사람이 엽니다.** Windows·macOS 각 1회. 이 단계를 CI로 대체할 수 없습니다.

---

## 10. 품질 게이트

```ts
export type Gate = (doc: IMDoc, plan: SlidePlan[]) => GateResult;
export interface GateResult {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  findings: Array<{ slide?: number; slot?: string; message: string; fix?: string }>;
}
```

| 코드 | 검사 | 실패 시 |
|---|---|---|
| G1 | 텍스트 오버플로 0건 | 슬라이드·슬롯 지목 + 축약 제안 |
| G2 | 빈 플레이스홀더 0건 | 미입력 슬롯 목록 |
| G3 | 티어별 필수 면책 문구 존재 | 누락 문구 자동 삽입 후 확인 요청 |
| G4 | 모든 수치 블록에 `provenance` | 출처 미지정 슬롯 지목 |
| G5 | 밴딩 정책 준수 (tier=basic) | 정밀값 노출 위치 지목 |
| G6 | 재식별 게이트 통과 | 후보 필지 수 < 임계 → **발행 차단** |
| G7 | 제약 C01~C12 | 위반 항목 표시 |
| G8 | 워터마크 적용 (tier=pro) | `grant` 없으면 Pro 발행 불가 |
| G9 | QR·단축링크 삽입 | 딜 링크 미생성 시 자동 생성 |

`fail`이 하나라도 있으면 발행 API가 4xx를 반환합니다. `warn`은 통과시키되 로그에 남깁니다.

**G5 구현 주의.** 정규식으로 "숫자 패턴"을 찾는 방식은 오탐이 많습니다. IR의 `Valued.band` 유무로 **타입 수준에서** 판정하십시오. tier=basic인데 `band`가 없는 `Valued`가 렌더 대상에 있으면 실패입니다.

---

## 11. 안티패턴 — PR 체크리스트

> 이 목록은 실제로 파일을 손상시키거나 조용히 잘못된 결과를 만든 사례입니다. **PR 템플릿에 그대로 복사해 체크박스로 두십시오.**

### pptxgenjs 치명적 오류 (파일이 열리지 않음)

- [ ] 색상에 `#`을 붙이지 않았는가 — `'FF0000'` ○ / `'#FF0000'` ✗ **파일 손상**
- [ ] 8자리 헥사(알파 포함)를 쓰지 않았는가 — 투명도는 `transparency: 0-100` **파일 손상**
- [ ] shadow `offset`이 0 이상인가 — 음수는 **파일 손상**. 위쪽 그림자는 `angle: 270` + 양수 offset
- [ ] 누적 막대에서 `dataLabelPosition`이 `ctr`/`inEnd`/`inBase`인가 — `outEnd`는 **파일 손상**
- [ ] 보조축(`secondaryValAxis`) 사용 시 `valAxes`·`catAxes`를 **각각 2개씩** 선언했는가 — 없으면 PowerPoint가 차트를 폐기하고 파일을 손상으로 보고
- [ ] `<p:presentation>` 자식 순서를 건드리지 않았는가

### 조용한 오류 (열리지만 잘못됨)

- [ ] `pres.layout`을 **슬라이드 추가 전에** 설정했는가 — 기본 캔버스는 10×5.625in. 나중에 설정하면 좌표가 캔버스 밖으로 나가고 **경고 없이 사라짐**
- [ ] 옵션 객체를 두 `add*` 호출에서 재사용하지 않았는가 — pptxgenjs는 옵션을 **제자리에서 EMU로 변환**하므로 두 번째 호출이 오염됨
- [ ] `charSpacing`을 썼는가 — `letterSpacing`은 존재하지 않는 옵션이며 조용히 무시됨
- [ ] `rectRadius`를 `roundRect`에만 썼는가 — `rect`에는 효과 없음
- [ ] 차트 데이터 라벨에 `dataLabelFormatCode`를 지정했는가 — 미지정 시 `4.594`가 `5`로 반올림 표시됨
- [ ] 표의 `colW` 합이 `w` 이하인가 — 초과 시 표가 옆 요소를 침범
- [ ] 텍스트박스에 `margin: 0`을 줬는가 — 도형과 좌표를 맞출 때 내부 패딩 때문에 어긋남
- [ ] 새 인스턴스(`new pptxgen()`)를 파일마다 하나씩 만들었는가 — 재사용 금지

### 아키텍처 위반

- [ ] 렌더러에 도메인 조건문(`if (deal.…)`)이 없는가
- [ ] 좌표·색상 리터럴 대신 `T.*` 토큰을 썼는가
- [ ] IR에 `slideNumber` / `x` / `fontSize` 같은 표현 필드를 추가하지 않았는가
- [ ] 차트를 이미지로 대체하지 않았는가
- [ ] `derived` 값을 LLM 생성 문장에 넣지 않았는가

### 검증

- [ ] 관련 픽스처를 추가했는가
- [ ] `pnpm gate`가 모든 픽스처에서 통과하는가
- [ ] **렌더 이미지를 눈으로 확인했는가** — "테스트 통과"만으로 완료 처리 금지

---

## 12. AI-Pair 작업 규약

### 12.1 작업 단위

한 PR은 **한 레이어**만 수정합니다. IR과 레이아웃을 동시에 바꾸면 회귀 원인을 특정할 수 없습니다. 두 레이어가 함께 바뀌어야 한다면 PR을 둘로 나누고, 앞의 PR은 하위 호환을 유지합니다.

### 12.2 프롬프트 작성

작업 지시에는 **파일 경계 · 픽스처 · 통과 기준** 세 가지가 있어야 합니다.

```
❌ "IM 슬라이드 좀 더 예쁘게 만들어줘"

✅ "fixtures/edge-20-units에서 L01이 렌트롤을 3분할해야 하는데
    현재 2분할되어 마지막 표가 넘칩니다.
    packages/layout/src/rules/L01.ts만 수정하고,
    tests/gates/overflow.test.ts와 expected.plan.json이 통과하게 해주세요.
    render-pptx는 건드리지 마십시오."
```

### 12.3 신규 섹션 추가 절차

```
1. fixtures/에 해당 섹션이 있는 입력 추가
2. packages/ir/src/schema.ts에 Section kind 추가 (필요 시)
3. docs/02-layout-rules.md에 규칙 문서화  ← 코드보다 먼저
4. packages/layout/src/rules/에 규칙 구현
5. packages/render-pptx/src/primitives/에 필요한 프리미티브 추가
6. pnpm gate → pnpm test:visual → 이미지 육안 확인
7. expected/ 골든 이미지 갱신은 별도 커밋
```

3번을 건너뛰면 반년 뒤 아무도 그 규칙이 왜 있는지 모릅니다.

### 12.4 커밋 규약

```
feat(layout): L01 렌트롤 13행 이상 3분할 지원
fix(render-pptx): 누적 막대 dataLabelPosition outEnd → inEnd (파일 손상)
chore(visual): edge-20-units 골든 이미지 갱신
```

시각 스냅샷 갱신은 **반드시 별도 커밋**입니다. 기능 변경과 섞이면 리뷰어가 의도한 변화인지 회귀인지 구분할 수 없습니다.

### 12.5 에이전트가 하지 말아야 할 것

- 골든 이미지를 "테스트를 통과시키려고" 갱신하는 것
- 게이트를 통과시키려고 임계값을 낮추는 것
- 오버플로가 나면 상자를 키우는 것 (원인은 대개 텍스트 길이 정책)
- 검증 없이 "수정했습니다"라고 보고하는 것
- 라이브러리 버전을 올리는 것 (별도 승인 필요 — §3.1)

---

## 13. 성능 예산

| 단계 | 예산 | 초과 시 |
|---|---|---|
| IR 빌드 | 50 ms | zod 파싱을 요청당 1회로 제한 |
| 레이아웃 계획 | 100 ms | 측정 결과 메모이제이션 |
| PPTX 렌더 (20p) | 1.5 s | 차트 수 점검 |
| PDF 동시 출력 | 2.0 s | |
| **발행 API p95** | **3.0 s** | 비동기 전환 + 완료 알림 |

**Vercel 배포 주의**

- `pptxgenjs`는 Node 런타임에서 실행하십시오. 라우트에 `export const runtime = 'nodejs'`를 명시합니다.
- 폰트 메트릭 JSON은 번들에 인라인합니다. Edge/서버리스에서 `fs` 접근은 불안정합니다.
- 20페이지 Pro는 1MB를 넘습니다. 응답 본문으로 반환하지 말고 **Supabase Storage에 올린 뒤 서명 URL**을 반환하십시오.

---

## 14. 현 프로토타입 마이그레이션

현재 `imlib.js` / `im_basic.js` / `im_pro.js`는 단일 파일 스크립트입니다. 이것을 버리지 말고 **역분해**하십시오. 이미 시각 검증을 통과한 유일한 기준점입니다.

| 단계 | 작업 | 완료 기준 |
|---|---|---|
| 1 | `imlib.js`의 색상·좌표를 `theme/tokens.ts`로 추출 | 스크립트가 토큰만 참조하며 **출력 이미지 무변화** |
| 2 | `card`/`stat`/`rows`/`waterfall`/`stack`/`locmap`을 `render-pptx/primitives/`로 이동 | 동일 |
| 3 | `im_basic.js`의 슬라이드 정의를 IR + SlidePlan으로 역분해 | 동일 |
| 4 | 역분해 결과를 `fixtures/yeoksam-value-add.json`으로 고정 | 골든 이미지 확정 |
| 5 | `im_pro.js` 동일 처리 | |

**각 단계의 완료 기준은 "출력 이미지가 바뀌지 않는 것"입니다.** 리팩터링 중에 디자인을 개선하고 싶은 유혹이 생기지만, 그러면 회귀와 개선을 구분할 수 없게 됩니다. 개선은 마이그레이션이 끝난 뒤 별도 PR로 합니다.

---

## 15. 참고

- [PptxGenJS 공식 문서](https://gitbrent.github.io/PptxGenJS/) · [npm](https://www.npmjs.com/package/pptxgenjs) · [GitHub](https://github.com/gitbrent/PptxGenJS)
- [pptx-automizer](https://github.com/singerla/pptx-automizer) — 템플릿 주입 방식 (M3 검토용)
- [fontkit](https://github.com/foliojs/fontkit) — 글리프 메트릭 추출
- [odiff](https://github.com/dmtrKovalenko/odiff) — 시각 회귀 픽셀 비교
- [sharp](https://www.npmjs.com/package/sharp) — 사진 파이프라인

---

## 부록. 최소 렌더러 예시

레이어 분리가 실제로 어떤 모습인지 보여주는 최소 예시입니다.

```ts
// packages/render-pptx/src/index.ts
import PptxGenJS from 'pptxgenjs';
import { T } from '@credeal/theme';
import type { SlidePlan } from '@credeal/layout';
import { PRIMITIVES } from './primitives';

export function renderPptx(plan: SlidePlan[], brand: Brand): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';        // ← 반드시 슬라이드 추가 전
  pres.author = 'CREDEAL';

  for (const sp of plan) {
    const slide = pres.addSlide();
    slide.background = { color: sp.surface === 'dark' ? T.color.ink : 'FFFFFF' };

    for (const el of sp.elements) {
      // 렌더러는 el.kind만 본다. 도메인 지식 0.
      PRIMITIVES[el.kind](slide, el, { pres, brand });
    }
    if (sp.notes) slide.addNotes(sp.notes);
  }
  return pres.write({ outputType: 'nodebuffer' }) as Promise<Buffer>;
}
```

```ts
// packages/render-pptx/src/primitives/stat.ts
export const stat: Primitive<'stat'> = (slide, el) => {
  const { x, y, w, h } = el.box;
  slide.addShape('roundRect', {
    x, y, w, h, rectRadius: T.radius.card,
    fill: { color: el.tone === 'good' ? T.color.tint : T.color.tint },
    line: { color: T.color.line, width: 0.75 },
  });
  slide.addText(el.label, {
    x: x + T.gap.sm, y: y + 0.14, w: w - T.gap.sm * 2, h: 0.22,
    fontFace: T.font.kr, fontSize: T.type.caption.sizePt + 1.7,
    color: T.color.mute, margin: 0, valign: 'middle',
  });
  slide.addText(
    [
      { text: el.value, options: { fontFace: T.font.num, fontSize: el.valueSizePt, bold: true, color: T.color.ink } },
      ...(el.unit ? [{ text: ` ${el.unit}`, options: { fontFace: T.font.kr, fontSize: 11.5, bold: true, color: T.color.ink } }] : []),
    ],
    { x: x + T.gap.sm, y: y + 0.34, w: w - T.gap.sm * 2, h: 0.50, margin: 0, valign: 'middle' },
  );
};
```

`el.valueSizePt`가 **레이아웃 엔진에서 결정되어 내려온다**는 점에 주목하십시오. 렌더러는 텍스트가 들어가는지 판단하지 않습니다. 그것은 §5의 측정을 거친 레이아웃 레이어의 책임입니다.
