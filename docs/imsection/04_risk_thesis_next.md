# 섹션 5~7: risk_check + investment_thesis + next_steps

> **전 포스처 공통**: ✅ (단, investment_thesis는 포스처별 3대 포인트 오버레이 적용)

---

## 1. risk_check (투자 리스크 및 점검 사항)

### 1.1 섹션 미션
```
주요 리스크 항목과 이에 대한 '구체적 대응 방안(완화책)'을 함께 제시하세요.
리스크만 나열하지 말고 '어떻게 해결 가능한지'를 함께 서술하여 불안감을 해소하세요.
```

> **소스**: [`narrative-prompt.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/narrative-prompt.ts) L273

### 1.2 데이터 소스

| 소스 | 필드 | 리스크 유형 |
|:---|:---|:---|
| **등기정보광장 API** | `registryData` | 근저당 설정, 가압류, 공동담보 |
| **건축물대장** | `totalArea` vs SSoT `size_signal` | 면적 오기 (C19) |
| **건축물대장** | `vlRat` vs `floorAreaRatioMax` | 위반건축물 여부 |
| **SSoT** | `caution_summary` | 브로커 제공 리스크 요약 |
| **supplemental** | `floor_leases[].note` | 갱신요구권, 묵시적 갱신 |
| **SSoT layers** | `legal_risk`, `structure_risk` | 권리·구조 리스크 |

### 1.3 가드레일 (risk_check 전용)

[`guardrails.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/guardrails.ts) — Risk Boundary 체크:

| 체크 항목 | 내용 |
|:---|:---|
| **근저당 비율** | 채권최고액 ÷ 매매가 > 100% → 경고 |
| **공동담보** | 타 물건과 공동담보 설정 → 해제 조건 명기 |
| **위반건축물** | 건축물대장 위반 기재 → 과태료·이행강제금 경고 |
| **면적 불일치** | 등기부 ↔ 건축물대장 면적 차이 > 5% → 오기 경고 |
| **갱신요구권** | 잔여 기간 표기 + 법정 5% 상한 적용 |

### 1.4 교차 검증 (`cross-validator.ts`)

[`cross-validator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cross-validator.ts) — 26,555 바이트:
- 섹션 간 수치 모순 탐지 (공실률, 면적, Cap Rate)
- 모순 발견 시 `confidence = 'needs_check'` 설정
- `numericalAnchors` 고정 수치 기반 일관성 검증

### 1.5 PPTX 매핑 (A07 Risk)

| 요소 | 데이터 |
|:---|:---|
| 정밀안전 등급 | `data-quality-badge` A~D |
| 권리 점검 불릿 | C19 면적 오기, C32 공동담보, 구분소유, 규제 |
| 완화책 | 각 리스크별 대응 방안 |

---

## 2. investment_thesis (종합 가치 제안)

### 2.1 섹션 미션
```
이 건물을 지금 사야 하는 '3대 핵심 투자 포인트'를 불릿 3줄
(• **제목**: 상세설명)로 명확히 제시하고,
마지막 줄에 '> **종합 가치 제안**: 자산의 안정성과 성장성을 겸비한 우량 부동산으로...'
형식의 실질적 투자 결론을 도출하세요.
```

### 2.2 포스처별 3대 투자 포인트 오버레이

#### income (수익형)
```
• 원금 안전판: 토지 지분 가치 비중과 입지 희소성을 통한 원금 보전력
• 현금흐름 확실성: 만실 임대차 또는 우량 테넌트 기반의 예측 가능한 월 순수익
• 레버리지 효과: 대출 활용 시 자기자본수익률 및 향후 자산가치 상승 여력
```

#### owner_occupied (사옥형)
```
• 실질 비용 절감: 10년 임차료 지출 소멸 및 자가 전환 비용 절감
• 세제 혜택 극대화: 건물 감가상각 + 대출 이자비용 법인세 절감
• 가업승계 자산 기반: 사옥 소유를 통한 기업 신용도 제고 및 자산화
```

#### development (개발형)
```
• 우수한 토지 경쟁력: 평당 토지 매입가 및 입지 희소성
• 법정 용적률 극대화: 잔여 용적률을 활용한 신축 연면적 대폭 증대
• (사업수지 타당성 관련 3번째 포인트)
```

#### operating (운영형)
```
• (GOP 기반 수익성 포인트)
• (운영 효율성 포인트)
• (자산가치 상승 포인트)
```

#### trading (매매형)
```
• (시세 대비 할인율 포인트)
• (밸류업 가능성 포인트)
• (단기 시세차익 실현 포인트)
```

> **핵심 금지**: ❌ '60대 자산가를 위한', '법인 대표를 위한', '디벨로퍼를 위한' 등 페르소나 직접 지칭

### 2.3 Value-Add 엔진 통합

[`value-add-engine.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/value-add-engine.ts) — 4,566 바이트:
- 임대료 정상화 시나리오 (미인상 기간 × 법정 상한 적용)
- 리모델링 밸류업 (증축·용도변경)
- 공실 해소 시나리오

