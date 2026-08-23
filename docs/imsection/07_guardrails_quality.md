# 가드레일 & 품질 관리 시스템

> **범위**: 할루시네이션 탐지, LLM-as-Judge, 용어 정규화, Risk Boundary, CRE Quality Gate, Disclosure Guard, 교차 검증, Publish Gates

---

## 1. 6단계 가드레일 파이프라인

```
AI LLM 응답 (rawText)
  │
  ├─① 할루시네이션 탐지 ──────────────── im-context-builder.ts
  │     ├─ 가격: 매매가 × 20배 이상/이하 → anomaly
  │     └─ 면적: 연면적 × 50배 이상/이하 → anomaly
  │     → anomaly 시 template fallback
  │
  ├─② LLM-as-Judge ───────────────────── im-judge.ts
  │     ├─ 4차원 평가: 정확성/완전성/어조/구조
  │     ├─ 3.0 미만 → template fallback
  │     └─ 4.5 이상 → Golden 후보 자동 승격
  │
  ├─③ Deterministic Rent Roll 주입 ──── lease-adapter.ts
  │     └─ floor_leases 존재 시 LLM 테이블 → 결정론적 테이블 교체
  │
  ├─④ 용어 정규화 ────────────────────── terminology-normalizer.ts
  │     ├─ '캡레이트' → '연 순수익률 (Cap Rate)'
  │     ├─ '네이밍 라이츠' → '사옥 단독 명칭 표기(간판 설치권)'
  │     └─ 16,857 바이트 (200+ 용어 매핑)
  │
  ├─⑤ Risk Boundary + CRE Quality Gate
  │     ├─ guardrails.ts: 투자유도·보장·과장 표현 제거
  │     └─ cre-quality-gate.ts: 수치 경계 + 업종 특이 체크
  │
  └─⑥ Disclosure Guard ──────────────── guardrails.ts
        ├─ 면책 조항 자동 삽입
        ├─ PII (개인정보) 제거
        └─ 출처 미표기 수치 경고
```

---

## 2. 할루시네이션 탐지 (`im-context-builder.ts`)

### 2.1 탐지 로직

```typescript
function detectHallucination(text, purchasePriceKrw, totalAreaSqm) {
  // 가격 이상치: 매매가의 20배 초과 or 1/20 미만 (5억 이상일 때)
  // 면적 이상치: 연면적의 50배 초과 or 1/50 미만
  return { anomaly: boolean, reason?: string };
}
```

### 2.2 탐지 시 동작

- `anomaly = true` → AI 생성 포기 → `premium-template-engine.ts` 폴백
- 로그: `[im-section-generator] Hallucination in ${sectionType}: price_outlier`

---

## 3. LLM-as-Judge (`im-judge.ts`)

[`im-judge.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-judge.ts) — 12,927 바이트:

### 3.1 평가 차원

| 차원 | 배점 | 평가 기준 |
|:---|:---:|:---|
| **정확성** (Accuracy) | 1~5 | SSoT·공공데이터 수치와 일치 여부 |
| **완전성** (Completeness) | 1~5 | 미션 요구사항 충족도 |
| **어조** (Tone) | 1~5 | 전문적·단정적 어조 준수 |
| **구조** (Structure) | 1~5 | 결론 우선 + 테이블 + 출처 표기 |

### 3.2 점수별 동작

| 점수 | 동작 |
|:---:|:---|
| < 3.0 | ❌ **template fallback** — AI 생성 거부 |
| 3.0~4.4 | ✅ AI 생성 사용 |
| ≥ 4.5 | ✅ AI 생성 + **Golden 후보 자동 승격** |

### 3.3 Judge 모델

- `shouldJudgeByConfidence(confidence)` — `IM_FAST_MODE` 시 스킵
- Judge 실행 실패 시 → 무시하고 AI 생성 사용

---

## 4. 용어 정규화 (`terminology-normalizer.ts`)

[`terminology-normalizer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/terminology-normalizer.ts) — 16,857 바이트:

### 4.1 주요 교정 규칙

