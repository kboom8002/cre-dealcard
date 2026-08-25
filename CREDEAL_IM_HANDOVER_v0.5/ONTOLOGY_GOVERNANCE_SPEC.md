# 온톨로지 SSoT 관리 · 어휘 편집기 명세

> 온톨로지의 **어느 층을 누가 어떻게 고칠 수 있는가**를 정의하고, 현장 어휘를 수집·승인하는 도구를 명세합니다.
> 어휘 데이터 자체는 `CATALOG_LEXICON.md`가 소유합니다.
>
> **v0.5 변경** — `CATALOG_LEXICON` 이 어휘 **규칙**(금지어 26 · 치환 14 · 표기)까지
> 소유하게 되었습니다. alias 추가는 사전 patch 이지만 **금지어·치환어 추가는
> 온톨로지 minor** 입니다 — 출력에 작용하므로 과거 IM의 재현 결과를 바꿀 수 있습니다.
> 발행된 IM은 `PublishRecord` 가 사전 버전을 Pin 합니다 (`CATALOG_LEXICON.md` §7.8).

| | |
|---|---|
| **온톨로지** | **v0.5.0** |
| **라우트** | `/admin/ontology/*` |
| **공수** | **26.5 solo-day** (§11) |
| **최종 수정** | 2026-08-25 |

---

## 1. 3층 편집 모델

**"온톨로지 편집기"를 통째로 만들면 안 됩니다.** 층에 따라 위험이 전혀 다릅니다.

| 층 | 대상 | 편집 방법 | 재현성 영향 |
|---|---|---|---|
| **구조** | 슬롯·타입·규칙(R/T/P/C/G/L/M/F/S)·계산식 | **PR only** — 화면 편집 불가 | **치명적** |
| **값** | enum 값 (`assetType` 17종 등) | 제안 → 승인 → 카탈로그 반영 → 배포 | 큼 |
| **어휘** | canonical / label / alias | **화면에서 편집** | **없음** |

### 1.1 구조를 화면에서 못 고치게 하는 이유

| 무너지는 것 | 근거 |
|---|---|
| 정본이 하나 | `README.md` §2 — 400명이 각자 슬롯을 만들면 정본이 400개 |
| 재현성 | 출시 불변조건 7 — Pin된 버전으로 재현 가능해야 함 |
| 코드 재사용 금지 | `CATALOG_RULES.md` — 폐기 코드를 다시 쓰면 과거 해석이 바뀜 |
| 법적 판정 정확성 | T-C/T-R을 중개인이 편집하면 위험 |

**구조 변경은 PR·리뷰·마이그레이션 절차를 거칩니다.** 편집기는 이 층을 **조회만** 제공합니다.

---

## 2. 어휘 층이 안전한 이유 — 재현성 증명

이것이 편집기를 어휘에만 여는 기술적 근거입니다.

### 2.1 alias는 입력 시점에만 작용합니다

```
[작성 시점]
  메모 "실질 용적률 247%"
      ↓  lexicon 해석            ← alias가 쓰이는 유일한 지점
  slot derived.farAboveGround = 247.0
      ↓
  DB 저장

[발행 시점]
  slot 읽기 → 계산 → IM 생성      ← alias를 보지 않습니다
      ↓
  PublishRecord { ontologyVersion: 'v0.4.0', ... }

[재렌더 시점]
  Pin된 ontologyVersion으로 slot 재계산   ← alias를 보지 않습니다
```

**사전을 고쳐도 과거 IM의 재현 결과가 바뀌지 않습니다.**

### 2.2 다만 파싱 로그에는 사전 버전을 남깁니다

```ts
export interface ParseLog {
  dealId: string;
  lexiconVersion: string;        // 'lex-2026.08.0'
  resolved: Array<{ term: string; key: SlotKey; via: 'alias'|'canonical'|'normalized' }>;
  ambiguous: Array<{ term: string; candidates: SlotKey[] }>;
  unmatched: string[];
}
```

**"왜 이 값이 여기 들어갔는가"를 추적하려면 당시 사전이 필요합니다.** 재현에는 불필요하지만 감사에는 필요합니다.

