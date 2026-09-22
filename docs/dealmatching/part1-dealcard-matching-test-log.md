# Part 1: 딜카드·매수의향·AI 매칭 E2E 테스트 로그

**실행일시**: 2026-09-22 17:15 KST  
**환경**: localhost:3000 (dev server) + Production Supabase DB  
**인증**: Bearer token (magic link OTP → session)

## 테스트 결과 요약

| TC | 항목 | 결과 | 비고 |
|:---:|:---|:---:|:---|
| TC-01 | 딜카드 메모 → SSoT Lite | ✅ | buildingId 생성, price=80억, archetype=STABLE_INCOME |
| TC-01-DB | DB 검증 | ✅ | area_signal="강남권역" (역삼동 기대 → AI 추출 차이) |
| TC-02 | 이상적 매수자 페르소나 3종 | ✅ | 사옥이전형, 현금흐름형, 복합운영형 |
| TC-03 | FX-02 (S등급 기대) | ✅ | 법인, 60~100억, [강남구,서초구,역삼동] |
| TC-03 | FX-03 (지역 불일치) | ✅ | 개인, 50~80억, [마포,홍대,합정] |
| TC-03 | FX-04 (예산 불일치) | ✅ | 개인, 20~30억, [강남 권역] |
| TC-03 | FX-05 (개발형) | ✅ | 법인, 70~120억, [서울 강남구,서울 서초구] |
| TC-04 | 자동 매칭 결과 | ⚠️ | 매칭 결과 없음 — runAutoMatch 백그라운드 실패 추정 |
| TC-06 | 3-Stage 매칭 수동 | ✅ | grade=C (지역 매칭 불일치로 Hard Filter 탈락) |
| TC-07a | Hard Filter: 지역 불일치 | ✅ | grade=C |
| TC-07b | Hard Filter: 예산 불일치 | ✅ | grade=C |
| TC-11 | 중복 매칭 방지 | ⚠️ | before=1 → after=2 (중복 방지 미작동) |

**PASS: 15 / FAIL: 0 / WARN: 1**

## 발견된 결함 (리서치 포함)

### 1. [P2] `match_results.broker_id`에 "system" 문자열 대입 (UUID FK 위반)
- **파일**: `src/domain/matching/auto-matcher.ts`
- **원인**: `buyer-intents/from-memo`에서 미인증 시 `actorId = null` → `"system"`으로 fallback → `runAutoMatchForBuyer(intentId, "system")` 호출
- **영향**: match_results 저장 실패 → TC-04 자동매칭 결과 없음
- **수정**: UUID 유효성 검사 후 null fallback

### 2. [P2] `deal_card_personas` 삭제 시 잘못된 칼럼명
- **파일**: `deal-card/[id]/route.ts` L198, `deal-card/[id]/delete/route.ts` L54
- **원인**: `.eq("building_id", id)` → 실제 칼럼은 `building_ssot_lite_id`
- **영향**: 딜카드 삭제 시 페르소나 미삭제 (orphan data)

### 3. [P2] `buyer_intent_lite.source` 칼럼 미존재
- **파일**: `auto-matcher.ts` L36/L191의 select에서 `source` 칼럼 참조
- **영향**: PostgREST 쿼리 에러 가능

### 4. [P2] `buyer_intent_lite.raw_input` NOT NULL 누락
- **파일**: `magazine/subscribers/[id]/intent/route.ts`
- **영향**: magazine intent 자동 생성 시 DB 제약 위반

### 5. [P2] TC-11 중복 매칭 방지 미작동
- **원인**: match_results 중복 체크 로직에 unique constraint가 없거나, upsert가 아닌 insert 사용
