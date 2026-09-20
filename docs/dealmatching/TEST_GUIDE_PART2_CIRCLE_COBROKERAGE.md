# 테스트 가이드 Part 2 — 서클(Circle) 공동중개 E2E 테스트

> **범위**: 서클 생성 → 초대/가입 → 자산 공유 → 교차 매칭 → 양측 승인 → 공동중개  
> **테스트 케이스**: TC-13 ~ TC-24  
> **선행 조건**: Part 1 완료 (딜카드 + 매수의향 존재), 브로커 계정 **2개** 필요  
> **관련 파일**: `src/domain/team/`, `src/app/api/broker/circles/`

---

## 📋 테스트 픽스처

### FX-10: 서클 생성 정보

```json
{
  "name": "강남 꼬마빌딩 공동중개팀",
  "description": "강남·서초 권역 꼬마빌딩 매물과 매수자를 공유하는 팀입니다."
}
```

### FX-11: 브로커 A (매물 보유 중개사)

| 항목 | 값 |
|------|---|
| 역할 | 매물측 브로커 (Building Broker) |
| 보유 자산 | FX-01 매물 (역삼동 80억 꼬마빌딩) |
| 계정 | 테스트 브로커 계정 1 |

### FX-12: 브로커 B (매수자 보유 중개사)

| 항목 | 값 |
|------|---|
| 역할 | 매수측 브로커 (Buyer Broker) |
| 보유 자산 | FX-02 매수의향 (강남 60~100억 임대수익형) |
| 계정 | 테스트 브로커 계정 2 |

### FX-13: 서클 교차 매칭 기대 결과

| 매물 | 매수의향 | 기대 등급 | 사유 |
|------|---------|----------|------|
| FX-01 (역삼 80억 만실) | FX-02 (강남 60~100억 임대수익) | **S/A** | 지역·예산·자산·목적 모두 일치 |
| FX-01 (역삼 80억 만실) | FX-03 (마포 50~80억) | **C** | 지역 불일치 |
| FX-01 (역삼 80억 만실) | FX-05 (강남 개발형) | **B/C** | 목적 불일치 (만실 vs 개발) |

---

## TC-13: 서클 생성

### 목적
브로커가 새 서클(공동중개 그룹)을 생성하는 E2E 흐름 검증

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | **브로커 A** 계정으로 로그인 | 대시보드 |
| 2 | `/broker/circles` 접속 | 서클 대시보드 (빈 목록 또는 기존 서클) |
| 3 | **"새 서클 만들기"** 클릭 | `/broker/circles/new` 페이지 이동 |
| 4 | 이름: `강남 꼬마빌딩 공동중개팀` 입력 | — |
| 5 | 설명: FX-10 설명 입력 | — |
| 6 | **"생성"** 클릭 | 서클 생성 완료, 상세 페이지 이동 |
| 7 | 서클 상세 페이지 확인 | 이름, 설명, 멤버(본인 1명) 표시 |

### 검증 포인트

```bash
# API
POST /api/broker/circles
→ { id: "circle-uuid", name: "강남 꼬마빌딩 공동중개팀" }

# DB
SELECT * FROM circles WHERE id = '{circleId}';
→ name, description 확인

SELECT * FROM broker_circle_members WHERE circle_id = '{circleId}';
→ 멤버 1명 (생성자), status = 'active', role = 'owner'
```

---

## TC-14: 초대 링크 생성 & 가입

### 목적
서클 초대 링크를 생성하고, 다른 브로커가 가입하는 흐름 검증

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | **브로커 A**: 서클 상세 → **"멤버 초대"** 클릭 | InviteMemberSheet 오픈 |
| 2 | **"초대 링크 생성"** 클릭 | 고유 초대 URL 생성 (토큰 포함) |
| 3 | 초대 URL 복사 | `credeal.net/broker/circles/join?token={invite_token}` |
| 4 | **브로커 B** 계정으로 로그인 | 대시보드 |
| 5 | 초대 URL 브라우저에 붙여넣기 | `/broker/circles/join` 페이지 (서클 정보 표시) |
| 6 | **"가입하기"** 클릭 | 서클 가입 완료, 서클 상세 페이지 이동 |
| 7 | 멤버 목록 확인 | 브로커 A(owner) + 브로커 B(member) = 2명 |

### 검증 포인트

```bash
# 초대 링크 생성
POST /api/broker/circles/invite-link
→ { token: "invite-token", url: "..." }

# 가입
POST /api/broker/circles/join
→ { circleId, memberId }

# DB
SELECT * FROM broker_circle_members WHERE circle_id = '{circleId}';
→ 2행: [브로커A(owner, active), 브로커B(member, active)]
```

