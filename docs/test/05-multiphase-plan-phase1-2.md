# 멀티페이즈 개발 계획 — Phase 1·2 (긴급 안전성 + 구조 품질)

> **범위**: 감사 보고서 전체 CRITICAL·HIGH 이슈 완전 해소 + 상용화 최소 기준 달성  
> **예상 소요**: Phase 1 (4시간) + Phase 2 (16시간) = **총 20시간 / 10회 AI-Pair 세션**  
> **전제 조건**: GPT-5.6 마이그레이션 완료 (2026-08-10), `npm run build` 통과

---

## Phase 1: 긴급 안전성 확보 (4시간 / 2회 세션)

> [!CAUTION]
> Phase 1의 모든 항목은 **상용 배포 전 필수 해결** 사항입니다. 미해결 시 법적 리스크 또는 파이프라인 크래시가 발생합니다.

---

### 1.1 [CRITICAL] 법적 가드레일 통합 — 임대·펀딩 파이프라인

**감사 출처**: `01-dealcard-system-audit.md` C-1  
**예상 소요**: 1.5시간

#### 문제 분석

| 파이프라인 | `rewriteUnsafeText` 적용 | 리스크 |
|:---|:---:|:---|
| 매각 딜카드 (`broker-deal-card.ts`) | ✅ Line 266-274 | 안전 |
| 임대 딜카드 (`lease-deal-card.ts`) | ❌ 미적용 | 🔴 "수익률 보장" 등 노출 |
| 펀딩 카드 (`funding-project-card.ts`) | ❌ 미적용 | 🔴 자본시장법 위반 가능 |

#### 참조 패턴 (broker-deal-card.ts Lines 266-274)

```typescript
// ✅ 현재 매각 파이프라인의 가드레일 (정상)
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";

const guardedTeaser = { ...blindTeaser };
if (guardedTeaser.title) {
  guardedTeaser.title = rewriteUnsafeText(guardedTeaser.title).safeText;
}
if (guardedTeaser.shortSummary) {
  guardedTeaser.shortSummary = rewriteUnsafeText(guardedTeaser.shortSummary).safeText;
}
```

#### 수정 대상 및 구체적 변경사항

##### 파일 1: [`lease-deal-card.ts`](file:///c:/Users/User/cre-dealcard/src/ai/agents/lease-deal-card.ts)

```diff
  // Line 7 ~ imports 영역
  import { callLLM } from "@/ai/llm-client";
+ import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";

  // Line 106-108 이후 (Step 3 blindTeaser 파싱 완료 후)
  const blindTeaser = LeaseBlindTeaserOutputSchema.parse(...);
+
+ // ── 법적 가드레일 ──
+ const guardedTeaser = { ...blindTeaser };
+ const textFields: (keyof LeaseBlindTeaserOutput)[] = [
+   "title", "shortSummary", "kakaoText", "hiddenInfoNotice"
+ ];
+ for (const field of textFields) {
+   if (guardedTeaser[field] && typeof guardedTeaser[field] === "string") {
+     guardedTeaser[field] = rewriteUnsafeText(guardedTeaser[field] as string).safeText;
+   }
+ }
+ if (guardedTeaser.dealPoints) {
+   guardedTeaser.dealPoints = guardedTeaser.dealPoints.map(
+     (p: string) => rewriteUnsafeText(p).safeText
+   );
+ }
```

##### 파일 2: [`funding-project-card.ts`](file:///c:/Users/User/cre-dealcard/src/ai/agents/funding-project-card.ts)

```diff
  // Line 1 ~ imports 영역
  import { callLLM } from "@/ai/llm-client";
+ import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";

  // Line 59 이후 (Step 2 blindTeaser 파싱 완료 후)
  const blindTeaser = FundingBlindTeaserOutputSchema.parse(...);
+
+ // ── 법적 가드레일 (펀딩 특화) ──
+ const guardedTeaser = { ...blindTeaser };
+ const textFields: (keyof FundingBlindTeaserOutput)[] = [
+   "title", "shortSummary", "kakaoText", "forbiddenWordsNotice"
+ ];
+ for (const field of textFields) {
+   if (guardedTeaser[field] && typeof guardedTeaser[field] === "string") {
+     guardedTeaser[field] = rewriteUnsafeText(guardedTeaser[field] as string).safeText;
+   }
+ }
```

