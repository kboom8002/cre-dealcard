# CREDEAL IM 시스템 사양 SSoT v1.5

> **이 문서가 정본입니다.** IM 생성·렌더·검증에 관한 다른 문서와 충돌하면 이 문서를 따릅니다.

## 🔴 v1.5 최우선 정정 — Golden은 합성 데이터입니다

**v1.2의 "Golden 사실 오류 0건"은 검증 결과가 아니었습니다.** 164건 전부 콜드스타트 대응으로 LLM이 생성한 가상 물건이므로, **대조할 사실이 없어 판정 자체가 불가능**했습니다.

| | v1.2 | **v1.5** |
|---|---|---|
| 형식 오염 93.9% | 실재 | 유지 |
| **사실 오류 0건** | 검증됨 | **판정 불가** |
| 폐순환 | **열린 사슬** (RAG 사망) | **퓨샷 경로로 성립** |
| 대응 | 정제 (D5) | **재구축 (D16)** |

**RAG는 여전히 죽어 있으나 퓨샷은 살아 있습니다.** Golden이 시스템 자기 출력이면 잘못된 계산 패턴(`0.85`·`400%`·`×1.2`)이 **코드에서 상수를 지워도 예시로 다시 학습됩니다.**

**→ 정본은 `GOLDEN_REBUILD_SPEC.md` (D16)입니다.** 신규 8건(S 3 · A 5) 구축 후 기존 164건을 `grade='C'`로 격리합니다.

| 로드맵 | 변경 |
|---|--:|
| E3 과거 정제 | 1.5 → **0.5일** (선택) |
| **E6 Golden 재구축** | **+2.0일** |
| **합계** | **100.0 → 101.0일** |
> DB 실측·코드 추적·UI/디자인 스펙 대조·**30일 실행 통계 + 실패 에러 분석**(2026-08-23)으로 확정된 사실만 근거로 삼았습니다.

| | |
|---|---|
| **지위** | Single Source of Truth — 구현 착수 기준 |
| **근거** | 개발팀 답변서 · 감사팀 확인보고서 · 모바일/PPTX 스펙 · **30일 통계 + `result.error` 분석** · 실매물 5건 역검산 |
| **총 공수** | **100일** (응급 5일 포함) |
| **버전** | **v1.4** · 2026-08-23 |

## 🔴 v1.4 최우선 정정 — 시스템 장애가 아니라 입력 UX 문제입니다

실패 18건의 `result.error`를 분석한 결과 **전부 LLM 호출 전 입력 검증 단계 차단**이었습니다.

| 에러 | 건수 | 성격 |
|---|--:|---|
| 매각가 또는 월 임대료 미입력 | **14 (77.8%)** | 사용자 입력 누락 |
| 개발형 — 주소·대지 정보 부족 | 2 (11.1%) | 사용자 입력 누락 |
| **Grade D — IM 생성 차단** | **2 (11.1%)** | **의도된 동작 · 실패 아님** |
| 런타임 에러 · 외부 API 실패 · 타임아웃 | **0** | — |

> **시스템은 정확히 작동하고 있습니다.** 잘못된 입력을 0.6초에 막아 **LLM 호출 252회를 회피**했습니다.
> 이 게이트는 **유지·강화 대상**이지 제거 대상이 아닙니다.

**진짜 문제는 "왜 필수값 없이 제출 버튼을 누를 수 있었나"입니다.** 서버가 아니라 **폼에서 막아야 합니다.**

## v1.3 → v1.4 변경 요약

| # | 변경 | 근거 |
|:-:|---|---|
| 1 | 🔴 **"실패율 40.9%" 표현 폐기** — 시스템 오류 0건 | `result.error` 분석 |
| 2 | **지표 4분할** — 시스템오류 / 입력누락 / 의도된차단 / 정상완료 | 동일 |
| 3 | **응급 E0 성격 변경** — 원인 규명(0.5일) → **입력 폼 사전 검증(1.0일)** | 원인 이미 규명됨 |
| 4 | 개발형 재해석 — **"수요 0"이 아니라 "시도 2건 실패"** | 동일 |
| 5 | 총 공수 99.5 → **100일** | E0 확대 |

### v1.3에서 과했던 판단

| v1.3 | v1.4 정정 |
|---|---|
| "10건 중 4건이 실패하는 상태" | **시스템 오류 0건** · 사용자 입력 누락 16건 |
| "성공률 59.1%" | **정상 처리율 63.6%** (완료 26 + 의도된 차단 2) |
| "E0 실패 원인 규명" | 원인 규명 완료 → **입력 폼 개선**으로 교체 |

## v1.1 → v1.2 변경 요약

모바일 UI/UX 스펙과 PPTX 디자인 시스템 스펙을 반영했습니다. **제 이전 판단 3건이 정정됩니다.**

| # | 변경 | 근거 |
|:-:|---|---|
| 1 | 🔴 **모바일 폰트 판단 정정** — `text-base`는 **이미 17px** (CJK 상향 완료) | 모바일 스펙 C |
| 2 | 🔴 **계측 판단 정정** — 뷰어 측 트래킹은 **이미 있음** (Observer·dwell) | 모바일 스펙 E |
| 3 | 🔴 **Hero 권고 정정** — "숫자 3개 축소"가 아니라 **지표 교체** | 모바일 스펙 A |
| 4 | **하단 고정 바에 전화 부재** — 실제 최대 갭으로 확인 | 모바일 스펙 D |
| 5 | **A03 8행 제한** 신규 발견 — 양평동 12행 중 **4행 누락** | PPTX 스펙 E |
| 6 | **A16 좌표안 확정** — M 0.62 · CW 12.093 기준 | PPTX 스펙 A·D |
| 7 | **PPTX 캡션 7.5pt → 9pt** 상향 | PPTX 스펙 C |
| 8 | 불변조건 17 → **19개** · 공수 97 → **99일** | 위 반영 |

### v1.2에서 확인한 "이미 잘 되어 있는 것"

| 항목 | 평가 |
|---|---|
| 모바일 `text-base` **17px CJK 상향** | 노안 대응이 이미 반영됨 |
| PPTX **테마 프리셋 2종 + 커버 스타일 5종** | 성숙한 디자인 시스템 |
| **텍스트 버짓 12종 + 스마트 절삭** | 종결어미 인식 문장 단위 절삭 |
| 노출 마스크 **3층 + 밴딩** | 제안 설계가 이미 상당 부분 구현 |
| 갤러리 **장수별 자동 레이아웃** | 1·2·3·4장 분기 |

**골격은 우수합니다. 고쳐야 할 것은 값과 소수의 배치입니다.**

---

## 0. 문서 지위와 우선순위

### 0.1 정본 관계

| 영역 | 정본 | 이 문서와 충돌 시 |
|---|---|---|
| 시스템 사양 | **본 문서** | — |
| 온톨로지 구조 | `ONTOLOGY_V0.4_SPEC.md` | 본 문서 우선 |
| 규칙·게이트 | `CATALOG_RULES.md` | 본 문서 우선 |
| IM 내용 표준 | `IM_STANDARD_수익형.md` | 본 문서 우선 |
| 포스처 확장 | `IM_STANDARD_포스처확장.md` v3.0 | 본 문서 우선 |
| 해상도 체계 | `IM_RESOLUTION_TIERS.md` | 본 문서 우선 |

### 0.2 변경 절차

구조 변경은 PR로만 가능합니다. 이 문서를 고치지 않은 구현은 머지하지 않습니다.

---

## 1. 확정 진단 (DB 실측)

### 1.1 Golden Set — 93.9% 오염 · 다만 성격이 다릅니다

| 항목 | 값 |
|---|--:|
| 전체 | **164건** |
| 정상 | **10건 (6.1%)** |
| **오염** | **154건 (93.9%)** |
| `auto_approve` 오염률 | 119/129 = **92.2%** |
| `system_seed` 오염률 | 35/35 = **100%** |
| `was_edited = true` | 0건 (**측정 미구현**) |

#### 🔴 오염 유형 — 사실 오류가 아니라 형식 오염입니다

| 유형 | 건수 | 비율 | 처리 |
|---|--:|--:|:-:|
| **이모지 잔여** | **128** | 78.0% | **자동** |
| 페르소나 누수 | 28 | 17.1% | 수동 |
| 중복 markdown | 13 | 7.9% | **자동** |
| **가짜 데이터** | **0** | — | — |
| **금지어** | **0** | — | — |

