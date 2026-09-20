# 매거진 E2E 테스트 가이드 Part 2 — 구독 · 배포 · 레퍼럴

> **문서 버전**: v1.0 (2026-09-20)  
> **대상 독자**: QA 테스터, 개발자  
> **선행 조건**: Part 1의 FX-01 ~ FX-06 픽스처 준비 완료  
> **관련 문서**: [MAGAZINE_FEATURE_GUIDE.md](./MAGAZINE_FEATURE_GUIDE.md), [Part 1](./TEST_GUIDE_PART1_GENERATION_EDITOR.md)

---

## 추가 테스트 픽스처

### FX-07. 테스트 구독자 (신규)

```json
[
  {
    "_fixture_id": "FX-07-A",
    "_role": "기본 투자자 구독자",
    "subscriber_name": "박투자",
    "subscriber_phone": "01011112222",
    "subscriber_email": "park@test.com",
    "channel": "kakao",
    "source": "magazine",
    "interest_tags": {
      "regions": ["강남·서초", "성수·성동"],
      "assetTypes": ["꼬마빌딩", "상가·근생"]
    }
  },
  {
    "_fixture_id": "FX-07-B",
    "_role": "이메일 전용 매도 관심 구독자",
    "subscriber_name": "이건물주",
    "subscriber_phone": "01033334444",
    "subscriber_email": "lee@test.com",
    "channel": "email",
    "source": "qr_card",
    "interest_tags": {
      "regions": ["마포·홍대"],
      "assetTypes": ["사옥용 빌딩"]
    }
  },
  {
    "_fixture_id": "FX-07-C",
    "_role": "양채널 고관여 구독자 (핫리드 후보)",
    "subscriber_name": "최핫리드",
    "subscriber_phone": "01055556666",
    "subscriber_email": "choi@test.com",
    "channel": "both",
    "source": "magazine",
    "interest_tags": {
      "regions": ["강남·서초"],
      "assetTypes": ["꼬마빌딩"]
    },
    "interest_profile": {
      "readArticleCount": 25,
      "assetTypes": ["꼬마빌딩", "상가"],
      "regions": ["강남", "서초"],
      "lastEngagedAt": "2026-09-18T10:00:00Z"
    }
  }
]
```

### FX-08. 구독 해지 토큰 생성 스크립트

```javascript
// Node.js에서 실행 — HMAC 토큰 생성
const crypto = require('crypto');

const subscriberId = '{FX-07-A의 DB에서 받은 subscriber UUID}';
const brokerId = '{FX-01의 user_id}';
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

const signature = crypto
  .createHmac('sha256', secret)
  .update(`${subscriberId}.${brokerId}`)
  .digest('hex');

const token = `${subscriberId}.${brokerId}.${signature}`;
console.log('Unsubscribe Token:', token);
// 결과 예: "uuid-1234.uuid-5678.abcdef1234567890..."
```

### FX-09. 레퍼럴 테스트 시나리오 데이터

```json
{
  "_fixture_id": "FX-09",
  "referrer_phone": "01011112222",
  "referred_phones": [
    "01077771111",
    "01077772222", 
    "01077773333",
    "01077774444",
    "01077775555"
  ],
  "milestones": [
    { "at_count": 1, "reward": "비공개 시장 분석 리포트", "emoji": "📊" },
    { "at_count": 3, "reward": "엑셀 수지분석기 다운로드", "emoji": "📈" },
    { "at_count": 5, "reward": "비공개 딜 시트 열람권", "emoji": "🏢" }
  ]
}
```

### FX-10. 배포 확인용 SQL 쿼리 모음

```sql
-- 10-A: 최근 배포 이벤트
SELECT ae.event_type, ae.metadata, ae.created_at
FROM activity_events ae
WHERE ae.event_type IN ('magazine_distributed', 'magazine_subscribe', 'magazine_unsubscribed')
ORDER BY ae.created_at DESC
LIMIT 20;

-- 10-B: 특정 브로커의 활성 구독자 전체
SELECT id, subscriber_name, subscriber_phone, channel, status,
       interest_tags, interest_profile, segment, source, subscribed_at
FROM magazine_subscribers
WHERE broker_id = '{FX-01의 user_id}'
AND status = 'active'
ORDER BY subscribed_at DESC;

-- 10-C: 레퍼럴 현황
SELECT referrer_phone, COUNT(*) as referral_count
FROM magazine_referrals
WHERE broker_id = '{FX-01의 user_id}'
GROUP BY referrer_phone
ORDER BY referral_count DESC;

-- 10-D: 배포 로그
SELECT * FROM dispatch_logs
ORDER BY sent_at DESC
LIMIT 20;
```

