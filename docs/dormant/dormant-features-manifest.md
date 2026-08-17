# 휴면(Dormant) 기능 명세서 및 차단 기록

> 문서 버전: v1.0 | 차단 일자: 2026-08-17  
> 차단 사유: **알파 집중 전략** — 핵심 기능(딜카드/매칭/CRM/메모/인텔리전스)에 리소스 집중  
> 복구 난이도: 🟢 Low (코드 삭제 없음, 주석 해제로 즉시 복원)

---

## 1. 차단 대상 기능 총괄

| # | 기능군 | 차단 키 | 페이지 수 | 라우트 패턴 |
|:---:|:---|:---|:---:|:---|
| B | 온보딩 (Shock & Awe) | `onboarding` | 1 | `/onboarding` |
| V | Vibe 명함 | `vibe-card` | 2 | `/broker/my-card`, `/broker/my-card/new` |
| I | 임대/리싱 스튜디오 | `leasing-studio` | 8 | `/broker/lease-card/*`, `/broker/leasing/*`, `/broker/tenant-intents/*`, `/leasing/[slug]` |
| L | 펀딩/게이트/NDA | `funding-gate-nda` | 5 | `/funding/*`, `/nda/[id]`, `/marketplace` |
| M | 공개 페이지 | `public-pages` | 7+3 | `/pulse/*`, `/insight/*`, `/explore`, `/market/*` |
| | **합계** | | **26** | |

---

## 2. 기능별 상세 명세

---

### B. 온보딩 (Shock & Awe)

**기능 설명**: 신규 가입 사용자를 위한 전체 화면 온보딩 플로우. 프로필 사진 촬영 → 7축 Vibe 분석 → 전문분야/권역/역할 선택 → 이름/연락처 입력

**차단 내역**:

| 차단 지점 | 파일 | 방식 |
|:---|:---|:---|
| 대시보드 강제 리다이렉트 | `src/app/(broker)/broker/page.tsx` L41-57 | 블록 주석 처리 |
| 온보딩 페이지 접근 | `src/app/(auth)/onboarding/page.tsx` | `redirect("/broker")` 삽입 |

**관련 DB 테이블**:
- `onboarding_sessions` — 온보딩 완료 기록 (데이터 보존)
- `profiles.photo_url` — 온보딩 중 업로드된 아바타 (보존)

**관련 API**:
- `POST /api/onboarding/save` — 온보딩 데이터 저장
- `POST /api/onboarding/complete` — 온보딩 완료 처리
- `POST /api/onboarding/photo` — 프로필 사진 업로드

---

### V. Vibe 명함

**기능 설명**: 중개사 전용 디지털 명함 생성. 5개 유형(매도자/매수자/임차인/네트워킹/건물주) 선택 → 카카오 공유 텍스트 + Vibe Card URL 생성

**차단 내역**:

| 차단 지점 | 파일 | 방식 |
|:---|:---|:---|
| 명함 목록 페이지 | `src/app/(broker)/broker/my-card/page.tsx` | `redirect("/broker")` 삽입 |
| 명함 생성 페이지 | `src/app/(broker)/broker/my-card/new/page.tsx` | `redirect("/broker")` 삽입 |

**관련 DB 테이블**:
- `broker_cards` — 명함 데이터 (보존)
- `profiles.slug` — 공개 프로필 슬러그 (보존, 프로필 기능에서 별도 사용)

**관련 API**:
- `POST /api/broker/my-card` — 명함 CRUD
- `GET /api/broker/my-card/[id]` — 명함 조회

---

### I. 임대/리싱 스튜디오

**기능 설명**: 임대 매물 등록 → AI 사진 분류 → 임차인 적합도 분석 → 리싱 페이지 생성 → 채널별 카피. 임차 의향서 등록 및 자동 매칭 포함.

**차단 내역**:

| 차단 지점 | 파일 | 방식 |
|:---|:---|:---|
| 더보기 메뉴 | `src/components/layout/BrokerMoreMenu.tsx` L99-106 | 항목 주석 처리 |
| 임대카드 목록 | `src/app/(broker)/broker/lease-card/page.tsx` | `redirect("/broker")` |
| 임대카드 생성 | `src/app/(broker)/broker/lease-card/new/page.tsx` | `redirect("/broker")` |
| 임대카드 상세 | `src/app/(broker)/broker/lease-card/[id]/page.tsx` | `redirect("/broker")` |
| 리싱 대시보드 | `src/app/(broker)/broker/leasing/page.tsx` | `redirect("/broker")` |
| 리싱 스튜디오 | `src/app/(broker)/broker/leasing/[spaceId]/page.tsx` | `redirect("/broker")` |
| 임차의향서 목록 | `src/app/(broker)/broker/tenant-intents/page.tsx` | `redirect("/broker")` |
| 임차의향서 생성 | `src/app/(broker)/broker/tenant-intents/new/page.tsx` | `redirect("/broker")` |
| 임차의향서 상세 | `src/app/(broker)/broker/tenant-intents/[id]/page.tsx` | `redirect("/broker")` |
| 공개 리싱 페이지 | `src/app/(public)/leasing/[slug]/page.tsx` | `redirect("/hub")` |

**관련 DB 테이블**:
- `lease_cards` — 임대 매물 카드
- `lease_card_matches` — 임대 매칭 결과
- `tenant_intents` — 임차 의향서
- `spaces` — AI 리싱 스튜디오 공간 레코드
- `space_photos` — 공간 사진 분류 결과

**관련 API**:
- `POST /api/broker/lease-card` — 임대카드 CRUD
- `POST /api/broker/lease-card/from-memo` — 메모→임대카드 변환
- `POST /api/broker/tenant-intents/from-memo` — 메모→임차의향서 변환
- `GET /api/broker/leasing/[spaceId]` — 리싱 스튜디오 데이터
- `POST /api/broker/leasing/generate` — AI 리싱 페이지 생성

---

### L. 펀딩/게이트/NDA

**기능 설명**: 조각투자 마켓플레이스, 투자자 프로필 AI 분석, KYC 인증, Gate Level 정보 공개, NDA 전자서명 → Pro IM 접근 제어

**차단 내역**:

| 차단 지점 | 파일 | 방식 |
|:---|:---|:---|
| 공개 더보기 메뉴 | `src/components/layout/PublicMoreMenu.tsx` L77-84 | 항목 주석 처리 |
| 펀딩 마켓 | `src/app/(funding)/funding/marketplace/page.tsx` | `redirect("/hub")` |
| 투자자 프로필 | `src/app/(funding)/funding/investor/page.tsx` | `redirect("/hub")` |
| 프로젝트 생성 | `src/app/(funding)/funding/projects/new/page.tsx` | `redirect("/hub")` |
| 프로젝트 상세 | `src/app/(funding)/funding/projects/[id]/page.tsx` | `redirect("/hub")` |
| NDA 서명 | `src/app/(public)/nda/[id]/page.tsx` | `redirect("/hub")` |
| 마켓플레이스 | `src/app/(public)/marketplace/page.tsx` | `redirect("/hub")` |

**관련 DB 테이블**:
- `funding_projects` — 펀딩 프로젝트
- `investor_profiles` — 투자자 프로필
- `gate_requests` — 게이트 요청
- `nda_signatures` — NDA 서명 기록
- `im_access_grants` — Pro IM 접근 권한

**관련 API**:
- `POST /api/funding/project/from-memo` — 메모→펀딩 변환
- `POST /api/funding/match` — 투자자 매칭
- `POST /api/gate-requests` — 게이트 요청
- `POST /api/nda/sign` — NDA 서명
- `GET /api/full-im-handoffs/[token]` — 핸드오프 토큰

---

### M. 공개 페이지 (펄스/인사이트/마켓)

**기능 설명**: 8권역 주간 시장 펄스, 롱폼 인사이트 기사, 세금/DD 시뮬레이터, 권역별 마켓 리포트, 매물 탐색

**차단 내역**:

| 차단 지점 | 파일 | 방식 |
|:---|:---|:---|
| 공개 하단 탐색 | `src/components/layout/PublicBottomNav.tsx` L25-36 | 탭 주석 처리 |
| 더보기 메뉴 | `src/components/layout/PublicMoreMenu.tsx` L56-63 | 항목 주석 처리 |
| 중개사 더보기 | `src/components/layout/BrokerMoreMenu.tsx` L110-138 | 섹션 주석 처리 |
| 펄스 허브 | `src/app/(public)/pulse/page.tsx` | `redirect("/hub")` |
| 펄스 상세 | `src/app/(public)/pulse/[region]/[period]/page.tsx` | `redirect("/hub")` |
| 인사이트 목록 | `src/app/(public)/insight/page.tsx` | `redirect("/hub")` |
| 인사이트 상세 | `src/app/(public)/insight/[slug]/page.tsx` | `redirect("/hub")` |
| 인사이트 도구 | `src/app/(public)/insight/tools/page.tsx` | `redirect("/hub")` |
| 탐색 | `src/app/(public)/explore/page.tsx` | `redirect("/hub")` |
| 마켓 리포트 | `src/app/(public)/market/[region]/page.tsx` | `redirect("/hub")` |

**관련 DB 테이블**:
- `pulse_snapshots` — 주간 펄스 스냅샷
- `pulse_votes` — 센티먼트 투표
- `insight_articles` — 인사이트 기사
- `market_reports` — 마켓 리포트

**관련 API**:
- `GET /api/public/pulse/[region]` — 펄스 데이터
- `POST /api/pulse/sentiment/vote` — 투표
- `GET /api/public/insight/[slug]` — 기사 조회
- `GET /api/public/market-report/[region]` — 마켓 리포트
- `GET /api/public/market-intelligence` — 시장 인텔리전스

---

## 3. 차단 방식 요약

### 중앙 레지스트리
```
src/lib/dormant-features.ts
```
- `DORMANT_FEATURES` 배열에 5개 키 등록
- `isDormant(key)` 유틸 함수 제공

### 코드 태깅 규칙
모든 차단 코드에 `/* DORMANT: {featureKey} — {description} */` 주석 삽입

```bash
# 전체 차단 지점 검색
grep -rn "DORMANT" src/
```

### 차단 수준

| 수준 | 방식 | 적용 범위 |
|:---|:---|:---|
| L1. 네비게이션 숨김 | 메뉴 항목 주석 처리 | `BrokerMoreMenu`, `PublicBottomNav`, `PublicMoreMenu` |
| L2. 페이지 리다이렉트 | `redirect()` 삽입 | 26개 page.tsx |
| L3. 서버 리다이렉트 | 대시보드 온보딩 체크 비활성화 | `broker/page.tsx` |

> ⚠️ **API 엔드포인트는 차단하지 않음** — DB 데이터 보존 및 기존 연동 유지를 위해 API는 그대로 유지합니다.

---

## 4. 복구 절차 체크리스트

특정 기능을 복구할 때 아래 단계를 순서대로 수행합니다:

### 전체 복구
```bash
# 1. 모든 DORMANT 주석 검색
grep -rn "DORMANT" src/

# 2. 해당 기능의 주석 해제
# 3. dormant-features.ts에서 키 제거
# 4. npm run build 로 빌드 확인
# 5. git push origin main 으로 배포
```

### 기능별 복구 가이드

#### B. 온보딩 복구
- [ ] `src/app/(broker)/broker/page.tsx` — 온보딩 리다이렉트 블록 주석 해제
- [ ] `src/app/(auth)/onboarding/page.tsx` — `redirect("/broker")` 제거
- [ ] `src/lib/dormant-features.ts` — `"onboarding"` 키 제거
- [ ] 빌드 확인 → 배포

#### V. Vibe 명함 복구
- [ ] `src/app/(broker)/broker/my-card/page.tsx` — `redirect("/broker")` 제거
- [ ] `src/app/(broker)/broker/my-card/new/page.tsx` — `redirect("/broker")` 제거
- [ ] `src/lib/dormant-features.ts` — `"vibe-card"` 키 제거
- [ ] 빌드 확인 → 배포

