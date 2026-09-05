# Modernized CRE IM Incident Runbook & Severity Protocols

## 1. Severity Definitions & Action Matrix

| 등급 | 조건 및 증상 | 대응 프로토콜 (SLA) | 자동화 조치 |
|---|---|---|---|
| **SEV-1 (Critical)** | - 외부 발행물에 개인정보(전화번호/소유자명) 노출<br>- 허위 수익률 또는 면적 위조 발생<br>- 승인 해시 불일치 문서 외부 노출 | 즉시 릴리스 철회 (`WITHDRAWN`)<br>(대응 시간 5분 이내) | `IncidentRollbackHarness.handleIncident` 호출로 즉시 410 변환 |
| **SEV-2 (Major)** | - 외부 공공데이터 API 타임아웃 3회 연속 발생<br>- 렌트롤 합계 1% 초과 불일치 발생 | 문서를 `STALE` 상태로 전이하고 중개인 재검토 대기<br>(대응 시간 30분 이내) | 자동 발행 차단 및 대시보드 경보 |
| **SEV-3 (Minor)** | - 단가 분모 경미한 레이블 표기 오차<br>- 폰트 시각 정렬 경미한 오버플로우 | 정기 패치 주기 내 수정<br>(대응 시간 24시간 이내) | 텔레메트리 경고 로깅 (`telemetry.logEvent`) |

## 2. Emergency Rollback CLI Command
```bash
# 긴급 발행 회수
npm run im:withdraw -- --release-id=<UUID> --reason="SEV-1 Emergency Privacy Incident"
```