### 2.3 예외 — canonical 변경은 온톨로지 변경입니다

`canonical`은 명세 문서와 코드가 참조하는 이름입니다. 이걸 바꾸면 구조 변경과 같습니다.

```
alias 추가·삭제       → 화면 편집 ○
proLabel/b2cLabel 변경 → 화면 편집 ○ (승인 필요)
canonical 변경         → PR ✗ 화면 편집 불가
key 추가·삭제          → PR ✗
```

---

## 3. 수집 파이프라인

### 3.1 `unmatched`가 이미 있습니다

`IM_AUTHORING_SPEC.md` §3.2의 메모 파싱 결과에 `unmatched`가 있는데, 지금은 **IM 코멘트로 흘려보내고 버립니다.**

```
현재   메모 → 파싱 → unmatched → 중개인 코멘트로 출력 → 버려짐
개정   메모 → 파싱 → unmatched → 로깅 → 후보 도출 → 승인 → 사전 등재
                                                          ↓
                                                    파싱 정확도 향상
```

**수집은 편집기 없이 지금 시작할 수 있습니다.** 로깅만 붙이면 됩니다.

### 3.2 후보 도출

```ts
export interface TermCandidate {
  normalized: string;
  variants: string[];            // 원문 표기들
  observedCount: number;
  orgCount: number;              // 몇 개 조직에서 관측되었나
  contexts: Array<{ before: string; after: string; dealId: string }>;
  suggestedKey?: SlotKey;        // AI 제안 (§3.3)
  confidence?: number;
  status: 'new' | 'reviewing' | 'approved' | 'rejected' | 'ambiguous';
}
```

| 노출 기준 | |
|---|---|
| 관측 **5회 이상** | 검토 대상 |
| 관측 3~4회 | 목록에 있으나 하위 |
| 관측 1~2회 | **표시하지 않음** — 오타·1회성 |

### 3.3 AI는 제안만 합니다

```
입력   normalized term + 앞뒤 문맥 3개 + 후보 슬롯 목록
출력   { suggestedKey, confidence, reason }

금지   자동 등재 · 신뢰도 무관
```

**AI가 사전을 직접 고칠 수 없습니다.** `POST_PUBLISH_SPEC.md` §0의 원칙과 같습니다 — AI 출력은 제안이며 판정이 아닙니다.

```ts
export type LexiconAIOutput = { kind: 'suggestion'; key: SlotKey; confidence: number; reason: string };
// Approval 타입을 생성할 수 없습니다
```

---

## 4. 편집기 화면

### 4.1 `/admin/ontology/lexicon` — 사전 목록

```
어휘 사전                                   lex-2026.08.0

검토 대기 12   활성 alias 284   조직 전용 37

┌─────────────────────────────────────────────────┐
│ 🔴 검토 대기                                     │
│                                                 │
│ "실질용적률"          관측 47회 · 3개 조직        │
│   제안: derived.farAboveGround  (신뢰도 0.91)   │
│   문맥: "…실질 용적률은 공부상과 다른 약 247%…"   │
│   [승인] [다른 슬롯] [모호로] [거절]              │
│                                                 │
│ "공담"                관측 18회 · 1개 조직        │
│   제안: title.jointGroup  (신뢰도 0.84)         │
│   [승인] [다른 슬롯] [모호로] [거절]              │
└─────────────────────────────────────────────────┘
```

| 요소 | 규칙 |
|---|---|
| **문맥 문장 필수** | 단어만 보고는 판단할 수 없습니다 |
| 관측 횟수·조직 수 | 전사 승격 판단 근거 |
| `[모호로]` 버튼 | 슬롯 특정 불가 시 `ambiguous` 등재 |

### 4.2 `/admin/ontology/lexicon/[key]` — 항목 편집

