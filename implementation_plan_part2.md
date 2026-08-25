# 구현 계획서 Part 2 — S2 포스처 확정 + S3 입력 완성 (18.0일)

> **선행**: S0 완료 (시간 확보), S1-1 완료 (PostureContract 타입)
>
> 이 문서는 `WORK_ORDER.md` S2(6.0일) + S3(12.0일)의 정밀 구현 명세입니다.

---

## S2 · 포스처 확정 (6.0일)

> 🔴 **62건 전부 income인 것은 `im-data-bottom-sheet.tsx` L71의 기본값 때문입니다.**

### S2-1 · 메모 추출을 제안으로 강등 (1.5일)

#### [MODIFY] [broker-deal-card.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/broker-deal-card.ts)

`brokerDealCardFromMemo()` 내부에서 포스처를 확정하지 않고 **제안+신뢰도**로 반환:

```typescript
// 변경 전: 추출된 포스처를 직접 저장
// 변경 후: 제안 객체로 래핑
interface PostureProposal {
  value: InvestmentPosture | null;
  confidence: number;        // 0~1
  reason: string;             // "메모에 '개발' 키워드 3회, '용적률' 1회 언급"
  confirmedBy: string | null; // 중개인 확정 전까지 null
  confirmedAt: Date | null;
}
```

#### [MODIFY] [memo-slot-mapper.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/memo-slot-mapper.ts)

포스처 관련 키워드 추출 시 신뢰도 산출:
- 키워드 2개 이상 + 수치 데이터 일치 → 0.8+
- 키워드 1개 → 0.4~0.6
- 키워드 없음 → confidence: 0, value: null

---

### S2-2 · 포스처 확정 UI + 기본값 제거 (2.0일)

#### [MODIFY] [im-data-bottom-sheet.tsx](file:///c:/Users/User/cre-dealcard/src/app/%28broker%29/broker/deal-card/[id]/im-data-bottom-sheet.tsx)

**변경 지점 ① — L71 기본값 제거**:

```diff
  // Line 71: Props 디스트럭처링
- initialInvestmentPosture = "income",
+ initialInvestmentPosture,  // 기본값 없음 — 중개인 필수 선택
```

**변경 지점 ② — L200~230 유효성 검사 확장**:

```diff
  // computedMissingFields useMemo 내부
+ // 포스처 미선택 시 최우선 결손
+ if (!investmentPosture) {
+   missing.push('investmentPosture');
+   return missing; // 포스처 없으면 다른 검증 불필요
+ }
  switch (investmentPosture) {
    case 'income':
```

**변경 지점 ③ — L700~729 포스처 선택 UI 강화**:

현재 5개 그리드 버튼(`grid-cols-5`)을 유지하되, 제안 신뢰도 배지를 추가:

```tsx
{postureProposal && postureProposal.confidence >= 0.7 && (
  <div className="mb-2 p-2 bg-blue-50 rounded-lg text-xs text-blue-700">
    <span className="font-semibold">AI 추천:</span> {postureProposal.reason}
    <button onClick={() => setInvestmentPosture(postureProposal.value!)}
      className="ml-2 px-2 py-0.5 bg-blue-600 text-white rounded">
      수락
    </button>
  </div>
)}
```

#### [MODIFY] [section-catalog.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/section-catalog.ts) — L54~56

```diff
- export function getSectionPlan(posture?: InvestmentPosture): SectionPlan {
-   return SECTION_CATALOG[posture ?? 'income'];
- }
+ export function getSectionPlan(posture: InvestmentPosture): SectionPlan {
+   return SECTION_CATALOG[posture];
+ }
```

이 변경으로 `posture`가 `undefined`인 상태에서 호출하면 **타입 에러**가 발생하여 기본값 의존 코드를 전부 잡아냅니다.

---

### S2-3 · 조합 매트릭스 검증 (1.0일)

#### [MODIFY] [constraint-validator.ts](file:///c:/Users/User/cre-dealcard/src/domain/asset/constraint-validator.ts)

`CATALOG_ASSET_TYPES.md` §4의 17×5 조합 매트릭스를 기존 `validateCombination()` (`asset-identity.ts` L107~126)과 통합:

```typescript
// 차단(block) 5건 — 물리적/법적으로 불가능
const BLOCKED: [AssetType, InvestmentPosture][] = [
  ['bare_land', 'income'],           // 임대차 부존재
  ['multi_household', 'owner_occupied'], // 원룸 사옥 불가
  ['hotel', 'owner_occupied'],       // 호텔 자가사용 불가
  ['officetel', 'development'],      // 구분소유 전원 동의 불가
  ['medical_facility', 'trading'],   // 인허가 승계 제약
];

// 경고(caution) — △ 확인 필요
const CAUTIONED: [AssetType, InvestmentPosture, string][] = [
  ['serviced_residence', 'income', '생활형숙박시설 용도적법성 확인 필요'],
  ['factory_building', 'owner_occupied', '근로기준법 작업환경 확인 필요'],
  // ...
];
```

