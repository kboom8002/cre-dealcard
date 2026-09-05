# DEC-001: 기존 식별자 매핑 방식 (Legacy to Modern ID Mapping)

- **상태**: 승인 (Approved)
- **결정일**: 2026-09-03
- **결정권자**: 시스템 아키텍처팀

## 1. 배경
기존 시스템은 `document_objects.id` 및 `deal_id`를 기반으로 모든 IM 상태와 렌더링을 관리해왔습니다.
신규 파이프라인은 거래건 단위(`deal_run_id`), 산출물 단위(`artifact_run_id`), 단계 실행 단위(`stage_run_id`), 그리고 불변 산출물 봉투(`artifact_id`)를 도입하여 버전 관리와 계보를 추적합니다.

## 2. 결정
1. 기존 `document_objects.id`는 최상위 거래건의 루트 키 및 레거시 외부 노출 식별자로 영구 보존합니다.
2. 파이프라인의 버전별 불변 객체는 `artifact_version_id`와 내용 정규화 해시(`content_hash`) 접미사를 부여하여 1:N 관계로 매핑합니다.
3. 구형 클라이언트가 `document_objects.id`로 조회할 경우, 가장 최신의 `PUBLISHED` 상태인 `release_records`의 내용을 호환 어댑터를 통해 반환합니다.

## 3. 결과 및 영향
- 기존 DB 참조 무결성 100% 유지.
- 신규 불변 산출물은 과거 레코드를 덮어쓰지 않고 새로운 행으로 누적 보존.