```
derived.farAboveGround

canonical    지상 연면적 기준 용적률          🔒 PR로만 변경
proLabel     용적률 (지상 연면적 기준)         [편집]
b2cLabel     용적률                          [편집]
basisNote    ※ 지상 연면적 기준입니다          [편집]

alias (6)
  실질 용적률      전사 · 승인됨 · 47회   [비활성화]
  실용적률         전사 · 승인됨 · 12회   [비활성화]
  지상 용적률      전사 · 승인됨 ·  8회   [비활성화]
  실제 용적률      JS 전용 · 승인됨 · 5회 [전사 승격] [비활성화]
  실효 용적률      검토 대기 · 6회        [승인] [거절]
  공부상 용적률    ⚠ 충돌 — farTotal에 등재됨
```

**충돌은 화면에서 즉시 표시합니다.** 저장 시점에 알려주면 이미 늦습니다.

### 4.3 `/admin/ontology/structure` — 조회 전용

```
슬롯 163 · 규칙 R/T-C/T-R/P/C/G/L/M/F/S · enum 26계열

🔒 이 화면에서는 편집할 수 없습니다.
   구조 변경은 PR로만 가능합니다 → CATALOG_SLOTS.md · CATALOG_RULES.md
```

**조회를 제공하는 이유**는, 어휘를 등재하려면 어떤 슬롯이 있는지 봐야 하기 때문입니다.

### 4.4 중개인 화면 — 제안만

```
작성 중 메모에서 해석 못 한 표현이 있습니다

  "옥탑 확장분"   →  이건 무엇을 뜻하나요?
                    [슬롯 선택 ▾]  [건너뛰기]
```

**중개인은 제안만 하고 승인하지 못합니다.** 그리고 **건너뛰기가 항상 있어야** 합니다 — 작성 흐름을 막으면 안 됩니다.

---

## 5. 승인 워크플로우

```
제안 (중개인·AI·자동수집)
   ↓
검토 대기 (관측 5회 이상만 노출)
   ↓
승인자 판단 ──┬─ 승인 → 활성 alias
              ├─ 다른 슬롯 → 재지정 후 활성
              ├─ 모호 → ambiguous 등재 (파싱 시 질문)
              └─ 거절 → rejected (재제안 시 이력 표시)
```

### 5.1 권한

| 역할 | 제안 | 승인 | 조직 alias | 전사 alias | 구조 |
|---|:-:|:-:|:-:|:-:|:-:|
| 중개인 | ○ | ✗ | ✗ | ✗ | ✗ |
| 조직 관리자 | ○ | ○ | ○ | 제안만 | ✗ |
| 온톨로지 관리자 | ○ | ○ | ○ | ○ | ✗ |
| 개발자 (PR) | — | — | — | — | ○ |

**전사 alias를 조직 관리자가 못 만드는 것이 핵심입니다.** 한 조직의 은어가 전사 사전을 오염시키면 다른 조직의 파싱이 틀립니다.

### 5.2 승인 시 자동 검사

`CATALOG_LEXICON.md` §4.1의 5개 검사를 저장 전에 실행합니다. 하나라도 걸리면 저장되지 않습니다.

### 5.3 되돌리기

```
비활성화   status: 'deprecated'   → 즉시 반영 · 이력 유지
삭제       불가
```

---

## 6. 값(enum) 제안 — 중간 층

`assetType`에 새 유형이 필요할 때입니다.

```
제안 (중개인)  →  검토  →  CATALOG_ASSET_TYPES.md §8 절차  →  PR  →  배포
```

**화면에서 즉시 추가되지 않습니다.** §8 절차에는 조합 매트릭스 행·등급 프로파일·실증 IM이 동반되어야 하는데, 이건 화면에서 만들 수 없습니다.

편집기가 하는 일은 **제안을 접수하고 절차로 넘기는 것**까지입니다.

```ts
export interface EnumProposal {
  family: 'assetType' | 'buildingUse' | 'investmentPosture' | string;
  proposedValue: string;
  rationale: string;
  exampleDeals: string[];        // 최소 1건 필수
  status: 'submitted' | 'in_review' | 'accepted' | 'rejected';
  issueUrl?: string;             // PR·이슈 연결
}
```

---

## 7. 데이터 모델

