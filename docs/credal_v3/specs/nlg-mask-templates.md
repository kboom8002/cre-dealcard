# GAP-3: NLG Mask Templates

> **버전**: v1.0
> **관련 태스크**: S3-T1
> **목적**: LLM 환각을 방지하고 재무적/수치적 무결성을 보장하기 위한 섹션별 렌더링 템플릿 마스크 정의.
> **주의**: 본 템플릿 세트는 초기(Draft) 버전이며, 브로커의 편집 및 피드백을 통해 지속적으로 진화하는 문서입니다. 산출된 수치는 반드시 `financials.ts`를 통과한 값만 바인딩됩니다.

## 1. 슬롯 바인딩 문법 및 규칙

- **수치 바인딩**: `{변수명}` 형태로 삽입. (예: `{noiKrw_Eok}`)
- **포맷팅**: 모든 금액은 `만원` 단위 원본을 가공하여 `억 원` 또는 `만원`으로 렌더러 단에서 포맷팅. (예: `(noiKrw / 1e8).toFixed(1)`)
- **출처 배지**: 계산된 수치 뒤에는 반드시 출처 배지(`{badge}`)가 수반되어야 함. (예: `[AI 추정]`, `[공부 확인]`)
- **조건부 렌더링**: `IF(조건) { ... }` 문법으로 데이터 존재 여부나 등급(Grade)에 따른 노출 제어.

## 2. 등급(Grade) 제어 정책 (Grade-Gated Availability)

- **A 등급**: DCF, NPV, 민감도 분석 등 고도화된 재무 템플릿 사용 가능.
- **B 등급**: 기본 수익률(Cap Rate), 단순 투자수익 분석까지만 노출.
- **C 등급**: 물건 개요, 입지 분석 수준의 템플릿만 사용 (재무 마스크 노출 제한).

## 3. 섹션별 템플릿 정의

### 3.1 핵심 요약 (Hero) - 공통

**식별자**: `hero_default`
**조건**: 데이터 충족(Grade C 이상)

```markdown
# 🏢 {regionName} {assetType} 매매 제안

- **매각 희망가**: {askingPriceKrw_Formatted}
- **Cap Rate**: {capRatePct}% {capRate_Badge}
- **추정 NOI**: 약 {noiKrw_Eok}억 원/년 {noi_Badge}
- **필요 자기자본**: 약 {equityRequiredKrw_Eok}억 원 {equity_Badge}

> 💡 **주요 포인트**: 본 매물은 {regionName} 핵심 거점에 위치한 {assetType} 자산입니다.
```

### 3.2 수익성 분석 (Income Analysis) - Grade B 이상

**식별자**: `income_basic`
**조건**: Grade B 이상, `rentRoll` 데이터 존재

```markdown
### 📊 재무 분석 요약

| 항목 | 금액 (연간) | 비고 및 출처 |
|---|---|---|
| **총 임대 수입 (GPR)** | 약 {grossAnnualIncomeKrw_Eok}억 원 | 원본 제출 데이터 |
| **실효 총수입 (EGI)** | 약 {egiKrw_Eok}억 원 | {egi_Badge} (공실률 {vacancyPct}% 반영) |
| **운영비 (OPEX)** | 약 {opexKrw_Eok}억 원 | {opex_Badge} |
| **순영업소득 (NOI)** | **약 {noiKrw_Eok}억 원** | **{noi_Badge}** |

**투자 의견**: 현재 매각가 기준 Cap Rate는 **{capRatePct}%**로 산출됩니다.
```

### 3.3 투자 심층 분석 (DCF & Value-add) - Grade A 전용

**식별자**: `income_dcf_valueadd`
**조건**: Grade A, `dealArchetype` == `VALUE_ADD`

```markdown
### 📈 밸류애드 수익성 분석 (DCF 모델)

본 자산은 리모델링/증축을 통한 가치 상승이 기대되는 밸류애드(Value-Add) 자산입니다.

- **현재 용적률 여유분**: {farHeadroomPp}%p
- **목표 Cap Rate (Exit)**: {targetExitCapRatePct}% {ai_Badge}
- **예상 개발 마진**: 약 {devMarginKrw_Eok}억 원 {ai_Badge}

* {dcfReasoningText}
```

### 3.4 입지 및 환경 (Location & Site)

**식별자**: `location_analysis`
**조건**: 공공 데이터(POI, 용도지역) 로드 완료

```markdown
### 📍 입지 및 토지 특성

- **용도지역**: {zoningRegion_Ko} (상한 건폐율 {bcrMax}%, 용적률 {farMax}%)
- **대지면적**: {landArea_Pyung}평 ({landArea_m2}m²)
- **접도 상태**: {roadContactType_Ko} ({roadContactType_Desc})
- **교통 접근성**: {nearestSubway_Name}역 도보 약 {subwayWalkMin}분 {ai_Badge}

IF(assetType == 'logisticsCenter') {
- **물류 접근성**: {nearestIc} IC 반경 {icDistanceKm}km 이내 위치
}
```

### 3.5 리스크 및 주의사항 (Risk & Compliance)

**식별자**: `risk_eviction`
**조건**: 명도 조건 또는 임차인 대항력 리스크 존재 시

```markdown
### ⚠️ 리스크 체크 및 확인사항

- **명도 조건**: {evictionCondition_Ko} ({evictionStatus_Ko})
IF(occupantType == 'OWNER_OCCUPIED' || occupantType == 'PROTECTED_TENANT') {
- **점유 리스크**: {occupantType_Ko} 리스크 등급 [{riskLevel}] — 상세한 법적 검토 및 협상 기간 산정이 필요합니다.
}
- **인허가/규제**: IF(landUsePermitZone == true) { **토지거래허가구역** 대상입니다. } ELSE { 특이사항 없음 }
```

## 4. Anti-Hallucination Constraints (안전망 규칙)

1. **절대 계산 금지**: NLG 엔진 내부에서 `{noiKrw} / {askingPriceKrw}`와 같은 수식 연산을 수행하지 않습니다. 모든 비율과 도출 값은 `financials.ts`에서 계산된 프리컴퓨트(pre-computed) 값을 주입받아야 합니다.
2. **단위 명시 강제**: 수치 바인딩 시 금액은 `억 원`, `만원`, 면적은 `평`, `m²` 단위를 템플릿에 하드코딩하여 혼동을 방지합니다.
3. **가정(Assumption) 표기**: `ai_inferred` Tier에서 온 데이터(예: 도보 시간, OPEX 추정치)는 렌더링 시 반드시 시각적으로 구분되는 뱃지나 "[추정]" 텍스트가 수반되어야 합니다.
