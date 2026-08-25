# D25 · CREDEAL 인계 문서 세트 정의서

> **묻고 있는 것** — 온톨로지 v0.5까지 반영해서, 수익형 IM 스펙 수준 **이상의 완전한 IM을
> 오류 없이 생성**하도록 CREDEAL 시스템을 올리려면 **어떤 문서 세트를 레포로 넘겨야
> 완전한가.**

| | |
|---|---|
| **문서 번호** | D25 |
| **작성** | 2026-08-25 |
| **성격** | 인계 **정의서** — 무엇이 세트에 들어가고 무엇이 결손인지, 순서·의존·수용 기준 |
| **선행** | D19 v2.2 · D22 세트 · D23 · D24 · `ONTOLOGY_V0.5_SPEC` |
| **자동 검사** | `qa/ontology_check.py` · `qa/doc_integrity.py` (신설) |

---

## 0. 답 — 문서를 더 만드는 문제가 아닙니다

레포에 **살아 있는 md가 96개**입니다. 그리고 인계용 실행 문서 세트 **D1~D13은 이미
전부 존재합니다** (`PRD_IM고도화` · `MIGRATION_RUNBOOK` · `API_TYPE_CONTRACT` ·
`ASSUMPTION_REGISTRY` · `GOLDEN_CLEANUP_GUIDE` · `TELEMETRY_SPEC` ·
`PPTX_ARCHETYPE_SPEC` · `MOBILE_GAP_SPEC` · `TEST_PLAN` · `POSTURE_IMPL_GUIDE` ·
`FIELD_TRANSITION_GUIDE` · `README` · `GENERATION_PERF_SPEC`).

문제는 개수가 아닙니다.

🔴 **그 13종 5,900여 행이 v0.5·D19 v2.2·D22·D23을 거의 모릅니다.**

**착수 시점 실측 (2026-08-25 오전) — 13종 전부 `·`:**

```
문서                          행    v0.5  X05  G30  C33  QG  Prov9  포스처계약  불변22
PRD_IM고도화                 339     ·    ·    ·    ·   ·    ·        ·        ·
MIGRATION_RUNBOOK            518     ·    ·    ·    ·   ·    ·        ·        ·
API_TYPE_CONTRACT            860     ·    ·    ·    ·   ·    ·        ·        ·
ASSUMPTION_REGISTRY          371     ·    ·    ·    ·   ·    ·        ·        ·
GOLDEN_CLEANUP_GUIDE         377     ·    ·    ·    ·   ·    ·        ·        ·
TELEMETRY_SPEC               390     ·    ·    ·    ·   ·    ·        ·        ·
PPTX_ARCHETYPE_SPEC          593     ·    ·    ·    ·   ·    ·        ·        ·
MOBILE_GAP_SPEC              318     ·    ·    ·    ·   ·    ·        ·        ·
TEST_PLAN                    528     ·    ·    ·    ·   ·    ·        ·        ·
POSTURE_IMPL_GUIDE           607     ·    ·    ·    ·   ·    ·        ·        ·
FIELD_TRANSITION_GUIDE       327     ·    ·    ·    ·   ·    ·        ·        ·
README                       380     ·    ·    ·    ·   ·    ·        ·        ·
GENERATION_PERF_SPEC         362     ·    ·    ·    ·   ·    ·        ·        ·
```

**이 문서의 지시로 3종이 개정된 뒤 (2026-08-25 오후):**

```
MIGRATION_RUNBOOK            808    12    1    2    1   4    ·        ·        ·   ← §9 신설
POSTURE_IMPL_GUIDE           629     2    ·    ·    ·   ·    ·        ·        ·   ← §0Z 신설
README                       209     3    ·    ·    ·   3    ·        ·        ·   ← 전면 재작성
나머지 10종                          전부 ·  — 개정 대기
```

> **표를 두 시점으로 나눈 이유** — 이 문서가 스스로 지시한 개정이 반영되면서
> 착수 시점 표가 곧바로 거짓이 되었습니다. **실측 표에는 기준 시각을 답니다.**
> 이것을 놓치면 문서가 자기 자신을 반증합니다.
>
> `TELEMETRY_SPEC`의 `Provenance` 를 초안에서 `○`로 적었으나 실측 0건이었습니다 —
> 오기였고 정정했습니다.