| 비표준 (❌) | 표준 (✅) | 규칙 소스 |
|:---|:---|:---|
| 캡레이트, Cap rate | 연 순수익률 (Cap Rate) | `.agents/AGENTS.md` |
| 네이밍 라이츠, 브랜딩 라이츠 | 사옥 단독 명칭 표기(간판 설치권) | `.agents/AGENTS.md` |
| GOP (단독 사용) | 실질 영업이익 (GOP) | `.agents/AGENTS.md` |
| TI, Rent Free (단독) | 인테리어 지원금(TI) / 렌트프리(무상임대) | `.agents/AGENTS.md` |
| 세입자 | 임차인 | B2B 렉시콘 |
| 집주인 | 소유자/임대인 | B2B 렉시콘 |
| 월세 | 월 임대료 | B2B 렉시콘 |

### 4.2 렉시콘 프로필 (`narrative-prompt.ts`)

| 프로필 | 대상 | 방향 |
|:---|:---|:---|
| **B2B** | 중개인·업계 전문가 | 일상어 → 전문어 |
| **B2C** | 투자자·일반 매수자 | 전문어 → 쉬운 한글(전문어) |

### 4.3 포스처별 전문 용어집 (`POSTURE_LEXICONS`)

| 포스처 | 주요 용어 |
|:---|:---|
| income | NOI, Cap Rate, WALE, DSCR, IRR, DCF, EGI |
| development | 건폐율(BCR), 용적률(FAR), PF, 브릿지론, LTC |
| operating | GOP, ADR, OCC, RevPAR, OPEX |
| owner_occupied | 사옥, 자가전환, 손익분기, 점유비용 |
| trading | 평당가, HPR, 플립, 비교사례, 양도세 |

---

## 5. Risk Boundary (`guardrails.ts`)

[`guardrails.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/guardrails.ts) — 17,526 바이트:

### 5.1 `runRiskBoundaryCheck()` 탐지 패턴

| 카테고리 | 금지 패턴 예시 |
|:---|:---|
| **투자 유도** | "반드시 투자하세요", "지금 사야 합니다" |
| **수익 보장** | "100% 보장", "수익 확정", "무조건 수익" |
| **과장 표현** | "대한민국 최고의", "절대 손해 없는" |
| **비교 광고** | "A건물보다 월등히", "경쟁 매물보다 우수" |
| **시세 조작** | "반드시 오를", "가격 상승 확정" |

### 5.2 탐지 시 동작

- 패턴 매칭 → 해당 문구 제거 또는 교체
- `safe_text` 반환

### 5.3 면책 조항 (`MOBILE_IM_STANDARD_DISCLAIMER`)

```
본 자료는 투자 권유가 아니며, 기재된 정보의 정확성을 보증하지 않습니다.
투자 결정 전 반드시 전문가의 자문을 받으시기 바랍니다.
```

---

## 6. CRE Quality Gate (`cre-quality-gate.ts`)

[`cre-quality-gate.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cre-quality-gate.ts) — 12,441 바이트:

### 6.1 `runCREQualityGate()` 검사 항목

| 검사 | 내용 | 위반 시 |
|:---|:---|:---|
| **수치 범위** | Cap Rate 0~30%, 면적 > 0 | riskLevel: high |
| **페르소나 노출** | "60대 자산가", "법인 대표" 등 | 자동 제거 |
| **외래어 직역** | "네이밍 라이츠" 등 | 용어 교체 |
| **논리 모순** | 만실인데 공실률 > 0 | 경고 |

### 6.2 위반 등급

| riskLevel | 동작 |
|:---:|:---|
| `low` | 경고만 (로그) |
| `medium` | 문구 자동 교체 |
| `high` | ❌ **template fallback** — AI 생성 차단 |

---

## 7. Disclosure Guard (`guardrails.ts`)

### 7.1 `runDisclosureGuard()` 체크 항목

| 체크 | 내용 |
|:---|:---|
| **PII 제거** | 실명, 전화번호, 주민등록번호 패턴 |
| **주소 블라인드** | 공개 전 정확한 주소 노출 차단 (blind 모드) |
| **출처 누락** | 수치만 있고 출처 미표기 → "(출처 미확인)" 추가 |

