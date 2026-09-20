# 매거진 E2E 테스트 가이드 Part 3 — 열람 · 분석 · 이미지 에셋

> **문서 버전**: v1.0 (2026-09-20)  
> **대상 독자**: QA 테스터, 개발자  
> **선행 조건**: Part 1, 2의 픽스처 준비 + 최소 1개 발행 에디션 존재  
> **관련 문서**: [MAGAZINE_FEATURE_GUIDE.md](./MAGAZINE_FEATURE_GUIDE.md), [Part 1](./TEST_GUIDE_PART1_GENERATION_EDITOR.md), [Part 2](./TEST_GUIDE_PART2_SUBSCRIBE_DISTRIBUTE_REFERRAL.md)

---

## 추가 테스트 픽스처

### FX-11. 텔레메트리 이벤트 시뮬레이션 페이로드

```json
[
  {
    "_fixture_id": "FX-11-A",
    "_description": "페이지 뷰 이벤트",
    "edition_id": "test-broker-kim-2026-09-20",
    "visitor_id": "dGVzdC12aXNpdG9yLWZpbmdlcnByaW50",
    "event_type": "page_view",
    "metadata": {
      "broker_id": "test-broker-kim",
      "referrer": "https://t.me/credeal"
    }
  },
  {
    "_fixture_id": "FX-11-B",
    "_description": "섹션 뷰 이벤트 — AI 브리핑",
    "edition_id": "test-broker-kim-2026-09-20",
    "visitor_id": "dGVzdC12aXNpdG9yLWZpbmdlcnByaW50",
    "event_type": "section_view",
    "section_id": "ai_briefing"
  },
  {
    "_fixture_id": "FX-11-C",
    "_description": "섹션 뷰 이벤트 — 추천 매물",
    "edition_id": "test-broker-kim-2026-09-20",
    "visitor_id": "dGVzdC12aXNpdG9yLWZpbmdlcnByaW50",
    "event_type": "section_view",
    "section_id": "featured_deals"
  },
  {
    "_fixture_id": "FX-11-D",
    "_description": "IM 클릭 이벤트",
    "edition_id": "test-broker-kim-2026-09-20",
    "visitor_id": "dGVzdC12aXNpdG9yLWZpbmdlcnByaW50",
    "event_type": "click",
    "target_url": "/im-lite/bldg-test-001",
    "target_param": "bldg-test-001",
    "metadata": {
      "broker_id": "test-broker-kim"
    }
  },
  {
    "_fixture_id": "FX-11-E",
    "_description": "스크롤 깊이 100%",
    "edition_id": "test-broker-kim-2026-09-20",
    "visitor_id": "dGVzdC12aXNpdG9yLWZpbmdlcnByaW50",
    "event_type": "scroll_depth",
    "scroll_pct": 100
  },
  {
    "_fixture_id": "FX-11-F",
    "_description": "체류 시간 이벤트",
    "edition_id": "test-broker-kim-2026-09-20",
    "visitor_id": "dGVzdC12aXNpdG9yLWZpbmdlcnByaW50",
    "event_type": "dwell",
    "dwell_seconds": 185
  }
]
```

### FX-12. 설문 투표 페이로드

```json
[
  {
    "_fixture_id": "FX-12-A",
    "_description": "선택지 1번 투표 (적극 매수 검토)",
    "brokerId": "{FX-01의 user_id}",
    "editionDate": "2026-09-20",
    "choice": 0,
    "subscriberPhone": "01011112222"
  },
  {
    "_fixture_id": "FX-12-B",
    "_description": "선택지 3번 투표 (보유 건물 매각 우선 → seller 세그먼트 자동 변경)",
    "brokerId": "{FX-01의 user_id}",
    "editionDate": "2026-09-20",
    "choice": 2,
    "subscriberPhone": "01033334444"
  }
]
```

### FX-13. 바이어 온도 검증 데이터

