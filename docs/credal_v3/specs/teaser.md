# 🃏 블라인드 티저 딜카드 — 개발 상세 스펙 v1.0

> **버전**: v1.0 (2026.07.23) · 온톨로지 v0.1 · DEV_SPEC v2.0 · 부속요소 고도화 방안(A절)과 정합
> **핵심 설계 사상**: **티저 = SSoT의 '공개 투영(Projection)'** — 정밀값은 전부 빌딩 SSoT(assets)에 저장되고, 티저는 밴딩·마스킹 규칙을 거친 읽기 전용 뷰다. 원본과 표시를 분리하면 한 번의 입력으로 티저→IM→수임제안서→매칭→데이터룸이 재사용되고, 유출은 정책 계층에서 구조적으로 차단된다.
> **골디락스 원칙**: "프로가 3초에 판단은 가능하게, 누구도 특정은 불가능하게" + 궁금증 1개를 남겨 Gate를 유도한다.

---

## 1. 데이터 아키텍처 — SSoT 저장과 티저 투영의 분리

### 1.1 저장 원칙 (후속 딜 관리 연계의 핵심)

```
[입력: 메모·OCR·공공API]                [소비처]
        │                                ├─ 티저 딜카드   (밴딩 투영)
        ▼                                ├─ 모바일 IM     (Gate·독자별 렌더링)
  assets.attrs (정밀값 + provenance) ────┼─ 수임 제안서   (전체 활용)
  lease_units / deals                    ├─ 매칭 엔진     (정밀값 매칭, 표시만 밴드)
        │                                └─ 실사 데이터룸 (Gate 승인 후 원본)
        └─ 재입력 0회 원칙: 티저 작성 시 받은 정밀값은 즉시 SSoT 저장,
           이후 IM 생성·딜 관리에서 다시 묻지 않는다
```

- 티저 생성 UI에서 브로커가 입력하는 값은 **항상 정밀값**(예: 매각가 85억, 대지 92평)이며 `assets.attrs`에 tier=broker_input으로 저장된다. 밴딩은 표시 시점에만 적용
- 매칭 엔진은 **정밀값으로 계산**하고(정확도), 상대에게 보여줄 때만 밴드로 렌더링(보안) — "계산은 정밀, 표시는 밴드"
- Gate 단계 공개(권역→상세→주소)는 별도 문서가 아니라 **정책 계층의 해제**로 구현: 같은 SSoT, 뷰어의 권한만 변경

### 1.2 공개 정책 3계층 (온톨로지 슬롯 단위 — 부속요소 A1 확정판)

```yaml
disclosure_policy:
  public:      # 티저에 항상 노출 (밴딩 적용)
    [regionCode, assetType, priceKrw→band, capRatePct→band, landArea→band,
     totalFloorArea→band, vacancyStatus, evictionStatus, roadContactType→cornerFlag,
     farHeadroomPp→band, approvalDate→era5y, archetypes, dataGrade]
  gated:       # Gate 승인 후 단계 공개
    stage_detail:  [정밀 면적·층수, rentRoll 요약(익명), capRatePct 정밀, 준공연도, 사진 전체]
    stage_address: [지번·도로명, 임차 업종 상세, 등기 요약]
  never:       # 어떤 단계에도 자동 노출 금지 (딜룸 수동 공유만)
    [임차인 실명, 매도 사유, 협상 메모, seniorLoanKrw, 소유자 정보]
```

### 1.3 신규 테이블

```sql
-- 티저 설정 (딜당 1개, 버전 관리)
CREATE TABLE teaser_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id),
  version int NOT NULL DEFAULT 1,
  band_overrides jsonb DEFAULT '{}',      -- 슬롯별 밴드 폭 조정 (재식별 시뮬레이터 제안 반영)
  photo_ids uuid[] DEFAULT '{}',          -- 식별성 검사 통과 사진만
  hook_copy text,                          -- 한 줄 소구 (copy-grammar 산출, 편집 가능)
  curiosity_slot text,                     -- 의도적 미공개 슬롯 명시 (§4.1)
  reident_result jsonb,                    -- 시뮬레이터 결과 스냅샷 {candidates: n, checked_at}
  published_at timestamptz,
  status text DEFAULT 'draft'              -- 'draft'|'published'|'paused'
);

-- 티저 이벤트 (딜 인사이트 수집 — §5)
CREATE TABLE teaser_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teaser_id uuid NOT NULL REFERENCES teaser_configs(id),
  visitor_fp text NOT NULL,               -- 익명 핑거프린트 (기존 UA+IP 해시)
  event_type text NOT NULL,               -- §5.1 이벤트 타입
  payload jsonb DEFAULT '{}',             -- 슬라이더 값·체류 섹션·퀵폼 응답 등
  created_at timestamptz DEFAULT now()
);
```

