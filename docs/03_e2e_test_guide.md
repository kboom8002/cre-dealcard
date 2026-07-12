# CRE DealCard 프로덕션 E2E 테스트 가이드

> **작성일**: 2026.07.12 | **최종 갱신**: 2026.07.12 v2
> **기준**: [02_broker_usage_guide.md](file:///c:/Users/User/cre-dealcard/docs/02_broker_usage_guide.md)
> **목적**: 가이드에 기술된 모든 기능의 실제 구현 상태를 검증하고, 미구현·불완전 항목을 식별

---

## 감사 총괄 결과

### 구현 상태 요약

| 카테고리 | 가이드 기술 | 구현 | 부분 | 미구현 | 비고 |
|---------|-----------|------|------|-------|------|
| 브로커 페이지 (22개) | 22 | **22** | 0 | 0 | 전체 존재 확인 |
| 공개 페이지 (12개) | 12 | **12** | 0 | 0 | 전체 존재 확인 |
| 핵심 API (10개) | 10 | **10** | 0 | 0 | 전체 존재 확인 |
| 신규 API (7개) | 7 | **7** | 0 | 0 | v2 구현 완료 |
| 교차 연동 (8개) | 8 | **7** | **1** | 0 | 브릿지 구현 완료 |
| 매거진 파이프라인 | 완전 자동 | 수정 | - | - | P0 버그 3건 수정 완료 |

### 교차 연동 상태 상세

| 연동 | 상태 | 비고 |
|------|------|------|
| Vibe 명함 -> IM 딥링크 (3건) | ✅ 구현 | 실 DB 조회, max 3건 |
| Vibe 명함 -> 최신 매거진 | ✅ 구현 | magazine_issues 조회 |
| IM -> Vibe 명함 링크 | ✅ 구현 | 3곳에서 링크 |
| 매거진 -> IM 딥링크 | ✅ 구현 | featured_deals 섹션 |
| 매거진 -> Vibe 명함 | ✅ 구현 | 하단 브로커 프로필 |
| Hot Lead 교차 스코어링 | ✅ 구현 | cross-channel-score.ts |
| Vibe 브랜드 테마 자동 반영 | ⚠️ 부분 | IM: 브로커 카드만, 매거진: 자체 themeColor |
| im-to-magazine-bridge | ✅ **구현** | `im-to-magazine-bridge.ts` + handler 훅 + 에디터 연동 |

### v2 신규 구현 기능 (이번 세션)

| # | 기능 | 핵심 파일 | 상태 |
|---|------|----------|------|
| 1 | 물류센터 바텀시트 17필드 UI | `im-data-bottom-sheet.tsx`, `actions.ts` | ✅ 구현 |
| 2 | Solapi 알림톡 인프라 정밀 개선 | `notification-service.ts`, `.env.example` | ✅ 구현 |
| 3 | IM→매거진 브릿지 자동 추출 | `im-to-magazine-bridge.ts`, `handler.ts`, `magazine-editor/page.tsx` | ✅ 구현 |
| 4 | 매거진 구독자 관리 + 수신 거부 API | `subscribers/route.ts`, `subscribers/[id]/route.ts`, `unsubscribe/route.ts` | ✅ 구현 |
| 5 | 임장 예약 오케스트레이터 API | `schedule/book/route.ts`, `schedule/confirm/route.ts`, `cron/hold-expiry/route.ts` | ✅ 구현 |

---

## Part 1 - 핵심 기능 테스트 (10개 시나리오)

---

### TC-01: 로그인 + 온보딩

| 항목 | 내용 |
|------|------|
| **가이드 섹션** | 1. 첫 접속 및 온보딩 |
| **테스트 URL** | https://credeal.net/login |
| **전제 조건** | 신규 계정 또는 온보딩 미완료 계정 |

**테스트 단계**:
1. credeal.net/login 접속 -> 로그인 화면 렌더링 확인
2. 이메일/비밀번호 입력 -> 로그인 성공
3. 최초 접속이면 /onboarding으로 자동 리다이렉트 확인
4. 7단계 위저드 순차 진행:
   - 1 역할 선택 (브로커 선택)
   - 2 사진 업로드 -> AI 인상 분석 결과 표시
   - 3 딜카드 체험 (주소 입력)
   - 4 빌딩 레이더 시연
   - 5 BeforeAfter 연출
   - 6 커뮤니티 소개
   - 7 완료 -> Confetti 효과
5. 온보딩 완료 후 /broker 대시보드 자동 이동

**예상 결과**: 대시보드 정상 렌더링

---

### TC-02: 대시보드 코크핏

| 항목 | 내용 |
|------|------|
| **가이드 섹션** | 2. 대시보드 코크핏 |
| **테스트 URL** | credeal.net/broker |

**테스트 단계**:
1. 대시보드 접속 -> 4개 탭 존재 확인: 오버뷰, 시장 대응 전략, 주간/월간 리포트, 모닝 인텔리전스
2. **오버뷰 탭**:
   - 6개 퀵 액션 버튼 확인
   - 각 버튼 클릭 -> 올바른 경로 이동 확인
   - KPI 그리드: 실 데이터 반영
   - 알림 피드: 최근 5건 표시
3. **모닝 인텔리전스 탭**:
   - HQ 모드: 3개 권역 선택 -> 데이터 로딩
   - 위젯 6개 복원 확인:
     - CRE 시장 심리 지수 (극단적 위축 0 ~ 극단적 과열 100)
     - 상권 분석 소상공인 바로미터
     - 공시지가 변동
     - ESG 에너지 등급
     - 건축/리모델링 인허가 동향
     - 글로벌 CRE 리서치 리포트

**검증 포인트**:
- [ ] KPI가 실 데이터인지
- [ ] 모닝 인텔리전스 위젯에 실 API 데이터 표시
- [ ] "극단적 과열/위축" 용어 변경 반영

---

### TC-03: 매물 등록 (딜카드 생성 30초)

| 항목 | 내용 |
|------|------|
| **가이드 섹션** | 3. 매물 등록 및 관리 |
| **테스트 URL** | credeal.net/broker/deal-card/new |

**테스트 단계**:
1. 30초 딜카드 버튼 클릭 -> /broker/deal-card/new 이동
2. 주소 입력: 서울특별시 성동구 성수이로 51
3. 기본 정보: 건물명, 자산유형(꼬마빌딩), 연면적(300평), 호가(50억)
4. 딜카드 생성 클릭 -> /broker/deal-card/[id]로 이동

**검증 포인트**:
- [ ] 주소 -> 좌표 자동 변환 (행안부 API)
- [ ] 블라인드 딜카드 + 시그널 카드 자동 생성
- [ ] /broker/buildings 목록에 신규 매물 표시

---

### TC-04: 딜카드 상세 + 모바일 IM 생성

| 항목 | 내용 |
|------|------|
| **가이드 섹션** | 3.2 딜카드 상세 + 5. 모바일 IM |
| **테스트 URL** | credeal.net/broker/deal-card/[id] |
| **전제 조건** | TC-03에서 생성한 딜카드 |

**테스트 단계**:
1. 딜카드 상세 페이지 영역 확인
2. **하단 CTA 바** 4개 버튼: 카카오 공유, **모바일 IM 생성**, 매수자 보기, 건물주 리포트
3. **모바일 IM 생성 클릭** -> IM 데이터 입력 바텀시트:
   - 주소 (자동), 월 임대료(3000만), 보증금(5억), 공실률(10%)
   - 사진 업로드, 중개인 한줄 코멘트
4. **IM 생성하기 클릭** -> AI 7섹션 IM 생성
5. **🆕 IM 생성 완료 후**: 매거진 브릿지 자동 호출 확인 (콘솔 로그 `[im-generate] Magazine bridge` 메시지 확인)

**검증 포인트**:
- [ ] IM 데이터 충실도 게이지 표시
- [ ] "중개인 한줄 코멘트" 라벨 (구 "브로커" 아닌지)
- [ ] AI 7개 섹션 모두 생성
- [ ] 🆕 IM→매거진 브릿지가 `pending_magazine_deals`에 스니펫 적재 (Supabase 테이블 확인)

---

### TC-05: 공개 IM 기능 테스트

| 항목 | 내용 |
|------|------|
| **가이드 섹션** | 5.5 공개 IM 기능 |
| **테스트 URL** | credeal.net/im-lite/[buildingId] |

**테스트 단계**:
1. 공개 IM 페이지 접속 -> 7섹션 렌더링
2. **히어로 카드** 표시 (신규: writer 생성, 기존: 폴백 합성)
3. **TTS** 버튼 -> 음성 재생
4. **PDF 내보내기** -> 다운로드
5. **영문 번역** -> 영어 IM
6. **브로커 프로필 카드** (하단): Vibe 테마 + "프로필 보기" -> /vibe-card/[slug]
7. **체류시간 분석**: 60초+ 체류 -> sendBeacon 전송 (DevTools)

**검증 포인트**:
- [ ] 7섹션 실 AI 콘텐츠
- [ ] 히어로 카드: 자산유형, 호가, 투자포인트
- [ ] TTS/PDF/번역 API 응답
- [ ] Vibe 명함 링크

---

### TC-06: Vibe AI 명함 생성 + 교차 링크

| 항목 | 내용 |
|------|------|
| **가이드 섹션** | 11. 프로필 및 Vibe 명함 |
| **테스트 URL** | credeal.net/broker/my-card/new |

**테스트 단계**:
1. /broker/profile -> 프로필 편집 (이름, 전화, 자격증, 권역, 사진 업로드)
2. /broker/my-card/new -> 명함 생성 위저드
3. 생성 후 /vibe-card/[slug] 확인:
   - AI 7D Vibe 분석 (7차원)
   - VTI 성격 유형
   - **보유 매물 IM 리스트** (max 3건) -> 클릭 -> /im-lite/[id]
   - **최신 매거진** 링크 -> 클릭 -> /magazine/[brokerId]/[date]
   - 카카오 공유, QR코드, 링크 복사

**검증 포인트**:
- [ ] Vibe 분석 자동 실행
- [ ] 7D 벡터 그래프 렌더링
- [ ] IM 리스트 실 DB 조회
- [ ] 카카오 공유 (OG 이미지)

---

### TC-07: 주간 매거진 발행

| 항목 | 내용 |
|------|------|
| **가이드 섹션** | 13. 주간 매거진 발행 |
| **테스트 URL** | credeal.net/broker/magazine-editor |

**테스트 단계**:
1. /broker/magazine-editor 접속
2. 커버: 시장 온도 + 3키워드 + 이미지
3. 필드노트 5필드 입력
4. 🆕 **추천 매물 확인**: IM 브릿지에서 자동 추출된 매물이 "IM 추천 매물" 뱃지와 함께 표시되는지 확인
5. 발행 클릭 -> 매거진 생성
6. 공개 URL /magazine/[brokerId]/[date] 확인
7. 🆕 **구독 카드 → 구독 등록** → 알림톡 수신 확인

**검증 포인트**:
- [ ] AI 브리핑 자동 생성
- [ ] 🆕 추천 매물 섹션: `pending_magazine_deals` 기반 "IM 추천 매물" 뱃지 표시
- [ ] 브로커 프로필 Vibe 연동
- [ ] 구독 카드 표시
- [ ] 심리 지수: "과열/위축" 용어

**수정된 P0 버그**: 크론 자동 생성 시 user_id -> slug로 수정. 듀얼 쓰기 추가.

---

### TC-08: 딜 파이프라인

| 항목 | 내용 |
|------|------|
| **가이드 섹션** | 6. 딜 파이프라인 |
| **테스트 URL** | credeal.net/broker/pipeline |

**테스트 단계**:
1. 8단계 칸반 보드 렌더링 확인
2. 드래그 앤 드롭: 딜 카드 단계 이동
3. 전환 유효성: 필수 필드 없이 이동 시도 -> 차단
4. 체류 경고 뱃지 확인

---

### TC-09: AI 매칭 엔진

| 항목 | 내용 |
|------|------|
| **가이드 섹션** | 7. AI 매칭 엔진 |
| **테스트 URL** | credeal.net/broker/matching |

**테스트 단계**:
1. /broker/buyer-intents/new -> 매수 의향서 등록
2. /broker/matching -> AI 매칭 결과
3. S/A/B/C 등급 표시
4. 매물 중심 / 매수자 중심 뷰 전환

---

### TC-10: CRM + 메모 + 일정 + 임장 예약

| 항목 | 내용 |
|------|------|
| **가이드 섹션** | 8~10 |

**테스트 단계**:
1. CRM (/broker/clients): 고객 등록
2. 메모 (/broker/memos): AI 라우팅 (new_deal -> 딜카드 초안)
3. 음성 메모: 녹음 -> 전사 -> 분석
4. 일정 (/broker/schedule): 임장 생성, ICS 내보내기
5. 🆕 **임장 예약 플로우**: BookingFlow UI에서 슬롯 선택 → `/api/broker/schedule/book` API 호출 → Hold 상태 전환 확인
6. 🆕 **예약 확정**: Hold된 예약 → 확정 버튼 → `/api/broker/schedule/confirm` API 호출 → Confirmed 상태 전환

---

## Part 2 - 고급 시너지 테스트

### TC-11: 무마찰 영업 퍼널 E2E

TC-03~06 순서 실행 후 확인:
- [ ] 딜카드 -> IM -> Vibe 명함에 IM 자동 노출
- [ ] 🆕 IM 생성 → 매거진 브릿지 자동 추출 → 매거진 에디터에 "IM 추천 매물" 표시
- [ ] 고객 IM 열람 -> 교차 채널 스코어 계산
- [ ] 스코어 80점+ -> Hot Lead 카카오 알림

---

### TC-12: Hot Lead 교차 채널 스코어링

cross-channel-score.ts 구현 확인:
| 행동 | 점수 |
|------|------|
| Vibe 명함 조회 | +5 |
| 명함->IM 클릭 | +15 |
| 매거진 구독 | +20 |
| IM 열람 | +25 |
| 3채널 보너스 | +30 |

**테스트**: 시크릿 모드에서 3채널 순회 -> Hot Lead 알림 확인

---

### TC-13: 콘텐츠 스튜디오 + 캠페인 AI

1. /broker/studio -> 6개 기능 카드
2. AI 코멘트 비서 테스트
3. /broker/campaign -> 캠페인 카피 생성

---

### TC-14: 행동 퍼널 분석

/broker/funnel -> 6단계 퍼널, 기간 필터, 전환율, AI 인사이트

---

### TC-15: 물류센터 IM 특화 (✅ 17필드 UI 구현)

| 항목 | 내용 |
|------|------|
| **가이드 섹션** | 5. 모바일 IM - 물류센터 특화 |
| **테스트 URL** | credeal.net/broker/deal-card/[id] (자산유형=물류센터) |
| **전제 조건** | 자산유형이 "물류", "물류센터" 또는 "logistics"인 딜카드 |

**테스트 단계**:
1. 자산유형 "물류센터"로 딜카드 생성 (TC-03 참고)
2. 딜카드 상세에서 **모바일 IM 생성** 클릭
3. 바텀시트에 **물류센터 전용 필드 섹션** 자동 표시 확인:
   - **건물 스펙** (4필드): 천장고(m), 기둥간격(m), 바닥하중(톤/m²), 전기용량(kW)
   - **도크/하역** (4필드): 도크 수, 레벨러 수, 최대 차량톤, 하역장 면적(평)
   - **냉동/냉장** (3필드): 냉동면적(평), 냉장유형(select), 차량접근방식(select)
   - **안전/부대** (3필드): 내화등급, 스프링클러(toggle), 사무공간유무+면적(평)
   - **접근성** (2필드): IC 거리(km), IC명
4. 물류센터 필드 채움 → 충실도 게이지 반영 확인
5. IM 생성 → AI 분석에 입력된 물류 데이터가 반영되었는지 확인

**검증 포인트**:
- [ ] 자산유형이 물류 계열일 때만 17필드 섹션 표시
- [ ] 숫자 필드에 `type="number"` 적용
- [ ] 냉장유형: select (none/cold/freeze/both)
- [ ] 차량접근: select (dock/ramp/ground)
- [ ] 스프링클러: Switch toggle
- [ ] 충실도 게이지가 물류 필드 채움률 반영
- [ ] 생성된 IM에 물류 전용 분석 결과 포함

---

### TC-16: 🆕 IM→매거진 브릿지 자동 추출

| 항목 | 내용 |
|------|------|
| **기능** | IM 생성 시 매거진 추천 매물 스니펫 자동 적재 |
| **핵심 파일** | `im-to-magazine-bridge.ts`, `handler.ts`, `magazine-editor/page.tsx` |
| **전제 조건** | TC-04에서 IM이 생성된 상태 |

**테스트 단계**:
1. TC-04 수행 후 **Supabase Dashboard** 열기
2. `broker_profiles` 테이블 → 해당 중개인의 `pending_magazine_deals` JSONB 컬럼 확인
3. 스니펫 데이터 검증:
   ```json
   {
     "buildingId": "<TC-03에서 생성한 빌딩 ID>",
     "blindName": "성수 · 꼬마빌딩",
     "investmentPoint": "<AI 생성 투자포인트>",
     "assetType": "꼬마빌딩",
     "priceBand": "50억",
     "photoUrl": "<업로드한 사진 URL 또는 null>",
     "imUrl": "/im-lite/<buildingId>",
     "createdAt": "<ISO timestamp>"
   }
   ```
4. /broker/magazine-editor 접속 → 추천 매물 섹션에 방금 생성한 IM 매물이 표시되는지 확인
5. 해당 매물에 **"IM 추천 매물"** 뱃지가 표시되는지 확인

**검증 포인트**:
- [ ] RPC `append_magazine_deal_snippet` 정상 호출 (Supabase 로그 또는 콘솔)
- [ ] `pending_magazine_deals` JSONB 배열에 스니펫 append
- [ ] 매거진 에디터에서 `source: 'im-bridge'` 매물 렌더링
- [ ] 브릿지 호출 실패 시 IM 생성 자체에 영향 없음 (try-catch 격리)

---

### TC-17: 🆕 Solapi 알림톡 인프라 검증

| 항목 | 내용 |
|------|------|
| **기능** | 카카오 알림톡 발송 (Hot Lead, IM 열람, 매거진 발행) |
| **핵심 파일** | `notification-service.ts`, `.env.example` |
| **전제 조건** | Solapi 환경변수 설정 완료 |

**사전 설정 확인**:
```bash
# .env.local에 아래 4개 변수가 설정되어 있는지 확인
SOLAPI_API_KEY=<발급받은 API 키>
SOLAPI_API_SECRET=<발급받은 API 시크릿>
SOLAPI_SENDER_PHONE=<사전 등록된 발신번호>
SOLAPI_PFID=<카카오 채널 프로필 ID>
```

**테스트 시나리오 A: IM 열람 알림 (TPL_IM_VIEW_ALERT)**
1. 시크릿 모드에서 공개 IM 페이지 접속
2. 60초 이상 체류
3. `sendBeacon` 으로 열람 이벤트 전송 (DevTools Network 탭에서 확인)
4. 중개인의 카카오톡으로 알림톡 수신 확인

**테스트 시나리오 B: Hot Lead 알림 (TPL_HOT_LEAD)**
1. 시크릿 모드에서 3채널 순회 (Vibe 명함 → IM → 매거진)
2. 교차 채널 스코어 80점+ 달성
3. 중개인에게 Hot Lead 알림톡 수신 확인

**테스트 시나리오 C: 환경변수 미설정 시**
1. `.env.local`에서 `SOLAPI_API_KEY` 제거
2. 동일 시나리오 수행
3. 알림톡 발송 실패 → 콘솔에 경고 로그 출력 (앱 크래시 없음)

**검증 포인트**:
- [ ] 변수 치환(`#{brokerName}`, `#{buildingName}` 등)이 올바르게 적용
- [ ] `text` 필드에 치환된 템플릿 본문이 전달 (Solapi 일치 검증 통과)
- [ ] `disableSms: false` — 알림톡 실패 시 SMS 폴백 동작
- [ ] 환경변수 미설정 시 graceful degradation (로그만 출력, 에러 미전파)

> [!IMPORTANT]
> **사전 작업 필요**: Solapi 콘솔에서 ① 카카오 비즈니스 채널 연동 ② 3종 알림톡 템플릿 등록 (`TPL_HOT_LEAD`, `TPL_IM_VIEW_ALERT`, `TPL_MAGAZINE_NEW_ISSUE`) ③ 발신번호 등록 완료 후 테스트 가능.

---

### TC-18: 🆕 매거진 구독자 관리 API

| 항목 | 내용 |
|------|------|
| **기능** | 중개인의 매거진 구독자 CRUD 관리 |
| **핵심 API** | `/api/broker/magazine/subscribers`, `/api/broker/magazine/subscribers/[id]` |
| **전제 조건** | 로그인된 중개인 계정 |

**테스트 단계**:

**Step 1: 구독자 수동 추가 (POST)**
```bash
curl -X POST https://credeal.net/api/broker/magazine/subscribers \
  -H "Content-Type: application/json" \
  -H "Cookie: <인증 쿠키>" \
  -d '{ "phone": "010-1234-5678", "name": "테스트 구독자", "email": "test@example.com", "channel": "kakao" }'
```
예상 응답: `{ "success": true, "subscriber": { "id": "...", "status": "active", ... } }`

**Step 2: 구독자 목록 조회 (GET)**
```bash
curl "https://credeal.net/api/broker/magazine/subscribers?status=active&limit=20&offset=0" \
  -H "Cookie: <인증 쿠키>"
```
예상 응답: `{ "subscribers": [...], "total": 1 }`

**Step 3: 구독자 일시정지 (PATCH)**
```bash
curl -X PATCH https://credeal.net/api/broker/magazine/subscribers/<subscriber-id> \
  -H "Content-Type: application/json" \
  -H "Cookie: <인증 쿠키>" \
  -d '{ "status": "paused" }'
```
검증: 매거진 발행 시 해당 구독자에게 알림톡 미발송

**Step 4: 구독자 삭제 (DELETE)**
```bash
curl -X DELETE https://credeal.net/api/broker/magazine/subscribers/<subscriber-id> \
  -H "Cookie: <인증 쿠키>"
```
검증: `magazine_subscribers` 테이블에서 하드 삭제 확인

**검증 포인트**:
- [ ] 전화번호 중복 시 upsert (같은 broker_id + subscriber_phone)
- [ ] 필터 조합 (status=active&channel=kakao) 동작
- [ ] 페이지네이션 (limit/offset) 정확한 구간 반환
- [ ] 미인증 요청 → 401 응답
- [ ] RLS: 다른 중개인의 구독자 조회 불가

---

### TC-19: 🆕 매거진 수신 거부 (공개 API)

| 항목 | 내용 |
|------|------|
| **기능** | 구독자 셀프 수신 거부 |
| **핵심 API** | `/api/public/magazine/unsubscribe` |
| **전제 조건** | TC-18에서 추가된 구독자 존재 |

**테스트 단계**:

**Step 1: 수신 거부 페이지 렌더링 (GET)**
```
https://credeal.net/api/public/magazine/unsubscribe?token=<subscriberId>.<brokerId>.<HMAC-SHA256-signature>
```
1. 유효한 토큰 → 수신 거부 확인 폼 렌더링 (HTML)
2. 무효한/누락 토큰 → 에러 메시지 ("유효하지 않은 수신 거부 링크입니다.")

**Step 2: 수신 거부 처리 (POST)**
1. 수신 거부 폼에서 "매거진 구독 해지" 버튼 클릭
2. `magazine_subscribers.status` → `'unsubscribed'` 전환
3. `unsubscribed_at` 타임스탬프 기록
4. `activity_events` 테이블에 `magazine_unsubscribed` 이벤트 기록
5. 성공 페이지 렌더링: "✅ 수신 거부 처리가 완료되었습니다."

**검증 포인트**:
- [ ] HMAC 토큰 서명 검증 (`SUPABASE_SERVICE_ROLE_KEY` 기반)
- [ ] form POST + JSON POST 양쪽 지원
- [ ] 해지 후 해당 구독자에게 알림톡 미발송
- [ ] activity_events 로그 적재 확인

---

### TC-20: 🆕 임장 예약 오케스트레이터 (CAS Hold → 확정 → 만료)

| 항목 | 내용 |
|------|------|
| **기능** | 임장 예약 슬롯 선점(Hold) → 확정 → 만료 정리 |
| **핵심 API** | `/api/broker/schedule/book`, `/api/broker/schedule/confirm`, `/api/cron/hold-expiry` |
| **전제 조건** | /broker/schedule에서 이용 가능한 슬롯이 존재 |

**테스트 단계**:

**Step 1: 슬롯 Hold 신청 (POST /api/broker/schedule/book)**
1. /broker/schedule에서 이용 가능한 임장 시간 슬롯 선택
2. BookingFlow UI에서 "예약 신청" 클릭
3. 예상 응답:
   ```json
   {
     "success": true,
     "bookingId": "<uuid>",
     "holdUntil": "<24시간 후 ISO timestamp>",
     "message": "슬롯 선점(Hold)이 완료되었습니다. 24시간 내에 확정해야 합니다."
   }
   ```
4. `bookings` 테이블: `status = 'hold'` 확인
5. `availability_slots` 테이블: `status = 'held'` 확인

**Step 2: 동시성 충돌 테스트**
1. 같은 슬롯에 대해 다른 세션에서 예약 신청
2. 예상: `409 Conflict` 응답 + "이미 예약된 시간대입니다." 토스트 메시지

**Step 3: Hold → 확정 (POST /api/broker/schedule/confirm)**
1. Hold된 예약의 `bookingId`로 확정 요청
2. 예상:
   ```json
   {
     "success": true,
     "message": "임장 예약이 최종 확정되었습니다."
   }
   ```
3. `bookings.status` → `'confirmed'`, `availability_slots.status` → `'confirmed'`
4. (Solapi 설정 시) 알림톡 수신 확인

**Step 4: 소유권 검증**
1. 다른 중개인 계정으로 타인의 bookingId 확정 시도
2. 예상: `403 Forbidden` ("이 예약을 확정할 권한이 없습니다.")

**Step 5: Hold 만료 자동 정리 (GET /api/cron/hold-expiry)**
1. Hold 상태 예약의 `hold_expires_at`을 과거 시점으로 수동 변경 (Supabase Dashboard)
2. 크론 API 수동 호출:
   ```bash
   curl "https://credeal.net/api/cron/hold-expiry" \
     -H "Authorization: Bearer <CRON_SECRET>"
   ```
3. 만료된 예약: `bookings.status` → 만료, `availability_slots.status` → `'available'` 복원
4. 대기열 1순위가 있으면 알림 발송

**검증 포인트**:
- [ ] CAS 패턴: 동시 요청 시 한 쪽만 성공, 다른 쪽 409
- [ ] Hold → Confirm 상태 전이 일관성
- [ ] 비 소유자 확정 차단 (403)
- [ ] 24시간 미확정 Hold 자동 회수
- [ ] `vercel.json`에 크론 스케줄 등록 확인 (`*/5 * * * *`)
- [ ] CRON_SECRET 미일치 시 401 응답

---

## Part 3 - API 직접 테스트

### 공개 API

| API | 메서드 | 테스트 |
|-----|--------|--------|
| /api/public/im-lite/[id]/tts | GET | 음성 파일 반환 |
| /api/public/im-lite/[id]/export | GET | PDF 다운로드 |
| /api/public/im-lite/[id]/translate | GET | 영문 번역 JSON |
| /api/public/im-lite/[id]/view | POST | 열람 이벤트 기록 |
| /api/public/magazine/subscribe | POST | 구독 등록 |
| 🆕 /api/public/magazine/unsubscribe | GET | 수신 거부 페이지 (토큰 기반 HTML) |
| 🆕 /api/public/magazine/unsubscribe | POST | 수신 거부 처리 (HMAC 검증) |

### 브로커 API (🆕 신규)

| API | 메서드 | 테스트 |
|-----|--------|--------|
| 🆕 /api/broker/magazine/subscribers | GET | 구독자 목록 조회 (필터, 페이지네이션) |
| 🆕 /api/broker/magazine/subscribers | POST | 구독자 수동 추가 (upsert) |
| 🆕 /api/broker/magazine/subscribers/[id] | PATCH | 구독자 상태 변경 (active/paused/unsubscribed) |
| 🆕 /api/broker/magazine/subscribers/[id] | DELETE | 구독자 완전 삭제 (하드 삭제) |
| 🆕 /api/broker/schedule/book | POST | 임장 예약 Hold 신청 (CAS) |
| 🆕 /api/broker/schedule/confirm | POST | Hold → 확정 전환 |

### 크론 API

| API | 스케줄 | 확인 |
|-----|--------|------|
| /api/cron/morning-briefing | 매일 08:00 KST (UTC 23:00) | Vercel 크론 로그 |
| /api/cron/sync-vibe | 매주 일 09:00 KST (UTC 00:00 일) | Vibe 카드 동기화 |
| /api/cron/weekly-magazine | 매주 월 07:00 KST (UTC 22:00 일) | magazine_editions 테이블 |
| 🆕 /api/cron/hold-expiry | 매 5분 (`*/5 * * * *`) | 만료 Hold 자동 회수 + 대기열 전파 |

---

## Part 4 - 수정 이력 + 알려진 이슈

### 수정 완료 (v1 세션)

| 이슈 | 수정 파일 |
|------|---------|
| 매거진 크론: user_id→slug 불일치 | weekly-magazine/route.ts |
| 매거진: editions↔issues 테이블 분리 | weekly-generator.ts 듀얼 쓰기 |
| 매거진: ai_briefing→briefing 필드명 | weekly-generator.ts |
| 매거진: sentiment.status 누락 | weekly-generator.ts |
| 매거진: page.tsx editions 폴백 | magazine/page.tsx |
| 대시보드: 실 API 위젯 6개 복원 | MorningIntelligence.tsx |
| 용어: 탐욕/공포 → 과열/위축 | 14+ 파일 |
| 용어: 브로커 → 중개인 | 12+ 파일 |

### 수정 완료 (v2 세션 — 5대 신규 구현)

| 이슈 | 수정/신규 파일 | Phase |
|------|--------------|-------|
| 물류센터 17개 지표 UI 없음 → 바텀시트 17필드 구현 | `im-data-bottom-sheet.tsx`, `actions.ts` | 1 |
| Solapi 템플릿 text 치환 결함 → renderedText 치환 로직 개선 | `notification-service.ts` | 2 |
| Solapi 환경변수 문서화 → .env.example 추가 | `.env.example` | 2 |
| im-to-magazine-bridge 미구현 → 브릿지 모듈 + 훅 구현 | `im-to-magazine-bridge.ts`, `handler.ts` | 3 |
| 매거진 에디터 추천 매물 수동 → pending_magazine_deals 자동 연동 | `magazine-editor/page.tsx` | 3 |
| magazine_subscribers 도메인 코드 없음 → CRUD API 구축 | `subscribers/route.ts`, `subscribers/[id]/route.ts` | 4 |
| 수신 거부 엔드포인트 없음 → HMAC 기반 셀프 해지 API | `unsubscribe/route.ts` | 4 |
| booking-orchestrator 미연결 → CAS API 라우트 3종 신규 | `schedule/book/route.ts`, `schedule/confirm/route.ts` | 5 |
| BookingFlow 직접 DB insert 버그 → API 호출로 리팩터링 | `BookingFlow.tsx` | 5 |
| hold-expiry 크론 미등록 → Vercel 크론 5분 간격 등록 | `cron/hold-expiry/route.ts`, `vercel.json` | 5 |

### 알려진 제한 (잔여)

| 이슈 | 영향 | 우선순위 |
|------|------|---------|
| Vibe 테마 → IM 히어로 미반영 | 브로커 카드만 적용 | P3 |
| ESG 위젯: 1건만 조회 | 대표 건물 외 없을 수 있음 | P3 |
| 카카오 알림톡: Solapi 키 필요 | 환경변수 미설정 시 스텁 모드 (로그만 출력) | P1 |
| /broker/onboarding 페이지 없음 | 온보딩은 /onboarding (루트 레벨) | Info |

---

## 테스트 체크리스트 (최종 — v2)

```
[ ] TC-01: 로그인 + 온보딩 7단계
[ ] TC-02: 대시보드 4탭 + 6위젯 + 용어
[ ] TC-03: 딜카드 생성 (30초)
[ ] TC-04: 딜카드 상세 + IM 생성 + 매거진 브릿지 자동 추출
[ ] TC-05: 공개 IM (7섹션 + TTS + PDF + 번역)
[ ] TC-06: Vibe 명함 (7D + IM딥링크 + 매거진)
[ ] TC-07: 주간 매거진 (에디터 + IM 추천 매물 + 발행)
[ ] TC-08: 딜 파이프라인 (8단계 칸반)
[ ] TC-09: AI 매칭 (S/A/B/C)
[ ] TC-10: CRM + 메모 + 일정 + 임장 예약
[ ] TC-11: 무마찰 퍼널 E2E + 매거진 브릿지
[ ] TC-12: Hot Lead 스코어링
[ ] TC-13: 콘텐츠 스튜디오 + 캠페인
[ ] TC-14: 행동 퍼널 분석
[ ] TC-15: 물류센터 IM 특화 (17필드 UI)
[ ] TC-16: IM→매거진 브릿지 (스니펫 자동 추출 + 에디터 표시)
[ ] TC-17: Solapi 알림톡 (3종 템플릿 + 변수 치환)
[ ] TC-18: 매거진 구독자 관리 API (CRUD + 필터 + 페이지네이션)
[ ] TC-19: 매거진 수신 거부 (HMAC 토큰 + 셀프 해지)
[ ] TC-20: 임장 예약 오케스트레이터 (CAS Hold + 확정 + 만료 크론)
```