```json
[
  {
    "_fixture_id": "FX-13-A",
    "_description": "🔥 적극검토 (score ≥ 80)",
    "profile": {
      "readArticleCount": 25,
      "assetTypes": ["꼬마빌딩", "상가"],
      "regions": ["강남", "서초"],
      "lastEngagedAt": "2026-09-19T10:00:00Z"
    },
    "crossChannelScore": 90,
    "expected": {
      "label": "🔥 적극검토",
      "minCompositeScore": 80
    }
  },
  {
    "_fixture_id": "FX-13-B",
    "_description": "📈 관심 (score 60-79)",
    "profile": {
      "readArticleCount": 12,
      "assetTypes": ["꼬마빌딩"],
      "regions": ["강남"],
      "lastEngagedAt": "2026-09-15T10:00:00Z"
    },
    "crossChannelScore": 55,
    "expected": {
      "label": "📈 관심",
      "compositeRange": [60, 79]
    }
  },
  {
    "_fixture_id": "FX-13-C",
    "_description": "⚪ 미확인 (신규, 데이터 없음)",
    "profile": null,
    "crossChannelScore": 0,
    "expected": {
      "label": "⚪ 미확인",
      "compositeScore": 0
    }
  }
]
```

### FX-14. 이미지 에셋 검증 URL 목록

```
# OG 이미지 (소셜 공유)
http://localhost:3000/api/og/magazine?brokerId=test-broker-kim&date=2026-09-20

# 프로모션 스토리 (인스타그램)
http://localhost:3000/api/magazine/test-broker-kim/2026-09-20/image?format=story

# 프로모션 카드 (정사각형)
http://localhost:3000/api/magazine/test-broker-kim/2026-09-20/image?format=card

# 프로모션 OG (가로형)
http://localhost:3000/api/magazine/test-broker-kim/2026-09-20/image?format=og
```

### FX-15. ROI 계산기 입력 시나리오

```json
[
  {
    "_fixture_id": "FX-15-A",
    "_description": "Cap Rate 4% 이상 양호 케이스",
    "price": 5000000000,
    "ltv": 50,
    "interestRate": 4.5,
    "totalDeposit": 500000000,
    "monthlyRent": 25000000,
    "vacancyFloors": 0,
    "totalFloors": 5,
    "expected": {
      "capRateColor": "green",
      "monthlyPositive": true
    }
  },
  {
    "_fixture_id": "FX-15-B",
    "_description": "공실 스트레스 — 월현금흐름 적자 케이스",
    "price": 5000000000,
    "ltv": 70,
    "interestRate": 6.0,
    "totalDeposit": 200000000,
    "monthlyRent": 15000000,
    "vacancyFloors": 3,
    "totalFloors": 5,
    "expected": {
      "capRateColor": "red",
      "monthlyPositive": false,
      "deficitWarning": true
    }
  }
]
```

---

## TC-15. 매거진 뷰어 — 전체 섹션 검증

### TC-15.1 매거진 페이지 진입 & 메타데이터

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-15.1 |
| **URL** | `http://localhost:3000/magazine/test-broker-kim/2026-09-20` |
| **전제 조건** | 해당 날짜 에디션 발행 완료 |

1. **페이지 로딩 검증**:
   - [ ] HTTP 200 응답
   - [ ] 페이지 완전 렌더링 (빈 화면 아님)
   - [ ] `revalidate` = 1800 (30분 ISR 캐시)
2. **메타데이터 검증** (페이지 소스 보기 또는 DevTools):
   - [ ] `<title>` = `[2026-09-20] 김테스트의 CRE 데일리 매거진 | 강남 꼬마빌딩`
   - [ ] `og:type` = `article`
   - [ ] `og:image` URL = `/api/og/magazine?brokerId=test-broker-kim&date=2026-09-20`
   - [ ] `og:image` 크기 = 1200×630
   - [ ] `twitter:card` = `summary_large_image`
   - [ ] `keywords` 배열에 "꼬마빌딩 매거진" 포함

### TC-15.2 커버 히어로 섹션

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-15.2 |

1. 페이지 최상단 확인
2. **검증**:
   - [ ] 커버 배경 이미지 (설정 시) 또는 그라데이션
   - [ ] 브로커 프로필 행: 아바타, 이름, 소속
   - [ ] 날짜 라벨: "2026년 09월 20일 (토)" 형식
   - [ ] 완독 시간 뱃지: "약 X분" (한국어 텍스트 기반 자동 계산)
   - [ ] 시장 온도 뱃지: 이모지 + 라벨 + 컬러 배경
   - [ ] 키워드 태그 3개
   - [ ] 전문 권역 태그
   - [ ] 핵심 지표 카드 그리드 (keyStats)
   - [ ] 브로커 인용문 (tagline)

### TC-15.3 AI 브리핑 섹션 (`ai_briefing`)

