# 매거진 E2E 테스트 가이드 Part 1 — 생성 & 에디터

> **문서 버전**: v1.0 (2026-09-20)  
> **대상 독자**: QA 테스터, 개발자  
> **선행 조건**: 로컬 개발 서버 구동 (`npm run dev`), Supabase 연결, 테스트 브로커 계정 로그인  
> **관련 문서**: [MAGAZINE_FEATURE_GUIDE.md](./MAGAZINE_FEATURE_GUIDE.md)

---

## 테스트 픽스처 (공통)

### FX-01. 테스트 브로커 프로필

```json
{
  "_fixture_id": "FX-01",
  "_description": "매거진 테스트용 브로커 프로필 — Supabase broker_profiles에 존재해야 함",
  "slug": "test-broker-kim",
  "display_name": "김테스트",
  "company": "테스트부동산중개법인",
  "phone": "010-1234-5678",
  "photo_url": null,
  "tagline": "강남·서초 꼬마빌딩 전문",
  "specialty_regions": ["강남", "서초"],
  "specialty_assets": ["꼬마빌딩", "상가"],
  "subscription_active": true,
  "bio": "강남권 10년 경력 중개사",
  "magazine_title": "김테스트의 주간 CRE 리포트",
  "magazine_theme_color": "#6366f1",
  "magazine_cover_image": null
}
```

### FX-02. 테스트 매물 데이터

```json
[
  {
    "_fixture_id": "FX-02-A",
    "id": "bldg-test-001",
    "address": "서울시 강남구 역삼동 123-45",
    "area_signal": "강남·역삼",
    "asset_type": "꼬마빌딩",
    "price": 5000000000,
    "status": "public_signal_ready",
    "photo_urls": ["https://via.placeholder.com/400x300"],
    "attrs": {
      "total_area_pyeong": 85.3,
      "land_area_pyeong": 42.1,
      "floors_above": 5,
      "floors_below": 1,
      "year_built": 2015,
      "cap_rate": 4.2,
      "noi_annual": 210000000
    },
    "buyer_interest_count": 7
  },
  {
    "_fixture_id": "FX-02-B",
    "id": "bldg-test-002",
    "address": "서울시 서초구 서초동 789-10",
    "area_signal": "서초·방배",
    "asset_type": "상가",
    "price": 3200000000,
    "status": "active",
    "photo_urls": [],
    "attrs": {
      "total_area_pyeong": 120.5,
      "floors_above": 3,
      "cap_rate": 5.1
    },
    "buyer_interest_count": 3
  }
]
```

### FX-03. 테스트 뉴스 데이터

```json
[
  {
    "_fixture_id": "FX-03",
    "id": "news-test-001",
    "title": "한국은행, 기준금리 동결… 하반기 인하 시사",
    "summary": "한국은행이 기준금리를 3.25%로 동결하면서도 하반기 인하 가능성을 시사했습니다.",
    "source": "한국경제",
    "sentiment": "bullish",
    "importance_score": 9,
    "topic": "금리"
  },
  {
    "_fixture_id": "FX-03",
    "id": "news-test-002",
    "title": "강남 상업용 부동산 공실률 3년래 최저",
    "summary": "강남구 오피스 공실률이 2.1%로 하락하며 임대 시장 호황이 지속되고 있습니다.",
    "source": "매일경제",
    "sentiment": "bullish",
    "importance_score": 8,
    "topic": "오피스"
  },
  {
    "_fixture_id": "FX-03",
    "id": "news-test-003",
    "title": "서울시 재건축 규제 완화 검토 착수",
    "summary": "서울시가 재건축 안전진단 기준 완화를 검토하기 시작했습니다.",
    "source": "조선일보",
    "sentiment": "neutral",
    "importance_score": 7,
    "topic": "정책"
  }
]
```

### FX-04. 테스트 실거래 데이터

