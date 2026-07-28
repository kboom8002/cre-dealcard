# GAP-1: API Slot Mapping (API ↔ Ontology)

> **버전**: v1.0
> **관련 태스크**: S1-T5
> **목적**: 7대 공공/외부 API 응답 필드를 `credeal-ontology-v0.1.yaml` 슬롯에 매핑하는 규칙 정의
> **주의**: 이 문서는 API 응답 처리 모듈의 SSoT로 기능하며, 모든 매핑은 Provenance Tier와 함께 기록되어야 합니다.

## 1. 건축물대장 API (표제부 · 층별개요)

| API 필드 (응답 키) | 온톨로지 슬롯 | 변환 규칙 (Transformation) | Provenance Tier | 비고 |
|---|---|---|---|---|
| `totArea` | `totalFloorArea` | `parseFloat(val)` (m²) | public_data | 연면적 |
| `platArea` | `landArea` | `parseFloat(val)` (m²) | public_data | 대지면적 |
| `bcRat` | `bcrPct` | `parseFloat(val)` (%) | public_data | 건폐율 |
| `vlRat` | `farPct` | `parseFloat(val)` (%) | public_data | 용적률 |
| `grndFlrCnt` | `floorsAbove` | `parseInt(val, 10)` | public_data | 지상 층수 |
| `ugrndFlrCnt` | `floorsBelow` | `parseInt(val, 10)` | public_data | 지하 층수 |
| `useAprDay` | `approvalDate` | `YYYYMMDD` → `YYYY-MM-DD` | public_data | 사용승인일 |
| `totPkngCnt` | `parkingCapacity` | `parseInt(val, 10)` | public_data | 주차 대수 |
| `rideUseElvtCnt` | `elevatorCount` | 승용 + 비상용 합산 | public_data | 승강기 수 |
| `strctCdNm` | (내부 참조용) | 구조 문자열 유지 | public_data | 건물 구조 |
| `mainPurpsCdNm` | (내부 참조용) | 주용도 문자열 유지 | public_data | 건물 주용도 |

## 2. 토지이용계획 API (토지이음/LURIS)

| API 필드 (응답 키) | 온톨로지 슬롯 | 변환 규칙 (Transformation) | Provenance Tier | 비고 |
|---|---|---|---|---|
| `prposAreaDnm` | `zoningRegion` | 정규식 매칭 → `enums:zoningRegion` 키로 변환 | public_data | 용도지역 (예: 제2종일반주거지역 → R2G) |
| `prposAreaDnm` | `landUsePermitZone` | "토지거래계약에관한허가구역" 포함 여부 (boolean) | public_data | 토지거래허가구역 |
| `prposAreaDnm` | `districtPlan` | "지구단위계획구역" 포함 여부 (boolean) | public_data | 지구단위계획 저촉 여부 |
| `prposAreaDnm` | `donationRatioPct` | 구역 내 기부채납 관련 규정 시 파싱 (또는 expert_verified 보완) | ai_inferred | 정밀 파싱 필요 |

## 3. 브이월드 (V-World) 토지특성 / 개별공시지가 API

키 기준: 필지고유번호(PNU) 19자리

| API 필드 (응답 키) | 온톨로지 슬롯 | 변환 규칙 (Transformation) | Provenance Tier | 비고 |
|---|---|---|---|---|
| `pnilp` | `officialLandPrice` | `parseInt(val, 10)` (원/m²) | public_data | 개별공시지가 |
| `lndcgrCodeNm` | `landCategory` | 코드명칭 → `enums:landCategory` (예: 대 → DAE) | public_data | 지목 |
| `tpgrphFrmCodeNm`| `landShape` | 형상코드 → `enums:landShape` (예: 정방형 → SQUARE) | public_data | 토지 형상 |
| `tpgrphHgCodeNm` | `landSlope` | 고저코드 → `enums:landSlope` (예: 평지 → FLAT) | public_data | 토지 고저 |
| `roadSideCodeNm` | `roadContactType` | 도로접면코드 → `enums:roadContactType` (예: 세로(가) → NARROW_ONE) | public_data | 도로접면 |

## 4. 실거래가 API (국토교통부 / 디스코 등 연계)

