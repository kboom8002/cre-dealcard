# IM 생성 성능 사양 — 섹션 병렬화

> **D13** · `IM_SYSTEM_SSOT.md` v1.4 단계 1.5 구현 사양
> 현행 104.3초를 **63.1초(40% 단축)** 로 줄이고, 섹션 확장 여력을 확보합니다.

| | |
|---|---|
| **문서 ID** | D13 |
| **소유** | 개발팀 |
| **선행 정본** | `IM_SYSTEM_SSOT.md` v1.4 §1.3 · §2.2 |
| **대상 단계** | 1.5 (5.0일) |
| **갱신** | 섹션 구성 변경 시 |
| **작성일** | 2026-08-23 |

---

## 0. 🔴 착수 전 정정 — A16·A17은 섹션이 아닙니다

SSoT v1.2~v1.4에서 **"A16·A17 신설 = 섹션 +2 = 154초"** 라고 기술했으나 **틀렸습니다.**

| 개념 | 정의 | 현행 |
|---|---|--:|
| **섹션** | LLM이 생성하는 텍스트 단위 | **7개** |
| **아키타입** | PPTX 슬라이드 레이아웃 | A01~A15 |

**12페이지 PPTX는 7섹션에서 파생됩니다. 1:1이 아닙니다.**

| 신설 아키타입 | 섹션 추가 |
|---|---|
| **A16 투자구조** | **불필요** — `income_analysis`의 재무 데이터를 표로 렌더 |
| **A17 준공 전 마케팅** | **필요** — 개발형 신규 내용 (`development_marketing`) |

> **income 포스처는 섹션이 늘지 않습니다.** 따라서 병렬화의 근거는 **① 사용자 대기 단축**이 주이고, **② 확장 여력**은 개발형에 한정됩니다.
>
> 이 정정을 SSoT §2.2에 반영해야 합니다.

---

## 1. 현행 실측

### 1.1 소요 시간 분포 (30일 · 완료 26건)

| 지표 | 값 |
|---|--:|
| 평균 | **104.3초** |
| p50 | 109.8초 |
| **p95** | **148.9초** |
| 최대 | 156.3초 |
| 최소 | 54.1초 |

| 구간 | 건수 | 비율 |
|---|--:|--:|
| 30~60초 | 2 | 7.7% |
| 60~90초 | 5 | 19.2% |
| 90~120초 | 9 | 34.6% |
| **120~150초** | **9** | **34.6%** |
| 150초+ | 1 | 3.8% |

### 1.2 구간 분해

| 구간 | 소요 | 비중 | 방식 |
|---|--:|--:|---|
| 외부 API 8종 | 4.0초 | 3.8% | `Promise.all` 병렬 |
| RAG 임베딩·RPC | 1.5초 | 1.4% | 순차 · **인덱스 부재로 빈 결과** |
| **7섹션 LLM + Judge** | **96.2초** | **92.2%** | **순차 `for-await`** |
| 후처리·DB | 1.5초 | 1.4% | 순차 |
| **미귀속 (`queue_wait`)** | **1.1초** | **1.1%** | **계측 후 확정** |
| **합계** | **104.3초** | **100.0%** | |

> **🔴 미귀속 1.1초** — 4구간 합이 103.2초로 실측 104.3초와 어긋납니다. 어느 구간에도 귀속되지 않는 시간이 있다는 뜻이므로 숨기지 않고 `queue_wait` 구간으로 드러냅니다. **기타 구간 8.1초 산출(104.3 × (1−0.922))에는 이미 포함**돼 있어 §3의 63.1초 계산은 영향받지 않습니다. (D6 §4.1)

**섹션당 13.7초** — 본문 LLM 1회 + Judge 1회, 총 14회 호출이 순차 발생합니다.

### 1.3 타임아웃은 실제 장애가 아닙니다

| | |
|---|---|
| `route.ts` `maxDuration` | 120 |
| 최대 완료 | **156.3초** |
| 판정 | **제한이 실효되지 않음** |

120초 초과 완료 **10건 / 26건 (38.5%)**. 타임아웃으로 인한 실패는 **0건**입니다.

> **병렬화는 타임아웃 회피가 아니라 UX 개선입니다.** 104초 대기는 길고, p95 149초는 이탈을 만듭니다.

---

## 2. 섹션 의존 그래프

### 2.1 의존 분석

| 섹션 | 선행 | 의존 대상 |
|---|:-:|---|
| `property_overview` | 0 | — 독립 |
| `location_access` | 0 | — 독립 |
| `lease_status` | 0 | — 독립 (렌트롤은 결정론적 주입) |
| `next_steps` | 0 | — 독립 (표준 3단계 프로세스) |
| `income_analysis` | 2 | `property_overview` · `lease_status` |
| `risk_check` | 3 | + `income_analysis` |
| `investment_thesis` | 2 | `income_analysis` · `risk_check` |

### 2.2 위상 정렬 → 4단계

```
1단 (병렬 4)   property_overview │ location_access │ lease_status │ next_steps
                        ↓
                 [앵커 확정]
                        ↓
2단 (단독)      income_analysis
                        ↓
3단 (단독)      risk_check
                        ↓
4단 (단독)      investment_thesis
```

