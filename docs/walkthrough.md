# 🏢 JS 딜카드 — 5대 핵심 시나리오 + 모바일 IM 데모 워크스루

> Playwright E2E 브라우저 자동화로 `localhost:3000` 실제 서버에서 캡처한 한글 UI 스크린샷입니다.

---

## 시나리오 1. 📱 카톡 매물 → 1분 블라인드 딜카드

### Step 1: 카톡 메모 붙여넣기

![카톡 메모 입력 화면](C:/Users/User/.gemini/antigravity/brain/d2d6a4d0-e3e7-407c-97de-4a471780cf82/01_deal_card_input.png)

> [!NOTE]
> - "카톡 매물 설명을 붙여넣으세요" — 카카오톡으로 받은 메모를 그대로 붙여넣기
> - 하단 **자동으로 숨기는 정보**: 정확한 주소, 임차인명, 호실별 임대료, 매도자 사정, 협상 관련 내부 메모
> - **'1분 딜카드 만들기'** 버튼 → AI가 자동으로 구조화 및 마스킹 처리

### Step 2: 완성된 블라인드 딜카드 결과

![완성된 딜카드 전체 화면](C:/Users/User/.gemini/antigravity/brain/d2d6a4d0-e3e7-407c-97de-4a471780cf82/01_deal_card_result_full.png)

> [!IMPORTANT]
> **완성 딜카드 핵심 구성요소:**
> - **DEAL PIPELINE STATE MACHINE**: 메모입력 → 딜카드 → Gate → IM작성 → 미팅 → LOI → 계약 단계 추적
> - **🏢 건물 신호 요약**: 권역(성수동), 자산유형(꼬마빌딩), 가격대(70억~78억), 현재사용(1층 카페 임차 중)
> - **🔒 숨긴 정보**: 정확한 주소 / 매도자 사정 / 호실별 임대료 — 민감정보 자동 마스킹
> - **블라인드 티저**: "성수 황금 입지 꼬마빌딩 — 1층 고정 수입 + 공실 업사이드"
> - **딜 포인트**: 1층 카페 임차 월 400만원 고정, 2018년 리모델링, 뚝섬역 도보 7분 등
> - **주의**: 엘리베이터 없음, 2~4층 공실, 매도인 세금 이슈
> - **💬 카톡 문구**: 바로 복사해서 매수자에게 전달 가능한 포맷
> - **거래 매칭 매수자**: S등급·A등급·B등급 매수자 자동 매칭 표시
> - **Gate 요청 양식**: 상세 정보 열람 신청 폼

---

## 시나리오 2. 🎯 매수자 의향 등록 → AI 매칭

### Step 1: 매수자 조건 입력

![매수자 조건 입력 화면](C:/Users/User/.gemini/antigravity/brain/d2d6a4d0-e3e7-407c-97de-4a471780cf82/02_buyer_intent_input.png)

> [!NOTE]
> - "매수자 조건을 그대로 넣어주세요" — 김대표 50~80억, 성수나 강남, 사옥 겸 임대수익
> - AI가 예산, 지역, 목적, 필수조건을 자동 구조화

### Step 2: 매칭 센터

![매칭 센터 화면](C:/Users/User/.gemini/antigravity/brain/d2d6a4d0-e3e7-407c-97de-4a471780cf82/02_matching_results.png)

> [!TIP]
> - **S급 / A급 / B급 / C급** 4단계 등급별 자동 분류
> - 매물과 매수자를 등록하면 AI가 자동 매칭 결과 생성
> - 시드 데이터의 매칭 결과(S등급 89점, A등급 76점, B등급 54점)는 딜카드 상세 페이지에서 확인 가능

---

## 시나리오 3. 🏢 파이프라인 관리

![딜 파이프라인 화면](C:/Users/User/.gemini/antigravity/brain/d2d6a4d0-e3e7-407c-97de-4a471780cf82/03_pipeline.png)

> [!NOTE]
> **7단계 딜 파이프라인:**
> 1. 📝 메모 입력
> 2. 📋 딜카드
> 3. 🔒 Gate
> 4. 📄 IM 작성
> 5. 🤝 미팅
> 6. 📝 LOI
> 7. 📋 계약
>
> 각 단계별 진행 중인 딜 건수가 실시간으로 표시됩니다.

---

## 시나리오 4. 👥 고객(CRM) 관리

![고객 관리 화면](C:/Users/User/.gemini/antigravity/brain/d2d6a4d0-e3e7-407c-97de-4a471780cf82/04_clients.png)

> [!NOTE]
> - **매도자 / 매수자 / 매도·매수** 유형별 필터
> - **등급별 필터** 지원
> - 검색 기능 (이름, 회사, 연락처)
> - **'첫 고객 등록하기'** CTA로 온보딩 유도

---

## 시나리오 5. 📊 아침 코크핏 대시보드

![코크핏 대시보드 화면](C:/Users/User/.gemini/antigravity/brain/d2d6a4d0-e3e7-407c-97de-4a471780cf82/05_cockpit.png)

