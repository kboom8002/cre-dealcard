# 구현 계획서 Part 4 — S5 되먹임·확장 + S6 실증·상용화 + 차단 해제 (19.0일)

> **선행**: S4 전량 완료 (V5-11 영향 보고서 작성 후)
>
> 이 문서는 `WORK_ORDER.md` S5(9.0일) + S6(10.0일) + 차단 해제 3건의 정밀 구현 명세입니다.
>
> **관련 계획서**: [Part 1 (S0+S1)](file:///C:/Users/User/.gemini/antigravity/brain/a489fe9e-be7e-4b38-948e-93d1a1ca0e35/implementation_plan.md) · [Part 2 (S2+S3)](file:///C:/Users/User/.gemini/antigravity/brain/a489fe9e-be7e-4b38-948e-93d1a1ca0e35/implementation_plan_part2.md) · [Part 3 (S4)](file:///C:/Users/User/.gemini/antigravity/brain/a489fe9e-be7e-4b38-948e-93d1a1ca0e35/implementation_plan_part3.md)

---

## S5 · 되먹임·확장 (9.0일)

### S5-1 · 결손 되먹임 — 다음 한 단계 반환 (2.5일)

> 현행: "C등급입니다. 데이터를 보강하세요" (행동 불가)
> 목표: "운영비를 입력하면 순수익률이 열립니다 (C → B)" (구체적 다음 행동)

#### [MODIFY] [grade-engine.ts](file:///c:/Users/User/cre-dealcard/src/domain/asset/grade-engine.ts)

V5-4에서 L×P 매트릭스로 전환한 `computeGrade()` 뒤에 `computeNextStep()` 추가:

```typescript
export interface NextStep {
  slot: string;           // 채워야 할 슬롯 키
  slotLabel: string;      // "운영비"
  unlocks: string[];      // 열리는 지표: ["연 순수익률"]
  gradeAfter: Grade;      // 채우면 예상 등급
  axis: 'L' | 'P';        // 어느 축이 올라가는가
  effortMinutes: number;  // 예상 입력 소요시간
}

export function computeNextStep(
  slots: SlotMap,
  posture: InvestmentPosture,
  currentGrade: GradeResult
): NextStep | null {
  const candidates: NextStep[] = [];
  
  for (const [slotKey, slotDef] of getMissingSlots(slots, posture)) {
    // 가상으로 이 슬롯을 채운 상태를 시뮬레이션
    const simulated = { ...slots, [slotKey]: MOCK_FILLED };
    const afterGrade = computeGrade(simulated, posture);
    
    if (gradeOrder(afterGrade.grade) > gradeOrder(currentGrade.grade)) {
      candidates.push({
        slot: slotKey,
        slotLabel: slotDef.label,
        unlocks: getUnlockedMetrics(slotKey, posture),
        gradeAfter: afterGrade.grade,
        axis: isLAxisSlot(slotKey, posture) ? 'L' : 'P',
        effortMinutes: slotDef.estimatedEffortMinutes ?? 5,
      });
    }
  }
  
  // 🔴 등급 상승 효과가 가장 큰 하나만 반환
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => 
    gradeOrder(b.gradeAfter) - gradeOrder(a.gradeAfter) ||
    a.effortMinutes - b.effortMinutes  // 같은 효과면 쉬운 것 우선
  )[0];
}

function getUnlockedMetrics(slotKey: string, posture: InvestmentPosture): string[] {
  // 슬롯 → 지표 잠금 해제 매핑
  const MAP: Record<string, string[]> = {
    'lease_roll': ['연 수익률', '공실률', 'WALE'],
    'financial_input': ['실투자금', '자기자본수익률'],
    'operating_performance': ['GOP', 'RevPAR', 'GOP Cap Rate'],
    'vacate_plan': ['명도 타임라인', '명도비용'],
    'occupancy_plan': ['자가전환 손익분기', '임차료 절감액'],
    'holding_history': ['보유 회전율', '시세차익률'],
    // ...
  };
  return MAP[slotKey] ?? [];
}
```

#### [MODIFY] 바텀시트 UI 반영

```tsx
{gradeResult.nextStep && (
  <div className="mt-3 p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200">
    <p className="text-sm font-semibold text-amber-800">
      💡 {gradeResult.nextStep.slotLabel}을(를) 입력하면
    </p>
    <p className="text-xs text-amber-700 mt-1">
      → {gradeResult.nextStep.unlocks.join(', ')}이(가) 열립니다
    </p>
    <div className="flex items-center gap-2 mt-2">
      <span className={`px-2 py-0.5 rounded text-xs font-bold ${gradeColor(gradeResult.grade)}`}>
        {gradeResult.grade}
      </span>
      <span className="text-amber-500">→</span>
      <span className={`px-2 py-0.5 rounded text-xs font-bold ${gradeColor(gradeResult.nextStep.gradeAfter)}`}>
        {gradeResult.nextStep.gradeAfter}
      </span>
    </div>
  </div>
)}
```

---

### S5-2 · 잠긴 지표 사유 표기 (1.0일)

#### [MODIFY] 잠긴 지표 컴포넌트

```diff
  // 지표 카드 렌더링
  {metric.locked ? (
-   <span className="text-gray-400">잠김</span>
+   <div className="text-xs text-gray-500">
+     <span className="text-red-400">🔒</span>
+     {metric.lockedReason.missing.map(getSlotLabel).join(', ')} 미입력
+   </div>
  ) : (
    <MetricValue value={metric.value} />
  )}
```

---

### S5-3 · 공통 섹션 4종 신설 (3.0일)

#### [MODIFY] [section-catalog.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/section-catalog.ts)

현재 5개 포스처 × 7개 섹션에서 확장:

| 신설 섹션 | 대상 포스처 | 삽입 위치 |
|---|---|---|
| `checklist` | **전 포스처** (S3-7에서 이미 신설) | `risk_check` 다음 |
| `title_rights` (권리·등기) | **전 포스처** | `location_access` 다음 |
| `land_detail` (토지 상세) | income · development · trading | `property_overview` 다음 |
| `comparables` (비교사례) | income · operating · trading | `income_analysis`/`gop_analysis` 다음 |

섹션 수 변화:
```
income:          7 → 11 (checklist, title_rights, land_detail, comparables)
owner_occupied:  7 → 9  (checklist, title_rights)
development:     7 → 10 (checklist, title_rights, land_detail)
operating:       7 → 10 (checklist, title_rights, comparables)
trading:         7 → 11 (checklist, title_rights, land_detail, comparables)
```

> ⚠ S0의 시간 예산 확인: 섹션 수 7→11에서 p95 ≤ 120초 달성 여부.
> Stage 1 병렬화로 `title_rights`와 `land_detail`은 독립 실행 가능.

#### 각 섹션별 구현

**`title_rights` (권리·등기)**:

```typescript
// 입력: 등기부 제한물권 데이터 + lease_ledger.opposing_power
export function renderTitleRights(ctx: IMGenerationContext): SectionOutput {
  return {
    section_type: 'title_rights',
    title: '권리관계',
    subsections: [
      { title: '등기부 요약', type: 'deterministic' },     // LLM 미사용
      { title: '제한물권', type: 'deterministic' },
      { title: '공동담보', type: 'deterministic' },          // C32 적용
      { title: '대항력·우선변제권', type: 'deterministic' }, // tenancy.ts 결과
    ],
    // 🔴 이 섹션은 LLM을 사용하지 않습니다 — 결정론 렌더러만 사용
    llmRequired: false,
  };
}
```

**`land_detail` (토지 상세)**:

```typescript
// 입력: parcels[], exclusions[], P01-P03 결과
export function renderLandDetail(ctx: IMGenerationContext): SectionOutput {
  return {
    section_type: 'land_detail',
    subsections: [
      { title: '필지 구성', data: ctx.parcelResult },          // P01 유효대지
      { title: '제척·설정', data: ctx.parcelResult.exclusionBreakdown }, // P03
      { title: '용적률', data: { effective: ctx.parcelResult.effectiveFARPct } },
    ],
    llmRequired: false,
  };
}
```

**`comparables` (비교사례)**:

```typescript
// 입력: comps[] (실거래 + 수동 추가)
export function renderComparables(ctx: IMGenerationContext): SectionOutput {
  // 불변조건 5: comps 없으면 목표 매각가 미산출
  if (!ctx.comps?.length) {
    return { section_type: 'comparables', markdown: null, skip_reason: 'INV-5' };
  }
  return {
    section_type: 'comparables',
    subsections: [
      { title: '인근 비교사례', type: 'table', data: ctx.comps },
      { title: '시사점', type: 'llm' },  // LLM 분석 (1회)
    ],
    llmRequired: true,
  };
}
```

---

### S5-4 · 면 순서를 `im.pages.yaml`로 구동 (1.5일)

#### [MODIFY] [writer.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts) — L314~326

```diff
- const CANONICAL_ORDER: string[] = [
-   'property_overview', 'location_access', ...
- ];
+ // im.pages.yaml의 presets[posture].order 로딩
+ import { loadPageOrder } from '@/lib/ssot-adapter';
+ const CANONICAL_ORDER = loadPageOrder(ctx.posture);
```

#### [NEW] [ssot-adapter.ts](file:///c:/Users/User/cre-dealcard/src/lib/ssot-adapter.ts)

```typescript
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

const PAGES_PATH = path.join(process.cwd(), 'CREDEAL_IM_HANDOVER_v0.5/credeal/ssot/im.pages.yaml');

interface PagePreset {
  order: string[];
  minPages: number;
  maxPages: number;
}

let cache: Record<string, PagePreset> | null = null;

export function loadPageOrder(posture: InvestmentPosture): string[] {
  if (!cache) {
    const raw = fs.readFileSync(PAGES_PATH, 'utf-8');
    const parsed = yaml.load(raw) as { presets: Record<string, PagePreset> };
    cache = parsed.presets;
  }
  const preset = cache[posture];
  if (!preset) throw new Error(`No page order for posture: ${posture}`);
  return preset.order;
}
```

---

### S5-5 · 게이트 해소 시 문구 자동 제거 (1.0일)

게이트가 `warn` → `pass`로 전환되면 해당 결손 안내문을 재생성 없이 제거:

```typescript
// 재생성 시 이전 gateReport와 비교
function removeResolvedMessages(
  previousReport: GateReport,
  currentReport: GateReport,
  sections: IMSection[]
): IMSection[] {
  const resolved = previousReport.failedWarns
    .filter(w => currentReport.results.find(r => r.id === w.id)?.passed)
    .map(w => w.id);
  
  return sections.map(sec => ({
    ...sec,
    markdown: removeGateMessages(sec.markdown, resolved),
  }));
}
```

---

## S6 · 실증·상용화 (10.0일)

### S6-1 · 포스처별 실증 딜 (4.0일)

| 포스처 | 실증 건수 | 대상 | 검증 항목 |
|---|---|---|---|
| `owner_occupied` | 1건 | (실매물 확보 필요) | A16 자가비교, 통근분석, 임차료 절감 산출 |
| `operating` | 2건 | 에이치에비뉴호텔 이대점 + 1건 | A13 운영지표, GOP 구조, RevPAR 교차검증 |
| `trading` | 1건 | (B3 차단 해제 후) | 비교사례 기반 시세갭, 보유회전 |

각 실증 딜에 대해 **5층 검증** 수행:

| 층 | 검증 내용 | 도구 |
|:-:|---|---|
| 1 | 타입 무결성 | `npx tsc --noEmit` |
| 2 | 게이트 통과 | `runPublishGates()` + `runDeterministicGates()` |
| 3 | 교차 검증 | `cross-validator.ts` — 표지/요약/본문 수치 일치 |
| 4 | PPTX 시각 검증 | `ai-visual-e2e-runner.ts` (150 DPI 캡처) |
| 5 | 사람 심사 5항 | 배정된 리뷰어의 5개 체크박스 |

---

### S6-2 · 아키타입 가설 검증 (2.0일)

| 아키타입 군 | 현재 상태 | 검증 방법 |
|---|---|---|
| `R-OPR-01~04` | **가설** (실증 1건) | 에이치에비뉴 → 판정, GOP 구조 대조 |
| `R-TRD-01~04` | **가설** (실증 0건) | 30일 관측에서 trading 0건이면 보류 |
| `R-OWN-01~04` | **가설** (실증 0건) | 실증 딜 확보 후 판정 |

`deck-sequencer.ts` L141~228에서 아키타입 분기가 `income` 전용 4종(`R-INC-01~04`)만 구현되어 있으므로, 나머지 3종 포스처의 아키타입 분기를 추가:

```typescript
// deck-sequencer.ts — A등급 시퀀스 확장
case 'operating':
  switch (archetype) {
    case 'R-OPR-01': // 위탁운영형
      return ['A13_operating_kpi','A05_revenue','A05_seasonality','A04_operator'];
    case 'R-OPR-02': // 직영형
      return ['A13_operating_kpi','A05_revenue','A04_staff','A05_gop_trend'];
    // ...
  }
```

---

### S6-3 · 골든 세트 확장 8 → 14건 (2.0일)

| ID | 물건 | 포스처 | 등급 | 근거 |
|---|---|---|---|---|
| G01~G08 | (기존 — **C등급 격리 후 정제**) | income | A~C | IM_SYSTEM_SSOT v1.5 |
| **G09** | (사옥형 실증) | owner_occupied | B | S6-1 |
| **G10** | 에이치에비뉴호텔 | operating | B | S6-1 |
| **G11** | 잠원동 | development | B | 기존 |
| **G12** | 수택동 | development | C | 기존 |
| **G13** | (단기매매, 확보 시) | trading | C | S6-1 |
| **G14** | (운영형 추가, 확보 시) | operating | A | S6-1 |

> [!IMPORTANT]
> 기존 164건 Golden Set은 **LLM 합성 데이터**임이 v1.5에서 규명되었습니다.
> 기존 164건을 C등급으로 격리하고, 퓨샷 경로에서 분리합니다.
> 신규 14건만 S/A 등급으로 퓨샷에 주입합니다.

---

### S6-4 · Pack 가중치 실측 (1.0일)

```typescript
// 실측 전: 균등 배분
operating: {
  operating_performance: 17,  // 50점 / 3슬롯 ≈ 균등
  hospitality_spec: 17,
  financial_input: 16,
},

// 실측 후 (20건 이상 시): 편차 기반 배분
operating: {
  operating_performance: 25,  // 3개년 실적 — 가장 큰 영향
  hospitality_spec: 10,       // 시설 구성 — 보조
  financial_input: 15,
},
```

> 🔴 **자산유형별 표본 20건 미만이면 균등 배분 유지. 임의 배분 금지.**

---

### S6-5 · 등급 컷 재검토 (1.0일)

```sql
SELECT posture, grade, count(*),
       round(count(*)::numeric / sum(count(*)) OVER (PARTITION BY posture) * 100, 1) AS pct
FROM deals 
WHERE grade IS NOT NULL 
GROUP BY posture, grade 
ORDER BY posture, grade;
-- 포스처별 A/B/C/D 분포 확인
-- A < 10% 또는 D > 50% 이면 임계 조정 검토
```

---

## 차단 해제 3건 (B1 · B2 · B3)

### B1 · 이미지 마스킹 검출 모델 🔴

| | |
|---|---|
| **불변조건** | 14번 — 물건명·법인명·임차인명은 대외 문서에 표기하지 않는다 |
| **현 상태** | G20 게이트는 `deterministic-gates.ts` L36에 존재, 검출 모델 미구현 |
| **9단계 파이프라인** | `IM_IMAGE_PIPELINE_SPEC.md` §3: 수신→회전→EXIF제거→자동검출→상호검출→중개인확인→마스킹→파생→G20 |
| **제약** | 🔴 마스킹 전 원본을 외부 API 전송 금지 (상호 노출) |
| **필요** | 온프레미스 검출 모델 도입 결정 · 예산 |
| **임시 대응** | V5-8에서 G20을 `warn` 전환. 사람이 발행 전 확인 → FR20 마스킹 확인 UI로 방어 |
| **FR 매핑** | FR17(EXIF), FR18(3분할), FR19(해상도), FR20(확인UI), FR21(G20), FR22(자동검출) |

### B2 · `QG01~QG16` 실제 정의

| | |
|---|---|
| **현 상태** | `quality-gates-v02.ts` L84~101에 16종 게이트 정의 존재 → 확인 완료 |
| **조치** | V5-1에서 QG 개명하며 `IM_QUALITY_GATES.md` §7.3 표와 대조 |

### B3 · `trading` 수집 경로

| | |
|---|---|
| **현 상태** | `holding_history` Pack 슬롯 정의됨, 등기부 파싱 미구현 |
| **판단** | S2 30일 관측에서 `trading` 선택 0건이면 미룸 → 62.5일 → **57일** |
| **공수 절감** | S3-4(1.5일) + S6-1 trading(1.5일) = 3.0일 절감 |

---

## FR01~FR36 ↔ 스프린트 매핑 전체 표

| FR | 스프린트 | 계획서 위치 | 상태 |
|---|---|---|---|
| FR01 | S1 | Part 1 S1-1 | 🟡 |
| FR02 | S1 | Part 1 S1-2 | 🟡 |
| FR03 | S4 | Part 3 V5-1 | 🟡 |
| FR04 | S1 | Part 1 S1-5 | 🟡 |
| FR05 | S1 | Part 1 S1-5 | 🟡 |
| FR06 | S1 | Part 1 S1-1 | 🟡 |
| FR07 | S1 | Part 1 S1-1 | 🟡 |
| FR08 | S3 | Part 2 S3-1 | 🟡 |
| FR09 | S2 | Part 2 S2-3 | 🟡 |
| FR10 | S5 | Part 4 S5-3 | 🟡 |
| FR11 | S5 | Part 4 S5-4 | 🟡 |
| FR12 | S2/S5 | Part 2 / Part 4 | 🟡 |
| FR13 | S0 | Part 1 S0-1 | 🟡 |
| FR14 | S2 | Part 2 | 🟡 |
| FR15 | S2 | Part 2 | 🟡 |
| FR16 | S2 | Part 2 S2-3 | 🟡 |
| FR17 | S3/B1 | Part 2 / B1 | 🔴 B1 |
| FR18 | S3/B1 | Part 2 / B1 | 🔴 B1 |
| FR19 | S3 | Part 2 | 🟡 |
| FR20 | S3/B1 | Part 2 / B1 | 🔴 B1 |
| FR21 | S4 | Part 3 V5-8 | 🟡 |
| FR22 | B1 | B1 | 🔴 별도 |
| FR23 | S4 | Part 3 | 🟡 |
| FR24 | S6 | Part 4 S6-3 | 🟡 |
| FR25 | S4 | Part 3 V5-8 | 🟡 |
| FR26 | S5 | Part 4 S5-3 | 🟡 |
| FR27 | S6 | Part 4 S6-1 | 🟡 |
| FR28 | S0 | Part 1 S0-2 | 🟡 |
| FR29 | S5 | Part 4 | 🟡 |
| FR30 | S5 | Part 4 S5-5 | 🟡 |
| FR31 | S5 | Part 4 | 🟡 |
| FR32 | S5 | Part 4 | 🟡 |
| FR33 | S1 | Part 1 S1-8 | 🟡 |
| FR34 | S1 | Part 1 S1-2 | 🟡 |
| FR35 | S3 | Part 2 S3-1 | 🟡 |
| FR36 | S5 | Part 4 | 🟡 |

---

## 리스크 대응 매트릭스

| 리스크 | 확률 | 영향 | 대비 | 스프린트 |
|---|:---:|:---:|---|---|
| V5-4 등급 재산정 후 A 승격 급증 | 중 | 높음 | A 승격 딜 전량 수동 심사 + C11 임계 조정 | S4 |
| 포스처 기본값 제거 → 중개인 이탈 | 중 | 높음 | 제안 신뢰도 + 1클릭 수락 + 30일 이탈률 관측 | S2 |
| 섹션 7→11 확장 → 120초 초과 | 중 | 중 | S0 선행. 90초 경과 시 선택 섹션 중단 | S0/S5 |
| Pack 가중치 임의 배분 → 등급 신뢰 훼손 | 낮 | 높음 | 실측 20건 미만 시 균등 유지 | S6 |
| `trading` 수요 없음 → S3-4·S6-1 낭비 | 높 | 낮 | 30일 관측 후 재판단. 미루면 57일 | S2~S6 |
| Golden Set 164건 환각 패턴 퓨샷 오염 | 높 | 높음 | C등급 격리 + 신규 14건만 퓨샷 | S6 |
| B1 이미지 마스킹 미해결 → 상용 발행 불가 | 높 | 높음 | G20 warn + FR20 수동 확인 UI 선행 배포 | B1 |
| 폐기 문서 인용 89건 → 후임 혼란 | 중 | 중 | 래칫으로 증가 차단 + 개정 시 함께 정리 | 전체 |

---

## 전체 완료 기준 (DoD) — 공통 8항

| # | 기준 | 검사 도구 |
|:-:|---|---|
| 1 | `qa/doc_integrity.py` 통과 | CI |
| 2 | `qa/ontology_check.py` 통과 | CI |
| 3 | `credeal/ssot/loader.py` 자기검사 통과 | CI |
| 4 | 산출물 5층 검사 통과 | CI + E2E |
| 5 | **오탐 0 · 미탐 0** 보정 통과 | `calibrate*.py` |
| 6 | 신규 코드는 `CATALOG_RULES` 등록 후 사용 | `ontology_check ②` |
| 7 | `CHANGELOG` 기재 | `doc_integrity ⑥` |
| 8 | 값을 두 곳에 적지 않음 — 한쪽은 참조 | 사람 심사 |

> **"썼다"가 아니라 "검사기가 통과시킨다"가 완료입니다.**

---

## User Review Required

> [!IMPORTANT]
> **4개 계획서 전체 승인 요청**
> - [Part 1 (S0+S1)](file:///C:/Users/User/.gemini/antigravity/brain/a489fe9e-be7e-4b38-948e-93d1a1ca0e35/implementation_plan.md): 성능 확보 + 문서 정합 (13.0일)
> - [Part 2 (S2+S3)](file:///C:/Users/User/.gemini/antigravity/brain/a489fe9e-be7e-4b38-948e-93d1a1ca0e35/implementation_plan_part2.md): 포스처 확정 + 입력 완성 (18.0일)
> - [Part 3 (S4)](file:///C:/Users/User/.gemini/antigravity/brain/a489fe9e-be7e-4b38-948e-93d1a1ca0e35/implementation_plan_part3.md): 온톨로지 마이그레이션 (12.5일 + 14일)
> - [Part 4 (S5+S6+차단)](file:///C:/Users/User/.gemini/antigravity/brain/a489fe9e-be7e-4b38-948e-93d1a1ca0e35/implementation_plan_part4.md): 되먹임 + 실증 + B1/B2/B3 (19.0일)

> [!WARNING]
> **V5-4 경영 승인**: L×P 등급 전환은 비가역입니다. V5-4 진입 전 경영 승인이 필요합니다.
> **Pack 가중치 배분**: 표본 20건 미만 시 배분하지 않습니다.
> **B1 이미지 마스킹**: 온프레미스 모델 도입 결정이 없으면 상용 발행이 안 됩니다.

## Open Questions

1. **V5-4 착수 조건**: A 승격 딜 수동 심사의 주체와 기준은?
2. **`trading` 보류 시점**: S2 30일 관측 전에 S3-4를 선제 착수할지?
3. **B1 이미지 마스킹 예산**: 온프레미스 모델 vs 전용 서버리스 GPU?
4. **Golden 164건 처리**: C등급 격리만 할지, 완전 삭제할지?

---

## 검증 계획

### Automated Tests
```bash
# S5 검증
npm run test -- --grep "next-step"
npm run test -- --grep "locked-metric"
npm run test -- --grep "section-catalog"
npm run test -- --grep "ssot-adapter"

# S6 검증 — 포스처별 E2E
npm run test:e2e -- --grep "owner_occupied"
npm run test:e2e -- --grep "operating"
npm run test:e2e -- --grep "development"

# AI 시각 E2E
npx ts-node src/tests/e2e/ai-visual-e2e-runner.ts

# 전체 빌드 + 캘리브레이션
npm run build
python3 CREDEAL_IM_HANDOVER_v0.5/qa/calibrate.py
python3 CREDEAL_IM_HANDOVER_v0.5/qa/calibrate_invariant.py
```

### Manual Verification
- S5: "다음 한 단계" — 하나만 반환되는지 (복수 반환 시 버그)
- S6: 5종 포스처 각 1건 E2E 완주 + 5층 검증 전량 통과
- S6: 골든 14건 전부 `calibrate.py` 통과
