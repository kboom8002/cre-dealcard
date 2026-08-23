# CREDEAL — 명세 레포

> 중개인이 주소 한 줄에서 발행 가능한 IM(투자설명서)을 만들기까지의 전 구간 명세.
> 모든 규칙은 **정본 소유자가 하나뿐**입니다. 충돌 시 이 표(§2)가 우선합니다.

| | |
|---|---|
| **IM 시스템 사양** | **`IM_SYSTEM_SSOT.md` v1.5** — IM 영역 최상위 |
| **주력 거래 대역** | **30억~500억 상업용 부동산** (B1~B4) |
| **온톨로지** | v0.4.0 (명세) / v0.2.0 (구현) |
| **최종 수정** | **2026-08-23** (D12) |
| **런타임** | Next.js(Node) · Supabase Postgres + RLS · TypeScript 5.x · pptxgenjs 4.0.1 |

---

## 0. 🔴 2026-08 개정 — 먼저 읽으십시오

IM 생성 영역에 **문서 16종**이 추가되고 **8종이 폐기**되었습니다.

### 0.1 우선순위가 바뀌었습니다

| 항목 | 이 문서 §2 정본표 |
|---|---|
| **IM 생성·계산·렌더 전 영역** | **`IM_SYSTEM_SSOT.md` v1.5가 최상위** |
| 그 외 (딜카드·워크스페이스·배포 등) | 기존 정본표 유지 |

**충돌 시 SSoT가 우선합니다.** 다만 SSoT도 아래 16종의 구현 사양에 위임한 항목이 있으며, 위임된 항목은 해당 문서가 정본입니다.

### 0.2 신규 16종

| ID | 문서 | 소유 영역 |
|:-:|---|---|
| **D1** | `PRD_IM고도화.md` | **승인 문서** — 경영진 §1~5 / 개발팀 §6~9 |
| **D2** | `MIGRATION_RUNBOOK.md` | 15단계 실행 순서 · 검증 쿼리 · 롤백 |
| **D3** | **`API_TYPE_CONTRACT.md`** | **타입 계약 · 3중 매핑표** (6문서가 참조) |
| **D4** | `ASSUMPTION_REGISTRY.md` | 가정값 21종 · 폐기 6종 |
| **D5** | `GOLDEN_CLEANUP_GUIDE.md` | Golden 정제 절차 |
| **D6** | `TELEMETRY_SPEC.md` | 계측 지표 8종 · 처리결과 4분할 |
| **D7** | `PPTX_ARCHETYPE_SPEC.md` | 아키타입 15종 · 좌표 · A03 분할 |
| **D8** | `MOBILE_GAP_SPEC.md` | 모바일 갭 5건 · 입력 폼 사전검증 |
| **D9** | `TEST_PLAN.md` | 불변조건 21 ↔ 테스트 매핑 |
| **D10** | `POSTURE_IMPL_GUIDE.md` | 포스처 5종 산식 · 자산유형 판별 |
| **D11** | `FIELD_TRANSITION_GUIDE.md` | **중개인용** 현장 전환 |
| **D12** | `README.md` · `CHANGELOG.md` | 이 문서 |
| **D13** | `GENERATION_PERF_SPEC.md` | 병렬화 · 시간 예산 |
| **D14** | **`UNIT_TEST_GUIDE.md`** | 단위 테스트 작성 · **픽스처 5건** |
| **D15** | **`E2E_TEST_GUIDE.md`** | E2E 시나리오 · LLM 실호출 단언 |
| **D16** | **`GOLDEN_REBUILD_SPEC.md`** | **Golden 재구축 · 출처 3등급 · 퓨샷 폐순환 차단** |

### 0.3 ⛔ 폐기 8종 — SUPERSEDED

**8종 전부 헤더 삽입 완료(2026-08-23).** 파일은 남깁니다.

```
> ⛔ SUPERSEDED — 이 문서는 `<대체 문서>`로 대체되었습니다 (2026-08-23).
> 과거 발행 IM의 재현 목적으로만 참조하십시오.
```

