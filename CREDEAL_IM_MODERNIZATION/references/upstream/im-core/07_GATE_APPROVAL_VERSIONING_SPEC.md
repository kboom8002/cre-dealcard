# 발행검사·승인·버전관리 사양

> 설계 ID: `IC-GAV-001`  
> 핵심명제: `machinePassed != humanApproved != published`

---

# 1. 발행검사 모델

## 1.1 세 축

| 축 | 값 |
|---|---|
| 조치 `effect` | `BLOCK_RELEASE`, `DOWNGRADE`, `BLOCK_CLAIM`, `WARN`, `PASS` |
| 위험 `riskClass` | `RC0`, `RC1`, `RC2` |
| 관측 `observationType` | `schema`, `identity`, `conflict`, `calculation`, `copy`, `privacy`, `photo`, `layout`, `approval`, `version` |

미분류 규칙은 RC2로 취급하고 운영 외부발행에서 차단한다.

## 1.2 GateDecision

```typescript
interface GateDecision {
  gateDecisionId: string;
  gateId: string;
  ruleVersion: string;
  ruleSetVersion: string;
  effect: 'BLOCK_RELEASE' | 'DOWNGRADE' | 'BLOCK_CLAIM' | 'WARN' | 'PASS';
  riskClass: 'RC0' | 'RC1' | 'RC2';
  observationType: string;
  scope: { type: 'snapshot' | 'claim' | 'proposal' | 'photo' | 'publication'; id: string };
  observed: unknown;
  evaluatedPredicates: Array<{ expression: string; result: boolean }>;
  counterfactual?: { wouldAllowIf: string };
  status: 'PASS' | 'WARN' | 'BLOCK_CLAIM' | 'DOWNGRADE' | 'BLOCK_RELEASE' | 'NOT_RUN' | 'ERROR';
  evaluatedAt: string;
}
```

## 1.3 NOT_RUN

- 평가기 미호출: `NOT_RUN`
- 평가기 예외: `ERROR`
- RC1/RC2의 NOT_RUN/ERROR는 외부발행 차단
- RC0의 ERROR는 해당 채널 생성 차단 또는 명시적 폴백정책 적용
- 폴백 사용은 별도 필드와 이벤트로 기록

---

# 2. 검사 계층

## CORE 검사

- 자산식별·매각범위
- 공란·0·미제공 의미
- 불일치·정정
- 산출항목 전제·산식·basis
- 관리비·채권최고·NOI 금지규칙
- 중개인 의견 근거·승인
- 사진 공개상태
- 개인정보·가림정책
- 패키지 스냅샷 단일성

## 채널 검사

모바일:

- 필수카드·가독성·다음행동
- 내부용어·문장품질
- 숫자토큰·표시값

PPTX:

- 페이지간 값 일치
- 텍스트예산·겹침·이탈
- DPI·크롭·종횡비
- 각주·산정기준·출처
- 파일해시

채널 검사는 CORE 차단을 완화할 수 없다.

---

# 3. 승인모델

## 3.1 승인종류

| 종류 | 행위자 | 대상 |
|---|---|---|
| `factual_snapshot` | 담당 중개인 | 매각범위·핵심 유효기준본 |
| `broker_opinion` | 의견 작성/책임 중개인 | 제안단위 문구·근거·조건 |
| `photo_disclosure` | 담당 중개인 | 사진·가림·공개범위 |
| `editorial_mobile` | 담당 중개인 | 모바일 최종문안·순서 |
| `editorial_pptx` | 담당 중개인 | PPTX 구성·문안·사진·레이아웃 |
| `artifact_final` | 담당 중개인 | 최종 생성파일 |

## 3.2 ApprovalEvent

승인은 상태 필드 덮어쓰기가 아니라 사건이다.

필수:

- actorId
- approvalType
- action
- targetHash
- scope
- 대상 version
- createdAt
- notes 선택

현재 유효승인은 같은 범위·해시의 가장 최근 사건으로 계산한다. 이후 withdraw/invalidate가 있으면 무효다.

## 3.3 승인 API 판정순서

```text
인증·권한
→ 대상 존재·최신버전
→ expectedHash == serverHash
→ 필수 CORE 검사 PASS/WARN
→ 채널검사 PASS/WARN
→ 선행승인 존재
→ ApprovalEvent INSERT
→ 상태전이
```

