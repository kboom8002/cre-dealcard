# CREDEAL IM 시스템 — 레포 진입 인덱스

> 상업용 부동산 **투자설명서(IM) 생성 시스템**의 규격·온톨로지·검사기 레포입니다.
> 주력 대역은 **매매 30억~500억 상업용 부동산**입니다.

| | |
|---|---|
| **온톨로지** | **v0.5.0** |
| **문서** | 살아 있음 **96** · 폐기 격리 **11** |
| **검사기** | **10종** — `qa/` |
| **최종 갱신** | 2026-08-25 |

---

> 🔴 **착수하시려면 `WORK_ORDER.md` (D00) 하나면 됩니다.**
> 스프린트 6개 · 62.5일 · 소유 · 완료 기준 · 리스크 · 차단 3건이 그 안에 있습니다.
> 나머지 문서는 전부 그 지시서의 근거입니다.

---

## 0. 처음 오셨다면

**읽는 순서가 정해져 있습니다.** 96개를 훑지 마십시오.

| 독자 | ① | ② | ③ |
|---|---|---|---|
| **개발 (신규)** | `ONTOLOGY_V0.5_SPEC.md` | `API_TYPE_CONTRACT.md` | `IM_PIPELINE_RUNTIME_SPEC.md` |
| **개발 (IM 생성)** | `IM_PIPELINE_RUNTIME_SPEC.md` | `CREDEAL_IM_SPEC_수익형.md` | 포스처 표준 (§2.2) |
| **도메인 (중개 실무)** | `IM_SAMPLE_양평동_해설.md` | `IM_AB_PLAYBOOK.md` | `IM_STANDARD_수익형.md` |
| **QA** | `TEST_PLAN.md` | `IM_QUALITY_GATES.md` | `qa/` |
| **운영 (마이그레이션)** | `MIGRATION_RUNBOOK.md` §9 | `ONTOLOGY_V0.5_SPEC.md` §9 | `HANDOVER.md` |
| **경영** | `IM_COMMERCIAL_PROGRAM.md` | `IM_상용화_준비도_평가서.md` | `PRD_IM고도화.md` |
| **인계 받는 분** | 🔴 **`WORK_ORDER.md`** (D00) | `IM_HANDOVER_SET.md` (D25) | 위 표에서 역할 선택 |

---

## 1. 층위 — 규칙이 어디에 사는가

**새 규칙을 쓸 때 여기부터 봅니다.** 층을 잘못 고르면 다른 포스처로 확장할 때
반드시 다시 만들게 됩니다 (`ONTOLOGY_V0.5_SPEC.md` §2).

| 층 | 담는 것 | 판별 질문 |
|---|---|---|
| **1 · 온톨로지** | 슬롯·enum · 코드 공간 · 어휘 · 출처 등급 · 등급 체계 | "개발형에서도 참인가?" → **예** |
| **2 · 포스처 표준** | 섹션 구성 · 강조 · 수익률 기준 · 분량 | "이 포스처에서만 참인가?" → **예** |
| **3 · 구현 규격** | 페이지 순서 · 프리셋 · 텍스트 예산 · 기하 | 지면과 카피의 구체 |
| **4 · 기계 판독** | 위 세 층의 **값** | 서술은 md, 값은 yaml |

두 층에 걸치면 **위 층에 두고 아래가 참조**합니다.

---

## 2. 정본 소유표

**같은 규칙은 한 문서만 소유합니다.** 값을 두 곳에 적으면 반드시 갈립니다.

### 2.1 층 1 · 온톨로지

| 소유 | 문서 |
|---|---|
| 구조 · 층위 · 포스처 계약 · 코드 규율 · 등급 L×P | **`ONTOLOGY_V0.5_SPEC.md`** |
| 슬롯 · enum · 출처 등급 · 수집 경로 | **`CATALOG_SLOTS.md`** |
| 아키타입 R · 임대차 T · 필지 P · 교차검증 X · 제약 C · 게이트 G · 레이아웃 L · 마스크 M | **`CATALOG_RULES.md`** |
| 3축 값 · 조합 매트릭스 · 기본 프로파일 | **`CATALOG_ASSET_TYPES.md`** |
| 어휘 · 금지어 · 치환 · 표기 · 적용 범위 | **`CATALOG_LEXICON.md`** |
| 변경 절차 · 승인 | `ONTOLOGY_GOVERNANCE_SPEC.md` |
| 불변조건 23 | `IM_SYSTEM_SSOT.md` §11 |