##### 파일 3: [`safe-language.ts`](file:///c:/Users/User/cre-dealcard/src/domain/guardrails/safe-language.ts) — 펀딩 특화 금지 문구 추가

```diff
  // Line 15 ~ FORBIDDEN_CLAIMS 배열 확장
  export const FORBIDDEN_CLAIMS = [
    // ... 기존 15개 유지 ...
+   // ── 펀딩/STO 특화 (자본시장법 준수) ──
+   "원금 보장",
+   "원금보장",
+   "확정 수익",
+   "확정수익",
+   "예상 수익률",
+   "최소 수익",
+   "최저 배당",
+   "손실 없는",
+   "안정적 배당",
+   "배당 보장",
  ] as const;
```

#### 검증 방법

```bash
# 1. 단위 테스트
npx vitest run --grep "safe-language"

# 2. E2E 검증 (금지 문구 포함 메모)
# 테스트 메모: "연 8% 확정 수익, 원금 보장되는 안전한 투자 상품입니다"
# 기대 결과: 모든 금지 문구가 안전 대체어로 변환
```

#### 완료 기준
- [ ] 임대 파이프라인에 `rewriteUnsafeText` 적용
- [ ] 펀딩 파이프라인에 `rewriteUnsafeText` 적용
- [ ] 펀딩 특화 금지 문구 10개 추가
- [ ] 금지 문구 포함 메모 5건 테스트 → 100% 차단/변환 확인
- [ ] `npm run build` 통과

---

### 1.2 [CRITICAL] JSON 파싱 안정화 — 공통 유틸 추출

**감사 출처**: `01-dealcard-system-audit.md` C-2  
**예상 소요**: 1.5시간

#### 문제 분석

| 파이프라인 | JSON 파싱 | Zod 검증 | 폴백 | 상태 |
|:---|:---|:---|:---|:---:|
| 매각 | `extractJsonString()` | `.safeParse()` | 수동 복구 | ✅ |
| 임대 | `JSON.parse()` 직접 | `.parse()` | 없음 | 🔴 |
| 펀딩 | `JSON.parse()` 직접 | `.parse()` | 없음 | 🔴 |

#### 구체적 변경사항

##### 신규 파일: [`src/ai/utils/ai-response-parser.ts`](file:///c:/Users/User/cre-dealcard/src/ai/utils/ai-response-parser.ts)

```typescript
/**
 * AI LLM 응답 파싱 공통 유틸리티
 * 
 * - 마크다운 코드 펜스 자동 제거
 * - Zod safeParse + 수동 복구
 * - 구조화된 에러 반환
 */
import { type ZodSchema, type ZodError } from "zod";

/**
 * LLM 응답에서 JSON 문자열을 안전하게 추출합니다.
 * ```json ... ``` 래핑, BOM, trailing comma 등을 처리합니다.
 */
export function extractJsonString(raw: string): string {
  let s = raw.trim();
  // 마크다운 코드 펜스 제거
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) s = fenceMatch[1].trim();
  // BOM 제거
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  // trailing comma 제거 (JSON 비표준)
  s = s.replace(/,\s*([\]}])/g, "$1");
  return s;
}

export interface ParseResult<T> {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
  raw: string;
}

/**
 * LLM 응답을 안전하게 파싱하고 Zod 스키마로 검증합니다.
 * 
 * @example
 * ```ts
 * const result = safeParseAIResponse(llmOutput, MySchema);
 * if (!result.success) throw new Error(result.error);
 * const data = result.data;
 * ```
 */
export function safeParseAIResponse<T>(
  rawContent: string,
  schema: ZodSchema<T>,
): ParseResult<T> {
  // Step 1: JSON 문자열 추출
  const jsonStr = extractJsonString(rawContent);

  // Step 2: JSON 파싱
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (jsonErr) {
    return {
      success: false,
      error: `JSON 파싱 실패: ${(jsonErr as Error).message}`,
      raw: rawContent,
    };
  }

  // Step 3: Zod 검증 (safeParse)
  const zodResult = schema.safeParse(parsed);
  if (zodResult.success) {
    return { success: true, data: zodResult.data };
  }

  // Step 4: 부분 복구 시도 — optional 필드 기본값 적용
  try {
    // Zod의 기본값 적용을 위해 한번 더 시도
    const withDefaults = schema.parse(parsed);
    return { success: true, data: withDefaults };
  } catch {
    const issues = (zodResult.error as ZodError).issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return {
      success: false,
      error: `스키마 검증 실패: ${issues}`,
      raw: rawContent,
    };
  }
}
```