---

## TC-15: 자산 공유 — 매물 (Building)

### 목적
서클에 매물을 공유하고 초기 가시성이 `signal_only`인지 검증

### 사전 조건
- TC-13~14 완료 (서클 생성 + 브로커 B 가입)
- 브로커 A에 FX-01 매물 존재

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | **브로커 A**: 딜카드 상세 → 액션 메뉴 | 메뉴 오픈 |
| 2 | **"서클에 공유"** 클릭 | ShareToCircleSheet 오픈 |
| 3 | 서클 목록에서 **"강남 꼬마빌딩 공동중개팀"** 선택 | 체크 표시 |
| 4 | **"공유"** 클릭 | 공유 완료 토스트 |
| 5 | 서클 상세 페이지 → **공유 자산** 탭 확인 | 매물 1건 표시 |
| 6 | **브로커 B**: 서클 상세 → 공유 자산 확인 | 매물 표시 (signal_only: 지역·자산유형·가격대만) |

### 검증 포인트

```bash
# API
POST /api/broker/circles/{circleId}/share
→ { sharedAssetId: "uuid" }

# DB
SELECT * FROM circle_shared_assets
WHERE circle_id = '{circleId}' AND asset_type = 'building';
→ visibility = 'signal_only', asset_id = '{buildingId}'

# 알림 (브로커 B에게)
SELECT * FROM notifications WHERE user_id = '{brokerB_id}' ORDER BY created_at DESC LIMIT 1;
→ title = '📦 서클 새 자산 공유'
```

### signal_only 가시성 검증 (브로커 B 관점)

| 보이는 정보 | 보이지 않는 정보 |
|------------|----------------|
| ✅ 지역 (역삼동) | ❌ 상세 주소 |
| ✅ 자산유형 (꼬마빌딩) | ❌ 소유자 정보 |
| ✅ 가격대 (80억대) | ❌ 적합성/주의사항 요약 |

---

## TC-16: 자산 공유 — 매수의향 (Buyer Intent)

### 목적
서클에 매수의향을 공유하는 흐름 검증

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | **브로커 B**: 매수의향 상세 → **"서클에 공유"** | ShareToCircleSheet |
| 2 | 서클 선택 → **"공유"** | 공유 완료 |
| 3 | 서클 상세 → 공유 자산 확인 | 매물 1건 + 매수의향 1건 표시 |
| 4 | **브로커 A**: 서클 상세 → 매수의향 정보 확인 | signal_only: 예산·선호지역·자산유형만 표시 |

### signal_only 가시성 검증 (브로커 A 관점)

| 보이는 정보 | 보이지 않는 정보 |
|------------|----------------|
| ✅ 예산 (60~100억) | ❌ 매수자 이름/연락처 |
| ✅ 선호 지역 (강남·서초) | ❌ 매수자 유형 |
| ✅ 자산 유형 (꼬마빌딩) | ❌ 필수조건/리스크 허용도 |

---

## TC-17: 서클 자동 교차 매칭 (공유 시 트리거)

### 목적
자산 공유 시 `runCircleAutoMatch()`가 자동 발동되어 교차 매칭 결과가 생성되는지 검증

### 사전 조건
- TC-15 (매물 공유) + TC-16 (매수의향 공유) 완료

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | TC-16에서 매수의향 공유 직후 | `runCircleAutoMatch()` 비동기 실행 |
| 2 | 30초 대기 | 교차 매칭 완료 |
| 3 | 서클 상세 → **"매칭 결과"** 탭 확인 | 매칭 결과 카드 표시 |
| 4 | FX-01 × FX-02 매칭 결과 확인 | **S/A 등급** |
| 5 | 알림 확인 (브로커 A, B 모두) | "⚡ 서클 S등급 팀 매칭 발견!" 푸시 |

### 검증 포인트

```bash
# DB - 교차 매칭 결과
SELECT *
FROM circle_match_results
WHERE circle_id = '{circleId}'
ORDER BY score DESC;

→ 기대:
# building_id = FX-01, buyer_intent_id = FX-02
# grade = 'S' or 'A', stage1_passed = true
# building_broker_id = 브로커A, buyer_broker_id = 브로커B
# building_broker_approved = false, buyer_broker_approved = false
# identity_revealed_at = null

# 가시성 자동 업그레이드 (S/A 매칭 시)
SELECT visibility
FROM circle_shared_assets
WHERE circle_id = '{circleId}'
  AND asset_id IN ('{buildingId}', '{intentId}');
→ visibility = 'basic_info' (signal_only에서 자동 업그레이드)
```

### 자동 가시성 업그레이드 확인 (basic_info)

