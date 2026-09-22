# 01. 메모 → 딜카드 E2E 테스트 가이드

> **범위**: 브로커 메모 입력 → AI 라우팅 → 딜카드 자동 생성 → 바텀시트 prefill  
> **API**: `POST /api/broker/memo`  
> **인증**: Broker 로그인 필수 (Supabase Auth)  
> **전제조건**: 브로커 계정으로 로그인된 상태

---

## 1. 테스트 데이터 — 5대 포스처별 메모 입력

### TC-M01: 수익형 (income) 메모
```
매물 접수
당산동5가 11-47 근생빌딩
매매가 115억, 연면적 345평
1층 약국 월세 350만, 2층 내과 월세 280만
3층 헬스장 월세 250만, 4~5층 사무실 월세 각 200만
보증금 총 2.9억, 월세 총 1,946만
주차 8대, 엘베 1대, 2002년 준공
만실
```

**기대 결과**:
- `routing.type`: `"deal_card"` 또는 `"building_analysis"`
- `routing.summary`: 수익형 관련 키워드 포함
- 딜카드 자동 생성 시 `investment_posture` → `income`
- `layers.finance.asking_price_krw` ≈ 11,500,000,000
- `layers.finance.monthly_rent_krw` ≈ 19,460,000
- `layers.finance.total_deposit_krw` ≈ 290,000,000

---

### TC-M02: 개발형 (development) 메모
```
잠원동 26-14, 16번지 2필지 개발 검토 요청
매매가 242억, 토지 186.6평 (616.1㎡)
현황: 5층 근생 (1990년 준공) — 철거 후 신축 예정
신축 규모: B1~6F RC조, 연면적 1,530평
예상 건축비 평당 1,200만
용도: 근생/의원/업무시설 복합
명도는 매도인 책임
기존 임차인 11호실 — 보증금 10.3억, 월세 3,335만
제2종일반주거지역, 건폐율 49.76%, 용적률 247%
```

**기대 결과**:
- `routing.type`: `"deal_card"`
- `investment_posture` → `development`
- `developmentSpec.targetScalePyeong` ≈ 1530
- `developmentSpec.constructionCostPerPyeong` ≈ 1200만
- 다필지 정보 (2필지) 파싱

---

### TC-M03: 자가사용형 (owner_occupied) 메모
```
서초동 1364-28 사옥 매물 안내
매매가 230억, 연면적 637평
2005년 준공, 지하1~지상7층
주차 20대, 엘리베이터 1대
현재 2층, 4층, 5층 공실 (사옥용 즉시 입주 가능)
IT기업 50인 규모 사옥 적합
지하철 교대역 도보 7분
제3종일반주거지역
```

**기대 결과**:
- `investment_posture` → `owner_occupied`
- 공실률 약 37.5% 파싱
- 사옥 적합성 키워드 감지

---

### TC-M04: 단기매매형 (trading) 메모
```
신사동 590 매물 정보
매매가 760억, 토지 321평 (1,061.9㎡)
1998년 준공, 지하2~지상6층
제3종일반주거, 용적률 237.2%
비교사례: 신사동 586-6 (550억), 559-6 (680억)
단기 매매차익 가능 — 최근 1년 인근 거래가 상승 추세
주차 26대
```

**기대 결과**:
- `investment_posture` → `trading`
- `manual_comps` 비교사례 2건 파싱
- `asking_price_krw` ≈ 76,000,000,000

---

### TC-M05: 운영형 (operating) 메모
```
대현동 56-1 관광호텔 매물
매매가 300억, 연면적 1,163평
2016년 준공, B2~12F
총 94실 (스탠다드 74, 디럭스 14, 스위트 6)
ADR 9.5만, 객실가동률 78%
연매출 28.2억, GOP 마진 38%
운영사: 에이치에비뉴 (MC 계약, 2029년 만료)
관광호텔업 3급, 외국인비율 45%
주차 18대, 엘리베이터 2대
```