```json
[
  {
    "_fixture_id": "FX-04",
    "address": "서울시 강남구 역삼동 456-78",
    "dong": "역삼동",
    "transaction_price": 7200000000,
    "usage_type": "상업업무용",
    "building_area": 210.5,
    "transaction_date": "2026-09-15"
  },
  {
    "_fixture_id": "FX-04",
    "address": "서울시 서초구 서초동 111-22",
    "dong": "서초동",
    "transaction_price": 4500000000,
    "usage_type": "근린생활시설",
    "building_area": 155.2,
    "transaction_date": "2026-09-10"
  }
]
```

### FX-05. 브로커 필드노트 입력 샘플

```json
{
  "_fixture_id": "FX-05",
  "question": "이번 주 강남 꼬마빌딩 시장은 어떤 분위기인가요?",
  "buyerReaction": "금리 인하 기대감으로 매수 문의가 전주 대비 30% 증가했습니다. 특히 역삼·삼성 권역 50억 이하 물건에 집중됩니다.",
  "sellerReaction": "아직 호가 조정 의사가 낮습니다. 매도자 대부분이 '급할 이유 없다'는 입장입니다.",
  "marketJudgment": "선별적 매수 기회. Cap Rate 4% 이상 물건 우선 검토 권장.",
  "comment": "이번 주 눈여겨볼 매물은 역삼동 5층 코너 건물입니다. 리모델링 후 임대료 상승 여력이 큽니다."
}
```

### FX-06. 에디터 커버 설정 샘플

```json
{
  "_fixture_id": "FX-06",
  "market_temp": "선별 매수",
  "cover_keywords": ["금리 동결", "공실률 최저", "선별 매수"],
  "headline": "하반기 금리 인하 기대 속, 강남 투자 기회 분석",
  "ai_briefing_seed": "이번 주 가장 주목할 것은 한국은행의 금리 동결 결정입니다...",
  "cover_image_url": "https://via.placeholder.com/1200x800"
}
```

---

## TC-1. 주간 매거진 자동 생성 (Cron)

### TC-1.1 정상 Cron 트리거

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-1.1 |
| **전제 조건** | FX-01 브로커가 DB에 존재, `subscription_active = true` |
| **테스트 대상** | `GET /api/cron/weekly-magazine` |

**단계별 실행**:

1. **터미널에서 Cron 호출 시뮬레이션**:
   ```bash
   curl -X GET http://localhost:3000/api/cron/weekly-magazine \
     -H "Authorization: Bearer ${CRON_SECRET}" \
     -H "Content-Type: application/json"
   ```

2. **검증 체크리스트**:
   - [ ] HTTP 200 응답 수신
   - [ ] 응답 JSON에 `succeeded` 카운트 ≥ 1
   - [ ] `results` 배열에 테스트 브로커 slug 포함
   - [ ] 해당 브로커의 `status`가 `draft` 또는 `published`