---

### S2-4 · 이력 기록 (0.5일) + S2-5 · 재생성 경로 (1.0일)

#### [NEW] DB: `posture_decisions` 테이블

```sql
CREATE TABLE posture_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,
  proposed_posture TEXT,
  proposed_confidence NUMERIC(3,2),
  proposed_reason TEXT,
  confirmed_posture TEXT NOT NULL,
  confirmed_by TEXT NOT NULL,
  changed_from TEXT,        -- 포스처 변경 시 이전 포스처
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### [MODIFY] [generate-async/route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/im-lite/generate-async/route.ts)

포스처 변경 감지 시: 기존 `IMDoc` 캐시 무효화 → 섹션 편성 재계산 → 등급 재산정.
기존 `lease_ledger` 입력값은 보존하고 새 포스처 결손 슬롯만 안내.

---

## S3 · 입력 완성 (12.0일)

> 🔴 `im-data-bottom-sheet.tsx`는 **108KB/2,060줄** 단일 파일.
> 6종 조건부 섹션 추가 전에 모듈 분할이 선행되어야 합니다.

### 선행 · 바텀시트 모듈 분할 (2.0일)

현재 6개 조건부 섹션이 이미 존재합니다 (L354~435):
1. **물류** (L1433~1637) — `assetType`에 '물류' 포함
2. **숙박** (L1084~1136) — `hotel/resort/motel` 등
3. **개발** (L1640~1763) — `posture === 'development'`
4. **사옥** (L1766~1816) — `posture === 'owner_occupied'`
5. **구분소유** (L1819~1874) — `officetel/knowledge_center` 등
6. **주거** (L1877~1928) — `multi_household/multi_family` 등

#### 분할 구조

```
src/app/(broker)/broker/deal-card/[id]/im-data-bottom-sheet/
├── index.tsx                         ← 메인 (탭 라우팅 + handleCreate)
├── BasicInfoSection.tsx              ← L641~810 (주소/PNU/기본정보)
├── FinancialSection.tsx              ← L821~1030 (재무/대출/비임대수입)
├── PostureSelector.tsx               ← L700~729 (5종 선택 + 제안 배지)
├── PhotoSection.tsx                  ← L1262~1430 (12장 업로드)
├── LogisticsSection.tsx              ← L1433~1637 (기존, 추출)
├── HospitalitySection.tsx            ← L1084~1136 (기존, 추출)
├── DevelopmentSection.tsx            ← L1640~1763 (기존, 추출)
├── OwnerOccupiedSection.tsx          ← L1766~1816 (기존, 추출)
├── SectionalSpecSection.tsx          ← L1819~1874 (기존 확장, S3-2)
├── ResidentialSpecSection.tsx        ← L1877~1928 (기존 확장, S3-3)
├── ParcelSection.tsx                 ← 신규 (S3-1)
├── HoldingHistorySection.tsx         ← 신규 (S3-4)
├── OperatingPerfSection.tsx          ← 신규 (S3-5)
└── hooks/
    ├── useBottomSheetState.ts        ← 공통 상태 (L77~L196)
    ├── useAddressSearch.ts           ← L592~637 (주소 검색)
    ├── usePhotoUpload.ts             ← L331~350 (사진 업로드)
    └── useFormValidation.ts          ← L200~230 (computedMissingFields)
```

---

### S3-1 · 필지·제척 입력란 (2.0일)

#### [NEW] [ParcelSection.tsx](file:///c:/Users/User/cre-dealcard/src/app/%28broker%29/broker/deal-card/[id]/im-data-bottom-sheet/ParcelSection.tsx)

기존 `parcel.ts` (`src/domain/ontology/rules/parcel.ts`)의 P01~P03 산출 로직을 UI와 연결:

```typescript
// 필지 입력 폼 상태
interface ParcelInput {
  pnu: string;           // 19자리
  jimok: Jimok;          // 28종 법정 지목
  ledgerAreaM2: number;  // 대장면적
  shareRatio: number;    // 지분율 (기본 1.0)
  officialLandPrice: number; // 공시지가
  exclusions: Array<{
    kind: ExclusionKind;   // 7종 제척사유
    areaM2: number;
    affectsFAR: boolean;
  }>;
}