### 2.2 층 2 · 포스처 표준

| 포스처 | 문서 | status |
|---|---|---|
| `income` | `IM_STANDARD_수익형.md` (+ 부록) | **commercial** |
| `owner_occupied` | `IM_STANDARD_사옥형.md` | beta |
| `development` | `IM_STANDARD_개발형.md` | beta |
| `operating` | `IM_STANDARD_운영형.md` | beta |
| `trading` | `IM_STANDARD_단기매매형.md` | **internal_only** |
| (조사 근거) | `IM_STANDARD_포스처확장.md` v3.0 — **연구 문서** | — |

### 2.3 층 3 · 구현 규격

| 소유 | 문서 |
|---|---|
| 수익형 지면 규격 | `CREDEAL_IM_SPEC_수익형.md` (D19 v2.2) · `CREDEAL_IM_SPEC_수익형_부록.md` |
| **실행 계약 · 실패 · 재시도 · 멱등 · 시간 예산** | **`IM_PIPELINE_RUNTIME_SPEC.md`** (D26) |
| **포스처·Pack·등급의 단계 관통** | **`IM_PIPELINE_COMPLETION_SPEC.md`** (D27) |
| 현행 파이프라인 동작 | `03_spec_current_state/` |
| 이미지 파이프라인 | `IM_IMAGE_PIPELINE_SPEC.md` |
| 품질 게이트 · 운영 게이트 `QG` | `IM_QUALITY_GATES.md` |
| PPTX 템플릿 · 아키타입 | `PPTX_TEMPLATE_SPEC.md` · `PPTX_ARCHETYPE_SPEC.md` |
| 딜카드 · 모바일 | `DEAL_CARD_SPEC.md` · `MOBILE_GAP_SPEC.md` |
| 발행 후 `F`·`S` | `POST_PUBLISH_SPEC.md` |

### 2.4 층 4 · 기계 판독

```
credeal/ssot/    14 yaml + loader.py     ← 값의 단일 진입점
contracts/       TS 계약 4종
```

**검사기·생성기·프롬프트가 모두 `loader.py` 하나만 읽습니다.**

---

## 3. 검사기

```bash
python3 qa/doc_integrity.py        # 문서 세트 무결성 — 격리·포인터·계약·버전
python3 qa/ontology_check.py       # 온톨로지 내부 — 소유·코드군·포스처·자릿수
python3 credeal/ssot/loader.py     # 레지스트리 자기검사

python3 qa/standard_check.py --kind pptx <file>       # 정본 준수
python3 qa/invariant_check.py --fixture <fx> <file>   # 불변조건
python3 qa/consistency_check.py <file>                # 면 간 값 일치
python3 qa/output_qa.py --fixture <fx> <file>         # 결함 26종
python3 qa/render_snapshot.py                         # 렌더 회귀 (--update 로 기준 갱신)
python3 qa/calibrate.py && python3 qa/calibrate_invariant.py   # 오탐/미탐 보정
```

**양방향 보정을 겁니다** — 정상 산출물을 막지 않는지(오탐 0), 결함을 주입하면
잡는지(미탐 0)를 둘 다 확인합니다. 한쪽만 보면 검사기가 조용히 무력화됩니다.

---

## 4. 디렉터리

```
/                            정본 · 규격 · 실행 문서 (96)
├─ 03_spec_current_state/    프로덕션 현행 명세 — 개발팀이 갱신
├─ credeal/                  참조구현 + ssot/ 14 yaml
├─ contracts/                TS 계약
├─ qa/                       검사기 9종
├─ fixtures/                 시험 픽스처
└─ 99_superseded/            ⛔ 폐기 11종 — **수정 금지 · 읽기 금지**
```

🔴 **`99_superseded/`에서 규칙을 읽지 마십시오.** 다필지·제척 계산식이 폐기 문서에만
남아 통째로 유실된 사고가 있었습니다 (`IM_PARCEL_GAP.md`).
회고로 언급해야 하면 그 줄에 `[HIST]` 태그를 답니다.

---

## 5. 지금 무엇이 막혀 있는가

정직하게 적습니다.