| API 필드 (응답 키) | 온톨로지 슬롯 | 변환 규칙 (Transformation) | Provenance Tier | 비고 |
|---|---|---|---|---|
| `dealAmount` | (비교사례) | 3년 내 반경 500m 이내 거래가 평당 환산 (원/3.3m²) | public_data | 비교사례 가격 산정 |
| `dealAmount` (집계) | `neighborAvgPerPyung` | 권역/유사 자산군의 최근 1년 평균 평당 단가 | ai_inferred | 주변 평균 평당가 |
| (집계 데이터) | `regional_avg_capRate` | 권역별 평균 수익률 맵 매핑 | ai_inferred | 권역 평균 Cap Rate |

## 5. 카카오 로컬 / POI API

| API 필드 (응답 키) | 온톨로지 슬롯 | 변환 규칙 (Transformation) | Provenance Tier | 비고 |
|---|---|---|---|---|
| `x`, `y` | `regionCode` | 좌표 → 행정구역 매핑 → `enums:region` 코드로 변환 | ai_inferred | 권역 코드 도출 |
| `distance` (지하철) | `subwayWalkMin` | 카테고리 'SW8' 최단거리 도보 시간 계산 (거리(m) / 67m/분) | ai_inferred | 역세권 도보시간 |
| `distance` (IC) | `nearestIc` | 카테고리 교통(IC) 명칭 추출 | ai_inferred | 물류센터 최근접 IC |
| `distance` (IC) | `icDistanceKm` | 최단거리(m) → km 단위 소수점 1자리 | ai_inferred | IC 주행거리 |

## 6. 등기부 / 계약서 OCR (문서 추출 파이프라인)

| API 필드 (응답 키) | 온톨로지 슬롯 | 변환 규칙 (Transformation) | Provenance Tier | 비고 |
|---|---|---|---|---|
| `채권최고액` | `seniorLoanKrw` | 합계액 추출 → 만원 단위 환산. (실채무액 계산 로직 필요 시 적용) | expert_verified / ai_inferred | 선순위 대출 잔액 |
| 렌트롤 표 | `rentRoll` | 표 구조 파싱 → `LeaseUnit` 배열 매핑 (floor, areaPyung, depositKrw 등) | broker_input / expert_verified | 층별 임대차 |
| `전입일자` | `opposingPower` | 전입일자와 근저당 설정일 비교 로직 (boolean) | ai_inferred / expert_verified | 대항력 여부 |

## 7. 음성 메모 및 외부 소스 (MemoParser)

| API 필드 (응답 키) | 온톨로지 슬롯 | 변환 규칙 (Transformation) | Provenance Tier | 비고 |
|---|---|---|---|---|
| 음성: `가격` | `askingPriceKrw` | 자연어 가격 → 만원 단위 정수 | broker_input | 매각 희망가 |
| 음성: `공실` | `vacancyPct` | "전체 공실", "1층 공실" 등 파싱 → 비율(%) 계산 | broker_input | 공실률 |
| 음성: `명도` | `evictionStatus` | 키워드("명도 완료", "협의 중") → `enums:evictionStatus` | broker_input | 명도 상태 |
| 규모검토 문서 | `buildableFloorArea` | PDF 내 면적표에서 '신축 연면적' 수치 추출 | expert_verified | 신축 가능 연면적 |

## 8. Fallback Strategies (API 가용성 문제 시)

공공 API 장애 또는 해당 데이터 누락(맹지, 신축 등) 시 다음의 폴백 전략을 적용합니다.

1. **건축물대장 누락 시**: 
   - 토지대장의 `platArea`(대지면적)만 사용. 
   - `totalFloorArea`, `approvalDate` 등은 `broker_input`으로 수동 입력을 요청(Missing 필드 마킹).
2. **토지이용계획 (zoningRegion) 누락 시**:
   - 주소지 기반의 광역 단위 조례 기본값 사용은 위험하므로, **필수 입력(required)** 플래그를 띄워 중개인 확인 유도.
3. **카카오 POI (도보시간/IC 거리) 타임아웃 시**:
   - 직선 거리 기준으로 임시 계산 후, `ai_inferred` 배지와 함께 "직선거리 기준 추정치" 경고 문구 추가.
4. **V-World 공시지가 누락 시**:
   - `officialLandPrice`를 0 또는 null 처리하고, 금융 산식에서 공시지가 기반 추정액(예: 토지 가치) 계산을 생략.
