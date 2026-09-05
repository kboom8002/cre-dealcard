# 메모 파싱 및 블라인드 딜카드 하네스 사양

## 1. 목적과 경계

딜카드는 IM이 아니다. 매물 존재를 알리고 문의·상세요청으로 연결하기 위한 제한 공개물이다. 불완전한 메모를 받더라도 내부 후보는 만들 수 있지만 외부 공개는 별도 조건을 충족해야 한다.

## 2. 상태 흐름

```text
RECEIVED
  -> PARSED_CANDIDATE
  -> BROKER_REVIEW_REQUIRED
  -> DEALCARD_ELIGIBLE
  -> PUBLISHED
  -> STALE | WITHDRAWN
```

`PARSED_CANDIDATE`에서 외부 공개로 직접 이동할 수 없다.

## 3. MemoObservationSet

```typescript
interface MemoObservation {
  observationId: string;
  memoVersionId: string;
  field: string;
  rawText: string;
  normalizedValue: string | number | null;
  unit?: string;
  sourceSpan: { start: number; end: number };
  confidence: number;
  ambiguity: 'none' | 'multiple_candidates' | 'unit_uncertain' | 'context_uncertain';
  confirmedBy?: string;
  confirmedAt?: string;
}
```

메모의 `강남 오피스 50억`은 위치후보·자산유형후보·가격후보일 뿐 정확주소·대지면적·수익률을 의미하지 않는다.

## 4. 외부 딜카드 최소정보

외부 공개를 위해 다음 묶음 중 하나를 요구한다.

### 기본 묶음

- 광역 위치 또는 상권
- 자산유형
- 거래유형
- 가격대 또는 면적대 또는 명확한 매물특징 1개
- 중개인 연락 및 상세요청 경로

### 제한 묶음

가격·면적이 없는 경우 중개인이 공개가치를 확인한 특징 2개 이상을 요구한다. 예: 역세권, 코너, 사옥 적합. 단, 각 특징은 메모 원문 또는 중개인 확인에 연결해야 한다.

## 5. 공개변환 기록

정확값을 숨기거나 밴딩할 때 변환을 기록한다.

```typescript
interface DisclosureTransform {
  inputObservationRef: string;
  policyId: string;
  transform: 'hide' | 'band' | 'generalize' | 'mask' | 'keep';
  outputValue: string;
  policyVersion: string;
}
```

예: 195억원 -> `190억원대`는 가격밴딩 정책과 연결한다. 원값이 바뀌면 변환 결과와 딜카드 해시가 함께 바뀌어야 한다.

## 6. 검사 목록

| ID | 검사 | 심각도 | 실패조치 |
|---|---|---|---|
| `MEMO.SPAN.001` | 추출값별 원문 위치 존재 | block | 후보 생성 차단 |
| `MEMO.AMB.001` | 복수후보를 단일값으로 확정하지 않음 | block | 중개인 확인 요청 |
| `DC.FACT.001` | 표시사실 전수 관측값 연결 | block | 외부공개 차단 |
| `DC.NOVEL.001` | 메모에 없는 값 생성 없음 | block | 외부공개 차단 |
| `DC.BAND.001` | 밴딩 정책과 출력값 정합 | block | 재생성 |
| `DC.MASK.001` | 직접식별자 마스킹 | block | 외부공개 차단 |
| `DC.REID.001` | 간접 재식별 위험 허용범위 | block | 공개정보 축소 |
| `DC.COPY.001` | 보장·저평가·확정 개발 표현 없음 | block | 문안 수정 |
| `DC.CONFLICT.001` | 중요 상충정보 비노출 | block | 중개인 확인 |
| `DC.HITL.001` | 원문→공개문구 사람 확인 | block | 승인 요청 |
| `DC.FRESH.001` | 메모·기준본 변경 후 최신성 | block | 기존 발행본 무효화 |

## 7. 바텀시트 연계

딜카드 관측값은 바텀시트의 사전채움 후보로만 사용한다. 사용자가 수정하면 다음을 저장한다.

- 이전값과 새값
- 수정 이유
- 수정자와 시각
- 근거자료
- 영향을 받는 딜카드 필드
- 기존 발행본 무효화 여부

## 8. 필수 실패시험

1. 메모 가격을 195억원에서 185억원으로 변경했는데 딜카드가 그대로면 실패한다.
2. 메모에 없는 수익률을 딜카드에 추가하면 실패한다.
3. 정확주소를 노출하면 실패한다.
4. 대표사진의 간판으로 물건이 특정되면 재식별 검사에 실패한다.
5. 중개인 확인을 제거하면 외부공개가 차단된다.

