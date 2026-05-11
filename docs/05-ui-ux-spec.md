# 05. UI / UX Specification

## 1. Purpose

This document defines the mobile-first and AI-first UI/UX specification for **JS Building SSoT MVP v0.1**.

The product must feel like a simple deal document copilot, not like a complex property platform.

The user experience goal:

```text
User gives one small input.
AI returns a useful deal artifact immediately.
The interface shows what is confirmed, what is a hypothesis, and what requires expert/data confirmation.
```

---

## 2. UX Principles

### 2.1 Mobile-first

```text
One screen = one decision.
One card = one message.
One result = one next action.
Thumb-friendly CTAs.
Short cards before long reports.
```

---

### 2.2 AI-first

Do not label every action as “AI”. Show the outcome.

Bad:

```text
AI 분석하기
AI 생성하기
AI 추천받기
```

Good:

```text
이 건물 딜 포인트 보기
주소 숨긴 딜카드 만들기
매수자에게 보낼 문구 만들기
Full IM 가능 여부 확인하기
```

---

### 2.3 Trust-first

Every generated result must distinguish:

```text
✅ 확인된 정보
🟡 공개 데이터/입력 기반 가설
🔴 추가 확인 필요
```

---

### 2.4 Disclosure-first

Broker and owner trust depends on sensitive information protection.

Always show:

```text
정확한 주소, 임차인명, 호실별 임대료, 매도자 사정은 자동으로 숨겨집니다.
```

---

## 3. Visual Design Direction

### 3.1 Tone

```text
신뢰감
절제된 프리미엄
모바일 문서형
전문가적이지만 어렵지 않음
카톡 공유 친화적
```

### 3.2 Color Roles

```text
Primary: deep navy / black
Action: blue or deep green
Warning: amber
Risk: red
Success: green
Background: off-white / light gray
Card: white
Border: subtle gray
```

Avoid:

```text
과도한 금색
부동산 전단지 느낌
과한 그라디언트
과도한 그림자
```

### 3.3 Typography

Mobile baseline:

```text
Hero Title: 28–32px
Section Title: 20–22px
Card Title: 17–18px
Body: 15–16px
Caption: 12–13px
Button: 16px
```

---

## 4. Core Components

```text
PurposeSelector
AddressInput
MemoInput
AIProgressStepper
InsightCard
RiskQuestionCard
SSoTReadinessCard
DisclosureGuardCard
BlindTeaserPreview
KakaoCopyButton
StickyActionBar
GateLevelBadge
ExpertNoteCTA
MissingDataChecklist
DocumentStatusBadge
```

---

## 5. Public Home

### Purpose

Convert a cold visitor into an address or purpose submission.

### Layout

```text
[Hero]
이 건물, 딜 될까?

지번만 입력하면
매수자가 실제로 물어볼 질문,
확인해야 할 리스크,
필요한 자료를 AI가 먼저 정리합니다.

[지번 또는 도로명주소 입력]
[딜 관점으로 보기]

[목적 선택]
□ 내 건물 매각 검토
□ 이 건물 매입 검토
□ 법인 사옥 검토
□ 중개 업무
□ 투자 공부
```

### Microcopy

```text
가격을 단정하지 않습니다.
투자 추천을 하지 않습니다.
대신, 실제 딜 검토에 필요한 질문을 찾아드립니다.
```

### Primary CTA

```text
딜 관점으로 보기
```

---

## 6. AI Analysis Loading Screen

### Purpose

Turn wait time into trust-building time.

### Layout

```text
건물 신호를 정리하고 있어요

✅ 주소/권역 확인 중
✅ 건물 기본정보 정리 중
✅ 상권·입지 신호 확인 중
✅ 매수자 관점 질문 생성 중
✅ 공개 가능 정보 점검 중
```

### Microcopy

```text
AI가 가격을 추정하는 것이 아니라,
딜 검토에 필요한 질문을 정리하고 있습니다.
```

---

## 7. Deal Curiosity Report Result

### Top Message

```text
이 건물은
“사옥+부분임대형” 관점에서
검토 질문이 많은 자산입니다.
```

### Score Card

```text
Deal Curiosity Score
74 / 100

이 점수는 투자 가치가 아니라
공개 데이터와 입력 정보 기준으로
생성 가능한 딜 질문과 스토리의 풍부함을 의미합니다.
```

### Risk Questions Card

```text
먼저 확인해야 할 5가지

1. 현재 임대차 만기는 어떻게 구성되어 있나요?
2. 위반건축물 여부는 확인되었나요?
3. 주차와 엘리베이터 조건은 충분한가요?
4. 1층 임대료는 주변 대비 낮은가요?
5. 리모델링 비용과 공실기간은 어느 정도인가요?
```