##### 파일 수정: [`lease-deal-card.ts`](file:///c:/Users/User/cre-dealcard/src/ai/agents/lease-deal-card.ts)

```diff
  import { callLLM } from "@/ai/llm-client";
+ import { safeParseAIResponse } from "@/ai/utils/ai-response-parser";

  // Line 78 (Step 1)
- const parsedMemo = LeaseMemoParserOutputSchema.parse(JSON.parse(memoResult.content));
+ const memoParseResult = safeParseAIResponse(memoResult.content, LeaseMemoParserOutputSchema);
+ if (!memoParseResult.success) throw new Error(`[lease-deal-card] Step1 파싱 실패: ${memoParseResult.error}`);
+ const parsedMemo = memoParseResult.data;

  // Line 91-93 (Step 2)
- const leaseTruth = LeaseMiniTruthOutputSchema.parse(
-   JSON.parse(truthResult.content),
- );
+ const truthParseResult = safeParseAIResponse(truthResult.content, LeaseMiniTruthOutputSchema);
+ if (!truthParseResult.success) throw new Error(`[lease-deal-card] Step2 파싱 실패: ${truthParseResult.error}`);
+ const leaseTruth = truthParseResult.data;

  // Line 106-108 (Step 3)
- const blindTeaser = LeaseBlindTeaserOutputSchema.parse(
-   JSON.parse(teaserResult.content),
- );
+ const teaserParseResult = safeParseAIResponse(teaserResult.content, LeaseBlindTeaserOutputSchema);
+ if (!teaserParseResult.success) throw new Error(`[lease-deal-card] Step3 파싱 실패: ${teaserParseResult.error}`);
+ const blindTeaser = teaserParseResult.data;
```

##### 파일 수정: [`funding-project-card.ts`](file:///c:/Users/User/cre-dealcard/src/ai/agents/funding-project-card.ts)

```diff
  import { callLLM } from "@/ai/llm-client";
+ import { safeParseAIResponse } from "@/ai/utils/ai-response-parser";

  // Line 37 (Step 1)
- const projectData = FundingProjectOutputSchema.parse(JSON.parse(parseResponse.content));
+ const parseResult = safeParseAIResponse(parseResponse.content, FundingProjectOutputSchema);
+ if (!parseResult.success) throw new Error(`[funding-card] Step1 파싱 실패: ${parseResult.error}`);
+ const projectData = parseResult.data;

  // Line 59 (Step 2)
- const blindTeaser = FundingBlindTeaserOutputSchema.parse(JSON.parse(teaserResponse.content));
+ const teaserResult = safeParseAIResponse(teaserResponse.content, FundingBlindTeaserOutputSchema);
+ if (!teaserResult.success) throw new Error(`[funding-card] Step2 파싱 실패: ${teaserResult.error}`);
+ const blindTeaser = teaserResult.data;
```

#### 검증 방법

```bash
# 단위 테스트 — ai-response-parser 전용
npx vitest run src/ai/utils/ai-response-parser.test.ts

# 통합 테스트 — 마크다운 래핑 응답 시뮬레이션
# 입력: '```json\n{"title":"test"}\n```'
# 기대: 정상 파싱
```

#### 완료 기준
- [ ] `ai-response-parser.ts` 신규 생성
- [ ] `ai-response-parser.test.ts` 테스트 작성 (정상/마크다운/BOM/trailing comma/실패 케이스)
- [ ] `lease-deal-card.ts` 3개 파싱 지점 교체
- [ ] `funding-project-card.ts` 2개 파싱 지점 교체
- [ ] `npm run build` 통과

---

### 1.3 [CRITICAL] RAG 인덱싱 사일런트 실패 복구

**감사 출처**: `02-mobile-im-pptx-audit.md` IM-C1  
**예상 소요**: 1시간

#### 문제 분석

```mermaid
sequenceDiagram
    participant W as writer.ts
    participant I as im-embedding-indexer.ts
    W->>I: indexIMSections(sb, buildingId, sections, metadata)
    Note over I: metadata = {assetType, address, promptVariant, generatedAt}
    I->>I: if (metadata.status !== 'published') return; ← 항상 true!
    Note over I: 🔴 즉시 종료 — 인덱싱 0건
```

#### 수정 대상

##### 파일: [`writer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/writer.ts) Lines 118-131