**이 상태로 넘기면 개발팀은 두 개의 다른 시스템을 동시에 읽게 됩니다.**
온톨로지는 `Provenance` 9종을 말하고 API 계약은 5종을 말합니다. 규칙 카탈로그는
`G30`이 발행을 차단한다고 하는데 테스트 계획에는 그 게이트가 없습니다.

**완전한 세트란 문서의 개수가 아니라, 어떤 문서를 읽어도 같은 시스템이 보이는
상태입니다.**

| | 종수 | 행수 |
|---|---:|---:|
| **신설** | **7** | **2,101** (실측) |
| **개정** | **17** | 3종 완료 · 14종 대기 |
| **격리(폐기 이동)** | **11** | — |
| **그대로 인계** | 68 | — |

---

## 1. 실측 — 지금 레포가 어떤 상태인가

전부 스크립트로 셌습니다. 추정이 아닙니다.

### 1.1 폐기 문서 인용 — 격리 후 89건

격리 전 루트 실측 **101건**, 격리 후 **89건** (신설 문서가 회고로 인용한 것 포함).
`qa/doc_integrity.py ②-2` 가 이 값을 **래칫**으로 관리합니다 — 늘면 차단하고,
줄면 기준선을 낮춰 되돌아가지 못하게 합니다.

| 폐기 문서 | 인용 |
|---|---:|
| `IM_PRECISION_SPEC.md` | 27 |
| `IM_DATA_PIPELINE.md` | 17 |
| `MOBILE_IM_SPEC.md` | 12 |
| `IM_AUTHORING_SPEC.md` | 10 |
| `ONTOLOGY_V0.2_SPEC.md` | 8 |
| 그 외 6종 | 15 |
| | **89** |

v0.5에서 **"소유" 문언 지목은 0**입니다. 남은 89건은 참고 인용이라 규칙이 당장
유실되지는 않습니다. 그러나 **폐기 문서가 루트에 있으면 다음 사람이 그것을
읽습니다** — 그래서 `99_superseded/`로 내렸습니다 (§8.1).

> 초안에서 129건으로 적었으나 계수 방식(문서명 부분 일치)이 느슨했습니다.
> 검사기 실측이 정본이며, `qa/doc_baseline.json` 이 기준선을 보관합니다.

### 1.2 현행 파이프라인 명세 3종이 레포에 없습니다 🔴

```
01_PIPELINE_FUNCTIONAL_SPEC.md                          레포에 없음
02_MOBILE_IM_CONTENT_GENERATION_AND_RENDERING_SPEC.md   레포에 없음
03_PPTX_IM_CONTENT_GENERATION_AND_RENDERING_SPEC.md     레포에 없음
```

**메모 → 딜카드 → 바텀시트 → IM 파이프라인의 현재 동작을 서술하는 문서가
레포 밖에 있습니다.** 레포는 이상적인 설계를 말하고 프로덕션은 다르게 돕니다.
D23이 갭을 실측했지만 **기준이 되는 현행 명세 자체가 레포에 없으면 갭 문서만으로는
아무것도 확인할 수 없습니다.**

### 1.3 포스처 내용은 있는데 계약 형태가 아닙니다

먼저 정정합니다 — **"포스처 표준 4종이 없다"는 파일명 기준으로만 맞습니다.**

| 포스처 | 서술이 있는 곳 | 언급 |
|---|---|---:|
| `development` | `IM_STANDARD_포스처확장.md` v3.0 §3·§4·§4A·§4B | 32 |
| | `ASSET_CLASS_EXTENSION_PLAN.md` | 16 |
| `operating` | `IM_STANDARD_포스처확장.md` §6 | 9 |
| `owner_occupied` | `ASSET_CLASS_EXTENSION_PLAN.md` · 동 §6B | 13 · 6 |
| `trading` | 동 §6A · `POSTURE_IMPL_GUIDE.md` §6 | 8 · 5 |