### Deal Points Card

```text
매수자에게 설명할 수 있는 포인트

- 사옥+부분임대 시나리오
- 1층 리테일 리프라이싱 가능성
- 장기보유형 매수자 관심 가능성
- 노후도 기반 리모델링 스토리
- 권역 변화에 따른 입지 관심
```

### SSoT Readiness Card

```text
현재 자료 준비 상태

✅ 무료 딜 리포트 가능
✅ 블라인드 딜카드 가능
⚠️ Snapshot 초안 가능
❌ Full IM은 추가자료 필요

부족한 자료:
- 임대차 요약표
- 등기부등본
- 건물 사진
- 수선 이력
- 공개 가능/불가 정보
```

### Sticky CTA

Primary:

```text
블라인드 딜카드 만들기
```

Secondary:

```text
전문가 3줄 코멘트 받기
Full IM 가능 여부 확인
```

---

## 8. Blind Deal Card Preview

### Purpose

Allow user or broker to create a safe-to-share deal card.

### Layout

```text
매수자에게 먼저 보여줄
블라인드 딜카드를 만듭니다.

자동으로 숨기는 정보
✅ 정확한 주소
✅ 임차인명
✅ 호실별 임대료
✅ 매도자 사정
✅ 협상 관련 내부 메모
```

### Preview Card

```text
성수권역 80억대 근생형 자산

딜 포인트
- 사옥+부분임대형 매수자에게 검토 가치
- 1층 리테일 리프라이싱 가능성
- 노후도 기반 리모델링 스토리 가능

주의
- 임대차 만기 확인 필요
- 주차 조건 확인 필요
- 위반건축물 여부 확인 필요

상세자료는 자격 확인 후 제공 가능합니다.
```

### Actions

```text
카톡 문구 복사
이미지 카드 저장
상세자료 요청 링크 만들기
```

---

## 9. Broker Home

### Purpose

Drive repeat daily broker usage.

### Layout

```text
좋은 오후예요, 브로커님.

오늘 바로 만들기

[카톡 매물 → 1분 딜카드]
[매수자 조건 → 답장 문구]
[건물주 상담 → 준비 메모]

최근 작업
- 성수권역 80억대 근생 딜카드
- 김대표 사옥 매수 조건
- 강남권 Owner Prep Memo

주의 필요한 요청
- 성수권역 딜카드 Gate 요청 대기
- Buyer Memo 공유 후 3일 경과
```

---

## 10. Broker Memo Input

### Purpose

Make broker input frictionless.

### Layout

```text
카톡 매물 설명을 붙여넣으세요

[Large text area]

예시:
성수동 80억대 근생, 일부 임대 중,
1층 F&B 가능, 사옥 수요도 볼 수 있음.
주소는 아직 비공개.

[1분 딜카드 만들기]
```

### Microcopy

```text
길게 정리하지 않아도 됩니다.
평소 카톡으로 보내던 문장 그대로 넣어주세요.
```

Secondary actions:

```text
음성으로 입력하기
사진/PDF 추가하기
최근 입력 불러오기
```

---

## 11. Broker Deal Card Result

### Top Message

```text
딜카드가 준비됐습니다.
주소와 민감정보는 숨겼어요.
```

### Extracted Info Card

```text
권역: 성수·뚝섬권
자산 유형: 근생형 꼬마빌딩
가격대: 80억대
현재 사용: 일부 임대 중
적합 매수자: 사옥+부분임대형, 장기보유형
확인 필요: 임대차, 주차, 위반건축물
```

### Hidden Fields Card

```text
숨긴 정보

- 정확한 주소
- 임차인명
- 호실별 임대료
- 매도자 사정
```

### Kakao Copy Card

```text
성수권역 80억대 근생형 자산입니다.
사옥+부분임대형 매수자에게 검토 가치가 있고,
1층 리테일 리프라이싱 가능성도 확인해볼 수 있습니다.

다만 임대차 만기, 주차 조건, 위반건축물 여부는
상세 검토가 필요합니다.
```

### CTAs

```text
문구 복사
매수자 조건과 연결
Gate 요청 만들기
```

---

## 12. Buyer Intent Input / Result

### Input Screen

```text
매수자 조건을 그대로 넣어주세요.
AI가 예산, 지역, 목적, 필수조건을 정리합니다.

[Large memo input]

예시:
김대표 50~80억,
성수나 강남,
사옥 겸 임대수익 원함.
주차 중요.
너무 낡은 건물은 싫어함.

[조건 정리하기]
```