```diff
  // ── 4. RAG 인덱싱 ──
  try {
    const sb = createServiceClient();
    const buildingId = String(building_ssot_lite.id ?? building_ssot_lite.building_ssot_lite_id ?? "");
    if (buildingId) {
      await indexIMSections(sb as any, buildingId, sections, {
        assetType: String(ctx.assetIdentity.asset_type ?? ""),
        address: String(ctx.marketLocation.address ?? ""),
        promptVariant: ctx.promptVariantId,
        generatedAt: new Date().toISOString(),
+       status: "published",
+       brokerApproved: true,
      });
    }
  } catch (indexErr) {
    console.warn("[mobile-im-writer] IM indexing failed (non-blocking):", indexErr);
  }
```

##### 후속 조치: 벌크 재인덱싱 스크립트

```typescript
// scripts/bulk-reindex-im.ts
import { createClient } from "@supabase/supabase-js";
import { indexIMSections } from "../src/domain/building/mobile-im/im-embedding-indexer";

async function bulkReindex() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  // published + broker_approved인 IM 전체 조회
  const { data: ims } = await sb
    .from("im_sections")
    .select("building_id, sections, asset_type, address")
    .eq("status", "published")
    .eq("broker_approved", true);
  
  console.log(`[bulk-reindex] ${ims?.length ?? 0}건 재인덱싱 시작`);
  
  for (const im of ims ?? []) {
    try {
      await indexIMSections(sb as any, im.building_id, im.sections, {
        assetType: im.asset_type,
        address: im.address,
        status: "published",
        brokerApproved: true,
        generatedAt: new Date().toISOString(),
      });
      console.log(`  ✅ ${im.building_id}`);
    } catch (err) {
      console.error(`  ❌ ${im.building_id}:`, err);
    }
  }
}

bulkReindex();
```

#### 완료 기준
- [ ] `writer.ts` 메타데이터 수정
- [ ] 벌크 재인덱싱 스크립트 작성·실행
- [ ] 인덱싱 후 `match_im_documents` RPC 호출 → 결과 반환 확인
- [ ] `npm run build` 통과

---

## Phase 2: 구조 품질 고도화 (16시간 / 8회 세션)

---

### 2.1 [HIGH] PPTX 테이블 오버플로우 수정

**감사 출처**: `02-mobile-im-pptx-audit.md` PPTX-H1  
**예상 소요**: 1시간

#### 수정 대상: [`pptx-renderer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/pptx-renderer.ts) Line 96

```diff
- slide.addTable(tableData, { ..., autoPage: false });
+ slide.addTable(tableData, {
+   ...,
+   autoPage: true,
+   autoPageRepeatHeader: true,
+   autoPageLineWeight: 0.5,
+   autoPageCharWeight: 0.25,
+   margin: [0.05, 0.1, 0.05, 0.1],
+ });
```

#### 검증 방법
- 15행 이상 임대차 현황표로 PPTX 생성 → 자동 페이지 분할 확인
- 헤더 반복 렌더링 확인

#### 완료 기준
- [ ] `autoPage: true` + 헤더 반복 설정
- [ ] 15행 테이블 테스트 → 2페이지 분할 확인
- [ ] 레이아웃 깨짐 없음 확인

---

### 2.2 [HIGH] PPTX 텍스트 예산 강제 트렁케이션

**감사 출처**: `02-mobile-im-pptx-audit.md` PPTX-H2  
**예상 소요**: 2시간

#### 문제 분석

현재 [`text-budget.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/text-budget.ts)의 `validateTextBudgets()`는 경고만 생성.  
[`data-binder.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/data-binder.ts) Line 636에 `truncate()` 함수가 정의되어 있으나 **한 번도 호출되지 않음**.

#### 수정 대상

##### 파일: [`text-budget.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/text-budget.ts)

```diff
+ /**
+  * 텍스트를 예산 한도 내로 강제 트렁케이션합니다.
+  * 한국어 문장 단위로 자르되, 마지막 문장이 잘리면 "..." 추가.
+  */
+ export function enforceTextBudget(text: string, maxLen: number): string {
+   if (!text || text.length <= maxLen) return text;
+   // 한국어 문장 구분자(다, 요, 음, .) 기준으로 잘라서 자연스럽게
+   const truncated = text.slice(0, maxLen);
+   const lastPeriod = Math.max(
+     truncated.lastIndexOf(". "),
+     truncated.lastIndexOf("다. "),
+     truncated.lastIndexOf("요. "),
+     truncated.lastIndexOf("음. "),
+   );
+   if (lastPeriod > maxLen * 0.6) {
+     return truncated.slice(0, lastPeriod + 1);
+   }
+   return truncated.trimEnd() + "…";
+ }
```