> ### 🔴 v1.5 정정 — "가짜 데이터 0건"은 검증이 아니었습니다
>
> **Golden 164건은 콜드스타트 대응으로 LLM이 생성한 합성 데이터입니다.** 존재하지 않는 물건의 수치는 "틀렸다"고 판정할 수 없습니다. 위 표의 0건은 **대조 대상이 없다는 뜻**이지 정확하다는 뜻이 아닙니다.
>
> | 이전 결론 | 정정 |
> |---|---|
> | 형식 오염 93.9% | 유지 — 실재 |
> | **사실 오류 0건** | **판정 불가** |
> | 정제하면 사용 가능 | **재구축 필요** |
>
> 또한 §2.1에서 "퓨샷 경로는 살아 있다"고 확인했으므로, **Golden이 시스템 자기 출력인 이상 폐순환이 성립합니다.** 순환하는 것이 문체면 경미하지만 **잘못된 계산 패턴(0.85 · 400% · ×1.2)이면 치명적**입니다. 코드에서 상수를 지워도 퓨샷 예시가 같은 형태를 다시 가르칩니다.
>
> **→ `GOLDEN_REBUILD_SPEC.md` (D16)가 정본입니다.** 신규 8건(S 3 · A 5) 구축 후 기존 164건을 `grade='C'`로 격리합니다.

원인은 명확합니다 — `sanitizePersona`·`stripMarkdown`이 `data-binder`에는 있는데 **Golden 저장 전에는 실행되지 않습니다.**

> ⚠️ **`was_edited = 0`을 "수정 안 함"으로 읽으면 안 됩니다.** diff INSERT 로직이 구현되지 않아(T1-3 ③) **측정 자체가 안 되고 있습니다.**

### 1.2 🔴 처리 결과 4분할 — "실패율"이라는 단일 지표를 폐기합니다

| 구분 | 30일 | 비율 | 성격 |
|---|--:|--:|---|
| **정상 완료** | **26건** | 59.1% | — |
| **의도된 차단** (Grade D) | **2건** | 4.5% | **정상 동작 · 실패 아님** |
| **사용자 입력 누락** | **16건** | **36.4%** | **개선 대상** |
| **시스템 오류** | **0건** | **0.0%** | 런타임·API·타임아웃 |

**정상 처리율 = (26 + 2) / 44 = 63.6%**

> **"성공률 59.1%"는 오도입니다.** 세 종류를 뭉뚱그리면 개선 대상을 잘못 잡습니다.

#### 실패 18건 에러 분석 (`result.error`)

| 에러 메시지 | 건수 | 조치 |
|---|--:|---|
| 매각 희망가 또는 월 임대료 입력이 필요합니다 | **14** | **입력 폼 사전 검증** |
| 개발형 — 주소 또는 대지/건물 정보 부족 | 2 | 포스처별 필수값 분기 |
| 데이터 등급 D — IM 생성 차단 | 2 | **정상 · 조치 불필요** |

> ⚠️ **`error_message`·`error_stage` 컬럼은 없습니다.** 에러는 `result` JSONB의 `error` 키에 저장됩니다. 계측 설계 시 이 구조를 따릅니다.

#### 이 조기 차단은 좋은 설계입니다

| | |
|---|---|
| 차단 시점 | **LLM 호출 전** (0.6초) |
| 회피한 LLM 호출 | **252회** (18건 × 14회) |
| 절약 시간 | 31.1분 |

**차단이 없었다면 18건이 각각 104초를 쓰고 실패했을 것입니다.** 게이트는 유지·강화하고, **폼에서 미리 막는 것**을 추가합니다.

#### 🔴 개발형 재해석 — "수요 0"이 아닙니다

v1.2에서 "development 실사용 0건"으로 보류를 결정했으나, **시도는 2건 있었고 입력 검증에서 막혔습니다.**

| | |
|---|---|
| 시도 | 2건 |
| 완료 | 0건 |
| 사유 | 주소·대지 정보 미입력 |

**"수요가 없다"와 "폼이 막았다"는 다릅니다.** 다만 2건은 여전히 적으므로 **보류 판단은 유지**하되 재개 조건을 수정합니다(§10.3).

### 1.3 완료건 소요 시간 분포

| 지표 | 값 |
|---|--:|
| 평균 | 104.3초 |
| p50 | 109.8초 |
| **p95** | **148.9초** |
| 최대 | **156.3초** |
| 최소 | 54.1초 |

| 구간 | 건수 |
|---|--:|
| 30~60초 | 2 |
| 60~90초 | 5 |
| 90~120초 | 9 |
| **120~150초** | **9** |
| 150초+ | 1 |

**120초 초과 완료 10건 / 26건 = 38.5%.** 최대 156.3초는 한계 대비 **+36.3초**입니다.

> **`maxDuration = 120`이 실효되지 않고 있습니다.** Vercel 플랜 또는 실행 경로가 제한을 받지 않는 것으로 보입니다. **타임아웃은 실제 장애 원인이 아닙니다.**

### 1.4 🔴 포스처 실사용 — 62건 전부 income

| 포스처 | 건수 |
|---|--:|
| **income** | **62건 (100%)** |
| development · operating · owner_occupied · trading | **각 0건** |

| 자산유형 | 건수 |
|---|--:|
| **unknown** | **30건 (48.4%)** |
| 근린생활시설 계열 | 18건 |
| 근생빌딩 | 7건 |
| 사무용빌딩 | 3건 |
| 꼬마빌딩 | 2건 |
| 기타 | 2건 |

**5대 포스처가 코드에 다 있으나 실 운영은 income만 씁니다.** 로드맵을 재배열합니다(§10).

**자산유형 `unknown` 48.4%가 포스처 확장보다 시급합니다.** 자산유형을 모르면 아키타입 제안·comps 필터가 작동하지 않습니다.

### 1.5 🔴 실거래가 comps — 주력 상단 300~500억이 잘립니다

**주력 거래 대역은 30억~500억 상업용 부동산입니다.** (v1.5 확인)

```typescript
// price-prediction.ts:77
if (isNaN(price) || price < 2_000_000_000) continue;   // 20억 미만 제외
```

| 구간 | 포함 | 주력 대비 |
|---|:-:|---|
| 20억 미만 | ✗ 하드코딩 제외 | **주력 밖 — 영향 없음** |
| 30억 ~ 300억 | ○ | B1·B2·B3 정상 |
| **300억 초과** | **✗** | **B4 (300~500억) 공백 · 금액폭 42.6%** |

용도 필터는 `근린생활시설`·`업무시설`·`주상복합`·`상업용`만 통과합니다.

> **v1.2~v1.4에서 "주력인 20억 미만 꼬마빌딩" 이라고 기술한 것은 틀렸습니다.** 주력 대역을 잘못 알았고, 그 결과 **하단을 문제로 지목하고 상단 공백을 놓쳤습니다.**
>
> **`300억 초과` 상한의 근거는 코드에 없습니다.** 하단 20억은 소액 노이즈 제거로 설명되지만 상한은 주석이 없습니다. **단계 2에서 상한 제거 또는 500억 상향을 검토합니다.**

**밴드 정의는 `API_TYPE_CONTRACT.md` §1.1A `PriceBand`가 정본입니다.**

### 1.6 🔴 존재하지 않는 테이블 3건

| 코드가 기대하는 것 | 실제 | 결과 |
|---|---|---|
| `im_documents` (RAG) | **없음** | RAG 항상 빈 결과 |
| `im_generation_cost_log` | **없음** | 비용 로깅 실패 |
| `floor_leases` | **없음** | 문서·코드 불일치 |
| `0121_edit_diffs` | 테이블 있음 · **INSERT 없음** | 수정 이력 미기록 |

**패턴: 스키마와 코드가 따로 배포되어 왔습니다.** 이것이 최우선 구조 결함입니다.

---

## 2. 🔴 이전 판단 정정 2건

### 2.1 오류 증식은 "폐순환"이 아니라 "열린 사슬"입니다

RAG 테이블이 없으므로 `match_im_documents` RPC는 항상 빈 결과를 반환합니다. **제가 지목한 ⑥⑦ 고리(RAG 적재 → 재주입)는 실제로 끊겨 있습니다.**

그러나 **퓨샷 경로는 살아 있습니다.**