3. **DB 검증** (Supabase SQL Editor):
   ```sql
   -- magazine_editions에 레코드 생성 확인
   SELECT id, broker_id, edition_type, edition_label, status, 
          content->>'headline' as headline,
          content->>'market_temp' as market_temp,
          created_at
   FROM magazine_editions
   WHERE broker_id = 'test-broker-kim'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   - [ ] `edition_type` = `weekly`
   - [ ] `edition_label` = 현재 주차 (예: `W38-2026`)
   - [ ] `status` = `draft` (정상) 또는 `needs_review` (품질 게이트 실패)
   - [ ] `content->>'headline'`이 비어있지 않음

   ```sql
   -- magazine_issues 듀얼 라이트 확인
   SELECT broker_id, issue_date, content->>'headline' as headline
   FROM magazine_issues
   WHERE broker_id = 'test-broker-kim'
   ORDER BY issue_date DESC
   LIMIT 1;
   ```
   - [ ] 동일 날짜의 issue_date 존재
   - [ ] content가 magazine_editions와 동일

4. **콘텐츠 품질 검증**:
   ```sql
   SELECT 
     content->>'ai_briefing' IS NOT NULL as has_briefing,
     content->>'theme_title' IS NOT NULL as has_theme,
     content->'poll'->>'question' IS NOT NULL as has_poll,
     content->'broker'->>'name' as broker_name,
     jsonb_array_length(content->'topNews') as news_count,
     jsonb_array_length(content->'dealHighlights') as deal_count,
     content->>'market_temp' as market_temp,
     jsonb_array_length(content->'cover_keywords') as keyword_count
   FROM magazine_editions
   WHERE broker_id = 'test-broker-kim'
   ORDER BY created_at DESC LIMIT 1;
   ```
   - [ ] `has_briefing` = true
   - [ ] `has_theme` = true
   - [ ] `has_poll` = true
   - [ ] `broker_name` = "김테스트"
   - [ ] `news_count` ≥ 1
   - [ ] `market_temp` ∈ {적극 매수, 선별 매수, 관망, 조정 대기, 위기 경계}
   - [ ] `keyword_count` = 3

### TC-1.2 Cron 인증 실패

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-1.2 |

```bash
# 잘못된 시크릿
curl -X GET http://localhost:3000/api/cron/weekly-magazine \
  -H "Authorization: Bearer WRONG_SECRET"
```

- [ ] HTTP 401 응답
- [ ] `{ "error": "Unauthorized" }`

```bash
# 인증 헤더 없이
curl -X GET http://localhost:3000/api/cron/weekly-magazine
```

- [ ] HTTP 401 응답

### TC-1.3 품질 게이트 차단 시나리오

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-1.3 |
| **설명** | 품질 게이트가 `needs_review`를 반환할 때 배포가 차단되는지 확인 |

**검증 방법**:
1. 이전 TC-1.1 실행 후 edition 상태 확인
2. 상태가 `needs_review`인 경우:
   ```sql
   -- 해당 에디션에 대한 배포 이벤트가 없음을 확인
   SELECT COUNT(*) as distribution_count
   FROM activity_events
   WHERE event_type = 'magazine_distributed'
   AND metadata->>'edition_label' = 'W38-2026'
   AND actor_id = (SELECT user_id FROM broker_profiles WHERE slug = 'test-broker-kim');
   ```
   - [ ] `distribution_count` = 0

---

## TC-2. 매거진 에디터 UI

### TC-2.1 에디터 진입 & 초기 로딩

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-2.1 |
| **전제 조건** | 브로커 계정으로 로그인 |
| **URL** | `http://localhost:3000/broker/magazine-editor` |

**단계별 실행**:

1. 브라우저에서 매거진 에디터 접속
2. **검증 체크리스트 — 레이아웃**:
   - [ ] 좌측 에디터 패널 (460px) 표시
   - [ ] 우측 iPhone 14 Pro 프리뷰 프레임 (375×812) 표시
   - [ ] 카메라 노치 장식 표시
   - [ ] 8개 탭 아이콘 모두 표시: 커버/필드노트/테마&매물/뉴스/AI비서/아웃리치/발행설정/성과

3. **검증 체크리스트 — 데이터 로딩**:
   - [ ] 최근 에디션이 있으면 커버 탭에 기존 데이터 프리필
   - [ ] 매물 목록이 테마&매물 탭에 로딩
   - [ ] 구독자 수가 아웃리치 탭에 표시
   - [ ] 뉴스 카드가 뉴스 탭에 표시

### TC-2.2 커버 탭 편집 (EditorCoverTab)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-2.2 |
| **입력 데이터** | FX-06 |

1. **커버** 탭 클릭
2. **시장 온도 선택**:
   - [ ] 5개 버튼 모두 클릭 가능: 적극 매수 / 선별 매수 / 관망 / 조정 대기 / 위기 경계
   - [ ] 각 버튼에 이모지 + 컬러 태그 표시
   - [ ] 선택 시 우측 프리뷰의 커버 온도 뱃지 실시간 변경