- [ ] "AI 마켓 에디터 브리핑" 제목
- [ ] DataBadge `type='ai'` 표시
- [ ] 마크다운 본문 4~6 문단 렌더링
- [ ] **굵은 글씨** 핵심 수치 강조
- [ ] 이모지 섹션 헤딩

### TC-15.4 필드노트 섹션 (`field_note`)

- [ ] 💬 이번 주 시장 질문 표시
- [ ] 📈 매수 반응 표시
- [ ] 📉 매도 반응 표시
- [ ] 🌡️ 시장 판단 표시
- [ ] 💡 중개인 한마디 표시
- [ ] 각 항목 줄바꿈 정상

### TC-15.5 금주의 테마 섹션 (`theme_of_week`)

- [ ] 테마 제목 (15-25자)
- [ ] 테마 본문 마크다운 렌더링
- [ ] 자산유형 태그 표시
- [ ] 테마 매칭 매물 최대 3건 카드
- [ ] 매물 카드 클릭 → `/building/{dealId}` 이동

### TC-15.6 추천 매물 섹션 (`featured_deals`)

- [ ] 수평 스냅 스크롤 카드 레이아웃
- [ ] 각 카드: 이미지, 권역 시그널, 매수 관심 수, 가격
- [ ] 카드 클릭 → `/im-lite/{dealId}` 이동
- [ ] 스크롤 제스처 정상 (모바일에서)
- [ ] ActionCardView 임베드 (해당 시)

### TC-15.7 인터랙티브 설문 섹션 (`poll`)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-15.7 |

1. **미투표 상태**:
   - [ ] 설문 질문 텍스트 표시
   - [ ] 3개 선택지 버튼
   - [ ] 투표 결과 미표시
2. **투표 실행**:
   - [ ] 선택지 1번 클릭
   - [ ] 투표 애니메이션 표시
   - [ ] 결과 퍼센티지 바 표시 (각 선택지별)
   - [ ] 총 참여자 수 표시
   - [ ] "1:1 상담 전화 걸기" CTA 버튼 표시
3. **localStorage 검증** (DevTools → Application):
   - [ ] 키: `cre_poll_{brokerId}_{date}` = 선택한 인덱스
4. **재방문 시**:
   - [ ] localStorage에서 투표 상태 복원
   - [ ] 결과 바 즉시 표시 (재투표 불가)
5. **API 호출 검증** (Network 탭):
   - [ ] `POST /api/public/magazine/poll` 호출
   - [ ] 요청 body: `{ brokerId, editionDate, choice, subscriberPhone }`
   - [ ] 응답: `{ ok: true, results: { total, counts } }`

### TC-15.8 시장 데이터 섹션 (`market_data`)

- [ ] 접이식(아코디언) UI → 기본 접힘 (seller 타겟일 때만 확장)
- [ ] 펼치기 시:
  - [ ] 실거래 테이블 (동/주소, 가격, 날짜)
  - [ ] 임대 트렌드 (공실률, 임대료 지수)
  - [ ] 상권 분석 (매출 지수, 유동인구 지수)
  - [ ] 월간 요약 (총 건수, 평균 가격, 변동률 %, 용도 분포)

### TC-15.9 뉴스 큐레이션 섹션 (`news_curation`)

- [ ] 접이식 UI (기본 접힘)
- [ ] 최대 6건 뉴스
- [ ] 각 뉴스: 감성 도트 (emerald/rose/slate), 제목, 요약, 출처, 토픽 뱃지

### TC-15.10 경매 매물 섹션 (`auction_picks`)

- [ ] 접이식 UI
- [ ] NPL 소싱 뱃지
- [ ] 주소, 할인율 %
- [ ] 최저입찰가 vs 감정가 진행 바
- [ ] 경매 일자, 상태

### TC-15.11 리서치 리포트 섹션 (`reports`)

- [ ] 접이식 UI
- [ ] 기관명, 제목, 요약

### TC-15.12 투자 심리 지수 섹션 (`sentiment_index`)

- [ ] 접이식 UI
- [ ] 0~100 점수 표시
- [ ] 상태 텍스트 (과열/낙관/중립/위축/침체)
- [ ] 컬러 바 + 마커 동적 위치

