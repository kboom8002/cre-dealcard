# CREDEAL SDD — 모바일 매거진 고도화 구현 명세 (AI-Pair Coding)

> **버전**: v1.2 (2026-07-25) · **범위**: 매거진 고도화 M-1~M-10 (Batch A~D)
> **v1.1 변경**: MG-A4를 본체 S3-T19(visitor_fp 공통 모듈) 의존·소비로 격하(중복 구현 방지) · MG-A1 선독에 맵 tier 정책(§MI-1) 추가 — 매거진 매물 카드의 맵 표현도 티저 tier 정책 준수
> **v1.2 변경** (데이터 공급 감사 D12): MG-A1의 브릿지 제거 지점 특정 — **IM 생성 handler.ts Step 7의 `extractAndAppendDealSnippet()` 호출 제거**가 im-to-magazine-bridge deprecated의 실제 코드 변경. 티저 카드 전환 완료 전까지는 기존 호출 유지(피드 공백 방지)
> **상위 문서**: 「모바일 매거진 고도화 계획 v1.0」(무엇을·왜) — 본 문서는 그 **어떻게**(태스크·DDL·인터페이스·검증)
> **정합**: 본체 SDD v1.1(Stage 0~3 규약 전부 상속) · 온톨로지 v0.1 · 티저 스펙 · Pitch 스펙 · 현행 매거진 아키텍처 문서(5모듈·14 API)
> **문서 세트 구성**: ① 본 파일(`docs/SDD-magazine.md`) ② 고도화 계획(`docs/specs/magazine-upgrade-plan.md`) ③ 현행 아키텍처 문서(`docs/audit/magazine-architecture.md`) — 셋이 한 세트다. README 인덱스에 아래 3행을 추가한다:
> ```
> ├── SDD-magazine.md            ★ ← 매거진 고도화 구현 SSoT (본체 SDD 규약 상속)
> ├── specs/magazine-upgrade-plan.md ← M-1~M-10 근거·시너지 맵
> └── audit/magazine-architecture.md ← 현행 5모듈·14 API·스키마 지도
> ```

---

# 0. AI-Pair Coding 규약 (본체 SDD §0 상속 + 매거진 특칙)

## 0.1 상속 규약 (재확인)

본체 SDD v1.1 §0의 8원칙 전부 적용: 스펙 우선 · 온톨로지 YAML SSoT · 기존 모듈 존중(주입 결합) · **URL 불변**(`/magazine/{brokerId}/{date}` 공개 스킴 유지) · provenance 의무 · feature flag · 명시적 상태 전이 · 수치 생성 금지(마스크 원칙).

## 0.2 매거진 특칙

1. **필드노트 불가침**: `field_note` 5필드의 원문을 AI가 생성·수정하는 코드를 작성하지 않는다. 허용 범위는 오탈자 교정 제안(diff 표시·브로커 승인)까지.
2. **매물 노출 단일 경로**: 매거진의 매물 표현은 `teaser-projector.projectTeaser()` 경유만. `DealSnippet` 신규 생성 코드는 작성 금지(기존 경로는 MG-A1 완료 시 deprecated).
3. **집합 통계 단일 소스**: 권역 통계는 `v_collective_insights` 조회만. 매거진 모듈 내 자체 집계 SQL 작성 금지 (N≥5 규칙이 뷰에 있으므로).
4. **발송은 레일 경유**: 신규 발송 로직을 만들지 않는다 — `distribute-magazine.ts`를 `rail/dispatcher.ts`로 일반화(MG-B4)한 뒤 전 에디션 타입이 이를 사용.
5. **화이트라벨 불변**: seller/owner_report의 발신 표시는 항상 브로커 명의 — 플랫폼 브랜드 노출 코드 금지.

## 0.3 태스크 착수 프로토콜 (AI 에이전트용)

각 태스크 시작 시: ①본 문서의 해당 태스크 행 + "선독 파일" 열의 파일을 읽는다 ②기존 테스트를 실행해 green 확인 ③플래그 생성 ④구현 ⑤태스크 행의 테스트 작성·통과 ⑥PR 설명에 `MG-XX / ff_mg_* / DoD 항목` 명시. 스펙에 없는 동작이 필요하면 **구현 전에** 본 문서 개정 PR을 먼저 제안한다.

## 0.4 Feature Flags · 신규 이벤트