### 1.4 신규 모듈

```
src/domain/deal/teaser/
├── teaser-projector.ts      # SSoT → 티저 뷰 투영 (밴딩·마스킹·정책 적용)
├── banding.ts               # 슬롯별 밴딩 함수 (§3)
├── reident-simulator.ts     # k-익명성 재식별 시뮬레이터 (§3.3)
├── teaser-insight.ts        # 이벤트 집계 → 관심 태깅·intent 초안 (§5·§6)
└── photo-safety.ts          # 사진 식별성 검사 (§2.4)
```

```typescript
// teaser-projector.ts — 핵심 시그니처
export function projectTeaser(asset: AssetRecord, deal: DealRecord, cfg: TeaserConfig): TeaserView;
// TeaserView는 밴드 문자열만 포함 — 정밀값 타입이 아예 없음 (타입 수준 유출 방지)

// reident-simulator.ts
export async function simulateReidentification(view: TeaserView): Promise<{
  candidateCount: number;                  // 공공 DB 역질의 후보 필지 수
  riskySlots: FieldId[];                   // 후보 축소 기여 상위 슬롯
  suggestions: BandWidening[];             // "연면적 밴드 50평→100평 시 후보 34개"
}>;
```

---

## 2. 티저 카드 구성 스펙 (1스크린)

### 2.1 레이아웃 (위→아래)

```
┌────────────────────────────────────────────┐
│ ① 🏛️ 초안정 수익형 · 성수 카페거리권  [A등급✓] │  헤더: 아키타입 뱃지+권역+등급
│ ② ┌─────────┬─────────┐                    │
│    │ 80억대   │ Cap 4%대 │                    │  핵심 4지표 (2×2, 전부 밴드)
│    │ 대지 80~ │ 만실 ·   │                    │
│    │ 100평   │ 명도 불요 │                    │
│    └─────────┴─────────┘                    │
│ ③ 코너 입지 · 용적률 여유 40%p+ · 2010년대 준공 │  구조 신호 3칩
│ ④ "리모델링 없이 바로 수익, 코너 노출은 덤"     │  한 줄 소구 (copy-grammar)
│ ⑤ [내 조건으로 보기 ▸]  ← 인터랙티브 (§4.3)    │
│ ⑥ 🔒 정밀 호가·위치는 상세 요청 후 공개됩니다    │  궁금증 명시 (§4.1)
│ ⑦ [💬 질문하기] [⭐ 관심 등록] [🔑 상세 요청]    │  CTA 3단 위계 (§4.2)
│ ⑧ 김OO 팀장 · 응답 보장 3시간 · 성사 12건       │  신뢰 라인
└────────────────────────────────────────────┘
```

### 2.2 필드별 표시 규칙

| 위치 | 슬롯 | 밴딩/변환 | 비고 |
|------|------|-----------|------|
| ① | archetypes | 뱃지 최대 2개 | R09(명도 고위험)는 티저 미표시(내부용) |
| ① | regionCode | 상권·권역 라벨 | 동 단위 금지 |
| ① | dataGrade | A·B만 뱃지 표시 | C·D는 수익 지표 자체를 숨김 (§2.3) |
| ② | priceKrw | §3.1 가격 밴드 | |
| ② | capRatePct | 0.5%p 밴드 ("4%대 초반") | C·D등급이면 미표시 |
| ② | landArea·totalFloorArea | §3.1 면적 밴드 | 둘 중 자산군 대표 1개만 기본 |
| ② | vacancyStatus+evictionStatus | 상태 라벨 결합 | "만실·명도 불요" / "공실 20%·명도 협의 중" |
| ③ | roadContactType | 코너 여부 + 등급 밴드만 | 12분류 원값 노출 금지(역추적 기여) |
| ③ | farHeadroomPp | 20%p 단위 밴드 | VALUE_ADD 아키타입일 때만 기본 노출 |
| ③ | approvalDate | 5년 연대 ("2010년대 초") | |
| ④ | hook_copy | copy-grammar 산출 (부속요소 B1) | 아키타입 소구 사전 준수·금지 소구 차단 |

