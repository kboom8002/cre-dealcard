# D37 P1+P2 — 제품 · 안정성 구현 계획 v2 (감사 반영)

> **선행** D37 P0 v2 전량 완료
> **착수** 5주차 P1-1~P1-3 → 6주차 P1-4~P1-8 → 7주차~ P2
> **금지** P0을 건너뛰고 P1부터 만들지 마십시오 (D37 §6)

> [!IMPORTANT]
> **v2 변경점 (v1 감사 결과 반영)**
> 1. 🔴 D36 §4.2 income 15면 중 **신설 5면**(decision_snapshot, evidence_status, rentGap, valueAddPlan, stabilizedScenario) 구현 계획 상세화
> 2. 🔴 07 §9.1 `development_screening` 명칭 + 경고문 요건 P1 반영
> 3. 🔴 `Evidence Status` 면 신설 (Claim.status 기반 자료 완비 현황)
> 4. 🟡 D36 §3.7 기타 5항목(정비구역, 제소전화해, 소방, 자금조달계획서, 중개보수) 전량 반영
> 5. 🟡 07 §2.4 8종 책임 표시 `displayLabel` 매핑 상세화
> 6. 🟡 07 §0.2 `06` 문서 의존 처리 방침 정의
> 7. 🟡 STAGE_PLANS 확장의 P1 영향 반영
> 8. 🟡 권리금 전용 Claim 신설

---

## Phase 1 — 제품 (8건)

---

### P1-1 · 본문 / 부록 이원화 + 신설 5면 기반 (5주차)

> P0-7 body/appendix 기반 + P0-3 15면 매핑 위에 구축

#### v2 추가: STAGE_PLANS 확장

```typescript
// income STAGE_PLANS v2 — D36 §4.2 15면 반영
income: [
  { stage: 0, sections: ['financial_calculation'], parallel: false },  // P0-2 신설
  { stage: 1, sections: [
    'cover', 'decision_snapshot', 'property_public_records',
    'gallery', 'location_rental_market'
  ], parallel: true },
  { stage: 2, sections: [
    'rent_roll_summary', 'lease_expiry_vacancy', 'current_income'
  ], parallel: false, dependsOn: ['askingPriceKrw', 'rentTotal'] },
  { stage: 3, sections: [
    'market_rent_gap', 'value_add_plan', 'stabilized_scenario'
  ], parallel: false },  // BG 전용면 — tier에 따라 조건부
  { stage: 4, sections: [
    'price_position', 'risks_unknowns'
  ], parallel: false },
  { stage: 5, sections: [
    'dd_loi_conditions'
  ], parallel: false },
],
```

#### v2 추가: 신설 아키타입 5종

| 면 | dataKey | 아키타입 | 출처 |
|---|---|---|---|
| Broker Decision Snapshot | `decision_snapshot` | **[NEW]** `a20-decision-snapshot.ts` | 07 §5.1 — 핵심 판단 3문장 + 근거 |
| Evidence Status | `evidence_status` | **[NEW]** `a21-evidence-status.ts` | 07 §4.2 — Claim.status 현황 표 |
| Market Rent Gap | `rentGap` | **[NEW]** `a22-rent-gap.ts` | 07 §11 — 시장임대료 vs 계약임대료 |
| Broker Value-add Plan | `valueAddPlan` | **[NEW]** `a23-value-add.ts` | 07 §7.6 — Action Card 렌더 |
| Stabilized Scenario | `stabilizedScenario` | **[NEW]** `a24-stabilized.ts` | 07 §7.5 — Base/Upside/Downside |

#### v2 추가: Evidence Status 면 상세

```
Claim.status 분포를 시각화:
  ✅ broker_checked (N건)
  ✅ reconciled (N건)
  ⚠️ unverified (N건) — 확인 필요 목록
  🔴 conflicted (N건) — 미해결 충돌
  ⊘ not_available (N건) — 미수집 자료

tier 판정 근거:
  "현 자료 상태로 analysis_im 등급입니다.
   decision_im으로 승격하려면 다음이 필요합니다: [목록]"
```