3. **키워드 입력**:
   - [ ] 3개 입력란에 FX-06의 키워드 각각 입력
   - [ ] 프리뷰 커버에 키워드 태그 3개 실시간 반영
4. **헤드라인 입력**:
   - [ ] FX-06 헤드라인 입력
   - [ ] 프리뷰 커버 제목 실시간 반영
5. **AI 브리핑 편집**:
   - [ ] 텍스트 영역에 마크다운 입력
   - [ ] 프리뷰 AI 브리핑 섹션 실시간 반영
6. **커버 이미지 업로드**:
   - [ ] "이미지 업로드" 버튼 클릭
   - [ ] 300KB 이상 JPG/PNG 파일 선택
   - [ ] 업로드 진행 표시
   - [ ] 프리뷰 커버 배경 이미지 변경 확인
   - [ ] 또는 URL 직접 입력으로 이미지 적용 확인

### TC-2.3 필드노트 탭 편집 (EditorFieldNoteTab)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-2.3 |
| **입력 데이터** | FX-05 |

1. **필드노트** 탭 클릭
2. 5개 텍스트 영역에 FX-05 데이터 순서대로 입력:
   - [ ] 💬 주간 시장 요약 → `question` 입력
   - [ ] 📈 매수자 반응 → `buyerReaction` 입력
   - [ ] 📉 매도자 반응 → `sellerReaction` 입력
   - [ ] 🌡️ 시장 판단 → `marketJudgment` 입력
   - [ ] 💡 독자에게 한마디 → `comment` 입력
3. **프리뷰 검증**:
   - [ ] 우측 프리뷰에서 필드노트 섹션으로 스크롤
   - [ ] 5개 항목 모두 이모지 + 라벨과 함께 표시
   - [ ] 줄바꿈이 올바르게 렌더링

### TC-2.4 테마&매물 탭 (EditorThemeDealsTab)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-2.4 |

1. **테마&매물** 탭 클릭
2. **테마 제목** 입력: "하반기 강남 역세권 투자 기회"
3. **테마 본문** 마크다운 입력 (200자 이상)
4. **매물 체크박스**:
   - [ ] 활성 매물 목록이 주소, 권역, 가격과 함께 표시
   - [ ] 체크박스 ON → 프리뷰 "금주의 테마" 섹션에 해당 매물 카드 노출
   - [ ] 체크박스 OFF → 매물 카드 제거
5. **프리뷰 검증**:
   - [ ] 테마 제목이 큰 글씨로 표시
   - [ ] 본문이 마크다운 렌더링
   - [ ] 체크된 매물들이 테마 카드 하단에 링크

### TC-2.5 뉴스 큐레이션 (NewsCurationPanel)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-2.5 |

1. **뉴스** 탭 클릭
2. **뉴스 카드 확인**:
   - [ ] 최소 1개 이상의 뉴스 카드 표시
   - [ ] 각 카드에 제목, AI 요약, 출처, 중요도 ⭐, 감성 뱃지 표시
   - [ ] 감성 뱃지 색상: bullish=초록, bearish=빨강, neutral=회색
3. **토글 테스트**:
   - [ ] 토글 OFF → 해당 뉴스가 프리뷰 "뉴스 큐레이션" 섹션에서 제거
   - [ ] 토글 ON → 뉴스 복원
   - [ ] 최대 6개까지 프리뷰에 표시

### TC-2.6 AI 비서 (EditorAiAssistTab)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-2.6 |

1. **AI비서** 탭 클릭
2. 텍스트 입력란에 거친 메모 입력:
   ```
   이번주 역삼동 물건 좋다. 캡레이트 4.2% 리모델링하면 더 올라갈듯. 
   투자자한테 추천할만함.
   ```