```
명세 예시 → 하드코딩 퓨샷 → 생성물 → Judge → Golden 축적(164건)
                 ↑                                    │
                 └──── buildIMFewShotBlock() ─────────┘
```

| 차단점 | 이전 판단 | 정정 |
|---|---|---|
| Golden 자동 승격 | 필요 | **필요 (유지)** |
| 명세 예시 교체 | 필요 | **필요 (유지)** |
| RAG 법적판정 필터 | 필요 | **불필요 — RAG 미작동** |

**차단점이 셋에서 둘로 줄었습니다.**

### 2.2 🔴 Vercel 타임아웃 — 해소되었으나 더 나쁜 사실이 확인됐습니다

**`route.ts:15`에 `export const maxDuration = 120`이 있습니다.** route 레벨 설정이 `vercel.json`의 60초보다 우선하므로 122초 완료가 가능했습니다.

**"품질 게이트 상시 스킵" 판단은 철회합니다.** Judge는 실제로 실행되고 있습니다(섹션당 3~5초).

#### 🔴 v1.3 재정정 — 타임아웃은 실제 장애가 아닙니다

**156.3초 완료 사례가 존재합니다.** `maxDuration = 120`이 실효되지 않고 있습니다.

| 구간 | 소요 | 비중 |
|---|--:|--:|
| 외부 API 8종 (병렬) | 4.0초 | 3.8% |
| RAG 임베딩·RPC | 1.5초 | 1.4% |
| **7섹션 LLM + Judge (순차)** | **96.2초** | **92.2%** |
| 후처리·DB | 1.5초 | 1.4% |
| **평균 합계** | **104.3초** | |

섹션당 약 **13.7초** (본문 LLM + Judge, 2회 호출). 7섹션 순차 for-await가 병목입니다.

**"간헐적 타임아웃 발생 중" 판단을 철회합니다.** 실제 실패 18건은 1초 안에 죽는 별개 문제입니다.

#### 병렬화 근거 재정의

| | 근거 |
|---|---|
| ~~v1.2~~ | ~~타임아웃 방지~~ — 실제로 초과해도 완료됨 |
| **v1.3** | **① 아키타입 확장 여력 ② 사용자 대기 시간 단축** |

**104초 대기는 UX상 매우 깁니다.** 이것이 실질 근거입니다.

#### 🔴 D13 작성 중 발견한 정정 — A16·A17은 섹션이 아닙니다

**"A16·A17 신설 = 섹션 +2 = 154초"는 틀렸습니다.**

| 개념 | 정의 | 현행 |
|---|---|--:|
| **섹션** | LLM이 생성하는 텍스트 단위 | **7개** |
| **아키타입** | PPTX 슬라이드 레이아웃 | A01~A15 |

**12페이지 PPTX는 7섹션에서 파생됩니다. 1:1이 아닙니다.**

| 신설 | 섹션 추가 |
|---|---|
| **A16 투자구조** | **불필요** — `income_analysis` 재무 데이터를 표로 렌더 |
| A17 준공 전 마케팅 | 필요 — 개발형 전용 (`development_marketing`) |

**income 포스처는 섹션이 늘지 않습니다.** 병렬화 근거는 **① 대기 시간 단축**이 주이고 **② 확장 여력**은 개발형 한정입니다.

#### 4단계 위상 정렬 (`GENERATION_PERF_SPEC.md` §2)

```
1단 (병렬 4)  property_overview │ location_access │ lease_status │ next_steps
                          ↓  [앵커 확정]
2단           income_analysis  →  3단  risk_check  →  4단  investment_thesis
```

| 방식 | 단계 | 평균 | p95 |
|---|:-:|--:|--:|
| 현행 순차 | 7 | 104.3초 | 148.9초 |
| **2단 병렬** | **4** | **63.1초** | **90초** |
| 단축 | | **40%** | 40% |

**섹션을 3개 더 넣어도 같은 단계에 병렬 배치하면 63.1초를 유지합니다.**

> 상세 설계·구현 순서·롤백은 **`GENERATION_PERF_SPEC.md` (D13)** 를 따릅니다.

---

## 3. 응급 조치 (5.0일) — 즉시 착수

| # | 조치 | 공수 | DoD |
|:-:|---|--:|---|
| **E0** | 🔴 **입력 폼 사전 검증** | **1.0일** | **사용자 입력 누락 실패 0건** |
| E1 | Golden 자동 승격 중단 | 0.5일 | `source_type='auto_approve'` 신규 INSERT 0건 |
| E2 | 명세 예시 전량 교체 | 1.0일 | 실측 데이터로 대체 · 금지어 0건 |
| E3 | Golden 154건 정제 | 1.0일 | 이모지·중복 자동 · 페르소나 수동 |
| E4 | 저장 전 정제 파이프라인 삽입 | 0.5일 | `sanitizePersona`·`stripMarkdown`을 Golden 저장 경로에 |
| E5 | 스키마-코드 정합성 점검 | 1.0일 | 미존재 테이블 참조 0건 |

### 3.0 🔴 E0 — 서버가 아니라 폼에서 막습니다

**원인은 이미 규명됐습니다.** 16건이 필수값 없이 제출됐고, 서버가 0.6초에 막았습니다.

**서버 게이트는 정상입니다.** 문제는 그 상태로 제출 버튼을 누를 수 있었다는 것입니다.

#### 구현 항목

| # | 항목 | 내용 |
|:-:|---|---|
| 1 | **제출 버튼 비활성화** | 필수값 미입력 시 `disabled` |
| 2 | **인라인 안내** | 어느 값이 없는지 필드 옆에 표시 |
| 3 | **포스처별 필수값 분기** | `income` = 매매가·월세 / `development` = 주소·대지 |
| 4 | **Grade 사전 표시** | 제출 전 예상 등급 미리보기 (D면 경고) |

```ts
export const REQUIRED_BY_POSTURE: Record<InvestmentPosture, SlotKey[]> = {
  income:         ['askingPriceKrw', 'monthlyRentTotalKrw'],
  development:    ['address', 'landAreaSqm'],
  owner_occupied: ['askingPriceKrw', 'leaseAreaSqm'],
  operating:      ['askingPriceKrw', 'monthlyRevenueKrw'],
  trading:        ['askingPriceKrw'],
};

export function canSubmit(posture: InvestmentPosture, input: FormInput): SubmitState {
  const missing = REQUIRED_BY_POSTURE[posture].filter(k => input[k] == null || input[k] === '');
  return missing.length === 0
    ? { ok: true }
    : { ok: false, missing, message: `${missing.map(labelOf).join(' · ')} 입력이 필요합니다` };
}
```

#### DoD

| # | 조건 |
|:-:|---|
| 1 | 필수값 미입력 시 제출 버튼이 눌리지 않음 |
| 2 | 누락 필드가 화면에 명시됨 |
| 3 | 5개 포스처 전부 필수값 정의 |
| 4 | **30일 재측정 시 입력 누락 실패 0건** |

> **서버 게이트를 제거하지 않습니다.** 이중 방어를 유지합니다. LLM 호출 252회를 막은 장치입니다.

> **v1.3 대비 +0.5일.** E0이 조사(0.5)에서 구현(1.0)으로 바뀌었습니다.

### 3.1 E3 Golden 정제 — 자동 141건 + 수동 28건

```ts
// scripts/clean-golden-sets.ts
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
const PERSONA = /(60대|50대|자산가|법인 대표|초보 투자자)[^.]*?(를 위한|맞춤|용)/g;

export async function cleanGoldenSets(db: SupabaseClient) {
  const { data } = await db.from('im_golden_sets').select('id, markdown');
  for (const row of data ?? []) {
    const cleaned = row.markdown.replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim();
    const hasPersona = PERSONA.test(cleaned);
    await db.from('im_golden_sets').update({
      markdown: cleaned,
      is_active: !hasPersona,                       // 페르소나는 수동 검토 대기
      review_note: hasPersona ? '페르소나 수동 검토 필요' : '자동 정제 완료',
    }).eq('id', row.id);
  }
}
```

| 처리 | 건수 | 방식 | 공수 |
|---|--:|---|--:|
| 이모지 제거 | 128 | 자동 | 0.5일 |
| 중복 제거 | 13 | 자동 (동일) | — |
| 페르소나 검토 | 28 | 수동 (건당 3분) | 0.5일 |

### 3.2 E4 — 저장 전 정제가 근본 대책입니다