---

## TC-7. 구독 신청 (퍼블릭)

### TC-7.1 구독 랜딩 페이지 접근

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-7.1 |
| **URL** | `http://localhost:3000/magazine/test-broker-kim/subscribe` |

1. **브라우저에서 구독 페이지 접속** (비로그인 상태)
2. **검증 — 서버 렌더링**:
   - [ ] 브로커 아바타/이니셜 표시
   - [ ] 브로커 이름 "김테스트" 표시
   - [ ] 소속 "테스트부동산중개법인" 표시
   - [ ] 전문 권역 태그: "강남", "서초"
   - [ ] 전문 자산 태그: "꼬마빌딩", "상가"
   - [ ] "매주 화요일 발송" 안내 문구
   - [ ] 최근 매거진 미리보기 링크 (매거진 발행 이력 있는 경우)

### TC-7.2 구독 폼 제출 (정상)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-7.2 |
| **입력 데이터** | FX-07-A |

1. **폼 입력**:
   - [ ] 이름: "박투자" (선택 필드)
   - [ ] 전화번호: "01011112222" (필수 필드, 최소 10자리)
   - [ ] 권역 관심: "강남·서초" 클릭, "성수·성동" 클릭 (멀티 선택 토글)
   - [ ] 자산 관심: "꼬마빌딩" 클릭, "상가·근생" 클릭 (멀티 선택 토글)
2. **제출 버튼** 클릭
3. **검증 — UI**:
   - [ ] 로딩 스피너 표시
   - [ ] ✅ CheckCircle2 완료 화면 전환
   - [ ] "최근 매거진 보기" 버튼 표시 (클릭 시 `/magazine/test-broker-kim/{최신 날짜}` 이동)
4. **검증 — DB** (FX-10-B 쿼리):
   ```sql
   SELECT * FROM magazine_subscribers
   WHERE subscriber_phone = '01011112222'
   AND broker_id = '{FX-01의 user_id}'
   LIMIT 1;
   ```
   - [ ] `status` = `active`
   - [ ] `channel` = `kakao`
   - [ ] `source` = `magazine` (기본값)
   - [ ] `subscriber_name` = `박투자`
   - [ ] `subscribed_at` IS NOT NULL
5. **검증 — 활동 로그**:
   ```sql
   SELECT * FROM activity_events
   WHERE event_type = 'magazine_subscribe'
   ORDER BY created_at DESC LIMIT 1;
   ```
   - [ ] `metadata->'broker_id'` = 브로커 ID
   - [ ] `metadata->'source'` = `magazine`

### TC-7.3 구독 폼 — QR 소스 추적

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-7.3 |
| **URL** | `http://localhost:3000/magazine/test-broker-kim/subscribe?source=qr_card` |

1. `?source=qr_card` 쿼리 파라미터 포함 URL로 접속
2. FX-07-B 데이터로 제출
3. **검증**:
   ```sql
   SELECT source FROM magazine_subscribers
   WHERE subscriber_phone = '01033334444' LIMIT 1;
   ```
   - [ ] `source` = `qr_card`

### TC-7.4 구독 폼 — 레퍼럴 소스 추적

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-7.4 |
| **URL** | `http://localhost:3000/magazine/test-broker-kim/subscribe?source=referral&ref=01011112222` |

1. `?ref=01011112222` (레퍼러 전화번호) 포함 URL로 접속
2. 새 전화번호 `01088889999`로 제출
3. **검증**:
   - [ ] magazine_subscribers에 신규 레코드 생성
   - [ ] `source` 값에 레퍼럴 정보 반영

### TC-7.5 구독 폼 유효성 검증

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-7.5 |

1. **전화번호 없이 제출**:
   - [ ] 제출 버튼 비활성화 또는 에러 메시지 표시
   - [ ] API 호출 안 됨
2. **9자리 전화번호 입력** ("010123456"):
   - [ ] 최소 10자리 유효성 검증 실패
3. **전화번호+이메일 모두 비어있을 때**:
   - [ ] 에러: "broker_id and phone/email required"

