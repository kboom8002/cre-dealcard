# 요구사항 추적과 미결정사항

## 1. D58 요구 추적

| D58 기준 | 구현 위치 | 시험 |
|---|---|---|
| 모바일·PPTX 형제채널 | ADR-0001, `03`, `07`, `08` | T-CHANNEL-01~03 |
| 유효기준본 단일성 | `03`, `04`, `06` | T-LINEAGE-01 |
| L1 기본·조건부 L1.5 | `07` | T-L15-01~05 |
| Studio 독립 | `08` | T-CHANNEL-01 |
| 기계검사·사람승인 분리 | ADR-0003, `09` | T-APPROVAL-01~04 |
| 등급과 페이지 수 분리 | `08` | T-PPTX-01 |
| 근거상태·사용허가상태 분리 | `04`, knowledge catalog | T-CLAIM-01 |
| 불변 산출물·계보 | ADR-0002, `06` | T-ARTIFACT-01~03 |
| 단계적 전환 | `10`, `13` | T-ROLLBACK-01 |

## 2. 현행 코드 연결

| 현행 위치 | 1차 조치 | 목표 위치 |
|---|---|---|
| `generate-async/route.ts` | 새 명령수락 어댑터 | application/im-pipeline/commands |
| `im_generation_jobs` | 호환 조회 투영 | im_pipeline_runs/stage_executions |
| `writer.ts` | 판정 직렬화 후 조립책임 축소 | im-core + mobile composer |
| `stage-plans.ts` | 채널 내용계획으로 한정 | mobile/composer |
| `stage-timer.ts` | 단계별 deadline으로 대체 | pipeline/runtime |
| `handler.ts` | P00~P60 실행자로 분해 | workers/core |
| `approve/route.ts` | 해시 기반 승인서비스 호출 | im-core/approval |
| `save-sections/route.ts` | 구조화 편집명령·버전충돌 | mobile publication project |
| `pptx-renderer.ts` | 호환어댑터 후 Studio renderer | pptx-studio/rendering |
| 공개 PPTX GET | 승인파일 재다운로드 | exports/{id} |

## 3. 아직 결정해야 할 사항

| ID | 질문 | 권고 기본값 | 결정기한 |
|---|---|---|---|
| O-01 | 작업실행기 기술 | 현 스택에 맞는 영속 대기열, DB 임대부터 시작 가능 | E1 착수 전 |
| O-02 | 산출물 본문 저장경계 | 256KB 이하 JSONB, 초과·파일은 객체저장소 | E1 설계 |
| O-03 | 사건 보관기간 | 승인·발행 영구정책, 운영사건 180일+요약 | 보안검토 |
| O-04 | L1 사실승인 필수 여부 | 모든 외부발행에 중개인 승인 | 제품결정 |
| O-05 | stale_review 유예시간 | 기본 신규배포 금지, 기존공개 24시간 이내 검토 | 법무·운영 |
| O-06 | PPTX 파일승인 별도 여부 | 외부배포 전 바이트해시 승인 필수 | 제품결정 |
| O-07 | 구형 PPTX 즉석렌더 종료일 | R3 완료 후 30일 | 전환계획 |
| O-08 | 원자료 개인정보 보존 | 최소기간·암호화·접근통제 | 법무·보안 |
| O-09 | AI 공급자·모델 변경정책 | 문안산출물에 모델·프롬프트 버전 기록 | AI 책임자 |
| O-10 | 임대차 자료등급 규칙 소유자 | 도메인 책임자 승인 정본 | E2 착수 전 |

## 4. 결정기록 절차

1. 미결정 ID와 영향범위 작성
2. 대안 2개 이상, 안전·운영·비용 비교
3. 기존 D58 기준과의 일치 여부
4. 선택안과 유효일
5. 관련 지식 YAML·스키마·시험 업데이트
6. 구현과 배포버전 연결

## 5. 문서 유지관리

- 스키마 주버전 변경은 SDD와 ADR을 함께 갱신한다.
- 오류코드·단계·사건 추가는 기계판독 목록과 시험목록을 같이 갱신한다.
- 문서만 있고 코드에 연결되지 않은 규칙은 `not_implemented`로 표시한다.
- 코드에 하드코딩된 신규 규칙이 지식정본에 없으면 병합을 차단한다.

