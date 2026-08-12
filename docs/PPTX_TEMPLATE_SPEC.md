# CREDEAL PPTX 렌더링 파이프라인 & 프리셋 템플릿 스펙 명세

> **Version**: 2.0  
> **Last Updated**: 2026-08-13  
> **Purpose**: 타 LLM이 PPTX 프리셋 템플릿을 개발할 수 있도록, 렌더링 파이프라인·디자인 시스템·데이터 바인딩·아키타입 레지스트리를 체계적으로 명세합니다.

---

## 목차

1. [아키텍처 개요](#1-아키텍처-개요)
2. [렌더링 파이프라인 흐름](#2-렌더링-파이프라인-흐름)
3. [디자인 시스템](#3-디자인-시스템)
4. [프리셋 템플릿 시스템](#4-프리셋-템플릿-시스템)
5. [덱 시퀀서 — 슬라이드 순서 결정](#5-덱-시퀀서--슬라이드-순서-결정)
6. [데이터 바인딩 아키텍처](#6-데이터-바인딩-아키텍처)
7. [컴포넌트 라이브러리 (imlib)](#7-컴포넌트-라이브러리-imlib)
8. [아키타입 카탈로그 (A01–A14)](#8-아키타입-카탈로그-a01a14)
9. [텍스트 예산 & 제약조건](#9-텍스트-예산--제약조건)
10. [이미지 처리](#10-이미지-처리)
11. [출처 표기 & 기준 강제](#11-출처-표기--기준-강제)
12. [신규 프리셋 개발 가이드](#12-신규-프리셋-개발-가이드)

---

## 1. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                    PPTX 렌더링 파이프라인                         │
├─────────┬───────────┬──────────┬──────────┬─────────┬──────────┤
│ handler │ renderer  │sequencer │data-binder│imlib    │archetypes│
│ (API)   │(오케스트) │(슬라이드 │(섹션→Props│(컴포넌트│(슬라이드 │
│         │           │ 순서)    │  변환)    │라이브러리│ 빌더)   │
└─────────┴───────────┴──────────┴──────────┴─────────┴──────────┘
```

### 핵심 파일 구조

```
src/domain/building/mobile-im/pptx/
├── pptx-renderer.ts       # 슬림 오케스트레이터
├── pptx-theme.ts          # 프리셋 테마 토큰 정의
├── imlib.ts               # §2~§10 컴포넌트 라이브러리 (1172 LOC)
├── deck-sequencer.ts      # posture×tier×grade 기반 슬라이드 순서
├── data-binder.ts         # 섹션 마크다운 → 아키타입 props 변환 (903 LOC)
├── text-budget.ts         # 텍스트 길이 제약/절삭
├── basis-enforcer.ts      # 재무 기준 강제 (용적률, Cap Rate 등)
├── provenance-mapper.ts   # 데이터 출처 분류/배지
├── utils/
│   ├── image-optimizer.ts  # sharp 기반 이미지 최적화 + 지도 합성
│   └── html-parser.ts      # HTML→텍스트 변환
└── archetypes/
    ├── index.ts            # ARCHETYPE_REGISTRY 매핑
    ├── a01-cover.ts ~ a14-gallery.ts  # 14개 슬라이드 아키타입
```

---

## 2. 렌더링 파이프라인 흐름

### 실행 순서

1. `MobileImPptxRenderer.render(input)` 호출
2. `getPptxThemeAsync(preset)` → `PptxThemeTokens` 로드
3. `setActiveTheme(theme)` → C/CD/KR 전역 색상·폰트 주입
4. `buildDeckSequence(input)` → `SlideSpec[]` (슬라이드 순서)
5. `bindSectionData(doc)` → `dataMap` (섹션별 props)
6. 아키타입 빌드 루프: `ARCHETYPE_REGISTRY[spec.archetype](archetypeInput)`
7. `addFallbackContent()` — 본문 미렌더 시 마크다운 파싱 폴백
8. `validateTextBudgets()` — 텍스트 오버플로 검증
9. `pres.write()` → PPTX Buffer 출력

### MobileImPptxInput 인터페이스

```typescript
interface MobileImPptxInput {
  buildingId: string;
  tier: 'basic' | 'pro';
  preset?: string;                    // 프리셋 ID (기본: 'credeal_signature')
  posture?: InvestmentPosture;        // 'income' | 'development' | 'owner_occupied' | 'operating' | 'trading'
  grade?: 'A' | 'B' | 'C' | 'D';
  incomeArchetype?: 'R-INC-01' | 'R-INC-02' | 'R-INC-03' | 'R-INC-04';
  hasViolation?: boolean;
  hasJointCollateral?: boolean;
  docno?: string;
  doc: {
    title?: string;
    body: Record<string, any>;       // IM body JSON
    sections?: Array<{ title: string; markdown: string; confidence?: string; boundary_note?: string; }>;
  };
  building?: { area_signal?: string; asset_type?: string; price_band?: string; };
  broker?: { display_name?: string; company_name?: string; phone?: string; };
  watermark?: { requesterName: string; phoneLast4: string; timestamp: string; };
  provenance?: Record<string, ProvenanceKind>;
  supabase?: SupabaseClient;
  logoUrl?: string;
}
```

---

## 3. 디자인 시스템

### 3.1 기하 상수 (단위: 인치, 변경 불가)

| 상수 | 값 | 설명 |
|---|---|---|
| `W` | `13.333` | LAYOUT_WIDE 캔버스 전체 폭 |
| `H` | `7.5` | 캔버스 전체 높이 |
| `M` | `0.62` | 좌우 마진 |
| `CW` | `12.093` | 콘텐츠 영역 폭 (`W - M×2`) |

**컬럼 함수:**
- `col(n, gap)` = `(CW - gap × (n-1)) / n`
- `colX(i, w, gap)` = `M + i × (w + gap)`

### 3.2 색상 팔레트 — C (라이트)

| 키 | 기본값 | 용도 |
|---|---|---|
| `ink` | `10161F` | 최상위 헤딩 / 다크 배경 |
| `ink2` | `1B2531` | 다크 보조 카드 |
| `ink3` | `27333F` | 다크 3차 표면 |
| `slate` | `2E3A4A` | 다크 슬레이트 |
| `body` | `2B3440` | 본문 텍스트 |
| `mute` | `7A8794` | 뮤트 라벨 |
| `mute2` | `9AA5B1` | 각주 텍스트 |
| `line` | `DDE3E8` | 테두리 / 구분선 |
| `line2` | `EEF1F4` | 연한 구분선 |
| `bg` | `FFFFFF` | 슬라이드 배경 |
| `tint` | `F5F7F9` | 카드 배경 |
| `brass` | `B98A2E` | 주 액센트 (골드) |
| `brassD` | `8E6A20` | 다크 brass |
| `brassL` | `F2E7CF` | 라이트 brass |
| `brassT` | `FBF6EC` | 극연 brass |
| `green/red/amber/blue/violet` | 각 의미색 | 출처 배지·callout 전용 |

### 3.3 색상 팔레트 — CD (다크)

| 키 | 기본값 | 용도 |
|---|---|---|
| `card` | `1B2531` | 다크 카드 배경 |
| `block` | `232F3C` | 다크 블록/헤더 |
| `border` | `2A3644` | 다크 테두리 |
| `body` | `A8B2BC` | 다크 본문 |
| `mute` | `8A96A2` | 다크 뮤트 |
| `faint` | `6B7885` | 다크 희미 |
| `accentBg` | `2A1F12` | 다크 액센트 배경 |
| `accentBorder` | `5C4620` | 다크 액센트 테두리 |
| `accentText` | `D3C6AC` | 다크 액센트 텍스트 |

### 3.4 폰트 상수

| 변수 | 기본값 | 동적 교체 | 용도 |
|---|---|---|---|
| `KR` | `맑은 고딕` | ✅ | 한글 본문 |
| `TITLE_KR` | `맑은 고딕` | ✅ | 한글 제목 |
| `NUM` | `Arial` | ❌ 고정 | 숫자/라틴 |

### 3.5 레이아웃 스타일 (5종)

| layoutStyle | head() | foot() | card() |
|---|---|---|---|
| `classic` | brass 원형 번호 + 우측 텍스트 | 좌 CREDEAL, 우 페이지 | roundRect (r:0.06) |
| `modern` | 좌 수직bar + 전폭 라인 | 중앙 정렬 + 짧은 라인 | rect + 상단 brass bar |
| `executive` | 중앙 정렬 + 상단 미세라인 | 좌 docno, 우 brass 페이지 | roundRect (r:0.10, border:1) |
| `minimal` | 좌측 번호 + 짧은 라인 | 우측 페이지만 | borderless rect |
| `dramatic` | 전폭 다크strip + brass bar | 전폭 다크 footer | rect + 좌 brass bar |

---

## 4. 프리셋 템플릿 시스템

### 4.1 PptxThemeTokens 전체 필드

```typescript
interface PptxThemeTokens {
  presetId: string;  presetName: string;
  // 무채색 (11종)
  ink: string; ink2: string; ink3: string; slate: string;
  body: string; mute: string; mute2: string;
  line: string; line2: string; bg: string; tint: string;
  // 액센트 (4종)
  accent: string; accentD: string; accentL: string; accentT: string;
  // 의미색 (10종) — 변경 비권장
  green: string; greenL: string; red: string; redL: string;
  amber: string; amberL: string; blue: string; blueL: string;
  violet: string; violetL: string;
  // 다크 전용 (9종)
  darkCard: string; darkBlock: string; darkBorder: string;
  darkBody: string; darkMute: string; darkFaint: string;
  darkAccentBg: string; darkAccentBorder: string; darkAccentText: string;
  // 타이포 (2종)
  titleFont: string; bodyFont: string;
  // 스타일 선택
  coverStyle: 'institutional_masses' | 'split' | 'hero_dark' | 'corporate_card' | 'obsidian_glow';
  layoutStyle: 'classic' | 'modern' | 'executive' | 'minimal' | 'dramatic';
  // 브랜딩 (3종)
  companyName: string; companyTagline: string; logoUrl?: string;
}
```

### 4.2 빌트인 프리셋 5종

| ID | 이름 | coverStyle | layoutStyle | accent | titleFont |
|---|---|---|---|---|---|
| `golden_institutional` | Golden Institutional | `institutional_masses` | `classic` | `B98A2E` 골드 | 맑은 고딕 |
| `credeal_signature` | CREDEAL Signature | `split` | `modern` | `C8FF00` 네온그린 | 맑은 고딕 |
| `executive_gold` | Executive Gold | `hero_dark` | `executive` | `D4A853` 웜골드 | Noto Serif KR |
| `corporate_clean` | Corporate Clean | `corporate_card` | `minimal` | `059669` 에메랄드 | Noto Sans KR |
| `pro_dark_obsidian` | Pro Dark Obsidian | `obsidian_glow` | `dramatic` | `06B6D4` 시안 | 나눔스퀘어 |

### 4.3 커스텀 프리셋 (DB)

`pptx_custom_presets` 테이블에 UUID로 저장 → `getPptxThemeAsync(uuid, supabase)` → `golden_institutional` 위에 머지

---

## 5. 덱 시퀀서 — 슬라이드 순서 결정

### 5.1 Grade D

- **Pro**: 빈 배열 (차단)
- **Basic**: `A01→[A14]→A02→A10` (3~4슬라이드)

### 5.2 Basic (Grade A/B/C) — 7~8슬라이드

```
A01(표지) → [A14(갤러리)] → A02(핵심요약) → A06(입지)
→ [포스처별 2슬라이드] → A07(리스크) → A10(면책)
```

| 포스처 | 본문 슬라이드 |
|---|---|
| `income` | A04(건물) + A03(렌트롤) |
| `development` | A04(토지) + A05(개발개요) |
| `owner_occupied` | A04(건물) + A08(자가비교) |
| `operating` | A04(건물) + A13(운영KPI) |
| `trading` | A04(건물) + A03(비교사례) |

### 5.3 Pro (Grade A/B/C) — 최대 24슬라이드

**공통 골격**: `A01 → [A14] → A02 → A06 → A04(토지) → A04(건물) → [본문] → [재무] → A07 → A09 → A10`

**포스처별 본문 (income R-INC-01 예시)**: A03(렌트롤) → A04(안정성) → A05(수익) → A08(자본) → A04(비교)

**등급별 재무 억제**: DCF/감응도 = A/B등급 전용, 총수익률 = A등급 전용

---

## 6. 데이터 바인딩 아키텍처

### 6.1 핵심 매핑 테이블

**섹션 타입 → 데이터 키:**
`property_overview→building`, `location_access→location`, `lease_status→rentRoll`, `income_analysis→profit`, `risk_check→risk`, `investment_thesis→comps`, `next_steps→process` 등

**데이터 키 → 아키타입:**
`summary→A02`, `location→A06`, `building→A04`, `rentRoll→A03`, `profit→A05`, `capital→A08`, `risk→A07`, `process→A09`, `kpi→A13` 등

### 6.2 아키타입 트랜스포머

| 아키타입 | Props |
|---|---|
| A02 StatGrid | `leadSentence`, `metrics[{label,value,unit,sub}]`, `callouts[]` |
| A03 LargeTable | `tableHead[]`, `tableRows[][]`, `note`, `callouts[]` |
| A04 Asymmetric75 | `left.{sub,rows}`, `right.{sub,callouts[],rows}` |
| A05 Asymmetric74 | `content`, `right.{stats[],callouts[]}` |
| A06 Diagram | `right.{rows[],callout}`, `left.{sub,source}` |
| A07 ThreeBlock | `blocks[{label,value,description}]`, `bottomBar` |
| A08 DualTable | `table1.{sub,rows}`, `table2.{sub,rows}`, `callouts[]` |
| A09 Process | `steps[{stepNum,title,description,tag}]`, `bottomInfo` |

### 6.3 텍스트 정제

`stripMarkdown()`: 마크다운 기호, 이모지, 시스템 메시지, SSoT 태그, 추측 어미 제거

---

## 7. 컴포넌트 라이브러리 (imlib)

### 슬라이드 생성

| 함수 | 배경 |
|---|---|
| `light(pres)` | FFFFFF |
| `dark(pres)` | 10161F |

### 헤더/푸터

| 함수 | 설명 |
|---|---|
| `head(s, num, kicker, title, sub?)` | layoutStyle별 5가지 라이트 헤더 |
| `headD(s, num, kicker, title, sub?)` | 다크 헤더 |
| `foot(s, page, docno, onDark?)` | layoutStyle별 5가지 푸터 |
| `watermark(s, text, onDark?)` | rotate -30, fs 36, tr 85 |

### 콘텐츠 컴포넌트

| 함수 | 시그니처 | 핵심 스펙 |
|---|---|---|
| `sub(s,x,y,w,text,onDark?)` | 소제목 | h=0.26, fs=11, bold |
| `note(s,x,y,w,text,onDark?)` | 각주 | h=0.42, fs=7.8 |
| `stat(s,x,y,w,label,value,unit,sub,opt?)` | KPI 카드 | roundRect, label 9.5pt, value 25pt, 한글감지 KR↔NUM |
| `rows(s,x,y,w,list,opt?)` | K-V행 | RowEntry `[label,value,badge?,color?]`, rh=0.315 |
| `table(s,x,y,w,head,body,colW,opt?)` | 테이블 | 헤더 배경+교대행, rh=0.28 |
| `callout(s,x,y,w,h,kind,title,body)` | 콜아웃 | 5종 kind, 좌측 액센트바 |
| `card(s,x,y,w,h,opt?)` | 카드 | layoutStyle별 5가지 스타일 |
| `tag(s,x,y,w,h,text,fg,bg,fs?)` | 태그 | 라운드 필 뱃지 |
| `chip(s,x,y,kind,opt?)` | 출처칩 | ProvenanceKind별 색상 |

### 특수 시각화

`waterfall()` 워터폴차트, `stack()` 층별적층, `locmap()` 위치개념도, `chartOpts()` 차트옵션

---

## 8. 아키타입 카탈로그 (A01–A14)

### A01 — 표지 (Cover) [Async, Dark]

- **5개 coverStyle**: institutional_masses, split, hero_dark, corporate_card, obsidian_glow
- **입력**: coverImageUrl, title(40pt TITLE_KR), priceBand(22pt), tags[], brokerName, logoUrl
- **이미지**: optimizeImageForPptx(1280, 85), 실패 시 웜톤 도형 폴백
- **좌표**: kickerY=2.10~2.22, 정보바 y=6.60, 로고 y=0.40

### A02 — 핵심요약 (StatGrid) [Sync, Light]

- **입력**: leadSentence(15pt bold), metrics[{label,value,unit,sub}], callouts[]
- **레이아웃**: Lead y=1.30, brass라인 y=1.85, Stat 4열 grid(gap=0.20, h=1.4)
- **3단 폴백**: metrics → tables → content → 플레이스홀더

### A03 — 대형 테이블 (LargeTable) [Sync, Light]

- **입력**: tableHead[], tableRows[][], note, callouts[]
- **레이아웃**: 전폭 테이블 y=1.86, rowH=0.46, 스마트 컬럼폭
- **셀 절삭**: 14자 초과→13자+…

### A04 — 비대칭 7:5 [Sync, Light]

- **레이아웃**: 좌 lw=7.5(rows fs=12), brass수직선 x=8.196, 우 rw=4.44(callouts/rows fs=11)

### A05 — 비대칭 7:4 [Sync, Light]

- **레이아웃**: 좌 lw=7.5(content rows), 우 rw=4.44(stat카드 h=1.2 스택+callouts)

### A06 — 다이어그램/지도 [Async, Light]

- **레이아웃**: 좌 맵(w=5.60, h=4.50), 우 텍스트(textX=6.50, textW=6.333)
- **맵 3단계**: 카카오→OSM타일합성→SVG플레이스홀더

### A07 — 3블록 카드 [Sync, Dark/Light]

- **레이아웃**: 3등분(gap=0.30, w=3.911, h=3.5, y=1.72), brass상단라인
- **한글감지**: 한글→18pt KR, 숫자→22pt NUM

### A08 — 이중 테이블 [Sync, Light]

- **레이아웃**: 좌 테이블2개 수직체인(w=7.30), 우 callout스택(rx=8.20, rw=4.51)

### A09 — 프로세스 [Sync, Light]

- **레이아웃**: n등분(n≤4, gap=0.4, h=3.5), brass번호원(w=0.42), 카드간 화살표

### A10 — 마감/면책 [Async, Dark]

- **레이아웃**: 좌 배지5행(간격0.72, h=0.38), 우 면책카드(rx=7.10, rw=5.61), 하단푸터바

### A11 — 객실 스펙 [Sync, Light]

- 좌 테이블(w=7.10), 우 2×2 stat박스 + 위반사항 빨간박스

### A12 — 소유 구조 [Sync, Light, master A12]

### A13 — 운영 KPI [Sync, Light, master A13]

- KPI 헤더: ADR, OCC, RevPAR, GOP마진

### A14 — 갤러리 [Async, Light]

- 1장=전폭, 2장=2열, 3~6장=2×n그리드, optimizeImagesForPptx(max 6), sizing:cover

---

## 9. 텍스트 예산 & 제약

| 타입 | 최대 글자 | 타입 | 최대 글자 |
|---|---|---|---|
| slideTitle | 20 | calloutTitle | 26 |
| kicker | 30 | tableHeader | 8 |
| subTitle | 40 | tableCell | 12 |
| leadSentence | 90 | note | 120 |
| statLabel | 14 | statValue | 6 |
| subHeading | 30 | statSub | 24 |

**한글 폭 계수**: 1글자 ≈ 0.19인치 @10pt  
**lineH 보정**: 불릿/텍스트 `/50`, blockquote `/42`

---

## 10. 이미지 처리

- **일반**: `optimizeImageForPptx(url, 1280, 75)` — sharp리사이즈+mozjpeg, 10초타임아웃
- **지도 3단**: 카카오Static→OSM타일3×3합성+핀SVG→SVG플레이스홀더
- **갤러리**: `optimizeImagesForPptx(urls, 6)` — 병렬다운로드, sizing:cover

---

## 11. 출처 표기 & 기준 강제

| Kind | 라벨 | 가중치 | 색상 |
|---|---|---|---|
| `pub` | ✓ 공부확인 | 1.00 | green |
| `exp` | ★ 전문가검증 | 0.95 | amber |
| `sel` | ▲ 매도인고지 | 0.65 | violet |
| `brk` | ● 중개인입력 | 0.60 | blue |
| `ai` | ◇ AI추정·가정 | 0.30 | mute |

**기준 강제**: 용적률(지상 기준), Cap Rate(NOI/NCF/GOP 라벨), 임대차 법률 기본값, null→'확인 중', 임대료 상한 초과 방지

---

## 12. 신규 프리셋 개발 가이드

### 체크리스트

1. `PptxThemeTokens` 전체 필드 정의 (39개 토큰)
2. `coverStyle` 5종 중 선택 (새 스타일 = a01-cover.ts 함수 추가)
3. `layoutStyle` 5종 중 선택 (새 스타일 = imlib.ts head/foot/card 분기 추가)
4. `accent` ↔ `darkAccentBg`/`darkAccentBorder`/`darkAccentText` 대비 검증
5. 폰트: Windows/macOS 호환 확인
6. DB 등록: `pptx_custom_presets` 테이블에 UUID + tokens JSON

### 신규 프리셋 예시

```typescript
PPTX_PRESET_TEMPLATES['my_premium'] = {
  presetId: 'my_premium',
  presetName: 'Premium Navy',
  ink: '0A1628', ink2: '142238', ink3: '1E3050',
  slate: '2A3C52', body: '223348', mute: '6B7F96',
  mute2: '8FA3B8', line: 'D0D8E2', line2: 'E8ECF2',
  bg: 'FFFFFF', tint: 'F2F5F8',
  accent: '1E40AF', accentD: '1E3A8A', accentL: '60A5FA', accentT: 'DBEAFE',
  green: '3A7350', greenL: 'E7F0EA', red: 'A33A3D', redL: 'F6E9E9',
  amber: '96702A', amberL: 'F7EFDC', blue: '44637F', blueL: 'E9EEF3',
  violet: '6D4AA8', violetL: 'EDE7F6',
  darkCard: '142238', darkBlock: '1E3050', darkBorder: '2A3C52',
  darkBody: 'A0B4CC', darkMute: '7A90A8', darkFaint: '5A7090',
  darkAccentBg: '0C1E3A', darkAccentBorder: '1E3A8A', darkAccentText: '93C5FD',
  titleFont: 'Noto Sans KR', bodyFont: 'Noto Sans KR',
  coverStyle: 'hero_dark', layoutStyle: 'executive',
  companyName: '프리미엄부동산', companyTagline: '신뢰의 투자 파트너',
};
```

### 테마 적용 흐름

```
renderer.render(input)
  → getPptxThemeAsync('my_premium')    // 토큰 로드
  → setActiveTheme(theme)              // C, CD, KR, TITLE_KR 전역 교체
  → 이후 모든 L.head(), L.stat() 등이 새 색상/폰트 사용
```

### ⚠️ 주의사항

- **의미색(green/red/amber/blue/violet)** 변경 비권장 — 출처 배지·callout 의미 구분에 사용
- **`NUM` 폰트 `Arial` 고정** — 숫자/라틴은 항상 Arial
- **transparency 사용 금지** — PptxGenJS 색상 변환 버그 유발, 불투명 색상만 사용
- **기하 상수(W, H, M, CW) 변경 불가** — 모든 아키타입 의존