### TC-7.6 인라인 구독 위젯 (SubscribeCard)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-7.6 |
| **위치** | 매거진 뷰어 내부 `subscribe_cta` 섹션 |

1. 매거진 페이지에서 SubscribeCard 섹션으로 스크롤
2. **채널 선택 검증**:
   - [ ] "카카오톡" 필 클릭 → 전화 필드 표시, 이메일 필드 숨김
   - [ ] "이메일" 필 클릭 → 이메일 필드 표시
   - [ ] "둘다" 필 클릭 → 전화 + 이메일 모두 표시
3. **제출 + 성공**:
   - [ ] 🎉 축하 배너 표시
   - [ ] DB에 구독자 레코드 생성

### TC-7.7 중복 구독 (UPSERT 테스트)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-7.7 |

1. 이미 구독된 전화번호 `01011112222`로 다시 구독 신청
2. **검증**:
   - [ ] HTTP 200 (에러 없음)
   - [ ] DB에 중복 레코드 없음 (1건만 존재)
   - [ ] `status`가 `active`로 유지/갱신
   - [ ] `subscribed_at`이 새 타임스탬프로 갱신

---

## TC-8. 구독 해지

### TC-8.1 정상 해지 플로우

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-8.1 |
| **전제 조건** | FX-07-A 구독자 DB 존재 + FX-08로 토큰 생성 |

1. **해지 확인 페이지 접속**:
   ```
   GET http://localhost:3000/api/public/magazine/unsubscribe?token={FX-08 토큰}
   ```
2. **검증 — 확인 UI**:
   - [ ] HTML 확인 페이지 렌더링
   - [ ] 확인 버튼 표시
   - [ ] hidden input에 토큰 포함
3. **확인 버튼 클릭** (또는 POST 직접 전송):
   ```bash
   curl -X POST http://localhost:3000/api/public/magazine/unsubscribe \
     -H "Content-Type: application/json" \
     -d '{"token": "{FX-08 토큰}"}'
   ```
4. **검증 — UI**:
   - [ ] 해지 완료 HTML 페이지 렌더링
5. **검증 — DB**:
   ```sql
   SELECT status, unsubscribed_at
   FROM magazine_subscribers
   WHERE subscriber_phone = '01011112222'
   LIMIT 1;
   ```
   - [ ] `status` = `unsubscribed`
   - [ ] `unsubscribed_at` IS NOT NULL
6. **검증 — 감사 로그**:
   ```sql
   SELECT * FROM activity_events
   WHERE event_type = 'magazine_unsubscribed'
   ORDER BY created_at DESC LIMIT 1;
   ```
   - [ ] `entity_type` = `magazine_subscribers`
   - [ ] `actor_role` = `system`

### TC-8.2 잘못된 해지 토큰

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-8.2 |

```bash
# 위조된 토큰
curl http://localhost:3000/api/public/magazine/unsubscribe?token=fake-id.fake-broker.invalidsig
```

- [ ] HTTP 400 응답
- [ ] "invalid token" 관련 에러 메시지

```bash
# 토큰 없이
curl http://localhost:3000/api/public/magazine/unsubscribe
```

- [ ] HTTP 400 응답
- [ ] "missing token" 관련 에러 메시지

---

## TC-9. 브로커 구독자 관리 API

### TC-9.1 구독자 목록 조회 (인증)

```bash
curl "http://localhost:3000/api/broker/magazine/subscribers?status=active&limit=10" \
  -H "Cookie: {인증_쿠키}"
```

- [ ] HTTP 200
- [ ] `subscribers` 배열 반환
- [ ] `total` 숫자 반환
- [ ] 각 구독자에 바이어 온도 정보 포함
- [ ] 미인증 시 HTTP 401

### TC-9.2 구독자 수동 추가 (인증)

```bash
curl -X POST http://localhost:3000/api/broker/magazine/subscribers \
  -H "Content-Type: application/json" \
  -H "Cookie: {인증_쿠키}" \
  -d '{
    "phone": "01099990000",
    "name": "수동추가테스트",
    "channel": "both",
    "interest_tags": {"regions": ["강남"], "assetTypes": ["꼬마빌딩"]}
  }'
```

- [ ] HTTP 200
- [ ] `subscriber.source` = `manual`
- [ ] `subscriber.status` = `active`

### TC-9.3 구독자 프로필 수정 (PATCH)