```
Flags:
  A: ff_mg_teaser_cards, ff_mg_id_unify
  B: ff_mg_insights_section, ff_mg_subscriber_profile, ff_mg_quick_publish,
     ff_mg_seller_report, ff_mg_rail
  C: ff_mg_mask, ff_mg_owner_report, ff_mg_aeo, ff_mg_reaction_feed
  D: ff_mg_agent_draft

activity_events 추가:
  magazine_teaser_card_click, magazine_insights_dwell,
  magazine_intent_draft_proposed, magazine_intent_draft_approved,
  magazine_fieldnote_voice_started/completed, magazine_quick_published,
  seller_report_sent/viewed, owner_report_sent/viewed,
  magazine_agent_draft_ready, magazine_agent_draft_accepted
```

---

# 1. 목표 아키텍처 델타 (AS-IS → TO-BE)

```
AS-IS  weekly-generator ─→ editions(slug 키) ─→ issues 캐시 ─→ viewer(DealSnippet)
                                └─ distribute(위클리 전용) ─→ 알림톡

TO-BE  ┌ 생성기 3종 (rail/)                        ┌ viewer
       │  weekly (기존 개선: 집합지식+마스크)        │  · 매물카드 = TeaserView (M-1)
       │  seller-report (Pitch 블록 재사용)         │  · insights 섹션 (M-2)
       │  owner-report (K4)                        │  · AEO 마크업 (M-7)
       ├ editions(UUID 키·type 확장) ──────────────┤
       ├ subscriber-profile (행동→관심→intent) ─────┤ 개인화 큐레이션 (M-4)
       └ rail/dispatcher (전 타입 공용 발송) ────────┘
       에디터: 5분 플로우(3스크린) 기본 + 기존 8탭은 [고급]
```

---

# 2. 데이터 모델 (마이그레이션 `0140_magazine_upgrade.sql`)

```sql
-- MG-A2: broker_id 정합 (기존 TEXT slug → UUID 병행 후 전환)
ALTER TABLE magazine_editions ADD COLUMN IF NOT EXISTS broker_uuid uuid REFERENCES auth.users(id);
ALTER TABLE magazine_editions ADD COLUMN IF NOT EXISTS broker_slug text;  -- 기존 broker_id 값 보존
-- 백필: broker_profiles.slug 조인으로 broker_uuid 채움. 읽기 경로 전환 후 broker_id는 deprecated 주석.

-- MG-A1: 매물 카드의 티저 참조 (DealSnippet 대체)
ALTER TABLE magazine_editions ADD COLUMN IF NOT EXISTS featured_teaser_ids uuid[] DEFAULT '{}';
-- featured_deal_ids는 deprecated 주석 (삭제 금지 — additive-only)

-- MG-B1: 에디션 타입·대상 확장 (레일 일반화)
ALTER TABLE magazine_editions DROP CONSTRAINT IF EXISTS magazine_editions_edition_type_check;
ALTER TABLE magazine_editions ADD CONSTRAINT magazine_editions_edition_type_check
  CHECK (edition_type IN ('daily','weekly','monthly','special','seller_report','owner_report'));
ALTER TABLE magazine_editions ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES deals(id);
  -- seller_report는 딜 단위 발행. weekly는 NULL.
ALTER TABLE magazine_editions ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES assets(id);
  -- owner_report는 자산 단위.

-- MG-B2: 구독자 프로파일
ALTER TABLE magazine_subscribers ADD COLUMN IF NOT EXISTS client_id uuid;
ALTER TABLE magazine_subscribers ADD COLUMN IF NOT EXISTS segment text DEFAULT 'investor'
  CHECK (segment IN ('investor','seller','owner'));
ALTER TABLE magazine_subscribers ADD COLUMN IF NOT EXISTS interest_profile jsonb DEFAULT '{}';
  -- {archetypes: {STABLE_INCOME: 0.7,...}, regions: {...}, price_band: {...}, updated_at}
  -- 쓰기는 subscriber-profile.ts 배치만 (수동 편집 UI 없음)

-- MG-B2: 방문자 통일 (visitor_fp — teaser_events 규격과 동일 해시)
ALTER TABLE magazine_analytics_events ADD COLUMN IF NOT EXISTS visitor_fp text;
-- 기존 visitor_id는 병행 기록 후 3.5단계에서 fp로 통일

-- MG-C2: owner_report 구독 자동 생성 트리거는 앱 레벨 (deals.closed 전이 훅)
```