### 수용 기준

- [ ] STAGE_PLANS가 15면 구조 반영
- [ ] 신설 5면 아키타입 렌더 가능
- [ ] Evidence Status가 Claim.status 실시간 집계

---

### P1-2 · 🔴 토지거래허가 조회 — 10번째 공공 API (5주차)

#### v2 보강: D36 §3.1 `permit_use_obligation` 필드 추가

```typescript
type PermitZoneResult = {
  isPermitZone: boolean;
  thresholdSqm: number | null;
  landSqm: number;
  permitRequired: boolean | null;     // null = 단정 금지
  designatedUntil: string | null;
  permitUseObligation: string | null; // 🔴 v2 추가: 이용의무기간·허가 목적
  source: 'seoul_land_portal' | 'eum_gosi';
  asOf: string;
};
```

#### v2 보강: Claim 연결

```
PermitZoneResult → ClaimRegistry.register({
  subject: 'land_transaction_permit',
  value: result.isPermitZone,
  evidence: [{ sourceId: 'public_api', documentRef: result.source, asOf: result.asOf }],
  provenance: 'public_api',
  displayLabel: '공부 확인',  // 07 §2.4 S2a
  status: result.asOf > 90일 ? 'stale' : 'broker_checked',
})
```

나머지 v1 내용 유지.

---

### P1-3 · 환산보증금 파생 필드 (5주차)

#### v2 보강: REGION_THRESHOLD SSOT 관리

```yaml
# credeal/ssot/im.legal-thresholds.yaml (신설)
commercial_lease_act:
  converted_deposit_threshold:
    서울: 900_000_000
    수도권과밀억제: 690_000_000
    광역시: 540_000_000
    기타: 370_000_000
  effective_date: '2024-01-01'
  source: '상가건물 임대차보호법 시행령 제2조'
  note: '대통령령에 따라 변경 시 이 파일을 갱신'
```

> [!CAUTION]
> `REGION_THRESHOLD`를 코드에 하드코딩하지 마십시오 (AGENTS.md §8 임계값 하드코딩 금지).
> SSOT YAML에서 읽습니다.

나머지 v1 내용 유지.

---

### P1-4 · Action Card 10칸 (6주차)

#### v2 보강: 권리금 전용 Claim 신설

```typescript
// 07 §7.5 + D36 §3.3: Action Card risks에 권리금 필수
type ActionCard = {
  ...v1과 동일...
  // v2 추가
  premiumRiskClaim?: string;  // 권리금 회수기회 관련 Claim ID
};

// 게이트: Action Card에 기존 임차인 이동이 포함되는데
//         premiumRiskClaim이 없으면 → 경고 (차단은 아님)
```

나머지 v1 내용 유지.

---

### P1-5 · 중개인 의견 구조화 입력 (6주차)

#### v2 보강: 07 §2.4 8종 책임 표시 displayLabel 매핑

> D36 §4.3: 외부 표기 문자열로 채택, 내부는 ProvenanceKind 유지

| 07 §2.4 책임 표시 | 외부 displayLabel | 내부 ProvenanceKind |
|---|---|---|
| 공부 | `✓ 공부 확인` | `registry` |
| 계약서 | `✓ 계약서 확인` | `ledger` |
| 매도인 고지 | `▲ 매도인 고지` | `seller` |
| 현장 확인 | `● 중개인 현장확인` | `broker` |
| 시장 의견 | `● 중개인 시장의견` | `broker` |
| 계산값 | `= 계산값` | `derived` |
| 분석가정 | `◇ 분석가정` | `assumed` |
| 미확인 | `? 미확인` | — (`Claim.status='not_available'`) |

#### [MODIFY] `Claim.displayLabel` — 렌더 시 위 표의 문자열 사용

나머지 v1 내용 유지.

---

### P1-6 · 승인 게이트 `approval.*` (6주차)