```bash
curl -X PATCH http://localhost:3000/api/broker/magazine/subscribers/{subscriberId} \
  -H "Content-Type: application/json" \
  -H "Cookie: {인증_쿠키}" \
  -d '{
    "interest_tags": {"regions": ["강남", "판교"], "assetTypes": ["꼬마빌딩", "오피스텔"]},
    "channel": "both"
  }'
```

- [ ] HTTP 200
- [ ] 업데이트된 `interest_tags`에 "판교" 포함
- [ ] `channel` = `both`

### TC-9.4 구독자 상태 변경 → 해지

```bash
curl -X PATCH http://localhost:3000/api/broker/magazine/subscribers/{subscriberId} \
  -H "Content-Type: application/json" \
  -H "Cookie: {인증_쿠키}" \
  -d '{"status": "unsubscribed"}'
```

- [ ] `status` = `unsubscribed`
- [ ] `unsubscribed_at` IS NOT NULL

### TC-9.5 구독자 완전 삭제 (DELETE)

```bash
curl -X DELETE http://localhost:3000/api/broker/magazine/subscribers/{subscriberId} \
  -H "Cookie: {인증_쿠키}"
```

- [ ] HTTP 200
- [ ] `message` = `구독자가 완전히 삭제되었습니다.`
- [ ] DB에서 해당 레코드 완전 삭제 확인

### TC-9.6 AutoIntent 생성

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-9.6 |
| **전제 조건** | FX-07-C (고관여 구독자) DB 존재 |

```bash
curl -X POST http://localhost:3000/api/broker/magazine/subscribers/{subscriberId}/intent \
  -H "Cookie: {인증_쿠키}"
```

- [ ] HTTP 200
- [ ] `success` = true
- [ ] `count` ≥ 1
- [ ] `intents` 배열에 각각:
  - `buyer_type` = `investor`
  - `preferred_regions` 비어있지 않음
  - `budget_min` < `budget_max`
  - `budget_display` 형식: "X억 ~ Y억"
  - `source` = `magazine_auto_intent`
- [ ] **DB 검증**:
  ```sql
  SELECT * FROM buyer_intent_lite
  WHERE source = 'magazine_auto_intent'
  AND owner_id = '{브로커 user_id}'
  ORDER BY created_at DESC;
  ```
  - [ ] 레코드 1건 이상 생성

---

## TC-10. 배포 플로우

### TC-10.1 주간 배포 통합 테스트

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-10.1 |
| **전제 조건** | 발행된 에디션 + 활성 구독자 3명 이상 (FX-07-A/B/C) |

1. Cron 시뮬레이션 또는 에디터에서 발행
2. **배포 결과 확인**:
   ```sql
   SELECT * FROM activity_events
   WHERE event_type = 'magazine_distributed'
   ORDER BY created_at DESC LIMIT 5;
   ```
   - [ ] 배포 이벤트 레코드 존재
3. **채널별 배포 확인**:
   - [ ] 카카오 채널 구독자 (FX-07-A) → 알림톡 발송 시도
   - [ ] 이메일 채널 구독자 (FX-07-B) → 이메일 발송 시도
   - [ ] 양 채널 구독자 (FX-07-C) → 카카오 + 이메일 모두 발송 시도
4. **개인화 삽입문 검증** (Network 탭 또는 로그):
   - [ ] 각 구독자의 interest_tags 기반 2-3줄 맞춤 안내문 생성
   - [ ] 존댓말 톤, 120자 내외

### TC-10.2 세그먼트 타겟 배포

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-10.2 |

1. 에디터에서 타겟 세그먼트를 `buyer`로 설정하고 발행
2. **검증**:
   - [ ] `segment = 'investor'` 또는 관심사 매칭 구독자만 배포 대상
   - [ ] `segment = 'seller'` 구독자는 배포에서 제외 (또는 seller용 순서로 수신)

### TC-10.3 긴급 속보 스마트 타겟 배포

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-10.3 |
| **전제 조건** | FX-02-A (강남·역삼 꼬마빌딩) 기준 |

1. TC-4.2 긴급 속보 발행 (autoDistribute=true)
2. **매칭 검증**:
   - [ ] FX-07-A (강남·서초 + 꼬마빌딩 관심) → 매칭 **됨** (배포 대상)
   - [ ] FX-07-B (마포·홍대 + 사옥용 빌딩 관심) → 매칭 **안됨** (배포 제외)
   - [ ] FX-07-C (강남·서초 + 꼬마빌딩 관심) → 매칭 **됨**