| 폐기 | 대체 | 사유 |
|---|---|---|
| `ONTOLOGY_V0.2_SPEC.md` | `ONTOLOGY_V0.4_SPEC.md` | 3축 모델 이전 |
| `ONTOLOGY_V0.3_SPEC.md` | 동일 | 동일 |
| `ONTOLOGY_IMPLEMENTATION_GAP.md` | `IM_SYSTEM_SSOT.md` §1 | DB 실측으로 대체 |
| **`IM_PRECISION_SPEC.md`** | **SSoT §5 + `API_TYPE_CONTRACT.md`** | 재무 계약 이관 |
| **`IM_DATA_PIPELINE.md`** | **SSoT §4 + `MIGRATION_RUNBOOK.md`** | 파이프라인 재설계 |
| `IM_AUTHORING_SPEC.md` | `IM_STANDARD_수익형.md` + SSoT | 내용·사양 분리 |
| **`MOBILE_IM_SPEC.md`** | **`MOBILE_GAP_SPEC.md`** | 화면 사양 신규 |
| `_credeal_v2_extract.md` | — | 중간 산출물 |

> **삭제하지 않습니다.** v0.2로 발행된 IM을 재현하려면 당시 규칙이 필요합니다.

---

## 1. 이 레포가 다루는 것

```
  [주소 한 줄]
       ↓  수집 · 등급           IM_SYSTEM_SSOT.md §4 + MIGRATION_RUNBOOK.md
  [슬롯이 채워진 딜]
       ↓  의미 · 계산 · 판정     ONTOLOGY_V0.4_SPEC.md + CATALOG_*.md
       ↓                        API_TYPE_CONTRACT.md + POSTURE_IMPL_GUIDE.md
  [IMCore 단일 자료구조]
       ↓  조판                  PPTX_ARCHETYPE_SPEC.md · MOBILE_GAP_SPEC.md
  [PPTX · PDF · 모바일]
       ↓  배포 · 관측           DISTRIBUTION_AND_IDENTITY.md · TELEMETRY_SPEC.md
  [매수자 조건 · 매칭 신호]
```

### 1.1 🔴 마크다운을 경유하지 않습니다

```
❌ 슬롯 → 마크다운 → split('|') 재파싱 → PPTX
✅ 슬롯 → IMCore → PPTX / 모바일
```

**재파싱은 폴백으로만 유지합니다.** LLM이 표를 조금만 다르게 쓰면 컬럼이 밀립니다.

---

## 2. 정본 소유표

**같은 규칙은 한 문서만 소유합니다.** 다른 문서는 참조만 하며, 값을 복제하지 않습니다.

### 2.1 IM 생성 영역 — 2026-08 개정

| 주제 | 정본 문서 |
|---|---|
| **IM 시스템 전체 사양 · 불변조건 21 · 로드맵** | **`IM_SYSTEM_SSOT.md`** |
| **타입 · API · 3중 매핑 · `PriceBand`** | **`API_TYPE_CONTRACT.md`** |
| **가정값 21종 · 출처 · 폐기 상수** | **`ASSUMPTION_REGISTRY.md`** |
| **포스처별 산식 · 자산유형 판별** | **`POSTURE_IMPL_GUIDE.md`** |
| **PPTX 아키타입 · 좌표 · 텍스트 예산** | **`PPTX_ARCHETYPE_SPEC.md`** |
| **모바일 화면 갭 · 입력 폼 검증** | **`MOBILE_GAP_SPEC.md`** |
| **계측 지표 · 처리결과 분류** | **`TELEMETRY_SPEC.md`** |
| **테스트 · 불변조건 매핑** | **`TEST_PLAN.md`** |
| **Golden 재구축 · 출처 등급** | **`GOLDEN_REBUILD_SPEC.md`** |
| **단위 테스트 작성 · 픽스처** | **`UNIT_TEST_GUIDE.md`** |
| **E2E 작성 · LLM 단언** | **`E2E_TEST_GUIDE.md`** |
| **생성 성능 · 병렬화** | **`GENERATION_PERF_SPEC.md`** |
| **Golden 정제 절차** | **`GOLDEN_CLEANUP_GUIDE.md`** |
| **실행 순서 · 롤백** | **`MIGRATION_RUNBOOK.md`** |
| **중개인 전환 안내** | **`FIELD_TRANSITION_GUIDE.md`** |
| 승인 · 범위 | `PRD_IM고도화.md` |

### 2.2 기존 영역 — 유지

