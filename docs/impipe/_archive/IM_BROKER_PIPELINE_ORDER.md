# 중개인 작성형 파이프라인 개선 작업 지시서 (D37)

> **대상** CREDEAL V5 파이프라인 (커밋 `1858bee`)
> **근거** D36 `IM_BROKER_SPEC_UPGRADE.md` · `07_BROKER_GOLDILOCKS_IM_PRODUCT_SPEC.md`
> **선행** D30~D35
> **소유** AI/백엔드 팀 · PPTX 렌더 팀 · QA

---

## 0. 격차 — 현행이 07을 실행할 수 없는 이유

| 07이 요구하는 것 | 현행 상태 | 격차 |
|---|---|:-:|
| 값을 한 번 입력하고 전 면이 같은 객체 참조 (§3.3) | `bindSectionData` — **LLM 마크다운 파싱** | 🔴 |
| 계산은 코드에서, LLM은 설명만 (§12.1) | LLM이 문장 안에서 숫자를 만듦 | 🔴 |
| 충돌을 덮어쓰지 않고 객체로 (§5.3) | `_source` 우선순위로 **조용히 덮어씀** | 🔴 |
| 자료 부족 시 산출물 종류 전환 (§7.2) | 등급만 낮추고 같은 IM 발행 | 🔴 |
| 빈 면 금지 · 폴백 금지 (§15.3 · §16.3) | `addFallbackContent` · `generatePremiumTemplate` | 🔴 |
| 앞 N면 슬라이스 금지 (§16.2) | `PAGE_HARD_LIMIT` 초과 시 **앞 16면 유지** | 🔴 |
| 중개인 승인 전 Draft 상태 유지 (§14) | 승인 개념 **없음** | 🔴 |
| 중개인 의견 구조화 (§13.1) | 자유서술 → LLM | 🔴 |
| 부록 분리 (§16.1) | 부록 개념 **없음** | 🔴 |
| 토지거래허가 조회 (D36 §3.1) | 9개 공공 API에 **없음** | 🔴 |

🔴 **현행 파이프라인은 「LLM이 쓰고 렌더러가 그린다」입니다.**
   07은 「사람이 승인하고 엔진이 계산하고 LLM이 설명한다」입니다.
   **데이터 흐름의 방향이 반대입니다.** 부분 개선으로 도달하지 않습니다.

---

## 1. P0 — 기반 (이것 없이는 나머지가 무의미합니다)

### P0-1 · Claim / Evidence / Calculation 스키마 신설

**신설** `src/domain/building/im-core/claim.ts`

모든 외부 표시 항목은 **Claim 객체**를 통해서만 렌더러에 도달합니다.
문자열이 직접 슬라이드에 가지 않습니다.

```ts
type Claim = {
  id: string;
  subject: string;                 // 무엇에 대한 주장인가
  value: number | string | null;   // null 이면 미확정 — 문장으로 메우지 않습니다
  unit?: string;
  evidence: EvidenceRef[];         // 🔴 최소 1개. 0개면 렌더 거부
  provenance: ProvenanceKind;      // 저장용 9종 (D36 §4.3)
  asOf: string;                    // 기준일 필수
  status: 'unverified'|'broker_checked'|'reconciled'|'conflicted'|'stale'|'not_available';
  expertRequired: boolean;
  approvedBy?: string;             // 중개인 승인 전에는 Draft
};
```

**수용** 슬라이드에 표시된 모든 수치가 `Claim.id`로 역추적됩니다.
`evidence.length === 0`인 Claim이 렌더되면 `B04`로 차단.

### P0-2 · 계산 엔진을 LLM 밖으로

**대상** `data-binder.ts` `bindSectionData` · `im-section-generator.ts`

```
현행   LLM 마크다운 → 정규식 파싱 → 슬라이드
개선   입력 → Calculator (결정론) → Claim → 슬라이드
                                    ↘ LLM (설명 문장만, 숫자는 Claim 참조)
```

- `bindSectionData`(MD 파싱)를 **파생값 경로에서 제거**합니다.
  `bindFromIMCore`를 유일 경로로 승격(D32 BL-3).