### TC-15.13 세무 클리닉 섹션 (`tax_clinic`)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-15.13 |
| **타겟 조건** | `target` ∈ {all, seller, owner, owner_individual} 일 때만 렌더링 |

1. **타겟 필터 확인**:
   - [ ] `?target=buyer`로 접속 → 세무 클리닉 섹션 **미표시**
   - [ ] `?target=seller`로 접속 → 세무 클리닉 섹션 **표시**
   - [ ] 쿼리 파라미터 없이 접속 → 세무 클리닉 섹션 **표시** (all 기본)
2. **고급 A/B 비교 UI** (advanced 모드):
   - [ ] 시나리오 제목 표시
   - [ ] 상황 설명 텍스트
   - [ ] 대안 A 카드: 이름, 설명, 예상 세금 정보
   - [ ] 대안 B 카드: 이름, 설명, 예상 세금 정보
   - [ ] "✅ 추천" 뱃지 (대안 B)
   - [ ] 전문가 코멘트 (결론)
   - [ ] 출처 어트리뷰션
   - [ ] "세무 상담 예약" CTA 버튼
3. **레거시 Q&A 모드** (legacy 폴백):
   - [ ] 질문/답변 형식 표시

### TC-15.14 ROI 계산기 섹션 (`roi_calculator`)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-15.14 |
| **입력 데이터** | FX-15 |

1. **FX-15-A (양호 케이스)** 슬라이더 설정:
   - [ ] 매입가: 50억 슬라이더 이동
   - [ ] LTV: 50% 설정
   - [ ] 금리: 4.5% 설정
   - [ ] 보증금: 5억 설정
   - [ ] 월임대료: 2,500만원 설정
   - [ ] 공실 층수: 0
2. **결과 카드 검증**:
   - [ ] Cap Rate ≥ 4% → **초록색** 표시
   - [ ] Cash-on-Cash 수익률 표시
   - [ ] 월 현금 흐름 **양수** → 정상 표시
3. **FX-15-B (적자 케이스)** 슬라이더 설정:
   - [ ] LTV: 70%, 금리: 6.0%, 보증금: 2억, 월임대: 1,500만원, 공실: 3층
4. **결과 카드 검증**:
   - [ ] Cap Rate < 3% → **빨간색** 표시
   - [ ] 월 현금 흐름 **음수** → ⚠️ 적자 경고 표시
   - [ ] 공실 스트레스 경고 메시지
5. **상세 계산 펼치기**:
   - [ ] 접이식 상세 분석 펼침 → 모든 중간 계산값 표시:
     - 대출금, 점유율, 유효 연임대, 유효 보증금, 보증금 운용수익
     - 관리비, NOI, 연이자, 순현금흐름
6. **슬라이더 범위 검증**:
   - [ ] 매입가: 5억 ~ 300억 (1억 단위)
   - [ ] LTV: 0% ~ 80% (5% 단위)
   - [ ] 금리: 2% ~ 8% (0.1% 단위)
   - [ ] 보증금: 0 ~ 50억 (5천만원 단위)
   - [ ] 월임대료: 0 ~ 1억 (50만원 단위)
   - [ ] 공실 층수: 0 ~ totalFloors (1층 단위)

### TC-15.15 브로커 프로필 섹션 (`broker_profile`)

- [ ] FlatProfileCard 렌더링 (`variant='full'`)
- [ ] 브로커 이름, 소속, 전문 권역/자산 태그
- [ ] 딜 카운트, 매물 수
- [ ] 프로필 사진 (있는 경우)
- [ ] 전화 아이콘 / 연락처

### TC-15.16 구독 CTA 섹션 (`subscribe_cta`)

- [ ] SubscribeCard 위젯 렌더링
- [ ] Part 2 TC-7.6과 동일 기능

### TC-15.17 Powered By Badge

- [ ] "Data Verified by CREDEAL" 뱃지 표시
- [ ] 클릭 → `/powered-by?ctx=magazine&broker={brokerId}` 이동

### TC-15.18 하단 고정 바

- [ ] 화면 하단에 항시 고정
- [ ] 📞 전화 버튼: 클릭 → `tel:{broker.phone}` (비숫자 제거)
- [ ] 📋 IM 요청 버튼: 클릭 → `/broker-profile/{broker.slug}?ref=magazine-cta`
- [ ] 📤 공유 버튼: TC-14.1 동작

### TC-15.19 섹션 순서 — 타겟별 검증

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-15.19 |