`POSTURE_IMPL_GUIDE.md`(607행)는 5종 전부의 **A16 투자구조 산식**을 확정해 두었습니다.
`IM_STANDARD_포스처확장.md` v3.0(761행)은 개발형 블루프린트·명도 관행·용적률 완화
시한까지 조사해 두었습니다.

🔴 **문제는 이 내용이 포스처 확장 계약 13칸의 형태로 정리되어 있지 않다는 것입니다.**
`sections` · `emphasisSections` · `nlgMasks` 를 기계가 읽을 자리가 없어서,
`qa/ontology_check.py`가 네 칸만 검증하고 나머지 아홉 칸은 사람이 봐야 합니다.

**그래서 새로 조사하는 게 아니라 형태를 맞추는 작업입니다.** 있는 내용을 옮기고,
빠진 칸만 채웁니다. 없는 것을 새로 지어내면 실증 없는 규격이 늘어납니다.

### 1.4 고아 문서 · 끊긴 포인터

```
인용 0회   12_e2e_real_02_dangsan_income.md · CREDEAL_v2.1_개정마일스톤_P0P1결합판.md
          IM_SAMPLE_양평동_해설.md · IM_문서세트_배치도출계획.md · IM_역설계분석_3종.md

끊긴 링크  PPTX_IM_METHODOLOGY_AND_ARCHITECTURE.md · PPTX_IM_PRESET_TEMPLATE_SPEC.md
          모바일IM_UI_UX_스펙.md · PPTX_디자인시스템_스펙.md · IM_개발팀_자료요청서.md
          (전부 프로덕션 문서 — 레포에 편입된 적이 없습니다)
```

고아라고 나쁜 것은 아닙니다 — `IM_SAMPLE_양평동_해설`은 인계 시 **가장 먼저 읽어야 할
문서**인데 아무도 가리키지 않았습니다. 인덱스가 없었다는 뜻입니다.

> 🔴 **여기 나열하는 행위가 고아를 해소시킵니다** — 검사기 ③은 "언급 = 인용"으로
> 봅니다. 그래서 이 목록만으로는 부족하고, **README 인덱스에 실제로 등재**해야
> 의미가 있습니다 (§8).

## 2. 완전한 세트의 정의

**"이 세트만 읽고 시스템을 처음부터 다시 만들 수 있는가"** 가 기준입니다.
그러려면 다섯 가지 질문에 각각 정본이 하나씩 있어야 합니다.

| 질문 | 층 | 정본 | 상태 |
|---|---|---|:-:|
| 세상을 어떻게 모델링하는가 | 1 온톨로지 | `ONTOLOGY_V0.5_SPEC` + `CATALOG_*` 4 | ✅ |
| 이 포스처의 IM은 무엇을 말하는가 | 2 포스처 표준 | 포스처 표준 5종 | ✅ **5/5** |
| 지면에 어떻게 옮기는가 | 3 구현 규격 | D19 v2.2 + D22 세트 | ✅ (수익형만) |
| 시스템이 어떻게 도는가 | 3 실행 명세 | `IM_PIPELINE_RUNTIME_SPEC` (D26) | ✅ |
| 무엇을 만들고 어떻게 옮기는가 | 4 실행·운영 | D1~D13 | **전량 v0.5 이전** |

각 층은 **위 층만 참조**합니다. 아래 층을 참조하면 아래가 폐기될 때 규칙이 사라집니다
(`ONTOLOGY_V0.5_SPEC` §2.1).

### 2.1 독자별 진입점

세트가 완전해도 **어디부터 읽는지 모르면 없는 것과 같습니다.**

| 독자 | 첫 문서 | 그다음 |
|---|---|---|
| 개발자 (신규 합류) | `README.md` 진입 인덱스 | `ONTOLOGY_V0.5_SPEC` → `API_TYPE_CONTRACT` → 실행 명세 |
| 개발자 (IM 생성 담당) | `IM_PIPELINE_RUNTIME_SPEC` | D19 v2.2 → 포스처 표준 (T2) |
| 도메인 (중개 실무) | `IM_SAMPLE_양평동_해설` | `IM_AB_PLAYBOOK` → `IM_STANDARD_수익형` |
| QA | `TEST_PLAN` | `IM_QUALITY_GATES` → `qa/*.py` |
| 운영 (마이그레이션) | `MIGRATION_RUNBOOK` §9 | `ONTOLOGY_V0.5_SPEC` §9 |
| 경영 | `IM_COMMERCIAL_PROGRAM` | `IM_상용화_준비도_평가서` |

