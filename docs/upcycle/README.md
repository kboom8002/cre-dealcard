# CRE DealCard → 수출 중소기업 플랫폼 전이(Upcycle) 개발 보고서

> **최초 작성일**: 2026-09-26  
> **원본 시스템**: CRE DealCard (`cre-dealcard`)  
> **분석 범위**: 3가지 타겟 시장 시나리오별 전이 가능성 분석  

---

## 📑 보고서 목차

| # | 문서 | 시나리오 | 전이 효율 | 예상 공수 |
|:---|:---|:---|:---|:---|
| 01 | [OEM 매칭 플랫폼](./01-oem-matching-platform.md) | K-뷰티 OEM/ODM 공장 ↔ 해외 바이어 매칭 | ~60% 재사용 | 18주 |
| 02 | [수출 에이전트 플랫폼](./02-export-agent-platform.md) | 제조기업 수출 AI 비서 SaaS | ~55% 재사용 | 20주 |
| 03 | [유통 큐레이션 플랫폼](./03-distribution-curation-platform.md) | 유통사 맞춤 상품 큐레이션 + 카탈로그 | ~65% 재사용 | 16주 |
| 04 | [루브릭 사업성 평가](./04-rubric-evaluation.md) | 3개 시나리오 7축 루브릭 비교 평가 | — | — |
| 05 | [**CureX 사업 기획서**](./05-curex-business-plan.md) | 🥇 유통 큐레이션 플랫폼 종합 사업 계획 | — | — |
| 06 | [**K-더마 시술 매칭**](./06-k-derma-treatment-platform.md) | 🆕 글로벌→한국 피부 시술 매칭 플랫폼 | **~70% 재사용** | **14주** |
| 07 | [**SkinBridge 사업 기획서**](./07-skinbridge-business-plan.md) | 🆕 K-더마 시술 매칭 종합 사업 계획 | — | — |
| 08 | [**핵심 경쟁력 분석**](./08-competitive-advantage-analysis.md) | 코드 포렌식 기반 10대 자산 및 차별화 해자 | — | — |
| 09 | [**AI Deal OS 전략**](./09-deal-os-strategy.md) | 🚀 Unfair Advantage, USP & 글로벌 선점 전략 | — | — |
| 10 | [**AI 매칭 & 데이터 플라이휠**](./10-ai-matching-data-flywheel.md) | 🧠 핵심 차별화: AI 매칭, 독점 데이터 축적 및 자가진화 해자 | — | — |

---

## 🔑 핵심 재사용 자산 (공통)

모든 시나리오에서 공통으로 재사용 가능한 CRE DealCard 핵심 자산:

| 자산 | 위치 | 재사용 범위 |
|:---|:---|:---|
| 3-Stage 매칭 엔진 | `src/domain/matching/` | Hard Filter → Semantic → Ensemble 구조 |
| PPTX 렌더링 엔진 (imlib) | `src/domain/building/mobile-im/pptx/` | 25 Slide Archetypes + Theme Store |
| 파이프라인 오케스트레이터 | `src/platform/im-pipeline/` | 체크포인트 + 타임아웃 + 멱등성 |
| Claim & Evidence 시스템 | `src/domain/building/im-core/claim.ts` | 출처 증명 + 8대 책임 마크 |
| Quality Gates (40+) | `quality-gates-v02.ts` | 데이터 정합성 + 문서 품질 검증 |
| SSOT YAML 설정 | `credeal/ssot/` | 하드코딩 제로 도메인 설정 |
| Release Tier 체계 | `release-tier.ts` | 단계적 검증 + 발행 게이트 |
| Circle 네트워크 | `src/domain/` + `src/app/api/broker/circles/` | 폐쇄형 B2B 네트워크 |
| AI 메모 파서 | `src/app/api/broker/deal-card/from-memo/` | 비정형 텍스트 → 구조화 데이터 |
| Magazine/Newsletter | `src/domain/magazine/` | 정기 시장 리포트 |
| Scheduling | `src/domain/scheduling/` | 미팅/전시회 일정 매칭 |
| Supabase 인프라 | `supabase/` | Auth + RLS + Realtime + Storage |
| 4-Layer 테스트 피라미드 | `src/tests/` | unit → gate → composition → e2e |

---

## 📊 시나리오 비교 매트릭스

| 기준 | OEM 매칭 | 수출 에이전트 | 유통 큐레이션 |
|:---|:---|:---|:---|
| **전이 효율** | ★★★★☆ | ★★★☆☆ | ★★★★★ |
| **시장 규모** | ★★★★★ | ★★★★☆ | ★★★★☆ |
| **경쟁 강도** | ★★★★☆ (Alibaba) | ★★★☆☆ | ★★☆☆☆ (블루오션) |
| **MVP 속도** | 18주 | 20주 | 16주 |
| **차별화 용이성** | ★★★★☆ | ★★★★★ | ★★★★★ |
| **수익 모델 명확성** | ★★★★★ | ★★★☆☆ | ★★★★☆ |
| **진입 장벽** | 중 (공장 DB 확보) | 중 (바이어 DB) | 낮음 (브랜드 자발적 등록) |
| **신규 개발 비중** | 40% | 45% | 35% |

---

## 🎯 추천 전략

### Option A: 유통 큐레이션 먼저 → 확장

```
Phase 1 (16주): 유통 큐레이션 MVP
  → 가장 빠른 출시, 가장 높은 전이 효율
  → K-뷰티 유통사 10개사로 PMF 검증

Phase 2 (+8주): OEM 매칭 추가
  → 유통 큐레이션의 공급사 DB를 OEM 매칭에 활용
  → 상품 DB가 이미 구축되어 있어 추가 공수 최소화

Phase 3 (+6주): 수출 에이전트 통합
  → 매칭 + 문서 생성 + 파이프라인이 이미 완성
  → 에이전트 전용 대시보드 + 바이어 발굴만 추가
```

### Option B: OEM 매칭 단독 집중

가장 큰 시장(8조 원)에 직접 진입. Alibaba 대비 Claim 출처 증명 + 전문 제안서 품질로 차별화.

### Option C: 수출 에이전트 → 정부 사업 연계

KOTRA 수출 바우처, 지자체 수출 지원 사업과 연계. 성과 측정 대시보드로 공공 조달 진입.

---

## 📁 파일 구조

```
docs/upcycle/
├── README.md                              ← 이 파일 (인덱스)
├── 01-oem-matching-platform.md            ← OEM 매칭 상세 분석
├── 02-export-agent-platform.md            ← 수출 에이전트 상세 분석
└── 03-distribution-curation-platform.md   ← 유통 큐레이션 상세 분석
```