### 2.3 등급 게이트

- **A·B등급**: 위 전체 표시. **C등급**: 수익 지표(②의 Cap) 숨김, "수익 자료 검증 중" 라벨. **D등급**: 티저 발행 차단 → 데이터 보강 유도
- 근거: "크리딜 티저의 숫자는 믿을 수 있다"는 시장 평판이 리드 품질의 전제

### 2.4 사진 정책 (`photo-safety.ts`)

- 허용: 내부·디테일·조감 일러스트. **금지: 외관 전경·간판·주변 랜드마크 포함 컷** (역추적 1순위)
- 검사: 업로드 시 ①거리뷰 유사 판별(외관 전경 휴리스틱+비전 모델) ②간판·문자 OCR 검출 → 위반 시 해당 사진 티저 제외(IM·데이터룸용으로는 보존)
- 사진 0장 허용 — 사진 없는 티저가 유출된 티저보다 낫다

---

## 3. 밴딩 규칙 (`banding.ts`)

### 3.1 기본 밴드 정의

```yaml
banding_defaults:
  priceKrw:        # 가격대별 가변 폭
    - { lt: 300000, band: 50000,  label: "{n}0억대 {전반|후반}" }   # 30억 미만: 5억
    - { lt: 1000000, band: 100000, label: "{n}0억대" }              # 30~100억: 10억
    - { gte: 1000000, band: 300000, label: "{n}00억대" }            # 100억+: 30억
  capRatePct:      { band: 0.5, label: "{n}%대 {초반|중반|후반}" }
  landArea:        { band_pyung: 20, label: "대지 {a}~{b}평" }      # 시뮬레이터가 확장 가능
  totalFloorArea:  { band_pyung: 100, label: "연면적 {a}~{b}평대" }
  farHeadroomPp:   { band: 20, label: "여유 {n}%p+" }
  approvalDate:    { band_years: 5, label: "{decade} {전반|후반} 준공" }
  clearHeightM:    { band: 2, label: "층고 {a}~{b}m" }              # 물류
  dockCount:       { band: 5, label: "도크 {a}+기" }                # 물류
```

- `band_overrides`(teaser_configs)로 딜별 확장 가능(축소는 시뮬레이터 통과 시에만)

### 3.2 자산군별 대표 슬롯 세트

| 자산군 | ② 4지표 | ③ 구조 신호 |
|--------|---------|-------------|
| smallBuilding | 가격·Cap·대지면적·공실/명도 | 코너·용적률 여유·준공연대 |
| logisticsCenter | 가격·Cap·연면적·마스터리스 여부 | 층고 밴드·도크 밴드·IC 거리 밴드(10km) |
| landSite | 가격·평당가 밴드·대지면적·명도 상태 | 용도지역 계열(주거/상업/공업 — 세부 미노출)·허가구역 여부·도로폭 밴드 |

### 3.3 재식별 시뮬레이터 게이트 (발행 필수 관문)

```
발행 시도 → projectTeaser() → simulateReidentification()
  → 공공 DB(자체 보유 대장·토지 데이터) 역질의:
     후보 = filter(권역 내 필지, 공개 밴드 전 조합)
  → candidateCount >= K (기본 20) → 발행 허용
  → candidateCount <  K → 차단 + suggestions 제시
     "면적 밴드를 100평 단위로 넓히면 후보 34개가 됩니다 [적용]"
  → 결과는 reident_result에 스냅샷 (감사 추적)
```

- K는 권역 밀도별 조정 가능(밀집 상권 20, 저밀도 물류권 10)
- **이 게이트는 우회 불가** (DO NOT 등재) — "크리딜 딜카드는 유출되지 않는다"의 기술적 증명이자 경쟁 차별 기능

---

## 4. 리드 생성 극대화 장치

### 4.1 궁금증 갭 설계 (curiosity_slot)

- 티저마다 **의도적 미공개 1순위 슬롯을 명시적으로 표기**: "🔒 정밀 호가·위치는 상세 요청 후"
- 심리 근거: 전부 숨기면 스팸, 전부 보여주면 문의 불필요 — 판단 재료는 충분히 주되 마지막 1개를 공식적으로 잠근다
- 아키타입별 기본값: STABLE_INCOME→정밀 Cap·렌트롤 / VALUE_ADD→정밀 용적률·규모검토 / HQ_READY→정밀 위치

