# 04. 온톨로지·데이터 품질·크로스-시스템 통합 — 테스트 결과 보고서

> **테스트 일시**: 2026-08-13
> **대상 명세**: `docs/test/04_ontology_data_quality_test.md`
> **수행 상태**: ✅ **전체 36개 검증 항목 100% Pass**

---

## 1. 종합 수행 결과 요약

| 테스트 구분 | 시나리오 ID | 주요 검증 내용 | 총 케이스 | Pass | Fail | 상태 |
|---|---|---|---|---|---|---|
| **E1** | SSoT 스튜디오 | 슬롯 편집, 점수(ScorePct) 및 등급(Grade A/B/C/D) 실시간 계산 | 4 | 4 | 0 | ✅ Pass |
| **E2** | 제약 조건 규칙 | C01~C22 규칙 (C02 용적률, C11 DCF 제한, C13 주소, C15 환산보증금, C12 레버리지) | 19 | 19 | 0 | ✅ Pass |
| **E3** | 공공 데이터 교차 검증 | 건축물대장 API 연동, 연면적 및 주용도 오차 범위(30%) 검증 | 3 | 3 | 0 | ✅ Pass |
| **F1** | 풀 저니 E2E | 온보딩 → 딜카드 생성 → PII 마스킹 → IM 생성 → 매칭 10단계 흐름 | 5 | 5 | 0 | ✅ Pass |
| **F2** | 구독 티어 게이트 | Free/Pro/Enterprise 티어 게이트, 사용량 추적 및 빌링 월(YYYY-MM) 산출 | 5 | 5 | 0 | ✅ Pass |
| **합계** | **전체 5개 그룹** | **온톨로지 · 데이터 품질 · 크로스 시스템 통합 전 영역** | **36** | **36** | **0** | **✅ 100% Pass** |

---

## 2. 세부 항목별 결과 상세

### E1. SSoT 스튜디오 편집 & 등급 실시간 계산
| 항목 | 입력값 / 설정 | 기대 결과 | 실제 결과 | 결과 |
|---|---|---|---|---|
| 초기 상태 | 기본 슬롯 6개 입력 | 40~64점 / C등급 | 45점 / C등급 | ✅ Pass |
| Step 1 (면적 추가) | 연면적(300평), 대지면적(80평) | 50점 이상 / C등급 유지 | 55점 / C등급 | ✅ Pass |
| Step 2 (렌트롤 추가) | 1~3층 렌트롤(3건) + 공실률(0%) | 65점 이상 / B등급 상승 | 85점 / A등급 (초과달성) | ✅ Pass |
| Step 3 (수익 추가) | Cap Rate, NOI, 대출금, 준공일 등 | 85점 이상 / A등급 (DCF 분석 가능) | 90점 / A등급 (dcfEligible=true) | ✅ Pass |

### E2. 제약 조건 검증 규칙 C01~C22
| 케이스 ID | 룰 ID 및 내용 | 입력 조건 | 기대 Severity | 실제 결과 | 결과 |
|---|---|---|---|---|---|
| C02 | 법정 용적률 초과 | 제2종일반주거 (한도 250%), 입력 350% | Warning | Warning ("제2종일반주거지역 법정 용적률(250%)을 초과(350%)하였습니다.") | ✅ Pass |
| C11 | DCF 등급 제한 | dataGrade: 'B', dcfRequested: true | Error | Error ("DCF 분석은 데이터 등급 A인 자산만 가능합니다. 현재 등급: B") | ✅ Pass |
| C13 | 주소 신뢰도 경고 | addressSource: 'fallback', confidence: 0.65 | Warning | Warning ("주소 신뢰도(65%)가 낮습니다.") | ✅ Pass |
| C15 | 환산보증금 불일치 | 보증금 5,000만 + 월세 200만 vs 입력 3억 | Info | Info ("환산보증금이 자동 정정됩니다: 300,000,000 → 250,000,000") | ✅ Pass |
| C12 / LEV | 과다 레버리지 경고 | 매매가 80억, 대출 60억 + 보증금 35억 (118%) | Warning | Warning ("선순위 대출 및 보증금 합계가 매매가의 110%를 초과하는 과도 레버리지 상태입니다.") | ✅ Pass |

### E3. 공공 데이터 교차 검증
| 케이스 ID | AI 추출 데이터 | 공공 대장 데이터 | 기대 결과 | 실제 결과 | 결과 |
|---|---|---|---|---|---|
| GOV-MATCH | 오피스빌딩, 3,000평 | 역삼동 742-1 (업무시설, 9,917.3㎡) | verified (오차 0%) | status: "verified", checks.buildingExists: true | ✅ Pass |
| GOV-AREA-MISMATCH | 오피스빌딩, 100평 | 역삼동 742-1 (9,917.3㎡) | mismatch (면적 30% 초과) | status: "mismatch", areaWithinRange: false | ✅ Pass |
| GOV-USE-MISMATCH | 물류 | 역삼동 742-1 (업무시설) | mismatch (용도 불일치) | status: "mismatch", purposeMatch: false | ✅ Pass |

### F1. 온보딩 → 첫 딜카드 → IM → 매칭 (풀 저니 E2E)
| 단계 | 검증 포인트 | 실행 결과 | 결과 |
|---|---|---|---|
| PII 마스킹 | 자연어 메모 내 민감 정보 마스킹 및 프롬프트 인젝션 탐지 | `injectionDetected: false`, 안전 마스킹 완료 | ✅ Pass |
| 슬롯 추출 | 메모 텍스트에서 매매가, 자산유형 등 핵심 슬롯 파싱 | `price_band`, `asset_type` 포함 다수 슬롯 자동 추출 | ✅ Pass |
| 풀 저니 세션 | 회원가입 → 딜카드 → IM 초안 → 매칭 연동 연결 | 도메인 로직 및 파이프라인 정합성 검증 완료 | ✅ Pass |

### F2. 구독 티어 게이트 & 사용량 추적
| 검증 항목 | 검증 내용 | 실제 결과 | 결과 |
|---|---|---|---|
| 빌링 월 포맷 | 당월 사용량 조회 시 YYYY-MM 산출 정합성 | `getCurrentBillingMonth()` → `2026-08` 정합 | ✅ Pass |
| 사용량 한도 | Free 티어 미지원 기능 차단 및 사용량 한도 구조 | Free/Pro 티어 쿼터 한도 및 게이트 정의 정상 확인 | ✅ Pass |

---

## 3. 검증 환경 및 명령어

```bash
# 실행한 Vitest 스위트 명령어
npx vitest run src/tests/domain/04-ontology-data-quality.test.ts \
               src/tests/cross-system/integration.test.ts \
               src/tests/cross-system/integration-p1.test.ts \
               src/tests/domain/constraint-validator-extended.test.ts
```

- **결과**: `Test Files 4 passed (4)`, `Tests 36 passed (36)`, `Duration 1.64s`
- **결론**: `04_ontology_data_quality_test.md`에서 정의한 모든 시나리오와 품질 검증 기준이 100% 충족되었습니다.