3. **AI 변환 버튼** 클릭
4. **검증**:
   - [ ] 로딩 인디케이터 표시
   - [ ] 전문적인 존댓말 코멘터리 생성 (원문 대비 문체 향상)
   - [ ] 클립보드 복사 버튼 작동
   - [ ] 복사된 텍스트를 다른 탭에 붙여넣기 가능

### TC-2.7 아웃리치 탭 — 구독자 관리 (EditorOutreachTab)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-2.7 |

1. **아웃리치** 탭 클릭 → **구독자 관리** 서브탭
2. **구독자 목록 확인**:
   - [ ] 구독자 리스트 로딩 (이름, 전화, 채널, 온도 뱃지)
   - [ ] 바이어 온도 필터 5단계 작동 (🔥/📈/⏸️/❄️/⚪)
   - [ ] 채널 필터 (카카오/이메일/둘다) 작동
   - [ ] 검색 입력 필터링 작동
3. **수동 구독자 추가**:
   - [ ] 추가 폼에 이름: "테스트투자자", 전화: "01099998888" 입력
   - [ ] 추가 버튼 클릭 → 목록에 새 구독자 표시
   - [ ] 온도 뱃지: ⚪ 미확인 (신규)
4. **구독자 상세 슬라이드오버**:
   - [ ] 구독자 클릭 → 상세 패널 열림
   - [ ] 태그 편집 가능
   - [ ] AutoIntent 생성 버튼 클릭 → buyer_intent_lite 레코드 생성 확인
5. **QR 코드 모달**:
   - [ ] QR 아이콘 버튼 클릭 → MagazineQrModal 열림
   - [ ] QR 코드 이미지 렌더링
   - [ ] QR 스캔 → `/magazine/{brokerId}/subscribe?source=qr_card` URL
   - [ ] PNG 다운로드 버튼 작동
   - [ ] 링크 복사 버튼 작동

### TC-2.8 발행 설정 탭

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-2.8 |