---

## 3. 인계 세트 — 5트랙

### T1 · 온톨로지 정본 (7종) — ✅ 완료

| 문서 | 소유 | 상태 |
|---|---|:-:|
| `ONTOLOGY_V0.5_SPEC.md` | 구조·층위·포스처 계약·코드 규율·등급 | ✅ |
| `CATALOG_SLOTS.md` | 슬롯·enum·출처 등급·수집 경로 | ✅ |
| `CATALOG_RULES.md` | R·T·P·X·C·G·L·M | ✅ |
| `CATALOG_ASSET_TYPES.md` | 3축 값·조합·기본 프로파일 | ✅ |
| `CATALOG_LEXICON.md` | 어휘·금지어·치환·표기 | ✅ |
| `ONTOLOGY_GOVERNANCE_SPEC.md` | 변경 절차·승인 | ✅ |
| `IM_SYSTEM_SSOT.md` | 불변조건 23 | ✅ |

### T2 · 포스처 표준 (5종) — ✅ 5/5 (착수 시 1/5)

| 문서 | 상태 | 재료 |
|---|:-:|---|
| `IM_STANDARD_수익형.md` | ✅ | — |
| `IM_STANDARD_운영형.md` | ✅ 신설 완료 | 포스처확장 §6 · IMPL_GUIDE §5 · 호텔 역설계 |
| `IM_STANDARD_개발형.md` | ✅ 신설 완료 | 포스처확장 §3·§4·§4A·§4B · IMPL_GUIDE §4 · 잠원동·수택동 |
| `IM_STANDARD_사옥형.md` | ✅ 신설 완료 | 포스처확장 §6B · IMPL_GUIDE §3 · EXTENSION_PLAN |
| `IM_STANDARD_단기매매형.md` | ✅ 신설 완료 | 포스처확장 §6A · IMPL_GUIDE §6 |

**`IM_STANDARD_포스처확장.md` v3.0은 폐기하지 않습니다.** 조사 근거(명도 관행·
용적률 완화 시한·세제)를 담은 **연구 문서**로 남기고, 네 표준이 그것을 참조합니다.

### T3 · 구현 규격 — 개정

| 문서 | 조치 |
|---|---|
| `CREDEAL_IM_SPEC_수익형.md` (D19 v2.2) | ✅ 유지. §1 출처 등급을 `CATALOG_SLOTS` §1.2 참조로 전환 |
| `CREDEAL_IM_SPEC_수익형_부록.md` | ✅ 유지 |
| D22 세트 8종 | ✅ 유지 |
| `IM_PIPELINE_UPGRADE.md` (D23) | ✅ 유지 — 개선**안** |
| `IM_PIPELINE_RUNTIME_SPEC.md` | ✅ 신설 완료 — 실행 계약 |
| `03_spec_current_state/` 3종 | ✅ 편입 완료 |

### T4 · 실행·운영 (D1~D13) — 전량 개정

§5의 표를 보십시오.

### T5 · 기계 판독 · 검사기 — ✅ 완료

```
credeal/ssot/*.yaml   14종 + loader.py
qa/*.py               ontology_check · standard_check · invariant_check
                      consistency_check · output_qa · render_snapshot · calibrate ×2
contracts/*.d.ts      im-registry · im-core · im-render · parity.spec
credeal/*.py          참조구현 — core · parcel · build_d22 · image_pipeline …
```

여기에 **`qa/doc_integrity.py` 하나를 더합니다** (§4-N7).

---

## 4. 신설 7종

### N1 · `IM_STANDARD_운영형.md` — 350행

| 칸 | 값 |
|---|---|
| 아키타입 | `R-OPR-01~04` (가설) |
| 섹션 | 개요 · 입지 · 시설·객실 구성 · **운영 실적 3개년** · **GOP 구조** · 운영사 계약 · 용도 적법성 · 권리 · 비교사례 · 확인사항 |
| 강조 | 운영 실적 · GOP 구조 |
| 수익률 기준 | `gop_price` **단독** — NOI 기준과 병렬 표기 금지 (C31) |
| L축 | `hospitality_spec.performance` |
| 최소 해상도 | L≥R2 · P≥P2 |
| 마스크 | `M28` + 운영형 전용 2 |

