# JSON Schema 사용법

이 폴더는 IM CORE v1의 채널 간 자료계약을 고정한다.

| Schema | 생산자 | 소비자 |
|---|---|---|
| `effective-snapshot` | EvidenceService | ClaimEvaluationService |
| `claim-evaluation-set` | ClaimEvaluationService | PackageService, GateEngine |
| `publication-package` | PackageService | Mobile Composer, PPTX IM Studio |
| `publication-version` | 채널 조립·렌더 서비스 | ApprovalService, 공개뷰어 |
| `approval-event` | ApprovalService | 상태계산·감사·공개서비스 |

구현 시 Zod 스키마를 한쪽 정본으로 정하고 JSON Schema를 생성하거나, JSON Schema에서 타입을 생성하는 한 방향을 선택한다. 손으로 두 벌을 계속 관리하지 않는다.

CI는 다음을 검사한다.

- 모든 schema JSON 파싱
- 예시파일 검증
- enum과 지식 YAML의 상태값 일치
- 필수 hash 필드 존재
- package가 단일 snapshot을 참조