#### v2 보강: 07 §0.2 / D36 §2.7 — 06 문서 의존 처리

> D36 §2.7: 06 문서가 레포에 없어 승격 조건(부록 C) 검증 불가

```
처리 방침:
  1. 승격 조건(BG → Full Advisory)은 06이 작성될 때까지 코드에 넣지 않음
  2. approval.final_release가 BG까지만 커버
  3. 06 미작성 상태를 Evidence Status 면에 표시:
     "Full Advisory 승격 조건은 06번 사양 완성 후 적용 예정"
```

나머지 v1 내용 유지.

---

### P1-7 · 사진 결속 · 제3자 워터마크 (6주차)

변경 없음 (v1 유지)

---

### P1-8 · 지도 플레이스홀더 제거 (6주차)

변경 없음 (v1 유지)

---

## Phase 2 — 안정성 (7건)

---

### P2-1 · 멱등 단언 (7주차)

#### v2 보강: temperature 정밀화

```
현행: im-section-generator.ts L280에서 temperature: 0.3
개선: temperature: 0 + seed 고정
     → Claim 수치는 결정론적이므로 항상 동일
     → LLM 설명 문장은 seed 고정으로 최대한 일치
     → 멱등 단언 대상: Claim 값 + 면 구성(dataKey 배열) + 게이트 판정
     → 비단언 대상: LLM 설명 문장 내용
```

---

### P2-2 · 골든셋 자동 등록 중단 (7주차)

변경 없음 (v1 유지, V5에서 `auto_candidate` + `is_active: false` 구현 완료)

---

### P2-3 · G41·G44를 산출물 검사로 (7주차)

변경 없음 (v1 유지)

---

### P2-4 · 네임스페이스 흡수 (7주차)

#### v2 보강: ProvenanceKind 이중 정의 해소

```
현행:
  imlib.ts L216~225: ProvenanceKind 9종
  ontology/provenance.ts: ProvenanceTier 10종 + SourceTier 6종

개선:
  ontology/provenance.ts를 유일 정본으로
  imlib.ts는 re-export: export { ProvenanceTier as ProvenanceKind } from '@/domain/ontology'
  'public_api_identified' 추가 (D36 §4.3 S2b)
  'public' 레거시 → 마이그레이션 후 삭제
```

#### v2 보강: 07 게이트 → 기존 체계 정밀 매핑

| 07 게이트 | 현행 매핑 | 설명 |
|---|---|---|
| B01 | → G01 | 필수 필드 완전성 |
| B02 | → G05 | 교차 검증 |
| B03 | → **G48 (신설)** | 미해결 Conflict 차단 |
| B04 | → **G49 (신설)** | 증거 없는 Claim 차단 |
| B05 | → G28/G38 | 합계·단위·basis 불일치 |
| B06 | → G41 | 서술어 모순 |
| B07 | → G42 | 반복 문단 |
| B08 | → G26 | 사진 최소 매수 |
| B09 | → **G50 (신설)** | 기준일 미표시 |
| B10 | → G31~G36 | 지면 물리 6종 |
| B11 | → **G51 (신설)** | 계산식 재현 불가 |
| B12 | → G44 | 형식 오류 (괄호 등) |
| B13 | → **G52 (신설)** | 면수 초과 빌드 중단 |
| B14 | → **G53 (신설)** | 토지거래허가 미표시 |

나머지 v1 내용 유지.

---

### P2-5 · 스테일 코드 정리 (7주차)

변경 없음 (v1 유지)

---

### P2-6 · income 아키타입 단일 정의 (7주차)

변경 없음 (v1 유지)

---

### P2-7 · 한국법 필드 신설 (7주차)

#### v2 보강: D36 §3.7 기타 5항목 전량 반영