🔴 **1개년 실적으로는 계절성을 볼 수 없습니다.** 3개년 미만이면 R1입니다.
`R-OPR-04`(용도 리스크형)가 서면 **용도 적법성 확인 항목이 강제**됩니다 —
생활형숙박시설의 이행강제금 리스크입니다.

### N2 · `IM_STANDARD_개발형.md` — 400행

| 칸 | 값 |
|---|---|
| 아키타입 | `R-DEV-01~04` |
| 섹션 | 개요 · 토지 상세 · **용도지역·개발 규모** · **명도 계획** · 인허가 로드맵 · 사업수지 · 스태킹 · 권리 · 비교사례 · 확인사항 |
| 강조 | 개발 규모 · 명도 계획 |
| 수익률 기준 | `none` — 토지비 부담·사업수지가 판단축 |
| L축 | `vacate_plan` · `permit_risk` · `development_plan` |
| 최소 해상도 | **L≥R1** · P≥P3 |

🔴 **명도는 매도인 부담이 관행**이라는 조사 결과(`IM_STANDARD_포스처확장` v3.0 §4)에
따라 최소 L을 R2에서 **R1로 내립니다.** 매수자가 명도를 떠안지 않으므로
호실별 상세 없이도 IM이 성립합니다.

🔴 **P를 P3까지 요구하는 유일한 포스처입니다.** 용적률·인허가가 틀리면 사업수지
전체가 틀립니다. 잠원동에서 12.5㎡ 제척이 249.0%를 254.1%로 밀어 올려 250% 한시
완화 기준선을 넘긴 사례가 근거입니다.

### N3 · `IM_STANDARD_사옥형.md` — 300행

| 칸 | 값 |
|---|---|
| 아키타입 | `R-OWN-01~04` |
| 섹션 | 개요 · 입지·통근 · 건물 스펙 · **자가 vs 임차 비교** · **층별 사용 계획** · 잔여 임대 · 권리 · 비교사례 · 확인사항 |
| 강조 | 자가 vs 임차 · 층별 사용 계획 |
| 수익률 기준 | `none` |
| L축 | `occupancy_plan` · `physical_spec` |
| 최소 해상도 | L≥R1 · P≥P2 |

🔴 **"사옥이니 임대차는 볼 것 없다"가 가장 자주 틀립니다.** 하층 상가가 임대 중인
경우가 흔하고, 잔여 임대 면적의 명도 시점이 입주 계획을 좌우합니다.
그래서 `G13`·`G15`가 사옥형에도 걸립니다.

지가 시나리오 4종이 없으면 자가 vs 임차 비교를 **차단**합니다 (C27) — 판정이
지가 가정에 지배되므로 단일 값 제시는 사실상 투자 권유입니다.

### N4 · `IM_STANDARD_단기매매형.md` — 280행

| 칸 | 값 |
|---|---|
| 아키타입 | `R-TRD-01~04` (가설) |
| 섹션 | 개요 · **권역 시세 비교** · 회전율 · **출구 시나리오** · 권리 제약 · 보유 이력 · 임대 현황(요약) · 확인사항 |
| 강조 | 권역 시세 비교 · 출구 시나리오 |
| 수익률 기준 | `none` |
| L축 | `market_comp` + **`holding_history`(미신설)** |
| 최소 해상도 | L≥R1 · P≥P2 |
| status | **`internal_only`** |

🔴 **L축 슬롯이 없어 구조적으로 R0입니다.** `holding_history` Pack을 신설하기
전까지 발행할 수 없습니다 (N5). 문서를 먼저 쓰는 이유는 **무엇이 필요한지를
슬롯 신설 전에 확정**하기 위해서입니다.

`R-TRD-04`(출구 제약형)는 나머지 셋과 성격이 반대입니다 — 좋은 유형이 아니라
**되팔기 어렵다**는 경고입니다. 단기매매 매수자에게는 출구가 가장 중요합니다.

