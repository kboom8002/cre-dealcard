# CREDEAL 개발팀 자료 요청 답변서 — Tier 3

> 작성일: 2026-08-23
> 근거: 코드베이스 정밀 감사 (`src/domain/building/mobile-im/` 및 관련 파일)

---

## T3-1 · `CrePromptRegistry` 현황

### 답변

① **DB에 저장된 커스텀 프롬프트가 몇 개입니까**

**DB 테이블은 존재하지 않습니다.** 전적으로 인메모리(`Map`)로 관리됩니다. `cre-prompt-registry.ts` L31-101에서 총 **5개** 프롬프트가 하드코딩으로 초기화됩니다:

| ID | 슬롯키 | A/B 테스트 | 용도 |
|---|---|:---:|---|
| `writer_system_v1` | `writer_system` | ✅ | 기본 작가 (Professional Analyst) |
| `writer_system_v2` | `writer_system` | ✅ | 감성 소구 작가 (Storyteller) |
| `section_income_analysis_v1` | `section_income_analysis` | ❌ | 재무 분석 전용 |
| `section_risk_check_v1` | `section_risk_check` | ❌ | 리스크 진단 전용 |
| `section_investment_thesis_v1` | `section_investment_thesis` | ❌ | 투자의견 전용 |

---

② **누가 편집합니까 (개발자·운영자·중개인)**

**오직 개발자만** 가능합니다. 소스코드에 하드코딩되어 있으므로 코드 수정 + 재배포가 필요합니다. 운영자/중개인이 런타임에 편집할 수 있는 UI나 API 엔드포인트는 **존재하지 않습니다**.

---

③ **하드코딩 프롬프트와 우선순위는**

`getActivePrompt()` 함수(`L118-137`)의 동작:
1. 해당 슬롯키의 활성(`isActive: true`) 프롬프트 필터링
2. `isABTesting: true`인 것이 있으면 → `generationId` 해시 기반 무작위 선택 (A/B 테스트)
3. A/B 테스트 후보 없으면 → `activeTemplates[0]` (첫 번째) 반환

**결론:** 하드코딩 프롬프트만 존재하며, DB 프롬프트와의 우선순위 충돌은 발생하지 않습니다.

---

④ **변경 이력·롤백이 됩니까**

**되지 않습니다.** 어플리케이션 내 자체적인 변경 이력 추적/롤백 기능은 없습니다. Git 커밋 로그에만 의존해야 합니다.

### 비고
> 이 구조에서는 프롬프트 수정이 곧 코드 변경 + 배포이므로, PM/운영자 주도의 빠른 프롬프트 이터레이션이 불가능합니다. DB 저장 전환 시 별도 마이그레이션이 필요합니다.

---

## T3-2 · RAG 컨텍스트 구성

### 답변

① **`ragCtx`가 무엇을 검색합니까 (법령·시장 리포트·과거 IM)**

**과거 유사사례 IM 문서**만 검색합니다. `cre-rag-service.ts` L128에서:

```typescript
return docs.map((d, i) => `[유사사례 ${i+1}] ${d.content}`).join("\n\n");
```

법령 DB나 시장 리포트 인덱스는 **검색 대상에 포함되어 있지 않습니다**.

---

② **인덱스 규모·갱신 주기**

- **인덱스:** pgvector 기반 `ivfflat` 인덱스(`lists=100`) — `supabase/migrations/20260621_im_documents.sql` L15
- **갱신 주기:** 자동 갱신 Cron/배치 로직이 **존재하지 않습니다**. 데이터 추가는 수동 또는 IM 생성 시 사후 삽입으로만 이루어질 것으로 추정됩니다.
- **규모:** 코드만으로는 레코드 수를 알 수 없습니다 (DB 쿼리 필요).

---

③ **검색 결과가 프롬프트에 얼마나 들어갑니까**

- **topK = 5** (L124)
- 후보 수집은 `topK × 2 = 10`건을 가져온 후 리랭킹하여 상위 5건 선택 (L88)
- 5건의 `content` 전문이 `\n\n`으로 결합되어 프롬프트에 주입됩니다
- **토큰 제한(truncation)은 구현되어 있지 않으며**, 5건 전문이 그대로 들어갑니다

