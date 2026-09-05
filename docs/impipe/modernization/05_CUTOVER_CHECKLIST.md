# Production Cutover & Deployment Checklist (CIM-0704 / PR-M7-04)

## 1. 사전 검증 항목 (Pre-flight Checks)
- [x] TypeScript 정적 타입 검사 무결성 (`npm run typecheck` ➔ 0 Errors)
- [x] Next.js 프로덕션 빌드 성공 여부 (`npm run build` ➔ Exit 0)
- [x] 12개 골든 케이스 회귀 테스트 전수 통과 (`golden-runner.test.ts` ➔ 100% Pass)
- [x] 헌법적 합의 결정문(DEC-001 ~ DEC-005) 준수 확인
- [x] 구형 URL 프록시 호환성 및 영구 보존 검증 (`/im-lite/[id]`, `/dc/[id]`)

## 2. 배포 단계별 실행 계획 (Cutover Steps)
1. **DB 마이그레이션 적용**:
   - `20260903000001_pipeline_runtime.sql`
   - `20260903000002_harness_reports.sql`
   - `20260903000003_approval_release_ledger.sql`
2. **카나리 배포 (10% Traffic)**:
   - 섀도우 비교기(`shadow-comparator.ts`) 실행하여 기존 파이프라인과 수치 오차 0.1% 이내 확인
3. **전면 컷오버 (100% Traffic)**:
   - 신규 `DealcardPublicationService`, `MobileIMPublicationService`, `PPTXPublicationService` 전면 가동
4. **모니터링 및 경보**:
   - 텔레메트리 에러율 및 지연시간 대시보드 실시간 관측