### Result Screen

```text
매수자 조건 요약

예산: 50억~80억
지역: 성수, 강남
목적: 사옥 사용 + 일부 임대수익
필수조건: 주차, 사옥 전환 가능성
리스크 성향: 중간
확인 필요: 임차인 만기, 대출 조건, 실사용 면적
```

### Buyer Memo Card

```text
대표님, 말씀 주신 사옥+일부 임대수익 조건 기준으로 보면,
성수권역 근생형 자산 중 일부 공실 가능성이 있거나
임차인 만기가 가까운 건물을 우선 검토하는 것이 좋겠습니다.

다만 주차 조건과 실제 사용 가능 면적은
상세자료 확인이 필요합니다.
```

Actions:

```text
문구 복사
딜카드와 연결
후보 매물 찾기
```

---

## 13. Owner Readiness Check

### Layout

```text
내 건물, 매각자료를 만들 준비가 되었을까요?

□ 건축물대장
□ 등기부등본
□ 토지이용계획확인원
□ 임대차 요약표
□ 건물 사진
□ 도면
□ 수선 이력
□ 공실 현황
□ 매도 희망가
□ 공개 가능/불가 정보
```

### Result

```text
Owner Readiness Score
48 / 100

현재 가능한 것:
✅ 블라인드 티저
⚠️ Snapshot 초안
❌ Buyer-ready Full IM

Full IM 제작 전 필요한 자료:
1. 임대차 요약표
2. 등기부등본
3. 건물 사진
4. 수선 이력
5. 공개 가능/불가 정보
```

Actions:

```text
자료 업로드하고 보강하기
전문가 3줄 코멘트 요청
Snapshot 제작 상담
```

---

## 14. Expert Note Request

### Layout

```text
AI 리포트에 전문가 코멘트를 받아보세요.

JS 전문가가 이 건물의 딜 가능성,
우선 확인할 리스크,
다음 준비자료를 3줄로 정리해드립니다.

이 건물과의 관계를 선택해주세요.
□ 내 건물입니다
□ 매입을 검토 중입니다
□ 고객 매물입니다
□ 고객에게 추천하려는 건물입니다
□ 공부/참고용입니다

이름
휴대폰
이메일
요청 메모

[전문가 코멘트 요청하기]
```

---

## 15. Admin Console MVP

### Expert Notes Page

```text
요청자
건물 요약
사용 목적
AI 한 줄 진단
클릭한 리스크 질문
자료 준비 상태
상태
```

### Detail View

```text
AI 리포트 요약
Building SSoT Lite
사용자가 선택한 목적
사용자가 요청한 질문
전문가 코멘트 입력창
다음 추천 선택
```

Expert input template:

```text
1. 이 건물은 어떤 관점으로 설명하는 것이 좋은가?
2. 가장 먼저 확인해야 할 리스크는 무엇인가?
3. 다음 단계로 어떤 자료를 준비해야 하는가?
```

---

## 16. Empty / Error States

### Empty Broker Deal Cards

```text
아직 만든 딜카드가 없습니다.

카톡 매물 설명을 붙여넣으면
1분 만에 공유용 딜카드를 만들 수 있습니다.
```

CTA:

```text
첫 딜카드 만들기
```

### Address Recognition Failure

```text
주소를 정확히 찾지 못했습니다.

지번, 도로명주소, 건물명 중 하나를
조금 더 구체적으로 입력해주세요.
```

### AI Generation Failure

```text
이번 생성은 완료하지 못했습니다.

입력 내용이 너무 짧거나,
건물 정보를 식별하기 어려웠습니다.
메모를 조금 더 추가해 다시 시도해주세요.
```

---

## 17. UX Writing Rules

### Avoid

```text
투자 가치가 높습니다
수익률 상승이 가능합니다
대출 60% 가능합니다
리모델링하면 임대료가 오릅니다
우량 매물입니다
안전한 투자처입니다
```

### Use

```text
검토해볼 질문이 있습니다
확인할 필요가 있습니다
가능성을 검토할 수 있습니다
자료 확인 전에는 단정하기 어렵습니다
매수자 관점에서 다음 질문이 중요합니다
전문가 검토가 필요한 영역입니다
```

---

## 18. Acceptance Criteria

```text
All primary screens work on mobile width.
User can complete each core flow with one primary action per screen.
Generated result screens use cards, not long dense paragraphs.
Every generated document shows a boundary note.
Blind Teaser preview includes Hidden Fields card.
Broker result page provides Kakao copy action.
Expert Note CTA is visible on public report result.
```