### N5 · `CATALOG_SLOTS.md` §3.9~3.10 신설 — Pack 2종

| Pack | 담는 것 | 왜 |
|---|---|---|
| **`holding_history`** | 취득일·취득가·보유기간·매도 사유·이전 중개 이력 | `trading` L축. 없으면 그 포스처는 영원히 D등급 |
| **`operating_performance`** | 매출·영업이익·GOP·가동률·좌석/객실 등 단위 지표 | 요양시설·주차장·골프연습장은 객실 스펙이 없습니다. `hospitality_spec`에서 분리 |

### N6 · `IM_PIPELINE_RUNTIME_SPEC.md` — 550행

**지금 레포에 시스템이 어떻게 도는지를 적은 문서가 없습니다.**
D23은 개선안이고, 현행 서술은 레포 밖 업로드본에만 있습니다.

| 절 | 담는 것 |
|---|---|
| §1 | 단계 5개 — 메모 → 파싱 → 딜카드 → 바텀시트 → IM. 각 단계의 입출력 **타입 계약** |
| §2 | 실패 분류 — 시스템오류 · 입력누락 · 의도된차단 (불변조건 21) |
| §3 | 재시도 정책 — 어느 단계가 재시도 가능한가, 몇 번, 백오프 |
| §4 | **멱등키** — 같은 입력을 두 번 넣으면 같은 산출이 나오는가 |
| §5 | 부분 실패 복구 — 7섹션 중 3섹션 실패 시 |
| §6 | 시간 예산 — 120초 한계, 섹션 병렬화, 초과 시 동작 |
| §7 | 관측 — 단계별 지표, 로그 필드(**입력값 금지 · 필드명만**) |
| §8 | `QG` 게이트가 도는 지점 |

### N7 · `qa/doc_integrity.py` — 검사기

| 검사 | 차단 조건 |
|---|---|
| 폐기 문서 인용 | 루트에 폐기 문서가 남아 있으면 차단 |
| 끊긴 포인터 | 존재하지 않는 `.md` 참조 |
| 고아 문서 | 인덱스에 없고 인용도 0 |
| 헤더 개수 vs 실측 | `CATALOG_*` 전체 (지금은 `RULES`만) |
| 포스처 계약 13칸 | `IM_STANDARD_<posture>` 파싱 |
| 버전 정합 | 문서 헤더의 온톨로지 버전이 최신인가 |

`qa/ontology_check.py`가 온톨로지 **내부**를 보고, 이 검사기가 **문서 세트 전체**를 봅니다.

---

## 5. 개정 17종 — 무엇을 고치는가

### 5.1 D1~D13 (13종)

| 문서 | 고칠 것 | 규모 |
|---|---|:-:|
| `API_TYPE_CONTRACT` | `Provenance` 9종 · `SourceTier` · `PostureContract` · `X05` · `holding_history` | **대** |
| `MIGRATION_RUNBOOK` | **v0.5 장 신설** — 파괴적 변경 7건 실행 절차 | **대** |
| `TEST_PLAN` | `G17~G30` · `C33·C34` · `X05` 시험, 포스처 5종 회귀 | **대** |
| `POSTURE_IMPL_GUIDE` | 5종 산식을 `IM_STANDARD_<posture>` 로 분리·참조 전환 | **대** |
| `PPTX_ARCHETYPE_SPEC` | `L21`~`L26` 편성, 포스처별 면 | 중 |
| `ASSUMPTION_REGISTRY` | 가정 21 → `im.assumptions.yaml`(27) 동기화 · ◇ 표기 | 중 |
| `TELEMETRY_SPEC` | `QG` 지표 · 등급 L×P 분포 · 포스처별 | 중 |
| `GENERATION_PERF_SPEC` | 포스처 5종 × 면 수 증가분 재측정 | 중 |
| `MOBILE_GAP_SPEC` | 포스처별 모바일 편성 | 중 |
| `PRD_IM고도화` | 범위에 포스처 4종 · 상용화 기준 | 소 |
| `GOLDEN_CLEANUP_GUIDE` | 포스처별 골든 요건 | 소 |
| `FIELD_TRANSITION_GUIDE` | 어휘 규칙 소유 이전 반영 | 소 |
| `README` | **진입 인덱스로 전면 재작성** | **대** |