`sanitizePersona`·`stripMarkdown`이 `data-binder`(PPTX 렌더 시점)에만 있습니다. **Golden 저장 경로에 없어서 원본이 오염된 채 축적됐습니다.**

```ts
export async function promoteGolden(cand: GoldenCandidate, reviewer: string) {
  if (!reviewer) throw new Error('Golden 승격에는 사람 승인이 필요합니다');
  const clean = stripMarkdown(sanitizePersona(cand.markdown));   // ★ 저장 전 정제
  if (clean !== cand.markdown) logger.warn('[golden] 정제 발생', { id: cand.id });
  // ... 이하 저장
}
```

**정제가 발생했다는 것은 생성 단계에서 이미 오염됐다는 뜻이므로 로그를 남깁니다.**

```sql
ALTER TABLE im_golden_sets
  ADD COLUMN is_active BOOLEAN DEFAULT true,
  ADD COLUMN reviewed_by TEXT,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN review_note TEXT;

-- 검토 전까지 퓨샷 사용 중단
UPDATE im_golden_sets SET is_active = false WHERE source_type = 'auto_approve';
```

**검토 완료 전까지 `auto_approve` 129건을 퓨샷에서 제외합니다.**

### 3.2 E5 스키마-코드 정합성 점검

```ts
// scripts/verify-schema-refs.ts — CI에 편입
const REQUIRED_TABLES = [
  'im_golden_sets', 'im_generation_jobs', 'external_data_cache',
  'building_ssot_lite', 'lease_ledger',
] as const;

export async function verifySchemaRefs(db: SupabaseClient): Promise<Violation[]> {
  const v: Violation[] = [];
  for (const t of REQUIRED_TABLES) {
    const { error } = await db.from(t).select('*').limit(0);
    if (error) v.push({ table: t, error: error.message });
  }
  return v;
}
```

**CI에서 실패하면 배포를 막습니다.** 같은 사고가 3번 반복됐습니다.

---

## 4. 데이터 계층 사양

### 4.1 `lease_ledger` — 임대차 단일 원장

`lease_spaces`(3/13) · `lease_units`(5/13)를 대체합니다.

```sql
CREATE TABLE lease_ledger (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id              UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,

  -- R1 (최소형) — 발행 최소선
  unit_label            VARCHAR(30) NOT NULL,
  tenant_business       TEXT,                    -- 원문 그대로 · 추론 금지
  deposit_krw           NUMERIC(14,0),
  monthly_rent_krw      NUMERIC(14,0),
  current_expiry_date   DATE,
  lease_state           VARCHAR(10) NOT NULL,    -- 임대중 | 공실 | 자가사용

  -- R2 (필요형)
  contract_group        VARCHAR(20),             -- 통합계약 묶음
  lease_area_sqm        NUMERIC(10,2),
  legal_basis           VARCHAR(10),             -- 상가 | 주택 | 미확인
  mgmt_fee_krw          NUMERIC(14,0),
  current_start_date    DATE,

  -- R3 (표준형)
  first_contract_date   DATE,                    -- 갱신요구권 기산
  renewal_exercised     VARCHAR(10),             -- 있음 | 없음 | 모름
  opposing_power        VARCHAR(20),             -- 사업자등록 | 주민등록 | 미확인

  note                  TEXT,
  as_of                 DATE,                    -- 렌트롤 기준일
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lease_state_valid CHECK (lease_state IN ('임대중','공실','자가사용')),
  CONSTRAINT legal_basis_valid CHECK (legal_basis IS NULL OR legal_basis IN ('상가','주택','미확인')),
  CONSTRAINT renewal_valid     CHECK (renewal_exercised IS NULL OR renewal_exercised IN ('있음','없음','모름')),
  CONSTRAINT money_nonneg      CHECK (COALESCE(deposit_krw,0) >= 0 AND COALESCE(monthly_rent_krw,0) >= 0)
);

CREATE INDEX idx_lease_ledger_asset ON lease_ledger(asset_id);
CREATE INDEX idx_lease_ledger_group ON lease_ledger(asset_id, contract_group);
```

**컬럼 순서·명칭은 `CREDEAL_렌트롤_표준양식_v1.2.xlsx`의 계약과 일치합니다.** 엑셀 업로드가 그대로 매핑됩니다.

### 4.2 마이그레이션 순서

| # | 작업 | 되돌리기 |
|:-:|---|---|
| 1 | `lease_ledger` 생성 | DROP |
| 2 | `lease_spaces`·`lease_units` → 이관 스크립트 | 원본 유지 |
| 3 | 읽기 경로를 `lease_ledger`로 전환 | 플래그 롤백 |
| 4 | 쓰기 경로 전환 | 플래그 롤백 |
| 5 | 구 테이블 `deprecated` 표시 (삭제 금지) | — |

**구 테이블은 최소 2개 분기 유지합니다.**

### 4.3 계측 테이블

```sql
CREATE TABLE im_generation_metrics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID REFERENCES im_generation_jobs(id) ON DELETE CASCADE,
  section_type      TEXT NOT NULL,
  used_fast_mode    BOOLEAN NOT NULL,
  used_fallback     BOOLEAN NOT NULL,
  judge_score       NUMERIC(3,1),
  publish_blocked   BOOLEAN NOT NULL DEFAULT false,
  block_reasons     TEXT[],
  confidence        TEXT,
  latency_ms        INTEGER,
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  cost_usd          NUMERIC(10,6),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE im_edit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID REFERENCES im_generation_jobs(id) ON DELETE CASCADE,
  section_type  TEXT NOT NULL,
  before_md     TEXT NOT NULL,
  after_md      TEXT NOT NULL,
  edited_by     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **`im_generation_cost_log` 대신 `im_generation_metrics`를 씁니다.** 기존 `cost-tracker.ts`의 대상 테이블명을 이쪽으로 변경합니다.

---

## 5. 계산 계층 사양

### 5.1 가정값 외부화 — 22개 전부

```ts
export type AssumptionSource = 'measured' | 'market_default' | 'legal' | 'user_input';

export interface Assumption<T> {
  key: string;
  value: T | null;              // legal 계층은 null 가능
  source: AssumptionSource;
  basis: string;                // 화면 노출 문장
  confidence: 'high' | 'medium' | 'low';
  editable: boolean;
  reviewedAt: string;           // YYYY-MM-DD
}
```

### 5.2 확정 가정값 테이블

| key | 값 | source | basis |
|---|--:|:-:|---|
| `acquisitionTaxRate` | **0.046** | `legal` | 취득세 4.0 + 지방교육세 0.4 + 농특세 0.2 |
| `brokerFeeRateMax` | 0.009 | `legal` | 법정 상한 · 협의 가능 |
| `constructionCostPerPyeong` | **12,000,000** | `market_default` | 서울 소형 근생 신축 통상 단가 (실매물 IM) |
| `targetFarByZoning` | **null** | `legal` | **토지이용계획 API 조회 · 실패 시 산출 거부** |
| `devContingencyRate` | 0.05 | `market_default` | 잠원동 5억/320억 = 1.6% · 통상 3~7% |
| `loanRateDefault` | 0.045 | `market_default` | 2026 상업용 담보 통상 |
| `ltvScenarios` | [0, 0.4, 0.5] | `market_default` | 표준 3안 |
| `opexRatioByAssetType` | **null** | `user_input` | **운영비 미확보 시 NOI 산출 금지** |
| `gopMarginDefault` | **null** | `user_input` | **실적 없이 GOP 산출 금지** |
| `tradingExitPrice` | **null** | `user_input` | **comps 없이 목표가 산출 금지** |
| `marketRentPerPyeong` | **null** | `user_input` | **사옥형 절감액은 실제 임차료 입력 필요** |

### 5.3 🔴 폐기 대상 상수 6개

| 폐기 | 사유 |
|---|---|
| `NOI 추정 계수 0.85` | 근거 없음 · gross 계열만 산출 |
| `Opex Ratio 12~35% (6종)` | 출처 없음 · **호텔 35%는 GOP 마진과 혼동 의심** |
| `개발형 용적률 400%` | 용도지역 무시 · **60% 과대** |
| `개발형 공사비 800만원` | 실물 1,200만원 · **33% 과소** |
| `Trading 매각가 = 매입가 × 1.2` | **데이터 없이 차익 23억 창작** |
| `Trading 비교사례 = 매입가 × 1.15` | 동일 |

**null을 반환하고 결손으로 표시하는 것이 정답입니다.**

### 5.4 수익률 산출 계약

```ts
export type CapRateBasis =
  | 'gross_price' | 'gross_price_deposit'
  | 'noi_price'   | 'noi_price_deposit'
  | 'noi_equity'  | 'noi_total_cost' | 'gop_price';