→ `investment_thesis` 섹션 마크다운 끝에 `ctx.valueAddMarkdown` 자동 추가

### 2.4 브로커 하이라이트

```typescript
// im-section-generator.ts L418-420
if (sectionType === "investment_thesis" && supplemental.broker_highlight) {
  markdown += `\n\n> **전문가 한줄 의견**: "${supplemental.broker_highlight}"`;
}
```

### 2.5 PPTX 매핑 (A15 Thesis)

| 요소 | 데이터 |
|:---|:---|
| 서브타이틀 | "○○ 3대 핵심 가치" |
| 3대 카드 (01, 02, 03) | 3대 투자 포인트 (제목 + 상세) |
| 하단 종합 가치 제안 | 서사 결론 |

#### 비중복 원칙
> **3대 카드**: 핵심 지표 중심 (정량)
> **하단 서사**: 종합 투자 결론 (정성)
> ❌ 카드와 서사에 동일 텍스트 중복 금지

---

## 3. next_steps (향후 매각 진행 일정)

### 3.1 섹션 미션
```
투자 검토 진행 절차(비밀유지약정서 NDA, 현장 실사, LOI 제출) 및
1:1 비밀 상담 안내를 제공하세요.
```

### 3.2 표준 3단계 프로세스

| 단계 | 내용 |
|:---:|:---|
| **1단계** | 비밀유지협약(NDA) 체결 및 세부 임대차 계약서 실사 |
| **2단계** | 매매계약 체결 및 임대차 승계 확인 |
| **3단계** | 잔금 지급 및 임대차 정상화 로드맵 착수 |

### 3.3 PPTX 매핑 (A09 Process)

| 요소 | 데이터 |
|:---|:---|
| STEP 1~3 카드 | 3단계 프로세스 |
| 각 카드 설명 | AI 생성 + 결정론적 폴백 |

### 3.4 결정론적 폴백 로직

`premium-template-engine.ts` → `next_steps` 폴백:
- 포스처에 관계없이 **NDA → 계약 → 잔금** 3단계
- development: "실사 → 인허가 → 착공" 변형
- income/기타: "NDA → 임대차 확인 → 잔금·정상화"

### 3.5 토큰 제한

| 설정 | 값 |
|:---|:---|
| 기본 `maxTokens` | 1,000 |
| emphasize 대상 | ❌ (전 포스처에서 비강조) |

---

## 4. 면책 슬라이드 (A10 Disclaimer — PPTX 전용)

PPTX에만 존재하는 엔딩 슬라이드:

| 요소 | 내용 |
|:---|:---|
| 관심 표명 3단계 | 01 관심 표명 → 02 NDA 체결 → 03 현장 실사 |
| 데이터 출처 5단계 | ✔ 공부확인, ★ 전문가검증, ▲ 매도인고지, ● 중개인입력, ◇ AI추정·가정 |
| 면책 조항 | "본 자료는 투자 권유가 아니며, 기재된 정보의 정확성을 보증하지 않습니다." |
| 중개법인명 | `broker.companyName` |

> **소스**: `MOBILE_IM_STANDARD_DISCLAIMER` in [`guardrails.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/guardrails.ts)