// 자동 산출 (P01)
const effectiveLandArea = parcels.reduce((sum, p) => 
  sum + (p.ledgerAreaM2 * p.shareRatio) - 
  p.exclusions.filter(e => e.affectsFAR).reduce((s, e) => s + e.areaM2, 0)
, 0);

// X05 교차검증 — 즉시 피드백
const x05Result = Math.abs(sumParcels - ledgerTotal) / ledgerTotal;
if (x05Result > 0.005) {
  // ±0.5% 초과 → 빨간 경고 + 저장 차단
}
```

---

### S3-2 · `sectional_spec` 확장 + C30 즉시 검증 (2.5일)

#### [MODIFY] [SectionalSpecSection.tsx](file:///c:/Users/User/cre-dealcard/src/app/%28broker%29/broker/deal-card/[id]/im-data-bottom-sheet/SectionalSpecSection.tsx)

기존 L1819~1874의 4개 필드(구분소유자수, 토지지분율, 관리단, 마스터리스)를 확장:

```typescript
// 기존 → 확장
interface SectionalUnit {
  unitLabel: string;            // 호실명
  landShareRatio: number;       // 대지지분 비율
  jointCollateralGroup?: string; // 공동담보 그룹명
}

// C30: 대지지분 합계 즉시 검증
const landShareSum = units.reduce((s, u) => s + u.landShareRatio, 0);
const c30Valid = Math.abs(landShareSum - 1.0) < 0.001;

// C32: 공동담보 중복합산 방지
const groupTotals = new Map<string, number>();
units.forEach(u => {
  if (u.jointCollateralGroup) {
    const current = groupTotals.get(u.jointCollateralGroup) ?? 0;
    groupTotals.set(u.jointCollateralGroup, current + u.lienKrw);
  }
});
// 같은 그룹의 채권최고액은 1회만 합산 (BROKER_WORKSPACE_SPEC §5.4)
```

---

### S3-3 · `residential_spec` 확장 + C29 (1.5일)

#### [MODIFY] [ResidentialSpecSection.tsx](file:///c:/Users/User/cre-dealcard/src/app/%28broker%29/broker/deal-card/[id]/im-data-bottom-sheet/ResidentialSpecSection.tsx)

기존 L1877~1928의 4개 필드 확장:

```typescript
interface ResidentialSpecInput {
  totalUnits: number;
  jeonseUnits: number;         // 전세 세대수
  jeonseDepositTotalKrw: number;
  illegalRegistered: boolean;  // 🔴 위반건축물 대장 등재 여부
  illegalExtension: boolean;   // 기존 필드 유지
}

// C29: 위반건축물 등재 시 매수자 대출 차단 경고
if (input.illegalRegistered) {
  addWarning('C29', '위반건축물 대장에 등재된 건물입니다. 매수자 대출이 차단될 수 있습니다.');
}
```

---

### S3-4 · `holding_history` 입력 (1.5일)

#### [NEW] [HoldingHistorySection.tsx](file:///c:/Users/User/cre-dealcard/src/app/%28broker%29/broker/deal-card/[id]/im-data-bottom-sheet/HoldingHistorySection.tsx)

**조건부 활성화**: `investmentPosture === 'trading'`

```typescript
interface HoldingHistoryInput {
  acquisitionDate: Date | null;
  acquisitionPriceKrw: number;
  holdingMonths: number;
  transferCountIn10Y: number;   // 10년 내 이전 횟수
  sellerMotive: SellerMotive;   // 7종 — ⚠ 대외문서 노출 금지
  askingPriceHistory: Array<{   // 호가 조정 이력
    date: Date;
    priceKrw: number;
    note?: string;
  }>;
}
```

> 🔴 B3 블로커: 등기부 파싱을 통한 자동 수집은 별도 의사결정 필요. 이 단계에서는 수동 입력만 구현.

---

### S3-5 · `operating_performance` 분리 (1.5일)

#### [NEW] [OperatingPerfSection.tsx](file:///c:/Users/User/cre-dealcard/src/app/%28broker%29/broker/deal-card/[id]/im-data-bottom-sheet/OperatingPerfSection.tsx)

**조건부 활성화**: `investmentPosture === 'operating'`

`hospitality_spec`(기존 L1084~1136)에서 분리하여 호텔 외 업종 대응:

```typescript
interface OperatingPerfInput {
  unitKind: 'room' | 'bed' | 'parking' | 'tee' | 'seat' | 'other';
  unitCount: number;
  yearlyPerformance: Array<{
    year: number;
    occupancyPct: number;
    revenueKrw: number;
    gopKrw: number;
    verificationLevel: 'verified' | 'partial' | 'unverified';
    source: string;           // "세무신고" | "운영사 POS" | "매도인 진술"
  }>;
  licenceTransferable: boolean | null;
  operationModel: 'direct' | 'lease' | 'management' | 'franchise';
}