1. **`?target=buyer`** 접속:
   - [ ] 첫 섹션: ai_briefing → field_note → featured_deals → theme → poll
   - [ ] market_data가 후반부에 접이식
2. **`?target=seller`** 접속:
   - [ ] market_data가 상단에 **확장** 상태로 표시
   - [ ] 순서: ai_briefing → field_note → market_data → sentiment → featured_deals → ...
3. **쿼리 파라미터 없이** (all 기본):
   - [ ] 순서: ai_briefing → field_note → theme → featured_deals → poll → ...

### TC-15.20 매거진 미발행 시 처리

1. 존재하지 않는 날짜로 접속: `/magazine/test-broker-kim/2099-12-31`
2. **검증**:
   - [ ] 미발행 플레이스홀더 화면 표시
   - [ ] /explore 링크 제공

---

## TC-16. 열람 텔레메트리

### TC-16.1 자동 텔레메트리 발화 (useMagazineAnalytics)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-16.1 |
| **도구** | 브라우저 DevTools → Network 탭 → "analytics" 필터 |

1. 매거진 페이지 접속
2. **page_view 즉시 발화**:
   - [ ] 페이지 로드 직후 `POST /api/public/magazine/analytics` 호출
   - [ ] `event_type` = `page_view`
   - [ ] `visitor_id` 32자 해시
   - [ ] `edition_id` = `{brokerId}-{date}` 형식
3. **섹션 뷰 자동 추적**:
   - [ ] ai_briefing 섹션으로 스크롤 (30% 이상 노출)
   - [ ] `section_view` 이벤트 발화 (section_id: `ai_briefing`)
   - [ ] 같은 섹션 재스크롤 → 중복 발화 **없음** (1회만)
4. **스크롤 깊이 마일스톤**:
   - [ ] 페이지 25% 스크롤 → `scroll_depth` (scroll_pct: 25) 발화
   - [ ] 50% → scroll_pct: 50
   - [ ] 75% → scroll_pct: 75
   - [ ] 100% → scroll_pct: 100
5. **체류 시간**:
   - [ ] 페이지 떠날 때 (탭 닫기/이동) `dwell` 이벤트 발화
   - [ ] `dwell_seconds` > 0
   - [ ] sendBeacon 사용 확인 (Network 타입: `beacon`)

### TC-16.2 수동 텔레메트리 API 호출

```bash
# FX-11-A: 페이지 뷰
curl -X POST http://localhost:3000/api/public/magazine/analytics \
  -H "Content-Type: application/json" \
  -d '{
    "edition_id": "test-broker-kim-2026-09-20",
    "visitor_id": "test-visitor-001",
    "event_type": "page_view",
    "metadata": {"broker_id": "test-broker-kim"}
  }'
```

- [ ] HTTP 200, `{ "ok": true }`
- [ ] DB 검증:
  ```sql
  SELECT * FROM magazine_analytics_events
  WHERE edition_id = 'test-broker-kim-2026-09-20'
  AND visitor_id = 'test-visitor-001'
  ORDER BY created_at DESC;
  ```
  - [ ] 레코드 존재

```bash
# FX-11-D: IM 클릭 (핫리드 트리거 가능)
curl -X POST http://localhost:3000/api/public/magazine/analytics \
  -H "Content-Type: application/json" \
  -d '{
    "edition_id": "test-broker-kim-2026-09-20",
    "visitor_id": "test-visitor-001",
    "event_type": "click",
    "target_url": "/im-lite/bldg-test-001",
    "target_param": "bldg-test-001",
    "metadata": {"broker_id": "test-broker-kim"}
  }'
```

- [ ] HTTP 200
- [ ] activity_events에 `magazine_to_im_click` 이벤트 생성 확인:
  ```sql
  SELECT * FROM activity_events
  WHERE event_type = 'magazine_to_im_click'
  ORDER BY created_at DESC LIMIT 1;
  ```

### TC-16.3 필수 필드 누락 시 에러

```bash
curl -X POST http://localhost:3000/api/public/magazine/analytics \
  -H "Content-Type: application/json" \
  -d '{"visitor_id": "test"}'
```

- [ ] HTTP 400
- [ ] `{ "error": "Missing required fields" }`

---

## TC-17. 설문 투표 — 온도 자동 상승