**issues 캐시 정리(MG-A3)**: `magazine_issues` 듀얼 쓰기를 제거하고 editions 단일화 + ISR(revalidate 1800 유지)로 흡수. 공개 뷰어 조회 경로를 editions로 전환 후 issues는 읽기 폴백 2주 유지 → 동결.

---

# 3. 모듈 명세

```
src/domain/magazine/
├── weekly-generator.ts        # 수정: MG-B3(집합지식 주입)·MG-C1(마스크)·assets 기반 매물
├── quality-gate.ts            # 수정: MG-C1 — 2차 안전망 모드 (마스크 구간 skip·서사 구간만)
├── magazine-teaser-cards.ts   # 신규 MG-A1: published 티저 → 카드 뷰
├── subscriber-profile.ts      # 신규 MG-B2: 행동 집계·세그먼트·intent 초안
├── publish-flow.ts            # 신규 MG-B5: 5분 발행 상태 머신
├── aeo-markup.ts              # 신규 MG-C3: Article/Dataset/FAQPage 스키마 생성
├── rail/
│   ├── dispatcher.ts          # 신규 MG-B4: distribute-magazine 일반화 (전 타입 공용)
│   ├── seller-report-generator.ts  # 신규 MG-B6: Pitch 4️⃣블록+티저 반응 데이터 재사용
│   └── owner-report-generator.ts   # 신규 MG-C2: K4 — 자산 포지션·권역 변동
└── im-to-magazine-bridge.ts   # deprecated (MG-A1 완료 후 — 티저 카드가 대체)
```

핵심 인터페이스:

```typescript
// magazine-teaser-cards.ts (MG-A1)
export async function getFeaturedTeaserCards(teaserIds: string[]): Promise<TeaserCardView[]>;
// 내부: teaser_configs(status='published')만 통과 → projectTeaser() 재사용.
// TeaserCardView = TeaserView의 축약(뱃지·밴드 4지표·훅카피·링크) — 정밀값 타입 부재 보장 동일.

// subscriber-profile.ts (MG-B2)
export async function rebuildInterestProfile(subscriberId: string): Promise<InterestProfile>;
  // 야간 배치: 최근 90일 열람·클릭(visitor_fp 조인) → 아키타입·권역·가격밴드 가중 집계
export async function proposeIntentDraft(subscriberId: string): Promise<IntentDraft | null>;
  // 규칙: 매물 클릭 ≥2 or IM 전환 ≥1 → buyer_intents(draft=true, origin='magazine') 생성 제안
  // 반드시 브로커 확인 칩 경유 — 자동 확정 금지

// publish-flow.ts (MG-B5)
export type QuickPublishStep = 'fieldnote_voice' | 'review_screen' | 'published';
export function getQuickPublishState(editionId: string): QuickPublishState;
// 필드노트 음성: 기존 MemoParser 음성 인식 재사용 — 5문답 순차, 각 답변은 해당 필드에 텍스트로

// rail/dispatcher.ts (MG-B4)
export async function dispatchEdition(editionId: string): Promise<DispatchResult>;
// edition_type별 대상 결정: weekly→segment='investor' | seller_report→해당 deal의 seller 연락처
// | owner_report→해당 asset의 owner 구독. 템플릿 ID 매핑 테이블. HMAC 수신거부·5건 병렬 유지.

// weekly-generator.ts 수정점 (MG-B3·MG-C1)
// Step 2에 추가: fetchCollectiveInsights(regionCode) → v_collective_insights (공개 계층 필드만)
// Step 5 프롬프트: 집합 지식을 [MASKED] 블록으로 주입 — "크리딜 표본 N=" 인용 문체 강제
// Step 6.5: quality-gate는 mode:'secondary' — 마스크 블록 제외 서사 구간만 검사
```

---

# 4. API 변경

| 태스크 | Method·Path | 내용 |
|--------|-------------|------|
| MG-A1 | PATCH `/api/magazine/editions` | `featured_teaser_ids` 허용 필드 추가. `featured_deal_ids` 수신 시 경고 헤더 |
| MG-B2 | POST `/api/public/magazine/analytics` | visitor_fp 병행 수집. 매물카드 클릭 → `magazine_teaser_card_click` 매핑 |
| MG-B2 | GET `/api/broker/magazine/subscribers` | `?segment=` 필터·interest_profile 요약 포함 |
| MG-B5 | POST `/api/broker/magazine/quick-publish` | 3스크린 플로우 전용: 필드노트 저장→확인 데이터 반환→발행(dispatch 트리거) |
| MG-B6 | POST `/api/broker/deals/{id}/seller-report` | 주간 매각 리포트 생성·발송 (수임 딜 자동 주기 옵션) |
| MG-C2 | POST `/api/broker/assets/{id}/owner-report` | 분기 자산 리포트 (deals.closed 훅이 구독 자동 생성) |
| MG-C3 | GET `/magazine/[brokerId]/[date]` | JSON-LD(Article+Dataset+FAQPage) 삽입 — URL 불변 |