- LLM 프롬프트에 계산 결과를 **읽기 전용으로 주입**하고,
  출력에서 새 숫자가 나오면 `detectHallucination`이 아니라 **차단**합니다.
- 07 §12.1 그대로: 「계산에 사용한 입력, 단위, 기준일, 공식 버전을 저장한다」

```ts
type Calculation = {
  formula: string;                 // 'noi / asking_price'
  formulaVersion: string;          // 'v1.2.0'
  inputs: Record<string, Claim['id']>;
  result: number;
  basis?: 'GPI'|'EGI'|'NOI';       // 🔴 라벨은 여기서 파생. 문자열 교정 금지
  deductions?: Array<{name: string; amount: number}>;
};
```

**수용** `basis='NOI'`인데 `deductions.length===0` → `G38` 차단.
전 면이 같은 `Calculation.id`를 참조 — V4의 4면/10면 모순이 구조적으로 불가능해집니다.

### P0-3 · 발행 등급 2축 (`tier` × `grade`)

**대상** `deck-sequencer.ts` · `grade-engine`

```ts
type ReleaseTier = 'internal_only'|'fact_om'|'analysis_im'|'decision_im'|'expert_required';

function resolveTier(a: DataAvailability, g: Grade): ReleaseTier {
  if (g === 'D') return 'internal_only';
  if (!a.hasRentRoll && posture === 'income') return 'fact_om';   // 🔴 07 §7.2
  if (!a.hasComparables && !a.hasRentRoll) return 'fact_om';
  if (!hasScenario || !hasAsOf) return 'analysis_im';
  return 'decision_im';
}
```

**수용** 필동3가(원장 0행) → `fact_om`. 「수익형 IM인데 수익 칸이 빈」 산출물이
더 이상 나오지 않습니다. `fact_om`은 결손이 아니라 **완성품**입니다.

### P0-4 · `DataAvailability` 실값 검사

**대상** `03 §3.1` 인터페이스 (D33 S-5 · D35 §2.7 미해소)

```ts
interface DataAvailability {
  hasLandUsePlan; hasLandPrice; hasBuildingRegister; hasRegistryData;
  hasComparables; hasCommercialDistrict; hasCadastralMap; hasFloorPlan;
  hasRentRoll: boolean;        // 🔴 신설 — 원장 행 수 > 0
  hasPhotos: boolean;          // 🔴 신설 — buildingId 일치 사진 ≥ 3
  hasOpex: boolean;            // 🔴 신설 — 운영비 없으면 NOI 금지
  hasAsOf: boolean;            // 🔴 신설 — 기준일 없으면 임대 결론 금지
}
```

플래그는 **존재 여부가 아니라 실값**을 봅니다.
`(확인 필요)`는 값이 아닙니다(D33 BL-F).

### P0-5 · 충돌 객체 — 덮어쓰기 금지

**대상** `data-binder.ts` `_source` 폴백 보호 로직

현행은 `_source: 'vworld_api'`가 있으면 마크다운을 덮어씁니다.
07 §5.3은 **덮어쓰지 말고 충돌을 만들라**고 합니다.

```ts
type Conflict = {
  kind: 'address'|'area'|'use'|'rentroll_sum'|'lease_terms'
      | 'occupancy_narrative'|'unit_price'|'comp_identity'|'yield_basis';
  left: Claim; right: Claim;
  resolution?: { chosen: Claim['id']; reason: string; by: string };
};
```

미해결 `Conflict`가 있으면 `B03`으로 발행 차단.
**조용한 승리자를 만들지 않습니다.**

### P0-6 · 폴백 제거

**대상** `addFallbackContent()` · `generatePremiumTemplate()`

- `addFallbackContent`를 **삭제**합니다. 아키타입이 못 그리면 면을 열지 않습니다.
- `judgeIMSection` 반려 시 템플릿으로 메우지 말고 `warnings[]` + **해당 면 미개방**.
- 결손은 Evidence Status와 DD 목록으로 갑니다(07 §16.3).

🔴 D33 BL-F에서 「폴백을 더 정교하게 만들지 마십시오」라고 했는데
   V4는 `generatePremiumTemplate`을 유지했고 6·9·11면에 같은 문단이 나왔습니다.
   **제거가 개선입니다.**