3. **카카오 플래시 템플릿 확인**:
   - [ ] TPL_MAGAZINE_FLASH_ISSUE 템플릿 사용 확인 (Network 탭)

---

## TC-11. 레퍼럴 시스템

### TC-11.1 레퍼럴 기록 생성

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-11.1 |
| **입력 데이터** | FX-09 |

```bash
# 1번째 전달 기록
curl -X POST http://localhost:3000/api/public/magazine/referral \
  -H "Content-Type: application/json" \
  -d '{
    "brokerId": "{FX-01의 user_id}",
    "referrerPhone": "01011112222",
    "referredPhone": "01077771111"
  }'
```

- [ ] HTTP 200
- [ ] `totalReferrals` = 1
- [ ] `currentMilestone` = `{ count: 1, reward: "비공개 시장 분석 리포트" }`
- [ ] `nextMilestone` = `{ count: 3, reward: "엑셀 수지분석기 다운로드" }`

### TC-11.2 마일스톤 단계별 검증

| 전달 수 | API 응답 검증 |
|---------|--------------|
| 1명 | `currentMilestone.count` = 1, `currentMilestone.reward` = "📊 비공개 시장 분석 리포트" |
| 3명 | `currentMilestone.count` = 3, `currentMilestone.reward` = "📈 엑셀 수지분석기 다운로드" |
| 5명 | `currentMilestone.count` = 5, `currentMilestone.reward` = "🏢 비공개 딜 시트 열람권" |

**3명 달성 테스트**:
```bash
# 2번, 3번째 전달
curl -X POST http://localhost:3000/api/public/magazine/referral \
  -H "Content-Type: application/json" \
  -d '{"brokerId":"{user_id}","referrerPhone":"01011112222","referredPhone":"01077772222"}'

curl -X POST http://localhost:3000/api/public/magazine/referral \
  -H "Content-Type: application/json" \
  -d '{"brokerId":"{user_id}","referrerPhone":"01011112222","referredPhone":"01077773333"}'
```

- [ ] 3번째 응답의 `totalReferrals` = 3
- [ ] `currentMilestone.reward` = "엑셀 수지분석기 다운로드"
- [ ] `nextMilestone.count` = 5

### TC-11.3 중복 전달 방지

```bash
# 동일한 전달 반복
curl -X POST http://localhost:3000/api/public/magazine/referral \
  -H "Content-Type: application/json" \
  -d '{"brokerId":"{user_id}","referrerPhone":"01011112222","referredPhone":"01077771111"}'
```

- [ ] HTTP 200 (에러 아님 — 23505 무시)
- [ ] `totalReferrals` 증가하지 **않음** (여전히 이전 값)
- [ ] DB에 중복 레코드 없음:
  ```sql
  SELECT COUNT(*) FROM magazine_referrals
  WHERE referrer_phone = '01011112222'
  AND referred_phone = '01077771111';
  ```
  - [ ] COUNT = 1

### TC-11.4 레퍼럴 통계 조회

```bash
# 브로커 전체 통계 (phone 없이)
curl "http://localhost:3000/api/public/magazine/referral?brokerId={user_id}"
```

- [ ] HTTP 200
- [ ] `totalForwardedSubscribers` = 전체 전달 수
- [ ] `milestones` 배열 4개 (1/3/5/10)

```bash
# 특정 레퍼러 통계
curl "http://localhost:3000/api/public/magazine/referral?brokerId={user_id}&phone=01011112222"
```

- [ ] `totalReferrals` = 해당 레퍼러의 전달 수
- [ ] `currentMilestoneIdx` 올바른 인덱스

### TC-11.5 매거진 뷰어 전달 섹션 UI

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-11.5 |
| **위치** | 매거진 뷰어 하단 `renderReferral` 섹션 |

1. 매거진 페이지 열람 → 하단 "전달하기" 섹션으로 스크롤
2. **검증**:
   - [ ] "동료 투자자에게 이 리포트 전달하기" 텍스트
   - [ ] 소셜 프루프 카운터: "지금까지 N명의 투자자가 전달받았습니다"
   - [ ] 마일스톤 보상 목록 (1/3/5/10명 단계)
   - [ ] "카카오톡으로 전달하기" 버튼 (Kakao SDK 동작)
   - [ ] "링크 복사" 버튼 클릭:
     - [ ] 클립보드에 `{baseUrl}/magazine/{brokerId}?ref=forward` 형태 URL 복사
     - [ ] referralCopied 상태 → 2초간 체크 아이콘 표시

