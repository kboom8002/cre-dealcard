# CRE DealCard Hub — 사용자 페르소나 & 활용 시나리오

> **작성 기준일**: 2026-05-30  
> **기반**: [기능명세서](file:///C:/Users/User/.gemini/antigravity/brain/75e8b0db-02a5-48cd-9485-cef7d47f7282/01_feature_specification.md) 기반 도출

---

## 페르소나 요약

| # | 페르소나 | 역할 | 핵심 동기 | 주요 사용 영역 |
|---|---------|------|-----------|---------------|
| P1 | 김동현 | 상업용 부동산 중개인 (팀장) | 딜 회전율 극대화 | 딜카드, 매칭, CRM |
| P2 | 박서영 | 빌딩 자산관리(PM) 겸 임대 전문 | 공실률 최소화 | AI 리싱 스튜디오, 리싱 페이지 |
| P3 | 이건우 | 건물주 (오너) | 매각/임대 준비도 확인 | Owner Readiness, Building Radar |
| P4 | 정하나 | 임차 희망자 (카페 창업자) | 최적 입지 탐색 | 마켓플레이스, 리싱 페이지, 문의 |
| P5 | 최민호 | CRE 투자자 (자산가) | 수익률 높은 딜 탐색 | 크라우드펀딩, Pulse, 매수 의향서 |
| P6 | 한지윤 | 인테리어/법무 벤더 | 딜 연계 서비스 수주 | 벤더 에코시스템, 서비스 카드 |
| P7 | 윤시원 | 플랫폼 관리자 (운영팀) | 시스템 건강성 감시 | Admin, Pipeline, 매칭 실패 분석 |

---

## P1. 김동현 — 상업용 부동산 중개인 (팀장)

### 프로필

| 항목 | 내용 |
|------|------|
| **연령/성별** | 38세 남성, 서울 GBD 권역 |
| **경력** | 상업용 부동산 중개 10년, 4인 팀 리딩 |
| **일상** | 하루 20건+ 카톡 매물 정보 수신, 엑셀/카톡으로 매물 관리 |
| **동기** | 매물 정보 정리 시간 단축, 매칭 자동화로 딜 클로징 가속 |
| **불만** | "카톡으로 받은 매물을 엑셀에 옮기는 데만 하루 2시간" |
| **기술 수준** | 모바일 중심, 앱/웹 능숙 |

### 시나리오

#### S1-1. 카톡 메모 → 60초 블라인드 딜카드

```
[동기] 오전 8시, 랜드로드 측 중개인에게서 성수역 코너 빌딩 임대 정보를 카톡으로 받음

[행동]
1. /broker/lease-card/new 접속
2. 카톡 메모 그대로 복사·붙여넣기
3. "AI 1분 임대차 딜카드 생성" 클릭
   → AI 3단계 파이프라인: 메모 파싱 → 임대 SSoT → 블라인드 티저
4. lease-card/[id] 상세에서:
   - 보증금/월세/면적/렌트프리 자동 구조화 확인
   - 정확한 주소, 임대인 정보 등 7개 항목 자동 블라인드 처리
   - "카톡용 블라인드 문구 복사" → 바이어 그룹 카톡방에 전달

[결과] 기존 45분 → 60초. 민감 정보 유출 리스크 제로.
[터치 포인트] /broker/lease-card/new → /broker/lease-card/[id]
[테이블] lease_spaces, document_objects, ai_runs, activity_events
```

#### S1-2. AI 자동 매칭 → S등급 바이어 선별

```
[동기] 등록한 매물에 맞는 임차인을 빠르게 찾고 싶음

[행동]
1. 딜카드 생성 시 자동으로 lease_auto_matcher 실행
2. /broker/matching 에서 S/A/B/C 등급 필터로 결과 확인
3. S등급 매칭 카드 클릭 → 3단계 정밀 보고서 열기
   - Stage 1: 하드필터 (권역, 예산, 자산유형) ✓
   - Stage 2: 의미 유사도 82%
   - Stage 3: 가중치 적용 최종 92점
4. "매수자 보기" → /broker/buyer-intents/[id]에서 고객 상세 확인
5. CRM에서 해당 고객의 연락처 조회 → 전화

[결과] 매칭에 소요되던 주 5시간 → 자동화. S등급 전환율 42.5%.
[터치 포인트] /broker/matching → /broker/buyer-intents/[id] → /broker/clients/[id]
[테이블] match_results, lease_match_results, buyer_intent_lite, tenant_intent, broker_clients
```

#### S1-3. 임대 딜카드 → AI 리싱 부스트 → 공개 페이지

```
[동기] 블라인드 카톡 전달 후 관심 표명한 임차인에게 공개 리싱 페이지를 만들어 전달하고 싶음

[행동]
1. /broker/lease-card/[id] 에서 "🚀 AI 리싱 페이지 만들기" 클릭
   → boost API가 lease_spaces → spaces 자동 변환 + 양방향 FK
2. /broker/leasing/[spaceId] 위저드 진입:
   - Step 1: 사진 분류 (생략 가능)
   - Step 2: 적합성 분석 → clinic: high_potential 92점, retail: medium_potential 68점
   - Step 3: 리싱 페이지 생성 → /leasing/seongsu-corner-2f 생성
   - Step 4: 캠페인 카피 → 카카오, 네이버, 인스타 카피 자동 생성
   - Step 5: 공개 URL 복사 → 임차인에게 전달
3. 임차인이 /leasing/seongsu-corner-2f 에서 문의 접수
   → AI 자동 검증 → broker_clients 자동 등록 → tenant_intent 생성 → 매칭 재실행

[결과] 카톡 블라인드 → 공개 리싱 페이지까지 원스톱. 문의 → CRM 자동 연동.
[터치 포인트] /broker/lease-card/[id] → boost → /broker/leasing/[spaceId] → /leasing/[slug]
[테이블] lease_spaces, spaces, leasing_pages, leasing_page_sections, tenant_fit_results, vibe_fit_results, campaign_copies, leasing_inquiries, broker_clients, tenant_intent
```

---

## P2. 박서영 — 빌딩 PM 겸 임대 전문 중개인

### 프로필

| 항목 | 내용 |
|------|------|
| **연령/성별** | 33세 여성, 강남 YBD 권역 |
| **경력** | PM/FM 3년 + 임대 중개 2년 |
| **일상** | 건물 3채 관리, 공실 3호 마케팅 중 |
| **동기** | 공실 호실별로 차별화된 리싱 페이지를 만들어 채널별 마케팅 |
| **불만** | "네이버 부동산, 인스타, 카톡 각각 다른 문구를 만드는 게 너무 번거로움" |

### 시나리오

#### S2-1. 공실 3호 일괄 리싱 페이지 생성

```
[동기] 관리 빌딩 5F, 7F, B1에 공실 3개. 각각 다른 업종에 최적화된 리싱 페이지가 필요

[행동]
1. /broker/leasing 에서 3개 spaces 확인
2. 각 space별 위저드 실행:
   - 5F (오피스): clinic, office 타겟 → 위저드 5단계 완료
   - 7F (오피스): office, academy 타겟 → 위저드 5단계 완료
   - B1 (리테일): fnb, retail 타겟 → 위저드 5단계 완료
3. 결과: 3개의 독립 리싱 페이지 + 9개 채널별 카피 (카카오×3, 네이버×3, 인스타×3)

[결과] 3개 공실 × 3채널 = 9개 마케팅 콘텐츠를 1시간 내에 생성
[터치 포인트] /broker/leasing → /broker/leasing/[spaceId] (×3)
```

#### S2-2. 문의 접수 → 자동 CRM → 방문 안내

```
[동기] 5F 리싱 페이지에서 정형외과 원장님이 문의 접수

[행동]
1. /leasing/gangnam-5f-medical 에서 문의 폼 제출됨
2. AI 자동 파이프라인:
   - inquiry_qualifier 에이전트가 적합성 판정 → fit_estimate: "high"
   - broker_clients에 "김OO 원장" A등급 자동 등록
   - tenant_intent 자동 생성 (업종: clinic, 예산: 500만, 면적: 30평)
   - lease_match_results 자동 매칭 → S등급
3. /broker/leasing/[spaceId] 상세에서 문의 목록 확인
4. AI가 생성한 카톡 답변 초안 확인 → 수정 후 전송
5. 방문 일정 잡기

[결과] 문의 접수 → 답변 초안까지 자동. CRM 수동 입력 불필요.
```

#### S2-3. 빌딩 스튜디오에서 종합 자산 관리

```
[동기] 관리 빌딩의 브리핑 자료, 공시 서류, 임대 현황을 한곳에서 관리

[행동]
1. /broker/buildings/[id]/studio 접속 — 종합 대시보드
2. studio/briefing — AI 브리핑 생성 (투자자 미팅용)
3. studio/disclosure — 중개대상물 공시 서류 관리
4. studio/lease — 빌딩 내 임대 공간 현황
5. studio/files — 등기부, 건축물대장 등 증빙 파일 업로드
6. /broker/buildings/[id]/snapshot — AI 빌딩 스냅샷 생성
7. /broker/buildings/[id]/owner-report — 건물주 보고서 생성

[결과] 분산된 빌딩 관리 작업을 단일 스튜디오에서 처리
[터치 포인트] /broker/buildings/[id]/studio/* (6개 하위 페이지)
```

---

## P3. 이건우 — 건물주 (오너)

### 프로필

| 항목 | 내용 |
|------|------|
| **연령/성별** | 55세 남성, 서초구 소형 빌딩 보유 |
| **경력** | 건물 보유 8년, 매각 첫 검토 |
| **동기** | "내 건물이 지금 팔면 얼마인지, 무엇을 준비해야 하는지 알고 싶다" |
| **불만** | "중개인한테 물어보면 각자 말이 다르고, 뭘 준비해야 하는지도 모르겠다" |

### 시나리오

#### S3-1. 매각 준비도 자가 진단

```
[동기] 매각을 고려 중이지만, 현재 상태에서 무엇이 가능한지 모름

[행동]
1. /owner-readiness 접속
2. 10개 항목 체크리스트 작성:
   ✅ 등기부등본, 건축물대장, 건물 사진, 희망 매각가
   ❌ 임대차 현황표, 평면도, 수선 이력, 공실 현황, 토지이용계획
3. AI 분석 결과: 55/100점 → "블라인드 티저 생성 가능" 단계
4. 결과 패널에서:
   - 사용 가능한 산출물: deal_curiosity_report ✅, blind_teaser ✅, snapshot ❌, IM ❌
   - 부족 서류 목록: 임대차 현황표 (20점), 토지이용계획 (10점)
   - 18개 IM 섹션 중 7개 잠금 → 어떤 서류가 있으면 열리는지 안내

[결과] 중개인 없이도 매각 준비 상태를 객관적으로 진단
[터치 포인트] /owner-readiness
```

#### S3-2. Building Radar로 딜 가능성 확인

```
[동기] "우리 건물 주변 최근 거래 동향은? 관심 가질 매수자가 있을까?"

[행동]
1. /building-radar 접속
2. 건물 주소 입력 → AI 빌딩 레이더 리포트 생성
3. 결과:
   - 권역 시장 동향 (GBD 수요 강도 72/100)
   - 유사 매물 비교
   - 잠재 매수자 클러스터
4. "중개인 연결 요청" → 브로커 매칭

[결과] 비전문가도 빌딩 딜 가능성을 시각적으로 확인
[터치 포인트] /building-radar → /building-radar/result/[id]
```

#### S3-3. Full IM Studio 핸드오프

```
[동기] 준비도 70점 이상 달성 후 본격 투자설명서(IM) 작성을 위해 전문 툴로 이관

[행동]
1. /owner-readiness에서 스코어 75점 달성
2. "Full IM Studio로 연결" 버튼 활성화
3. 핸드오프 토큰 생성 → 외부 Full IM Studio 앱으로 데이터 이관
4. 기존 체크리스트 결과 + SSoT 데이터가 자동 전달

[결과] DealCard Hub에서 축적한 데이터를 손실 없이 전문 도구로 이관
[터치 포인트] /owner-readiness → /api/full-im-handoffs → 외부 앱
[테이블] handoffs
```

---

## P4. 정하나 — 임차 희망자 (카페 창업자)

### 프로필

| 항목 | 내용 |
|------|------|
| **연령/성별** | 29세 여성, 성수동 카페 창업 준비 |
| **동기** | 월세 500만 이내, 1층 또는 지하 1층, 30평 이상 |
| **불만** | "네이버 부동산에는 상가 정보가 부실하고, 전화해봐야 이미 나간 곳이 많다" |

### 시나리오

#### S4-1. 마켓플레이스에서 블라인드 매물 탐색

```
[동기] 성수동 F&B 가능한 공간을 찾고 싶음

[행동]
1. /marketplace 접속
2. 필터 설정: 권역 "성수", 유형 "F&B (식음)", 월세 상한 500만, 최소 면적 30평
3. 블라인드 매물 카드 4건 표시:
   - 보증금/월세 범위, 전용 면적, 렌트프리 조건
   - ✨ 임대 강점 (AI 분석)
   - ⚠️ 입점 주의사항
   - 🔒 정확한 주소, 임대인 정보 등은 게이트 잠금
4. 관심 매물 클릭 → 상세 모달에서 연락처 입력 → 게이트 요청

[결과] 허위 매물 걱정 없이 AI가 분석한 블라인드 매물 탐색
[터치 포인트] /marketplace
[테이블] lease_spaces (is_marketplace_listed=true)
```

#### S4-2. AI 리싱 페이지에서 상세 정보 + 문의

```
[동기] 중개인이 보내준 리싱 페이지 링크로 접속

[행동]
1. /leasing/seongsu-1f-cafe 접속
2. AI 생성 리싱 페이지 확인:
   - 공간 소개, 시설 정보, 주변 환경
   - TenantFit 결과: "F&B (카페)" → 적합도 92점 (high_potential)
   - 주의 사항: 덕트 설치 가능 여부 확인 필요
3. 하단 InquiryForm에서 문의 작성:
   - 업종: F&B, 희망 면적: 30평, 입주 시기: 3개월 내
   - 방문 희망 체크 ✅
   - 개인정보 동의 → 제출
4. AI가 자동으로 적합성 판정 → 중개인에게 알림

[결과] 중개인과 통화 전에 충분한 정보 확보 + 구조화된 문의
[터치 포인트] /leasing/[slug]
[테이블] leasing_inquiries, inquiry_qualifications, broker_clients, tenant_intent
```

#### S4-3. 시장 동향 파악 후 협상 근거 마련

```
[동기] 성수 권역 월세 시세를 파악해서 협상에 활용하고 싶음

[행동]
1. /pulse 접속 → 성수 권역 선택
2. /pulse/seongsu/weekly 에서:
   - Pulse Score: 78/100 (수요 강세)
   - 공급 시그널: 신규 임대 5건, 활성 12건
   - 가격 시그널: 평균 가격 갭 -3.2%
3. /market/seongsu 에서 권역 상세 리포트 확인

[결과] 데이터 기반 협상 근거 확보
[터치 포인트] /pulse → /pulse/[region]/[period] → /market/[region]
```

---

## P5. 최민호 — CRE 투자자

### 프로필

| 항목 | 내용 |
|------|------|
| **연령/성별** | 47세 남성, 자산가 |
| **동기** | 연 수익률 5%+ 상업용 부동산 투자 기회 탐색 |
| **불만** | "좋은 딜은 중개인 인맥 없으면 접근이 안 되고, 소액 투자 옵션이 없다" |

### 시나리오

#### S5-1. 크라우드펀딩 마켓플레이스에서 소액 투자

```
[동기] 1억 이하로 상업용 부동산에 분산 투자하고 싶음

[행동]
1. /funding/marketplace 접속 → 프로젝트 목록 탐색
2. /funding/projects/[id] 에서 프로젝트 상세 확인:
   - 목표 금액, 현재 모집률, 예상 수익률
   - AI 생성 프로젝트 카드 (투자 포인트, 리스크 요인)
3. 게이트 검증 → 투자자 자격 확인
4. 투자 참여

[터치 포인트] /funding/marketplace → /funding/projects/[id]
[테이블] crowdfunding_projects, crowdfunding_investments, investor_profiles
```

#### S5-2. 매수 의향서 등록 → 자동 매칭 대기

```
[동기] "GBD 권역 50억 이하 오피스 빌딩에 관심. 딜이 나오면 알려줘"

[행동]
1. /broker (중개인 통해) 또는 직접 매수 의향서 등록
2. AI가 buyer_intent_lite로 정규화
3. 매칭 엔진이 기존 building_ssot_lite와 자동 대조
4. S/A등급 매칭 발생 시 중개인에게 알림

[터치 포인트] /broker/buyer-intents/new
[테이블] buyer_intent_lite, match_results
```

#### S5-3. Pulse + 인사이트로 시장 타이밍 판단

```
[동기] 지금이 매수 적기인지 데이터로 판단하고 싶음

[행동]
1. /pulse 에서 8개 권역 주간 Pulse 스코어 비교
2. /insight 에서 장기 트렌드 분석 아티클 열독
3. /market/gbd 에서 GBD 권역 수요·공급 시그널 확인

[결과] 감이 아닌 데이터 기반 투자 타이밍 판단
[터치 포인트] /pulse → /insight → /market/[region]
```

---

## P6. 한지윤 — 인테리어/법무 벤더

### 프로필

| 항목 | 내용 |
|------|------|
| **연령/성별** | 35세 여성, 상업공간 인테리어 대표 |
| **동기** | 딜 클로징 후 인테리어 수주 연결 |
| **불만** | "부동산 중개인들한테 영업하는 것밖에 방법이 없다" |

### 시나리오

#### S6-1. 벤더 프로필 등록 → 서비스 카드 생성

```
[동기] 플랫폼에 업체 등록하고 포트폴리오를 공개하고 싶음

[행동]
1. POST /api/vendor/profile — 업체 정보 등록 (사업자, 라이선스, 전문 권역)
2. POST /api/vendor/service-cards — 서비스 카드 생성 (가격대, 포트폴리오, 전문 분야)
3. /services/interior 에 노출 → 평점순 정렬

[터치 포인트] /services → /services/[category]/[id]
[테이블] vendors, vendor_service_cards, vendor_portfolio_items
```

#### S6-2. 딜 클로징 연계 서비스 수주

```
[동기] 임차인이 계약 후 인테리어를 알아볼 때 자연스럽게 연결되고 싶음

[행동]
1. 임차인이 /leasing/[slug]에서 문의 → 계약 진행
2. 중개인이 /services/interior 를 임차인에게 추천
3. 임차인이 /services/interior/[id] 에서 "견적 문의하기"
4. POST /api/retrofit/inquire — 인테리어 문의 접수

[결과] 딜 파이프라인과 연계된 자연스러운 수주 채널
```

#### S6-3. 프리미엄 티어로 리드 확보

```
[동기] 더 많은 서비스 카드와 우선 노출을 원함

[행동]
1. /services 페이지의 3티어 구독 모델 확인:
   - Basic (무료, 3개 카드), Pro (29만/월, 10개), Premium (79만/월, 무제한)
2. Pro 구독 → 10개 서비스 카드 + 딜당 커미션 모델
3. 인증 배지 획득 → 서비스 카드에 검증 마크 표시

[터치 포인트] /services → 구독 관리
[테이블] subscriptions
```

---

## P7. 윤시원 — 플랫폼 관리자 (운영팀)

### 프로필

| 항목 | 내용 |
|------|------|
| **연령/성별** | 30세, 운영팀 리드 |
| **동기** | 플랫폼 건강성 모니터링, AI 품질 관리, 매칭 성능 최적화 |
| **불만** | "AI가 생성한 콘텐츠의 품질을 체계적으로 모니터링하기 어렵다" |

### 시나리오

#### S7-1. 일일 파이프라인 헬스체크

```
[동기] 매일 아침 플랫폼 핵심 지표를 한눈에 확인

[행동]
1. /admin 접속 → 관리 대시보드
2. /admin/analytics — 전체 사용 통계 (DAU, 딜카드 생성 수, 매칭 실행 수)
3. /admin/pipeline — 파이프라인 분석 (단계별 전환율, 병목)
4. GET /api/admin/match-failures — 매칭 실패 건 분석 (데이터 품질 이슈)

[결과] 문제 발견 시 즉시 대응 (예: 특정 권역 매칭 실패율 급증)
[터치 포인트] /admin → /admin/analytics → /admin/pipeline
```

#### S7-2. 게이트 요청 심사

```
[동기] 매수자/임차인의 상세 정보 열람 요청(Gate G2/G3) 승인/거부

[행동]
1. /admin/gate-requests 접속
2. 대기 중인 게이트 요청 목록 확인
3. 각 요청별: 요청자 프로필, 대상 매물, 적합성 점수 확인
4. POST /api/gate-requests/[id]/review — 승인 또는 거부 + 사유 입력

[결과] 민감 정보 접근의 체계적 통제
[터치 포인트] /admin/gate-requests
[테이블] gate_requests, gate_audit_logs
```

#### S7-3. 시장 지표 관리 + MOLIT ETL

```
[동기] 국토교통부 실거래가 데이터를 시스템에 반영

[행동]
1. /admin/market — 시장 지표 현황 확인
2. POST /api/admin/etl/molit — MOLIT 데이터 ETL 실행
3. /admin/cross-system (또는 GET /api/admin/cross-system-analytics) — 크로스시스템 분석
4. 전문가 노트 관리: /admin/expert-notes

[결과] 공공 데이터와 플랫폼 데이터의 교차 분석
[터치 포인트] /admin/market → /admin/cross-system
```
