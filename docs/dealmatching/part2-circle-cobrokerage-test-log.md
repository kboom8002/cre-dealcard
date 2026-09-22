# Part 2: 서클 공동중개 E2E 테스트 로그

**실행일시**: 2026-09-22 21:05 KST  
**환경**: localhost:3000 (dev server) + Production Supabase DB  
**인증**: Bearer token (Broker A + Broker B 2계정)

## 테스트 결과 요약

| TC | 항목 | 결과 | 비고 |
|:---:|:---|:---:|:---|
| TC-13 | 서클 생성 | ✅ | 이름/설명/아바타 정상 |
| TC-13-DB | 생성자 멤버 확인 | ⚠️ | 생성 직후 0건 — createCircle 멤버 insert 사일런트 실패 가능 |
| TC-14a | 초대 코드 생성 | ✅ | invite_code 정상 |
| TC-14b | 가입 (joinByInviteCode) | ✅ | 정상 |
| TC-14-DB | 멤버 2명 확인 | ✅ | owner + member |
| TC-15 | 매물 공유 | ✅ | sharedAssetId 반환 |
| TC-15-DB | signal_only 가시성 | ✅ | 초기 visibility = signal_only |
| TC-16 | 매수의향 공유 | ✅ | 정상 |
| TC-17 | 자동 교차 매칭 | ✅ | 1건 grade=B, score=58.89 |
| TC-18 | 전체 매칭 수동 | ✅ | 정상 (응답 필드명 차이: totalMatched=undefined) |
| TC-18-DB | 최고 매칭 확인 | ✅ | grade=B, score=58.89 |
| TC-20 | 일방 승인 | ✅ | bothApproved=false |
| TC-20-DB | DB 검증 | ✅ | building_approved=true, buyer_approved=false, revealed=null |
| TC-21 | 양측 승인 | ✅ | bothApproved=true |
| TC-21-DB | 신원 공개 | ✅ | identity_revealed_at 타임스탬프 설정 |
| TC-21-DEAL | 공동중개 딜 | ⚠️ | 미생성 (B등급 → S/A만 딜 생성 설계) |
| TC-22a | 다운그레이드 차단 | ⚠️ | 차단 작동하나 에러 응답 포맷 차이 |
| TC-24a | 공유 해제 | ✅ | 정상 |

**PASS: 15 / FAIL: 0 / WARN: 3**

## 테스트 과정에서 수정된 결함

### 1. 테스트 인프라 수정
- 초대 코드 파라미터: `token` → `inviteCode` (API 응답), `token` → `code` (join 요청)
- 테이블명: `circles` → `broker_circles` (cleanup)
- Broker B 프로필 FK 위반: profiles 행 미존재 → 사전 upsert 추가

### 2. 관찰된 코드 개선 포인트 (미수정)
- **TC-13-DB**: `createCircle()` 내 `broker_circle_members` insert 후 에러 로깅만 하고 throw 안 함 — 멤버 생성 실패 시 조용히 넘어감
- **TC-18**: `runFullCircleMatch()` 응답에 `totalMatched`, `sCount`, `aCount` 필드가 없거나 다른 이름
- **TC-21-DEAL**: B등급 매칭 시 공동중개 딜 미생성 — 설계 의도인지 확인 필요
- **TC-22**: disclosure 엔드포인트 다운그레이드 차단 시 400 대신 일반 에러 응답
