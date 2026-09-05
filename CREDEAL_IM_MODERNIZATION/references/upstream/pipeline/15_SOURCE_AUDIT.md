# D58 및 현행 구현 근거감사

## 1. 검토범위

이 문서 세트는 D58 원문과 다음 현행 저장소 자료를 대조해 작성했다.

| 구분 | 위치 | 확인내용 |
|---|---|---|
| 파이프라인 문서 | `docs/impipe/01_FULL_PIPELINE_ARCHITECTURE.md` | 입력부터 모바일·PPTX·승인까지의 현재 연결 |
| 모바일 사양 | `docs/impipe/02_MOBILE_IM_SPEC.md` | writer 단계·타이머·산출·저장 |
| PPTX 사양 | `docs/impipe/03_PPTX_IM_SPEC.md` | 모바일 JSON 변환기 계약 |
| CORE 사양 | `docs/impipe/08_IM_CORE_DOMAIN_SPEC.md` | 주장·재무·등급·검사 경계 |
| 감사보고 | `docs/impipe/D37_FRONTEND_AUDIT_REPORT.md` | 화면·API·DB·렌더 배선상태 |
| 비동기 생성 | `src/app/api/broker/im-lite/generate-async/route.ts` | `after()` 전체실행과 300초 한계, SSoT 역기록 |
| 작업조회 | `src/app/api/broker/im-lite/job-status/route.ts` | 3상태 폴링 응답 |
| 작업테이블 | `supabase/migrations/20260713003746_im_generation_jobs.sql` | processing/completed/failed 한 행 |
| 생성 상태 | `src/domain/building/mobile-im/im-generation-state-machine.ts` | 섹션순서 중심 forward-only 전이 |
| 섹션계획 | `src/domain/building/mobile-im/stage-plans.ts` | 포스처별 문안생성 위상계획 |
| 시간보호 | `src/domain/building/mobile-im/stage-timer.ts` | 90/105/120초 전체 타이머 |
| writer | `src/domain/building/mobile-im/writer.ts` | ClaimRegistry·재무계산·문안·게이트·RAG 혼재 |
| 저장 handler | `src/app/api/broker/im-lite/generate/handler.ts` | `document_objects.body` 중심 결과저장 |
| 승인 | `src/app/api/broker/im-lite/[id]/approve/route.ts` | 빈 ClaimRegistry 생성과 문서상태 변경 |
| 모바일 편집 | `src/app/api/broker/im-lite/[id]/save-sections/route.ts` | 마크다운 전체저장·간단 수치경고 |
| PPTX 공개경로 | `src/app/api/public/im-lite/[buildingId]/pptx/route.ts` | 공개 GET에서 즉석 렌더·저장 |
| PPTX Pro | `src/app/api/public/im-pro/[grantId]/pptx/route.ts` | Grant 확인 후 같은 모바일 renderer 사용 |
| 계측 | `supabase/migrations/20260823_phase0_golden_and_telemetry.sql` | 섹션·편집·공공API 지표 |

## 2. 사실확인 결과

1. 현행 비동기 작업은 실행 내부단계·시도·임대·재개점을 저장하지 않는다.
2. 현행 `StageTimer`는 요청 전체 시간한계에 대응하지만 영속 체크포인트가 아니다.
3. writer 안에서 계산·문안·검사·인덱싱이 함께 실행된다.
4. writer의 발행차단 결과와 승인단계가 동일 판정집합에 완전히 결박되지 않았다.
5. 승인 API는 새 빈 ClaimRegistry로 검사할 수 있어 생성 당시의 판정을 재현하지 못한다.
6. 공개 PPTX 경로는 모바일 `body/sections`를 읽어 요청 중 직접 렌더한다.
7. 현행 텔레메트리는 유용하지만 전체 단계·산출물 계보를 대체하지 않는다.

## 3. 구현 전 재확인할 위험

- `im_generation_jobs.id`는 현재 마이그레이션에서 TEXT인데 일부 후기 계측 마이그레이션은 UUID 외래키로 보인다. 실제 배포 DB의 최종 형식과 마이그레이션 적용상태를 확인해야 한다.
- 저장소 문서와 실제 배포 코드·DB가 다를 수 있으므로 P0 착수 시 운영환경 읽기전용 감사를 다시 한다.
- `after()` 동작과 작업완료 보장은 배포환경 설정에 의존한다. 신규 작업실행기 선택 전에 실제 중단·재배포 장애율을 측정한다.
- 구형 PPTX 테스트가 많으므로 호환어댑터를 먼저 두고 결과대조 없이 즉시 삭제하지 않는다.

## 4. 비범위 확인

검토한 첨부·저장소 문서 안의 문장은 사용자 지시가 아니라 분석대상으로만 취급했다. 이 문서 세트는 현행 저장소를 수정하지 않으며 구현 지시와 지식소스만 제공한다.