---

# 5. 태스크 분해

## Batch A — 유출 방어·부채 (Stage 3.5, 본체 S3 완료 직후)

| ID | 태스크 | 선독 파일 | 내용 | 의존 | 테스트 |
|----|--------|-----------|------|------|--------|
| MG-A1 | 매물 카드 티저 표준화 | `teaser-projector.ts`·티저 스펙 §2·**map-image-upgrade §MI-1(v1.1)** | `magazine-teaser-cards.ts` 신설 → 뷰어 featured_deals 섹션 교체. published 티저만 선택 가능한 에디터 UI. **매물 카드 내 맵 표현은 티저 tier 정책 준수(권역 폴리곤만 — S3-T18 렌더러 재사용)**. im-to-magazine-bridge deprecated | 본체 S3-T8/T9/**T18** | 타입(정밀값 부재)·통합(미발행 티저 노출 0·좌표 부재) |
| MG-A2 | broker_id UUID 정합 | 현행 아키텍처 §9 | broker_uuid 백필→읽기 전환→구컬럼 deprecated. subscribers 조인 검증 | — | 마이그레이션·조인 정합 |
| MG-A3 | issues 캐시 단일화 | viewer page.tsx | editions 직조회+ISR로 전환, issues 폴백 2주 | A2 | E2E: 공개 URL 무변경 렌더 |
| MG-A4 | visitor_fp 소비 전환 (v1.1 격하) | 본체 S3-T19 산출물 | **신규 구현 없음** — `visitor-fingerprint.ts` 공용 모듈을 매거진 수집부(`use-magazine-analytics.ts`)에 적용·visitor_id 병행 전환만 | **본체 S3-T19** | 단위: fp 일치 |

**DoD-A**: 매거진 매물 노출의 재식별 게이트 경유 100% · DealSnippet 신규 생성 0 · 공개 URL 회귀 통과 · fp 크로스채널 조인 성립

## Batch B — 차별화·너처링·무마찰 (Stage 4)

| ID | 태스크 | 선독 파일 | 내용 | 의존 | 테스트 |
|----|--------|-----------|------|------|--------|
| MG-B1 | 에디션 타입·스키마 확장 | §2 DDL | edition_type 확장·deal_id/asset_id·segment | A2 | 마이그레이션 |
| MG-B2 | subscriber-profile | 부속요소 C절·본체 tacit 규약 | 행동 집계 배치·세그먼트 판정·intent 초안(브로커 확인 칩)·RLS(브로커 격리) | A4, 본체 S4 뷰 | 단위: 집계 6케이스 / E2E: 클릭 2회→초안 제안 |
| MG-B3 | 집합 지식 섹션 | `v_collective_insights` 정의 | 신규 섹션(공개 계층만·N 표기)·AI 브리핑 프롬프트 주입·뷰어 섹션 추가 | 본체 S4 | 가드레일: N<5 노출 0 |
| MG-B4 | rail/dispatcher | `distribute-magazine.ts` | 발송 일반화 — 타입별 대상·템플릿 매핑. 기존 위클리 무변경 통과 | B1 | 회귀: 위클리 발송 동일 |
| MG-B5 | 5분 발행 플로우 | 무마찰 UX 문서 §3·MemoParser | 3스크린(음성 필드노트→원스크린 확인→발행)·기존 8탭 [고급]으로·홈 액션 큐 카드·발행 소요 계측 | B3 | E2E: 음성→발행 5분 타이머 |
| MG-B6 | seller_report | Pitch 스펙 4️⃣·teaser-insight | 주간 매각 리포트 생성기(열람·관심·예산분포+다음 주 계획)·수임 딜 자동 주기·브로커 화이트라벨 | B1, B4 | 스냅샷·E2E |

**DoD-B**: 발행 소요 중앙값 5분↓(계측) · 구독자 프로파일 보유율 50%+ · 매거진 유래 intent 초안 월 5건+(승인율 측정 개시) · seller_report 수임 딜 발송 개시 · 위클리 회귀 무결

## Batch C — 정밀화·확산 (Stage 4~5)

| ID | 태스크 | 선독 파일 | 내용 | 의존 | 테스트 |
|----|--------|-----------|------|------|--------|
| MG-C1 | 마스크 전환 + 게이트 2차화 | `nlg-mask-engine.ts`·본체 S3-T1 | 수치 문장(온도 근거·실거래·통계) 마스크 렌더·quality-gate mode:'secondary' | 본체 S3-T1, B3 | 마스크 구간 수치 오류 0·needs_review율 비교 |
| MG-C2 | owner_report (K4) | 3대 효과 K4·assets | 분기 자산 리포트(권역 시세·유사 실거래·포지션)·closed 훅 구독 자동화·매도 신호 감지(정밀 열람→브로커 알림) | B1, B4 | E2E: closed→구독→발송→열람 알림 |
| MG-C3 | AEO 마크업·아고라 신디케이션 | /agora 설계 답변·M-7 | JSON-LD 3종·인용 블록(anchor·버전·출처 문구)·공개 계층 피드 출력 | B3 | 스키마 검증기·스냅샷 |
| MG-C4 | 반응 함수 합류 | K2 설계·teaser_events | 섹션 체류·소구 클릭 → 아키타입×권역 반응 집계 합류·발행 확인 스크린에 예상 반응 등급 | B5, A4 | 통합 |

**DoD-C**: needs_review율 70%↓ · owner_report 구독 유지율 측정 개시 · JSON-LD 검증 통과 · 예상 반응 등급 표시(표본 N 명시)

## Batch D — 에이전트 (Stage 5)

| ID | 태스크 | 내용 | 승격 조건 |
|----|--------|------|-----------|
| MG-D1 | 발행 에이전트 L2 | 월요일 04:00 초안+추천 매물+집합지식+발송 대상 완비 → 액션 큐 카드 "필드노트만 남았어요" | — |
| MG-D2 | L3 자동 발행 제안 | 필드노트 미작성 시 "데이터 요약호" 발행 제안(필드노트 섹션 자동 생략) | 초안 수락률 70%+ |

---

# 6. 테스트·롤백

- **회귀 최우선**: 위클리 발행·공개 URL·수신거부는 매 Batch에서 E2E 회귀 (기존 구독자 기반이 자산 — 깨지면 신뢰 종료)
- 타입 테스트: TeaserCardView 정밀값 부재 (본체 규약 상속)
- 가드레일 스위트 추가: N<5 통계·필드노트 AI 생성 시도·미발행 티저 노출·플랫폼 명의 발송
- 롤백: 전부 플래그 off — DDL은 additive-only. issues 캐시 전환만 폴백 기간(2주) 명시

# 7. DO NOT (기계 판독 — 본체 SDD §11에 병합)

```yaml
- "field_note 원문의 AI 생성·자동 수정 (교정 제안+승인 diff만)"
- "projectTeaser() 미경유 매물 정보의 매거진 렌더 (DealSnippet 신규 생성 포함)"
- "미발행(재식별 게이트 미통과) 티저의 featured 선택"
- "v_collective_insights 외 자체 권역 집계 SQL"
- "심화(기여자 계층) 집합 지식의 매거진·아고라 노출"
- "N<5 표본 통계 렌더"
- "interest_profile의 수동 편집 UI / 크로스 브로커 노출"
- "intent 초안의 브로커 확인 없는 자동 확정"
- "rail/dispatcher 외 신규 발송 경로"
- "seller/owner_report의 플랫폼 명의 발신"
- "/magazine/{brokerId}/{date} URL 스킴 변경"
- "필드노트 없는 위클리의 무제안 자동 발행 (MG-D2 승격 전)"
```

---

> **구현 시작점**: MG-A1부터 (본체 S3-T8/T9 완료가 전제). Batch 간 게이트는 본체 SDD와 동일 — DoD 미충족 시 다음 Batch 배포 금지. **이 문서 세트의 목적**: 매거진을 "콘텐츠 도구"에서 "정기 접촉 인프라"로 승격시키되, 이미 검증된 것(생성 파이프라인·구독 레일·필드노트의 진정성)은 한 줄도 헐지 않는 것.