| 항목 | 상태 |
|---|---|
| 🔴 **이미지 마스킹** | 임차인 상호 간판·번호판·얼굴 **미구현**. 검출 모델 필요 (`G20`) |
| 🔴 **`trading` 발행** | L축 슬롯(`holding_history`) 수집 경로 미구현 → `internal_only` |
| `QG01~QG16` | 코드 공간 **예약만** — 운영 게이트 실제 정의 미확인 |
| `operating`·`trading` 아키타입 | **가설** — 실증 1건·0건 |
| `owner_occupied` | 실증 **0건** — 전체가 조사 기반 |
| D1~D13 실행 문서 | **v0.5 미반영** (`IM_HANDOVER_SET.md` §5) |
| 등급 컷 | 표본 5건 중 4건 C 이하 — 20건까지 보류 |
| C 폐기 8건 | v0.1 원본 소실 — 무엇을 막던 제약인지 모릅니다 |

---

## 6. 변경 절차

1. **`CATALOG_RULES.md`에 코드를 먼저 등록**합니다. 다른 문서에서 창설하지 않습니다.
2. `applies_to`를 함께 적습니다 — 전 포스처면 `all`, 아니면 열거.
3. `CHANGELOG.md`에 기록합니다.
4. 버전을 올립니다 (판정 로직 = major, 제약·게이트·레이아웃 추가 = minor).
5. 검증 시나리오를 `tests/`에 추가합니다.
6. **`qa/doc_integrity.py`와 `qa/ontology_check.py`를 통과시킵니다.**
7. 폐기 시 `~~취소선~~` + 사유 + 후속 코드. **코드를 재사용하지 않습니다.**

상세는 `ONTOLOGY_GOVERNANCE_SPEC.md`.

---

## 7. 주요 문서

### 프로그램 · 평가

| 문서 | 담는 것 |
|---|---|
| `IM_COMMERCIAL_PROGRAM.md` | D22-0 프로그램 개요 · 문서 지도 |
| `IM_상용화_준비도_평가서.md` | D21 수용 기준 대비 실측 |
| `IM_HANDOVER_SET.md` | **D25 인계 문서 세트 정의서** |
| `HANDOVER.md` | 인수인계 실무 |
| `PRD_IM고도화.md` | D1 승인·착수 근거 |

### 갭 · 개선

| 문서 | 담는 것 |
|---|---|
| **`WORK_ORDER.md`** | 🔴 **D00 최상위 작업 지시서 — 여기서 시작** |
| `IM_PIPELINE_UPGRADE.md` | D23 파이프라인 갭·개선안 (수익형 기준) |
| `IM_PIPELINE_COMPLETION_SPEC.md` | **D27** 파이프라인 완성 — 포스처 5종·Pack 대응 |
| `IM_ONTOLOGY_UPGRADE.md` | D24 온톨로지 보완 (✅ 반영 완료) |
| `IM_PARCEL_GAP.md` | D22-8 다필지·제척 유실 사고 |
| `IM_BUILD_BACKLOG.md` | FR01~FR36 기능 요구 |
| `IM_DECISIONS.md` | D22-1 규격 결정 (ADR) |

### 실행 · 운영

| 문서 | 담는 것 |
|---|---|
| `MIGRATION_RUNBOOK.md` | D2 · **§9 온톨로지 v0.5 12단계** |
| `API_TYPE_CONTRACT.md` | D3 인터페이스 |
| `ASSUMPTION_REGISTRY.md` | D4 가정값 |
| `TEST_PLAN.md` | D9 회귀·골든·E2E |
| `TELEMETRY_SPEC.md` | D6 계측 |
| `GENERATION_PERF_SPEC.md` | D13 시간 예산 |
| `FIELD_TRANSITION_GUIDE.md` | D11 중개인 전환 |

### 실증

| 문서 | 담는 것 |
|---|---|
| `IM_SAMPLE_양평동_해설.md` | **모범 샘플 작성 흐름·한계·주의** |
| 역설계분석 3종 | 실매물 IM 역설계 — 잠원동 · 당산동 · 3종 |
| INPUT 세트 | 실물 입력 — 양평동 · 당산동 · 잠원동 · 수택동 · 호텔 |
| 산출물점검 | 산출물 실측 점검 — 당산동 · 양평동 · v3 · v4 · 통합추적 |
| `ONTOLOGY_SSOT_AUDIT.md` | 구현 감사 |