### 4.2 CTA 3단 위계 (마이크로 커밋 사다리)

| 단계 | CTA | 요구 정보 | 전환 목표 |
|------|-----|-----------|-----------|
| 1 | 💬 질문하기 (스마트톡) | 없음 (익명) | 대화 개시 — 가장 낮은 문턱 |
| 2 | ⭐ 관심 등록 | 연락처 1필드 | 리드 확보 + "유사 매물 알림" 동의 |
| 3 | 🔑 상세 요청 (Gate) | 이름·연락처·요청 사유 | 실검토 의사 확인 |

- 각 단계 전환이 리드 스코어에 차등 반영 (기존 가중치 체계 연동: 1단계 +10, 2단계 +20, 3단계 +30)

### 4.3 인터랙티브 "내 조건으로 보기" — 리드 장치이자 인사이트 장치

- 슬라이더 2개: **예산 상한** · **대출 활용 비율(0~60%)**
- 출력: 검증 밴드 내에서만 — "이 조건이면 자기자본 약 {밴드}, 레버리지 수익률 {밴드}" (assumptions 금리 범위 사용, '가정' 배지, 신규 정밀 계산 없음 — 가드레일 준수)
- **조작값 자체가 최고급 인사이트**: 방문자의 실제 예산·대출 성향이 teaser_events로 수집 (§5)
- 조작 후 자연 유도: "이 조건에 맞는 유사 매물 2건 더 있음 → ⭐ 관심 등록"

### 4.4 보조 장치

- **유사 딜카드 2건 추천** (동일 아키타입·권역, 열람 말미) — 세션 체류·교차 관심 수집
- **신선도·희소 신호**: "이번 주 등록" 뱃지, Gate 승인 잔여 슬롯(브로커 설정 시) — 과장 금지(실데이터만)
- **응답 보장 표시**: 브로커 프로필의 응답 보장 시간 노출 — 문의 심리 장벽 완화
- **소셜 프루프(옵션)**: "이번 주 열람 N명" — 브로커 토글, N<5 미표시
- **OG 최적화**: 아키타입 뱃지+가격 밴드+한 줄 소구가 1200×630에 항상 포함 (카톡 첫인상 = ①+④)

---

## 5. 딜 인사이트 수집 (teaser-insight.ts)

### 5.1 이벤트 타입

```
teaser_impression        (OG 노출 — 채널 태그)
teaser_view              (열람 개시·체류 시간)
teaser_section_dwell     {section: 'metrics'|'signals'|'hook', ms}
teaser_slider_set        {budget_krw_band, ltv_pct}          ← 예산·대출 성향
teaser_quickform_answer  {q, a}                              ← §5.2
teaser_cta_click         {tier: 1|2|3}
teaser_similar_click     {target_teaser_id}                  ← 교차 관심
teaser_share_forward     (재공유 감지 — URL 파라미터)
```

### 5.2 관심 조건 퀵 폼 (선택 노출)

- 2단계 CTA(관심 등록) 직후 3문항 이내, 전부 탭 선택: "찾는 유형은? (수익형/개발형/사옥형)" "예산대는?" "희망 권역은?"
- 응답 → `buyer_intents` 초안 필드 직결 (§6.2) — 설문이 아니라 **의향서의 씨앗**

### 5.3 집계·환류

- 티저별 깔때기: 노출→열람→인터랙션→CTA 1/2/3 — 딜 워크스페이스 활동 탭에 표시
- 아키타입×권역별 반응 함수: 어떤 소구·밴드 폭·지표 구성이 전환을 만드나 → `v_collective_insights` 확장 → copy-grammar 소구 사전·홈 브리핑 환류
- 슬라이더 분포: "이 딜을 본 사람들의 예산 중위 {밴드}, 대출 성향 {분포}" → 호가 조정 설득 자료로 브로커에게 제공 (**티저가 가격 발견 도구가 됨**)

---

## 6. 매수조건 AI 매칭 연계 포인트

### 6.1 티저 공개 슬롯 = 매칭 하드 필터 축 (설계 불변식)

- 매칭 1단(하드 필터)의 축 — 자산군·권역·가격밴드·아키타입 — 은 티저 public 슬롯과 **동일 집합**을 유지한다
- 효과: ①크로스 매칭(2단계)에서 상대 브로커에게 **티저만 공개해도 매칭이 성립** ②"매칭됐는데 보여줄 수 없는" 모순 없음 ③티저가 곧 네트워크 교환 프로토콜의 단위