#### I. 임대/리싱 스튜디오 복구
- [ ] `src/components/layout/BrokerMoreMenu.tsx` — "AI 리싱 스튜디오" 항목 주석 해제
- [ ] `src/app/(broker)/broker/lease-card/page.tsx` — redirect 제거
- [ ] `src/app/(broker)/broker/lease-card/new/page.tsx` — redirect 제거
- [ ] `src/app/(broker)/broker/lease-card/[id]/page.tsx` — redirect 제거
- [ ] `src/app/(broker)/broker/leasing/page.tsx` — redirect 제거
- [ ] `src/app/(broker)/broker/leasing/[spaceId]/page.tsx` — redirect 제거
- [ ] `src/app/(broker)/broker/tenant-intents/page.tsx` — redirect 제거
- [ ] `src/app/(broker)/broker/tenant-intents/new/page.tsx` — redirect 제거
- [ ] `src/app/(broker)/broker/tenant-intents/[id]/page.tsx` — redirect 제거
- [ ] `src/app/(public)/leasing/[slug]/page.tsx` — redirect 제거
- [ ] `src/lib/dormant-features.ts` — `"leasing-studio"` 키 제거
- [ ] 빌드 확인 → 배포

#### L. 펀딩/게이트/NDA 복구
- [ ] `src/components/layout/PublicMoreMenu.tsx` — "비공개 임대 마켓" 항목 주석 해제
- [ ] `src/app/(funding)/funding/*/page.tsx` (4개) — redirect 제거
- [ ] `src/app/(public)/nda/[id]/page.tsx` — redirect 제거
- [ ] `src/app/(public)/marketplace/page.tsx` — redirect 제거
- [ ] `src/lib/dormant-features.ts` — `"funding-gate-nda"` 키 제거
- [ ] 빌드 확인 → 배포

#### M. 공개 페이지 복구
- [ ] `src/components/layout/PublicBottomNav.tsx` — 탐색/펄스 탭 주석 해제
- [ ] `src/components/layout/PublicMoreMenu.tsx` — "세금·DD 도구" 항목 주석 해제
- [ ] `src/components/layout/BrokerMoreMenu.tsx` — "시장 인텔리전스" 섹션 주석 해제
- [ ] `src/app/(public)/pulse/*/page.tsx` (2개) — redirect 제거
- [ ] `src/app/(public)/insight/*/page.tsx` (3개) — redirect 제거
- [ ] `src/app/(public)/explore/page.tsx` — redirect 제거
- [ ] `src/app/(public)/market/[region]/page.tsx` — redirect 제거
- [ ] `src/lib/dormant-features.ts` — `"public-pages"` 키 제거
- [ ] 빌드 확인 → 배포

---

## 5. 차단 이력

| 일자 | 조치 | 사유 | 수행자 |
|:---|:---|:---|:---|
| 2026-08-17 | 5개 기능군 전체 Dormant 전환 | 알파 핵심 기능 집중 전략 | AI 페어 프로그래밍 |

---

## 6. 영향받지 않는 기능 (Active)

아래 기능은 차단 대상이 **아닙니다**:

- ✅ 회원가입/로그인/비밀번호 초기화
- ✅ 프로필 관리 (명함 제외)
- ✅ 딜카드 (매매) 전체 파이프라인
- ✅ IM Basic/Pro/PPTX 파이프라인
- ✅ AI 매칭 (매수의향서 기반)
- ✅ 메모 (텍스트/음성/AI 라우팅)
- ✅ 모닝 인텔리전스 (HQ/마이인텔/결합)
- ✅ 매거진 (에디터/구독/배포)
- ✅ 소통 관리함/공유링크
- ✅ 고객 CRM
- ✅ 서클 (협업/상호승인)
- ✅ 임장 스케줄
- ✅ 딜 파이프라인/퍼널
- ✅ 캠페인 카피 AI
