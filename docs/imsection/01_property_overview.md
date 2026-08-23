# 섹션 1: property_overview (물건 개요)

> **Full IM 대응**: `property_fact_sheet`
> **전 포스처 공통**: ✅ | **PPTX 아키타입**: A04 (Building)

---

## 1. 섹션 미션 (Section Mission)

```
이 건물이 '어떤 자산'인지 한눈에 파악할 수 있도록 핵심 물리적 스펙(위치, 규모, 준공, 용도)을 요약하세요.
첫 문장에 '핵심 한줄 정의'를 넣으세요.
(예: '강남대로 이면 도보 3분, 2017년 준공 올근생 메디컬빌딩')
마지막 줄에는 반드시 '> **자산 하이라이트**: • 핵심강점1 • 핵심강점2 • 핵심강점3'
형식의 블록인용으로 자산의 3대 매력을 명확히 서술하세요.
```

> **소스**: [`narrative-prompt.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/narrative-prompt.ts) L259

---

## 2. 데이터 소스 계층 (Data Sources)

### 2.1 SSoT (BuildingSSoTLite) 필드

| 필드 | 예시 | 용도 |
|:---|:---|:---|
| `area_signal` | "당산역 역세권" | 지역·권역 명칭 |
| `asset_type` | "근린생활시설(메디컬빌딩)" | 자산 유형 |
| `price_band` | "115억" | 매각 희망가 |
| `size_signal` | "연면적 436평" | 규모 |
| `vacancy_signal` | "만실" | 공실 상태 |
| `address` | "서울특별시 영등포구 당산동5가 11-47" | 주소 |

### 2.2 공공 API (ExternalDataSnapshot.buildingRegister)

| 필드 | API 소스 | 예시 |
|:---|:---|:---|
| `totalArea` | 건축물대장 | 1441.15㎡ |
| `platArea` | 건축물대장 | 506.5㎡ |
| `useAprDay` | 건축물대장 | "20130801" |
| `mainPurpose` | 건축물대장 | "제2종근린생활시설" |
| `structure` | 건축물대장 | "철근콘크리트구조" |
| `floorsAbove` / `floorsBelow` | 건축물대장 | 5 / 1 |
| `bcRat` / `vlRat` | 건축물대장 | 65.4 / 221.8 |
| `elevatorCount` | 총괄표제부 | 1 |
| `parkingCount` | 총괄표제부 | 6 |
| `heatMethod` | 총괄표제부 | "개별난방" |

### 2.3 보충 데이터 (MobileIMSupplementalInput)

| 필드 | 역할 |
|:---|:---|
| `resolved_address` | 확정 주소 (juso.go.kr 검증된) |
| `resolved_pnu` | 확정 PNU |
| `total_floor_count` | 브로커 수동 입력 층수 |
| `building_age_years` | 건물 연식 |
| `photos_v2` | 건물 외관 사진 (hero 지정) |

---

## 3. 생성 로직

### 3.1 AI 생성 경로

1. `im-context-builder.ts` → SSoT 4축 정규화 (`normalizeSsotLite`)
2. `narrative-prompt.ts` → 시스템 프롬프트 코어 + 유저 프롬프트 조립
3. `im-section-generator.ts` L98 → `generateSingleSection()` 호출
4. LLM 응답 → 할루시네이션 탐지 (가격·면적 20배 이탈 체크)
5. LLM-as-Judge 평가 (3.0 미만 → 폴백)
6. 용어 정규화 (`normalizeTerminologyAsync`)
7. Risk Boundary + Disclosure Guard

### 3.2 결정론적 폴백 (`premium-template-engine.ts`)

AI 실패 시 `generatePremiumTemplate('property_overview', ...)` 호출:
- SSoT + 공공데이터에서 직접 마크다운 생성
- 주소, 용도, 대지면적(평 환산), 연면적, 용적률/건폐율, 층수, 준공연도를 테이블로 표기
- "자산 하이라이트" 3대 포인트를 룰 기반으로 생성

### 3.3 토큰 제한

| 설정 | 값 |
|:---|:---|
| 기본 `maxTokens` | 1,000 |
| emphasize 시 | 2,000 (×2) |

---

## 4. 프롬프트 구성 상세

### 4.1 유저 프롬프트 구조

```markdown
## [섹션 작성 미션: property_overview]
이 건물이 '어떤 자산'인지 한눈에 파악할 수 있도록...

## [기본 건물 데이터 (SSoT)]
{ "area_signal": "당산역 역세권", "asset_type": "근린생활시설", ... }

## [공공 데이터 & 마켓 현황]
{ "buildingRegister": { "totalArea": 1441.15, ... }, ... }

## [추가 수집 데이터]
{ "monthly_rent_total_krw": 19460000, ... }

## [작성 요청]
위 데이터를 바탕으로 **property_overview** 섹션을 작성해 주세요.
```

### 4.2 공공데이터 부재 시

```markdown
## [공공 데이터 현황]
공적장부(건축물대장, 토지이용계획)를 조회하지 못했습니다.
아래 규칙을 반드시 지키세요:
- "브로커 제공 정보 기준" 또는 "건축물대장 확인 필요"를 병기하세요.
- "건축물대장 확인 결과"와 같은 표현을 절대 사용하지 마세요.
```

---

## 5. PPTX 매핑

| PPTX 요소 | 데이터 바인딩 |
|:---|:---|
| **왼쪽 영역**: 8행 스펙 테이블 | 주소, 용도, 대지면적, 연면적, 용적률, 건폐율, 층수, 준공연도 |
| **오른쪽 상단**: 건물 외관 사진 | `photos_v2[].isHero === true` |
| **오른쪽 하단**: "자산 하이라이트" 3불릿 | `buyerFit.fit_points[]` 또는 AI 생성 |

### PPTX 비중복 렌더링 원칙 (`.agents/AGENTS.md` 규칙)

> **왼측**: 자산 물리적 스펙 테이블 (정량 데이터)
> **우측**: 3대 핵심 매력 포인트 (가치 제안)
> ❌ 좌우 동일 불릿 중복 나열 금지

---

## 6. 골든 레퍼런스 영향

- **하드코딩 Golden**: property_overview에 직접 대응하는 예시는 없으나, income/development 전체 예시의 스타일(테이블 + 불릿 + 면책) 참조
- **DB 동적 Golden**: `buildIMFewShotBlock()` → 유사 자산 유형·가격대의 property_overview Golden이 있으면 Few-shot으로 주입
- **승격 기준**: Judge 점수 4.5 이상 시 자동 Golden 후보 등록

---

## 7. 출처 표기 (`data-provenance.ts`)

| 데이터 | 출처 배지 |
|:---|:---|
| 대지면적, 연면적, 용적률 | `public_data` "건축물대장 기준" |
| 매매 희망가 | `broker_input` "매도인 제공" |
| 3대 하이라이트 | `ai_inferred` "(AI 추정)" |