### TC-11.6 에러 케이스

```bash
# brokerId 누락
curl -X POST http://localhost:3000/api/public/magazine/referral \
  -H "Content-Type: application/json" \
  -d '{"referrerPhone":"01011112222","referredPhone":"01077771111"}'
```
- [ ] HTTP 400

```bash
# brokerId만 있고 phone 없이 GET
curl "http://localhost:3000/api/public/magazine/referral"
```
- [ ] HTTP 400
- [ ] `error` = "brokerId가 필요합니다."

---

## TC-12. 아카이브 페이지

### TC-12.1 에디션 아카이브 목록

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-12.1 |
| **URL** | `http://localhost:3000/magazine/test-broker-kim` |

1. 브라우저에서 접속 (비로그인)
2. **검증**:
   - [ ] 브로커 소개 헤더 (이름, 바이오, 로고)
   - [ ] 발행된 에디션 카드 목록 (최대 50개, 최신순)
   - [ ] 각 카드에: 에디션 라벨, 제목, 키워드 태그, 시장 온도 뱃지, 조회수
   - [ ] 카드 클릭 → `/magazine/test-broker-kim/{date}` 이동
   - [ ] 하단에 브로커 프로필 페이지 링크

### TC-12.2 아카이브 빈 상태

1. 매거진 미발행 브로커 slug로 접속
2. **검증**:
   - [ ] 📭 빈 상태 아이콘
   - [ ] "아직 발행된 매거진이 없습니다" 메시지
   - [ ] /explore 링크

---

## TC-13. 이메일 배포 콘텐츠 검증

### TC-13.1 이메일 HTML 렌더링

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-13.1 |
| **검증 방법** | 이메일 발송 로그 또는 buildMagazineHtml 직접 호출 |

**검증 체크리스트** (이메일 HTML 본문):
- [ ] 다크모드 배경 (#1a1a1a 계열)
- [ ] 반응형 레이아웃 (모바일 폭 대응)
- [ ] 시장 온도 뱃지 (이모지 + 라벨)
- [ ] 개인화 삽입문 (구독자별 다름)
- [ ] AI 브리핑 섹션
- [ ] 필드노트 섹션
- [ ] 추천 매물 카드 (블라인드 티저)
- [ ] 뉴스 큐레이션 요약
- [ ] 실거래 동향 요약
- [ ] 설문 참여 CTA 링크
- [ ] 세무 클리닉 Q&A
- [ ] 1-page 이미지 프리뷰
- [ ] 구독 해지 링크 (HMAC 토큰 포함)

---

## TC-14. 카카오 공유 기능

### TC-14.1 매거진 카카오 공유 (handleShare)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-14.1 |
| **위치** | 매거진 뷰어 하단 고정 바 → 공유 버튼 |

1. 모바일 또는 데스크톱에서 매거진 열람
2. 하단 고정 바의 **공유** 버튼 클릭
3. **카카오 SDK 정상 시**:
   - [ ] Kakao.Share.sendDefault 호출
   - [ ] 제목: 매거진 제목
   - [ ] 설명: 매거진 요약
   - [ ] OG 이미지 URL: `/api/og/magazine/{broker_slug}`
   - [ ] 딥링크: 매거진 URL
4. **카카오 SDK 미설치 시** (폴백):
   - [ ] navigator.share 호출 시도
   - [ ] navigator.share 미지원 시 → clipboard.writeText 폴백
   - [ ] "복사됨" 표시 2.5초 유지

### TC-14.2 에디터 발행 후 카카오 공유

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-14.2 |
| **위치** | MagazineShareModal 내 카카오 공유 버튼 |

1. TC-2.9 발행 완료 후 공유 모달에서 카카오 버튼 클릭
2. **검증**: TC-14.1과 동일한 카카오 공유 동작

### TC-14.3 에디터 링크 복사

1. 공유 모달에서 "링크 복사" 클릭
2. **검증**:
   - [ ] 클립보드에 정확한 매거진 URL 복사
   - [ ] URL 형식: `https://credeal.net/magazine/{slug}/{date}`
