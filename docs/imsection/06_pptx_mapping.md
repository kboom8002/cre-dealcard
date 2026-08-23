# PPTX 매핑: 모바일 IM → 슬라이드 변환 아키텍처

> **범위**: 섹션 데이터 → 슬라이드 시퀀스 결정 → 데이터 바인딩 → 렌더링
> **모듈 위치**: `src/domain/building/mobile-im/pptx/`

---

## 1. PPTX 모듈 구조

| 파일 | 바이트 | 역할 |
|:---|---:|:---|
| [`pptx-renderer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/pptx-renderer.ts) | 23,942 | PPTX 렌더링 오케스트레이터 |
| [`deck-sequencer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/deck-sequencer.ts) | 12,282 | posture × grade × tier 슬라이드 시퀀스 |
| [`data-binder.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/data-binder.ts) | 61,438 | 섹션 마크다운 → 슬라이드 데이터 매핑 |
| [`imlib.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/imlib.ts) | 39,251 | PPTX XML 생성 라이브러리 |
| [`pptx-theme.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/pptx-theme.ts) | 10,882 | 색상·폰트·간격 테마 정의 |
| [`gallery-planner.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/gallery-planner.ts) | 9,254 | 사진 갤러리 슬라이드 레이아웃 |
| [`text-budget.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/text-budget.ts) | 2,811 | 텍스트 글자 수 예산 관리 |
| [`basis-enforcer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/basis-enforcer.ts) | 1,792 | Cap Rate 산출 기초 명시 |
| [`provenance-mapper.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/provenance-mapper.ts) | 1,365 | 출처 배지 → PPTX 아이콘 매핑 |

---

## 2. 슬라이드 시퀀스 결정 (`deck-sequencer.ts`)

### 2.1 입력 파라미터

```typescript
interface DeckSequenceInput {
  posture: InvestmentPosture;  // income | development | ...
  tier: PptxTier;              // 'basic' | 'pro'
  grade: Grade;                // 'A' | 'B' | 'C' | 'D'
  incomeArchetype?: IncomeArchetype; // R-INC-01 ~ R-INC-04
  hasViolation?: boolean;      // 위반건축물 여부
  hasJointCollateral?: boolean; // 공동담보
  hasPhotos?: boolean;         // 사진 유무
  gallerySpecs?: GallerySlideSpec[];
}
```

### 2.2 등급별 슬라이드 규칙

| 등급 | Basic | Pro |
|:---:|:---|:---|
| **D** | 최소 3+1 슬라이드 (표지+요약+프로세스+면책) | ❌ **차단** |
| **C** | 7~10 슬라이드 | 7~10 슬라이드 |
| **B** | 10 슬라이드 | 12~15 슬라이드 |
| **A** | 10 슬라이드 | 15+ 슬라이드 (DCF, Comps, 상세 포함) |

### 2.3 아키타입 슬라이드 코드표 (A01~A15)

| 코드 | 용도 | 레이아웃 |
|:---:|:---|:---|
| **A01** | 표지 (Cover) | 좌: 타이틀+가격+중개사, 우: 히어로 사진 |
| **A02** | 핵심요약 (Summary) | 좌: 서사 리드문, 우: 4대 지표 카드 + 3대 핵심 포인트 |
| **A03** | 렌트롤 / 비교사례 | 전면 테이블 (층별 임대차 또는 거래 비교) |
| **A04** | 건물 개요 / 토지 / 사용계획 | 좌: 스펙 테이블, 우: 사진 + 하이라이트 |
| **A05** | 수익분석 / 개발개요 / 매출 | 3열 카드 + 하단 투자가치제안 |
| **A06** | 입지 (Location) | 좌: 지도 이미지, 우: 4행 분석 테이블 |
| **A07** | 리스크 (Risk) | 불릿 리스트 + 등급 배지 |
| **A08** | 자가 vs 임차 비교 | 비용 비교 테이블 |
| **A09** | 프로세스 (Next Steps) | 3단계 STEP 카드 |
| **A10** | 면책 (Disclaimer) | 출처 5단계 + 면책 조항 + 엔딩 |
| **A13** | 운영 KPI (Operating) | KPI 카드 (ADR, OCC, RevPAR) |
| **A14** | 갤러리 (Photos) | 사진 그리드 레이아웃 |
| **A15** | 종합 가치 제안 (Thesis) | 3대 카드 + 서사 결론 |

---

## 3. 데이터 바인딩 (`data-binder.ts`)

### 3.1 역할

슬라이드 아키타입 코드 + IM 섹션 마크다운 → PPTX 텍스트 프레임 데이터 매핑:
- 마크다운 파서로 테이블·불릿·헤딩 추출
- 수치 포맷팅 (억원, %, 평)
- 텍스트 예산 관리 (`text-budget.ts`) — 슬라이드 오버플로 방지
- 사진 URL → 이미지 바이너리 다운로드

### 3.2 핵심 바인딩 매핑 (income Basic 기준)

| 슬라이드 | dataKey | 바인딩 소스 |
|:---|:---|:---|
| A01 cover | `cover` | SSoT 타이틀, 매매가, 중개사 정보, 히어로 사진 |
| A02 summary | `summary` | heroCard (4대 지표), buyerFit.fit_points (3대 포인트) |
| A06 location | `location` | location_access 섹션 + mapImageUrl |
| A04 building | `building` | property_overview 섹션 + 건축물대장 스펙 테이블 |
| A03 rentRoll | `rentRoll` | lease_status 섹션 + floor_leases 결정론적 테이블 |
| A05 profit | `profit` | income_analysis 섹션 + financials 계산 |
| A07 risk | `risk` | risk_check 섹션 + 등급 배지 |
| A15 thesis | `thesis` | investment_thesis 섹션 + 3대 카드 |
| A09 process | `process` | next_steps 섹션 + 3단계 STEP |
| A10 closing | `closing` | 면책 + 출처 5단계 + 중개법인명 |

---

## 4. PPTX 테마 (`pptx-theme.ts`)

### 4.1 색상 팔레트

| 역할 | 색상 코드 | 용도 |
|:---|:---|:---|
| Primary | `#6B7D1A` (올리브 그린) | 헤딩, 키커, 액센트 |
| Text | `#333333` (다크 그레이) | 본문 텍스트 |
| Background | `#FFFFFF` (화이트) | 슬라이드 배경 |
| Card BG | `#F8F9FA` (라이트 그레이) | 카드 배경 |
| CTA BG | `#F0F4E0` (연한 올리브) | 투자가치제안 배경 |
| Closing BG | `#1A2634` (네이비) | 면책 슬라이드 배경 |

### 4.2 텍스트 스타일

| 역할 | 폰트 | 크기 | 굵기 |
|:---|:---|:---:|:---|
| 슬라이드 타이틀 | Pretendard | 28pt | Bold |
| 키커 | Pretendard | 12pt | SemiBold |
| 카드 제목 | Pretendard | 16pt | Bold |
| 본문 | Pretendard | 11pt | Regular |
| 수치 (대형) | Pretendard | 32pt | Bold |

---

## 5. 갤러리 슬라이드 (`gallery-planner.ts`)

[`gallery-planner.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/gallery-planner.ts) — 9,254 바이트:

### 5.1 사진 카테고리별 슬라이드 분할

| 카테고리 그룹 | 슬라이드 타이틀 | 최대 사진 수 |
|:---|:---|:---:|
| `exterior_front`, `exterior_side` | 건물 외관 | 4 |
| `entrance`, `lobby` | 로비·입구 | 4 |
| `floor_plan`, `interior` | 내부·평면도 | 4 |
| `aerial`, `rooftop` | 항공/옥상 | 4 |
| `surroundings`, `signage` | 주변·간판 | 4 |

### 5.2 레이아웃 규칙

- 1장: 전면 중앙 배치
- 2장: 좌우 50/50 분할
- 3장: 상1 + 하2 레이아웃
- 4장: 2×2 그리드

---

## 6. 출처 매핑 (`provenance-mapper.ts`)

| 소스 | 아이콘 | 라벨 |
|:---|:---|:---|
| `public_data` | ✔ | 공부확인 |
| `expert_verified` | ★ | 전문가검증 |
| `broker_input` (매도인) | ▲ | 매도인고지 |
| `broker_input` (중개인) | ● | 중개인입력 |
| `ai_inferred` | ◇ | AI추정·가정 |

---

## 7. 텍스트 예산 관리 (`text-budget.ts`)

[`text-budget.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/text-budget.ts) — 2,811 바이트:

### 7.1 슬라이드별 텍스트 한도

| 영역 | 최대 글자 수 | 초과 시 |
|:---|:---:|:---|
| 카드 제목 | 20자 | 줄임표 처리 |
| 카드 본문 | 80자 | 2줄 제한 + 줄임표 |
| 서사 텍스트 | 200자 | 3줄 제한 |
| 테이블 셀 | 30자 | 줄바꿈 |
| 불릿 항목 | 60자 | 줄바꿈 |

> ⚠️ **오버플로 방지**: 텍스트 예산 초과 시 줄임표(`…`) 또는 줄바꿈 처리하여 슬라이드 레이아웃 깨짐 방지

---

## 8. Cap Rate 산출 기초 명시 (`basis-enforcer.ts`)

[`basis-enforcer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/basis-enforcer.ts) — 1,792 바이트:

- PPTX에서 Cap Rate를 표기할 때 **반드시 산출 기초를 명시**
- 예: "2.03% (현행 임대료 기준)" 또는 "3.45% (정상화 임대료 기준)"
- 기초 누락 시 자동으로 "(현행 임대료 기준)" 추가

---

## 9. PPTX 비중복 렌더링 원칙 (`.agents/AGENTS.md` 규칙)

> **좌/우 분할 레이아웃(A04, A05 등)에서 좌측 영역과 우측 카드에 동일한 텍스트/불릿 항목을 중복 나열하지 않습니다.**

| 영역 | 내용 범위 |
|:---|:---|
| **좌측** | 자산 가치 제안(Value Proposition) 리드문 및 거시적 투자 배경 서사 |
| **우측** | 3~4대 핵심 투자 포인트 및 지표 카드 |

> **검증**: E2E 테스트의 AI 시각 분석에서 좌/우 중복 여부를 자동 체크