### 5.2 그 외 (4종)

| 문서 | 고칠 것 |
|---|---|
| `IM_STANDARD_수익형` | §6 이관 완료 ✅ · 포스처 계약 13칸 표 추가 |
| `IM_STANDARD_포스처확장` | **연구 문서로 재정의** — 표준 4종이 참조 |
| `IM_QUALITY_GATES` | `QG` §7 신설 완료 ✅ · 포스처별 시험 |
| `IM_RESOLUTION_TIERS` | L축 포스처별 정의 반영 |

---

## 6. 문서별 수용 기준 (DoD)

**"썼다"가 아니라 "검사기가 통과시킨다"가 완료입니다.**

| # | 기준 | 검사 |
|:-:|---|---|
| 1 | 헤더에 온톨로지 버전·소유 범위·**소유하지 않는 것** 명시 | `doc_integrity` |
| 2 | 폐기 문서를 소유자로 지목 0 | `ontology_check ①` |
| 3 | 끊긴 `.md` 포인터 0 | `doc_integrity` |
| 4 | 선언한 개수 = 실제 나열 개수 | `ontology_check ②` |
| 5 | 정의가 빈 코드 0 — 채우거나 명시 폐기 | `ontology_check ②` |
| 6 | 포스처 표준은 계약 13칸 전부 | `doc_integrity` |
| 7 | 값을 두 곳에 적지 않음 — 한쪽은 참조 | 사람 심사 |
| 8 | 신규 코드는 `CATALOG_RULES` 등록 후 사용 | `ontology_check` |
| 9 | `internal_label` 범위 금지어 0 | `standard_check` |
| 10 | `CHANGELOG` 항목 존재 | `doc_integrity` |

---

## 7. 작성 순서

의존이 있는 것만 순서가 강제됩니다.

```
1  N6 IM_PIPELINE_RUNTIME_SPEC   ← 현행을 적어야 나머지가 기준을 갖습니다
   T3 PIPELINE_CURRENT_STATE 편입 (동시)
      │
2  N5 Pack 2종 슬롯 (holding_history · operating_performance)
      │           ← trading·operating 의 L축이 열립니다
3  N1~N4 포스처 표준 4종
      │
4  개정 API_TYPE_CONTRACT  ← 위 셋의 타입이 확정된 뒤
      │
   ┌──┴────────────┬───────────────┐
5  MIGRATION_RUNBOOK  TEST_PLAN   POSTURE_IMPL_GUIDE
   (v0.5 장)                       (분리·참조 전환)
      │
6  나머지 개정 9종 (병렬)
      │
7  N7 doc_integrity.py + README 진입 인덱스 + 폐기 격리
      │
8  CI 묶음 — 전 검사기 통과가 머지 조건
```

**1번이 먼저인 이유** — 현행 동작을 적지 않고 개선안부터 쓰면, 개선했는지
확인할 기준이 없습니다. D23이 갭을 실측했지만 그 기준 문서가 레포 밖에 있습니다.

**2번이 3번보다 먼저인 이유** — 슬롯 없이 포스처 표준을 쓰면 `lAxisSlots` 칸에
실재하지 않는 키를 적게 됩니다. `ONTOLOGY_V0.5_SPEC` §3.1이 금지하는 것입니다.

---

## 8. 전달 방식 — 레포 구조

```
/
├─ README.md                    ← 진입 인덱스. 독자별 경로 · 정본 소유표
├─ CHANGELOG.md
│
├─ 01_ontology/                 T1 · 7종
├─ 02_posture/                  T2 · 5종 + 포스처확장(연구)
├─ 03_spec/                     T3 · D19 · D22 세트 · 런타임 명세
│   └─ current_state/           업로드 3종 — 프로덕션 현행
├─ 04_ops/                      T4 · D1~D13
├─ 05_evidence/                 역설계·산출물점검·INPUT 실측
│
├─ credeal/                     참조구현 + ssot/ 14 yaml
├─ contracts/                   TS 계약
├─ qa/                          검사기 9종
└─ 99_superseded/               폐기 9종 — **수정 금지 · 읽기 금지**
```

