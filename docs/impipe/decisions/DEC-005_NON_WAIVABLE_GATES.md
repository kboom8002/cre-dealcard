# DEC-005: 수동 예외승인 불가 검사군 (Non-Waivable Gate Catalog)

- **상태**: 승인 (Approved)
- **결정일**: 2026-09-03
- **결정권자**: 부동산 도메인팀, 품질보증팀, 보안팀

## 1. 배경
긴급 발행 등을 이유로 관리자가 게이트 검사를 수동으로 무시(`Waive`)할 수 있도록 허용할 경우, 치명적인 개인정보 유출이나 허위 과장 광고 사고가 발생할 수 있습니다.

## 2. 결정
아래 5개 핵심 검사는 시스템 관리자라 하더라도 수동 예외 승인이 **원천 불가(Non-Waivable)**합니다:
1. `GATE-BLIND-PRIVACY` / `GATE-PII-EXCLUSION`: 딜카드 및 외부 발행본 내 개인정보(성명, 전화번호, 상세 호수/번지) 노출
2. `GATE-NO-FABRICATED-YIELD`: 원자료/공식 근거 없는 임의 수익률(CapRate, NOI) 날조
3. `GATE-NOT-RUN-BLOCKER`: 차단급 필수 검사가 `NOT_RUN` 또는 `SYSTEM_ERROR` 상태인 경우
4. `GATE-APPROVAL-HASH`: 승인 요청 해시와 서버 실시간 계산 해시가 불일치하는 경우
5. `GATE-PLACEHOLDER-RESIDUE`: 템플릿 변수(`{{...}}`) 또는 이전 매물 식별자 잔존

## 3. 결과 및 영향
- 예외 승인으로 인한 보안 및 컴플라이언스 사고 원천 방지.