**기대 결과**:
- `investment_posture` → `operating`
- `hotel_operating.total_rooms` ≈ 94
- `hotel_operating.adr` ≈ 95,000
- `hotel_operating.gop_margin_pct` ≈ 38

---

## 2. API 직접 테스트 (curl)

### 2.1 메모 전송
```bash
curl -X POST https://{DOMAIN}/api/broker/memo \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {BROKER_JWT}" \
  -d '{
    "memo": "당산동5가 11-47 근생빌딩\n매매가 115억\n월세 총 1,946만\n보증금 2.9억\n만실"
  }'
```

**성공 응답** (200):
```json
{
  "ok": true,
  "data": {
    "originalMemo": "당산동5가 11-47 ...",
    "routing": {
      "type": "deal_card",
      "summary": "영등포구 당산동 근생빌딩 수익형 매물..."
    },
    "memoId": "uuid-or-null"
  }
}
```

### 2.2 에러 케이스

| 테스트 | 입력 | 기대 Status | 기대 응답 |
|:---|:---|:---:|:---|
| **TC-M06** 빈 메모 | `{"memo": ""}` | 400 | `Memo required` |
| **TC-M07** 미인증 | Authorization 없음 | 401 | `Unauthorized` |
| **TC-M08** 초과길이 | 10,001자 이상 | 400 | Zod validation error |
| **TC-M09** JSON 아님 | `plain text body` | 400 | `Invalid JSON` |

---

## 3. UI 기반 테스트 플로우

### 3.1 메모 → 딜카드 생성 플로우
```
1. 브로커 대시보드 로그인
2. 메모 입력 영역에 TC-M01 텍스트 붙여넣기
3. "분석 시작" 버튼 클릭
4. ✅ 검증: AI 라우팅 결과 표시 (type, summary)
5. ✅ 검증: 딜카드 자동 생성 확인
6. 딜카드 페이지 이동
7. ✅ 검증: 주소 "당산동5가 11-47" 표시
8. ✅ 검증: 매매가 "115억" 표시
9. ✅ 검증: 데이터 등급 (A/B/C/D) 표시
10. ✅ 검증: 4개 탭 (Overview, IM, Buyers, Analytics) 렌더링
```

### 3.2 딜카드 페이지 확인 항목

| 영역 | 검증 항목 | 기대값 (TC-M01 기준) |
|:---|:---|:---|
| 헤더 | 건물명/주소 | 당산동5가 11-47 |
| 헤더 | 매매가 | 115억원 |
| 헤더 | 데이터 등급 | B 이상 |
| Overview 탭 | 시그널 카드 | areaSignal, priceBand 등 |
| Overview 탭 | 사진 갤러리 | 존재 시 렌더링 |
| IM 탭 | ImManagementPanel | "기본 IM 만들기" 버튼 |
| Sticky CTA | CreateMobileImButton | "⚡ 기본 IM" 버튼 표시 |
| Sticky CTA | KakaoShareButton | 카카오 공유 버튼 |

---

## 4. broker_memos 테이블 미존재 시나리오 (P-C5)

| 테스트 | 시나리오 | 기대 동작 |
|:---|:---|:---|
| **TC-M10** | broker_memos 테이블 없음 | activity_events 폴백 저장 성공, 로그에 `[P-C5]` 경고 |
| **TC-M11** | activity_events도 실패 | memoId = null, 라우팅은 정상 반환 |

---

## 5. 체크리스트

- [ ] 5대 포스처 메모 각각 딜카드 생성 확인
- [ ] AI 라우팅 `type`이 `deal_card`로 분류되는지 확인
- [ ] 파싱된 금액/면적/주소가 딜카드에 정확히 반영되는지 확인
- [ ] 미인증/빈메모/초과길이 에러 처리 확인
- [ ] 딜카드 페이지 4개 탭 모두 렌더링 확인
- [ ] Sticky CTA 3개 버튼 모두 표시 확인
- [ ] layers.finance와 layers.lease_summary 동기화 확인 (W-3)