### 8.1 폐기 격리가 왜 중요한가

지금 폐기 9종이 **루트에 살아 있는 문서와 나란히** 있습니다. 파일 목록에서
`IM_PRECISION_SPEC.md`와 `CATALOG_RULES.md`가 구분되지 않습니다.
헤더에 ⛔를 달아도 **파일을 열기 전에는 보이지 않습니다.**

디렉터리로 내리면 경로 자체가 경고가 됩니다.

### 8.2 CI

```yaml
on: [pull_request]
jobs:
  docs:
    - python3 qa/doc_integrity.py        # 세트 무결성
    - python3 qa/ontology_check.py       # 온톨로지 내부
    - python3 credeal/ssot/loader.py     # 레지스트리 자기검사
  outputs:
    - python3 qa/standard_check.py --kind pptx  …
    - python3 qa/invariant_check.py --fixture …
    - python3 qa/consistency_check.py …
    - python3 qa/render_snapshot.py --check
```

**수치가 악화되면 머지를 막고, 개선되면 기준선을 낮춰 되돌림을 방지합니다.**

---

## 9. 이 세트로도 안 되는 것

정직하게 적습니다. 문서로 해결되지 않는 것들입니다.

| 항목 | 왜 문서로 안 되는가 | 필요한 것 |
|---|---|---|
| 🔴 **이미지 마스킹** | 상호 간판·번호판·얼굴 검출은 **모델이 필요**합니다 | 검출 모델 도입 + `G20` 구현 |
| `operating`·`trading` 아키타입 | 실증 딜 1건·0건 — **가설입니다** | 딜 축적 후 재정의 |
| `QG01~QG16` 정의 | 운영 코드가 레포 밖 | `quality-gates-v02.ts` 열람 |
| 등급 컷 | 표본 5건 중 4건이 C 이하 | 자산유형별 20건 |
| `BASE_PROFILE` Pack 단일 열 | 가중치 재배분은 **근거가 필요** | Pack별 실측 |
| C 폐기 8건 | v0.1 원본 소실 — 무엇을 막던 제약인지 모릅니다 | 원본이 나오면 대조 |

**마지막 항목이 가장 불편합니다.** "재사용 안 하니 충돌 없다"는 충돌만 다루고
**유실은 다루지 않습니다.** v0.5가 규탄한 "규칙이 조용히 사라짐"과 결과가 같습니다.
원본을 찾는 시도를 포기하지 마십시오.

---

## 10. 확인 필요

- **업로드 3종을 레포에 넣어도 되는가** — 프로덕션 코드 경로가 들어 있습니다.
  넣는다면 `03_spec/current_state/`에 두고 **갱신 주체를 개발팀으로** 명시해야 합니다.
- **디렉터리 재편 시점** — 경로가 바뀌면 129건 인용이 전부 깨집니다.
  일괄 치환 스크립트를 먼저 만들지, 아니면 링크 없이 파일명만 쓸지 결정이 필요합니다.
- **`IM_STANDARD_포스처확장` v3.0의 위치** — 연구 문서로 남길지, 네 표준에 흡수하고
  폐기할지. **흡수하면 조사 근거(명도 관행·세제)의 출처가 흐려집니다.**
- **`trading` 을 아예 뺄지** — L축 슬롯 신설에 등기부 파싱이 필요합니다.
  당장 수요가 없으면 문서만 두고 구현은 미루는 편이 낫습니다.

---

### 부속 — 이 문서가 만들어 내는 것

| 산출 | 경로 |
|---|---|
| 포스처 표준 4종 | `IM_STANDARD_운영형.md` · `IM_STANDARD_개발형.md` · `IM_STANDARD_사옥형.md` · `IM_STANDARD_단기매매형.md` |
| 파이프라인 실행 명세 | `IM_PIPELINE_RUNTIME_SPEC.md` |
| 마이그레이션 v0.5 장 | `MIGRATION_RUNBOOK.md` §v0.5 |
| 문서 세트 검사기 | `qa/doc_integrity.py` |
| 진입 인덱스 | `README.md` |