### 6.2 행동 → 의향서 파이프라인

```
익명 방문자 행동 축적 (열람 딜 슬롯 분포 + 슬라이더 + 퀵폼)
  → visitor_fp 프로파일 (관심 아키타입·권역·예산 밴드)
  → 연락처 전환(2·3단 CTA) 시점에 buyer_intents 초안 자동 생성
  → 브로커 확인 화면: "이 고객, 성수 30~50억 밸류애드형으로 등록할까요?" [승인/수정]
  → 승인 즉시 매칭 엔진 대상 편입 → 신규 티저 등록 시 자동 알림 (너처링)
```

### 6.3 매칭 계산 규칙 (밴드 호환)

- SSoT에 정밀값이 있는 쪽(딜)과 밴드만 있는 쪽(의향·초안)의 매칭은 **구간 겹침(interval overlap)**으로 계산: `overlap(intent.budget_band, deal.price ± 협상여지)` — 겹침 비율을 소프트 점수에 반영
- 의향서가 정밀화될수록(브로커 보완) 매칭 정밀도 상승 — 초안→정밀의 개선 인센티브를 UI에 표시
- 거절 태깅(tacit_labels)은 기존 D3 규칙 준용

### 6.4 매칭 → 티저 발송 자동화

- S급 매칭 발생 시: 해당 매수자(또는 담당 브로커)에게 **티저 우선 발송** 제안 → 반응(열람·CTA)이 매칭 검증 신호로 회귀 → 무반응 시 매칭 점수 하향 학습

---

## 7. API·이벤트·플래그

```
POST /api/broker/deal/{dealId}/teaser            # 생성·수정 (draft)
POST /api/broker/deal/{dealId}/teaser/publish    # 시뮬레이터 게이트 경유 발행
GET  /api/public/teaser/{teaserId}               # 공개 뷰 (TeaserView만 반환)
POST /api/public/teaser/{teaserId}/event         # teaser_events 수집
POST /api/public/teaser/{teaserId}/interest      # 2단 CTA (관심 등록 + 퀵폼)
GET  /api/broker/teaser/{teaserId}/insights      # 깔때기·슬라이더 분포·프로파일
```

- activity_events 추가: `teaser_published`, `teaser_reident_blocked`, `teaser_band_widened`, `intent_draft_from_teaser`
- Feature flags: `ff_teaser_projector`, `ff_reident_gate`, `ff_teaser_slider`, `ff_teaser_quickform`
- 공개 URL: 기존 `/dc/{buildingId}` 유지 + `?v={version}` (URL 불변 원칙)

## 8. 수용 기준·DO NOT

**Definition of Done**
- [ ] TeaserView 타입에 정밀값 필드 부재 (타입 테스트)
- [ ] 재식별 시뮬레이터 미통과 티저의 발행 불가 (E2E 테스트)
- [ ] 티저 입력값의 SSoT 저장 → IM 생성 시 재입력 0회 (통합 테스트)
- [ ] C·D등급 수익 지표 미표시 / D등급 발행 차단
- [ ] 사진 식별성 검사 파이프라인 통과 사진만 노출

**DO NOT (기존 DEV_SPEC C-2에 추가)**
```yaml
- "재식별 시뮬레이터 게이트 우회 발행"
- "TeaserView 외 경로로 정밀값을 공개 응답에 포함"
- "외관 전경·간판 포함 사진의 티저 노출"
- "슬라이더 출력에 assumptions 범위 밖 신규 정밀 계산"
- "소셜 프루프·희소 신호의 실데이터 외 표시 (가짜 열람수·가짜 마감임박)"
- "동 단위 이하 위치 정보의 public 노출"
- "R09(명도 고위험) 뱃지의 티저 노출 (내부·매칭 전용)"
```

---

> **요지**: 이 스펙의 티저는 세 가지를 동시에 수행한다 — ①**리드 기계**(궁금증 갭 + 3단 CTA + 인터랙티브 슬라이더), ②**인사이트 센서**(예산·대출 성향·관심 유형이 이벤트로 축적 — 티저가 가격 발견 도구가 됨), ③**매칭·네트워크 프로토콜의 단위**(공개 슬롯 = 매칭 하드 필터 = 크로스 매칭 교환 규격). 그리고 이 모든 것의 전제는 SSoT-투영 분리와 재식별 게이트 — 판단은 가능하게, 특정은 불가능하게.
