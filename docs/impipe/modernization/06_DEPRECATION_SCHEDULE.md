# Legacy Deprecation Schedule & Quarantine Plan (CIM-0801 / PR-M8-01)

## 1. 레거시 모듈 격리 현황 (Quarantine Status)
현대화 파이프라인(P00-P60, M00-M50, S00-S70, Dealcard)이 완전히 가동됨에 따라, 레거시 모노리스 로직은 격리 영역으로 지정되었습니다.

| 모듈 경로 | 대체 신규 모듈 | 격리 상태 | 정식 폐기 예정일 |
|---|---|---|---|
| `src/domain/building/mobile-im/writer.ts` (구 모바일 IM 생성) | `src/domain/building/mobile-im-publication/service.ts` | 격리 (호환 프록시 유지) | 2026-11-30 |
| `src/domain/building/mobile-im/pptx/pptx-renderer.ts` (구 PPTX 렌더러) | `src/domain/building/pptx-publication/service.ts` | 격리 (백엔드 분리) | 2026-11-30 |
| `src/app/api/broker/im-lite/generate/handler.ts` (구 생성 핸들러) | `src/domain/building/common-pipeline/core-assembler.ts` | 프록시 래핑 | 2026-12-31 |

## 2. 안전 폐기 원칙 (Zero Breaking Change)
1. 외부 배포 URL(`/im-lite/[id]`, `/dc/[id]`)은 100% 하위 호환 프록시를 통해 영구 보존됩니다.
2. 기존 데이터베이스 테이블은 읽기 전용으로 보존되며, 신규 데이터는 신규 파이프라인 테이블(`deal_runs`, `release_records` 등)에 불변 기록됩니다.