| 매물 — 이제 보이는 정보 | 매수의향 — 이제 보이는 정보 |
|----------------------|------------------------|
| ✅ + 규모 (85평/320평) | ✅ + 매수자 유형 (법인) |
| ✅ + 공실 상태 (만실) | ✅ + 매수 목적 (임대수익) |
| ✅ + 적합성 요약 | ✅ + 필수조건 |

---

## TC-18: 서클 전체 매칭 수동 실행

### 목적
`runFullCircleMatch()`로 서클 내 모든 매물 × 매수의향 전수 매칭을 검증

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | 서클 상세 → **"전체 매칭 실행"** 버튼 클릭 | 매칭 진행 |
| 2 | 대기 (공유 자산 수에 비례) | 완료 |
| 3 | 결과 확인 | `totalMatched`, `sCount`, `aCount` 표시 |

### 검증 포인트

```bash
# API
POST /api/broker/circles/{circleId}/match
→ { totalMatched: N, sCount: X, aCount: Y }

# 매칭 결과 조회
GET /api/broker/circles/{circleId}/match?gradeFilter=S,A
→ S/A 등급 매칭만 필터
```

---

## TC-19: 매칭 결과 필터링 & 내 매칭만 보기

### 목적
서클 매칭 결과를 등급/소유자별로 필터링하는 기능 검증

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | 서클 매칭 탭 → **등급 필터** `S` 선택 | S등급 매칭만 표시 |
| 2 | **등급 필터** `S,A` 선택 | S+A 등급 표시 |
| 3 | **"내 매칭만"** 토글 ON | 내가 매물 또는 매수의향 브로커인 건만 표시 |

### 검증 포인트

```bash
# API 쿼리
GET /api/broker/circles/{circleId}/match?gradeFilter=S,A&onlyMine=true
```

---

## TC-20: 양측 승인 → 신원 공개 (Phase 1: 일방 승인)

### 목적
한쪽 브로커가 먼저 승인하면 상대방에게 알림이 가고, 양측 완료 전까지 신원이 공개되지 않는지 검증

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | **브로커 A** (매물측): S등급 매칭 카드 클릭 | CircleMatchCard 상세 |
| 2 | **"신원 공개 승인"** 클릭 | ApprovalDialog 오픈 |
| 3 | 승인 확인 클릭 | 일방 승인 완료 |
| 4 | DB 확인 | `building_broker_approved = true`, `buyer_broker_approved = false` |
| 5 | **브로커 B** 알림 확인 | "🔒 매칭 승인 요청 — 상대 중개사가 신원 공개를 승인했습니다" |
| 6 | 아직 신원 미공개 | `identity_revealed_at = null`, 가시성 변경 없음 |

### 검증 포인트

```bash
# API
POST /api/broker/circles/{circleId}/match/{matchId}/approve
→ { bothApproved: false }

# DB
SELECT building_broker_approved, building_broker_approved_at,
       buyer_broker_approved, identity_revealed_at
FROM circle_match_results
WHERE id = '{matchId}';
→ building_broker_approved = true, buyer_broker_approved = false
→ identity_revealed_at = null
```

---

## TC-21: 양측 승인 완료 → 신원 공개 + 공동중개 딜 생성

### 목적
양측 모두 승인 시 신원이 공개되고, 공동중개 딜이 자동 생성되는지 검증

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | **브로커 B** (매수측): 매칭 카드 → **"신원 공개 승인"** 클릭 | 승인 |
| 2 | 승인 확인 | 양측 승인 완료 |
| 3 | DB `identity_revealed_at` 확인 | 타임스탬프 설정됨 |
| 4 | 가시성 확인 | `full_detail`로 업그레이드 |
| 5 | 양측 알림 확인 | "🤝 자동 공동중개 파이프라인 생성!" |
| 6 | `/broker/pipeline` 확인 (브로커 A) | 새 딜 생성 (stage: "buyer_meeting", co_brokerage: true) |
| 7 | `/broker/pipeline` 확인 (브로커 B) | 동일 딜 표시 |

### 검증 포인트

```bash
# API
POST /api/broker/circles/{circleId}/match/{matchId}/approve
→ { bothApproved: true }

# DB - 매칭 결과
SELECT identity_revealed_at, co_brokerage_deal_id
FROM circle_match_results
WHERE id = '{matchId}';
→ identity_revealed_at IS NOT NULL, co_brokerage_deal_id IS NOT NULL

# DB - 가시성 full_detail
SELECT visibility
FROM circle_shared_assets
WHERE circle_id = '{circleId}'
  AND asset_id IN ('{buildingId}', '{intentId}');
→ visibility = 'full_detail'

# DB - 공동중개 딜 (양측 각각 1건씩 = 2건)
SELECT broker_id, current_stage, metadata
FROM deal_pipeline_states
WHERE metadata->>'circle_match_id' = '{matchId}';
→ 2행:
# [브로커A, buyer_meeting, {co_brokerage:true, role:"building_broker", partner_broker_id:브로커B}]
# [브로커B, buyer_meeting, {co_brokerage:true, role:"buyer_broker", partner_broker_id:브로커A}]
```

