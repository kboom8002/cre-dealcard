# API 키 기반 데이터 파이프라인 전면 실제화 계획

## 확보된 키 → 활성화 가능 데이터 소스 매핑

| 키 | 활성화 대상 | 테이블 | 현재 상태 → 개선 후 |
|---|---|---|---|
| **DATA_GO_KR_API_KEY** | 상업용 실거래 (MOLIT) | `external_transactions` | ⚠️→✅ 실제 국토부 데이터 |
| **DATA_GO_KR_API_KEY** | 한국부동산원 임대동향 | `rental_trend_data` | ❌→✅ **파이프라인 단절 복구** |
| **DATA_GO_KR_API_KEY** | 공시지가 | `official_land_prices` | 🟡→✅ fallback→실제 |
| **DATA_GO_KR_API_KEY** | 에너지효율등급 | `energy_ratings` | ❌→✅ **더미 제거** |
| **DATA_GO_KR_API_KEY** | 건축허가 | `construction_permits` | ⚠️→✅ 실제 데이터 |
| **SEMAS_API_KEY** | 소상공인 상권분석 | `commercial_district` | 🟡→✅ fallback→실제 |
| **NAVER_CLIENT_ID/SECRET** | 뉴스/경매/리서치/감성 | 4개 테이블 | ⚠️→✅ 네이버 API 활성화 |
| **YOUTUBE_API_KEY** | YouTube 트렌드 | `youtube_trends` | ❌→✅ 활성화 |

> [!IMPORTANT]
> **7개 API 키로 10개 데이터 테이블 전체 활성화 가능.** 현재 RSS 뉴스 1개만 작동 → **10개 전체 실제화.**

---

## 코드 수정 필요 사항

### 1. 🔴 `rental_trend_data` 파이프라인 단절 복구

**현재 문제**: `fetchRentalTrend`가 한국부동산원 API → `rental_trend_data` 테이블에 저장하지만, `morning-intelligence/route.ts`가 **이 테이블을 읽지 않음**.

#### [MODIFY] [route.ts](file:///c:/Users/User/cre-dealcard/src/app/api/broker/morning-intelligence/route.ts)
- `rental_trend_data` 테이블 조회 추가 (공실률, 임대가격지수)
- AI 브리핑에 한국부동산원 공식 데이터 전달
- 응답에 `rentalTrend` 필드 추가

---

### 2. 🔴 morning-detail 임대 섹션 데이터 셰이프 불일치 수정

**현재 문제**: detail 페이지가 `rentalMarket.officeInsight` 속성을 찾지만, API는 `{type, deposit, rent, vacancy, source}[]` 배열 반환.

#### [MODIFY] [morning-detail/page.tsx](file:///c:/Users/User/cre-dealcard/src/app/(broker)/broker/morning-detail/page.tsx)
- L128-133: 배열 구조에 맞게 렌더링 수정
- `rental_trend_data` (한국부동산원 공실률/임대지수) 추가 표시

---

### 3. 🟡 에너지효율등급 더미 제거

**현재 문제**: `fetchEnergyRating`이 항상 하드코딩 기본값(`1++등급`, `145.2 kWh`)을 삽입 → API 실패해도 더미가 들어감.

#### [MODIFY] [gov-premium-apis.ts](file:///c:/Users/User/cre-dealcard/src/domain/external/gov-premium-apis.ts)
- L138-143: 기본값 제거 → API 성공 시만 데이터 저장, 실패 시 null

---

### 4. 🟡 `computeRentalMarketRates` 검색어 정밀화

#### [MODIFY] [market-crawlers.ts](file:///c:/Users/User/cre-dealcard/src/domain/external/market-crawlers.ts)
- L327-331: 검색어 다각화 + 천안/대전 등 지방 권역 추가
- AI 파싱 프롬프트 강화 (구조화 정확도 향상)

---

### 5. Vercel 환경변수 설정

Vercel 대시보드에 아래 환경변수 설정:

```
DATA_GO_KR_API_KEY=fb53be...
MOLIT_API_KEY=fb53be...
SEMAS_API_KEY=fb53be...
NAVER_CLIENT_ID=sixqz5...
NAVER_CLIENT_SECRET=MQ0pri...
YOUTUBE_API_KEY=AIzaSy...
CRON_SECRET=cre-dealcard-cron-2026-sync
```

---

## 🔒 보안 권고

> [!CAUTION]
> **즉시 조치**: 이 대화에서 API 키가 노출되었습니다. 작업 완료 후 아래 조치를 권장합니다.

### 즉시 (구현 후)
1. **공공데이터포털**: [마이페이지 → API키 관리](https://www.data.go.kr/mypage/main.do)에서 키 재발급
2. **네이버 개발자센터**: [애플리케이션 → 키 재발급](https://developers.naver.com/apps)
3. **YouTube**: [Google Cloud Console → 키 제한](https://console.cloud.google.com/apis/credentials) — HTTP 리퍼러 제한 설정
4. **Vercel 환경변수**: 재발급된 키로 교체

### 향후 보안 아키텍처
| 영역 | 권장 방식 |
|---|---|
| 키 저장 | Vercel Environment Variables (Production/Preview/Development 분리) |
| 키 접근 | `process.env.XXX` — 서버사이드 only, `NEXT_PUBLIC_` 접두사 금지 (카카오 제외) |
| 키 로테이션 | 분기 1회 재발급 → Vercel 환경변수 업데이트 |
| 모니터링 | 공공데이터포털 일일 호출량 모니터링 (무료 1000회/일) |
| 추가 확보 검토 | BigKinds API키 (뉴스 빅데이터), 대법원 경매 API, 알스퀘어/직방 API |

### 향후 키 확보 로드맵
| 우선순위 | API | 용도 | 확보 방법 |
|---|---|---|---|
| 1순위 | **BigKinds** | 뉴스 빅데이터 검색 | [bigkinds.or.kr](https://bigkinds.or.kr) 회원가입 → API 신청 (무료) |
| 2순위 | **대법원 경매정보** | 실시간 경매 사건 | courtauction.go.kr → 직접 크롤링 or API |
| 3순위 | **알스퀘어/직방** | 오피스 임대 시세 | 제휴 문의 (유료) |
| 4순위 | **한국감정원** | 표준지공시지가 | data.go.kr 추가 신청 |

---

## Verification Plan

1. `npm run build` 통과
2. Vercel 환경변수 설정 후 cron 수동 트리거
3. 각 데이터 테이블에 실제 데이터 적재 확인
4. 모닝 인텔리전스 → 모든 섹션 데이터 표시 확인
5. morning-detail 임대 섹션 정상 렌더링 확인
