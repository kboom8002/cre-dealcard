# [Audit Log] 04. Basic IM Studio 파이프라인 E2E

**수행 일자**: 2026-09-22
**수행 환경**: `Local Server (localhost:3000)` E2E 브라우저 & API 컨텍스트
**목표**: `04-basic-im-studio.md`에서 정의된 Studio 프로젝트 CRUD, 슬라이드 편집(낙관적 잠금 포함), PPTX 다운로드 및 콜드 스타트 복구 기능 검증.

---

## 1. 주요 발견 사항 (Critical Findings)

### 🔴 Defect 1: P-C4 Cold Start 복구 로직 결함 (404 오류)
- **현상**: 서버 재시작 등 인메모리(`__pptxGlobalProjectsMap`)가 초기화된 상태에서 기존 발급된 `projectId`로 `GET /api/broker/basic-im-studio/{projectId}/download` 호출 시, DB 자동 복구에 실패하고 `404 Project not found`를 반환합니다.
- **원인**: 
  - `download/route.ts`의 `recoverySupabase` 쿼리가 URL 경로로 전달된 `id`(Project ID, 즉 임의의 UUID)를 `building_id.eq.${id}` 조건으로 검색합니다. 
  - 클라이언트는 임의로 생성된 Project ID를 사용하지만 DB 복구 쿼리는 이를 Building ID로 간주하고 매칭을 시도하므로 매칭되는 문서가 없어 복구가 불가능합니다.

### 🟢 기능 통과: Optimistic Locking 및 PPTX 병합
- **현상**: `PATCH` 요청을 통해 `expectedLockVersion`을 검증하며, 구버전 잠금 버전으로 동시 편집 요청 시 정확히 `409 STALE_LOCK_ERROR`를 반환함을 검증했습니다.
- **현상**: PPTX 다운로드 시 편집된 내용(Overrides)이 원본 데이터와 딥 머지(Deep Merge)되어 정상적으로 PPTX 파일(6 슬라이드)로 출력됨을 확인했습니다.

---

## 2. 테스트 시나리오 수행 결과

| TC | 테스트 항목 | 상태 | 비고 / 응답 내역 |
|:---|:---|:---:|:---|
| **TC-ST01** | 프로젝트 생성 (POST) | 🟢 **성공** | `201 Created`, 새 UUID 및 9개 슬라이드 템플릿 할당 확인 |
| **TC-ST03** | 프로젝트 조회 (GET) | 🟢 **성공** | `200 OK`, 인메모리에서 프로젝트 정상 반환 |
| **TC-ST08** | 슬라이드 편집 (PATCH) | 🟢 **성공** | `200 OK`, `lockVersion` 증가 및 overrides 저장 확인 |
| **TC-ST09** | Optimistic Locking 충돌 | 🟢 **성공** | 고의로 구버전 `lockVersion` 전송 시 `409 Conflict` 반환 확인 |
| **TC-ST11** | PPTX 다운로드 (GET) | 🟢 **성공** | 수정 내용이 반영된 365KB PPTX 파일 정상 다운로드 |
| **TC-ST12a**| Cold Start 복구 (P-C4) | 🔴 **실패** | 서버 재시작 후 다운로드 시 `404 Project not found` 크래시 발생 |

---

## 3. 후속 조치 권고 (Next Steps)
1. **P-C4 로직 재검토**: `download/route.ts`의 콜드 스타트 복구 쿼리에서 `id`를 `building_id`로 직접 비교하는 구문을 수정하거나, 프론트엔드에서 `projectId` 대신 `dealId` 기반으로 조회할 수 있도록 라우팅 구조 변경이 필요합니다.