export interface YieldValue { value: number; basis: CapRateBasis; }

export function computeYields(i: FinancialInput): Partial<Record<CapRateBasis, YieldValue>> {
  const annual = i.monthlyRentKrw * 12;
  const out: Partial<Record<CapRateBasis, YieldValue>> = {
    gross_price:         { value: annual / i.priceKrw * 100,                    basis: 'gross_price' },
    gross_price_deposit: { value: annual / (i.priceKrw - i.depositKrw) * 100,   basis: 'gross_price_deposit' },
  };
  if (i.opexKrw != null) {                              // 추정 금지
    out.noi_price = { value: (annual - i.opexKrw) / i.priceKrw * 100, basis: 'noi_price' };
  }
  return out;
}

const NET_BASES: CapRateBasis[] = ['noi_price','noi_price_deposit','noi_equity','noi_total_cost'];

export function renderYield(y: YieldValue): string {
  const label = NET_BASES.includes(y.basis) ? '연 순수익률' : '연 수익률';
  return `${label} ${y.value.toFixed(2)}% (${BASIS_LABEL[y.basis]})`;
}
```

**gross 계열에 "순수익률" 라벨을 붙일 수 없습니다.**

### 5.5 취득원가·실투자금 계약

```ts
export interface EquityBreakdown {
  price: number;
  acquisitionTax: number;
  brokerFee: number;
  otherCost: number;
  totalAcquisitionCost: number;   // 화면 필수 노출
  deposit: number;
  loan: number;
  equity: number;                 // 실투자금
}

export function computeEquity(i: FinancialInput): EquityBreakdown {
  const acquisitionTax = i.priceKrw * ASSUMPTIONS.acquisitionTaxRate.value!;
  const brokerFee = i.brokerFeeKrw ?? i.priceKrw * ASSUMPTIONS.brokerFeeRateMax.value!;
  const otherCost = i.otherCostKrw ?? 0;
  const totalAcquisitionCost = i.priceKrw + acquisitionTax + brokerFee + otherCost;
  return {
    price: i.priceKrw, acquisitionTax, brokerFee, otherCost, totalAcquisitionCost,
    deposit: i.depositKrw, loan: i.loanKrw ?? 0,
    equity: totalAcquisitionCost - i.depositKrw - (i.loanKrw ?? 0),
  };
}
```

**내역 4줄을 반드시 화면에 노출합니다.** 매수인이 검산할 수 있어야 합니다.

### 5.6 포스처별 최종 숫자 — 타입 강제

```ts
export type Headline =
  | { posture: 'income';         monthlyNetCashFlow: number; negativeLeverage: boolean }
  | { posture: 'owner_occupied'; effectiveBurden: number; savedRent: number | null }
  | { posture: 'development';
      mode: 'sale' | 'hold';
      profitRate?: number;
      postDevYield?: YieldValue;
      startDate: Date | null;
      vacateResponsibility: 'seller' | 'buyer' | 'undecided';
      regulationExpiry: Date | null;
      requiredEquity: number | null }
  | { posture: 'operating';      gop: number | null; verificationLevel: 'verified'|'partial'|'unverified' }
  | { posture: 'trading';        holdingCost: number; exitPrice: number | null;
                                 afterTaxGain: { years: number; gain: number }[] };
```

**타입으로 막지 않으면 income의 `monthlyNetCashFlow`가 전 포스처에 복사됩니다.**

### 5.7 역레버리지 강제 경고

```ts
export function buildIncomeThesis(f: FinancialResult, loanRate: number): ThesisPoint[] {
  const pts = [
    { title: '원금 안전판', body: `토지 지분 가치 비중 ${f.landValuePct.toFixed(1)}%` },
    { title: '현금흐름',   body: `${f.occupiedUnits}개 호실 임차 · 공실 ${f.vacancyPct}%` },
  ];
  if (f.yields.gross_price!.value > loanRate * 100) {
    pts.push({ title: '레버리지 효과', body: `자기자본 수익률 ${f.leveredRoe.toFixed(2)}%` });
  } else {
    pts.push({ title: '무차입 구조 권장', severity: 'caution',
      body: `총임대료 기준 수익률 ${f.yields.gross_price!.value.toFixed(2)}%가 대출금리 `
          + `${(loanRate*100).toFixed(1)}%보다 낮아, 대출을 늘릴수록 자기자본 수익률이 낮아집니다.` });
  }
  return pts;
}
```

---

## 6. 검증 계층 사양

### 6.1 결정론 게이트 — FAST_MODE에서도 항상 실행

LLM을 쓰지 않으므로 타임아웃과 무관합니다.

| 코드 | 검증 | 실패 시 |
|:-:|---|---|
| **G19** | 표지 합계 = 원장 합계 | **발행 차단** + 정본 질의 |
| **C19** | 임대면적 합 = 표기 연면적 (±2%) | **발행 차단** |
| **G21** | 첨부 공부 소재지 = 본건 | **발행 차단** |
| **C-BASIS** | 수익률에 `basis` 존재 | **렌더 거부** |
| G18 | 갱신권 산출에 필요 입력 존재 | "확인 필요" 치환 |
| G13 | 대항력 근거 없이 "없음" 표기 | 발행 차단 |
| G17 | 업종 미기재 시 추론 | "미상" 치환 |
| F12 | 만료 계약 > 50% | **발행 차단** |
| F13 | 30일 내 만료 | 경고 |

```ts
export function runDeterministicGates(ctx: IMCore): Violation[] {
  const v: Violation[] = [];
  const rollRent = sum(ctx.leases.map(l => l.monthlyRentKrw ?? 0));
  if (ctx.statedMonthlyRent != null && rollRent !== ctx.statedMonthlyRent) {
    v.push({ code: 'G19', block: true,
      ask: `표지 월세 합계(${fmt(ctx.statedMonthlyRent)})와 원장 합계(${fmt(rollRent)})가 다릅니다. 어느 쪽이 정본입니까?` });
  }
  const rollArea = sum(ctx.leases.map(l => l.leaseAreaSqm ?? 0));
  if (ctx.statedTotalAreaSqm && Math.abs(rollArea - ctx.statedTotalAreaSqm) / rollArea > 0.02) {
    v.push({ code: 'C19', block: true,
      msg: `임대면적 합(${rollArea.toFixed(2)}㎡)과 표기 연면적(${ctx.statedTotalAreaSqm}㎡)이 다릅니다.` });
  }
  for (const d of ctx.attachedDocs) {
    if (d.address && !samePnu(d.address, ctx.address)) {
      v.push({ code: 'G21', block: true, msg: `첨부 ${d.kind} 소재지 불일치: ${d.address}` });
    }
  }
  return v;
}
```

### 6.2 NLG 마스크

```ts
export const BANNED_ABSOLUTE = ['Zero','제로','불패','완벽','무결점','영구적','극대화','초안정','100% 보장'];
export const BANNED_UNSOURCED = ['우량','최적','최고','독보적','유일'];
export const BANNED_AD = ['적극 추천','강력 추천','놓치면 후회','서두르셔야'];
```

**근거 슬롯이 연결되지 않은 형용사는 렌더 단계에서 제거합니다.**

### 6.3 해상도 판정

```ts
export type Resolution = 'R0' | 'R1' | 'R2' | 'R3';