---

④ **법령 정보의 최신성을 어떻게 보장합니까**

**보장하지 않습니다.** 법제처 API 호출, 법령 갱신 로직, 최신성 검증 등의 코드가 **전혀 없습니다**. RAG 컨텍스트에 포함된 과거 IM 문서에 법령이 인용되어 있더라도, 해당 법령이 현행법과 일치하는지 검증하는 메커니즘이 없으므로 법적 판정 오류가 재생산될 위험이 있습니다.

### 비고
> ④번은 요청서에서도 특별히 강조된 항목입니다. 주택임대차보호법 개정안이 발의 단계인데 시행된 것처럼 학습되면 법적 판정이 전부 틀어지는 위험이 실재합니다.

---

## T3-3 · 아키타입 정의표

### 답변

① **`R-INC-01` ~ `R-INC-04` income 아키타입의 정의와 분기 조건**

`archetype-registry.ts` L18-47 원문 인용:

| 코드 | 라벨 | 톤 | 트리거 조건 |
|---|---|---|---|
| `R-INC-01` | 안정형 | predictability | 증축 여지 없음 ∧ 신축(10년 이내) ∧ 임대료 인상 상한 |
| `R-INC-02` | 갭 투자형 | opportunity | 현 임대료가 시세 대비 15% 이상 저렴 |
| `R-INC-03` | 공실 해소형 | turnaround | 공실률 15% 초과 |
| `R-INC-04` | 리모델링형 | renovation | 건물연령 20년 초과 |

---

② **`suggestArchetype()` 로직**

`archetype-registry.ts` L64-103 전체 분기 흐름:

```
입력: { vacancyPct, buildingAge, rentGapPct, farRemainder, posture }

1. posture가 non-income이면 고정 반환:
   - owner_occupied → OO-01
   - development    → DEV-01
   - operating      → OP-01
   - trading        → TR-01

2. income 포스처일 경우 조건부 판별 (우선순위 순):
   ① vacancyPct >= 15   → primary = R-INC-03 (공실 해소형)
   ② buildingAge >= 20  → primary = R-INC-04 (리모델링형)
   ③ rentGapPct >= 15   → primary = R-INC-02 (갭 투자형)
   ④ 조건 미달          → primary = R-INC-01 (안정형, 기본값)

3. secondary: ①~③ 조건을 모두 판별하여 primary와 다른 것들을 배열로 반환
```

---

③ **`archetype_override`를 누가 언제 씁니까**

`im-context-builder.ts` L299에서 `input.supplemental.archetype_override` 값이 존재하면 `suggestArchetype()`의 자동 제안을 무시하고 강제 적용됩니다. **사용 주체는 중개인 또는 운영자**이며, 바텀시트(메모 입력 폼)에서 아키타입을 직접 지정할 때 사용됩니다.

---

④ **A11·A12가 문서에 없는데 존재합니까**

**파일은 존재하나 매핑은 없습니다:**
- `pptx/archetypes/a11-room-spec.ts` — 물리적 파일 존재 ✅
- `pptx/archetypes/a12-ownership.ts` — 물리적 파일 존재 ✅
- `DATA_KEY_ARCHETYPE` 객체(`data-binder.ts:48-95`)에는 A11, A12 **미등록** ❌

따라서 현재 PPTX 렌더링 파이프라인에서 실제로 사용되지 않는 유령 파일(dead code)입니다.

### 첨부
- `src/domain/building/mobile-im/archetype-registry.ts` (전체 154줄)
- `src/domain/building/mobile-im/pptx/archetypes/` 디렉토리 전체 파일 목록

---

## T3-4 · 노출 통제 현행 구현

### 답변

① **`blindTeaser` · `teaserView` · Disclosure Guard `blind` 모드가 각각 무엇을 가립니까**