> [!TIP]
> **코크핏 구성요소:**
> - **인사말**: "좋은 아침이에요, 중개인님." + 날짜
> - **오늘의 현황 KPI**: 매매물건 / 임대물건 / S/A 매칭 / 관리 고객 / 매수 고객
> - **알림**: "강남 GBD 수요 지수 42 (공급 78)" 실시간 시장 지표
> - **🏢 안티프래질 침체기 모드 활성화**: 공급 지수 78pts vs 수요 강도 42pts, 가격 저항선 & 체류 경고
> - **안티프래질 행동 경로**: 임대차 딜카드 전환 제안, 보류(Hold) 거래 집중 타점 분석
> - **절약한 시간 및 비용**: 이번 달 실시간 생산성 가치 ROI
> - **파이프라인 KPI**: 내 딜 체류일수 28.5일, S등급 매칭 전환율 42.5%

---

## 보너스 시나리오. 📄 모바일 IM(투자설명서) 작성

### Step 1: 딜카드에서 IM 작성 시작 (입력 트리거)

![딜카드 CTA 바 — IM 작성 버튼](C:/Users/User/.gemini/antigravity/brain/d2d6a4d0-e3e7-407c-97de-4a471780cf82/06_deal_card_cta_bar.png)

> [!NOTE]
> **딜카드 하단 CTA 버튼 모음:**
> - **G1 등록 관심** → 기본 정보 확인
> - **G2 임대상세 요약 요청** → 자격 확인 후 제한적 추가 정보
> - **G3 투자 자료 요청** → 상세 투자 자료 및 예비검토 자료
> - **● 문구 복사** — 카톡 전달용 문구 1클릭 복사
> - **📱 Full IM Studio에서 투자각서 만들기** — 전체 IM 작성
> - **✨ 모바일 투자설명서 만들기 (약 3분)** — 핵심 10페이지 IM Lite
> - **🏠 AI 임대 홈페이지 만들기** — 자동 임대 랜딩페이지
> - **매수자 전체 보기** / **건물주 리포트** / **전문가 코멘트 받기**

### Step 2: IM Lite 뷰어 — 완성도 부족 시 (데이터 입력 안내)

![IM Lite 잠김 상태](C:/Users/User/.gemini/antigravity/brain/d2d6a4d0-e3e7-407c-97de-4a471780cf82/08_im_lite_viewer.png)

> [!WARNING]
> - **IM Lite 생성 불가 (완성도 부족)**: 현재 완성도 점수 5점
> - SSoT 완성도 **80점 이상**일 때 전체 구조가 해제됨
> - **'데이터 보강하러 가기'** 버튼 → 스튜디오에서 증빙 자료 업로드

### Step 3: IM Lite 뷰어 — 완성도 충족 시 (모든 섹션 해제)

![IM Lite 전체 섹션 해제 화면](C:/Users/User/.gemini/antigravity/brain/d2d6a4d0-e3e7-407c-97de-4a471780cf82/10_im_lite_unlocked.png)

> [!IMPORTANT]
> **IM Lite 10개 핵심 섹션 (모두 "생성 준비완료"):**
> 1. **Executive Summary** — 핵심 투자 요약
> 2. **Property Overview** — 자산 개요
> 3. **Location Analysis** — 입지 분석
> 4. **Building Specs** — 건물 사양
> 5. **Tenant Mix** — 임차인 구성
> 6. **Cash Flow Ref** — 수익 참고 자료
> 7. **Risk Factors** — 리스크 요인
> 8. **Next Steps** — 다음 단계 안내
> 9. **Missing Data** — 미비 자료 목록
> 10. **Disclaimer** — 면책 조항
>
> **"본문 생성하기 (v0.4 예정)"** 버튼으로 AI가 자동 생성

### Step 4: 빌딩 스냅샷 — 자동 생성 요약본

![빌딩 스냅샷 화면](C:/Users/User/.gemini/antigravity/brain/d2d6a4d0-e3e7-407c-97de-4a471780cf82/09_building_snapshot.png)

> [!TIP]
> - SSoT 완성도 60점 이상일 때 AI가 자동 생성하는 **1페이지 투자 요약본**
> - **'스냅샷 지금 생성하기'** 버튼 → 즉시 생성 가능
> - 상단 **'← 스튜디오로 돌아가기'** / **'스냅샷 생성하기'** 네비게이션

---

## 📸 스크린샷 인벤토리

| # | 파일명 | 설명 |
|---|--------|------|
| 1 | `01_deal_card_input.png` | 카톡 메모 입력 화면 |
| 2 | `01_deal_card_result_full.png` | 완성된 블라인드 딜카드 |
| 3 | `02_buyer_intent_input.png` | 매수자 조건 입력 |
| 4 | `02_matching_results.png` | AI 매칭 센터 |
| 5 | `03_pipeline.png` | 딜 파이프라인 |
| 6 | `04_clients.png` | CRM 고객 관리 |
| 7 | `05_cockpit.png` | 코크핏 대시보드 |
| 8 | `06_deal_card_cta_bar.png` | 딜카드 CTA 바 (IM 작성 트리거) |
| 9 | `08_im_lite_viewer.png` | IM Lite 잠김 상태 (완성도 부족) |
| 10 | `10_im_lite_unlocked.png` | IM Lite 전체 섹션 해제 |
| 11 | `09_building_snapshot.png` | 빌딩 스냅샷 생성 대기 |
