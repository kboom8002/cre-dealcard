# 알림톡 템플릿 — 주간 매거진 (`TPL_MAGAZINE_WEEKLY_ISSUE`)

- version: `v1-draft`  (코드 상수: `src/domain/magazine/templates/kakao-template-codes.ts`)
- 상태: **심사 전 초안**. 기존 `TPL_MAGAZINE_NEW_ISSUE`(notification-service 내장 문구)는 `(광고)` 표기와 전송자 연락처가 없어 매거진 경로에서 더 이상 사용하지 않는다.
- 주의: flash 템플릿과 동일한 광고성 심사 이슈가 있다. `flash-issue.kakao.md` 참조.

## 본문 (심사 제출용)

```
(광고) [#{brokerName}] 주간 매거진 발행
#{subscriberName}님, 이번 주 시장 브리핑이 발행되었습니다.
#{headline}
▶ 매거진 보기: #{magazineUrl}
발신: #{brokerName} (#{brokerContact})
수신거부: #{unsubscribeUrl}
```

## 심사 이력

| 일자 | 상태 | 심사 번호 | 비고 |
|:--|:--|:--|:--|
| — | 초안 | — | |