1. **발행설정** 탭 클릭
2. **에디션 정보 확인**:
   - [ ] 에디션 라벨 (W##-YYYY) 표시
   - [ ] 테마 컬러 선택기 작동
3. **타겟 세그먼트 설정**:
   - [ ] buyer / seller / all 선택 가능
   - [ ] 선택 시 프리뷰 섹션 순서 즉시 변경
4. **1-Click 설문 설정**:
   - [ ] 설문 질문 입력란 표시
   - [ ] 선택지 3개 편집 가능
5. **섹션 재배치**:
   - [ ] 드래그 앤 드롭 또는 순서 변경 UI
   - [ ] 프리뷰에 즉시 반영
6. **스토리 이미지 다운로드**:
   - [ ] 다운로드 버튼 클릭 → 1080×1920 PNG 파일 저장
7. **초안 저장**:
   - [ ] "초안 저장" 버튼 클릭
   - [ ] 저장 상태 인디케이터: saving → saved → idle
   - [ ] DB 확인:
     ```sql
     SELECT status FROM magazine_editions
     WHERE broker_id = 'test-broker-kim'
     ORDER BY created_at DESC LIMIT 1;
     ```
   - [ ] `status` = `draft` 또는 `editing`

### TC-2.9 발행 & 공유

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-2.9 |
| **전제 조건** | TC-2.2 ~ TC-2.8 완료 |

1. **"발행 & 공유"** 버튼 클릭
2. **검증 — DB**:
   ```sql
   SELECT status, published_at
   FROM magazine_editions
   WHERE broker_id = 'test-broker-kim'
   ORDER BY created_at DESC LIMIT 1;
   ```
   - [ ] `status` = `published`
   - [ ] `published_at` IS NOT NULL
3. **검증 — 활동 로그**:
   ```sql
   SELECT * FROM activity_events
   WHERE event_type = 'magazine_distributed'
   ORDER BY created_at DESC LIMIT 1;
   ```
   - [ ] 레코드 존재
4. **검증 — 공유 모달**:
   - [ ] MagazineShareModal 팝업 표시
   - [ ] 🎉 축하 메시지 표시
   - [ ] "카카오톡으로 공유" 버튼 표시
   - [ ] "링크 복사" 버튼 클릭 → 클립보드에 URL 복사
   - [ ] 복사된 URL 형식: `https://credeal.net/magazine/{brokerId}/{date}`

### TC-2.10 자동 저장 (30초 디바운스)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-2.10 |

1. 에디터에서 **미발행 상태**의 에디션 편집
2. 커버 헤드라인 변경
3. **30초 대기** (아무 작업 안 함)
4. **검증**:
   - [ ] 저장 상태 인디케이터가 `saving` → `saved` 변경
   - [ ] Network 탭에서 `PATCH /api/magazine/editions` 호출 확인
5. **이미 발행된 에디션일 때**:
   - [ ] 자동 저장 작동하지 **않음** 확인 (발행 에디션은 수동 저장만)

---

## TC-3. 에디터 성과 탭 (EditorAnalyticsTab)

### TC-3.1 대시보드 KPI 로딩

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-3.1 |
| **전제 조건** | 최소 1개 발행 에디션 + 열람 기록 존재 |

1. **성과** 탭 클릭
2. **KPI 카드 4개 검증**:
   - [ ] 30일 누적 조회수 표시 (숫자)
   - [ ] 평균 체류 시간 표시 (초 단위)
   - [ ] 완독률 표시 (% — scroll_depth 100% 비율)
   - [ ] 활성 구독자 수 표시
3. **설문 결과 분포**:
   - [ ] 최근 설문 질문 텍스트 표시
   - [ ] 선택지별 투표 비율 막대 그래프
4. **바이어 온도 필터**:
   - [ ] 5단계 필터 버튼 표시
   - [ ] 각 단계별 구독자 수 카운트
   - [ ] 필터 클릭 → 핫리드 목록 필터링
5. **핫리드 피드**:
   - [ ] 상위 10명 구독자 목록 (이름, 전화, 온도, 최근 활동)
6. **섹션 히트맵**:
   - [ ] 각 섹션별 조회 수 막대 차트
   - [ ] 평균 체류 시간 표시

### TC-3.2 전화 오프닝 치트시트

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-3.2 |

1. 핫리드 목록에서 특정 구독자 **"전화 준비"** 버튼 클릭
2. **검증**:
   - [ ] 모달 팝업 표시
   - [ ] AI가 생성한 전화 오프닝 스크립트 표시
   - [ ] 구독자의 최근 열람 섹션과 관심사 반영
   - [ ] 복사 버튼 작동

---

## TC-4. 긴급 속보 (Special Edition)

### TC-4.1 속보 프리뷰

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-4.1 |
| **전제 조건** | FX-02-A 매물 + 활성 구독자 존재 |

1. 에디터 내 긴급 속보 버튼 클릭 (또는 매물 상세에서 트리거)
2. **SpecialEditionModal** 열림:
   - [ ] 매물 정보 표시 (권역, 자산유형, 가격대)
   - [ ] `totalSubscribers` 전체 구독자 수 표시
   - [ ] `targetCount` 관심 매칭 구독자 수 표시
   - [ ] `hotLeadCount` 핫리드 수 표시
   - [ ] `matchedPreview` 매칭 구독자 미리보기 (이름, 온도)

### TC-4.2 속보 발행

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-4.2 |

1. 긴급 헤드라인 입력: "[단독 속보] 역삼 꼬마빌딩 급매"
2. 브로커 메모 입력: "소유주 사정으로 시세 대비 10% 할인"
3. **"발행"** 버튼 클릭
4. **검증 — DB**:
   ```sql
   SELECT id, edition_type, edition_label, status, theme_color,
          content->>'headline' as headline,
          content->>'isSpecial' as is_special
   FROM magazine_editions
   WHERE broker_id = 'test-broker-kim'
   AND edition_type = 'special'
   ORDER BY created_at DESC LIMIT 1;
   ```
   - [ ] `edition_type` = `special`
   - [ ] `edition_label` LIKE `FLASH-%`
   - [ ] `status` = `published`
   - [ ] `theme_color` = `#ef4444` (빨강)
   - [ ] `headline`에 "[단독 속보]" 포함
   - [ ] `is_special` = `true`
5. **검증 — 배포**:
   ```sql
   SELECT COUNT(*) FROM activity_events
   WHERE event_type = 'magazine_distributed'
   AND metadata->>'edition_type' = 'special'
   ORDER BY created_at DESC;
   ```
   - [ ] 배포 이벤트 레코드 존재 (autoDistribute=true 기본값)

---

## TC-5. API 직접 호출 테스트

### TC-5.1 매거진 데이터 API

```bash
# 당일 매거진 데이터 조회 (캐시 또는 실시간 생성)
curl http://localhost:3000/api/magazine/test-broker-kim
```

- [ ] HTTP 200
- [ ] `data.headline` 비어있지 않음
- [ ] `data.broker.name` = "김테스트"
- [ ] `data.topNews` 배열 존재
- [ ] `data.sentiment.score` 0~100 범위
- [ ] `cached` 필드 존재 (true 또는 false)

### TC-5.2 에디션 목록 API

```bash
curl "http://localhost:3000/api/magazine/editions?broker_id=test-broker-kim&type=weekly&limit=5"
```

- [ ] HTTP 200
- [ ] `editions` 배열 반환
- [ ] `total` 숫자 반환
- [ ] 각 에디션에 `id`, `edition_label`, `status`, `created_at` 포함

### TC-5.3 에디션 생성 API (인증 필요)

```bash
curl -X POST http://localhost:3000/api/magazine/editions \
  -H "Content-Type: application/json" \
  -H "Cookie: {인증_쿠키}" \
  -d '{"edition_type": "weekly"}'
```

- [ ] HTTP 201
- [ ] `edition` 객체 반환
- [ ] `edition.status` = `draft`

### TC-5.4 에디션 수정 API (인증 필요)

```bash
curl -X PATCH http://localhost:3000/api/magazine/editions \
  -H "Content-Type: application/json" \
  -H "Cookie: {인증_쿠키}" \
  -d '{
    "id": "{에디션_ID}",
    "title": "수정된 제목",
    "market_temp": "관망",
    "cover_keywords": ["금리", "관망", "하반기"]
  }'
```

- [ ] HTTP 200
- [ ] `edition.title` = "수정된 제목"
- [ ] 허용 필드만 업데이트됨 (화이트리스트 검증)

**화이트리스트 외 필드 거부 테스트**:
```bash
curl -X PATCH http://localhost:3000/api/magazine/editions \
  -H "Content-Type: application/json" \
  -H "Cookie: {인증_쿠키}" \
  -d '{
    "id": "{에디션_ID}",
    "broker_id": "hacker-attempt"
  }'
```

- [ ] `broker_id` 변경 불가 (무시되거나 오류)

---

## TC-6. 에디터 실시간 프리뷰 (MagazinePhonePreview)

| 항목 | 내용 |
|------|------|
| **테스트 ID** | TC-6 |

1. 에디터 좌측에서 아무 내용 변경
2. **우측 프리뷰 즉시 반영 확인**:
   - [ ] 커버 영역: 온도 뱃지, 키워드, 헤드라인
   - [ ] 필드노트 영역: 5개 항목
   - [ ] 테마 영역: 테마 제목 + 체크된 매물
   - [ ] 뉴스 영역: 토글 on/off 반영
3. **프리뷰 스크롤**:
   - [ ] 프리뷰 프레임 내 스크롤 가능 (375×812 뷰포트)
   - [ ] 모든 섹션 순차 표시
4. **반응형 검증**:
   - [ ] 프리뷰 내 텍스트가 모바일 뷰 최적화 (줄바꿈 정상)
   - [ ] 이미지가 프리뷰 폭 내 수축