// VerificationLevel 판정 (IM_STANDARD_운영형 §2.3)
// verified: 세무신고 실적 2년 이상
// partial: 운영사 POS/제공 자료
// unverified: 시장 평균 역산 (모든 수치에 ◇가정 표기)
```

---

### S3-6 · L축 우선 입력 순서 (1.5일)

#### [MODIFY] 바텀시트 탭/섹션 순서

포스처 확정 후 L축 핵심 질문을 맨 위로:

```typescript
function getInputOrder(posture: InvestmentPosture): string[] {
  switch (posture) {
    case 'income':
      return ['lease', 'financial', 'photos', 'additional'];  // 렌트롤 먼저
    case 'development':
      return ['vacate', 'parcel', 'permit', 'financial', 'photos']; // 명도 먼저
    case 'operating':
      return ['performance', 'hospitality', 'financial', 'photos']; // 실적 먼저
    case 'owner_occupied':
      return ['occupancy', 'physical', 'financial', 'photos'];     // 공간계획 먼저
    case 'trading':
      return ['comps', 'history', 'financial', 'photos'];           // 비교사례 먼저
  }
}
```

---

### S3-7 · 확인사항 섹션 신설 (1.5일)

#### [MODIFY] [section-catalog.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/section-catalog.ts)

현재 5개 포스처 × 7개 섹션 (L15~51)에 `checklist`를 공통 추가:

```diff
  income: {
    posture: 'income',
    sections: ['property_overview', 'location_access', 'lease_status',
-              'income_analysis', 'risk_check', 'investment_thesis', 'next_steps'],
+              'income_analysis', 'risk_check', 'checklist', 'investment_thesis', 'next_steps'],
    suppress: [],
-   emphasize: ['lease_status', 'income_analysis'],
+   emphasize: ['lease_status', 'income_analysis', 'checklist'],
  },
```

#### [NEW] [checklist-renderer.ts](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/checklist-renderer.ts)

```typescript
export function renderChecklist(ctx: IMGenerationContext): ChecklistSection {
  const items: ChecklistItem[] = [];
  
  // 1. 결손 슬롯 (Deficiency[])
  for (const def of ctx.deficiencies) {
    items.push({
      category: 'missing_data',
      text: `${def.label}: 확인 필요`,
      severity: def.severity,
      slot: def.field,
    });
  }
  
  // 2. 게이트 경고 (warn 상태)
  for (const gate of ctx.gateReport.failedWarns) {
    items.push({
      category: 'gate_warning',
      text: `${gate.label}`,
      gateCode: gate.id,
    });
  }
  
  // 3. 가정 값 (assumed provenance)
  for (const [slot, prov] of Object.entries(ctx.provenance)) {
    if (prov === 'assumed') {
      items.push({
        category: 'assumption',
        text: `${getSlotLabel(slot)}: ◇ AI추정·가정`,
        slot,
      });
    }
  }
  
  // 4. 잠긴 지표
  for (const locked of ctx.gradeResult.lockedMetrics) {
    items.push({
      category: 'locked_metric',
      text: `${locked.key}: ${locked.missing.map(getSlotLabel).join(', ')} 미입력`,
    });
  }
  
  return {
    section_type: 'checklist',
    title: '확인사항',
    items,
    masking: false,           // 불변조건 9: 공개 단계에서도 마스킹 금지
    truncation: 'never',      // 전량 표기 강제
  };
}
```

---

## 검증 계획

```bash
# S2 검증
npm run test -- --grep "combination-matrix"
npm run test -- --grep "posture-selector"
npm run test -- --grep "section-catalog"
npx tsc --noEmit  # getSectionPlan 호출부 타입 에러 검출

# S3 검증
npm run test -- --grep "parcel-section"
npm run test -- --grep "sectional-spec"
npm run test -- --grep "checklist-renderer"
npm run test -- --grep "holding-history"
npm run test -- --grep "operating-perf"
npm run build     # 전체 빌드 무결성
```

**DoD**:
- [x] 기본값 없이 저장 시도 → 차단
- [x] 나대지×income → 차단, 호텔×사옥 → 차단
- [x] 양평동 3필지 → X05 통과
- [x] 확인사항 섹션에 결손 전량 표기 (잘림 0건)
- [x] L축 우선 순서로 첫 입력 필드 표시
- [x] **30일 포스처 분포 관측 시작**