### TC-17.1 정상 투표 + 온도 부스팅

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-17.1 |
| **입력 데이터** | FX-12-A |

```bash
curl -X POST http://localhost:3000/api/public/magazine/poll \
  -H "Content-Type: application/json" \
  -d '{
    "brokerId": "{user_id}",
    "editionDate": "2026-09-20",
    "choice": 0,
    "subscriberPhone": "01011112222"
  }'
```

1. **응답 검증**:
   - [ ] `ok` = true
   - [ ] `results.total` ≥ 1
   - [ ] `results.counts` 객체에 `"0"` 키 존재
2. **바이어 온도 부스팅 검증**:
   ```sql
   SELECT interest_profile->>'readArticleCount' as read_count
   FROM magazine_subscribers
   WHERE subscriber_phone = '01011112222' LIMIT 1;
   ```
   - [ ] `readArticleCount` 이전 대비 +3 증가
3. **activity_events 확인**:
   ```sql
   SELECT * FROM activity_events
   WHERE event_type = 'poll_vote'
   ORDER BY created_at DESC LIMIT 1;
   ```
   - [ ] `metadata->>'choice'` = `0`

### TC-17.2 3번 선택지 → 세그먼트 자동 변경

| 항목 | 내용 |
|------|------|
| **입력 데이터** | FX-12-B (`choice: 2`) |

```bash
curl -X POST http://localhost:3000/api/public/magazine/poll \
  -H "Content-Type: application/json" \
  -d '{
    "brokerId": "{user_id}",
    "editionDate": "2026-09-20",
    "choice": 2,
    "subscriberPhone": "01033334444"
  }'
```

- [ ] 응답 정상
- [ ] **세그먼트 자동 변경 검증**:
  ```sql
  SELECT segment FROM magazine_subscribers
  WHERE subscriber_phone = '01033334444' LIMIT 1;
  ```
  - [ ] `segment` = `seller` (3번 선택지 → 자동 seller 분류)

### TC-17.3 중복 투표 방지

```bash
# 동일 에디션에 같은 전화번호로 재투표
curl -X POST http://localhost:3000/api/public/magazine/poll \
  -H "Content-Type: application/json" \
  -d '{
    "brokerId": "{user_id}",
    "editionDate": "2026-09-20",
    "choice": 1,
    "subscriberPhone": "01011112222"
  }'
```

- [ ] `alreadyVoted` = true
- [ ] `results` 포함 (기존 결과 반환)
- [ ] DB에 중복 레코드 없음

### TC-17.4 설문 결과 조회

```bash
curl "http://localhost:3000/api/public/magazine/poll?brokerId={user_id}&editionDate=2026-09-20"
```

- [ ] HTTP 200
- [ ] `results.total` = 총 투표 수
- [ ] `results.counts` = 선택지별 투표 수

---

## TC-18. 바이어 온도 분류 검증

### TC-18.1 5단계 분류 정합성

| 프로필 (FX-13) | 예상 온도 | 계산식 검증 |
|---------|----------|-----------|
| FX-13-A | 🔥 적극검토 | min(25×5,50)=50 + 2×10=20 + 2×5=10 + 30(7일내) = **110** → engagement. composite = 110×0.4 + 90×0.6 = **98** ≥ 80 ✅ |
| FX-13-B | 📈 관심 | min(12×5,50)=50 + 1×10=10 + 1×5=5 + 15(30일내) = **80**. composite = 80×0.4 + 55×0.6 = **65** ∈ [60,80) ✅ |
| FX-13-C | ⚪ 미확인 | profile=null → engagement=0. composite = 0×0.4 + 0×0.6 = **0** < 20 ✅ |

**검증 방법**:
1. 에디터 → 성과 탭 → 온도 분포 카운트 확인
2. 또는 API:
   ```bash
   curl "http://localhost:3000/api/broker/magazine/analytics" \
     -H "Cookie: {인증_쿠키}"
   ```
   - [ ] `temperatureDistribution` 객체에 5단계 카운트 반환
   - [ ] FX-13 기대값과 일치

---

## TC-19. 브로커 분석 API

### TC-19.1 대시보드 전체 조회

```bash
curl "http://localhost:3000/api/broker/magazine/analytics" \
  -H "Cookie: {인증_쿠키}"
```

