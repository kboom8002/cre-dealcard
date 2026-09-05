# 02. 데이터 소유권 및 게이트 인벤토리 감사 보고서 (Data Ownership & Gate Inventory)

> **문서 식별자**: `CIM-M0-INVENTORY-v1.0`  
> **감사 일자**: 2026-09-03  
> **상태**: 동결 (Baseline Frozen)  

## 1. 데이터베이스 및 스토리지 소유권 매핑

| 엔터티 / 테이블 | 현행 역할 | 신규 소유 모듈 | 전환 원칙 |
|---|---|---|---|
| `document_objects` | IM 상태, 섹션 본문(`body`) 저장 | `im-core/compat` | 신규 사실정본 갱신 금지, 읽기 어댑터로만 보존 |
| `buildings_ssot_lite` | 건물 기본 마스터 | `im-core/evidence` | 원시 참조키로 보존, 스냅샷 생성의 입력 |
| `building_enrichments` | 공공 API / AI 분석 부가 데이터 | `im-core/evidence` | 관측값(`observations`) 추출의 입력 |
| `approval_records` (레거시) | 과거 승인 이력 | `im-core/approval` | 과거 감사용 읽기 전용 보존, 신규 승인권한 불가 |
| `deal_runs` (신규) | 거래건 전체 실행 오케스트레이션 | `im-pipeline` | 신규 파이프라인 마스터 |
| `artifact_envelopes` (신규) | 불변 산출물 봉투 | `im-pipeline/artifacts` | 스키마 버전 및 SHA-256 해시 결속 보관 |
| `harness_reports` (신규) | 7-상태 게이트 검사 보고서 | `assurance/im-harness` | 불변 판정 보고서 |

## 2. 게이트 인벤토리 현황

1. **`quality-gates-v02.ts` (발행 차단 게이트 G01 ~ G53)**:
   - G01: 최소 데이터 존재 (대지면적, 연면적, 매매가)
   - G07: 자리표시자(`{{...}}`, NaN) 잔존 검사
   - G10: 모든 CapRate 산출식에 yieldBasis 명시
   - G20: 사진 내 개인정보(PII) 확인 여부
   - G41~G45: 공실 모순, 중복 폴백, 괄호 균형 등
   - G48~G53: 미해결 Conflict, 미근거 Claim, 기준일 미표기, 면수 초과, 토허구 미표기
2. **품질 권고 게이트 (QG09 ~ QG16)**:
   - CapRate 하락 시나리오 포함, 토지거래허가구역 안내 등 경고(WARNING)성 지표.
3. **결정론 게이트 (`deterministic-gates.ts`)**:
   - QG19(임대차 합계 일치), C19(전용면적 대 연면적 비율), C-BASIS(수익률 기준 정합) 등.