##### 파일: [`data-binder.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/data-binder.ts)

```diff
+ import { enforceTextBudget, TEXT_LIMITS } from "./text-budget";

  // 모든 텍스트 바인딩 지점에 enforceTextBudget 적용
  // 예: buildSummaryFromOverview 등의 반환값

  function bindSlideText(type: string, text: string): string {
+   const limit = TEXT_LIMITS[type as keyof typeof TEXT_LIMITS];
+   if (limit) return enforceTextBudget(text, limit);
    return text;
  }
```

#### 완료 기준
- [ ] `enforceTextBudget()` 구현 (한국어 문장 단위 트렁케이션)
- [ ] `data-binder.ts`의 모든 텍스트 바인딩에 적용
- [ ] 2000자 텍스트 입력 → 트렁케이션 확인
- [ ] PPTX 열어서 셰이프 내 텍스트 겹침 없음 확인

---

### 2.3 [HIGH] v3 마케팅 필드 파리티 통일

**감사 출처**: `01-dealcard-system-audit.md` H-1, H-2  
**예상 소요**: 3시간

#### 현재 필드 격차

| v3 필드 | 매각 스키마 | 임대 스키마 | 펀딩 스키마 |
|:---|:---:|:---:|:---:|
| `hookCopy` | ✅ | ❌ | ❌ |
| `structureChips` | ✅ | ❌ | ❌ |
| `regionLabel` | ✅ | ❌ | ❌ |
| `assetTypeLabel` | ✅ | ❌ | ❌ |
| `vacancyLabel` | ✅ | ❌ | ❌ |
| `curiosityHook` | ✅ | ❌ | ❌ |

#### 수정 대상 (3개 파일)

##### 1. 임대 스키마: `src/ai/schemas/lease-deal-card.ts`

```diff
  export const LeaseBlindTeaserOutputSchema = z.object({
    title: z.string(),
    shortSummary: z.string(),
    dealPoints: z.array(z.string()),
    cautionPoints: z.array(z.string()),
    hiddenInfoNotice: z.string(),
    gateMessage: z.string(),
    kakaoText: z.string(),
    boundaryNote: z.string(),
+   // ── v3 마케팅 확장 필드 ──
+   hookCopy: z.string().optional(),
+   structureChips: z.array(z.string()).optional(),
+   regionLabel: z.string().optional(),
+   assetTypeLabel: z.string().optional(),
+   vacancyLabel: z.string().optional(),
+   curiosityHook: z.string().optional(),
  });
```

##### 2. 펀딩 스키마: `src/ai/schemas/funding-project.ts`

```diff
  export const FundingBlindTeaserOutputSchema = z.object({
    title: z.string(),
    shortSummary: z.string(),
    dealPoints: z.array(z.string()),
    cautionPoints: z.array(z.string()),
    forbiddenWordsNotice: z.string(),
    gateMessage: z.string(),
    kakaoText: z.string(),
    boundaryNote: z.string(),
+   // ── v3 마케팅 확장 필드 ──
+   hookCopy: z.string().optional(),
+   structureChips: z.array(z.string()).optional(),
+   regionLabel: z.string().optional(),
+   assetTypeLabel: z.string().optional(),
+   curiosityHook: z.string().optional(),
  });
```

##### 3. 프롬프트 확장: [`lease-deal-card.ts`](file:///c:/Users/User/cre-dealcard/src/ai/prompts/lease-deal-card.ts) Lines 154-162

```diff
  // LEASE_BLIND_TEASER_SYSTEM 프롬프트 JSON 키 목록에 추가
  "title", "shortSummary", "dealPoints", "cautionPoints",
  "hiddenInfoNotice", "gateMessage", "kakaoText", "boundaryNote",
+ "hookCopy"(임대 상품의 핵심 가치를 한 줄로),
+ "structureChips"(스캔 가능한 핵심 태그 배열, 예: ["역세권", "신축", "풀옵션"]),
+ "regionLabel"(지역 라벨),
+ "assetTypeLabel"(자산유형 라벨),
+ "vacancyLabel"(공실 상태 라벨),
+ "curiosityHook"(호기심 유발 한 줄)
```