- [ ] `subscriberCount` 숫자
- [ ] `editions` 배열
- [ ] `viewStats.totalViews` ≥ 0
- [ ] `viewStats.avgDwellSeconds` ≥ 0
- [ ] `viewStats.completionRate` 0~100
- [ ] `sectionStats` 배열 (각 sectionId별 count, avgDwellSeconds)
- [ ] `temperatureDistribution` 5단계
- [ ] `hotLeads` 상위 10명 배열
- [ ] `dailyTrend` 14일 배열
- [ ] `latestPollResults` 설문 결과 (있는 경우)

### TC-19.2 개별 구독자 드릴다운

```bash
curl "http://localhost:3000/api/broker/magazine/analytics?subscriberId={구독자_UUID}" \
  -H "Cookie: {인증_쿠키}"
```

- [ ] `subscriber` 구독자 상세 정보
- [ ] `analytics.totalViews` 해당 구독자 뷰 수
- [ ] `analytics.avgDwellSeconds` 평균 체류
- [ ] `analytics.viewedSections` 열람 섹션 목록
- [ ] `analytics.recentEvents` 최근 30건 이벤트

---

## TC-20. 이미지 에셋 생성

### TC-20.1 매거진 OG 이미지

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-20.1 |
| **URL** | FX-14 첫 번째 URL |

1. 브라우저에서 직접 접속:
   ```
   http://localhost:3000/api/og/magazine?brokerId=test-broker-kim&date=2026-09-20
   ```
2. **검증**:
   - [ ] `Content-Type: image/png` 응답
   - [ ] 이미지 크기: 1200×630
   - [ ] 시각 요소 확인:
     - [ ] "CRE DAILY MAGAZINE" 텍스트
     - [ ] 한국어 날짜 라벨
     - [ ] "✨ AI 맞춤형 인사이트" 필
     - [ ] 큰 헤드라인 텍스트
     - [ ] 브로커 아바타 이니셜 + 이름 + 소속
     - [ ] 전문 권역 뱃지
     - [ ] 핵심 지표 카드 (투자 심리, 매물 수, 시장 포스처)

### TC-20.2 프로모션 스토리 이미지 (1080×1920)

```
http://localhost:3000/api/magazine/test-broker-kim/2026-09-20/image?format=story
```

- [ ] `Content-Type: image/png`
- [ ] 이미지 크기: 1080×1920 (9:16)
- [ ] 시각 요소:
  - [ ] "CRE WEEKLY INTELLIGENCE" 헤더 + 날짜 필
  - [ ] 시장 온도 뱃지 (이모지 + 라벨 + 컬러)
  - [ ] "✨ AI 주간 분석" 필
  - [ ] 에디션 제목 (56px)
  - [ ] 키워드 태그
  - [ ] 테마 & AI 브리핑 카드
  - [ ] 전략 포스처 카드
  - [ ] 참여 티저: 설문 질문, 세무 클리닉 Q&A, ROI 시뮬레이션
  - [ ] 브로커 브랜딩 풋터: 아바타, 이름, 소속, 연락처

### TC-20.3 프로모션 카드 이미지 (1080×1080)

```
http://localhost:3000/api/magazine/test-broker-kim/2026-09-20/image?format=card
```

- [ ] `Content-Type: image/png`
- [ ] 이미지 크기: 1080×1080 (1:1)
- [ ] SNS 정사각형 카드 레이아웃

### TC-20.4 프로모션 OG 이미지 (1200×630)

```
http://localhost:3000/api/magazine/test-broker-kim/2026-09-20/image?format=og
```

- [ ] `Content-Type: image/png`
- [ ] 이미지 크기: 1200×630

### TC-20.5 기본 포맷 (format 누락)

```
http://localhost:3000/api/magazine/test-broker-kim/2026-09-20/image
```

- [ ] 기본값 `story` 적용
- [ ] 1080×1920 이미지 반환

### TC-20.6 존재하지 않는 브로커

```
http://localhost:3000/api/magazine/nonexistent-broker/2026-09-20/image?format=story
```

- [ ] 에러 핸들링: 기본 폴백 이미지 또는 HTTP 에러

---

## TC-21. QR 코드 생성 (MagazineQrModal)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-21 |
| **위치** | 에디터 → 아웃리치 탭 → QR 아이콘 |