### P0-7 · 절삭 폐기

**대상** `deck-sequencer.ts` §3.3

```ts
const PAGE_HARD_LIMIT = 16;      // 🔴 20 → 16 (D33 S-2 · 상수는 아직 20)
// 🔴 "앞 N면 유지" 를 삭제합니다.
if (body.length > PAGE_HARD_LIMIT) {
  throw new BuildStopped('B13', { pages: body.length, detail: moveToAppendix(body) });
}
```

초과분은 자르는 것이 아니라 **부록으로 보냅니다**(P1-1).
그래도 초과하면 **빌드 중단**입니다(07 §16.2).

### P0-8 · 게이트를 실행 경로에 연결

**대상** D33 BL-A — V5에서도 미이행

`G31~G47` + `B01~B13`이 목록이 아니라 **렌더 후 산출물 검사**로 돌아야 합니다.

```ts
// Step 5: 산출물 검증 (신설)
const report = inspectArtifact(buffer);   // 파일을 열어 도형·표·텍스트를 봅니다
if (report.blocking.length) throw new GateBlocked(report);
```

**수용** 선언된 게이트 중 미연결 **0개**(D34 `T2-GATE-01`).

---

## 2. P1 — 제품

### P1-1 · 본문 / 부록 이원화

```
본문   12~16면   면 번호 1..N      절삭 금지 · 초과 시 빌드 중단
부록   무제한    면 번호 A-1..A-M  렌트롤 전량 · 계약 주요조건 · 비교사례 원장 · 공부 발췌
```

- `SlideSpec`에 `section: 'body'|'appendix'` 추가
- `standard_check` §3.1은 **본문만** 셉니다
- 불변조건 18(렌트롤 전량)은 **부록에서** 충족됩니다
  → 정본 상한과 전량 표기가 **처음으로 양립**합니다(D36 §2.2)

### P1-2 · 🔴 토지거래허가 조회 — 10번째 공공 API

**신설** `src/lib/external/land-transaction-permit.ts`

2025년 10월 20일자로 서울 25개 자치구 전역이 토지거래허가구역으로 지정되어
2026년 12월 31일까지 유지되도록 설정돼 있습니다. 도시지역 기준면적은
상업·공업지역 150㎡가 기준이며 지정권자가 10~300% 범위에서 따로 정할 수 있고,
서울 2025.10 지정은 주거지역을 6㎡로 낮췄습니다.

```ts
type PermitZoneResult = {
  isPermitZone: boolean;
  thresholdSqm: number | null;     // 관할 자치구 고시 기준면적
  landSqm: number;
  permitRequired: boolean | null;  // 🔴 null 허용 — 단정하지 않습니다
  designatedUntil: string | null;
  source: 'seoul_land_portal' | 'eum_gosi';
  asOf: string;                    // 🔴 조회 시점 필수 — 수시 변경됩니다
};
```

- 표시: `Property & Public Records` + `Risks & Unknowns` + `DD & LOI Conditions`
- 문구: **「해당 여부 · 기준면적 · 관할 구청 확인 필요」**만. 허가 가능 여부는
  단정하지 않습니다(07 §2.3).
- 이용의무기간 미이행 시 취득가액의 10% 이내에서 매년 이행강제금이 부과되므로,
  **DD 조건에 「허가 목적 및 이용의무 확인」을 필수 항목으로** 넣습니다.
- 게이트 `B14` — 서울 소재 물건인데 이 항목이 미표시면 발행 차단

> 🔴 값을 코드에 박지 마십시오. 고시는 자치구별로 수시 변경됩니다.
>   `asOf`와 함께 저장하고, 90일 경과 시 `stale`로 표시합니다.

### P1-3 · 환산보증금 파생 필드

**대상** `financials.ts` · 렌트롤 정규화

서울 기준 환산보증금 9억 원(= 보증금 + 월세 × 100)이 상가임대차보호법 적용
경계입니다. 초과하더라도 대항력·10년 갱신요구권·권리금 회수보호·3기 연체 해지는
동일하게 적용되고, 갈리는 것은 임대료 인상률 5% 상한·우선변제권·확정일자 등입니다.