```sql
CREATE TABLE lexicon_entry (
  key           text PRIMARY KEY,
  canonical     text NOT NULL,
  pro_label     text NOT NULL,
  b2c_label     text,
  unit          text,
  basis_note    text,
  ambiguous     boolean NOT NULL DEFAULT false,
  resolves_to   text[],
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lexicon_alias (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key            text NOT NULL REFERENCES lexicon_entry(key),
  term           text NOT NULL,
  normalized     text NOT NULL,
  scope          text NOT NULL CHECK (scope IN ('global','org')),
  org_id         uuid REFERENCES org(id),
  status         text NOT NULL CHECK (status IN ('active','pending','rejected','deprecated')),
  source         text NOT NULL CHECK (source IN ('seed','field','manual')),
  observed_count int NOT NULL DEFAULT 0,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  approved_by    uuid REFERENCES broker(id),
  approved_at    timestamptz,
  CONSTRAINT org_scope_requires_org CHECK (scope <> 'org' OR org_id IS NOT NULL)
);

-- 전사 활성 alias는 term이 유일해야 합니다 (충돌 방지)
CREATE UNIQUE INDEX lexicon_alias_global_uniq
  ON lexicon_alias (normalized)
  WHERE scope = 'global' AND status = 'active';

-- 조직 내에서도 유일
CREATE UNIQUE INDEX lexicon_alias_org_uniq
  ON lexicon_alias (org_id, normalized)
  WHERE scope = 'org' AND status = 'active';

CREATE TABLE term_candidate (
  normalized     text PRIMARY KEY,
  variants       text[] NOT NULL,
  observed_count int NOT NULL DEFAULT 1,
  org_count      int NOT NULL DEFAULT 1,
  contexts       jsonb NOT NULL,
  suggested_key  text REFERENCES lexicon_entry(key),
  confidence     numeric,
  status         text NOT NULL DEFAULT 'new',
  first_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lexicon_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES broker(id),
  action      text NOT NULL,
  key         text,
  term        text,
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
```

### 7.1 유니크 인덱스가 충돌 방지의 핵심입니다

**애플리케이션 검증만 두면 언젠가 우회 경로가 생깁니다.** 한 단어가 두 슬롯에 매핑되는 것을 DB가 막습니다.

### 7.2 감사 로그는 삭제하지 않습니다

누가 언제 무엇을 승인했는지가 남아야 합니다. 사전이 오염되었을 때 되짚을 수 있는 유일한 경로입니다.

---

## 8. 지표

| 지표 | 정의 | 목표 (6개월) |
|---|---|---|
| **파싱 해석률** | 메모 토큰 중 슬롯 매핑 성공 | 62% → **85%** |
| 자동 채움률 | 확신 0.85 이상 비율 | 41% → 70% |
| 검토 대기 적체 | 5회 이상 미처리 후보 | < 20건 |
| 승인 소요 | 후보 등장 → 승인 | 중앙값 7일 이내 |
| 활성 alias | 전사 + 조직 | 284 → 900 |
| 오탐 신고 | 잘못 매핑되어 신고된 건 | < 월 5건 |

### 8.1 목표치의 근거와 한계

**62%·41%는 가정치입니다.** 실측 데이터가 없습니다. 시드 사전 42항목으로 1개월 운영 후 기준선을 다시 잡아야 합니다.

**마지막 지표가 가장 중요합니다.** 해석률을 올리려다 오탐이 늘면 더 나쁩니다 — 틀린 값이 조용히 들어가기 때문입니다.

---

## 9. 리스크

| # | 리스크 | 대응 |
|---:|---|---|
| 1 | **사전 오염** — 잘못된 alias가 전사 반영 | 승인 권한 분리 · DB 유니크 · 감사 로그 |
| 2 | 오탐 증가 | 2글자 미만 차단 · 모호 항목은 질문 |
| 3 | 검토 적체 | 5회 이상만 노출 · 신뢰도순 정렬 |
| 4 | 조직 은어의 전사 유입 | 3개 조직 관측 시에만 승격 제안 |
| 5 | 중개인 제안 피로 | **건너뛰기 항상 제공** · 작성 흐름 차단 금지 |
| 6 | AI 제안 맹신 | 승인 화면에 **문맥 문장 필수 표시** |