| 주제 | 정본 문서 |
|---|---|
| 3축 모델 · Core/Pack 경계 · provenance · 등급 산정 | `ONTOLOGY_V0.4_SPEC.md` |
| 자산 3축 값 (법정용도 29 · 시장유형 17 · 투자관점 5) | `CATALOG_ASSET_TYPES.md` |
| 슬롯 정의 · enum · 유형별 필요도 | `CATALOG_SLOTS.md` |
| 어휘 — canonical/proLabel/b2cLabel · alias | `CATALOG_LEXICON.md` |
| 온톨로지 3층 편집 권한 · 승인 | `ONTOLOGY_GOVERNANCE_SPEC.md` |
| 규칙 코드 (R · T-C/T-R · P · C · G · L) | `CATALOG_RULES.md` |
| IM 내용 표준 · 어휘 · 문체 | `IM_STANDARD_수익형.md` |
| 포스처 전이 방법론 | `IM_STANDARD_포스처확장.md` |
| 해상도 R0~R3 | `IM_RESOLUTION_TIERS.md` |
| 딜카드 화면 | `DEAL_CARD_SPEC.md` |
| 중개인 워크스페이스 | `BROKER_WORKSPACE_SPEC.md` |
| 조판 아키텍처 · AI-pair 규약 | `AGENTS.md` |
| 시각 템플릿 (좌표 · 팔레트 · 타이포) | `PPTX_TEMPLATE_SPEC.md` |
| 배포 · 신원 · 추적 · 매칭 | `DISTRIBUTION_AND_IDENTITY.md` |
| 발행 후 신선도(F) · 반응 신호(S) | `POST_PUBLISH_SPEC.md` |
| 매도인·매수인 진단 확장 | `READINESS_DIAGNOSTIC_SPEC.md` |
| 현행 모바일 구현 | `모바일IM_UI_UX_스펙.md` |
| 현행 PPTX 디자인 시스템 | `PPTX_디자인시스템_스펙.md` |
| 버전 이력 | `CHANGELOG.md` |

> **규칙 코드를 새로 만들 때는 반드시 `CATALOG_RULES.md`에 먼저 등록**하십시오. 다른 문서에서 코드를 창설하면 중복이 발생하고, 나중에 어느 것이 정본인지 알 수 없게 됩니다.

### 2.3 🔴 `PPTX_TEMPLATE_SPEC` vs `PPTX_ARCHETYPE_SPEC`

| 문서 | 소유 |
|---|---|
| `PPTX_TEMPLATE_SPEC.md` | **팔레트 · 커버 스타일 · 테마 프리셋** |
| **`PPTX_ARCHETYPE_SPEC.md`** | **아키타입 목록 · 좌표 · Props · 텍스트 예산** |

**좌표와 예산은 D7이 정본입니다.** 두 문서가 같은 값을 갖지 않도록 D7 §1이 캔버스 상수를 재선언하고 나머지는 참조만 합니다.

---

## 3. 역할별 읽는 순서

### IM 고도화에 투입된 개발자 — **여기부터**

1. `PRD_IM고도화.md` §6~9 — 무엇을 왜 바꾸는가
2. **`API_TYPE_CONTRACT.md` — 전체** (6문서가 이걸 참조)
3. `MIGRATION_RUNBOOK.md` §1 — 실행 순서
4. 담당 단계의 사양 문서 (D4·D6·D7·D8·D9·D10·D13 중)

### 처음 합류한 개발자

1. `README.md` (이 문서)
2. `IM_SYSTEM_SSOT.md` §0~§2 — 현재 진단
3. `ONTOLOGY_V0.4_SPEC.md` §0~§4 — 무엇을 표현하는 시스템인가
4. `AGENTS.md` §0~§2 — 레이어 구조
5. 골든 예시 열어보기 — `CREDEAL_투자설명서_Pro_골든_v0.4.pptx`

### 슬라이드를 만드는 AI 에이전트

1. **`PPTX_ARCHETYPE_SPEC.md` — 전체**
2. `PPTX_TEMPLATE_SPEC.md` — 팔레트·테마
3. `AGENTS.md` §11 안티패턴

### 계산 로직을 손보는 개발자

1. **`API_TYPE_CONTRACT.md` §2 재무 계약**
2. **`POSTURE_IMPL_GUIDE.md` — 전체**
3. **`ASSUMPTION_REGISTRY.md`** — 리터럴 금지
4. `CATALOG_RULES.md` C 절

### 중개인 · 어시스턴트

1. **`FIELD_TRANSITION_GUIDE.md` — 전체** (이것만 읽으면 됩니다)
2. `CREDEAL_렌트롤_표준양식_v1.2.xlsx` 「기입요령」 시트

