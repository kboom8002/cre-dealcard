# 섹션 2: location_access (입지 분석)

> **Full IM 대응**: `location_access`
> **전 포스처 공통**: ✅ | **PPTX 아키타입**: A06 (Location)

---

## 1. 섹션 미션 (Section Mission)

```
이 입지가 왜 투자 가치가 있는지(대중교통 접근성, 주변 인프라, 권역 프리미엄)를 설명하고,
첫 문장에 입지의 핵심 우위
(예: '더블역세권 도보 4분, 유동인구 풍부한 핵심 상권')를 선언하세요.
```

> **소스**: [`narrative-prompt.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/narrative-prompt.ts) L260

---

## 2. 데이터 소스 계층 (Data Sources)

### 2.1 카카오맵 POI (`ExternalDataSnapshot.locationPoi`)

| 필드 | 예시 | 용도 |
|:---|:---|:---|
| `nearestStation.name` | "당산역" | 최근접 역명 |
| `nearestStation.distanceM` | 380 | 도보 거리 (m) |
| `nearestStation.walkMinutes` | 5 | 도보 시간 (분) |
| `poiCounts.subway` | 2 | 반경 내 지하철역 수 |
| `poiCounts.busStop` | 8 | 버스 정류장 수 |
| `poiCounts.cafe` | 45 | 카페 수 (상권 활성도) |
| `poiCounts.restaurant` | 120 | 음식점 수 |
| `poiCounts.convenience` | 15 | 편의점 수 |
| `poiCounts.parking` | 12 | 주차장 수 |

> **API**: `fetchLocationPoi(lat, lng)` → 카카오 로컬 API `dapi.kakao.com/v2/local/search/category.json`
> **소스**: [`kakao-map-api.ts`](file:///c:/Users/User/cre-dealcard/src/lib/external/kakao-map-api.ts)

### 2.2 카카오 Static Map (`ExternalDataSnapshot.mapImageUrl`)

- **URL 생성**: `buildKakaoStaticMapUrl(lat, lng, 1280, 960)` → spi.maps.daum.net 스태틱 맵
- **PPTX 삽입**: 1280×960 이미지를 A06 슬라이드 좌측에 배치
- **폴백**: `KAKAO_REST_API_KEY` 미설정 시 placehold.co 이미지

> **소스**: [`kakao-static-map.ts`](file:///c:/Users/User/cre-dealcard/src/lib/external/kakao-static-map.ts)

### 2.3 토지이용계획 (`ExternalDataSnapshot.landUsePlan`)

| 필드 | 예시 | 용도 |
|:---|:---|:---|
| `zoningDistrict` | "준공업지역" | 용도지역 |
| `zoningOverlap[]` | ["방화지구"] | 중첩 지역·지구 |
| `buildingCoverageMax` | 70 | 법정 건폐율 상한 (%) |
| `floorAreaRatioMax` | 400 | 법정 용적률 상한 (%) |

> **API**: `fetchLandUsePlan(pnu)` → 토지이용계획확인서 API
> **소스**: [`land-use-api.ts`](file:///c:/Users/User/cre-dealcard/src/lib/external/land-use-api.ts)

### 2.4 상권 분석 (`ExternalDataSnapshot.commercialDistrict`)

| 필드 | 예시 | 용도 |
|:---|:---|:---|
| 상권 유형 | "골목상권" | 상권 분류 |
| 업종 밀도 | 의료·외식 | 핵심 업종 |
| 유동인구 | 12,500명/일 | 배후 수요 |

> **API**: `fetchCommercialDistrictFull(pnu)` → 소상공인시장진흥공단 SEMAS API
> **소스**: [`semas-commercial-api.ts`](file:///c:/Users/User/cre-dealcard/src/lib/external/semas-commercial-api.ts)

### 2.5 SSoT 필드

| 필드 | 예시 |
|:---|:---|
| `area_signal` | "당산역 역세권" |
| `location_analysis` | "당산역 도보 5분, 2·9호선 더블역세권" |

### 2.6 위치 보조 모듈 (`location-aspects.ts`)

[`location-aspects.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/location-aspects.ts) — 입지 요소를 4개 카테고리로 구조화:
- **교통**: 역세권 정보, 버스 접근성
- **배후수요**: 업무·주거 인구, 상권 활성도
- **권역특성**: 용도지역, 규제 환경
- **규제완화수혜**: 용적률 상향, 지구단위계획 등

---

## 3. 생성 로직

### 3.1 AI 생성 경로

1. SSoT의 `area_signal`, `location_analysis` + 공공데이터 POI + 상권 분석 결과를 유저 프롬프트에 주입
2. 카카오맵 POI 데이터로 "도보 N분" 정량 수치 제공
3. LLM이 교통·배후·권역·규제 4가지 관점에서 서술
4. 용어 정규화 후 최종 출력

### 3.2 토큰 제한

| 설정 | 값 |
|:---|:---|
| 기본 `maxTokens` | **1,500** (7섹션 중 최대) |
| emphasize 시 | 3,000 |

> 입지 분석은 정성적 서사가 길어질 수 있어 기본 토큰이 가장 높습니다.

### 3.3 결정론적 폴백

`premium-template-engine.ts` → 공공데이터 기반:
- "○○역 도보 N분 (직선 Nm)" 자동 계산
- POI 수치 기반 "카페 N곳, 음식점 N곳, 편의점 N곳" 테이블
- 용도지역·용적률 정보 포함

---

## 4. PPTX 매핑 (A06 Location)

| PPTX 요소 | 데이터 바인딩 |
|:---|:---|
| **왼측**: 카카오 Static Map 이미지 | `mapImageUrl` (1280×960) |
| **우측 상단**: 입지 분석 4행 테이블 | 교통 / 배후수요 / 권역특성 / 규제완화수혜 |
| **우측 하단**: 입지 서사 텍스트 | AI 생성 줄글 |

### 비중복 렌더링

> **왼측**: 시각적 지도 (위치 직관적 인지)
> **우측**: 4개 카테고리별 정량·정성 분석 테이블
> ❌ 지도 위 텍스트와 우측 테이블 내용 중복 금지

---

## 5. 포스처별 차이

입지 분석 섹션은 전 포스처에서 동일한 미션으로 생성됩니다.
다만 `getPosturePromptOverlay()` 기본 컨텍스트가 적용됩니다:

| 포스처 | 오버레이 컨텍스트 |
|:---|:---|
| income | "임대수익 극대화 및 안정적 현금흐름 관점에서 서술하세요." |
| development | "개발 사업의 타당성과 수익성 관점에서 서술하세요." |
| owner_occupied | "자가사용 비용절감 및 자산가치 관점에서 서술하세요." |
| operating | "직영 운영 수익성과 GOP 마진 관점에서 서술하세요." |
| trading | "매매차익 실현 가능성 및 시세 갭 관점에서 서술하세요." |

---

## 6. 출처 표기

| 데이터 | 출처 배지 |
|:---|:---|
| 최근접 역 거리 | `public_data` "카카오맵 기준" |
| 용도지역 | `public_data` "토지이용계획확인서 기준" |
| 상권 활성도 | `public_data` "소상공인시장진흥공단 기준" |
| 권역 프리미엄 평가 | `ai_inferred` "(AI 추정)" |
