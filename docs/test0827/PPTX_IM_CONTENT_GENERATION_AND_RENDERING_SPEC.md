# PPTX IM 콘텐츠 생성 및 렌더링 스펙 (코드 감사용)

> **문서 ID**: `DOC-TEST0827-03-PPTX-IM-SPEC`  
> **작성일**: 2026-08-27  
> **대상**: QA / 코드 감사 / 품질 관리팀  
> **범위**: `src/domain/building/mobile-im/pptx/` 및 E2E 테스트 인프라

---

## 목차
1. [PPTX 생성 아키텍처](#1-pptx-생성-아키텍처)
2. [덱 시퀀서 & 등급 게이트](#2-덱-시퀀서--등급-게이트)
3. [데이터 바인딩 & 마크다운 파싱](#3-데이터-바인딩--마크다운-파싱)
4. [18종 슬라이드 아키타입](#4-18종-슬라이드-아키타입)
5. [비중복 렌더링 원칙 구현](#5-비중복-렌더링-원칙-구현)
6. [텍스트 예산 & 물리적 경계 제약](#6-텍스트-예산--물리적-경계-제약)
7. [테마 & 프리셋 시스템](#7-테마--프리셋-시스템)
8. [폴백 & 에러 처리](#8-폴백--에러-처리)
9. [CRE 규칙 적용](#9-cre-규칙-적용)
10. [AI 시각 E2E 테스트 파이프라인](#10-ai-시각-e2e-테스트-파이프라인)
11. [API 라우트 & 배포](#11-api-라우트--배포)
12. [약점 및 우려 사항 종합](#12-약점-및-우려-사항-종합)

---

## 1. PPTX 생성 아키텍처

### 1.1 핵심 오케스트레이터

**파일**: [`pptx-renderer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/pptx-renderer.ts) — 608행  
**클래스**: `MobileImPptxRenderer`

기존 17개 `buildSlide` 메서드를 전면 교체한 슬림 오케스트레이터:

```
MobileImPptxInput (buildingId, tier, posture, grade, doc, broker, preset)
    │
    ▼
[1] Quality Gate (Grade & Tier 검증)
    │  • D등급 전면 차단
    │  • Pro 티어: B등급 이상 필수
    ▼
[2] PptxGenJS Canvas 초기화
    │  • LAYOUT_WIDE: 13.333" × 7.5" (16:9)
    │  • Margin M = 0.62", Content Width CW = 12.093"
    ▼
[3] Theme Resolution & Isolation
    │  • getPptxThemeAsync + withThemeIsolation
    │  • 동시 요청 간 색상/글꼴 오염 방지
    ▼
[4] Gallery Planning
    │  • resolvePhotos (역할별: cover, exterior, aerial, interior)
    │  • planGallerySlides → A14 갤러리 슬라이드
    ▼
[5] Deck Sequencing
    │  • buildDeckSequence: posture × tier × grade × incomeArchetype
    │  • 12~16장 권장, 불필요 슬라이드 자동 트림
    ▼
[6] Data Binding
    │  • bindSectionData / bindFromIMCore
    │  • 마크다운 → 아키타입 프롭스 변환
    ▼
[7] Archetype Rendering
    │  • SLIDE_ARCHETYPE_REGISTRY[spec.archetype]
    │  • 실패 시 addFallbackContent
    ▼
[8] Text Budget & Bounds Validation
    │  • validateTextBudgets, assertBounds
    ▼
[9] PptxGenJS write (nodebuffer)
    │
    ▼
Output: { buffer, slideCount, warnings }
```

### 1.2 테마 고립화 (Thread Safety)

**파일**: [`pptx-theme.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/pptx-theme.ts), [`imlib.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/imlib.ts)

`withThemeIsolation(theme, async () => { ... })`:
- 글로벌 스코프에 팔레트 토큰(`C`=밝은색, `CD`=어두운색, `KR`/`TITLE_KR`=타이포, `PV`=출처뱃지)을 동적 주입
- 완료 시 원래 값으로 리셋 → 멀티테넌트 스타일 번짐 방지

---

## 2. 덱 시퀀서 & 등급 게이트

**파일**: [`deck-sequencer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/deck-sequencer.ts)  
**함수**: `buildDeckSequence(input: DeckSequenceInput): SlideSpec[]`

### 2.1 등급별 슬라이드 범위

| 등급/티어 | 슬라이드 수 | 구성 |
|---|:---:|---|
| **Basic / C등급** | 7~11장 | A01 표지 → A14 사진 → A02 요약 → A06 입지 → 포스처 본문 → A04 제원 → A10 마감 |
| **Pro / A-B등급** | 최대 16장 | 17개 아키타입 동적 배치 |
| **D등급** | 0장 | `[G30] D등급은 발행할 수 없습니다` — 전면 차단 |

### 2.2 슬라이드 트리밍 규칙
- 필수 12장, 권장 16장
- 초과 시 선택적 슬라이드 제거 (단, `risk_check`, `closing`, `legal` 슬라이드는 보호)

---

## 3. 데이터 바인딩 & 마크다운 파싱

**파일**: [`data-binder.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/data-binder.ts)  
**함수**: `bindSectionData`, `bindFromIMCore`

### 3.1 핵심 기능
1. **마크다운 → 구조화 데이터**: `parseMarkdownTable`, 메트릭 추출, 서술/불릿 분리
2. **아키타입별 프롭스 변환**: `transformForArchetype`
3. **페르소나 제거**: `sanitizePersona` (정규식 기반)
4. **마크다운 스트리핑**: `stripMarkdown` (볼드/이탤릭/헤딩 마크다운 태그 제거)
5. **결손 라우팅**: 미확인 데이터(`확인 필요`, `조회 미완료`)를 체크리스트 슬라이드(A18)로 자동 라우팅
6. **결함 마스킹**: `NaN`, `undefined`, `null`, `[object Object]`를 `[확인 필요]`로 정규식 치환

### 3.2 서술형 vs 구조형 분리 (비중복 원칙 지원)
- 연속 텍스트 문단 → 리드 콜아웃 / Value Proposition 블록으로 라우팅
- `항목: 값` 형태의 불릿 → 구조화 테이블/스탯 카드로 라우팅
- 동일 문자열이 양쪽 패널에 동시 출현하지 않도록 분리

---

## 4. 18종 슬라이드 아키타입

**디렉터리**: `src/domain/building/mobile-im/pptx/archetypes/`

| 아키타입 | 명칭 | 레이아웃 | 주요 용도 |
|:---:|---|---|---|
| **A01** | Cover | 전면 | 타이틀, 서브타이틀, 자산 태그, 히어로 이미지, 브로커 로고, 문서번호 |
| **A02** | Stat Grid | 전면 | 리드 문구 + 4~8개 KPI 카드 (2~4 컬럼 그리드) |
| **A03** | Large Table | 전면 | 렌트롤 / 매매사례 비교 대형 테이블 + WALE 트래픽라이트 콜아웃 |
| **A04** | Asymmetric 7:5 | 좌 7.5" : 우 사진 | 좌: 물리 제원/서사, 우: 외관 사진 + 2개 하이라이트 콜아웃 |
| **A05** | Asymmetric 7:4 / 3-Col KPI | 상/하 분할 | 상단 3단 지표 + 하단 전폭 투자 가치 콜아웃 |
| **A06** | Diagram / Map | 좌 지도 : 우 리스트 | 좌: POI 오버레이 지도, 우: 교통/접근성 핵심 포인트 |
| **A07** | Three Block | 3단 수직 | 물리적/임대/재무 리스크 완화 카드 |
| **A08** | Dual Table | 2단 비교 | 자가 vs 임차, 비용 구조 비교 |
| **A09** | Process | 스텝 | 거래 로드맵 + 타임라인 |
| **A10** | Closing | 전면 | 법적 면책조항, 문서번호, 9종 출처 뱃지 정의 |
| **A11** | Room Specs | 테이블 | 호실별 사양 (호텔/물류) |
| **A12** | Ownership | 테이블 | 소유권 구조 / 체크리스트 |
| **A13** | Operating KPI | 그리드 | 호텔 ADR/OCC/RevPAR/GOP 대시보드 |
| **A14** | Gallery | 그리드 | 사진 갤러리 (cover, exterior, aerial, interior) |
| **A15** | 4-Pillar Thesis | 4단 | 투자 논거 4대 축 |
| **A16** | Capital Structure | 도넛 | LTV, DSR, 역레버리지 경고 |
| **A17** | Pre-Completion | 스택 | 준공전 마케팅 스택 |
| **A18** | Deficiency Checklist | 리스트 | 미확인/미제출 데이터 체크리스트 |

---

## 5. 비중복 렌더링 원칙 구현

**규칙 출처**: `AGENTS.md` §3 (PPTX 슬라이드 비중복 렌더링 원칙)

### 5.1 원칙
> 좌/우 분할 레이아웃(A04, A05, A06 등)에서 좌측 영역과 우측 카드에 **동일한 텍스트/불릿 항목을 중복 나열하지 않는다**.

### 5.2 적용 대상 아키타입
- **A04 (Asymmetric 7:5)**: 좌측 = 물리 제원 테이블 / 우측 = 외관 사진 + 투자 하이라이트
- **A05 (Asymmetric 7:4)**: 상단 = 3개 요약 지표 / 하단 = 가치 제안 콜아웃
- **A06 (Diagram/Map)**: 좌측 = 위치 지도 / 우측 = 접근성 포인트
- **A15 (4-Pillar Thesis)**: 4개 독립 투자 축

### 5.3 구현 메커니즘
**파일**: `data-binder.ts` — `transformForArchetype`

1. 서술형 문장(연속 텍스트)과 구조형 불릿(`항목: 값`)을 정규식으로 분류
2. **서술형** → 좌측 Value Proposition 리드 또는 콜아웃 텍스트
3. **구조형** → 우측 스탯 카드 / KPI 테이블
4. 동일 문자열의 양쪽 동시 출현을 원천 방지

---

## 6. 텍스트 예산 & 물리적 경계 제약

**파일**: [`text-budget.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/text-budget.ts)

### 6.1 텍스트 예산 (`TEXT_LIMITS`)

| 요소 | 최대 길이 | 비고 |
|---|:---:|---|
| `slideTitle` | 32자 | — |
| `kicker` | 32자 | — |
| `subTitle` | 50자 | — |
| `subHeading` | 35자 | — |
| `leadSentence` | 100자 | 메인 리드 문구 |
| `statLabel` | 18자 | 초과 시 9.5pt → 8.0pt 자동 스케일 |
| `statValue` | 10자 | 또는 정규식 숫자 추출 |
| `statSub` | 27자 | 보조 설명 |
| `calloutTitle` | 30자 | — |
| `tableHeader` | 16자 | — |
| `tableCell` | 27자 | — |
| `note` | 140자 | — |

### 6.2 한국어 CJK 문자 폭 계산
```
characters_per_line = 0.19 × (10 / fontSize) inches
```
- CJK 문자가 라틴 문자보다 넓은 점을 명시적으로 반영

### 6.3 스마트 절삭 (Smart Truncation)

**함수**: `enforceTextBudget`

- 단어 중간이 아닌 **한국어 문장 종결부**에서 절삭:
  - `. `, `다.`, `요.`, `임.`, `함.`
- 절삭 시 `...` 접미사 추가

### 6.4 물리적 안전 경계 (Safe Bounds)

**함수**: `assertBounds`

| 축 | 제한 | 공차 |
|:---:|---|:---:|
| X + W | ≤ 12.713" | ±0.05" |
| Y + H | ≤ 6.75" | ±0.05" |

위반 시 경고 로그 발생 (렌더링은 계속 진행)

### 6.5 이미지 처리
- `sizing: { type: 'contain' }` — 비율 왜곡 방지, 제로 크롭
- 건축 비율 유지가 상업용 부동산 프레젠테이션에서 필수

---

## 7. 테마 & 프리셋 시스템

### 7.1 5종 빌트인 프리셋

| 프리셋 | 용도 |
|---|---|
| `golden_institutional` | 기관 투자자용 골든 테마 |
| `credeal_signature` | CREDEAL 시그니처 브랜드 |
| `executive_gold` | 임원 프레젠테이션용 |
| `corporate_clean` | 기업 심플 테마 |
| `pro_dark_obsidian` | 프로 다크 테마 |

### 7.2 커스텀 프리셋
- `pptx_custom_presets` 테이블에서 사용자/회사별 커스텀 테마 관리
- **엔드포인트**: `GET /api/broker/pptx-preset`

### 7.3 테마 토큰
- `C`: 밝은 배경 팔레트
- `CD`: 어두운 배경 팔레트
- `KR`: 본문 한국어 글꼴
- `TITLE_KR`: 제목 한국어 글꼴
- `PV`: 출처 뱃지 색상
- **WCAG AA 명도 대비 검증** 적용

---

## 8. 폴백 & 에러 처리

### 8.1 아키타입 폴백 (`addFallbackContent`)

**파일**: `pptx-renderer.ts` L43-221

아키타입 빌더가 본문 렌더링에 실패한 경우:
1. 마크다운 헤딩 → 스타일드 텍스트 블록
2. 불릿 리스트 → 구조화 텍스트
3. 테이블 → PptxGenJS `addTable` 네이티브 렌더링
4. **[BL-5] 경고**: 폴백 발동 시 로깅

> [!CAUTION]
> **약점 W-PPTX-1**: A03(대형 테이블) 아키타입의 폴백은 **명시적으로 차단**됩니다. 복잡한 렌트롤을 불릿으로 대체하면 치명적 결함으로 간주되어 `[BL-5 BLOCK]` 경고가 발생합니다. 그러나 **차단 후 해당 슬라이드가 어떻게 처리되는지(빈 슬라이드 vs 제거)에 대한 명확한 코드 경로가 불확실**합니다.

### 8.2 결함 데이터 마스킹

**파일**: `data-binder.ts`

| 원본 | 치환 |
|---|---|
| `NaN` | `[확인 필요]` |
| `undefined` | `[확인 필요]` |
| `null` | `[확인 필요]` |
| `[object Object]` | `[확인 필요]` |
| `[인명 비공개]` | 제거 |
| `[연락처 비공개]` | 제거 |

### 8.3 데이터 완전성 게이트

**파일**: PPTX API `route.ts`

- `dataCompleteness.pptxExportAllowed === false` → Pro 요청 즉시 거부 (422)
- 건축물대장/공공데이터 필수 확보 검증

---

## 9. CRE 규칙 적용

### 9.1 페르소나 격리 (PPTX 전용)

**파일**: `data-binder.ts` — `sanitizePersona`

정규식으로 PPTX 헤더/타이틀/본문에서 타겟 페르소나 표현을 동적 제거:
```regex
/(?:60대|50대|40대|30대)\s*(?:자산가|투자자|대표)/gu
/(?:VIP|HNW)\s*(?:투자자|고객)/gu
/(?:법인\s*대표)\s*(?:맞춤|전용)/gu
```

**검증**: `src/tests/e2e/p0-pii-persona-scrub.test.ts`에서 포괄적으로 테스트

### 9.2 CRE 표준 용어 (PPTX 전용)

**파일**: `data-binder.ts` — `stripMarkdown`, [`basis-enforcer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/basis-enforcer.ts)

- `네이밍 라이츠` → `사옥 단독 명칭 표기(간판 설치권)`
- Cap Rate 라벨 → `enforceCapRateLabel`로 `NOI Cap Rate` 정규화
- GOP vs NOI 존재 여부 검증 → 오도성 데이터 방지

### 9.3 출처 뱃지 (9종)

**파일**: `imlib.ts`, `a10-closing.ts`

| 뱃지 | 의미 |
|---|---|
| `✓ 등기·대장` | 공적 장부 확인 |
| `✓ 공공데이터` | 정부 공공데이터 API |
| `● 현장확인` | 브로커 현장 실사 |
| `★ 전문가검증` | 전문가 리뷰 완료 |
| `✓ 원장확인` | 원본 대장 대조 |
| `▲ 매도인고지` | 매도인 직접 제공 |
| `● 중개인입력` | 브로커 수동 입력 |
| `◈ 파생계산` | 엔진 산출 |
| `◇ AI추정·가정` | AI 기반 추정치 |

---

## 10. AI 시각 E2E 테스트 파이프라인

**디렉터리**: `src/tests/e2e/`

### 10.1 테스트 케이스 (6종)

| # | 물건 | 포스처 | 아키타입 |
|:---:|---|---|---|
| 1 | 서초 의료타워 | `income` | R-INC-01 (안정 수익 표준) |
| 2 | 성수 IT밸리 | `owner_occupied` | 사옥형 표준 |
| 3 | 역삼 테헤란 개발부지 | `development` | 개발형 표준 |
| 4 | 신사 가로수길 밸류애드 | `trading` | 밸류애드 엣지 |
| 5 | 이천 물류허브 | `operating` | 운영형 표준 |
| 6 | 용산 구옥 혼합용도 | `trading` | 엣지 케이스 |

### 10.2 검증 파이프라인

```
[1] PPTX Binary 생성
    │
    ▼
[2] OpenXML 구조적 무결성 검사 (AdmZip)
    │  • ppt/slides/slide*.xml 추출
    │  • 런타임 토큰 탐지: >NaN<, >undefined<, >null<, [object Object]
    │  • 마크다운 찌꺼기: **bold**, ## heading, > quote, - bullet
    │  • 괄호 균형 검사 (bracket balance)
    │  • 비공개 플레이스홀더 잔존: [인명 비공개], [연락처 비공개]
    │  • 부적절 이모지 / 깨진 variation selector
    ▼
[3] 150 DPI 고해상도 PNG 캡처
    │  • LibreOffice + PyMuPDF 기반
    ▼
[4] 자동화 스코어카드 (e2e-ai-inspector.ts)
    │  • 커버 슬라이드 존재 검증
    │  • 메트릭 포매팅 검증 ([\d%])
    │  • 입지/리스크/논거 섹션 존재 확인
    │  • 빈 슬라이드 감지
    │  • 포스처별 기대 슬라이드 수 범위 검증 (3~10장)
    │  • 팩트 환각 검증 (미검증 WALE, 가공 대출금액 등)
    ▼
[5] HTML 스코어카드 출력 (ai_visual_e2e_report.html)
```

### 10.3 추가 테스트 매트릭스

| 테스트 | 검증 범위 |
|---|---|
| `p0-pii-persona-scrub.test.ts` | PII 및 페르소나 누출 방지 |
| `p2-accessibility.test.ts` | 접근성 경계 검증 |
| `p2-cross-platform.test.ts` | 크로스 플랫폼 호환성 |

---

## 11. API 라우트 & 배포

### 11.1 PPTX 다운로드 라우트

**파일**: `src/app/api/public/im-lite/[buildingId]/pptx/route.ts`

| 항목 | 사양 |
|---|---|
| **메서드** | `GET` |
| **인증** | 공개 (Rate Limit 적용) |
| **Rate Limit** | IP당 10회/시간 |
| **응답 방식** | Supabase `Exports` 버킷에 업로드 → 임시 Signed URL (302 리다이렉트) |
| **직접 다운로드 폴백** | 버퍼 직접 반환 + 커스텀 헤더(`X-Slide-Count`, `X-File-Size`, `X-Warnings`) |

### 11.2 Pro 티어 PPTX

**파일**: `src/app/api/public/im-pro/[grantId]/pptx/route.ts`

- `grantId` 기반 인증
- 데이터 완전성 게이트 추가 적용

---

## 12. 약점 및 우려 사항 종합

### 🔴 Critical

| ID | 제목 | 위치 | 설명 |
|---|---|---|---|
| **W-PPTX-1** | A03 폴백 차단 후 슬라이드 처리 불명확 | `pptx-renderer.ts` L43-221 | 대형 테이블 렌더링 실패 시 BL-5 BLOCK 발생하나, 해당 슬라이드가 빈 상태로 남는지 제거되는지 코드 경로 불분명 |

### 🟡 High

| ID | 제목 | 위치 | 설명 |
|---|---|---|---|
| **W-PPTX-2** | 폴백 콘텐츠의 바운딩 박스 오버플로 | `pptx-renderer.ts` addFallbackContent | 아키타입 간격 규칙을 우회하므로, 비정상적으로 긴 LLM 출력 시 안전 영역 초과 가능 |
| **W-PPTX-3** | 텍스트 절삭으로 인한 정보 손실 | `text-budget.ts` enforceTextBudget | 중요 정보가 문장 끝에 있을 경우 `...`으로 잘려 브로커가 인지하지 못할 위험 |
| **W-PPTX-4** | 페르소나 정규식 커버리지 한계 | `data-binder.ts` sanitizePersona | LLM이 미등록 변형("고자산 은퇴자용", "MZ 투자자 맞춤")을 생성하면 정규식 미포착 → 페르소나 태그 누출 |

### 🟢 Medium

| ID | 제목 | 위치 | 설명 |
|---|---|---|---|
| **W-PPTX-5** | CRE 용어 정규식 기반의 한계 | `data-binder.ts` stripMarkdown | 새로운 외래어 오용(예: "테넌트 인센티브") 등록이 수동적 |
| **W-PPTX-6** | 갤러리 슬라이드 사진 부재 시 빈 슬라이드 | `gallery-planner.ts` | 사진이 0장이면 A14 갤러리가 빈 프레임으로 렌더링될 수 있음 |
| **W-PPTX-7** | 슬라이드 수 하드리밋 없음 | `deck-sequencer.ts` | 극단적인 데이터 조합에서 16장 권장치를 초과할 이론적 가능성 |