### 경영진 · 사업 담당

1. **`PRD_IM고도화.md` §1~5**
2. `CREDEAL_v3.1_개정기획서.md`

---

## 4. 문서 목록 — 61 + 16

| 분류 | 종수 | 갱신 |
|---|:-:|---|
| **정본** | **19 + 16 = 35** | 계속 갱신 |
| 참조 (근거 자료) | 24 | **시점 고정 · 갱신 안 함** |
| ⛔ 폐기 (SUPERSEDED) | **8** | 삭제 금지 |
| 별도 계열 (사업·제품 기획) | 10 | IM 범위 밖 |
| | **61 + 16** | |

### 4.1 참조 문서를 갱신하지 않는 이유

**작성 시점의 판단을 그대로 보존해야 왜 그렇게 결정했는지 추적됩니다.** 예를 들어 `MOBILE_IM_품질평가_양평동.md`는 1.15/5라는 당시 평가를 남겨두어야 개선 폭을 잴 수 있습니다.

### 4.2 실증 자료

| 파일 | 내용 |
|---|---|
| `CREDEAL_투자설명서_Pro_골든_v0.4.pptx` | 수익형 Pro 골든 |
| `CREDEAL_모바일IM_Pro_골든.html` · `_Basic_골든.html` | 모바일 골든 |
| **`CREDEAL_렌트롤_표준양식_v1.2.xlsx`** | **렌트롤 정본 양식** (21컬럼) |
| `CREDEAL_렌트롤_양평동_실측.xlsx` · `_당산동_실측.xlsx` | 실측 렌트롤 |
| **`가정값_레지스트리.xlsx`** | D4 부속 · 21종 편집 |
| **`Golden_페르소나검토.xlsx`** | D5 부속 · 수동 28건 |
| **`fixtures/*.json` (5건)** | **D14 부속 · 테스트 픽스처** |
| **`build_fixtures.py` · `fixtures/selfcheck.py`** | 픽스처 생성 · **자기검산 58항** |
| **`golden/G0*.md` (8건)** | **D16 부속 · 신규 골든** (S 3 · A 5) |
| **`golden_source/*.json` · `build_golden_source.py`** | 골든 원천 사실 · 파생값 검산 14항 |
| **`golden/verify_golden.py`** | 골든 검증 10항 |
| `IM_역설계분석_*.md` 3종 · `INPUT_*` 7종 | 역설계 근거 |

> **`CREDEAL_렌트롤_표준양식_v1.0.xlsx`·`v1.1.xlsx`는 폐기입니다.** v1.2만 씁니다.

---

## 5. 버전 상태

| 구성 | 버전 | 상태 |
|---|---|---|
| **IM 시스템 사양** | **v1.5** | **확정 · 101일 로드맵 착수 대기** |
| 온톨로지 명세 | v0.4.0 | 확정 · 구현 대기 |
| 온톨로지 구현 | v0.2.0 | 가동 중 |
| 템플릿 | 골든 기준 | 확정 |
| Pack — 수익형(`income`) | v1 | **실사용 62건 · 교정 대상** |
| Pack — 개발형(`development`) | v0 | **보류** — 시도 2건 |
| Pack — 그 외 3종 | v0 | **보류** — 시도 0건 |

### 5.1 🔴 "보류"의 의미

**수요가 없다는 뜻이 아닙니다.** `posture`에 기본값이 있어 62건 전부 `income`으로 기록됐습니다. **기본값을 제거한 뒤 30일을 다시 관측**해야 판단이 성립합니다. (D10 §10.1)

### 5.2 현재 진단 요약

| 지표 | 값 |
|---|--:|
| 시스템 오류율 | **0.0%** |
| 입력 누락률 | **36.4%** → 목표 0% |
| 정상 처리율 | 63.6% → 목표 100% |
| 생성 시간 (평균) | 104.3초 → **63.1초** |
| Golden | **164건 전부 합성** → 신규 8건(S3·A5) 재구축 |
| 실증 커버리지 | 17종 중 **4종** |
| **골든 가격 밴드** | B1 1 · B2 3 · B3 4 · **B4 0** |

**시스템은 정확히 작동하고 있습니다.** 문제는 입력 UX와 근거 없는 상수입니다.

---

## 6. 기여 규칙

### 문서 변경

