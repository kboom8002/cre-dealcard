# 알림톡 템플릿 — 긴급 속보 (`TPL_MAGAZINE_FLASH_ISSUE`)

- version: `v1-draft`  (코드 상수: `src/domain/magazine/templates/kakao-template-codes.ts`)
- 상태: **심사 전 초안** — 카카오 비즈메시지 심사 승인 후 아래 "심사 이력"에 승인 번호·일자를 기록하고 문안을 승인본과 대조한다.
- 용도: 구독 동의(마케팅 수신 동의 + 확인 완료)한 구독자에게 매물 속보 링크 안내.
- 주의: 알림톡은 원칙적으로 정보성 메시지다. 광고성 문구가 포함되므로 심사 시 **광고성 메시지(`(광고)` 표기)**로 신청하거나, 심사 결과에 따라 친구톡(광고) 채널로 전환한다. 승인 전에는 `MAGAZINE_SEND_ENABLED=false` 유지.

## 본문 (심사 제출용)

```
(광고) [#{brokerName}] 신규 매물 속보
#{subscriberName}님, 관심 권역·자산 조건에 맞는 매물 소식이 도착했습니다.
#{headline}
▶ 자세히 보기: #{magazineUrl}
발신: #{brokerName} (#{brokerContact})
수신거부: #{unsubscribeUrl}
```

## 변수

| 변수 | 설명 | 비고 |
|:--|:--|:--|
| `#{brokerName}` | 발신 중개사 표시명 (`profiles.display_name`) | 없으면 발송 차단(MISSING_SENDER) |
| `#{brokerContact}` | 발신 연락처 | 없으면 발송 차단 |
| `#{subscriberName}` | 구독자 이름 (30자·특수문자 제한 후) | 없으면 "구독자" 대신 생략 문구 사용 금지 — 렌더러가 처리 |
| `#{headline}` | 속보 제목 (입력에 있는 사실만, 과장·가짜 라벨 금지) | |
| `#{magazineUrl}` | 속보 매거진 절대 URL (`APP_BASE_URL` 기반) | |
| `#{unsubscribeUrl}` | 서명된 수신거부 링크 (`UNSUBSCRIBE_SECRET`) | 필수 |

## 법규 체크

- [x] `(광고)` 표기, 전송자 명칭·연락처, 수신거부 링크 포함 (정보통신망법 §50④)
- [x] 야간(21~08시 KST) 발송 금지 — 야간 별도 동의가 없으면 sendGate가 `QUIET_HOURS`로 차단
- [x] 주 2회 상한(속보) — 원장 기준 `DAILY_CAP`
- [ ] 카카오 심사 승인 (미완)

## 심사 이력

| 일자 | 상태 | 심사 번호 | 비고 |
|:--|:--|:--|:--|
| — | 초안 | — | 사용자(브로커사) 확인 후 신청 |
