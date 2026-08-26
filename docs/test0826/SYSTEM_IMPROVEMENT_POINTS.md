# 🔧 CRE-DealCard 시스템 고도화 개선 포인트

> **문서 ID**: `DOC-TEST0826-IMPROVEMENT-POINTS`  
> **작성일**: 2026-08-26  
> **근거**: 필동3가 44-5 / 당산동5가 11-47 공공데이터 API 추출 실험 및 코드베이스 정밀 감사  
> **범위**: API 정보 인출 로직 · 바텀시트 입력 로직 · IM 작성 파이프라인

---

## 📑 목차

1. [API 정보 인출 로직 개선](#1-api-정보-인출-로직-개선)
2. [바텀시트 입력 로직 개선](#2-바텀시트-입력-로직-개선)
3. [IM 작성 파이프라인 개선](#3-im-작성-파이프라인-개선)
4. [개선 우선순위 로드맵](#4-개선-우선순위-로드맵)

---

## 1. API 정보 인출 로직 개선

### 1.1 🔴 [Critical] PNU 합필(Merged Parcel) 자동 보정

**현상**: 당산동5가 11-47 추출 시, 행안부 도로명주소 API의 `bdMgtSn`이 합필된 42번지(당산 삼성 래미안 68,047㎡ 대단지)를 가리켜 실제 건물(호산당빌딩 506.8㎡)과 전혀 다른 데이터가 반환됨.

**원인 코드**: [`address-resolver.ts:L50`](file:///c:/Users/User/cre-dealcard/src/lib/external/address-resolver.ts#L50)
```typescript
const pnu = buildingMgtNo.substring(0, 19) || "1168010100108320000";
// bdMgtSn 25자리에서 앞 19자리를 무조건 PNU로 사용 → 합필 시 잘못된 필지 매핑
```

**추가 이슈**: [`address-resolver.ts:L332-345`](file:///c:/Users/User/cre-dealcard/src/domain/verification/address-resolver.ts#L332-L345)에 `resolveMultiParcelAddress()` 스텁이 존재하나 미구현 상태.

**개선안**:

| 단계 | 방법 | 난이도 |
|---|---|:---:|
| **A. 크로스 검증** | V-World `getLandCharacteristics`로 받은 `lndpclAr`(면적)과 건축물대장 `platArea`를 비교. **10배 이상 차이** 시 합필 의심 플래그 | 🟡 |
| **B. 지번 기반 PNU 재구성** | `jibunAddr`에서 본번·부번을 regex 추출 후 `법정동코드 + 1(일반) + 본번 + 부번`으로 PNU 직접 생성. 이미 regex 폴백 로직 존재(`L81`) → 이를 1차 검증용으로 격상 | 🟢 |
| **C. V-World PNU 이중 조회** | `bdMgtSn` 기반 PNU와 지번 기반 PNU 양쪽으로 V-World 조회 → 면적이 건축물대장 `platArea`와 일치하는 PNU 채택 | 🟡 |
| **D. `resolveMultiParcelAddress()` 구현** | 건축물대장 표제부의 `platArea`와 V-World `lndpclAr` 비교. 불일치 시 건축물대장 층별 데이터에서 다필지 PNU 목록 추출 | 🔴 |

> [!CAUTION]
> 이 이슈는 **준공업지역 대단지 인접 소형 빌딩**에서 빈번하게 발생합니다. 서울 주요 준공업지역(영등포, 성수, 구로, 금천)의 소형 매물에서 공시지가·용도지역이 아파트 단지 필지로 잘못 매핑되면 투자 분석 전체가 왜곡됩니다.

---

### 1.2 🟡 [High] V-World 신규 토지 속성 파이프라인 연결 누락

**현상**: V-World `getLandCharacteristics` API가 4개 고가치 토지 속성(`landShape`, `terrain`, `roadAccess`, `landUseSituation`)을 반환하지만, IM 작성 파이프라인에 미연결.

**현재 상태**:

| 필드 | V-World 반환 | `land-use-api.ts` 추출 | 온톨로지 등록 | IM 프롬프트 주입 | IM 렌더링 |
|---|:---:|:---:|:---:|:---:|:---:|
| `landShape` (토지형상) | ✅ 사다리형 등 | ✅ L74 | ✅ `slots.ts` L91 | ❌ | ❌ |
| `terrain` (지형고저) | ✅ 평지/완경사 | ✅ L75 | ✅ `enums.ts` L448 | ❌ | ❌ |
| `roadAccess` (도로접면) | ✅ 중로각지 등 | ✅ L76 | ✅ `b2c-labels.ts` | ⚠️ PPTX만 | ⚠️ PPTX만 |
| `landUseSituation` (이용상황) | ✅ 상업용 등 | ✅ L77 | ❌ | ❌ | ❌ |

**개선안**:
1. **`land-detail-renderer.ts`에 토지형태 테이블 추가**: 형상·지형·도로접면·이용상황을 마크다운 테이블로 렌더링
2. **`narrative-prompt.ts` / `site_analysis` 프롬프트에 주입**: 개발 포스처(development)에서 "사다리형 부지 → 건축 배치 제약", "중로각지 → 코너 가시성 우수" 등의 맥락 제공
3. **`data-quality-badge.ts`에 토지형태 보너스 점수**: `hasLandShape && hasTerrain` → +5점

---

### 1.3 🟡 [High] V-World / data.go.kr 중복 API 호출 제거

**현상**: `land-use-api.ts`와 `land-price-api.ts`가 **동일한 V-World 엔드포인트**(`getLandCharacteristics`)를 각각 독립 호출 → 동일 데이터를 2회 요청.

**현재 호출 흐름**:
```
enrichBuildingDataCore()
  ├─ fetchLandPrice()     → GET getLandCharacteristics?pnu=...  ← 1번째 호출
  ├─ fetchLandUsePlan()   → GET getLandCharacteristics?pnu=...  ← 2번째 호출 (동일!)
  └─ ... (6개 다른 API)
```

**개선안**: **`fetchVWorldLandCharacteristics(pnu)` 통합 함수** 신설
```typescript
// src/lib/external/vworld-land-api.ts (신규)
export async function fetchVWorldLandCharacteristics(pnu: string): Promise<VWorldLandData | null> {
  // 1회 호출로 용도지역 + 공시지가 + 토지형태 모두 추출
  // → LandUsePlanData + LandPriceData로 분리 반환
}
```
- `enrich-by-pnu.ts`에서 V-World 1회 호출 → 결과를 `landPrice`와 `landUsePlan` 양쪽에 분배
- API 호출 횟수 8→7로 감소, 응답 시간 단축

---

### 1.4 🟢 [Medium] 실거래가 필지 필터링 미구현

**현상**: 실거래가 API(`getRTMSDataSvcNrgTrade`)는 **시군구 전체** 거래를 반환. 필동3가 조회 시 중구 전체 173건이 반환되지만, 필동3가 인근 거래는 2건뿐.

**현재 코드**: [`real-transaction-api.ts:L63`](file:///c:/Users/User/cre-dealcard/src/lib/external/real-transaction-api.ts#L63) — 가격 아웃라이어만 필터링.

**개선안**:
1. **동 이름 필터**: 응답의 `umdNm`(읍면동명) 필드로 대상 법정동과 인접동 필터링
2. **거리 기반 필터**: 대상 좌표와 거래 좌표 간 직선거리 계산 → 1km 이내만 "인근 거래"로 분류
3. **2단계 출력**: ① 인근 거래 (1km 이내), ② 동일 시군구 참고 거래

---

### 1.5 🟢 [Medium] Vercel 배포 시 V-World Referer 미설정 위험

**현상**: V-World는 Referer 헤더 기반 도메인 인증. 현재 코드가 `NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'`으로 폴백.

**위험**: Vercel 배포 후 `NEXT_PUBLIC_SITE_URL` 미설정 시 → V-World API 인증 실패 → 토지이용/공시지가 전부 null 반환.

**개선안**:
1. `NEXT_PUBLIC_SITE_URL`을 Vercel 환경변수에 필수 등록
2. V-World API 키 발급 시 **localhost:3000 + 프로덕션 도메인** 모두 등록
3. 시작 시 환경변수 검증 로그 추가

---

### 1.6 🟢 [Medium] 캐시 TTL 불균형 및 V-World 소스 미등록

**현상**: [`external-data-orchestrator.ts:L17-25`](file:///c:/Users/User/cre-dealcard/src/lib/external/external-data-orchestrator.ts#L17-L25)의 `CACHE_TTL_BY_SOURCE`에 `vworld` 소스가 없음.

**현재 TTL**:

| 소스 | TTL | 적정성 |
|---|:---:|---|
| `building_register` | 90일 | ✅ |
| `land_price` | 365일 | ⚠️ 공시지가 연 1회 변경이나 V-World는 수시 업데이트 |
| `land_use_plan` | 180일 | ✅ |
| `comparable_tx` | 30일 | ✅ |
| `registry` | 7일 | ✅ |

**개선안**: `land_price` TTL을 180일로 단축, `_source: 'vworld'`일 때 별도 TTL 적용 고려

---

### 1.7 🟢 [Low] 산지 필지(山) PNU 생성 오류

**현상**: [`address-resolver.ts:L98`](file:///c:/Users/User/cre-dealcard/src/lib/external/address-resolver.ts#L98)에서 대지구분을 `1`(일반)로 하드코딩.

```typescript
const pnu = `${legalDongCode}1${bun}${ji}`;  // '1' = 일반, '2' = 산
```

산지 주소(예: "관악구 남현동 산 1-1")에서 PNU가 잘못 생성됨.

**개선안**: 주소에 '산' 키워드 포함 시 대지구분을 `2`로 설정

---

## 2. 바텀시트 입력 로직 개선

### 2.1 🔴 [Critical] PNU 선택 시 V-World 토지 정보 자동 프리필 미구현

**현상**: 주소 검색 후 PNU가 확정되면 건축물대장은 자동 조회되지만, **V-World 토지특성(용도지역/공시지가/형상/도로접면)은 바텀시트에서 조회·표시되지 않음**. 사용자가 수동으로 알고 있어야 함.

**개선안**:
1. **주소 선택 즉시** `fetchVWorldLandCharacteristics(pnu)` 호출
2. 바텀시트 상단 인포 카드에 즉시 표시:
   ```
   📍 용도지역: 준공업지역 | 공시지가: 748만원/㎡
   📐 형상: 사다리형 | 지형: 평지 | 도로: 중로각지
   ```
3. 필지 섹션(`ParcelSection`)에 공시지가 자동 프리필

---

### 2.2 🟡 [High] 합필 필지 경고 UI 부재

**현상**: 행안부 API PNU와 실제 지번 PNU가 다를 때(합필 케이스), 사용자에게 아무런 경고가 없음. 잘못된 데이터가 IM에 그대로 반영될 위험.

**개선안**:
1. PNU 해석 후 V-World 면적과 건축물대장 대지면적 비교
2. **10배 이상 차이** 시 경고 배지 표시:
   ```
   ⚠️ 합필 필지 감지: 행안부 PNU 기준 대지 68,047㎡ ≠ 건축물대장 506.8㎡
   지번 기반 PNU로 자동 보정하시겠습니까? [자동 보정] [무시]
   ```
3. 자동 보정 선택 시 지번 regex PNU로 V-World 재조회

---

### 2.3 🟡 [High] 필지 섹션(ParcelSection) 수동 입력 의존

**현상**: [`ParcelSection.tsx:L6-35`](file:///c:/Users/User/cre-dealcard/src/app/(broker)/broker/deal-card/[id]/bottom-sheet/sections/ParcelSection.tsx#L6-L35)에서 필지 정보(PNU, 지목, 면적, 지분율, 공시지가)를 **전부 수동 입력**해야 함.

**개선안**:
1. PNU 확정 시 V-World에서 `lndcgrCodeNm`(지목), `lndpclAr`(면적), `pblntfPclnd`(공시지가)를 자동 프리필
2. 다필지인 경우 건축물대장의 `platArea`와 V-World `lndpclAr` 차이로 추가 필지 존재 암시 → "필지 추가" 유도

---

### 2.4 🟡 [High] 데이터 등급(Grade) 산정 시 V-World 데이터 미반영

**현상**: [`data-quality-badge.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/data-quality-badge.ts)의 등급 산정에서 `hasPublicData` (+20점)는 건축물대장 존재만 확인. **V-World 토지특성 확보 여부가 반영되지 않음**.

**개선안**:

| 포스처 | 현재 가중치 | 추가 제안 |
|---|---|---|
| `development` | `hasZoning` +15 | `hasLandShape + hasTerrain + hasRoadAccess` → +5 추가 |
| `income` | 없음 | `hasOfficialLandPrice` → +5 (공시지가 기반 토지가치 산출) |
| `trading` | `hasPublicData` +15 | `hasOfficialLandPrice` → +5 (매각가 vs 공시가 비율) |
| 공통 | `hasPublicData` +20 | `hasVWorldData` → 기존 +20에 포함하되, V-World 성공 시 "확인됨" 뱃지 |

---

### 2.5 🟢 [Medium] 용도지역별 법정 한도 자동 표시

**현상**: 사용자가 건폐율·용적률을 수동 입력하거나 건축물대장에서 가져오지만, **법정 상한과의 비교(잔여 용적률)가 바텀시트에서 보이지 않음**.

**개선안**: V-World 용도지역 확인 → `inferZoningLimits()` 결과를 바텀시트에 즉시 표시
```
📊 현재 용적률 222% / 법정 400% (잔여 178%p)
💡 개발 포스처 전환 시 잔여 용적률 기반 사업성 분석이 포함됩니다
```

---

### 2.6 🟢 [Medium] 매각가 vs 공시가치 비율 자동 산출

**현상**: 바텀시트에서 매각가(askingPrice)와 공시지가가 별개로 존재하나, **매각가 ÷ 대지공시가치** 비율이 자동 계산되지 않음.

**개선안**: `askingPrice > 0 && officialLandPrice > 0` 시 자동 표시
```
💰 매각가 115억 / 대지 공시가치 37.9억 = 3.03배
```
- 투자자에게 "공시가 대비 프리미엄" 지표는 매우 중요한 의사결정 기준

---

## 3. IM 작성 파이프라인 개선

### 3.1 🔴 [Critical] `land-detail-renderer.ts`에 V-World 토지형태 미반영

**현상**: [`land-detail-renderer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/section-renderers/land-detail-renderer.ts)가 필지 테이블(PNU, 지목, 면적, 공시지가, 건폐율/용적률)만 렌더링. **토지 형상·지형·도로접면이 누락**.

**개선안**: `land_detail` 섹션에 토지형태 서브테이블 추가

```markdown
### 토지 형태
| 항목 | 내용 |
|---|---|
| 형상 | 사다리형 |
| 지형 | 평지 |
| 도로접면 | 중로각지 (코너 입지, 가시성 우수) |
| 이용상황 | 상업용 |
```

특히 **development 포스처**에서는 부지 형상이 건축 배치에 직결되므로, `site_analysis` 섹션 프롬프트에도 주입 필요.

---

### 3.2 🟡 [High] 개발 포스처 site_analysis에 잔여 용적률 기반 시뮬레이션

**현상**: 현재 `site_analysis`는 LLM이 용도지역과 면적을 텍스트로 서술하지만, **잔여 용적률 기반 증축 가능 면적 산출** 로직이 없음.

**개선안**: `premium-template-engine.ts`에 결정론적 계산 추가

```typescript
// 잔여 용적률 기반 개발 가능 면적
const maxTotalArea = landAreaSqm * (floorAreaRatioMax / 100);
const currentTotalArea = existingTotalArea;
const additionalArea = maxTotalArea - currentTotalArea;
const additionalAreaPyeong = additionalArea / 3.30578;
```

출력 예시:
```
현재 연면적 1,441㎡ (436평) → 법정 상한 2,027㎡ (613평)
잔여 개발 가능 면적: 약 586㎡ (177평)
```

---

### 3.3 🟡 [High] 공시가 대비 매각가 비율 → 투자 분석 자동 삽입

**현상**: `income_analysis`와 `investment_thesis`에서 매각가 대비 공시가 비율이 언급되지 않음.

**개선안**:
- `NumericalAnchors`에 `officialLandValueKrw` 추가
- `investment_thesis` 프롬프트에 주입: "공시지가 기준 토지 가치 {value}억원, 매각가 대비 {ratio}배"
- 비율이 1.5배 미만이면 "공시가 근접 매물" 하이라이트, 3배 초과면 "프리미엄 주의" 경고

---

### 3.4 🟡 [High] 도로접면 정보 → location_access 섹션 자동 반영

**현상**: `location_access` 섹션은 지하철역·버스 등 교통만 서술. **도로접면 유형(중로각지, 세로한면 등)**이 부동산 가치에 큰 영향을 미치나 누락.

**개선안**:
- `roadAccess` 필드를 `location_access` 프롬프트 컨텍스트에 주입
- 도로접면 등급 매핑:

| V-World 코드 | 의미 | 가치 영향 |
|---|---|---|
| 광대소각 / 광대세각 | 25m 이상 대로 + 각지 | ⬆️⬆️ 최고 가시성 |
| 중로각지 | 12~25m 중로 + 코너 | ⬆️ 우수 |
| 세로한면(가) | 8m 이상 소로 + 한면 | 보통 |
| 세로한면(나/다) | 8m 미만 소로 | ⬇️ 접근성 제한 |
| 맹지 | 도로 미접 | ⬇️⬇️ 개발 제약 |

---

### 3.5 🟢 [Medium] 실거래가 비교 분석 고도화

**현상**: [`comparables-renderer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/section-renderers/comparables-renderer.ts)가 평당가 기반 할인/프리미엄만 산출. **동일 용도지역·유사 규모** 필터링 없이 시군구 전체 거래를 비교 대상으로 사용.

**개선안**:
1. V-World 용도지역으로 동일 용도 거래만 필터 (준공업 ↔ 준공업)
2. 대지면적 ±50% 범위 필터
3. 건축연도 ±10년 필터
4. 필터 후 "유사 물건 평균 평당가" vs "대상 매물 평당가" 비교

---

### 3.6 🟢 [Medium] heroCard에 토지 공시가치 추가

**현상**: [`writer.ts:L375-388`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts#L375-L388) heroCard에 `zoning`은 있으나, `officialLandValue`(대지 공시가치)는 없음.

**개선안**: 
```typescript
heroCard.officialLandValue = landAreaSqm * pricePerSqm; // 원
heroCard.askingToOfficialRatio = askingPriceKrw / heroCard.officialLandValue;
```

---

### 3.7 🟢 [Low] PPTX data-binder에 V-World 신규 필드 반영

**현상**: PPTX data-binder(`pptx/data-binder.ts` L1454, L1592)에 `roadAccess`는 부분 연결되어 있으나, `landShape`, `terrain`, `landUseSituation`은 PPTX 슬라이드에 미반영.

**개선안**: A04/A05 토지 분석 슬라이드에 형상·지형·이용상황 데이터 바인딩 추가

---

### 3.8 🟢 [Low] data.go.kr / V-World 이중 클라이언트 정리

**현상**: 정부 API 클라이언트가 2세트 존재:
- `src/lib/external/*` — 실제 프로덕션 8-API 엔진
- `src/domain/verification/govt-api-client.ts` + `src/domain/external/gov-premium-apis.ts` — 레거시 검증/목업

**개선안**: 레거시 클라이언트를 `src/lib/external/` 통합 클라이언트로 마이그레이션하고, 중복 코드 제거

---

## 4. 개선 우선순위 로드맵

### Phase 1: 즉시 적용 (1~2일)

| # | 개선 항목 | 영향도 | 파일 |
|:---:|---|:---:|---|
| 1.2 | V-World 토지 속성 → `land-detail-renderer.ts` 연결 | 🔴 | `land-detail-renderer.ts` |
| 1.3 | V-World 중복 호출 제거 (통합 함수) | 🟡 | `enrich-by-pnu.ts`, 신규 `vworld-land-api.ts` |
| 1.5 | Vercel `NEXT_PUBLIC_SITE_URL` + `VWORLD_API_KEY` 등록 | 🟡 | Vercel 환경변수 |

### Phase 2: 단기 개선 (3~5일)

| # | 개선 항목 | 영향도 | 파일 |
|:---:|---|:---:|---|
| 1.1-B | PNU 지번 기반 크로스 검증 + V-World 면적 비교 | 🔴 | `address-resolver.ts`, `enrich-by-pnu.ts` |
| 2.1 | 바텀시트 PNU 선택 → V-World 토지 정보 프리필 | 🔴 | `im-data-bottom-sheet.tsx` |
| 2.2 | 합필 경고 UI | 🟡 | `im-data-bottom-sheet.tsx` |
| 3.2 | 잔여 용적률 기반 개발 면적 시뮬레이션 | 🟡 | `premium-template-engine.ts` |
| 3.3 | 공시가 대비 매각가 비율 → 투자 분석 | 🟡 | `writer.ts`, 프롬프트 |

### Phase 3: 중기 고도화 (1~2주)

| # | 개선 항목 | 영향도 | 파일 |
|:---:|---|:---:|---|
| 1.1-D | `resolveMultiParcelAddress()` 완전 구현 | 🔴 | `address-resolver.ts` |
| 1.4 | 실거래가 필지 필터링 (동/거리/용도) | 🟡 | `real-transaction-api.ts` |
| 2.4 | 데이터 등급에 V-World 가중치 추가 | 🟡 | `data-quality-badge.ts` |
| 3.4 | 도로접면 → location_access 자동 반영 | 🟡 | 프롬프트, `land-detail-renderer.ts` |
| 3.5 | 실거래가 유사 물건 필터 비교 분석 | 🟡 | `comparables-renderer.ts` |
| 3.8 | 레거시 정부 API 클라이언트 통합 | 🟢 | `govt-api-client.ts`, `gov-premium-apis.ts` |

---

> [!IMPORTANT]
> **가장 시급한 3가지**: ① PNU 합필 자동 보정 (1.1) — 데이터 정합성의 근본 ② V-World 토지 속성 파이프라인 연결 (1.2, 3.1) — 이미 데이터는 확보했으나 미사용 ③ 바텀시트 토지정보 프리필 (2.1) — UX 개선 + 데이터 등급 자동 향상

---

*본 문서는 필동3가 44-5(크로바빌딩) 및 당산동5가 11-47(호산당빌딩) API 추출 과정에서 발견된 실제 이슈와 코드베이스 정밀 감사 결과를 기반으로 도출되었습니다.*