export function resolveLedger(rows: LeaseRow[]): Resolution {
  const live = rows.filter(r => r.leaseState === '임대중');
  if (!live.length) return 'R0';
  const r1 = live.every(r => r.tenantBusiness && r.currentExpiryDate)
          && rows.every(r => r.leaseState);
  if (!r1) return 'R0';
  const r2 = rows.every(r => r.leaseAreaSqm != null && r.legalBasis)
          && live.every(r => r.mgmtFeeKrw != null);
  if (!r2) return 'R1';
  const r3 = live.every(r => r.firstContractDate && r.opposingPower !== '미확인');
  return r3 ? 'R3' : 'R2';
}
```

### 6.4 포스처별 최소 해상도

| 포스처 | 최소 | 미달 시 |
|---|:-:|---|
| income · trading | **R1** | 정상 발행 + 확인사항 |
| owner_occupied | R2 | 절감액 미산출 |
| **development (매수인 명도)** | **R3** | **사업수지 섹션 숨김** |
| development (매도인 명도) | **R1** | 명도 특약 4항 명기 |
| operating | O2 | 실적 검증 수준 "미검증" |

> **렌더는 종합 등급이 아니라 개별 기능(capability)으로 판정합니다.** 등급으로 막으면 이미 있는 자료로 만들 수 있는 것까지 버립니다.

---

## 7. 생성 계층 사양

### 7.1 Golden 승격 — 사람 승인 필수

```ts
export async function promoteGolden(cand: GoldenCandidate, reviewer: string) {
  if (!reviewer) throw new Error('Golden 승격에는 사람 승인이 필요합니다');
  const violations = runDeterministicGates(cand.core);
  if (violations.some(v => v.block)) throw new Error('게이트 미통과 Golden은 승격 불가');
  await db.from('im_golden_sets').insert({
    ...cand, source_type: 'human_approved', reviewed_by: reviewer, is_active: true,
  });
}
```

**Judge 점수는 승격 조건이 아닙니다.** 참고 지표로만 씁니다.

### 7.2 퓨샷 조회 조건

```sql
SELECT markdown FROM im_golden_sets
WHERE section_type = $1 AND asset_type = $2 AND price_band = $3
  AND is_active = true
  AND source_type IN ('human_approved','system_seed')   -- auto_approve 제외
ORDER BY judge_score DESC LIMIT 3;
```

### 7.3 RAG — 재건 전까지 비활성 명시

테이블이 없어 항상 빈 결과입니다. **조용히 빈 문자열을 반환하지 말고 로그를 남깁니다.**

```ts
export async function getRagContext(q: RagQuery): Promise<string> {
  const { data, error } = await db.rpc('match_im_documents', q);
  if (error) { logger.warn('[rag] 인덱스 미구축 — 컨텍스트 없이 진행', { error }); return ''; }
  return (data ?? []).map((d, i) => `[유사사례 ${i+1}] ${d.content}`).join('\n\n');
}
```

**재건 시 법령 인용 문장은 색인에서 제외합니다.** 최신성 보장 수단이 없습니다.

### 7.4 프롬프트 저장소 이전

현재 5개 프롬프트가 **인메모리 하드코딩**이라 수정에 재배포가 필요합니다(T3-1).

```sql
CREATE TABLE im_prompts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_key     TEXT NOT NULL,
  version      INTEGER NOT NULL,
  body         TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT false,
  is_ab_test   BOOLEAN NOT NULL DEFAULT false,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(slot_key, version)
);
```

**운영자가 배포 없이 수정할 수 있어야 개선 속도가 납니다.**

---

## 8. 렌더 계층 사양

### 8.1 IMCore — 단일 자료구조

```ts
export interface IMCore {
  meta: { assetId: string; posture: InvestmentPosture; generatedAt: string; resolution: Resolution };
  address: Address;
  physical: PhysicalFacts;          // 대지·연면적·용적률·건폐율·용도지역
  price: { askingKrw: number; perPyeongLand: number; officialLandPriceRatio: number | null };
  equity: EquityBreakdown;
  yields: Partial<Record<CapRateBasis, YieldValue>>;
  headline: Headline;               // 포스처별 최종 숫자
  leases: LeaseRow[];
  comps: Comp[];
  deficiencies: Deficiency[];       // 확인사항 — 마스킹하지 않음
  anchors: NumericalAnchors;
  provenance: Record<string, Provenance>;
}
```

### 8.2 렌더 경로

```
IMCore ──┬─→ 모바일 렌더
         ├─→ PPTX 렌더 (마크다운 경유 금지)
         └─→ 마크다운 (보관·검색용)