##### 4. 프롬프트 확장: [`funding-project.ts`](file:///c:/Users/User/cre-dealcard/src/ai/prompts/funding-project.ts) Lines 85-93

동일 패턴 적용 (vacancyLabel 제외)

#### 완료 기준
- [ ] 임대 스키마에 v3 필드 6개 추가 (optional)
- [ ] 펀딩 스키마에 v3 필드 5개 추가 (optional)
- [ ] 임대 프롬프트에 v3 필드 생성 지시 추가
- [ ] 펀딩 프롬프트에 v3 필드 생성 지시 추가
- [ ] DealCardEditor UI에서 임대·펀딩 카드의 칩/훅 렌더링 확인

---

### 2.4 [MEDIUM] PII 마스킹 보강

**감사 출처**: `01-dealcard-system-audit.md` M-1  
**예상 소요**: 1시간

#### 수정 대상: [`memo-sanitizer.ts`](file:///c:/Users/User/cre-dealcard/src/ai/sanitizer/memo-sanitizer.ts) Line 37

```diff
  // 현재: 지번만 마스킹
- const EXACT_ADDRESS_RE = /\b\d{1,4}-\d{1,4}\b/g;
+ // 확장: 지번 + 번지 + 도로명 번호
+ const EXACT_ADDRESS_RE = /(?:\b\d{1,4}-\d{1,4}\b|\b산?\s*\d{1,4}번지(?:\s*일대)?|\b[가-힣]+[로길]\s*\d{1,4}(?:-\d{1,4})?)/g;
```

#### 테스트 케이스

| 입력 | 현재 마스킹 | 수정 후 |
|:---|:---:|:---:|
| `123-4` | ✅ | ✅ |
| `산 15번지` | ❌ | ✅ |
| `역삼동 123번지` | ❌ | ✅ |
| `123번지 일대` | ❌ | ✅ |
| `테헤란로 123` | ❌ | ✅ |
| `테헤란로 123-4` | ❌ | ✅ |
| `봉은사길 45` | ❌ | ✅ |

---

### 2.5 [MEDIUM] PPTX 커버 이미지 폴백

**감사 출처**: `02-mobile-im-pptx-audit.md` PPTX-M2, IM-M2  
**예상 소요**: 1시간

#### 변경사항

`pptx-renderer.ts`에서 `coverImageUrl === null` 시 그래디언트 배경 + 건물명 텍스트 오버레이:

```typescript
if (!coverImageUrl) {
  // 플레이스홀더: 브랜드 그래디언트 + 건물 메타 오버레이
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: "100%",
    fill: { type: "solid", color: theme.colors.primary },
  });
  slide.addText(buildingName || "Investment Memorandum", {
    x: 1, y: 3, w: 8, h: 1.5,
    fontSize: 28, color: "FFFFFF", bold: true,
    align: "center", valign: "middle",
  });
}
```

---

### 2.6 [MEDIUM] PPTX 마크다운 파서 안정화

**감사 출처**: `02-mobile-im-pptx-audit.md` PPTX-M1  
**예상 소요**: 2시간

#### 현재 문제

`data-binder.ts`의 `buildSummaryFromOverview` 등이 `\*\*(.*?)\*\*` 등 정규식으로 마크다운 파싱. LLM이 `__bold__`, `- -list` 등 비표준 마크다운 생성 시 실패.

#### 해결 방안

```bash
npm install marked --save
```

```typescript
// data-binder.ts에 마크다운 파서 라이브러리 도입
import { marked } from "marked";

function parseMarkdownToSlideElements(markdown: string): SlideElement[] {
  const tokens = marked.lexer(markdown);
  // 토큰 기반 안전한 변환
  return tokens.map(convertTokenToSlideElement);
}
```

---

### 2.7 [MEDIUM] 금액 포맷 헬퍼 통합

**감사 출처**: `01-dealcard-system-audit.md` M-2  
**예상 소요**: 1시간

#### 신규 파일: `src/lib/format/krw.ts`

