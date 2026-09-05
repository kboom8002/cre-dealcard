# 모바일 IM L1/L1.5 조립기 사양

> 설계 ID: `IC-MOB-001`  
> 제품역할: 빠른 사실확인·중개인 제안·검토·외부공유의 기본 채널

---

# 1. 기본동작

- 외부 자동초안 기본 목표: L1
- L1.5 후보조건을 충족하면 L1.5 초안 제안
- L1.5 외부발행: 중개인 의견·사진·문안·공개범위 승인 필수
- L2 가능자료가 있어도 기본 화면은 간결한 L1.5이며, ‘매수검토 확장’ 선택 시만 추가 모듈 표시
- L0는 내부 자료확인 화면만 제공하고 공개 링크를 만들지 않음

---

# 2. 입력계약

```typescript
interface CreateMobileDraftInput {
  packageId: string;
  targetLevel: 'L1' | 'L1.5' | 'L2';
  selectedContentUnitIds?: string[];
  selectedProposalUnitIds?: string[];
  representativePhotoId?: string;
  disclosurePolicyId: string;
  contactProfileId: string;
}
```

입력 패키지가 목표등급을 허용하지 않으면 낮은 등급을 조용히 만들지 않고 가능한 등급과 보완과제를 반환한다.

---

# 3. 내용계획

## 3.1 L1 권장순서

1. 표지와 핵심조건
2. 대표 외관을 포함한 물건 개요
3. 입지와 접근
4. 매각대상 범위
5. 토지·건물 공부
6. 현재 사용현황
7. 매수 전 확인사항
8. 문의와 자료 유의사항

자료가 적으면 6~7개 카드로 통합한다. 빈 분석카드를 만들지 않는다.

## 3.2 L1.5 권장순서

1. 대표 외관 중심 표지
2. 매물 추천 포인트
3. 대표 외관 포함 물건 개요
4. 입지와 접근
5. 매각대상·토지·건물
6. 층별 사용·임대현황
7. 중개인 제안·활용 포인트
8. 허용된 가격 참고정보
9. 적합한 매수자
10. 매수 전 확인사항
11. 문의와 자료 유의사항

모바일에서는 카드 접기와 상세보기로 길이를 조절한다. 등급코드와 내부 판정용어는 외부에 표시하지 않는다.

---

# 4. ContentPlan

```typescript
interface MobileContentPlan {
  projectId: string;
  packageId: string;
  targetLevel: 'L1' | 'L1.5' | 'L2';
  cards: MobileCardPlan[];
  omittedUnits: Array<{ contentUnitId: string; reason: string }>;
  unresolvedItems: string[];
  contentPlanHash: string;
}

interface MobileCardPlan {
  cardId: string;
  contentUnitId: string;
  title: string;
  lead?: string;
  claimRefs: string[];
  proposalUnitRefs: string[];
  photoBindings: string[];
  sourceNotes: string[];
  nextAction?: string;
  disclosureMode: 'public' | 'masked' | 'internal_only';
}
```

---

# 5. 문안생성

## 5.1 순서

```text
허용된 사실
→ 승인된 중개인 의견
→ 매수자 의미
→ 짧은 성립조건·확인사항
→ 다음 행동
```

## 5.2 숫자

문안생성기에는 실제 숫자 대신 토큰을 전달한다.

```text
{{claim:TX-C01:display}}
{{claim:BLD-C01:display}}
{{claim:RR-C01:display}}
```

렌더 직전 사용상태·단위·기준일·산정기준을 재검사하고 값을 주입한다. LLM 응답에서 발견된 새 숫자는 삭제 또는 검토차단한다.

## 5.3 한국 중개실무 문장

- 제목은 매물특징형·핵심숫자형·행동기회형 우선
- 장점→근거→의미→확인 순서
- 내부 처리용어와 장문 선언형 제목 금지
- 근거 없는 우량·안전·확정·저평가 금지
- 문의·답사·자료요청 중 하나의 다음 행동 명확화

---

# 6. 사진

| 사진수 | 모바일 처리 |
|---:|---|
| 0 | 지도·공부·도식 중심, 사진 미제공 표시 |
| 1~2 | 표지·개요에 목적이 다른 크롭, 반복 최소화 |
| 3~5 | 개요·입지·사용현황·확인사항에 분산 |
| 6~10 | 관련 사실·의견 가까이에 배치 |
| 10 초과 | 의사결정 중요사진만 본문, 나머지 접기/부록 |

대표사진 후보는 시스템이 제안할 수 있으나 중개인이 승인한다. 공개승인·가림처리 미완료 사진은 외부 카드에서 제외한다.

---

# 7. 중개인 검토화면

필수 패널:

- 현재 가능한 문서: L1 또는 L1.5를 쉬운 말로 표시
- 보완하면 열리는 내용 최대 3개
- 중개인 의견 반영표: 원문·근거·외부문구·반영카드·승인
- 사진 반영표: 사진·역할·공개·가림·반영카드
- 외부에 표시되는 핵심숫자와 산정기준
- 확인사항과 다음 행동
- 문안수정과 수정에 따른 승인무효 경고

내부 등급코드는 관리·시험 모드에서만 보인다.

---

# 8. 모바일 전용 검사

차단:

- CORE 차단 산출항목 참조
- 승인되지 않은 중개인 의견 노출
- 공개승인 없는 사진 노출
- 숫자토큰과 표시값 불일치
- 개인정보·정확주소 공개정책 위반
- expectedHash 불일치
- 필수 카드 없음: 물건 개요, 확인사항, 문의/유의사항

경고:

- 한 카드 본문 과다
- 확인문구가 장점보다 먼저·크게 노출
- 같은 사진·문장 반복
- 다음 행동 없음
- 제목이 내부 정책어 또는 부자연스러운 선언형

---

# 9. 기존 화면 이행

- 기존 `im-approval` 화면에 신경로 탭을 기능깃발로 추가
- 기존 sections 편집은 `ContentPlan` 호환 투영으로 유지
- 저장 시 일반 markdown만 저장하지 않고 구조화 카드와 copyHash 저장
- 승인 API는 신규 publication version이 있으면 ApprovalService로 위임
- 공개 뷰어는 기존 slug/URL을 유지하고 신규 공개투영을 사용

---

# 10. 완료조건

- L1/L1.5 조립 결정이 패키지 묶음과 일치
- 의견별 원문→근거→문구→카드→승인 추적률 100%
- 사진 0/1/3/8/11장 시험에서 빈 카드·무단사진·반복 없음
- 모바일 문안의 자유생성 숫자 0건
- 내부 등급·게이트·가상값 용어 외부노출 0건
- 중개실무자 5점 평가 평균 4 이상, 개별항목 3 미만 없음