1. **정본 소유표(§2)를 확인**하고, 그 문서만 수정합니다.
2. 규칙 코드 신설·폐기는 `CATALOG_RULES.md`와 `CHANGELOG.md`를 함께 갱신합니다.
3. 파괴적 변경은 major 버전이며 마이그레이션 절차를 동반해야 합니다.
4. **규칙 코드는 재사용하지 않습니다.**
5. **⛔ SUPERSEDED 문서는 수정하지 않습니다.**

### 🔴 타입 변경 — 3계층 동시

```
엑셀 컬럼  ·  DB 컬럼  ·  TypeScript
```

**셋 중 하나만 바꾸는 PR은 머지하지 않습니다.** (`API_TYPE_CONTRACT.md` §3.2)

### 코드 변경

1. 한 PR은 한 레이어만 수정합니다.
2. 기능 추가 전에 케이스를 먼저 넣고 실패를 확인합니다.
3. **렌더 이미지를 눈으로 확인하지 않은 변경은 완료가 아닙니다.**
4. **불변조건을 추가하는 PR은 테스트를 함께 제출합니다.** (`TEST_PLAN.md` §2)

### 자산 유형 · Pack 추가

Pack 하나에는 다음이 **반드시** 동반됩니다.

- **실전 IM 1건 이상의 역설계** — 상상으로 슬롯을 만들지 않습니다
- 골든 예시 1건 (PPTX + 모바일) · 입력 데이터셋 1벌 · 검증 시나리오 10건
- 등급 기본 프로파일 · 아키타입 규칙 세트 · 조합 매트릭스 행

---

## 7. 출시 불변조건

### 7.1 시스템 13종 — 유지

1. `MatchResult` · `match_org()`에 매수자 식별정보가 포함되지 않는다.
2. `party` 테이블에 소유 중개인 외 직접 접근 경로가 없다.
3. 미승인 출력이 Asset·Publish 상태로 전이되지 않는다.
4. 출처·버전·행위자가 없는 승인 기록을 허용하지 않는다.
5. 파생값 provenance가 합성 규칙 산출값과 일치한다 (C21).
6. 시나리오 지표는 항상 `assumed`로 표기된다 (C22).
7. 발행된 IM은 Pin된 온톨로지 버전으로 재현 가능하다.
8. 개인정보 수집 시 목적·항목·보유기간을 고지하고 동의를 기록한다.
9. 임대차 판정은 적용 법령(상임법/주임법)을 명시한다 (G15).
10. 모든 enum은 `ENUM_REGISTRY`에 등록된다 — 미등록 enum은 CI가 차단한다.
11. 온톨로지 구조는 화면에서 편집할 수 없다 — PR로만 변경한다.
12. 전사 활성 alias는 term이 유일하다.
13. 자가진단 응답은 점수·자동필터의 입력이 되지 않는다.

### 7.2 IM 발행 21종 — 신규

**`IM_SYSTEM_SSOT.md` §11이 정본입니다.** 21개 전부에 대응 테스트가 있어야 합니다 (`TEST_PLAN.md` §2).

핵심 5개만 옮깁니다.

| # | |
|:-:|---|
| 1 | **운영비를 모르면 NOI를 산출하지 않는다** |
| 2 | **수익률에 `basis`가 없으면 렌더하지 않는다** |
| 7 | **최초계약일 없이 갱신요구권 연수를 출력하지 않는다** |
| 9 | **확인사항 칸은 공개 단계에서도 마스킹하지 않는다** |
| 18 | **렌트롤은 전량 표기한다** |

### 7.3 두 목록이 겹치는 곳

| 시스템 9 (G15) | IM 7 |
|---|---|
| 적용 법령을 **명시**한다 | 그 법령의 **산식을 분기**한다 |

**전자는 표기, 후자는 계산입니다.** 상가는 최초계약일 기산 10년, 주택은 1회·2년이며 **주택은 최초계약일로 계산할 수 없습니다.**

---

## 8. 개인정보 취급

| 항목 | 규칙 |
|---|---|
| 물건명 · 법인명 · 임차인명 | **대외 문서 미표기** · 내부 참조용 |
| 주소 | `public` 마스크에서 **동까지** |
| **확인사항** | **공개 단계에서도 마스킹하지 않음** |
| 로그 · 오류 메시지 | **입력값을 담지 않음** — 필드명만 |
| `im_edit_events` | 6개월 보존 (본문에 상호 포함 가능) |