**1번이 유일하게 회복 불가능한 위험입니다.** "용적률"의 alias에 "건폐율"이 들어가면 그때부터 모든 파싱이 틀리고, 이미 저장된 값은 되돌릴 수 없습니다.

---

## 10. 착수 순서

```
1단계 (지금)   unmatched 로깅 + 후보 집계        편집기 불필요
2단계          시드 사전 42항목 적재 · 해석 엔진
3단계          승인 화면 · 권한 · 충돌 검사
4단계          중개인 제안 UI
5단계          조직 alias · 승격 제안
6단계          enum 제안 접수
```

**1단계를 먼저 하는 것이 핵심입니다.** 사전이 빈 상태로 편집기만 만들면 승인할 것이 없어 아무도 안 씁니다. 3개월치 후보가 쌓여 있으면 관리자가 승인만 눌러도 사전이 채워집니다.

---

## 11. 공수

| # | 항목 | 공수 |
|---:|---|---:|
| 1 | `unmatched` 로깅 · 후보 집계 배치 | 2.0 |
| 2 | lexicon 스키마 · 마이그레이션 · 시드 적재 | 2.5 |
| 3 | 해석 엔진 (우선순위·정규화·모호 처리) | 4.0 |
| 4 | 충돌 검사 · DB 제약 | 1.5 |
| 5 | 승인 화면 (목록·문맥·액션) | 4.0 |
| 6 | 항목 편집 화면 | 3.0 |
| 7 | 권한 · RLS | 2.0 |
| 8 | 중개인 제안 UI | 2.5 |
| 9 | AI 제안 (문맥 기반) | 2.0 |
| 10 | 구조 조회 화면 | 1.5 |
| 11 | enum 제안 접수 | 1.0 |
| 12 | 감사 로그 · 지표 | 0.5 |
| | **합계** | **26.5** |

---

## 12. 검증 시나리오

| # | 시나리오 | 기대 |
|---:|---|---|
| 1 | "실질 용적률 247%" 입력 | `farAboveGround` 해석 |
| 2 | "실질용적률은" 입력 | 정규화 후 해석 |
| 3 | "면적 180평" 입력 | **자동 채움 안 함** · 질문 표시 |
| 4 | 관측 3회 후보 | 검토 목록에 **미노출** |
| 5 | "공부상 용적률"을 `farAboveGround`에 등재 시도 | **차단** — `farTotal` 충돌 |
| 6 | 2글자 미만 alias | 차단 |
| 7 | 조직 관리자가 전사 alias 생성 | **불가** · 제안으로 전환 |
| 8 | 중개인이 승인 시도 | 불가 |
| 9 | alias 삭제 시도 | 불가 · 비활성화만 |
| 10 | alias 비활성화 후 재파싱 | 신규만 영향 · **과거 IM 재현 불변** |
| 11 | canonical 편집 시도 | **화면에서 불가** · PR 안내 |
| 12 | AI 제안 자동 등재 시도 | 타입 수준 차단 |
| 13 | 승인 화면 | 문맥 문장 **반드시 표시** |
| 14 | 3개 조직 관측 조직 alias | 전사 승격 **제안** (자동 승격 아님) |
| 15 | 중개인 제안 UI | **건너뛰기 존재** |
| 16 | `b2cLabel`이 `null`인 슬롯 | 딜카드·Basic 노출 차단 |
| 17 | 승인 이력 조회 | 행위자·시각·전후 값 |
| 18 | 사전 버전 갱신 | `PublishRecord` 영향 **없음** |

---

## 13. 참고

- 어휘 데이터 정본 — `CATALOG_LEXICON.md`
- 슬롯 · enum — `CATALOG_SLOTS.md`
- 값 추가 절차 — `CATALOG_ASSET_TYPES.md` §8
- 규칙 코드 등록 — `CATALOG_RULES.md` §7
- 메모 파싱 · `unmatched` — `IM_AUTHORING_SPEC.md` §3.2
- AI 경계 원칙 — `POST_PUBLISH_SPEC.md` §0
- 정본 소유 원칙 · 출시 불변조건 — `README.md`
