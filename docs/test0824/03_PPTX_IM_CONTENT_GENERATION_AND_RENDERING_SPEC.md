# 📊 CREDEAL PPTX IM 섹션 콘텐츠 생성 & 렌더링 스펙

> **문서 ID**: `DOC-TEST0825-PPTX-IM-SPEC`  
> **생성 일시**: 2026-08-25 08:32 (KST)  
> **감사 대상**: `src/domain/building/mobile-im/pptx/` 전체 렌더링 파이프라인  
> **감사 범위**: 데이터 바인더, 17개 아키타입 빌더 좌표·폰트·조건부 로직, imlib 컴포넌트 라이브러리, 갤러리 플래너, 텍스트 예산 시스템

---

## 📑 목차

1. [데이터 바인딩 엔진](#1-데이터-바인딩-엔진)
2. [imlib 컴포넌트 라이브러리](#2-imlib-컴포넌트-라이브러리)
3. [17개 아키타입 렌더링 상세 스펙 (A01~A17)](#3-17개-아키타입-렌더링-상세-스펙)
4. [갤러리 플래너](#4-갤러리-플래너)
5. [텍스트 예산 시스템](#5-텍스트-예산-시스템)

---

## 1. 데이터 바인딩 엔진

### 1.1 핵심 인터페이스

```typescript
// src/domain/building/mobile-im/pptx/data-binder.ts

export interface SectionData {
  title: string;
  content: string;
  tables: ParsedTable[];
  metrics: Record<string, string>;
  confidence?: string;
  boundaryNote?: string;
  [key: string]: any;  // 아키타입별 확장 props
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}
```

### 1.2 이중 바인딩 모드

| 모드 | 함수 | 사용 조건 | 장점 |
|---|---|---|---|
| **마크다운 파싱** | `bindSectionData(doc, building)` | 기본 경로 | 유연한 LLM 출력 수용 |
| **IMCore 직접** | `bindFromIMCore(core: IMCore)` | `RENDER_PATH === 'imcore'` | 파싱 드리프트 0% |

### 1.3 섹션 유형 → 데이터 키 → 아키타입 매핑

| 섹션 유형 | 주 데이터 키 | 아키타입 | 파생 데이터 키 → 아키타입 |
|---|---|---|---|
| `property_overview` | `building` | A04 | `summary`→A02, `land`→A04 |
| `location_access` | `location` | A06 | - |
| `lease_status` | `rentRoll` | A03 | `stability`→A04, `vacancy`→A04, `current`→A04 |
| `income_analysis` | `profit` | A05 | `capital`→A16, `dcf`→A05, `sensitivity`→A05, `loan`→A08, `tax`→A08, `rentGap`→A05, `upside`→A05, `leasing`→A05, `remodel`→A05, `comps`→A03 |
| `risk_check` | `risk` | A07 | - |
| `investment_thesis` | `thesis` | A15 | - |
| `next_steps` | `process` | A09 | - |
| `occupancy_fit` | `plan` | A04 | `commute`→A06 |
| `cost_comparison` | `vsLease` | A08 | `value`→A04 |
| `site_analysis` | `landDetail` | A04 | `scale`→A05, `eviction`→A04 |
| `development_feasibility` | `feasibility` | A05 | `cost`→A08, `stacking`→A05 |
| `operation_overview` | `kpi` | A13 | `operator`→A04 |
| `gop_analysis` | `revenue` | A05 | `seasonality`→A05 |
| `market_position` | `marketPosition` | A04 | `turnover`→A04 |
| `comparable_analysis` | `comps` | A03 | `trend`→A05, `price`→A04 |

### 1.4 `bindSectionData()` 처리 단계

```
1. 섹션 순회 → SECTION_TYPE_TO_DATA_KEY로 주 키 해석
2. sanitizePersona() 클렌징:
   • NaN/null/undefined + 단위 → "--"
   • 시스템 메시지 제거 (건축물대장 미완료, API 응답 등)
   • 이모지 → 카테고리 태그 (🚇→[교통], 🏢→[건물])
   • 페르소나 언급 제거 ("60대 자산가를 위한" 등)
   • 가드레일 토큰 정상화 ("[인명 비공개]에게"→"담당자에게")
   • 갱신요구권 할루시네이션 보정
3. parseMarkdownTable() + extractMetrics()
4. transformForArchetype() — 아키타입별 빌더 호출:
   buildA02Props, buildA03Props, buildA04Props, buildA05Props,
   buildA06Props, buildA07Props, buildA08Props, buildA09Props,
   buildA13Props, buildA15Props, buildGenericProps
5. 파생 섹션 확장:
   property_overview → summary + land
   income_analysis → capital + dcf + sensitivity + loan + tax + ...
   lease_status → stability + vacancy + current
   (그 외 각 포스처별 파생)
```

### 1.5 파싱 알고리즘

| 함수 | 입력 | 처리 | 출력 |
|---|---|---|---|
| `parseMarkdownTable` | 마크다운 문자열 | `\|`로 시작하는 행 감지, 구분선 제거, 셀 trim | `ParsedTable[]` |
| `mergeRentRollTables` | 다중 테이블 | 공통 헤더 매칭하여 행 병합 | `ParsedTable` |
| `extractMetrics` | 마크다운 문자열 | 정규식: 금액(`억/만원/원`), 면적(`㎡/평`), 비율(`%`) | `Record<string, string>` |
| `extractStatMetrics` | 마크다운 또는 테이블 | 테이블 col0→label, col1→value, col2→unit (최대 8개) / 볼드 라인 폴백 | `StatMetric[]` |
| `extractCallouts` | 마크다운 문자열 | `>`로 시작하는 행, `⚠`→`warn`, `:`로 title/body 분리 (최대 4개) | `Callout[]` |

### 1.6 `bindFromIMCore()` 주요 바인딩

| 데이터 키 | 아키타입 | 직접 바인딩 내용 |
|---|---|---|
| `summary` | A02 | `askingPriceBil`, gross yield, equity required, 리드 문장 자동 생성 |
| `building` | A04 | 좌측: 소재지/대지/연면적/층수/준공, 우측: 용도지역/건폐율·용적률/주차 |
| `rentRoll` | A03 | 7열 테이블: 호실, 업종, 면적, 보증금, 월세, 관리비, 만기일 |
| `profit` | A05 | 매매가, 총취득원가, 실투자금 KPI |
| `capital` | A16 | `equityBreakdown`, LTV 0%/40%/50% 시나리오, `negativeLeverage` 판정 |
| `stacking` | A17 | `devMetrics`, `regulationExpiry`, `regulationDaysLeft` |
| `risk` | A07 | `core.deficiencies` → ThreeBlock(severity, recommended action) |
| `thesis` | A15 | 3개 필러 자동 생성 (입지·수요, 수익성·현금흐름, 자산가치 상승) |

---

## 2. imlib 컴포넌트 라이브러리

### 2.1 캔버스 상수 & 기하

| 상수 | 값 | 단위 | 설명 |
|---|---|---|---|
| `W` | 13.333 | " | 캔버스 폭 (LAYOUT_WIDE 16:9) |
| `H` | 7.500 | " | 캔버스 높이 |
| `M` | 0.620 | " | 좌우 마진 |
| `CW` | 12.093 | " | 콘텐츠 폭 ($W - 2M$) |

```typescript
col(n, gap) = (CW - gap × (n-1)) / n    // 컬럼 폭
colX(i, w, gap) = M + i × (w + gap)      // i번째 컬럼 x좌표
```

### 2.2 슬라이드 생성 프리미티브

| 함수 | 파라미터 | 좌표 / 규격 | 설명 |
|---|---|---|---|
| `L.light(pres)` | `PptxGenJS` | $(0, 0, 13.333, 7.5)$ | 라이트 슬라이드 (`fill: #FFFFFF`) |
| `L.dark(pres)` | `PptxGenJS` | $(0, 0, 13.333, 7.5)$ | 다크 슬라이드 (`fill: #10161F`) |

### 2.3 헤더 & 푸터 (`L.head` / `L.headD` / `L.foot`)

5개 레이아웃 스타일별 변형:

| 스타일 | 헤더 렌더링 | 제목 폰트 | 특징 |
|---|---|---|---|
| `classic` | Brass 타원 배지(ø0.42") + 좌측 정렬 | 23pt bold | 깔끔한 전통적 스타일 |
| `modern` | 좌측 수직 brass 악센트 바 + 인라인 키커 | 22pt bold | 역동적 모던 스타일 |
| `executive` | 중앙 정렬 + 상하 gold 헤어라인 | 26pt bold Noto Serif | 격조 높은 임원용 |
| `minimal` | 배지 없이 숫자만 + 1.5pt 짧은 언더라인 | 21pt bold | 미니멀 클린 |
| `dramatic` | 전폭 다크 스트립 + 28pt brass 번호 + 좌측 매스 | 24pt bold white | 드라마틱 강조 |

### 2.4 콘텐츠 컴포넌트 상세

#### `L.stat()` — KPI 통계 카드

| 파라미터 | 설명 |
|---|---|
| `(s, x, y, w, label, value, unit, sub, opt)` | 통계 카드 렌더링 |

| 요소 | 좌표 | 폰트 | 동적 규칙 |
|---|---|---|---|
| 배경 카드 | $(x, y, w, h\text{=opt.h ?? 1.28})$ | - | roundRect, `fill: C.tint` |
| 라벨 | $(x+0.18, y+0.14, w-0.36, 0.26)$ | 9.5pt (opt.labelFontSize) | - |
| **값** | $(x+0.18, y+0.38, w-0.36, 0.34)$ | **동적**: ≤6자→25pt, ≤12자→18pt, ≤20자→14pt, >20자→11pt | 한국어 감지 시 `KR` 폰트, `shrinkText: true` |
| 단위 | $(x+0.18, y+0.74, w-0.36, 0.20)$ | 8.8pt | - |
| 부가정보 | $(x+0.18, y+0.86, w-0.36, 0.28)$ | 8.8pt | - |

#### `L.rows()` — 키-값 행 목록

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `(s, x, y, w, list: RowEntry[], opt)` | `rh=0.315"`, `fs=10.5pt` | 구조화 행 렌더링 |
| 라벨 너비 | 40% (38%) | 왼쪽 라벨 영역 |
| 값 너비 | 38% (62%) | 가운데 값 영역 |
| 배지 너비 | 20% | 오른쪽 배지/태그 |
| 구분선 | 0.3pt | 행 사이 구분선 |

#### `L.table()` — 데이터 테이블

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `(s, x, y, w, headRow, bodyRows, colW, opt)` | `rh=0.28"`, `bfs=9.5pt`, `hfs=9pt` | PPTX 테이블 |
| 테두리 | 0.3pt solid | 전체 셀 |
| 배경 | 제브라 (`cellBg` / `tint` 교대) | 다크: `CD.block` 교대 |
| 자동 페이지 | `autoPage: true` | 넘침 시 자동 분할 |

#### `L.callout()` — 인포/경고 콜아웃

| 파라미터 | 설명 |
|---|---|
| `(s, x, y, w, h, kind, title, body)` | 왼쪽 수직 바 + 제목 + 불릿 본문 |
| `kind` | `'info'` \| `'good'` \| `'warn'` \| `'bad'` \| `'brass'` |
| 수직 바 | $(x, y+0.06, 0.04, h-0.12)$ |
| 제목 | $(x+0.20, y+0.12, w-0.36, 0.22)$ — 10.5pt bold |
| 본문 | $(x+0.20, y+0.36, w-0.36, h-0.44)$ — 9.3pt, `bullet: {code:'2022'}` |

#### 기타 컴포넌트

| 함수 | 좌표 | 설명 |
|---|---|---|
| `L.sub(s,x,y,w,text)` | $(x, y, w, 0.26)$ | 11pt bold 섹션 소제목 |
| `L.note(s,x,y,w,text)` | $(x, y, w, 0.42)$ | 7.8pt 각주, lineSpacing 1.25 |
| `L.chip(s,x,y,kind)` | $(x, y, 1.02, 0.21)$ | Provenance 필 배지 (7.2pt bold) |
| `L.tag(s,x,y,w,h,text,fg,bg)` | $(x, y, w, h)$ | 커스텀 필 태그 (`radius: h/2`) |
| `L.card(s,x,y,w,h)` | $(x, y, w, h)$ | 레이아웃 스타일별 컨테이너 카드 |
| `L.waterfall(s,x,y,w,h,steps,max)` | $(x, y, w, h)$ | 워터폴 차트 (7.5pt 라벨, 8pt 값) |
| `L.stack(s,x,y,w,h,floors)` | $(x, y, w, h)$ | 층별 스태킹 다이어그램 (9pt 라벨) |
| `L.locmap(s,x,y,w,h)` | $(x, y, w, h)$ | 반경 지도 플레이스홀더 (10pt) |
| `L.watermark(s,text)` | $(1.50, 2.50, 10.0, 2.50)$ | 36pt 워터마크 (-30°, 85% 투명) |

---

## 3. 17개 아키타입 렌더링 상세 스펙

### A01 — Cover (표지)

| 요소 | 좌표 $(x, y, w, h)$ | 폰트 | 비고 |
|---|---|---|---|
| 키커 | $(M, kickerY, titleW, 0.3)$ | 10pt bold brass Arial | "INVESTMENT MEMORANDUM" |
| **타이틀** | $(M, kickerY+0.30, titleW, 0.80)$ | **40pt bold white** TITLE_KR | 건물 블라인드명 |
| 부제목 | $(M, kickerY+1.16, titleW, 0.4)$ | 14pt body | 자산유형 |
| 태그 | $(y=kickerY+1.70, h=0.34)$ | 동적 w | `L.tag` 복수 |
| **매각가 박스** | $(M, tagY+0.70, 7.5, 1.34)$ | **22pt bold** | 가격대 하이라이트 |
| 회사/중개사 | $(M, 6.60, CW, 0.3)$ | 8.5pt | 푸터 영역 |
| 로고 | $(M, 0.40, 1.20, 0.40)$ | - | containment 사이징 |

**커버 스타일별 기하학적 장식**:

| 스타일 | 장식 요소 좌표 |
|---|---|
| `institutional_masses` | 블록1: $(9.05, 0, 1.55, 4.42)$, 블록2: $(10.70, 0.95, 1.25, 3.47)$, 블록3: $(12.05, 1.85, 1.28, 2.57)$ |
| `split` | 우측 패널: $(8.50, 0, 4.833, 7.5)$, 태그라인: $(9.00, 5.80, 3.80, 0.4)$ |
| `hero_dark` | 상하 brass선: $(0, 0, 13.333, 0.05)$ + $(0, 7.45, 13.333, 0.05)$, 프레임: $(M, 1.80, CW, 3.40)$ |
| `corporate_card` | 카드: $(1.50, 1.20, 10.33, 5.10)$, 상단 brass: $(1.50, 1.20, 10.33, 0.06)$ |
| `obsidian_glow` | 원1: $(8.0, 0.5, 6.0, 6.0)$, 원2: $(9.0, 1.5, 4.0, 4.0)$, 원3: $(9.8, 2.3, 2.4, 2.4)$ |

---

### A02 — Stat Grid (핵심 지표)

| 요소 | 좌표 | 폰트 | 조건 |
|---|---|---|---|
| 리드 문장 | $(M, 1.30, CW, 0.5)$ | 15pt bold ink | - |
| Brass 언더라인 | $(M, 1.85, CW, 0)$ | 1.5pt | - |
| KPI 카드 그리드 | $y=2.15$ (리드 있을 때) / $1.50$ | `L.stat` | 2~4열, gap=0.20", h=1.40" |
| **3개 투자 하이라이트** | $y=\max(kpiEnd+0.15, 3.75)$ | - | - |
| ├ 헤더 | $(M, hlY, CW, 0.30)$ | 12.5pt bold brassD | - |
| └ 행(×3) | $(M+0.12, ry, 0.45, 0.40)$ 배지 + $(M+0.70, ry, CW-0.85, 0.48)$ 텍스트 | 11.5pt ink | 행간: h=0.64", gap=0.12" |

**폴백**: 메트릭 없으면 `heroCard` → 테이블 → 키-값 MD → 4개 플레이스홀더. 하이라이트 없으면 불릿 추출 → 기본 3개 CRE 하이라이트.

---

### A03 — Large Table (대형 테이블)

| 요소 | 좌표 | 폰트 | 동적 규칙 |
|---|---|---|---|
| 테이블 | $(M, 1.80, CW, dynamic)$ | 동적 | 행 ≤8: rh=0.48", bfs=13pt (>4열→11pt); 행 >8: rh=0.38", bfs=9.5~11pt |
| 셀 절단 | - | - | >45자 시 `…` 절단 |
| 최대 행 | - | - | 12행 (초과 시 트림) |
| 스마트 컬럼 | - | - | 좁은 키워드(층/호/호실/floor/구분/번호)→가중치 0.6, 기타 1.0 |
| 각주 | $(M, tableEnd+0.10, CW, 0.42)$ | `L.note` | - |
| 콜아웃 (2열) | $(M, tableEnd+0.40, col(2,0.20), 1.20)$ | `L.callout` | 각주 중복 텍스트 필터링 |

**폴백**: 테이블 없으면 $(M, 1.86, CW, 1.5)$ 콜아웃 + $(y=3.60, h=2.4)$ 2열 실사 카드.

---

### A04 — Asymmetric 7:5 (비대칭 좌우분할)

| 요소 | 좌표 | 규격 |
|---|---|---|
| **좌측** | $(M, 1.50, 7.5, -)$ | `L.rows` rh=0.44", fs=14pt, 최대 10행 |
| **수직 brass선** | $(M+lw+gap/2, 1.50, 0, 5.2)$ | 0.7pt |
| **우측 (사진 있음)** | 이미지: $(8.513, 1.80, 4.20, 3.20)$ | `sizing: cover` |
| | 콜아웃: $(8.513, 5.15, 4.20, 1.55)$ | `L.callout` |
| **우측 (사진 없음)** | 콜아웃1: $(8.513, 1.80, 4.20, ~2.3)$ | `L.callout` |
| | 콜아웃2: $(8.513, 4.35, 4.20, 2.35)$ | `L.callout` |

---

### A05 — Asymmetric 7:4 (KPI + 가치제안)

| 요소 | 좌표 | 폰트 |
|---|---|---|
| 부제목 | $(M, 1.45, CW, 0.26)$ | 11pt bold |
| Brass 악센트 | $(M, 1.90, CW, 0)$ | 1.5pt |
| **Row 1 KPI (3장)** | $(x, 2.15, cardW, 1.30)$ | 값: **22pt**, 라벨: 9.5pt (동적 축소) |
| **Row 2 KPI (3장)** | $(x, 2.15+1.30+gap, cardW, 1.15)$ | 값: **18pt** |
| **가치제안 콜아웃** | $(y=contentY+0.10, h≤1.40)$ | 11pt | 서사+우측 콜아웃 → 2열 분할 |

**라벨 동적 폰트 축소**: >20자→8.0pt, >16자→8.5pt, 기타→9.5pt

---

### A06 — Diagram (입지 지도)

| 요소 | 좌표 | 규격 |
|---|---|---|
| **좌측 지도** | $(M, 1.62, 5.60, 4.50)$ | Kakao/OSM 이미지 + POI 마커 |
| **우측 텍스트** | $(6.62, y, 6.093, -)$ | - |
| ├ 부제목 | $(textX, y, textW, 0.26)$ | 11pt bold |
| ├ 입지 행 | $(textX, y, textW, -)$ | `L.rows` rh=0.54", fs=13pt, 최대 6행 |
| ├ 콜아웃 | $(textX, y, textW, h≤2.0)$ | 조건: $y<5.8$ |
| └ 출처 각주 | $(textX, min(y+0.1,6.2), textW)$ | `L.note` |

---

### A07 — Three Block (리스크 3블록)

| 요소 | 좌표 | 폰트 |
|---|---|---|
| **3열 카드** | $w=col(3,0.28)≈3.84", h=4.00", y=1.55$ | - |
| ├ 상단 brass 악센트 | $(x, y, w, 0.05)$ | - |
| ├ 카테고리 헤더 | $(x+0.25, y+0.22, w-0.5, 0.32)$ | 13.5pt bold |
| ├ 상태/값 | $(x+0.25, y+0.58, w-0.5, 0.40)$ | 12.5pt bold, `fit:shrink` |
| └ 불릿 포인트 | $(x+0.25, y+1.05, w-0.5, h-1.15)$ | 11.0pt, bullet `2022`, lnSp 1.25 |
| **하단 고지 바** | $(M, 5.68, CW, 0.68)$ | 11pt |

**폴백**: 빈 데이터 시 3개 표준 CRE 리스크 필러 자동 생성: ① 법적·공법 규제, ② 임대차·명도, ③ 물리적·시설.  
**조건**: `hasJointCollateral===true` → 공동담보 경고 블록 주입.

---

### A08 — Dual Table (이중 테이블)

| 요소 | 좌표 | 폰트 |
|---|---|---|
| **좌측** $(w=7.30)$ | | |
| ├ 테이블1 | $(M, 1.90, 7.30)$ | rh=0.46", bfs=13pt, hfs=13pt |
| └ 테이블2 | $(M, t1End+0.50, 7.30)$ | rh=0.46" |
| **우측** $(rx=8.20, rw=4.51)$ | | |
| ├ 콜아웃1 | $(rx, 1.90, rw, 2.10)$ | `L.callout` |
| └ 콜아웃2 | $(rx, 4.15, rw, 2.10)$ | `L.callout` |

---

### A09 — Process (진행 절차)

| 요소 | 좌표 | 폰트 |
|---|---|---|
| **스텝 카드** $(n=3~4)$ | $gap=0.40, w=col(n,0.40), y=1.72, h=3.50$ | - |
| ├ 번호 원형 | $(x+0.24, y+0.24, 0.48, 0.48)$ | 14pt bold white Arial |
| ├ 스텝 제목 | $(x+0.24, y+0.80, w-0.48, 0.40)$ | 16pt bold ink |
| ├ 설명 | $(x+0.24, y+1.30, w-0.48, h-1.50)$ | 11pt body |
| ├ 태그 | $(x+0.24, y+h-0.50, 1.45, 0.28)$ | 9pt |
| └ 연결 화살표 | $(x+w+0.10, y+h/2-0.15, 0.20, 0.30)$ | `rightArrow` 쉐이프 |
| **하단 안내** | $(M, y+h+0.30, CW, 0.50)$ | 11pt mute |

---

### A10 — Closing (마감 & 면책)

| 요소 | 좌표 | 폰트 |
|---|---|---|
| **프로세스 리본 (3스텝)** | $y=1.60, h=0.72, w=col(3,0.16)$ | 원: ø0.48" brass, 제목: 11pt, 설명: 8.5pt |
| **좌: Provenance 배지** | $(M, 2.98+i×0.52, 1.40, 0.32)$ | 9pt (×4 배지) |
| **우: 면책 카드** | $(7.10, 2.98, 5.61, cardH)$ | 8.5pt mute |
| **하단 푸터 바** | $(M, 6.30, CW, 0.50)$ | 자문 텍스트 + 로고 $(M+CW-1.44, 6.34, 1.20, 0.36)$ |

**Provenance 5등급**: `✓공부확인`(1.00), `★전문가검증`(0.95), `▲매도인고지`(0.65), `●중개인입력`(0.60), `◇AI추정·가정`(0.30)

---

### A11 — Room Spec (호실 사양)

| 요소 | 좌표 | 폰트 |
|---|---|---|
| 좌: 호실 테이블 | $(M, 1.98, 7.10)$ | rh=0.33", bfs=10pt |
| 우: 2×2 통계 | $(8.08, 1.98, 2.24, 1.06)$ × 4 | `L.stat` |
| 우: 위반 경고 | $(8.08, 4.30, 4.63, 1.20)$ | redL 틴트 |

---

### A12 — Ownership (소유 구조)

| 요소 | 좌표 | 폰트 |
|---|---|---|
| 좌: 소유권 테이블 | $(M, 1.98, 7.10)$ | rh=0.35", fs=10pt |
| 우: 콜아웃 (×3) | $(8.08, 1.98+i×1.38, 4.63, 1.24)$ | `L.callout` |

---

### A13 — Operating KPI (운영 지표)

| 요소 | 좌표 | 폰트 |
|---|---|---|
| 좌: KPI 행 | $(M, 1.85, 7.30)$ | `L.rows` rh=0.46", fs=13.5pt, 최대 7행 |
| 좌: 안정성 콜아웃 | $(M, 5.20, 7.30, 1.35)$ | `L.callout` |
| 중앙: 수직선 | $(M+lw+gap/2, 1.50, 0, 5.2)$ | brass 0.7pt |
| 우: 통계 카드 (×3) | $(8.32, 1.68+i×(cH+0.20), 4.393, 1.45)$ | `L.stat` |

---

### A14 — Gallery (사진 갤러리)

| 요소 | 좌표 | 폰트 |
|---|---|---|
| 이미지 최적화 | 1600px, 85% JPEG | Sharp |
| 카테고리 배지 | $(x+0.08, y+0.08, badgeW, 0.26)$ | 8pt white bold |
| 캡션 바 | $(x, y+h-0.32, w, 0.32)$ | 8.5pt white (다크 스크림) |
| 플레이스홀더 | $(x, y, w, h)$ | `#F0F0F0` roundRect |

**폴백**: 이미지 로드 실패 시 $(M, 2.20, CW, 1.4)$ 안내 콜아웃.

---

### A15 — Thesis (투자 논거)

| 요소 | 좌표 | 폰트 | 조건 |
|---|---|---|---|
| **≤3 필러**: 3열 수평 | $cardW=col(3,0.35), startY=1.62$ | - | - |
| ├ 배지 | $(x+0.25, y+0.30, 0.52, 0.32)$ | - | brass 번호 |
| ├ 제목 | $(x+0.25, y+0.78, cW-0.50, 0.40)$ | 15pt bold | - |
| └ 본문 | 12pt, 디바이더 후 | - | cardH=2.80" (벤치마크 시) / 3.80" |
| **4 필러**: 2×2 그리드 | $cardW=col(2,0.35), cardH≈1.80$ | - | - |
| ├ 좌측 brass 스트립 | $(x, y, 0.06, cH)$ | - | 수직 바 |
| ├ 배지 | $(x+0.25, y+0.20, 0.46, 0.28)$ | - | - |
| ├ 제목 | $(x+0.80, y+0.18, cW-1.05, 0.32)$ | 14pt bold | - |
| └ 본문 | $(x+0.25, y+0.58, cW-0.50, cH-0.72)$ | 12pt | - |
| **벤치마크 테이블** | $(M, bmY, CW)$ | rh=0.36", bfs=10.5pt | 선택적 |
| **Takeaway 리본** | $(M, bannerY, CW, 0.88)$ | "종합 가치 제안" 10.5pt bold brassD + 서사 11pt ink | `fill: C.brassT` |

---

### A16 — Investment Structure (자본 구조)

| 요소 | 좌표 | 폰트 |
|---|---|---|
| 2열 레이아웃 | $colW=col(2,0.30)≈5.90", cardH=4.80", y=1.55$ | - |
| **좌: 취득비용** | 헤더: 13.5pt bold brass, 7행 rh=0.52", fs=11.5pt | (매매가, 취득세4.6%, 중개보수0.9%, 총원가, 보증금, 대출, 순자기자본) |
| **우: LTV 시나리오** | 테이블: colW=[1.6,1.1,1.4,1.4], rh=0.50", bfs=11pt | 무차입0%, 보수적40%, 표준50% |
| **우: 경고/안내 배너** | $(rx+0.25, y+2.90, cW-0.50, 1.60)$ | `negativeLeverage` → `warn` ⚠️ 역레버리지; else `info` 💡 자본조달 |

---

### A17 — Pre-completion Marketing (준공전 마케팅)

| 요소 | 좌표 | 폰트 |
|---|---|---|
| 2열 레이아웃 | $colW=col(2,0.30)≈5.90", cardH=4.80", y=1.55$ | - |
| **좌: 스태킹 플랜** | 헤더 ['층수','권장용도','전용면적','타깃임차'], colW=[1.1,1.6,1.2,1.5], rh=0.52", bfs=11pt | |
| **우: 개발 메트릭** | 5행 rh=0.48", fs=11pt (대지면적, 신축연면적, 건폐율/용적률, 총공사비, 총사업비) | |
| **우: 규제 기한 배너** | $(rx+0.25, y+3.10, cW-0.50, 1.40)$ | `regulationExpiry` 존재 시: `warn` ⏳ 한시적 용적률 완화 기한: YYYY-MM-DD (잔여 N일) |

---

## 4. 갤러리 플래너

### 4.1 플래닝 알고리즘 (`planGallerySlides`)

```
1. 필터링: category='map' 및 URL 없는 항목 제외
2. 단축: ≤2장 → 단일 슬라이드 (FULL_WIDE/DUAL)
3. 그룹핑: G1(외관), G2(공용), G3(전용부), G4(설비) 4그룹 분류
4. 포스처별 우선순위 정렬
5. 배칭: 그룹 경계 존중, 슬라이드당 최대 4장, 최대 4슬라이드
6. 로마 숫자 넘버링: Gallery I, II, III, IV
```

### 4.2 포스처별 그룹 우선순위

| 포스처 | 우선순위 |
|---|---|
| `income`, `trading`, `operating` | G1_exterior → G3_leasable → G2_common → G4_facility |
| `owner_occupied` | G1_exterior → G2_common → G3_leasable → G4_facility |
| `development` | G1_exterior → G4_facility → G3_leasable → G2_common |

### 4.3 6종 레이아웃 토폴로지 (정확한 바운딩 박스)

| 타입 | 장수 & 조건 | 좌표 $(x, y, w, h)$ (startY=1.35, gap=0.14) |
|---|---|---|
| `FULL_WIDE` | 1장 | **Hero**: $(0.62, 1.35, 12.093, 5.15)$ |
| `DUAL_LANDSCAPE` | 2장 (가로형) | **Left**: $(0.62, 1.35, 5.976, 5.15)$, **Right**: $(6.736, 1.35, 5.976, 5.15)$ |
| `DUAL_PORTRAIT` | 2장 (세로형, ratio<0.9) | 위와 동일 치수 (세로 크롭 적용) |
| `ONE_LARGE_TWO_SMALL_H` | 3장 | **Left 60%**: $(0.62, 1.35, 7.172, 5.15)$, **RT**: $(7.932, 1.35, 4.781, 2.505)$, **RB**: $(7.932, 3.995, 4.781, 2.505)$ |
| `ONE_LARGE_TWO_SMALL_V` | 3장 (세로) | 상단 Hero + 하단 2개 |
| `GRID_2X2` | 4장 | **TL**: $(0.62, 1.35, 5.976, 2.505)$, **TR**: $(6.736, 1.35, 5.976, 2.505)$, **BL**: $(0.62, 3.995, 5.976, 2.505)$, **BR**: $(6.736, 3.995, 5.976, 2.505)$ |

---

## 5. 텍스트 예산 시스템

### 5.1 `TEXT_LIMITS` 전체 사전

| 요소 | 최대 글자 수 | 용도 |
|---|:---:|---|
| `slideTitle` | 32 | 슬라이드 주 제목 |
| `kicker` | 35 | 키커 / 카테고리 라벨 |
| `subTitle` | 50 | 부제목 |
| `leadSentence` | 100 | 핵심 요약 / 리드 문장 |
| `subHeading` | 35 | 소제목 |
| `statLabel` | 18 | KPI 카드 라벨 |
| `statValue` | 10 | KPI 카드 값 |
| `statSub` | 30 | KPI 부가정보 |
| `calloutTitle` | 30 | 콜아웃 박스 제목 |
| `tableHeader` | 16 | 테이블 열 헤더 |
| `tableCell` | 30 | 테이블 셀 |
| `note` | 140 | 슬라이드 각주 |

### 5.2 `enforceTextBudget(text, maxLen)`

```
1. text.length ≤ maxLen → 원문 반환
2. candidate = text.slice(0, maxLen)
3. 한국어 문장 종결 탐색: ". ", "다. ", "요. ", "음. ", "다.", "요.", "함.", "임.", "."
4. 종결점 > maxLen×0.5 → 해당 위치에서 클린 절단
5. 단어 경계 " " > maxLen×0.65 → 해당 위치 + "…"
6. 그 외 → maxLen 위치 + "…"
```

### 5.3 `charsPerLine(boxWidth, fontSize)`

```typescript
cjkCoeff = 0.19 × (10 / (fontSize || 10))
return Math.floor((boxWidth - 0.36) / cjkCoeff)
```

### 5.4 `calcCalloutHeight(bodyText, boxWidth)`

```
totalLines = Σ ceil(segment.length / charsPerLine)  // 줄바꿈 기준 세그먼트
height = 0.55 + totalLines × 0.29
```

### 5.5 `assertBounds(element, limits)`

| 검사 | 조건 | 허용 오차 |
|---|---|---|
| 가로 초과 | $x + w \leq 12.713$ | +0.05" |
| 세로 초과 | $y + h \leq 6.75$ | +0.05" |

---

## 핵심 파일 인벤토리

| 파일 | 역할 |
|---|---|
| [`data-binder.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/data-binder.ts) | 이중 모드 데이터 바인더 |
| [`imlib.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/imlib.ts) | 컴포넌트 라이브러리 (1,245행) |
| [`gallery-planner.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/gallery-planner.ts) | 갤러리 플래너 (244행) |
| [`text-budget.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/text-budget.ts) | 텍스트 예산 시스템 |
| [`archetypes/a01-cover.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/archetypes/a01-cover.ts) ~ [`a17-pre-completion-marketing.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/archetypes/a17-pre-completion-marketing.ts) | 17개 아키타입 빌더 |

---

*본 문서는 PPTX IM 렌더링 파이프라인의 데이터 바인더, 17개 아키타입 슬라이드 빌더, 컴포넌트 라이브러리, 갤러리 플래너, 텍스트 예산 시스템의 코드베이스 정밀 감사를 통해 작성된 기술 규격서입니다.*