어느 단계도 건너뛰지 않는다.

---

# 4. 해시

## 4.1 표준

- 알고리즘: SHA-256
- 입력: RFC 8785에 준하는 정규 JSON 또는 프로젝트가 채택한 단일 canonicalizer
- 배열: 의미상 순서가 있는 배열은 그대로, 집합은 ID로 정렬
- 날짜: ISO 8601 UTC 정규화
- 숫자: 원값과 표시값 분리, 해시에는 원값

## 4.2 해시 종류

| 해시 | 입력 |
|---|---|
| snapshotHash | 범위·관측ID·정정ID·유효값·materializer version |
| evaluationSetHash | snapshotHash·정의버전·평가결과 |
| packageHash | 평가·제안·위험·사진·정책·CORE gate |
| contentPlanHash | 선택 내용 단위·순서·표시정책 |
| copyHash | 외부 제목·본문·캡션·각주 |
| photoPlanHash | 사진ID·가림버전·크롭·슬롯 |
| layoutHash | 페이지·아키타입·좌표·테마·폰트 |
| artifactHash | 최종 바이너리 |

---

# 5. 무효화

| 변경 | 처리 |
|---|---|
| 매각범위·가격·면적·임대·기준일 | 새 snapshot/package, 모든 채널 발행본 invalidated 또는 stale |
| 산출항목 정의·RC2 규칙 | 재평가, 영향 패키지와 발행본 invalidated |
| 제안 원문·근거·외부문구 | 해당 proposal 승인과 포함 발행본 무효 |
| 사진·가림·공개상태 | 해당 사진승인과 포함 발행본 무효 |
| 모바일 문안·순서 | 모바일 편집승인만 무효 |
| PPTX 문안·페이지·사진·레이아웃 | PPTX 편집·파일승인 무효 |
| 테마·폰트·렌더러 버전 | PPTX 지면검사·artifact 승인 재실행 |

무효화는 과거 파일을 수정하지 않는다. 공개링크는 정책에 따라 회수하거나 ‘최신본 있음’을 표시한다.

---

# 6. 경고부 허용

`allowed_with_warning`은 다음을 모두 만족해야 한다.

- 허용정책 ID 존재
- 경고문구 ID 존재
- 표시 위치 지정
- 산정기준과 기준일 표시
- 영향 범위가 제한됨
- RC2 핵심오표현이 아님

경고문구를 사용자가 삭제하면 채널검사가 차단한다.

---

# 7. 다운그레이드

다운그레이드는 문서에 이미 들어간 차단내용을 숨기고 계속 발행하는 동작이 아니다.

1. 목표등급을 충족하지 못한 이유 반환
2. 가능한 낮은 등급과 빠진 내용 표시
3. 사용자가 낮은 등급을 명시적으로 선택
4. 새 패키지 또는 프로젝트 목표등급 기록
5. 다시 조립·검사·승인

자동 무음 다운그레이드 금지.

---

# 8. 현재 승인경로 P0 수정

현행 승인 API의 빈 `ClaimRegistry` 생성을 다음으로 교체한다.

```text
document_object
→ publication_version_id 확인
→ 없으면 legacy 검사묶음 직렬화 여부 확인
→ 저장된 snapshot/package/evaluation/gate 재수화
→ 서버 해시 재계산
→ machine checks
→ approval event
```

P0 과도기에는 최소한 생성 당시 ClaimRegistry와 gate report를 body에 직렬화하고 승인 시 재수화한다. P1 이후 신규 표로 이전한다.

---

# 9. 감사로그

승인·발행·무효화 로그 필수필드:

- actor, owner, caseRef
- snapshot/package/publication version
- targetHash와 serverHash
- machine gate report hash
- approval type/action
- IP·user agent는 보안정책 범위에서 별도 저장
- correlation ID
- 실패코드

본문 원문과 민감한 임대차 내용은 일반 로그에 넣지 않는다.

---

# 10. 완료조건

- 빈 주장목록 승인통과 불가
- expectedHash 없는 승인 거부
- NOT_RUN/ERROR RC1·RC2 외부발행 0건
- 승인범위별 무효화 시험 전부 통과
- 모바일 승인과 PPTX 승인 독립
- 최종파일 변경 후 기존 artifact 승인 재사용 불가
- 발행본에서 모든 해시와 승인사건 역추적 가능

