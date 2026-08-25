# ⛔ 폐기 문서 — 읽지 마십시오

> **여기 있는 문서에서 규칙을 읽으면 안 됩니다.**
> 규칙의 주인이 아니고, 승계 문서와 내용이 다릅니다.

| | |
|---|---|
| **격리** | 2026-08-25 (D25 §8.1) |
| **수정** | **금지** |
| **삭제** | **금지** — 과거 IM 재현에 필요합니다 |

## 왜 디렉터리로 내렸는가

격리 전까지 이 9종이 **루트에 살아 있는 정본과 나란히** 있었습니다.
파일 목록에서 `IM_PRECISION_SPEC.md`와 `CATALOG_RULES.md`가 구분되지 않았습니다.
헤더에 ⛔를 달아도 **파일을 열기 전에는 보이지 않습니다.**

🔴 **그래서 사고가 났습니다.** 다필지·제척 계산식이 `IM_PRECISION_SPEC.md`에만
있었고 승계 문서에 옮겨지지 않은 채로, 살아 있는 정본이 그것을 "소유자"로
가리키고 있었습니다 (`IM_PARCEL_GAP.md` · D22-8).

경로 자체가 경고가 되어야 합니다.

## 무엇이 어디로 갔는가

| 폐기 문서 | 승계 |
|---|---|
| `IM_PRECISION_SPEC.md` | 계산식 P01~P04 → `CATALOG_RULES.md` §2.2 · 정밀 모드 전환 조건 → `CATALOG_SLOTS.md` §2.5 |
| `IM_DATA_PIPELINE.md` | 수집 경로표 → `CATALOG_SLOTS.md` §1.3 · 현행 동작 → `03_spec_current_state/` |
| `IM_AUTHORING_SPEC.md` | 메모 파싱·`ambiguous` → `CATALOG_LEXICON.md` §1.3 · `03_spec_current_state/01_*` |
| `MOBILE_IM_SPEC.md` | → `MOBILE_GAP_SPEC.md` · `03_spec_current_state/02_*` |
| `ONTOLOGY_IMPLEMENTATION_GAP.md` | → `ONTOLOGY_SSOT_AUDIT.md` · `IM_ONTOLOGY_UPGRADE.md` |
| `ONTOLOGY_V0.4_SPEC.md` | → **`ONTOLOGY_V0.5_SPEC.md`** |
| `ONTOLOGY_V0.3_SPEC.md` | → 동 |
| `ONTOLOGY_V0.2_SPEC.md` | → 동 |
| `_credeal_v2_extract.md` | 원자료 — 승계 없음 |

## 언제 여기를 여는가

| 경우 | 허용 |
|---|:-:|
| 과거 버전으로 Pin된 IM을 재렌더 | ○ |
| "그때 왜 그렇게 결정했나" 확인 | ○ |
| **현재 규칙 확인** | ✗ |
| **새 코드 작성 근거** | ✗ |

살아 있는 문서가 이 디렉터리를 **소유자로 지목하면 `qa/ontology_check.py`가
차단합니다.** 회고로 언급해야 하면 그 줄에 `[HIST]` 태그를 답니다.