**7단계 순차 → 4단계**로 줄어듭니다.

### 2.3 왜 `next_steps`가 1단인가

`next_steps`는 **NDA → 계약 → 잔금** 표준 프로세스이며 포스처별 문구 변형만 있습니다. 앞 섹션의 수치를 참조하지 않으므로 독립입니다.

> **현행 코드가 이것을 마지막에 두는 것은 관례일 뿐 의존이 아닙니다.**

---

## 3. 시간 산출

| 방식 | 단계 | 평균 | p95 | 최대 |
|---|:-:|--:|--:|--:|
| **현행 순차** | 7 | **104.3초** | 148.9초 | 156.3초 |
| **2단 병렬** | 4 | **63.1초** | **90초** | **95초** |
| 단축 | | **40%** | 40% | 39% |

산식.

```
기타 구간        = 104.3 × (1 − 0.922) = 8.1초
섹션당           = 104.3 × 0.922 ÷ 7   = 13.7초
병렬 후 소요      = 8.1 + 13.7 × 4      = 63.1초
```

### 3.1 섹션 추가 여력

| 섹션 추가 | 순차 | 병렬 |
|:-:|--:|--:|
| +0 | 104.3초 | **63.1초** |
| +1 | 118.0초 | **63.1초** |
| +2 | 131.8초 | **63.1초** |
| +3 | 145.5초 | **63.1초** |

**같은 단계에 병렬 배치하는 한 시간이 늘지 않습니다.** A17(개발형)은 1단 또는 3단에 넣습니다.

---

## 4. 구현 설계

### 4.1 실행 구조

```ts
export interface SectionStage {
  stage: 1 | 2 | 3 | 4;
  sections: SectionType[];
  parallel: boolean;
}

export const SECTION_STAGES: Record<InvestmentPosture, SectionStage[]> = {
  income: [
    { stage: 1, parallel: true,  sections: ['property_overview','location_access','lease_status','next_steps'] },
    { stage: 2, parallel: false, sections: ['income_analysis'] },
    { stage: 3, parallel: false, sections: ['risk_check'] },
    { stage: 4, parallel: false, sections: ['investment_thesis'] },
  ],
  development: [
    { stage: 1, parallel: true,  sections: ['property_overview','location_access','site_analysis','next_steps'] },
    { stage: 2, parallel: false, sections: ['development_feasibility'] },
    { stage: 3, parallel: true,  sections: ['risk_check','development_marketing'] },
    { stage: 4, parallel: false, sections: ['investment_thesis'] },
  ],
  // owner_occupied · operating · trading 동일 패턴
};
```

### 4.2 오케스트레이터

```ts
export async function generateSectionsStaged(
  ctx: IMGenerationContext,
): Promise<Map<SectionType, SectionResult>> {
  const out = new Map<SectionType, SectionResult>();
  let anchors: NumericalAnchors = ctx.initialAnchors;

  for (const stage of SECTION_STAGES[ctx.posture]) {
    const t0 = Date.now();
    const results = stage.parallel
      ? await Promise.all(stage.sections.map(s => generateSingleSection(s, ctx, anchors)))
      : [await generateSingleSection(stage.sections[0], ctx, anchors)];

    for (const r of results) out.set(r.sectionType, r);
    anchors = mergeAnchors(anchors, results);          // ★ 단계 종료 시 앵커 갱신
    logStageLatency(ctx.jobId, stage.stage, Date.now() - t0, stage.sections.length);
  }
  return out;
}
```

### 4.3 🔴 `numericalAnchors` 전파 보장

**현행 순차 구조는 앞 섹션의 마크다운 텍스트를 통째로 프롬프트에 넘깁니다.** 병렬 구조에서는 이것이 불가능하므로 **구조화된 앵커만** 넘깁니다.

| 1단에서 확정되는 앵커 | 출처 |
|---|---|
| `askingPriceKrw` | 입력 (생성 전 확정) |
| `totalAreaSqm` | `property_overview` |
| `vacancyPct` | `lease_status` |
| `monthlyRentTotalKrw` | `lease_status` |
| `leaseUnitCount` | `lease_status` |

```ts
export function mergeAnchors(prev: NumericalAnchors, results: SectionResult[]): NumericalAnchors {
  const next = { ...prev };
  for (const r of results) {
    for (const [k, v] of Object.entries(r.extractedAnchors)) {
      if (next[k] != null && next[k] !== v) {
        logger.warn('[anchor] 충돌', { key: k, prev: next[k], now: v, section: r.sectionType });
        continue;                                       // 먼저 확정된 값 유지
      }
      next[k] = v;
    }
  }
  return next;
}
```

> **앵커 충돌 시 먼저 확정된 값을 유지하고 로그를 남깁니다.** 나중 섹션이 앞 값을 덮어쓰면 교차검증이 무의미해집니다.

**병렬 구조가 오히려 더 안전합니다.** 텍스트 전체가 아니라 검증된 수치만 전파되므로 표현 오염이 번지지 않습니다.

---