### full_detail 가시성 검증

| 매물 — 전체 공개 | 매수의향 — 전체 공개 |
|----------------|-------------------|
| ✅ 모든 SSoT Lite 필드 | ✅ 매수자 유형, 예산, 목적 |
| ✅ 적합성/주의사항 요약 | ✅ 필수조건, 리스크 허용도 |

---

## TC-22: 프로그레시브 디스클로저 수동 변경

### 목적
API로 디스클로저 레벨을 수동 변경하는 기능 검증

### 테스트 절차

```bash
# 디스클로저 레벨 변경
POST /api/broker/circles/{circleId}/match/{matchId}/disclosure
{
  "level": "basic_info"
}
→ { success: true }
```

### 3단계 가시성 전환 매트릭스

| 전환 | 허용 | 조건 |
|------|------|------|
| `signal_only` → `basic_info` | ✅ | S/A 매칭 시 자동 또는 수동 |
| `basic_info` → `full_detail` | ✅ | 양측 승인 완료 시 자동 또는 수동 |
| `full_detail` → `signal_only` | ❌ | 다운그레이드 불가 (보안) |

---

## TC-23: 만료 크론 — 7일 미승인 자동 만료

### 목적
7일 이상 미승인 매칭이 자동 만료되는지 검증

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | S등급 매칭 생성 (TC-17) | 매칭 생성 |
| 2 | 7일간 양측 승인 없이 방치 | — |
| 3 | 크론 실행 (`/api/cron/circle-approval-timeout`) | 만료 처리 |
| 4 | DB 확인 | `expired_at` 타임스탬프 설정 |

### 검증 포인트

```bash
# 크론 수동 트리거
GET /api/cron/circle-approval-timeout

# DB
SELECT expired_at
FROM circle_match_results
WHERE id = '{matchId}' AND identity_revealed_at IS NULL;
→ expired_at IS NOT NULL (7일 경과 시)
```

---

## TC-24: 서클 자산 공유 해제 & 멤버 탈퇴

### 목적
자산 공유 해제 및 멤버 탈퇴 흐름 검증

### 테스트 절차

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | **브로커 A**: 서클 → 공유 자산 → 매물 **"공유 해제"** | 확인 다이얼로그 |
| 2 | 확인 클릭 | 공유 해제 완료 |
| 3 | DB 확인 | `circle_shared_assets`에서 해당 행 삭제 |
| 4 | 매칭 결과 확인 | 기존 매칭 결과는 유지 (orphan 가능) |

### 멤버 탈퇴

| # | 액션 | 기대 결과 |
|---|------|----------|
| 1 | **브로커 B**: 서클 상세 → **"서클 탈퇴"** | 확인 다이얼로그 |
| 2 | 확인 클릭 | 탈퇴 완료, 서클 목록에서 제거 |
| 3 | DB: `broker_circle_members.status` | `left` 또는 행 삭제 |

---

## 📊 Part 2 테스트 요약

| TC | 제목 | 유형 | 우선순위 |
|----|------|------|---------|
| TC-13 | 서클 생성 | E2E | 🔴 필수 |
| TC-14 | 초대 링크 & 가입 | E2E | 🔴 필수 |
| TC-15 | 매물 공유 (signal_only) | E2E | 🔴 필수 |
| TC-16 | 매수의향 공유 | E2E | 🔴 필수 |
| TC-17 | 자동 교차 매칭 | E2E | 🔴 필수 |
| TC-18 | 전체 매칭 수동 실행 | E2E | 🟡 권장 |
| TC-19 | 매칭 필터링 & 내 매칭 | UI | 🟡 권장 |
| TC-20 | 일방 승인 (알림 전달) | E2E | 🔴 필수 |
| TC-21 | 양측 승인 → 공동중개 딜 | E2E | 🔴 필수 |
| TC-22 | 프로그레시브 디스클로저 | API | 🟡 권장 |
| TC-23 | 만료 크론 (7일) | 크론 | 🟡 권장 |
| TC-24 | 공유 해제 & 멤버 탈퇴 | E2E | 🟡 권장 |

> **다음**: [Part 3: 매칭 콘솔·확장 매칭·분석·보안](./TEST_GUIDE_PART3_CONSOLE_ANALYSIS_SECURITY.md)