```ts
row.convertedDeposit = row.deposit + row.monthlyRent * 100;
row.slaApplicable    = row.convertedDeposit <= REGION_THRESHOLD[region];  // 서울 9억
```

- Market Rent Gap 면에서 **5% 상한 적용 행과 미적용 행을 분리**합니다.
- 상한 적용 행에 「인상률 상한 검토 필요」 확인사항 자동 생성.
- 🔴 V4 표본 9면에 이미 「11개 호실 전원 환산보증금 9억 이하」가 있습니다 —
  **시스템이 이 개념을 다루면서 스키마에는 없습니다.** 문장에서 스키마로 올립니다.

### P1-4 · Action Card 10칸

**신설** `src/domain/building/mobile-im/action-card.ts`

```ts
type ActionCard = {
  targetUnits: string[];      currentState: string;    action: string;
  prerequisites: string[];    estimatedMonths: number; rentDelta?: number;
  cost?: { amount: number; source: 'seller_quote'|'contractor_quote'|'assumption' };
  noiDelta?: number;          risks: string[];         evidence: EvidenceRef[];
  ideaOnly: boolean;          // 🔴 true 면 금액효과 필드를 렌더하지 않습니다
};
```

- `ideaOnly=true`(구조변경·증축·용도변경·대규모 설비·방수/구조/소방)에
  `rentDelta`·`noiDelta`가 있으면 **차단**.
- 권리금 회수기회 관련 위험을 `risks`에 필수 포함(D36 §3.3).

### P1-5 · 중개인 의견 구조화 입력

07 §13.1의 8필드를 바텀시트 폼으로. **자유서술 필드를 없앱니다.**
구조화되지 않은 의견은 LLM에 들어가지 않습니다.

### P1-6 · 승인 게이트 `H-B01~H-B06`

`approval.*` 네임스페이스로 분리(기계 게이트와 층이 다름).
승인 전 Claim은 `approvedBy` 없음 → 렌더 시 **Draft 워터마크**.

### P1-7 · 사진 결속 · 제3자 워터마크 (D33 BL-B 미이행)

- `resolvePhotos()`에 `buildingId` 일치 필수
- 워터마크·로고 포함 이미지는 **업로드 시점에 사람이 거부**
- 사진 3매 미만 → `G26` 차단 · 갤러리 면 미개방
- V4 표본에서 신규 6장 전량이 물건 미확인이고 3장에 제3자 매체 워터마크가 있었습니다

### P1-8 · 지도 플레이스홀더 제거 (D33 BL-E 미이행)

`03 §5.1` 3차 「OSM 타일 합성 플레이스홀더」를 **삭제**합니다.
1·2차 실패 시 곧바로 면 미개방 + DD 목록 이관.

---

## 3. P2 — 안정성

| # | 무엇 |
|---|---|
| P2-1 | **멱등 단언** — 같은 입력 2회 렌더 시 구조·수치·게이트 판정 동일. 모델 버전 고정 |
| P2-2 | **골든셋 자동 등록 중단** — `≥4.5 → Few-shot 자동 승격`을 사람 승인으로. 심사 LLM 취향의 되먹임을 끊습니다 |
| P2-3 | **`G41`·`G44`를 산출물 검사로** — 프롬프트 맥락 전파·수리 함수는 방지책이지 게이트가 아닙니다(D35 §4.3) |
| P2-4 | **네임스페이스 흡수** — 07의 5축(B0~EX · S1~S5 · B01~B12 · H-B · C1~C3)을 기존 체계로 매핑. **신설 0개** |
| P2-5 | 스테일 코드 정리 — `C19`·`QG18`·`QG19`·`QG21` 및 D35가 잡은 `G17`·`G28` 오용 |
| P2-6 | income 아키타입 개수를 **한 곳**에서 정의 (현재 5중 불일치) |
| P2-7 | 위반건축물·VAT/포괄양수도·관리비 정산구조·정비구역 필드 신설 (D36 §3.4~§3.7) |

---

## 4. 착수 순서

