# CRE DealCard — AI API 전수 감사 및 비용 최적화 전략

> **문서 버전**: v1.0  
> **작성일**: 2026-08-17  
> **기준 환율**: $1.00 = ₩1,380

---

## 목차

1. [AI 모델 아키텍처 개요](#1-ai-모델-아키텍처-개요)
2. [전수 AI API 사용처 감사](#2-전수-ai-api-사용처-감사)
3. [외부 OpenAPI 연동 현황](#3-외부-openapi-연동-현황)
4. [핵심 기능별 건당 API 원가 분석](#4-핵심-기능별-건당-api-원가-분석)
5. [중개인 1인당 월간 API 비용 산출](#5-중개인-1인당-월간-api-비용-산출)
6. [모델 캐스케이딩 최적화 전략](#6-모델-캐스케이딩-최적화-전략)
7. [비즈니스 임팩트 및 결론](#7-비즈니스-임팩트-및-결론)

---

## 1. AI 모델 아키텍처 개요

### 1.1 3-Tier 모델 셀렉터 구조

프로젝트는 `src/ai/model-selector.ts`를 통해 **3계층(Tier) 중앙 집중 모델 관리** 아키텍처를 채택하고 있습니다. 모든 AI 에이전트는 반드시 `getModel()` 함수를 통해 모델 슬러그를 할당받으며, 환경변수로 런타임 오버라이드가 가능합니다.

```typescript
// src/ai/model-selector.ts
export type ModelTier = "sol" | "terra" | "luna";

export function getModel(tier: ModelTier = "terra"): string {
  switch (tier) {
    case "sol":   return process.env.AI_MODEL_SOL   || "gpt-5.6-sol";
    case "terra": return process.env.AI_MODEL_TERRA  || "gpt-5.6-terra";
    case "luna":  return process.env.AI_MODEL_LUNA   || "gpt-5.6-luna";
  }
}
```

### 1.2 계층별 사양 및 단가

| 계층 | 환경변수 | 기본 모델 슬러그 | 실질 매핑 모델 | Input (1M 토큰) | Output (1M 토큰) | 설계 용도 |
|:---|:---|:---|:---|---:|---:|:---|
| **Sol** (플래그십) | `AI_MODEL_SOL` | `gpt-5.6-sol` | `gpt-4o` / `o3-mini` 급 | **$2.50** (₩3,450) | **$10.00** (₩13,800) | 복잡 추론, 멀티스텝 파이프라인 핵심 |
| **Terra** (밸런스) | `AI_MODEL_TERRA` | `gpt-5.6-terra` | `gpt-4o` / `claude-sonnet` 급 | **$2.00** (₩2,760) | **$8.00** (₩11,040) | IM 섹션 작성, 품질 검증, 콘텐츠 생성 |
| **Luna** (경량) | `AI_MODEL_LUNA` | `gpt-5.6-luna` | `gpt-4o-mini` / `gemini-flash` 급 | **$0.15** (₩207) | **$0.60** (₩828) | 분류, 파싱, 정규화, 구조화 추출 |
| **Embedding** | - | `text-embedding-3-small` | `text-embedding-3-small` (1536D) | **$0.02** (₩28) | **$0.00** (무료) | 벡터 유사도 매칭 |

### 1.3 LLM 클라이언트 인프라

| 구성요소 | 파일 위치 | 핵심 기능 |
|:---|:---|:---|
| **통합 LLM 클라이언트** | `src/ai/llm-client.ts` | Provider 레지스트리, 5회 지수 백오프 재시도, 인메모리 캐시 폴백 |
| **OpenAI Provider** | `src/ai/providers/openai.ts` | `OPENAI_API_KEY` 기반 실호출, AbortController 타임아웃 |
| **Mock Provider** | `src/ai/providers/mock-openai.ts` | 테스트 환경 전용 모의 응답 |
| **Embedding** | `src/ai/llm-client.ts` L100-109 | `text-embedding-3-small` (8,000자 제한) |

---

## 2. 전수 AI API 사용처 감사

### 2.1 핵심 비즈니스 파이프라인 (6개)

| # | 기능명 | 에이전트 파일 | 모델 계층 | callLLM 호출 횟수 | 비고 |
|:---:|:---|:---|:---:|:---:|:---|
| 1 | **매물 메모 분석 & 딜카드 생성** | `src/ai/agents/broker-deal-card.ts` | `Sol` × 3 | 3회 (MemoParser → MiniTruth → BlindTeaser) | 핵심 수익화 기능 |
| 2 | **모바일 IM 7-Section 생성** | `src/domain/building/mobile-im/im-section-generator.ts` | `Terra` × 7+ | 7~9회 (섹션 생성 + Judge + QualityGate) | 최대 비용 발생 구간 |
| 3 | **PPTX IM 14-Slide 생성** | `src/domain/building/mobile-im/pptx/pptx-renderer.ts` | 없음 (서버 렌더링) | 0회 | pptxgenjs 기반, AI 미사용 |
| 4 | **AI 매수자-매물 매칭** | `src/domain/matching/matching-engine.ts` | `Embedding` | 2회 (건물+인텐트 임베딩) | Hard Filter → 벡터 유사도 → 앙상블 |
| 5 | **가상 AI 매수자 페르소나** | `src/ai/agents/ideal-buyer-persona.ts` | `Sol` | 1회 | 3인 페르소나 동시 생성 |
| 6 | **렌트롤 자연어 텍스트 파싱** | `src/app/api/broker/rent-roll/parse-text/route.ts` | `Luna` | 1회 | 모바일 IM 작성 과정에서 호출 |

### 2.2 보조 AI 에이전트 (11개)

| # | 기능명 | 에이전트 파일 | 모델 계층 | 호출 횟수 |
|:---:|:---|:---|:---:|:---:|
| 7 | 건물 스냅샷 분석 | `src/ai/agents/BuildingSnapshotAgent.ts` | `Terra` | 1회 |
| 8 | 바이어 인텐트 정규화 | `src/ai/agents/buyer-intent-normalizer.ts` | `Luna` | 1회 |
| 9 | 바이어 메모 작성기 | `src/ai/agents/buyer-memo-writer.ts` | `Terra` | 1회 |
| 10 | 캠페인 카피라이팅 | `src/ai/agents/campaign-copy-agent.ts` | `Terra` | 1~3회 (A/B 테스트) |
| 11 | 호기심 유발 리포트 | `src/ai/agents/deal-curiosity-writer.ts` | `Terra` | 1회 |
| 12 | 펀딩 프로젝트 카드 | `src/ai/agents/funding-project-card.ts` | `Terra` | 2회 (파싱 + 티저) |
| 13 | 문의 자격 심사 | `src/ai/agents/inquiry-qualifier-agent.ts` | `Luna` | 1회 |
| 14 | 투자자 프로필 정규화 | `src/ai/agents/investor-profile-normalizer.ts` | `Luna` | 1회 |
| 15 | 임대차 딜카드 생성 | `src/ai/agents/lease-deal-card.ts` | `Sol` × 3 | 3회 |
| 16 | 임차인 적합도 분석 | `src/ai/agents/tenant-fit-agent.ts` | `Terra` | 1회 |
| 17 | 스케줄 조율 어드바이저 | `src/ai/agents/schedule-advisor.ts` | `Terra` | 1회 |

### 2.3 콘텐츠 및 마케팅 AI (4개)

| # | 기능명 | 파일 위치 | 모델 계층 | 호출 횟수 |
|:---:|:---|:---|:---:|:---:|
| 18 | 위클리 매거진 생성 | `src/domain/magazine/weekly-generator.ts` | `Terra` | 2회 (메타 + 본문) |
| 19 | 시장 펄스(Oiticle) 기사 | `src/domain/pulse/oiticle-generator.ts` | `Terra` | 2회 (메타 + 본문) |
| 20 | 뉴스/시장 크롤러 요약 | `src/domain/external/market-crawlers.ts` | `Terra` | 3~5회 |
| 21 | 네이버 감성 분석 | `src/domain/external/naver-search.ts` | `Terra` | 2회 (요약 + 감성) |

### 2.4 품질 검증 파이프라인 (IM 전용, 3개)

| # | 기능명 | 파일 위치 | 모델 계층 | 호출 횟수 |
|:---:|:---|:---|:---:|:---:|
| 22 | LLM-as-Judge 품질 심사 | `src/domain/building/mobile-im/im-judge.ts` | `Terra` | 1~3회 (신뢰도 기준 선택적) |
| 23 | CRE Quality Gate | `src/domain/building/mobile-im/cre-quality-gate.ts` | `Terra` | 1회 |
| 24 | 용어 정규화 | `src/domain/building/mobile-im/terminology-normalizer.ts` | `Luna` | 비동기 1회 |

---

## 3. 외부 OpenAPI 연동 현황

| 서비스 | 환경변수 | 용도 | 요금제 |
|:---|:---|:---|:---|
| **국토교통부 실거래가 / 공시지가 / 건축물대장** | `DATA_GO_KR_API_KEY`, `MOLIT_API_KEY` | PNU 기반 공적 장부 데이터 조회 | **무료** (일 10만건) |
| **행정안전부 도로명주소 API** | `JUSO_CONFIRM_KEY` | 주소 정제 및 PNU 변환 | **무료** |
| **네이버 검색 API** | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 지역 부동산 뉴스/카페 크롤링 | **무료** (일 25,000건) |
| **한국언론진흥재단 빅카인즈** | `BIGKINDS_ACCESS_KEY` | 상업용 부동산 기사 수집 | **무료** |
| **소상공인 상권분석 API (SEMAS)** | `SEMAS_API_KEY` | 유동인구/업종 밀집도 분석 | **무료** |
| **건물에너지효율등급 API** | `ENERGY_API_KEY` | 에너지 효율 등급 조회 | **무료** |
| **YouTube Data API v3** | `YOUTUBE_API_KEY` | 부동산 동영상 콘텐츠 수집 | **무료** (일 10,000 units) |
| **Solapi 카카오 알림톡** | `SOLAPI_API_KEY`, `SOLAPI_API_SECRET` | 매수자 매칭 알림 발송 | **유료** (건당 약 8.5원) |

---

## 4. 핵심 기능별 건당 API 원가 분석

### 4.1 딜카드 생성 (`runBrokerDealCard`)

| 단계 | 역할 | 모델 | 예상 토큰 (In/Out) | 단가 (USD) | 단가 (KRW) |
|:---|:---|:---:|:---:|:---:|:---:|
| Step 1: MemoParser | 원본 메모 → 구조화 JSON 추출 | `Sol` | 1,500 / 600 | $0.0098 | 13.5원 |
| Step 2: MiniTruth | SSoT Lite 건물 진실 파생 | `Sol` | 2,300 / 800 | $0.0138 | 19.0원 |
| Step 3: BlindTeaser | 딜카드 후킹카피·딜포인트 생성 | `Sol` | 2,000 / 700 | $0.0120 | 16.6원 |
| 주소/PNU 지오코딩 | 공공 API 연동 | - | - | $0.0000 | 0.0원 |
| **합계** | | | **5,800 / 2,100** | **$0.0355** | **49.0원** |

### 4.2 모바일 IM 생성 (`generateSingleSection`)

| 구성 | 역할 | 모델 | 예상 토큰 (In/Out) | 단가 (USD) | 단가 (KRW) |
|:---|:---|:---:|:---:|:---:|:---:|
| 7대 섹션 생성 | 개요/입지/수익/투자가치/리스크/비교/총평 | `Terra` | 17,500 / 7,000 | $0.0910 | 125.6원 |
| LLM-as-Judge | 신뢰도 기반 품질 심사 (평균 1.5회) | `Terra` | 3,000 / 450 | $0.0096 | 13.2원 |
| CRE Quality Gate | 최종 규정 준수 검증 | `Terra` | 3,500 / 400 | $0.0102 | 14.1원 |
| **합계** | | | **24,000 / 7,850** | **$0.1108** | **152.9원** |

### 4.3 기타 핵심 기능

| 기능 | 모델 | 예상 토큰 (In/Out) | 1회 단가 (KRW) |
|:---|:---:|:---:|:---:|
| PPTX IM 생성 (14장) | 없음 (pptxgenjs) | 0 / 0 | **0.0원** |
| AI 매수자 매칭 (100명) | `Embedding` | 250 × 2 | **0.7원** |
| 가상 AI 페르소나 (3인) | `Sol` | 1,800 / 1,800 | **31.1원** |
| 렌트롤 자연어 파싱 | `Luna` | 400 / 400 | **0.41원** |
| 위클리 매거진 생성 | `Terra` × 2 | 3,000 / 1,500 | **24.8원** |
| 캠페인 카피라이팅 | `Terra` | 1,000 / 500 | **8.3원** |

---

## 5. 중개인 1인당 월간 API 비용 산출

### 5.1 기본 가정 (활성 중개인 프로파일)

| 활동 항목 | 월간 이용 횟수 |
|:---|:---:|
| 신규 매물 등록 & 딜카드 생성 | 20건 |
| 렌트롤 자연어 텍스트 파싱 (모바일 IM 연동) | 20건 |
| 가상 AI 페르소나 도출 | 20건 |
| AI 매수자 매칭 (매물당 100명) | 20건 |
| 모바일 IM 7-Section 생성 & 검증 | 20건 |
| PPTX IM 14-Slide 생성 & 다운로드 | 20건 |
| 위클리 매거진/모닝 브리핑 발행 | 8회 |
| 캠페인 카피 및 마케팅 문구 생성 | 10회 |

### 5.2 월간 세부 비용 명세표

| 항목 | AI 모델 | 단가 (1회) | 월 횟수 | 월 비용 (USD) | 월 비용 (KRW) |
|:---|:---|:---:|:---:|:---:|:---:|
| 딜카드 생성 | `Sol` × 3 | $0.0355 (49.0원) | 20회 | $0.710 | 980원 |
| 렌트롤 파싱 | `Luna` | $0.0003 (0.41원) | 20회 | $0.006 | 8.2원 |
| AI 페르소나 | `Sol` | $0.0225 (31.1원) | 20회 | $0.450 | 622원 |
| AI 매칭 | `Embedding` | $0.0005 (0.70원) | 20회 | $0.010 | 14원 |
| 모바일 IM | `Terra` × 7+ | $0.1108 (152.9원) | 20회 | $2.216 | 3,058원 |
| PPTX 생성 | 없음 | $0.0000 (0.0원) | 20회 | $0.000 | 0원 |
| 위클리 매거진 | `Terra` × 2 | $0.0180 (24.8원) | 8회 | $0.144 | 199원 |
| 캠페인 카피 | `Terra` | $0.0060 (8.3원) | 10회 | $0.060 | 83원 |
| 공공/지도 API | - | $0.0000 (0.0원) | 수시 | $0.000 | 0원 |
| **월간 총 AI 원가** | | | | **$3.596** | **₩4,964** |

### 5.3 부가 통신비 (선택)

| 항목 | 산출 | 월 비용 (KRW) |
|:---|:---|:---:|
| 카카오 알림톡 | 20건 × 적합 매수자 10명 = 200건 × 8.5원 | 1,700원 |
| **총 운영 원가 (AI + 통신)** | | **₩6,664** |

---

## 6. 모델 캐스케이딩 최적화 전략

### 6.1 핵심 메커니즘

**경량 모델(Luna) 우선 시도 → 품질/복잡도 기준 상위 모델(Terra/Sol)로 자동 에스컬레이션** 방식을 적용합니다.

```
[입력] → Luna (1차 시도, 비용 1/15)
           │
           ├── Zod 검증 + 신뢰도 ≥ 0.85 → ✅ 결과 반환 (약 85% 저비용 완료)
           │
           └── 검증 실패 / 복합 매물 → Terra 또는 Sol 에스컬레이션 (약 15%)
```

### 6.2 딜카드 파이프라인 캐스케이딩

| 단계 | 현재 | 개선 | 에스컬레이션 조건 | 절감율 |
|:---|:---:|:---:|:---|:---:|
| MemoParser | `Sol` (13.5원) | **`Luna` → Sol** | Zod 오류 또는 `ambiguousFields ≥ 2` | **-91%** |
| MiniTruth | `Sol` (19.0원) | **`Terra` → Sol** | 복합 자산 (호텔/개발지/STO) | **-40%** |
| BlindTeaser | `Sol` (16.6원) | **`Terra`** | 충분한 성능으로 상향 불필요 | **-35%** |
| **소계** | **49.0원** | **약 23.4원** | | **-52.2%** |

### 6.3 모바일 IM 섹션별 모델 분리

| 섹션 분류 | 해당 섹션 | 현재 | 개선 | 근거 |
|:---|:---|:---:|:---:|:---|
| **정형/기술** (3개) | property_overview, location_access, risk_considerations | `Terra` | **`Luna`** | 공부 데이터 기반 정형 서술 |
| **심층 분석** (4개) | income_analysis, investment_highlights, comparable_market, executive_summary | `Terra` | **`Terra` 유지** | 컨설팅 톤 심층 분석 필요 |
| **품질 검증** (2개) | im-judge, cre-quality-gate | `Terra` | **`Luna`** | 채점/위반항목 검출은 경량 모델 충분 |

### 6.4 기타 에이전트 최적화

| 기능 | 현재 | 개선 | 절감율 |
|:---|:---:|:---:|:---:|
| 가상 AI 페르소나 | `Sol` (31.1원) | **`Terra`** (15.6원) | -50.0% |
| 캠페인 카피 | `Terra` (8.3원) | **`Luna`** (2.5원) | -70.0% |
| 위클리 매거진 | `Terra` × 2 (24.8원) | **`Luna`(요약) + `Terra`(본문)** (15.0원) | -40.0% |

### 6.5 프롬프트 캐싱 추가 최적화

시스템 프롬프트(지침, CRE 용어 사전, Golden Few-shot 예시)를 프롬프트 앞부분에 **고정 배치(Prefix Caching)** 하여 Input 토큰 비용을 추가 50~80% 할인 적용 가능.

### 6.6 캐스케이딩 전/후 월간 비용 비교

| 항목 | 기존 (KRW) | 캐스케이딩 적용 (KRW) | 절감액 | 절감율 |
|:---|---:|---:|---:|:---:|
| 딜카드 생성 (20건) | 980 | 468 | -512 | -52.2% |
| 렌트롤 파싱 (20건) | 8 | 8 | 0 | - |
| AI 페르소나 (20건) | 622 | 312 | -310 | -50.0% |
| AI 매칭 (20건) | 14 | 14 | 0 | - |
| 모바일 IM (20건) | 3,058 | 1,370 | -1,688 | -55.2% |
| PPTX (20건) | 0 | 0 | 0 | - |
| 위클리 매거진 (8회) | 199 | 120 | -79 | -40.0% |
| 캠페인 카피 (10회) | 83 | 25 | -58 | -70.0% |
| **월간 AI 원가 합계** | **₩4,964** | **₩2,317** | **-₩2,647** | **-53.3%** |
| **프롬프트 캐싱 포함** | - | **₩1,730** | **-₩3,234** | **-65.1%** |

### 6.7 소스코드 반영 로드맵

| 순서 | 대상 파일 | 변경 내용 | 영향도 |
|:---|:---|:---|:---:|
| 1 | `src/ai/agents/broker-deal-card.ts` | MemoParser `Sol` → `Luna` + Zod 실패 시 `Sol` fallback | 높음 |
| 2 | `src/domain/building/mobile-im/im-section-generator.ts` | 섹션 타입별 모델 매핑 분리 (정형 → Luna, 심층 → Terra) | 높음 |
| 3 | `src/domain/building/mobile-im/im-judge.ts` | `JUDGE_MODEL` → `getModel("luna")` | 중간 |
| 4 | `src/domain/building/mobile-im/cre-quality-gate.ts` | `GATE_MODEL` → `getModel("luna")` | 중간 |
| 5 | `src/ai/agents/ideal-buyer-persona.ts` | `Sol` → `Terra` | 낮음 |
| 6 | `src/ai/agents/campaign-copy-agent.ts` | `Terra` → `Luna` | 낮음 |
| 7 | `src/ai/llm-client.ts` | 프롬프트 캐싱 키 전략 최적화 | 중간 |

---

## 7. 비즈니스 임팩트 및 결론

### 7.1 원가 구조 요약

```
┌──────────────────────────────────────────────────────────────┐
│  [현재] 중개인 1인당 월 순수 AI API 원가  : ₩4,964 ($3.60)    │
│  [최적화 후] 캐스케이딩 + 캐싱 적용       : ₩1,730 ($1.25)    │
│  [절감 효과]                              : -65.1%            │
│                                                              │
│  [알림톡 포함 총 운영 원가]                                    │
│   현재: ₩6,664 → 최적화 후: ₩3,430                           │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 SaaS 구독료 대비 마진율

| 시나리오 | 월 구독료 | 월 원가 (최적화 전) | 마진율 (전) | 월 원가 (최적화 후) | 마진율 (후) |
|:---|:---:|:---:|:---:|:---:|:---:|
| 기본 플랜 | ₩59,000 | ₩6,664 | 88.7% | ₩3,430 | **94.2%** |
| 프로 플랜 | ₩99,000 | ₩6,664 | 93.3% | ₩3,430 | **96.5%** |

### 7.3 핵심 인사이트

1. **압도적 마진 구조**: 최적화 전에도 88%+ 마진이며, 캐스케이딩 적용 시 95%에 육박
2. **비용 집중점**: 전체 비용의 62%가 모바일 IM 생성에 집중 → 캐스케이딩의 최대 효과 구간
3. **PPTX는 0원**: pptxgenjs 서버 렌더링으로 AI 비용 무발생 — 차별화 포인트
4. **공공 API 무료 티어**: 대한민국 공공 데이터 인프라 활용으로 외부 데이터 비용 0원

---

*본 문서는 2026-08-17 기준 OpenAI 공식 단가를 기반으로 작성되었습니다. 모델 버전 업데이트 및 프라이싱 변경 시 갱신이 필요합니다.*
