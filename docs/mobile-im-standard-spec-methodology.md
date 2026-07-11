# 모바일 IM 표준 스펙 및 섹션별 작성 방법론 종합 가이드

> **작성일**: 2026-07-05  
> **범위**: cre-dealcard 프로젝트의 모바일 IM (Investment Memorandum) 7섹션 표준 스펙  
> **참조 문서**: im-ai-methodology.md, mobile_im_rubric_audit.md, patent-001, 09-ai-agent-contracts.md, 10-prompt-contracts.md

---

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [표준 스펙: 7섹션 구성](#2-표준-스펙-7섹션-구성)
3. [섹션별 작성 방법론](#3-섹션별-작성-방법론)
4. [AI 생성 파이프라인](#4-ai-생성-파이프라인)
5. [품질 게이트 시스템](#5-품질-게이트-시스템)
6. [데이터 소스 및 신뢰도 체계](#6-데이터-소스-및-신뢰도-체계)
7. [섹션별 문제점 및 보완 포인트](#7-섹션별-문제점-및-보완-포인트)
8. [고품질화 향상 방안](#8-고품질화-향상-방안)
9. [Full IM 18섹션 연계](#9-full-im-18섹션-연계)
10. [부록: 코드 파일 매핑](#10-부록-코드-파일-매핑)

---

## 1. 시스템 개요

### 1.1 모바일 IM이란?

모바일 IM(Mobile Investment Memorandum)은 상업용 부동산(CRE) 거래에서 **중개인의 비정형 메모 1줄**을 입력받아 **2분 이내에 7섹션 투자설명서**를 자동 생성하는 모바일 네이티브 문서입니다.

```
중개인 카톡 메모 → [DealCard AI] → building_ssot_lite
                                        ↓
                            [MobileIM Writer] → 7섹션 마크다운
                                        ↓
                            [Lite Gate] → 공시·리스크 검증
                                        ↓
                            카카오 공유 링크 생성
```

### 1.2 경쟁 대비 포지셔닝

| 항목 | 수기 작성 | 경쟁사 도구 | **본 시스템** |
|------|----------|------------|-------------|
| 데이터 입력 | 2시간 | 1시간 | **2분** (메모) |
| 모바일 IM 발송 | 해당 없음 | 해당 없음 | **+30초** |
| Full IM 초안 | 8시간 | 4시간 | **10분** (AI) |
| 법적 검증 | 2시간 | 없음 | **자동** (Gate) |
| **합계** | **15시간** | **8시간** | **~1.5시간** |

### 1.3 핵심 설계 원칙

1. **AI-first → 템플릿 폴백**: AI 생성 실패 시 구조화된 프리미엄 템플릿으로 자동 폴백
2. **Truth / Signal 분리**: 내부 진실 후보(SSoT)와 공개 안전 출력(Signal)을 엄격히 분리
3. **Progressive Disclosure**: G0~G5 단계별 정보 공개 수준 제어
4. **Draft by Default**: 모든 AI 생성물은 검토 전까지 초안 상태 유지
5. **No Certainty Claims**: 투자/법률/세무/대출에 대한 확정 표현 금지

---

## 2. 표준 스펙: 7섹션 구성

### 2.1 섹션 정의

모바일 IM은 Full IM 18섹션에서 **꼬마빌딩 매수자가 실제로 묻는 7가지 핵심 질문**만 추출한 구조입니다.

| 순서 | 섹션 ID | 한국어 제목 | Full IM 대응 섹션 | 핵심 질문 |
|------|---------|-----------|-----------------|----------|
| 1 | `property_overview` | 물건 개요 | property_fact_sheet | "어떤 건물인가?" |
| 2 | `location_access` | 입지·상권 | location_access | "어디에 있나?" |
| 3 | `lease_status` | 임대 현황 | rent_roll_lease_quality | "현재 임대 상황은?" |
| 4 | `income_analysis` | 수익 분석 | income_noi_yield_analysis | "얼마나 벌 수 있나?" |
| 5 | `risk_check` | 확인 필요 사항 | risk_factors_dd_checklist | "무엇을 조심해야 하나?" |
| 6 | `investment_thesis` | 투자 포인트 | investment_thesis_buyer_fit | "왜 이 건물을 사야 하나?" |
| 7 | `next_steps` | 다음 단계 | deal_process_next_steps | "다음에 뭘 해야 하나?" |

> **코드 정의**: [types.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/types.ts#L5-L13)

### 2.2 섹션 데이터 구조

각 섹션은 다음 인터페이스를 따릅니다:

```typescript
interface MobileIMSection {
  section_type: MobileIMSectionType;   // 7개 중 하나
  section_order: number;               // 1~7
  title: string;                       // 한국어 제목
  markdown: string;                    // 렌더링 본문
  confidence: "confirmed" | "inferred" | "needs_check";
  boundary_note: string;               // 면책 문구
  provenance?: DataPointProvenance[];   // 데이터 출처 추적
}
```

### 2.3 신뢰도 3단계

| 신뢰도 | 의미 | 데이터 소스 |
|--------|------|-----------|
| `confirmed` | 공공 데이터로 확인됨 | 건축물대장, 공시지가, 실거래가 |
| `inferred` | AI 추론 또는 사용자 입력 | 중개인 메모, LLM 분석 |
| `needs_check` | 검증 필요 | 추정값, 불확실 정보 |

---

## 3. 섹션별 작성 방법론

### §1. 물건 개요 (property_overview)

#### 데이터 소스
- **Primary**: `asset_identity` (SSoT) + 건축물대장 API
- **Secondary**: 중개인 사진 업로드 (최대 5장)
- **Enrichment**: 공시지가 API, 토지이용계획 API

#### 작성 방법론
1. SSoT의 `area_signal`, `asset_type`, `price_band`, `size_signal`에서 자동 구성
2. 건축물대장 API로 연면적(㎡→평 변환), 대지면적, 건축연도, 구조, 층수, 승강기, 주차, 냉난방 보강
3. 사진 URL이 있으면 마크다운 갤러리 삽입 (최대 5장)
4. `_isFallback` 감지 시 "⚠️ 공부 원본 확인 필요" 경고 자동 삽입

#### 포함 항목 (12개)
| 항목 | 소스 | 단위 |
|------|------|------|
| 소재지 | SSoT + 주소 해석 | 권역명 (G0) / 정확 주소 (G3+) |
| 용도 | 건축물대장 → `mainPurpose` | 텍스트 |
| 연면적 | 건축물대장 → `totalArea` | ㎡ (평 병기, ×0.3025) |
| 대지면적 | 건축물대장 → `platArea` | ㎡ (평 병기) |
| 건축면적 | 건축물대장 → `archArea` | ㎡ |
| 층수 | 건축물대장 → `floorsAbove`/`floorsBelow` | 지상N/지하N |
| 승강기 | 건축물대장 → `elevatorCount` | 대 |
| 주차 | 건축물대장 → `parkingCount` | 대 |
| 냉난방 | 건축물대장 → `heatMethod` | 텍스트 |
| 준공연도 | 건축물대장 → `useAprDay` | YYYY년 |
| 구조 | 건축물대장 → `structure` | 텍스트 |
| 매각 희망가 | supplemental → `asking_price_manwon` | 억원 |

#### AI 역할
- **자동 구성**: SSoT 필드에서 마크다운 테이블로 자동 매핑
- **폴백 경고**: API 실패 시 `_isFallback` 태깅 + 사용자 경고

---

### §2. 입지·상권 (location_access)

#### 데이터 소스
- **Primary**: 카카오 지도 API (POI 카운트, 최근접 역)
- **Secondary**: SSoT `market_location.location_analysis`
- **Enrichment**: 상권분석 API (SEMAS), 인터랙티브 지도

#### 작성 방법론
1. 카카오 지도 API로 반경 500m 내 편의점/카페/식당/주차장 실제 카운트 조회
2. 최근접 지하철역 거리(m) 및 도보 시간(보행속도 80m/min) 계산
3. 인터랙티브 카카오 지도 렌더링 (마커 + 외부 앱 연결)
4. AI 생성 시 상권 분석 서술형 포함, 템플릿은 구조화 불릿 포인트

#### AI 역할
- 🔶 **AI 위치 분석 자동 생성**: 교통 접근성, 상권 특성, 유동인구 서술
- 템플릿 폴백: 구조화된 POI 데이터 표시

#### 포함 항목
| 항목 | 소스 | 비고 |
|------|------|------|
| 최근접 역 | 카카오 POI API | 역명 + 거리(m) + 도보(분) |
| POI 카운트 | 카카오 카테고리 검색 | 편의점, 카페, 식당, 주차장, 버스정류장 |
| 인터랙티브 지도 | 카카오 Static Map | 마커 + 외부 앱 연결 |
| 상권 분석 | AI 또는 SEMAS API | 서술형 또는 구조화 |

---

### §3. 임대 현황 (lease_status)

#### 데이터 소스
- **Primary**: supplemental `monthly_rent_total_krw`, `vacancy_status`
- **Secondary**: SSoT `vacancy_signal`, `lease_summary.tenants`
- **Optional**: `floor_leases` (층별 임대 데이터, 현재 미사용)

#### 작성 방법론
1. 공실률 파싱: "만실"→0%, "공실"→30%, "N%"→N% 변환
2. 월세 총액 + 공실률 조합으로 임대 현황 요약
3. 데이터 미입력 시 "🔒 데이터 확보 후 공개" 잠금 처리
4. 임대 테이블: 층별 임차인 업종, 면적, 임대료 표시 (SSoT tenants 경로)

#### AI 역할
- SSoT + 보충 입력 기반 자동 구성
- 공실률에 따른 리스크 자동 서술 ("공실 ~20%: 공실 해소 전략 검토 필요")

#### 포함 항목
| 항목 | 소스 | 민감정보 |
|------|------|---------|
| 공실률 | supplemental 또는 파싱 | N/A |
| 월세 총액 | supplemental `monthly_rent_total_krw` | Gate 제한 |
| 임대 테이블 | SSoT `lease_summary.tenants` | 임차인명 마스킹 |
| 주요 임차 업종 | AI 분류 | N/A |

---

### §4. 수익 분석 (income_analysis)

#### 데이터 소스
- **Primary**: supplemental 재무 데이터 (월세, 보증금, 관리비, 매매가, 대출)
- **Calculation**: [financials.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/financials.ts)
- **Enrichment**: 자산유형별 Cap Rate 밴드

#### 작성 방법론
1. **NOI 3시나리오 산출**: Best / Base / Worst
   - Best: 100% 임대율 가정 (공실률 0%)
   - Base: 현재 공실률 반영
   - Worst: 현재 공실률 + 10% 추가
2. **Cap Rate 적용**: 자산유형별 적정 밴드 (오피스 3.0~4.5%, 상가 4.0~5.5%)
3. **IRR 계산**: Newton-Raphson 수렴 (exit cap = entry cap 가정)
4. **레버리지 분석**: 보증금 차감, 융자 활용, 자기자본 수익률 산출
5. ⚠️ **면책 문구 자동 첨부**: 모든 수치에 "추정치이며 확정 수익률이 아닙니다" 명시

#### AI 역할
- 재무 시나리오 서술: "투자 대비 수익률이 X%대로, Y 유형 투자자에게 적합한 수준입니다"
- ⚠️ AI 경로에서는 보증금/관리비/융자 데이터 미전달 문제 존재 (Critical 이슈)

#### 포함 항목
| 항목 | 산출 로직 | 면책 |
|------|----------|------|
| NOI (Best/Base/Worst) | 월세×12 - 관리비 - 공실 반영 | ⚠️ "추정치" |
| Cap Rate | NOI / 매매가 | ⚠️ "시장 조건에 따라 변동" |
| IRR (5년) | Newton-Raphson | ⚠️ "exit cap = entry cap 가정" |
| 대지 가치 비중 | 공시지가 × 대지면적 / 매매가 | ⚠️ "토지 가치는 별도 감정 필요" |
| 레버리지 수익률 | (NOI - 이자비용) / 자기자본 | ⚠️ "대출 조건은 금융기관 확인 필요" |

---

### §5. 확인 필요 사항 (risk_check)

#### 데이터 소스
- **Primary**: 건축물대장 (건물 연식, 구조)
- **Secondary**: 토지이용계획 (건폐율/용적률 법정 한도)
- **Enrichment**: 등기정보 (근저당/압류 정보)
- **AI**: 리스크 자동 도출

#### 작성 방법론
1. **건물 연식 경고**: 30년+ → 🔴 "노후 건물, 대수선 비용 확인 필요", 20년+ → 🟡 "노후화 진행"
2. **용도지역 규제**: 건폐율/용적률 법정 한도 표시, API 실값 우선 적용
3. **등기 정보**: 근저당/압류 정보 캐시 연동
4. **AI 리스크 분석**: 환각 방지 가드 + 리스크 경계 체크 적용

#### AI 역할
- 🔶 **AI 리스크 자동 도출**: 건물 특성에 따른 맞춤형 리스크 포인트 생성
- 환각 감지: 가격/면적 20배 편차 감지, 50자 최소 길이 기준

---

### §6. 투자 포인트 (investment_thesis)

#### 데이터 소스
- **Primary**: `buyer_fit.fit_summary` (DealCuriosityWriter 생성)
- **Secondary**: 실거래 데이터 (평당가 비교)
- **Enrichment**: value-add-engine (리포지셔닝/레노베이션 분석)

#### 작성 방법론
1. **비교 거래 활용**: 실거래 평균 평당가 표시, 3개월 데이터 병렬 수집
2. **투자자 유형 매칭**: 오피스/상가/지식산업/범용 4가지 바이어 프로파일 분기
3. **부가가치 분석**: value-add-engine 연동, 리포지셔닝·레노베이션 가능성
4. **브로커 코멘트**: 사용자 하이라이트 자동 삽입

#### AI 역할
- 🔷 **AI 핵심 차별화**: `DealCuriosityWriter`가 매물의 숨겨진 가치를 분석하여 "왜 이 건물을 사야 하는지" 자동 작성
- 9개 숨은 정보 카테고리 분석 (경쟁사에서는 중개인이 직접 작성)
- P-D2 클러스터(법인사옥/수익투자/증여 등)에 따라 강조점 차별화

---

### §7. 다음 단계 (next_steps)

#### 데이터 소스
- **Primary**: 정적 콘텐츠 (6단계 투자 절차)
- **CTA**: Full IM 업그레이드 버튼

#### 작성 방법론
1. **6단계 투자 절차 안내**: 관심표명 → NDA → 실사 → LOI → 매매계약 → 잔금
2. **Full IM 업셀 CTA**: "30페이지 Full IM 요청" 버튼
3. 물건별 커스터마이징 없이 동일 텍스트 사용

#### AI 역할
- 정적 콘텐츠 자동 삽입 (AI 생성 불필요)
- Full IM readiness 점수 및 부족 데이터 목록 표시

---

## 4. AI 생성 파이프라인

### 4.1 이중 전략: AI-first → 템플릿 폴백

```
┌─────────────────────────────────────────────────────────┐
│                  섹션 생성 전략                            │
│                                                          │
│   [1] AI 생성 시도 (GPT-5.4 / Claude Sonnet 4.5)         │
│        ↓ 성공                      ↓ 실패                 │
│   [2] 6단계 품질 게이트             [3] 프리미엄 템플릿       │
│        ↓ pass                      ↓                     │
│   [4] 면책 문구 자동 첨부            [4] 면책 문구 자동 첨부   │
│        ↓                           ↓                     │
│   [5] 최종 마크다운 출력              [5] 최종 마크다운 출력   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 AI 에이전트 파이프라인

| 순서 | 에이전트 | 역할 | 코드 |
|------|---------|------|------|
| 1 | `MemoParserAgent` | 비정형 메모 → 구조화 추출 | [09-ai-agent-contracts.md §7](file:///c:/Users/User/cre-dealcard/docs/09-ai-agent-contracts.md) |
| 2 | `BuildingMiniTruthAgent` | 파싱 결과 → SSoT Lite 생성 | [09-ai-agent-contracts.md §8](file:///c:/Users/User/cre-dealcard/docs/09-ai-agent-contracts.md) |
| 3 | `DisclosureGuardAgent` | 민감정보 탐지·차폐 | [09-ai-agent-contracts.md §9](file:///c:/Users/User/cre-dealcard/docs/09-ai-agent-contracts.md) |
| 4 | `DealCuriosityWriterAgent` | 딜 호기심 리포트 생성 | [09-ai-agent-contracts.md §11](file:///c:/Users/User/cre-dealcard/docs/09-ai-agent-contracts.md) |
| 5 | `MobileIM Writer` | 7섹션 마크다운 생성 | [writer.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts) |

### 4.3 Prompt 아키텍처

**Global Doctrine** (모든 프롬프트 공통):

```
Small input → Structured output → Draft by default
→ Truth / Signal 분리 → No sensitive disclosure
→ No investment/legal/tax/loan certainty
→ Every claim = confirmed | user_provided | inferred | hypothesis | needs_verification
```

**섹션별 프롬프트**: [narrative-prompt.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/narrative-prompt.ts)에서 섹션별 컨텍스트와 시장 지표를 주입

---

## 5. 품질 게이트 시스템

### 5.1 6단계 품질 게이트

```
AI 생성 → [G1] 환각 감지 → [G2] LLM 판정 → [G3] 리스크 경계
    → [G4] CRE 품질 게이트 → [G5] 디스클로저 가드 → [G6] 교차 검증
```

| 게이트 | 파일 | 동작 | 점수 |
|--------|------|------|------|
| G1 환각 감지 | [writer.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts#L274) | 가격/면적 20배 편차 감지 | 7/10 |
| G2 LLM 판정 | [im-judge.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-judge.ts) | 확률적 샘플링, 3.0 미만 거부 | 8/10 |
| G3 리스크 경계 | [guardrails.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/guardrails.ts) | 정규식 기반 위험 표현 필터링 | 8/10 |
| G4 CRE 품질 | [cre-quality-gate.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cre-quality-gate.ts) | LLM 기반 CRE 전문성 검증 | 9/10 |
| G5 디스클로저 | [writer.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts) | 개인정보·확정표현 필터링 | 8/10 |
| G6 교차 검증 | [cross-validator.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cross-validator.ts) | 섹션 간 수치 일관성 검사 | 9/10 |

### 5.2 민감정보 이중 탐지 아키텍처

**1차 탐지 — LLM 의미 분석** (MemoParser 단계):
- LLM이 의미적으로 민감 정보를 분류
- `detectedSensitiveFields` 배열로 출력

**2차 탐지 — 규칙 기반 패턴 매칭** (DisclosureGuard 단계):
| 민감 정보 유형 | 패턴 | 차폐 방식 |
|--------------|------|----------|
| 정확한 주소 | `[가-힣]+구\s+[가-힣]+동\s*\d+[-\d]*` | → 권역 신호 ("성수권역") |
| 임차인 실명 | 브랜드명 DB 매칭 | → 업종 분류 ("F&B 앵커 테넌트") |
| 개별 임대료 | `월세\s*\d+만\s*원` | → "[임대수익 존재, 상세 비공개]" |
| 매도자 사정 | `급매`, `상속`, `이혼` | → 완전 삭제 |
| 협상 내용 | `\d+억까지\s*가능` | → 완전 삭제 |

### 5.3 Readiness (준비도) 시스템

| 데이터 포인트 | 가중치 | 판정 기준 |
|-------------|-------|----------|
| 주소/권역 | 25점 | `area_signal` 존재 |
| 임대료 | 20점 | `monthly_rent_total_krw` 존재 |
| 에셋 타입 | 10점 | `asset_type` 존재 |
| 가격대 | 15점 | `price_band` 존재 |
| 공실 현황 | 5점 | `vacancy_status` 존재 |
| 사진 | 10점 | `photo_urls` 1개 이상 |
| 외부 데이터 보너스 | +10점 | API 조회 성공 |

**임계값**: 40점 이상 → 모바일 IM 생성 가능

---

## 6. 데이터 소스 및 신뢰도 체계

### 6.1 외부 API 파이프라인

| API 모듈 | 데이터 | 신뢰도 |
|---------|--------|-------|
| [building-register-api.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/building-register-api.ts) | 건축물대장 (연면적, 구조, 층수) | `public_data_confirmed` |
| [land-price-api.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/land-price-api.ts) | 개별공시지가 | `public_data_confirmed` |
| [land-use-api.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/land-use-api.ts) | 토지이용계획 (용도지역, 건폐율) | `public_data_confirmed` |
| [real-transaction-api.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/real-transaction-api.ts) | 실거래 데이터 | `public_data_confirmed` |
| [kakao-map-api.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/kakao-map-api.ts) | POI 카운트, 최근접 역 | `public_data_confirmed` |
| [registry-api.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/registry-api.ts) | 등기 정보 (근저당/압류) | `public_data_confirmed` |
| [semas-commercial-api](file:///c:/Users/User/cre-dealcard/src/lib/external/) | 상권 분석 | `public_data_confirmed` |

### 6.2 신뢰도 6단계

```typescript
type ConfidenceLevel =
  | 'confirmed'           // 공공 데이터/증빙 확인
  | 'user_provided'       // 중개인 직접 제공
  | 'public_data_inferred'// 공공 데이터에서 추론
  | 'ai_hypothesis'       // AI 생성 가설
  | 'needs_verification'  // 검증 필요
  | 'unknown';            // 알 수 없음
```

### 6.3 데이터 출처 추적 (Provenance)

```typescript
interface DataPointProvenance {
  fieldKey: string;
  value: string | number;
  source: "public_data" | "broker_input" | "ai_inferred" | "expert_verified";
  sourceDetail: string;         // 구체적 API/입력원
  confidence: "confirmed" | "inferred" | "needs_check";
  lastVerifiedAt: string;
}
```

---

## 7. 섹션별 문제점 및 보완 포인트

### 7.1 종합 현황 (루브릭 감사 기준 82/100)

```
┌──────────────────────────────────────────────────────────┐
│               종합 등급: B+ (82/100)                       │
│                                                           │
│  ■ 기술적 정합성     ████████░░  78/100                     │
│  ■ 도메인 전문성     █████████░  85/100                     │
│  ■ 데이터 정확성     ████████░░  80/100                     │
│  ■ 보안/안정성      ████████░░  82/100                     │
│  ■ UX/뷰어 완성도   ████████░░  78/100                     │
└──────────────────────────────────────────────────────────┘
```

### 7.2 섹션별 상세 문제점

---

#### §1. 물건 개요 — 문제점 (41/50)

| 심각도 | 문제 | 위치 | 영향 |
|--------|------|------|------|
| 🔴 Critical | **하드코딩 폴백값 5건**: `zoningDistrict`="일반상업지역", `useAprDay`="20150601", `structure`="철근콘크리트구조", `mainPurpose`="업무시설", `zoningOverlap`="방화지구" | [writer.ts:459-462](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts#L459-L462) | 주거/공업 지역 물건에서 투자자 오해 유발 |
| 🟡 Medium | 사진 캡션이 단순 (파일명 기반) | writer.ts 갤러리 부분 | UX 개선 여지 |

**보완 방안**:
- 하드코딩 폴백값 → `"확인 필요"` 또는 빈 문자열로 교체
- 사진 AI 캡션 생성 (향후 VisualAlbumAgent 연동)

---

#### §2. 입지·상권 — 문제점 (35/50)

| 심각도 | 문제 | 위치 | 영향 |
|--------|------|------|------|
| 🟡 Medium | 버스정류장 POI 카운트 **하드코딩(=3)**, API 미조회 | [kakao-map-api.ts:42](file:///c:/Users/User/cre-dealcard/src/lib/external/kakao-map-api.ts#L42) | 데이터 부정확 |
| 🟡 Medium | 강남/삼성 좌표 판별 범위 중첩 (±0.02° vs 0.008° 차이) → 강남 분기 도달 불가 | [kakao-map-api.ts:81-83](file:///c:/Users/User/cre-dealcard/src/lib/external/kakao-map-api.ts#L81-L83) | 폴백 좌표 오류 |

**보완 방안**:
- 카카오 POI API로 버스정류장 실제 조회 구현
- 좌표 판별 범위 축소 (±0.005° 이하) 또는 행정동 코드 기반 분기

---

#### §3. 임대 현황 — 문제점 (34/50)

| 심각도 | 문제 | 위치 | 영향 |
|--------|------|------|------|
| 🔴 Critical | **타입 불일치**: `FloorLeaseInput`(deposit_manwon, rent_manwon, area_pyeong, lease_end) vs writer.ts 실제 접근(deposit, monthly_rent, area_sqm, contract_end) | [types.ts:42-53](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/types.ts#L42-L53) vs [writer.ts:552-557](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts#L552-L557) | 임대 테이블 렌더링 오류 |
| 🟡 Medium | 공실 파싱 불완전: "반공실", "거의 만실" 등 미처리 | writer.ts 공실 파싱 | 일부 입력 무시 |
| 🟡 Medium | `FloorLeaseInput` 정의되었으나 **writer.ts에서 미사용** (supplemental.floor_leases 미참조) | types.ts / writer.ts | 층별 데이터 활용 불가 |

**보완 방안**:
- `FloorLeaseInput` ↔ writer.ts 필드명 통일 (또는 어댑터 레이어 추가)
- 공실 파싱에 자연어 해석 추가 ("반공실"→15%, "거의 만실"→5%)
- `supplemental.floor_leases` 데이터를 writer.ts에서 실제 활용하도록 연동

---

#### §4. 수익 분석 — 문제점 (36/50)

| 심각도 | 문제 | 위치 | 영향 |
|--------|------|------|------|
| 🔴 Critical | **AI 경로에서 보증금/관리비/융자 미전달** → 레버리지 분석 불완전 | [writer.ts:232](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts#L232) | 재무 분석 불완전 |
| 🔴 Critical | **대지면적 폴백으로 연면적 사용** → 다층 건물에서 대지가치 과대산정 | [financials.ts:173](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/financials.ts#L173) | 재무 왜곡 |
| 🟡 Medium | IRR 계산 시 **exit cap = entry cap** 가정 (시장 관행은 entry + 50bp~100bp) | [financials.ts:142](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/financials.ts#L142) | 낙관적 수치 |
| 🟡 Medium | NOI Best-case에 **공실률 미반영** (0% 가정) → 구조적 공실 건물에서 비현실적 | [financials.ts:125](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/financials.ts#L125) | 과대 추정 |

**보완 방안**:
- AI 프롬프트 컨텍스트에 보증금/관리비/융자 데이터 명시적 전달
- 대지면적 미입력 시 "대지 가치 비중 미산출" 표시 (연면적 폴백 제거)
- Exit cap = entry cap + 50bp로 보수적 가정 적용
- Best-case에도 최소 구조적 공실률(3~5%) 반영

---

#### §5. 확인 필요 사항 — 문제점 (32/40)

| 심각도 | 문제 | 위치 | 영향 |
|--------|------|------|------|
| 🟢 Minor | 환각 감지 50자 최소 길이 기준이 약함 | writer.ts 환각 검사 | 짧은 허위 정보 미탐지 |

**보완 방안**:
- 길이 기준 외에 핵심 수치(금액, 면적, 수익률) 기반 교차 검증 강화
- 외부 데이터와의 불일치 감지 범위 확대

---

#### §6. 투자 포인트 — 문제점 (34/40)

| 심각도 | 문제 | 위치 | 영향 |
|--------|------|------|------|
| 🟢 Minor | value-add-engine의 리포지셔닝 제안이 일반적 수준 | value-add-engine.ts | 차별화 약화 |

**보완 방안**:
- 과거 성공 딜 패턴(G-D 시맨틱 검색) 연동으로 구체적 리포지셔닝 사례 제시
- P-D2 클러스터별 맞춤 투자 논거 템플릿 고도화

---

#### §7. 다음 단계 — 문제점 (24/30)

| 심각도 | 문제 | 위치 | 영향 |
|--------|------|------|------|
| 🟡 Medium | 물건별 커스터마이징 없이 **동일 정적 텍스트** 사용 | writer.ts 섹션7 | 개인화 부족 |

**보완 방안**:
- Readiness 점수에 따른 맞춤 다음 단계 추천
- 부족 데이터별 구체적 행동 가이드 생성 (예: "임대차 계약서 사진 촬영 후 업로드")

---

### 7.3 인프라 공통 문제점

| 심각도 | 카테고리 | 문제 | 영향 |
|--------|---------|------|------|
| 🔴 Critical | API 안정성 | **전체 API 4종에서 `res.ok` 미검증** → 비-200 응답 시 불투명 에러 | 시스템 안정성 |
| 🔴 Critical | 뷰어 | **`docId` 뷰어 미전달** → PDF 내보내기 완전 비활성화 | 기능 장애 |
| 🔴 Critical | 데이터 추적 | **`_isFallback` 상태가 document_objects에 미저장** → 폴백 데이터 추적 불가 | 데이터 투명성 |
| 🟡 Medium | 공유 | OG 이미지 **상대 URL** → 소셜 미디어 크롤러 호환 불완전 | 카카오 공유 UX |
| 🟡 Medium | 공유 | 카카오톡 공유가 **Web Share API만** 사용 → Kakao SDK 미연동 → 썸네일 미노출 | 공유 UX |
| 🟡 Medium | 코드 품질 | `external-data-orchestrator.ts`와 `enrich-by-pnu.ts` **~95% 코드 중복** | 유지보수성 |
| 🟡 Medium | Readiness | **주석(55점) vs 코드(40점) 임계값 불일치** | 혼란 유발 |
| 🟡 Medium | AI 컨텍스트 | narrative-prompt에 **최근 2개 섹션 요약만** 전달 → 후반 섹션 일관성 약화 | AI 품질 |

---

## 8. 고품질화 향상 방안

### 8.1 즉시 개선 (1일, 투자 대비 효과 최대)

| # | 항목 | 작업 | 예상 효과 |
|---|------|------|----------|
| 1 | `docId` 전달 | `page.tsx` 1줄 수정 | PDF 내보내기 기능 복구 |
| 2 | 하드코딩 폴백 제거 | writer.ts 5줄 수정 | 투자자 오해 방지 |
| 3 | `res.ok` 검증 | 4개 API 각 2줄 추가 | 에러 투명성 확보 |

### 8.2 단기 개선 (1주)

| # | 항목 | 작업 | 예상 효과 |
|---|------|------|----------|
| 4 | FloorLeaseInput 통일 | types.ts + writer.ts 스키마 동기화 | 임대 테이블 정상화 |
| 5 | AI 경로 재무 데이터 | 보증금/관리비/융자 프롬프트 전달 | 레버리지 분석 완성 |
| 6 | `_isFallback` 저장 | document body에 폴백 상태 포함 | 데이터 추적 가능 |
| 7 | 대지면적 폴백 수정 | 연면적 폴백 제거, 미산출 표시 | 재무 왜곡 방지 |

### 8.3 중기 고도화 (2~4주)

| # | 항목 | 작업 | 예상 효과 |
|---|------|------|----------|
| 8 | OG 절대 URL + Kakao SDK | 공유 시스템 리팩터링 | 카카오 공유 UX 향상 |
| 9 | Exit cap rate 조정 | entry + 50bp 적용 | IRR 정확성 향상 |
| 10 | 외부 데이터 중복 제거 | 공통 코어 추출 | 유지보수성 향상 |
| 11 | 공실 자연어 파싱 | NLP 기반 공실 해석 | 입력 커버리지 확대 |
| 12 | 섹션7 개인화 | Readiness 기반 맞춤 가이드 | UX 향상 |

### 8.4 장기 고도화 (1~3개월)

| # | 항목 | 설명 | 기대 효과 |
|---|------|------|----------|
| 13 | Golden IM 학습 | 고품질 IM 사례 기반 Few-shot 프롬프트 | AI 출력 품질 A등급 |
| 14 | CRE RAG 서비스 | 시장 리포트/유사 딜 벡터 검색 | 컨텍스트 품질 향상 |
| 15 | AI 사진 분류 | 외관/내부/설비/주변환경 자동 분류 | §1 사진 캡션 고도화 |
| 16 | 다국어 IM | 영어/중국어 번역 (translator.ts 기반) | 해외 투자자 접근성 |
| 17 | 음성 IM 입력 | STT → 메모 파싱 파이프라인 | 현장 입력 편의성 |
| 18 | DCF 민감도 분석 | [dcf-sensitivity.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/dcf-sensitivity.ts) 고도화 | §4 재무 분석 깊이 |

### 8.5 품질 목표

| 지표 | 현재 | 단기 목표 | 장기 목표 |
|------|------|----------|----------|
| 루브릭 종합 | 82/100 (B+) | 90/100 (A) | 95/100 (A+) |
| Critical 이슈 | 7건 | 0건 | 0건 |
| Medium 이슈 | 10건 | 3건 이하 | 0건 |
| 민감정보 유출 | 0건 | 0건 유지 | 0건 유지 |
| AI 생성 성공률 | ~85% | 95% | 99% |
| 확정 표현 탐지율 | ~90% | 98% | 99.5% |

---

## 9. Full IM 18섹션 연계

### 9.1 모바일 IM → Full IM 매핑

| 모바일 IM (7섹션) | Full IM (18섹션) | 데이터 재활용 |
|-----------------|----------------|-------------|
| §1 물건 개요 | §4 물건 팩트시트 | ✅ SSoT 필드 직접 매핑 |
| §2 입지·상권 | §6 입지·접근성, §7 미시 시장·수요 | ✅ 위치 분석 + 🆕 임대수요 데이터 |
| §3 임대 현황 | §9 임대 현황 | ✅ + 🆕 층별 상세 Rent Roll |
| §4 수익 분석 | §10 수입·NOI·수익률, §11 대출·현금흐름 | ✅ + 🆕 전문가 패치 필수 |
| §5 확인 필요 | §5 토지·법적 제약, §14 리스크·DD | ✅ + 🆕 법률 전문가 검토 |
| §6 투자 포인트 | §2 핵심 요약, §3 투자 논거·적합성 | ✅ + 🆕 P-D2 클러스터 기반 맞춤 |
| §7 다음 단계 | §15 딜 프로세스 | ✅ |
| — | §1 표지·기밀유지 | 🆕 정적 템플릿 |
| — | §8 건물 상태 | 🆕 사진 AI + 전문가 |
| — | §12 가치평가·비교 | 🆕 실거래 통계 + 감정 전문가 |
| — | §13 리포지셔닝 | 🆕 CRE 컨설턴트 |
| — | §16 딜룸 Q&A | 🆕 과거 딜 시맨틱 검색 |
| — | §17 부록·증거 인덱스 | 🆕 자동 수집 |
| — | §18 면책·연락처 | 🆕 정적 + 중개인 정보 |

### 9.2 업그레이드 플로우

```
모바일 IM (7섹션)
  ↓ 1-tap 업그레이드 버튼
building_ssot_lite → building_ssot_full (데이터 이관)
  ↓
Readiness Engine → 60/100 (부족 항목 안내)
  ↓
Section Planner → 18섹션 계획 (7섹션 데이터 재활용)
  ↓
AI Draft → 전문가 패치 → 8중 Gate → 배포
```

---

## 10. 부록: 코드 파일 매핑

### 10.1 핵심 도메인 파일

| 파일 | 역할 | 관련 섹션 |
|------|------|----------|
| [types.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/types.ts) | 7섹션 타입 정의, 보충 입력 타입 | 전체 |
| [writer.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts) | 7섹션 자동 생성 엔진 (AI + 템플릿) | 전체 |
| [financials.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/financials.ts) | NOI/Cap Rate/IRR/레버리지 계산 | §4 |
| [narrative-prompt.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/narrative-prompt.ts) | 섹션별 AI 프롬프트 구성 | 전체 |
| [guardrails.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/guardrails.ts) | 리스크 경계 + 디스클로저 가드 | G3, G5 |
| [im-judge.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-judge.ts) | LLM 품질 판정 | G2 |
| [cre-quality-gate.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cre-quality-gate.ts) | CRE 전문성 검증 게이트 | G4 |
| [cross-validator.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cross-validator.ts) | 섹션 간 교차 검증 | G6 |
| [readiness.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/readiness.ts) | 준비도 점수 계산 | Readiness |
| [data-provenance.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/data-provenance.ts) | 데이터 출처 추적 | 전체 |
| [value-add-engine.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/value-add-engine.ts) | 부가가치 시나리오 | §6 |
| [golden-im-manager.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/golden-im-manager.ts) | 고품질 IM Few-shot 관리 | AI 품질 |
| [cre-rag-service.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cre-rag-service.ts) | CRE RAG 컨텍스트 생성 | AI 품질 |
| [cre-prompt-registry.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cre-prompt-registry.ts) | 프롬프트 레지스트리 | 프롬프트 관리 |
| [dcf-sensitivity.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/dcf-sensitivity.ts) | DCF 민감도 분석 | §4 확장 |
| [wale-calculator.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/wale-calculator.ts) | 가중평균 임대 만기 계산 | §3 확장 |
| [translator.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/translator.ts) | 다국어 번역 | 국제화 |
| [im-generation-state-machine.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-generation-state-machine.ts) | 생성 상태 머신 | 워크플로 |
| [im-embedding-indexer.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-embedding-indexer.ts) | IM 임베딩 인덱싱 | 시맨틱 검색 |

### 10.2 외부 데이터 파이프라인

| 파일 | 역할 |
|------|------|
| [building-register-api.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/building-register-api.ts) | 건축물대장 API |
| [land-price-api.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/land-price-api.ts) | 공시지가 API |
| [land-use-api.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/land-use-api.ts) | 토지이용계획 API |
| [real-transaction-api.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/real-transaction-api.ts) | 실거래 API |
| [kakao-map-api.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/kakao-map-api.ts) | 카카오 지도/POI API |
| [registry-api.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/registry-api.ts) | 등기정보 API |
| [external-data-orchestrator.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/external-data-orchestrator.ts) | 외부 데이터 오케스트레이터 |
| [enrich-by-pnu.ts](file:///c:/Users/User/cre-dealcard/src/lib/external/enrich-by-pnu.ts) | PNU 기반 보강 |

### 10.3 관련 문서

| 문서 | 내용 |
|------|------|
| [im-ai-methodology.md](file:///c:/Users/User/cre-dealcard/docs/im-ai-methodology.md) | 3시스템 통합 AI IM 작성 방법론 |
| [mobile_im_rubric_audit.md](file:///c:/Users/User/cre-dealcard/docs/mobile_im_rubric_audit.md) | 정밀 루브릭 감사 보고서 (82/100) |
| [patent-001-mobile-im-auto-generation.md](file:///c:/Users/User/cre-dealcard/docs/patent-001-mobile-im-auto-generation.md) | 특허명세서 (모바일 IM 자동 생성) |
| [09-ai-agent-contracts.md](file:///c:/Users/User/cre-dealcard/docs/09-ai-agent-contracts.md) | AI 에이전트 계약 (12개 에이전트) |
| [10-prompt-contracts.md](file:///c:/Users/User/cre-dealcard/docs/10-prompt-contracts.md) | 프롬프트 계약 |
| [11-gate-disclosure-policy.md](file:///c:/Users/User/cre-dealcard/docs/11-gate-disclosure-policy.md) | 게이트/디스클로저 정책 |

---

> **문서 갱신 이력**
> - 2026-07-05: 초판 작성 — 7섹션 표준 스펙, 작성 방법론, 문제점/보완점, 고품질화 방안 종합 정리