```
1주차   P0-1 Claim 스키마 · P0-2 계산 엔진 분리
        └ 이 둘이 나머지 전부의 전제입니다
2주차   P0-3 발행 등급 2축 · P0-4 DataAvailability 실값
3주차   P0-5 충돌 객체 · P0-6 폴백 제거 · P0-7 절삭 폐기
4주차   P0-8 게이트 실행 연결 · P1-1 본문/부록 이원화
5주차   P1-2 토지거래허가 · P1-3 환산보증금
6주차   P1-4~P1-8
7주차~  P2
```

**P0-6(폴백 제거)을 3주차에 두는 이유** — 앞선 항목들이 끝나기 전에 폴백을 없애면
산출물이 대량 실패합니다. 그 실패가 **정상**입니다. 지금은 실패가 폴백에 흡수되어
보이지 않을 뿐입니다. 다만 실패를 볼 준비(등급 2축·충돌 객체)가 먼저 필요합니다.

---

## 5. 수용 기준

1. 슬라이드의 모든 수치가 `Claim.id`로 역추적 — 문자열 직접 렌더 **0건**
2. LLM 출력에서 새로 생긴 숫자 **0건** (Claim 미참조 수치 차단)
3. 미해결 `Conflict` 상태로 발행 **0건**
4. `hasRentRoll=false` income → `fact_om` 전환 (분석형 발행 0건)
5. `hasOpex=false` → 「NOI」·「순수익률」 문자열 **0건**
6. 폴백 발동 **0건** — `addFallbackContent` 코드 삭제 확인
7. 절삭 발동 **0건** — 초과 시 부록 이동 또는 빌드 중단
8. 선언 게이트 중 미연결 **0개**
9. 서울 소재 물건 전량에 **토지거래허가 해당 여부** 표시
10. 렌트롤 행별 **환산보증금·상임법 적용 여부** 표시
11. `layout_check` · `standard_check` 위반 **0** (본문·부록 모두)
12. 같은 입력 2회 → 구조·수치·게이트 판정 동일
13. 네임스페이스 신설 **0개**

---

## 6. 하지 말 것

- **P0을 건너뛰고 P1 기능부터 만들지 마십시오.** Claim 스키마 없이 토지거래허가를
  붙이면 그 값도 문장 안에서 떠돌게 됩니다.
- **폴백을 개선하지 말고 제거하십시오.** 세 판 연속으로 「더 그럴듯한 폴백」이
  나왔고 그때마다 결손이 더 잘 숨었습니다.
- **면수를 늘려 해결하지 마십시오.** 부록으로 분리합니다.
- **토지거래허가·환산보증금·권리금을 법률 결론으로 렌더하지 마십시오.**
  「해당 / 미해당 / 확인 필요」 세 상태만 표시하고 판단은 남깁니다.
  이것은 07 §2.3의 원칙이자 공인중개사의 업무 범위입니다.
- **새 게이트 네임스페이스를 만들지 마십시오.** 이미 여섯 개입니다.
- 마스킹 자동화는 **DEC-IMG-01**로 대상이 아닙니다 — 승인 레코드는 유지합니다.

---

## 부록 A — 한 문장

> 현행: LLM이 쓰고 렌더러가 그립니다.
> 목표: **사람이 승인하고 엔진이 계산하고 LLM이 설명합니다.**
> 이 순서를 바꾸는 것이 P0 전체입니다.

---

**Sources**

- [서울 전역·경기 12곳 투기과열지구·토지거래허가구역 지정 · 대한민국 정책브리핑](https://www.korea.kr/news/policyNewsView.do?newsId=148950973)
- [토지거래허가 제도 안내 · 서울부동산정보광장](https://land.seoul.go.kr/land/other/contractGuide.do)
- [토지거래허가구역 지정현황 · 서울부동산정보광장](https://land.seoul.go.kr/land/other/appointStatusSeoul.do)
- [상가건물 임대차보호법의 적용 · 찾기쉬운 생활법령정보](https://easylaw.go.kr/CSP/CnpClsMain.laf?popMenu=ov&csmSeq=627&ccfNo=1&cciNo=2&cnpClsNo=1)
- [상가임대차보호법 환산보증금 계산법](https://jclpartnerslaw.com/bbs/board.php?bo_table=case&wr_id=538)