| # | 항목 | 타입 | 면 | v1 | v2 |
|:---:|---|---|---|:---:|:---:|
| 1 | 정비구역 지정 여부 | `boolean` | Public Records | ✅ | ✅ |
| 2 | 제소전화해 조서 | `boolean \| null` | Rent Roll 부록 | ❌ | 🔴 **추가** |
| 3 | 소방 완비증명 · 정화조 용량 | `string \| null` | Risks & DD | ❌ | 🔴 **추가** |
| 4 | 자금조달계획서 제출 대상 | `boolean` | DD & LOI | ❌ | 🔴 **추가** |
| 5 | 중개보수 요율 | `number` | Price Position | ❌ | 🔴 **추가** |

#### v2: 전체 신설 필드 목록 (12개)

```typescript
// P2-7 신설 필드 전체 (v1 7개 + v2 5개)
interface KoreanLegalFields {
  // v1 (D36 §3.4~§3.6)
  violation_registered: boolean;
  violation_detail: string | null;
  transaction_structure: '일반과세' | '포괄양수도' | '미정';
  mgmt_fee_structure: '실비정산' | '정액' | '혼합';
  redevelopment_zone: boolean;
  fund_source_report_required: boolean;  // v1에서 v2로 이동
  brokerage_fee_rate: number;             // v1에서 v2로 이동

  // v2 추가 (D36 §3.7)
  pretrial_reconciliation: boolean | null;    // 제소전화해 조서
  fire_safety_certificate: string | null;     // 소방 완비증명
  septic_tank_capacity: string | null;        // 정화조 용량 (근생 업종 변경 범위)
}
```

---

## v2 전체 수용 기준 (v1 13개 + v2 추가 5개 = 18개)

| # | 기준 | 출처 | v2 |
|:---:|---|---|:---:|
| 1 | 슬라이드 모든 수치가 `Claim.id`로 역추적 | D37 §5.1 | — |
| 2 | LLM 출력 새 숫자 **0건** | D37 §5.2 | — |
| 3 | 미해결 `Conflict` 발행 **0건** | D37 §5.3 | — |
| 4 | `hasRentRoll=false` income → `fact_om` | D37 §5.4 | — |
| 5 | `hasOpex=false` → NOI·순수익률 **0건** | D37 §5.5 | — |
| 6 | 폴백 발동 **0건** (**4경로** 전량 삭제) | D37 §5.6 | 🔴 |
| 7 | 절삭 발동 **0건** | D37 §5.7 | — |
| 8 | 선언 게이트 미연결 **0개** | D37 §5.8 | — |
| 9 | 서울 물건 토지거래허가 표시 | D36 §3.1 | — |
| 10 | 렌트롤 행별 환산보증금 표시 | D36 §3.2 | — |
| 11 | `layout_check` 위반 **0** | D37 §5.11 | — |
| 12 | 멱등: 구조·수치·판정 동일 | D37 §5.12 | — |
| 13 | 네임스페이스 신설 **0개** | D37 §5.13 | — |
| **14** | **gateCtx 하드코딩 필드 0개** | 감사 §7 | 🔴 |
| **15** | **development → Screening 명칭 + 경고문** | D36 §1.9 | 🔴 |
| **16** | **Claim.status='not_available' → 사유 구체 표시 (나쁜 예 0건)** | D36 §1.5 | 🔴 |
| **17** | **Evidence Status 면이 Claim 현황 실시간 집계** | D36 §4.2#3 | 🔴 |
| **18** | **8종 책임 표시 displayLabel 전량 적용** | D36 §4.3 | 🟡 |

---

## 하지 말 것 (v2 추가)

> [!WARNING]
> v1 금지사항 유지 +
> - **gateCtx에 상수를 넣지 마십시오.** 게이트가 장식이 됩니다.
> - **development를 Feasibility로 부르지 마십시오.** Screening입니다 (07 §9.1).
> - **Claim.value=null을 「추후 확인이 필요합니다」로 메우지 마십시오.** 결손의 원인을 적어야 합니다 (D36 §1.5).
> - **ProvenanceKind를 두 곳에 정의하지 마십시오.** `ontology/provenance.ts` 단일 정본.