```

**현행 `data-binder`의 `split('|')` 재파싱은 폴백으로만 유지합니다.**

### 8.3 노출 마스크

```ts
export function applyMask(core: IMCore, level: 'public' | 'full'): IMRendered {
  if (level === 'full') return render(core);
  return render({
    ...core,
    address: bandAddress(core.address),        // 지번 → 동
    leases: aggregateLeases(core.leases),      // 호실별 → 총액
    price: bandPrice(core.price),
    attachedDocs: [],
    deficiencies: core.deficiencies,           // ★ 그대로 노출
  });
}
```

**확인사항은 공개 단계에서도 마스킹하지 않습니다.** 결손 표시가 신뢰를 만듭니다.

### 8.4 PPTX 12페이지 구성

| p | 페이지 | 아키타입 | 상태 |
|:-:|---|:-:|:-:|
| 1 | 표지 | A01 | ○ |
| 2 | 한 장 요약 | A02 | 재설계 (지표 교체 · 확인필요 칸) |
| 3 | 물건 개요 | A04 | ○ (+인허가 상태) |
| 4 | 입지 | A06 | ○ |
| 5 | 현황 (포스처별 원장) | A03 | **8행 제한 해소 필요** |
| **6** | **투자 구조** | **A16** | **신설** |
| 7 | 가격 근거 | A03 | income 배정 필요 |
| 8 | 개선 여력 | A05 | ○ |
| 8b | 준공 전 마케팅 | A17 | **개발형만 신설** |
| 9 | 리스크·확인사항 | A07 | 3구획 재설계 |
| 10·11 | 사진 | A14 | ○ |
| 12 | 거래 조건 | A09 | 매수인 CTA 전환 |

**A11·A12는 dead code이므로 삭제합니다.**

#### 🔴 A03 8행 제한 — 렌트롤이 잘립니다

`a03:71-74`에 **최대 8행** 제한이 있고 초과분은 *"외 N건은 별첨 참조"* 로 처리됩니다.

| 물건 | 렌트롤 행수 | 표시 | **누락** |
|---|--:|--:|--:|
| 당산동 | 8 | 8 | 0 |
| **양평동** | **12** | 8 | **4행** |
| 연남동 골든 | 11 | 8 | 3행 |
| 잠원동 건축물현황 | 18 | 8 | 10행 |

**렌트롤은 매수인 판단의 핵심 원장입니다.** 전량 표기가 원칙이어야 하고, 별첨이 실제로 생성되는지도 확인되지 않았습니다.

| 대응 | 방식 |
|---|---|
| **A03 연속 슬라이드** | 8행 초과 시 자동 분할 (`A03-1`, `A03-2`) |
| 폰트 축소 | 12행까지 9pt로 1장 수용 |
| 불변조건 18 | **렌트롤은 전량 표기한다** |

### 8.5 좌표 기준 (A16·A17 설계용)

| 항목 | 값 |
|---|--:|
| 슬라이드 | **13.333 × 7.5 in** (16:9) |
| 좌우 마진 `M` | **0.62** |
| 가용 폭 `CW` | **12.093** |
| 본문 시작 Y | 1.35 ~ 1.80 |
| Footer Y | 6.94 ~ 7.12 |

#### A16 투자 구조 — 배치안

| 요소 | X | Y | W | H |
|---|--:|--:|--:|--:|
| Kicker | 0.62 | 0.55 | 12.09 | 0.25 |
| Title | 0.62 | 0.85 | 12.09 | 0.40 |
| **총취득원가 표** (좌) | 0.62 | 1.55 | 5.60 | 2.20 |
| **LTV 시나리오 표** (우) | 6.61 | 1.55 | 6.10 | 2.20 |
| **역레버리지 경고** | 0.62 | 4.00 | 12.09 | 0.70 |
| 전제 주석 | 0.62 | 4.85 | 12.09 | 1.90 |
| Footer | 0.62 | 6.94 | 12.09 | 0.30 |

**검증** — 본문 끝 6.75 vs Footer 6.94 (여유 0.19in) · 우측 끝 12.713 = M + CW ✓

> `pptxgenjs`의 `slide.addTable()`이 지원되므로(`pptx-renderer.ts:125`) LTV 시나리오 표를 네이티브 테이블로 렌더할 수 있습니다.

### 8.6 PPTX 타이포 — 캡션 상향

| 영역 | 현행 | 목표 | 사유 |
|---|--:|--:|---|
| 커버 대제목 | 40pt | 유지 | |
| 슬라이드 타이틀 | 21~26pt | 유지 | |
| 본문 KR | 10~14pt | **11pt 하한** | A4 흑백 출력 |
| **캡션·주석** | **7.5~8.5pt** | **9pt 하한** | **basis·기준일 표기가 안 읽히면 무의미** |

**`NUM = Arial` 고정, 한글 폰트 임베딩 없음**은 유지하되, 뷰어 미설치 환경 대비 폰트 임베딩을 단계 8에서 다룹니다.

### 8.7 🔴 모바일 규격 — v1.1 판단 정정

**v1.1에서 "본문 최소 16px (현행 `text-[10px]` 금지)"라고 썼으나 사실과 다릅니다.**

`globals.css`에 **7단계 토큰 체계가 이미 있고 CJK 상향까지 적용**돼 있습니다.

| 클래스 | px | 용도 |
|---|--:|---|
| `text-2xs` | 11 | 캡션·법적 문구 |
| `text-xs` | 13 | 보조·뱃지 |
| `text-sm` | 14 | 섹션 본문 |
| **`text-base`** | **17** | **기본 본문 (16→17 CJK 상향)** |
| `text-lg` | 19 | 소제목 |
| `text-xl` | 22 | 섹션 타이틀 |
| `text-3xl` | 32 | Hero 가격 |

**`text-[10px]`는 면책 조항 전용입니다.** T1-2 답변의 "인라인 사용"을 본문 전반으로 오독했습니다.

#### 실제 갭 5건

| # | 항목 | 현행 | 목표 |
|:-:|---|---|---|
| 1 | **하단 고정 바에 전화 없음** | 공유·PDF·PPTX·모드전환·신청 | **전화를 1순위로 편입** |
| 2 | **Hero 지표 선택** | Cap Rate · 매각가 · 대지비중 · **WALE** | **매매가 · 평당가 · 월 임대료 · 확인필요 n건** |
| 3 | 면책 10px | `text-[10px]` | `text-2xs` (11px) 이상 |
| 4 | 접근성 | `aria-label`·`aria-expanded` 미사용 | 아코디언·갤러리에 필수 |
| 5 | 이미지 폴백 | `onError` 없음 | 폴백 이미지 지정 |

> **1번이 가장 큽니다.** 50~60대 매수인의 1순위 행동이 전화인데, 가장 잘 보이는 하단 고정 바에 없습니다.
>
> **2번은 v1.1의 "숫자 3개로 축소" 권고를 정정합니다.** 2×2 그리드는 유지하되 지표를 교체하는 것이 맞습니다. `Cap Rate`는 basis 미표기에 0.85 계수가 적용된 값이고, `WALE`는 중개인도 잘 쓰지 않는 용어입니다.

#### 유지할 것

| 항목 | 평가 |
|---|---|
| `text-base` 17px CJK 상향 | **좋은 판단** — 유지 |
| 터치 영역 ~44px | 확보됨 · **선언만 필요** |
| `max-w-2xl` (672px) | 데스크톱에서도 모바일 폭 유지 — 의도적 설계 |
| 아코디언 다중 오픈 | `Set` 기반 · 적절 |
| OSM 3×3 타일 지도 폴백 | 카카오 API 실패 대비 |

---

## 9. 계측 사양

### 9.1 🔴 정정 — 계측이 "전무"하지 않습니다

**뷰어 측 행동 트래킹은 이미 구현돼 있습니다.** 없는 것은 **생성 계층**입니다.

| 이미 있음 | 구현 |
|---|---|
| **섹션 노출 감지** | Intersection Observer → Progress Dots + View API |
| **체류 시간** | `beforeunload` 총 dwell time |
| LLM 비용 계산 | `cost-tracker.ts` (대상 테이블 부재로 **미작동**) |

### 9.2 🔴 처리 결과 지표 — 4분할 필수

**"성공률" 단일 지표를 쓰지 않습니다.** 세 종류를 뭉뚱그리면 개선 대상을 잘못 잡습니다.

| 지표 | 산식 | 현재 | 목표 |
|---|---|--:|--:|
| **시스템 오류율** | 런타임·API·타임아웃 실패 / 시도 | **0.0%** | 0% 유지 |
| **입력 누락률** | 필수값 미입력 차단 / 시도 | **36.4%** | **0%** |
| **의도된 차단율** | Grade D 차단 / 시도 | 4.5% | 정상 · 목표 없음 |
| **정상 처리율** | (완료 + 의도된 차단) / 시도 | **63.6%** | 100% |

```sql
-- result JSONB에서 에러 유형 분류 (error_message 컬럼 없음)
SELECT
  CASE
    WHEN status = 'completed'                              THEN '완료'
    WHEN result->>'error' LIKE '%등급 D%'                   THEN '의도된 차단'
    WHEN result->>'error' LIKE '%입력이 필요%'
      OR result->>'error' LIKE '%정보 부족%'                 THEN '입력 누락'
    ELSE '시스템 오류'
  END AS outcome,
  COUNT(*)