1. QR 코드 모달 열기
2. **검증**:
   - [ ] QR 코드 이미지 렌더링 (300DPI)
   - [ ] QR 스캔 결과 URL: `/magazine/{brokerSlug}/subscribe?source=qr_card`
   - [ ] PNG 다운로드 버튼 → 파일 저장 검증
   - [ ] 링크 복사 버튼 → 클립보드에 URL 복사
3. **실제 스캔 테스트** (모바일):
   - [ ] QR 스캔 → 구독 페이지 열림
   - [ ] `source=qr_card` 파라미터 포함

---

## TC-22. 핫리드 실시간 알림 플로우

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-22 |
| **전제 조건** | FX-13-A 수준의 고관여 구독자 + 다수 IM 클릭 이벤트 |

1. FX-11-D (IM 클릭) 이벤트를 여러 차례 전송
2. **핫리드 판정 검증**:
   ```sql
   -- calculateLeadScore가 80 이상 반환 시 핫리드 알림 발생
   SELECT * FROM activity_events
   WHERE event_type IN ('hot_lead_alert', 'magazine_to_im_click')
   ORDER BY created_at DESC LIMIT 10;
   ```
3. **브로커 알림 수신** (해당 시):
   - [ ] 푸시/SMS 알림 발송 시도 로그 확인
   - [ ] 에디터 성과 탭 → 핫리드 피드에 즉시 표시

---

## TC-23. 통합 E2E 시나리오 (풀 사이클)

### TC-23.1 완전한 1주 사이클

| 단계 | 액터 | 행동 | 검증 |
|------|------|------|------|
| 1 | **시스템** | Cron → 주간 매거진 자동 생성 | TC-1.1 |
| 2 | **브로커** | 에디터에서 필드노트 + 커버 편집 → 발행 | TC-2.2 ~ TC-2.9 |
| 3 | **시스템** | 활성 구독자에게 카톡 + 이메일 배포 | TC-10.1 |
| 4 | **독자A** | 카톡 링크 클릭 → 매거진 열람 | TC-15.1 ~ TC-15.18 |
| 5 | **독자A** | 설문 투표 (1번 선택) | TC-17.1 |
| 6 | **독자A** | 추천 매물 → IM 클릭 | TC-16.2 (IM 클릭 이벤트) |
| 7 | **시스템** | 핫리드 판정 → 브로커 알림 | TC-22 |
| 8 | **독자A** | 매거진 전달하기 → 독자B에게 공유 | TC-11.1 |
| 9 | **독자B** | 전달 링크로 접속 → 구독 신청 | TC-7.4 |
| 10 | **시스템** | 레퍼럴 마일스톤 달성 | TC-11.2 |
| 11 | **브로커** | 성과 탭에서 핫리드 확인 → 전화 치트시트 | TC-3.2 |
| 12 | **브로커** | 핫리드 구독자 → AutoIntent 생성 | TC-9.6 |
| 13 | **브로커** | 급매 접수 → 긴급 속보 발행 | TC-4.1 ~ TC-4.2 |
| 14 | **시스템** | 관심 매칭 구독자에게만 플래시 배포 | TC-10.3 |

**성공 기준**: 14단계 전체 체크리스트 통과, DB 정합성 확인, 에러 로그 없음.

---

## 부록: 테스트 데이터 정리 SQL

테스트 완료 후 테스트 데이터를 정리할 때 사용합니다.

```sql
-- ⚠️ 주의: 테스트 환경에서만 실행

-- 테스트 구독자 삭제
DELETE FROM magazine_subscribers
WHERE subscriber_phone IN ('01011112222','01033334444','01055556666','01099990000','01088889999','01099998888');

-- 테스트 레퍼럴 삭제
DELETE FROM magazine_referrals
WHERE referrer_phone = '01011112222';

-- 테스트 설문 응답 삭제
DELETE FROM magazine_poll_responses
WHERE subscriber_phone IN ('01011112222','01033334444');

-- 테스트 텔레메트리 삭제
DELETE FROM magazine_analytics_events
WHERE visitor_id LIKE 'test-%';

-- 테스트 에디션 삭제 (필요 시)
-- DELETE FROM magazine_editions WHERE broker_id = 'test-broker-kim';
-- DELETE FROM magazine_issues WHERE broker_id = 'test-broker-kim';

-- 테스트 AutoIntent 삭제
DELETE FROM buyer_intent_lite
WHERE source = 'magazine_auto_intent'
AND purchase_purpose LIKE '%매거진 분석 기반%';
```