### 7.2 상태 코드

| status | 의미 |
|:---:|:---|
| `pass` | 정상 통과 |
| `redacted` | 일부 내용 마스킹 처리됨 |
| `blocked` | ❌ 섹션 전체 차단 |

---

## 8. 교차 검증 (`cross-validator.ts`)

[`cross-validator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cross-validator.ts) — 26,555 바이트:

### 8.1 `runCrossValidation()` 검증 항목

| 검증 대상 | 비교 섹션 | 허용 오차 |
|:---|:---|:---:|
| **공실률** | property_overview ↔ lease_status | ±2% |
| **연면적** | property_overview ↔ income_analysis | ±5% |
| **매매가** | 전 섹션 | ±1% |
| **Cap Rate** | income_analysis ↔ investment_thesis | ±0.5% |

### 8.2 모순 발견 시

| severity | 동작 |
|:---:|:---|
| `warning` | 로그만 |
| `critical` | 해당 섹션 `confidence = 'needs_check'` 설정 |

### 8.3 `numericalAnchors` (수치 고정)

```typescript
interface NumericalAnchors {
  vacancyPct?: number;     // 공실률 (첫 언급 시 고정)
  totalAreaSqm?: number;   // 연면적 (첫 언급 시 고정)
  askingPriceKrw?: number; // 매매가 (입력 시 고정)
  capRateBase?: number;    // Cap Rate (계산 시 고정)
}
```

→ 이후 섹션 생성 시 프롬프트의 `[이전 섹션 맥락]`에 주입하여 일관성 강제

---

## 9. Publish Gates (`quality-gates-v02.ts`)

[`quality-gates-v02.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/quality-gates-v02.ts) — 5,987 바이트:

### 9.1 게이트 항목

| 게이트 ID | 조건 | 차단 시 |
|:---|:---|:---|
| `cross_validation` | 교차 검증 통과 | publishBlocked |
| `hallucination_free` | 할루시네이션 없음 | publishBlocked |
| `pii_removed` | PII 제거 완료 | publishBlocked |
| `no_dangerous_expr` | 위험 표현 없음 | publishBlocked |
| `three_axis_confirmed` | 3축 자산 식별 완료 | publishBlocked |
| `im_judge_pass` | Judge 점수 ≥ 3.0 | publishBlocked |

### 9.2 차단 시 응답

```typescript
{
  publishBlocked: true,
  publishBlockReasons: ["cross_validation", "hallucination_free"]
}
```

→ 브로커 IM 승인 화면에서 "게시 불가" 표시 + 사유 안내

---

## 10. 섹션 confidence 시스템

### 10.1 3단계 신뢰도

| confidence | 의미 | 표시 |
|:---:|:---|:---|
| `confirmed` | 공공데이터 또는 전문가 검증 | 🟢 |
| `inferred` | AI 추론 또는 브로커 입력 | 🟡 |
| `needs_check` | 교차 검증 실패 또는 불확실 | 🔴 |

### 10.2 결정 로직

```typescript
// im-section-generator.ts L422-427
if (sectionProvenance.length > 0) {
  const hasNeedsCheck = sectionProvenance.some(p => p.confidence === "needs_check");
  const allConfirmed  = sectionProvenance.every(p => p.confidence === "confirmed");
  confidence = hasNeedsCheck ? "needs_check" : allConfirmed ? "confirmed" : "inferred";
}
```

---

## 11. AI 모델 설정

| 환경변수 | 기본값 | 용도 |
|:---|:---|:---|
| `AI_IM_MODEL` | `getModel("terra")` (gpt-5.6-terra) | IM 섹션 생성 |
| `IM_FAST_MODE` | `"false"` | Vercel 타임아웃 방어 (true 시 Judge 스킵, 30초 타임아웃) |

### Fast Mode 차이

| 항목 | 일반 모드 | Fast Mode |
|:---|:---|:---|
| LLM-as-Judge | ✅ 실행 | ❌ 스킵 |
| CRE Quality Gate | ✅ 실행 | ❌ 스킵 |
| LLM 타임아웃 | 90초 | 30초 |