FROM im_generation_jobs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY 1;
```

### 9.3 신규 계측 — 생성 계층 한정

| # | 지표 | 소스 | 용도 |
|:-:|---|---|---|
| 1 | FAST_MODE 사용률 | `im_generation_metrics` | 품질 게이트 작동 확인 |
| 2 | 폴백 발동률 (섹션별) | 동일 | AI 실질 작동 여부 |
| 3 | **중개인 수정률 (섹션별)** | `im_edit_events` | **품질의 유일한 대리 지표** |
| 4 | Judge 점수 분포 | `im_generation_metrics` | 승격 기준 재조정 |
| 5 | publishBlocked 사유별 | 동일 | 게이트 실효성 |
| 6 | 공공 API 성공률 | 신규 로깅 | 결손 기본값 결정 |
| 7 | **구간별 소요 시간** | 동일 | **병렬화 효과 측정** |
| 8 | 건당 비용 | 동일 | ROI |

**3번이 가장 중요합니다.** 스키마는 있고 INSERT만 없습니다.

**7번은 단계 1.5(병렬화)의 전후 비교 근거**이므로 구간별로 나눠 기록합니다 — 외부 API / RAG / 섹션별 LLM / Judge / 후처리.

### 9.3 뷰어 계측과 결합

기존 dwell time·섹션 노출 데이터를 **중개인 수정률과 교차**하면 품질 판단이 정밀해집니다.

```
수정률 높은 섹션 × 체류 시간 짧은 섹션  →  우선 개선 대상
```

---

## 10. 로드맵

| 단계 | 내용 | 공수 | 누적 |
|:-:|---|--:|--:|
| **0** | **응급 (E0~E5)** | **5.0** | 5.0 |
| 1 | 계측 도입 | 3.0 | 8.0 |
| **1.5** | **섹션 2단 병렬화** | **5.0** | **13.0** |
| 2 | 가정값 외부화 (22개) | 8.0 | 21.0 |
| 3 | 결정론 게이트 + basis 강제 | 5.0 | 26.0 |
| **3.5** | **자산유형 판별 개선** (unknown 48.4% 해소) | **4.0** | **30.0** |
| 4 | `lease_ledger` 통합 | 8.0 | 38.0 |
| 5 | IMCore 단일 코어 전환 | 13.0 | 51.0 |
| 6 | A16·A17 신설 + 아키타입 설정화 | 8.0 | 59.0 |
| **6.5** | **A03 8행 제한 해소** (연속 슬라이드) | **2.0** | **61.0** |
| 7 | 모바일 매체 최적화 | **4.0** | 65.0 |
| 8 | PPTX 매체 최적화 | 10.5 | 75.5 |
| 9 | 해상도 체계 (R1~R3) | 12.0 | 87.5 |
| 10 | **income 포스처 교정** | **11.0** | 98.5 |
| **11** | **접근성 보강** (aria · 폴백 · 면책 폰트) | **1.5** | **100.0** |
| — | *나머지 4포스처 (36일)* | *보류* | — |
| | **합계** | **100.0일** | |

### 10.1 누적 변경 이력

| 변경 | 증감 | 버전 |
|---|--:|:-:|
| 응급 E3 정제 자동화 | −2.0 | v1.1 |
| 섹션 2단 병렬화 신설 | +5.0 | v1.1 |
| 자산유형 판별 신설 | +4.0 | v1.1 |
| 포스처 5종 → income만 | −47.0 | v1.1 |
| **A03 8행 해소 신설** | **+2.0** | **v1.2** |
| **모바일 최적화 축소** (토큰 이미 존재) | **−1.5** | **v1.2** |
| **접근성 보강 신설** | **+1.5** | **v1.2** |
| | **137 → 99일** | |

### 10.2 v1.2 신규 단계 설명

**단계 6.5 (A03 8행 해소 · 2일)** — 6단계 직후에 둡니다. 아키타입 설정화가 끝나야 연속 슬라이드 분할을 깔끔히 구현할 수 있습니다.

**단계 7 축소 (5.5 → 4.0일)** — 디자인 토큰이 이미 있으므로 **신규 구축이 아니라 갭 보완**입니다. 전화 CTA 편입 · Hero 지표 교체 · 면책 폰트가 실제 작업입니다.

**단계 11 (접근성 · 1.5일)** — `aria-label`·`aria-expanded` 미사용, 지도 `alt=""`, 이미지 `onError` 폴백 부재를 한 번에 처리합니다.

### 10.2 🔴 단계 1.5가 6단계의 선행 조건입니다

현재 122초가 이미 한계(120초)를 넘었습니다. **병렬화 없이 A16·A17을 추가하면 154초가 되어 확실히 실패합니다.**

```
단계 1.5 (병렬화) → 55초  →  단계 6 (섹션 +2) → 87초  ✓
단계 1.5 생략     → 122초 →  단계 6 (섹션 +2) → 154초 ✗
```

### 10.3 보류 포스처 재개 조건

| 포스처 | 재개 조건 |
|---|---|
| development | 개발형 **시도 3건 이상** (현재 2건) · 또는 입력 폼 보완 후 재측정 |
| owner_occupied | 법인 사옥 문의 **5건 이상** |
| trading · operating | 동일 기준 |

**수요가 확인되면 각 6~12일로 즉시 착수 가능합니다.** 골격은 이미 구현돼 있습니다.

### 10.1 단계별 DoD

| 단계 | 통과 조건 |
|:-:|---|
| 0 | `auto_approve` 신규 0건 · Golden 164건 분류 완료 · 미존재 테이블 참조 0건 |
| 1 | 8지표 30일 기준선 확보 |
| 2 | 22개 전부 출처 표기 · 폐기 6개 제거 확인 |
| 3 | 실매물 5건 재생성 시 합계 불일치 0건 · basis 누락 0건 |
| 4 | 구 테이블 읽기 0건 |
| 5 | PPTX가 마크다운 없이 렌더 · 골든 스냅샷 일치 |
| 9 | 실매물 5건 해상도 판정이 엑셀과 일치 |
| 10 | 포스처 5종 실매물 각 1건 재생성 · 수치 전량 검산 통과 |

---

## 11. 출시 불변조건

이 조건을 어기는 구현은 머지하지 않습니다.

| # | 불변조건 | applies_to |
|:-:|---|---|
| 1 | 운영비를 모르면 NOI를 산출하지 않는다 | income · operating |
| 2 | 수익률에 basis가 없으면 렌더하지 않는다 | income · operating · trading |
| 3 | gross 계열에 "순수익률" 라벨을 붙이지 않는다 | income · operating |
| 4 | 용도지역 조회 실패 시 개발 규모를 산출하지 않는다 | development · trading |
| 5 | comps가 없으면 목표 매각가를 산출하지 않는다 | **all** |
| 6 | 업종·상호는 원문 그대로 쓰고 추론하지 않는다 | income · operating |
| 7 | 최초계약일 없이 갱신요구권 연수를 출력하지 않는다 | income · development · operating |
| 8 | 자가사용을 공실로 계산하지 않는다 | income · owner_occupied |
| 9 | 확인사항 칸은 공개 단계에서도 마스킹하지 않는다 | **all** |
| 10 | Golden 승격에는 사람 승인이 필요하다 | **all** |
| 11 | 결정론 게이트는 FAST_MODE에서도 실행한다 | **all** |
| 12 | 미존재 테이블 참조는 CI에서 차단한다 | **all** |
| 13 | 결손은 사라지지 않고 확인사항으로 이동한다 | **all** |
| 14 | 물건명·법인명·임차인명은 대외 문서에 표기하지 않는다 | **all** |
| 15 | 섹션 수를 늘리기 전에 생성 시간을 측정한다 (한계 120초) | **all** |
| 16 | 자동 comps 조회 불가 구간(300억 초과 · B4)은 manual_comps 없이 가격 근거를 제시하지 않는다 | **all** |
| 17 | Golden 저장 전에 sanitizePersona·stripMarkdown을 실행한다 | **all** |
| 18 | 렌트롤은 전량 표기한다 | income · operating |
| 19 | Hero 지표는 매수인이 검산 가능한 것으로 구성한다 | **all** |
| 20 | 필수값 검증은 폼에서 먼저 하고 서버 게이트는 유지한다 | **all** |
| 21 | 실패를 시스템오류·입력누락·의도된차단으로 나눠 집계한다 | **all** |
| 22 | 같은 지표는 모든 면에서 같은 값이어야 한다 | **all** |
| 23 | 마스킹은 상호를 가리되 업종을 지우지 않는다 | **all** |

> 🔴 **v0.5에서 `applies_to` 를 달았습니다.** 8건은 전 포스처 공통이 아닙니다 —
> 개발형에는 NOI 자체가 없고 운영형에는 임대차가 없습니다. 구분 없이 검사를 돌리면
> 항상 실패하고, **항상 실패하는 검사는 곧 무시됩니다.**
> 근거는 `ONTOLOGY_V0.5_SPEC.md` §7, 기계 판독본은 `credeal/ssot/im.invariants.yaml`.

**#22 · #23은 v0.5 신설입니다.**
#22는 평당가가 한 면 15,933만원 · 다른 면 1억 5,923만원이었는데 **검사기 5층이
전부 통과시킨** 사고에서 나왔습니다. #23은 `[TENANT_A]` 로 뭉개면 불변조건 6과 14가
충돌하기 때문입니다 — 업종은 투자 판단 정보이고 상호는 개인정보입니다.

**#14의 범위가 이미지까지 넓어졌습니다.** 실측 결과 사진에 임차인 상호 간판·
차량 번호판·보행자 얼굴이 그대로 있었고 EXIF에 좌표가 남아 있었습니다
(`IM_IMAGE_PIPELINE_SPEC.md` · 게이트 `G20`).

---

## 12. 미해결 — 4건 해소 · 1건 잔존

| # | 항목 | 결과 |
|:-:|---|---|
| 1 | IM 생성 실행 경로 | ✅ **해소** — `route.ts` `maxDuration=120` · 7섹션 순차가 92% |
| 2 | Golden 오염 비율 | ✅ **해소** — 154/164 (93.9%) · **형식 오염** |
| 3 | 실거래가 커버리지 | ✅ **해소** — **주력 상단 300~500억(B4) 자동 조회 불가** |
| 4 | 포스처 분포 | ✅ **해소** — **62건 전부 income** |
| 5 | 개발형 명도 책임 비율 | ⚪ **산출 불가** — 개발형 딜 0건 |

### 12.1 잔존 1건의 처리

개발형 딜이 0건이므로 시스템 데이터로는 확인할 수 없습니다. **영업 계약서 표본으로만 가능**하며, 개발형 포스처가 보류 상태이므로 **재개 시점까지 미룹니다.**

### 12.2 새로 발생한 확인 사항

| # | 항목 | 영향 |
|:-:|---|---|
| A | 122초 초과로 인한 **실제 타임아웃 발생률** | 병렬화 우선순위 |
| B | 자산유형 `unknown` 30건의 **입력 단계 원인** | 단계 3.5 설계 |
| C | ✅ **해소** — 주력은 30~500억. 신규: **B4(300~500억) 수임 건수 비중** | comps 대책 규모 |

---

## 13. 참고

| 영역 | 문서 |
|---|---|
| 개선 전략 | `IM_고도화_전략.md` |
| 내용 표준 | `IM_STANDARD_수익형.md` |
| 포스처 확장 | `IM_STANDARD_포스처확장.md` v3.0 |
| 해상도 체계 | `IM_RESOLUTION_TIERS.md` |
| 통합 아키텍처 | `IM_UNIFIED_ARCHITECTURE.md` |
| 원장 양식 | `CREDEAL_렌트롤_표준양식_v1.2.xlsx` |
| 규칙 정본 | `CATALOG_RULES.md` |

> **물건명·소재지·임차인명은 내부 참조용입니다.** 대외 문서에는 표기하지 않습니다.