| 구분 | 역할 | 가리는 대상 | 구현 위치 |
|---|---|---|---|
| **blindTeaser** | AI가 Zod 스키마 기반으로 민감정보 배제 후 재생성한 텍스트 | 건물명, 정확한 지번, 소유주 | `BlindTeaserOutputSchema` |
| **teaserView** | 데이터 엔티티 투영(Projection) 함수 | 원본 수치 → 밴딩/범위 표기 (가격·면적·수익률) | `teaser-projector.ts` |
| **Disclosure Guard** | 리포트 Fetch 시 hard limit 필터 | `guard_checked === true`일 때 `["상세 지번", "건물명", "소유주명"]` 강제 삭제 | `fetch-im-data.ts:539` |

---

② **슬롯별 `visibility` 선언이 있습니까**

**슬롯(섹션) 단위가 아닌 개별 필드 단위 Boolean 토글**로 구현되어 있습니다:

```typescript
// studio/disclosure/page.tsx:51-59 (DisclosurePrefs)
hide_exact_address: boolean;
show_price_band: boolean;
hide_tenant_names: boolean;
// ...
```

---

③ **밴딩(범위 표기)이 구현돼 있습니까 아니면 단순 숨김입니까**

**밴딩 기능이 구현되어 있습니다.** `teaserView` 내부 속성으로 `bandedPrice`, `bandedCapRate`, `bandedArea`를 사용하여 "50~100억"처럼 범위 표기를 지원합니다 (`dc/[id]/page.tsx:198-200`).

단순 숨김(hide)과 밴딩(banding) 두 가지 방식을 모두 사용합니다.

---

④ **Pro 접근 권한을 무엇으로 판정합니까 (NDA 서명·옵트인·수동 승인)**

**NDA 서명 + 중개인 수동 승인** 결합 방식입니다:

1. 투자자가 "프라이빗 IM 신청" 폼(`IMInquiryBottomSheet`)을 제출
2. 중개인이 `GateRequestsInbox`(`deal-card/[id]/GateRequestsInbox.tsx:134`)에서 신청을 확인
3. NDA 서명 완료 + 수동 승인 시 고유 `grantId` 토큰이 생성됨
4. `/im-pro/[grantId]` URL로 Pro 열람 접근 가능

---

## T3-5 · 비용·성능 실측

### 답변

① **IM 1건 생성 LLM 토큰 수·비용**

**건별 측정 코드가 존재합니다.** `src/ai/cost-tracker.ts` L13-39에서 `calculateCost` 함수로 토큰당 달러 단가를 곱산하여 `im_generation_cost_log` 테이블에 삽입합니다. 단, 이를 집계·시각화하는 대시보드나 API는 없습니다.

---

② **소요 시간 p50 · p95**

**p50/p95 집계 로직은 없습니다.** `src/ai/run-ai.ts` L69에서 `Date.now() - startTime`으로 개별 호출 `latency_ms`를 기록하지만, 분위수 통계를 계산하는 코드는 존재하지 않습니다.

---

③ **`IM_FAST_MODE`가 필요한 실제 타임아웃 값은**

`im-section-generator.ts` L269-270:

| 모드 | 타임아웃 |
|---|---|
| FAST_MODE 켜짐 | **30,000ms (30초)** |
| FAST_MODE 꺼짐 | **90,000ms (90초)** |

---

④ **Vercel 함수 제한 (시간·메모리)**

`vercel.json` L4-7:

```json
{
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 60
    }
  }
}
```

**최대 실행 시간: 60초**, 메모리 제한은 명시되지 않음 (Vercel 기본값 적용).

> ⚠️ **위험 요소:** AI 일반 모드 타임아웃(90초)이 Vercel 제한(60초)보다 큽니다. 따라서 FAST_MODE가 꺼져 있으면 Vercel이 먼저 함수를 종료하여 런타임 타임아웃 오류가 발생할 수 있습니다.

---

⑤ **월 LLM 비용 총액**

**월별 합산 쿼리/대시보드는 없습니다.** 건별 로깅만 존재하므로 다음 쿼리로 집계 가능:

```sql
SELECT
  DATE_TRUNC('month', created_at) AS month,
  SUM(cost_usd) AS total_usd,
  COUNT(*) AS generation_count
FROM im_generation_cost_log
GROUP BY 1
ORDER BY 1 DESC;
```