```typescript
/**
 * 만원 단위 숫자를 "X억 X,XXX만원" 한국식으로 포맷합니다.
 */
export function formatKrwManwon(manwon: number): string {
  if (manwon <= 0) return "미정";
  const eok = Math.floor(manwon / 10000);
  const remainder = manwon % 10000;
  if (eok > 0 && remainder > 0) {
    return `${eok.toLocaleString()}억 ${remainder.toLocaleString()}만원`;
  }
  if (eok > 0) return `${eok.toLocaleString()}억원`;
  return `${remainder.toLocaleString()}만원`;
}

export function formatKrwWon(won: number): string {
  if (won <= 0) return "미정";
  return formatKrwManwon(Math.round(won / 10000));
}
```

---

### 2.8 [MEDIUM] 데이터 신선도 검증 로직 추가

**감사 출처**: `04-ontology-ssot-rag-management.md` 2.2  
**예상 소요**: 3시간

#### 수정 대상: [`layer-score-engine.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/layer-score-engine.ts)

```diff
  export interface ChecklistInput {
    buildingRegister?: boolean;
+   buildingRegisterDate?: string;  // ISO date
    registry?: boolean;
+   registryDate?: string;
    landUsePlan?: boolean;
    rentRoll?: boolean;
+   rentRollDate?: string;
    photos?: boolean;
    floorPlan?: boolean;
    repairHistory?: boolean;
    vacancyStatus?: boolean;
    askingPrice?: boolean;
    disclosurePolicy?: boolean;
  }
```

```typescript
// 신선도 감쇠 계수 적용
function freshnessDecay(dateStr?: string, maxAgeMonths: number = 6): number {
  if (!dateStr) return 1.0; // 날짜 미제공 시 감쇠 없음
  const ageMonths = differenceInMonths(new Date(), new Date(dateStr));
  if (ageMonths > maxAgeMonths) return 0; // 유효기간 초과
  return Math.max(0, 1 - (ageMonths / maxAgeMonths) * 0.5);
}
```

#### 완료 기준
- [ ] `ChecklistInput`에 날짜 필드 추가
- [ ] `computeLayerScore`에 신선도 감쇠 적용
- [ ] UI에 "⚠️ N개월 전 자료" 경고 배지 추가
- [ ] 등기부등본 3개월 초과 시 경고 표시

---

### 2.9 [LOW] IM FAST_MODE 품질 보호

**감사 출처**: `02-mobile-im-pptx-audit.md` IM-M1  
**예상 소요**: 1시간

`IM_FAST_MODE=true` 시에도 Quality Gate의 **투자 보장 문구 검사**만은 스킵하지 않도록 경량 체크 추가:

```typescript
// FAST_MODE에서도 최소 안전 체크
if (fastMode) {
  const investmentGuaranteeCheck = await quickSafetyCheck(content);
  if (investmentGuaranteeCheck.hasViolation) {
    content = rewriteUnsafeText(content).safeText;
  }
}
```

---

## Phase 1·2 전체 완료 기준 체크리스트

| # | 작업 | Phase | 심각도 | 상태 |
|:---:|:---|:---:|:---:|:---:|
| 1 | 임대·펀딩 법적 가드레일 | 1 | 🔴 | ☐ |
| 2 | JSON 파싱 공통 유틸 + 적용 | 1 | 🔴 | ☐ |
| 3 | RAG 인덱싱 복구 + 벌크 재인덱싱 | 1 | 🔴 | ☐ |
| 4 | PPTX 테이블 autoPage | 2 | 🟠 | ☐ |
| 5 | PPTX 텍스트 예산 강제 | 2 | 🟠 | ☐ |
| 6 | v3 스키마·프롬프트 파리티 | 2 | 🟠 | ☐ |
| 7 | PII 마스킹 번지·도로명 | 2 | 🟡 | ☐ |
| 8 | PPTX 커버 폴백 | 2 | 🟡 | ☐ |
| 9 | 마크다운 파서 라이브러리화 | 2 | 🟡 | ☐ |
| 10 | 금액 포맷 헬퍼 | 2 | 🟡 | ☐ |
| 11 | 데이터 신선도 검증 | 2 | 🟡 | ☐ |
| 12 | FAST_MODE 안전 체크 | 2 | 🟢 | ☐ |

### 최종 검증 게이트

```bash
# 1. 타입 체크
npx tsc --noEmit

# 2. 프로덕션 빌드
npm run build

# 3. 단위 테스트
npx vitest run

# 4. 레거시 모델 잔존 확인
grep -r "gpt-5.4\|gpt-4o" src/ --include="*.ts" | wc -l
# 기대: 0

# 5. 미사용 import 확인
npx eslint src/ --rule '{"no-unused-imports": "error"}'
```