## 5. 실패 처리

### 5.1 부분 실패 정책

| 실패 위치 | 처리 |
|---|---|
| **1단 중 1개** | 나머지 3개는 완료 · 실패 섹션만 폴백 템플릿 |
| **1단 전체** | 생성 중단 · 오류 반환 |
| 2~4단 중 1개 | 폴백 템플릿 · 후속 단계는 앵커로 계속 |
| 앵커 미확정 | 해당 앵커 의존 섹션을 **"확인 필요"** 로 렌더 |

```ts
const results = await Promise.allSettled(
  stage.sections.map(s => generateSingleSection(s, ctx, anchors)),
);
for (const [i, r] of results.entries()) {
  if (r.status === 'fulfilled') { out.set(r.value.sectionType, r.value); continue; }
  const s = stage.sections[i];
  logger.error('[section] 실패 · 폴백', { section: s, error: r.reason });
  out.set(s, generatePremiumTemplate(s, ctx));
}
```

**`Promise.all`이 아니라 `Promise.allSettled`을 씁니다.** 하나가 실패해도 나머지를 버리지 않습니다.

### 5.2 현행 대비 개선

| | 현행 순차 | 2단 병렬 |
|---|---|---|
| 3번째 섹션 실패 시 | 4~7번째 미생성 | **1단 나머지는 완료** |
| 전체 소요 | 실패 시점까지 | 동일 |

---

## 6. 계측

### 6.1 구간별 기록

```ts
export interface StageMetric {
  jobId: string;
  stage: number;
  sectionCount: number;
  parallel: boolean;
  latencyMs: number;
  failedSections: SectionType[];
}
```

| 지표 | 용도 |
|---|---|
| 단계별 `latencyMs` | 병렬화 효과 측정 |
| 단계별 실패 수 | 부분 실패 빈도 |
| 앵커 충돌 건수 | 병렬화 안전성 |
| 전체 p50 · p95 | 목표 대비 |

### 6.2 전후 비교 기준선

**단계 1.5 착수 전 30일 기준선을 확보합니다.**

| 항목 | 착수 전 | 목표 |
|---|--:|--:|
| 평균 | 104.3초 | **≤ 70초** |
| p95 | 148.9초 | **≤ 100초** |
| 앵커 충돌 | 미측정 | **0건** |
| 부분 실패로 인한 미생성 섹션 | 미측정 | 감소 |

---

## 7. 위험과 대응

| 위험 | 대응 |
|---|---|
| **앵커 충돌로 수치 불일치** | 먼저 확정된 값 유지 + 로그 · §4.3 |
| 1단 4개 동시 호출로 **LLM rate limit** | 동시성 상한 4 고정 · 초과 시 대기 |
| 병렬 실행 중 **부분 실패** | `allSettled` + 폴백 · §5.1 |
| 맥락 상실로 **문체 불일치** | 시스템 프롬프트는 동일 · 앵커로 수치 통일 |
| 개발형 `development_marketing` 신설 | 3단 병렬 배치 · 시간 증가 없음 |

### 7.1 🔴 rate limit이 실질 제약입니다

4개 동시 호출은 LLM 제공자 제한에 걸릴 수 있습니다.

```ts
const CONCURRENCY = Number(process.env.IM_SECTION_CONCURRENCY ?? 4);
```

**환경변수로 조절 가능하게 하고, 1로 낮추면 현행 순차와 동일**하게 동작합니다. 롤백 경로입니다.

---

## 8. 구현 순서 (5.0일)

| # | 작업 | 공수 | DoD |
|:-:|---|--:|---|
| 1 | `SECTION_STAGES` 정의 (5 포스처) | 0.5 | 의존 그래프 검증 통과 |
| 2 | `mergeAnchors` + 충돌 로그 | 1.0 | 단위 테스트 |
| 3 | `generateSectionsStaged` 오케스트레이터 | 1.5 | 기존 함수 시그니처 호환 |
| 4 | `allSettled` 부분 실패 처리 | 0.5 | 1단 1개 실패 시나리오 통과 |
| 5 | 구간별 계측 삽입 | 0.5 | `StageMetric` 기록 확인 |
| 6 | 동시성 상한 환경변수 | 0.5 | `=1` 시 순차 동작 |
| 7 | 실매물 5건 재생성 · 수치 대조 | 0.5 | **앵커 충돌 0건 · 평균 ≤70초** |

### 8.1 롤백

```
IM_SECTION_CONCURRENCY=1  →  현행 순차와 동일 동작
```

**코드 되돌림 없이 환경변수로 즉시 롤백됩니다.**

---

## 9. 참고

| 영역 | 문서 |
|---|---|
| 사양 정본 | `IM_SYSTEM_SSOT.md` v1.4 §1.3 · §2.2 · §10 |
| 계측 사양 | `TELEMETRY_SPEC.md` (D6) |
| 아키타입 | `PPTX_ARCHETYPE_SPEC.md` (D7) |
| 테스트 | `TEST_PLAN.md` (D9) |

> **§0의 정정(A16·A17은 섹션이 아님)을 SSoT §2.2에 반영해야 합니다.**
