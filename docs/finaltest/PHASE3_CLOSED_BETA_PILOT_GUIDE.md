# Phase 3 현업 중개사 클로즈드 베타 파일럿 상세 운영 및 현장 가이드

> **대상 시스템**: CRE DealCard (`https://www.credeal.net`, Build Stamp `#5fac400b`, `origin/main` `5fac400b` 기준)  
> **적용 범위**: Phase 0 ~ Phase 3 배포 완료본 대상 **현업 중개사 3~5명 클로즈드 베타 파일럿(2주/14일 무장애 검증 윈도우)**  
> **범위 제외(Phase 4 이월)**: PG 유료 구독 결제 및 솔라피(Solapi) 실시간 알림톡 실발송(`INBOX_ALIMTALK_LIVE=1`)은 본 파일럿 범위에서 제외됩니다.

---

## 목차
1. [문서 개요 및 파일럿 운영 원칙](#0-문서-개요-및-파일럿-운영-원칙)
2. [D-1 운영자 환경·보안 사전 점검표](#d-1-운영자-환경보안-사전-점검표)
3. [Part 1. 5대 법정 표기 프로필 설정 상세 해설 (`/broker/profile`)](#part-1-5대-법정-표기-프로필-설정-상세-해설-brokerprofile)
4. [Part 2. 실매물 1사이클 5분 완주 체험 가이드 (Step A ~ Step E)](#part-2-실매물-1사이클-5분-완주-체험-가이드-step-a--step-e)
5. [Part 3. 5대 핵심 퍼널 SLO 관측 & 장애 초동 대응 플레이북](#part-3-5대-핵심-퍼널-slo-관측--장애-초동-대응-플레이북)
6. [Part 4. Phase 3 종료 판정(Go / No-Go), 14일 무장애 폴백 청산 & Phase 4 진입 기준](#part-4-phase-3-종료-판정go--no-go-14일-무장애-폴백-청산--phase-4-진입-기준)
7. [부록. 현업 중개사 5분 파일럿 현장 피드백 기록지](#부록-현업-중개사-5분-파일럿-현장-피드백-기록지)

---

## 0. 문서 개요 및 파일럿 운영 원칙

본 문서는 `Phase 0 ~ Phase 3`(`PR-1A` ~ `PR-3`)까지의 보안·거버넌스·단일 진실 원천(SSoT)·퍼널 관측성 고도화가 실운영 환경(`https://www.credeal.net`)에 반영된 이후, **실제 상업용 부동산(CRE) 중개 현업 종사자 3~5명을 대상으로 실매물 1사이클을 5분 내에 완주시키고 무장애 운영을 검증하기 위한 표준 운영 절차(SOP) 겸 현장 해설서**입니다.

### 파일럿 핵심 운영 원칙 4가지
1. **소수 정예 통제 파일럿 (3~5명)**: 다양한 PC/모바일(카카오톡 인앱 브라우저 포함) 및 시니어/주니어 숙련도를 대표하는 3~5명의 중개사에게만 접근을 허용하며, 초기 뉴스레터 실발송은 반드시 화이트리스트(`MAGAZINE_SEND_ALLOWLIST`)로 제한합니다.
2. **Fail-Closed 법정·보안 게이트 실전 검증**: 샘플 문구(`홍길동`, `11680-2024-00123`, `010-0000-0000` 등)나 필수 매물 정보가 비어 있는 상태에서 발행/발송이 `HTTP 422 STATUTORY_DISCLOSURE_INCOMPLETE`로 정확히 차단되는지 현업 입력으로 확인합니다.
3. **공격 표면 및 미성숙 버티컬 격리 유지**: 실험적 버티컬(`/funding`, `/broker/circles`, `/buildings/[id]/schedule`, `/agora`, `/services`, `/building-radar`)은 `404` 격리 상태를 유지하고, 구 경로(`/broker/campaign`, `/broker/w/magazine`, `/broker/magazine-editor`, `/broker/inbox`)는 표준 워크스페이스(`/broker/w/newsletter`, `/broker/w/inbox`)로 `308` 영구 리다이렉트되는 정돈된 동선만 제공합니다.
4. **무관용 SLO 관측 & Phase 4 선결 조건**: `CRITICAL_SLO_CODES` 5종(`LOOKUP_FAILED`, `DB_WRITE_FAILED`, `QUEUE_STALLED`, `GOVERNANCE_CHECK_UNAVAILABLE`, `STORAGE_UPLOAD_FAILED`) 발생 시 즉시 초동 대응하고, 연속 14일 무장애가 입증된 뒤에야 레거시 폴백 코드를 청산하고 Phase 4(결제·솔라피 실발송)로 진입합니다.

---

## D-1 운영자 환경·보안 사전 점검표

파일럿 초대 링크를 중개사에게 배포하기 최소 하루 전(D-1), 운영자는 **Vercel Production 환경 변수 12항목**과 **자동 헬스 검증 커맨드 2종**을 반드시 통과시켜야 합니다.

### 1) Vercel Production 환경 변수 12항목 점검표

> **확인 경로**: Vercel Dashboard -> Project -> `Settings` -> `Environment Variables` (`Production` 스코프)

| # | 환경 변수명 | 필수 설정 상태 / 역할 | 미설정·오설정 시 위험 및 비고 |
|:---:|:---|:---|:---|
| 1 | `SHARE_LINK_SECRET` | **필수 설정** (고엔트로피 랜덤 문자열) | IM/딜카드 공유 링크 서명·검증 키. 미설정 시 링크 보안 약화 |
| 2 | `UNSUBSCRIBE_SECRET` | **필수 설정** | 뉴스레터 수신거부(`email_hash`) 서명·검증 토큰 키 |
| 3 | `CRON_SECRET` | **필수 설정** | `cron/retention-purge` 등 배치 크론 엔드포인트 인증 키 |
| 4 | `RESEND_API_KEY` | **필수 설정** | 뉴스레터 이메일 발송용 Resend API 키 |
| 5 | `RESEND_WEBHOOK_SECRET` | **필수 설정** | 반송/수신거부/이메일 억제(`email_suppressions`) 웹훅 서명 검증 |
| 6 | `ERROR_WEBHOOK_URL` 또는 `SLACK_WEBHOOK_URL` | **필수 설정** | `notifySloAlert` 발동 시 `2.5s` 타임아웃으로 `funnel_slo_alert` JSON POST 수신 |
| 7 | `QA_ACCESS_KEY` / `QA_BROKER_ACCESS_KEY` / `QA_TESTER_ACCESS_KEY` | **필수 설정** (외부 비공개) | `/qa-signoff`, `/qa-broker`, `/qa-tester` 등 내부 QA 포털 게이트 (`src/lib/security/qa-gate.ts`) |
| 8 | `MAGAZINE_SEND_ENABLED` | 단계별 제어 (초기 `false`, 카나리 시 `true`) | 기본값 Fail-Closed `false`. 허용 전까지 실발송 전역 차단 |
| 9 | `MAGAZINE_SEND_DRY_RUN` | 카나리 1단계 `true`, 실이메일 테스트 시 `false` | `'false'` 또는 `'0'`이 아니면 모두 Dry-Run 동작 |
| 10 | `MAGAZINE_SEND_ALLOWLIST` | **파일럿 참여자 본인 이메일/번호만 쉼표(`,`) 또는 세미콜론(`;`) 구분 등록** | 허용 목록 외 일반 DB 구독자에게 오발송되는 사고 방지 |
| 11 | `CI` | **반드시 미설정(Unset)** | `isRealProductionRuntime()`은 `VERCEL_ENV === 'production'`을 확인하나 실환경 혼동 방지 |
| 12 | `CRE_ENABLE_EXPERIMENTAL_VERTICALS` | **반드시 미설정(Unset)** (`'1'` 금지) | `'1'`이 아닐 때 `/funding`, `/broker/circles`, `/buildings/[id]/schedule` `404` 격리 유지 |

#### 보조 발송/추적 플래그 확인 (`src/lib/magazine/send-flags.ts`)
- `MAGAZINE_CRON_GENERATE_ENABLED`: 자동 생성 크론 제어 (파일럿 중 수동 발행을 원칙으로 하며 필요 시에만 개방)
- `MAGAZINE_AUTO_SEND_ALLOWED`: 무인 자동 발송 여부 (파일럿 기간 동안 중개사 수동 발송 검증을 위해 비활성 유지 권장)
- `MAGAZINE_TRACKING_ENABLED`: 열람/트래킹 정책 플래그
- `INBOX_ALIMTALK_LIVE`: **Phase 3에서는 미설정 / `1` 금지** (솔라피 실발송 및 과금 연동은 Phase 4 범위)

---

### 2) 자동 헬스 검증 커맨드 2종 (PowerShell)

> **주의 (Windows PowerShell 규칙)**: `&&` 연산자를 사용하지 말고 세미콜론(`;`)으로 명령을 구분하십시오.

#### 검진 ①: Post-Cutover DB·운영 엔드포인트 11항목 일괄 검증
```powershell
npx tsx --env-file=.env.local scripts/verify-post-cutover-health.ts
```
- **통과 기준 (`ALL 11 CHECKS PASSED`)**:
  - **Supabase 핵심 테이블 6종**:
    - `workspace_items` (`206 0-0/269` — 마이그레이션 백필 `269`행·충돌 `0` 확인)
    - `magazine_subscribers` (`206 0-0/15`)
    - `broker_clients` (`206 0-0/28`)
    - `email_suppressions` (`200`)
    - `im_share_links` (`200`)
    - `magazine_dispatch_logs` (`200`)
  - **운영 URL 격리·상태코드 5종**:
    - `prod:home=200`
    - `prod:funding_pruned=404`
    - `prod:circles_pruned=404`
    - `prod:campaign_api_deprecated=401` (비인증 요청 기준, 인증 시 `410 GONE` `DEPRECATED_ROUTE`)
    - `prod:reverse_onboarding_uuid=400`

#### 검진 ②: 실운영 Playwright 스모크 테스트 (Build Stamp 확인)
```powershell
$env:PROD_SMOKE='1'; $env:PROD_SMOKE_BASE_URL='https://www.credeal.net'; npx playwright test e2e/prod-smoke.spec.ts --project=prod-smoke
```
- **통과 기준**:
  - `5 passed` 확인 (`[Smoke-01]`, `[Smoke-02]` `/qa-signoff?qaKey=...` `4/4 자동 통과` 포함)
  - 출력된 Build Stamp가 **`#5fac400b (production)`**과 일치하는지 확인합니다.
  - 본 스모크 테스트는 `send_inbox_alimtalk` 실발송을 호출하지 않도록 격리되어 있습니다.

### 3) 파일럿 참여자 3~5명 구성 기준
파일럿의 목적은 "시스템 오류 제로"뿐 아니라 **현업 마찰 지점 발굴**이므로 다음 구성을 권장합니다.
- **참여자 A (대표/시니어 중개사, 1~2명)**: 5대 법정 표기 입력 직관성, 큰 글씨/모바일 가독성, "원스톱 5분 내 매물 공유" 체감 난이도 검증
- **참여자 B (실무 팀장/매니저급, 2명)**: 딜카드 -> IM/스튜디오 -> 시크릿 링크 -> 소통함(Inbox) 승인·회수 -> 뉴스레터 발행까지의 다중 자산 연계 검증
- **참여자 C (대형/복합 빌딩 전속 담당, 1명)**: 1조원 이상 매물 가격대 표기(`1조대`, `1조 500억대`), 섹션 숨김(`hiddenSections`), 복수 고객 대상 스레드 vs 건물 단위 회수 검증

---

## Part 1. 5대 법정 표기 프로필 설정 상세 해설 (`/broker/profile`)

상업용 부동산 중개 실무에서는 인터넷·모바일·뉴스레터를 통해 매물을 표시·광고할 때마다 **공인중개사법 제18조의2(중개대상물의 표시·광고) 및 동법 시행령 제17조의2**에 따른 중개사무소 필수 표기사항이 누락될 경우 과태료·행정처분 리스크가 발생합니다.  
CRE DealCard는 중개사가 매번 수기로 문구를 복사·붙여넣기하다가 누락하거나, 테스트용 임시 문구(`홍길동`, `010-0000-0000` 등)가 고객에게 그대로 노출되는 법적 리스크를 원천 차단하기 위해 **`/broker/profile`을 5대 법정 표기의 단일 진실 원천(SSoT)**으로 강제합니다.

### 1) 필수 입력 5대 항목 및 UI 매핑표 (`src/lib/legal/broker-statutory-disclosure.ts`)

| 순번 | DB/도메인 필드명 | `/broker/profile` 화면 라벨 | 법적 의미 및 고객 노출 위치 | 실무 입력 팁 |
|:---:|:---|:---|:---|:---|
| 1 | `company` (`officeName`) | 중개사무소 명칭 | 개설등록증상 상호명 | "(주)OO중개법인" 등 공식 등록 명칭 전체 입력 |
| 2 | `office_address` | `중개사무소 소재지` | 개설등록증상 사무소 주소 | 도로명 주소 및 호수까지 정확히 기입 |
| 3 | `phone` | 연락처(전화번호) | 중개사무소 유선 또는 대표 휴대전화 | 숫자 7자리 이상(`02-...`, `010-...`), `@` 포함 불가 |
| 4 | `office_reg_number` | `중개사무소 개설등록번호` | 시·군·구 발급 등록번호 | 예: 관할 시군구코드-연도-일련번호 형식 정확 기재 |
| 5 | `representative_name` (미입력 시 `display_name`) | `개업공인중개사(대표자) 성명` | 개설등록증상 대표자 성명 | 소속 공인중개사가 활동하더라도 법정 표기는 대표자 성명 권장 |

> **적용 자산 범위 (`PublishAssetKind = 'dealcard' | 'im' | 'magazine'`)**:  
> - **딜카드 / IM**: 발행·외부 공유 게이트에서 즉시 검증  
> - **뉴스레터(`send_magazine`)**: 이메일 하단 푸터(`profiles.company` 포함 5대 표기 자동 삽입) 및 `1,000`자 이하 카카오톡 공유 텍스트(`kakao-text.ts`) 조립 전 서버 게이트에서 검증

---

### 2) 자동 차단되는 샘플/플레이스홀더 목록 (`BROKER_VIEWER_PLACEHOLDERS`)

중개사가 실수로 테스트 기본값을 남겨두거나 임시 기호를 적은 경우, 서버 발행 게이트는 "채워져 보이지만 법적으로 유효하지 않은 값"으로 간주하여 **발행을 거부**합니다.

- **차단되는 대표자/담당자명 샘플**:  
  `홍길동`, `김대표`, `담당 중개인`, `담당 공인중개사`, `담당 중개사`, `담당 중개법인`
- **차단되는 공용 플레이스홀더**:  
  `-`, `미등록`, `확인 필요`, `문의 시 안내`
- **차단되는 샘플 개설등록번호**:  
  `11680-2024-00123`, `11680-2024-00001`, `11680-2023-00000`, `00000-0000-00000`
- **차단되는 샘플·비유효 연락처**:  
  `02-1234-5678`, `010-0000-0000`, 숫자 7자리 미만 문자열, `@`가 포함된 이메일 형태 문자열
- **차단되는 샘플 소재지**:  
  `예시 주소`, `샘플 주소`

> **현업 안내 멘트**: *"초기 가입 시 기본으로 채워져 있거나 '-'로 비워둔 칸이 하나라도 있으면, 고객에게 나가는 IM·딜카드·뉴스레터 발송 시 법정 과태료 방지 차원에서 시스템이 자동으로 발행을 막습니다. 먼저 내 사무소 정보 5칸을 실제 등록증 기준으로 저장해 주세요."*

---

### 3) IM 발행 시 추가 검증되는 매물 5대 항목 (`collectImCoreMissing()`)

IM(`im`) 자산을 발행할 때는 중개사 프로필 5대 표기 외에도 **매물 자체의 5대 핵심 표시 항목**이 함께 검증됩니다(`src/lib/legal/publish-gate.ts`).

| 순번 | IM 도메인 필드 | 화면·법정 항목명 | 누락 시 조치 |
|:---:|:---|:---|:---|
| 1 | `im.address` | `매물 소재지(권역)` | 소재지 또는 권역 정보 입력 |
| 2 | `im.area` | `건물·대지 면적` | 연면적·대지면적 등 면적 수치 입력 |
| 3 | `im.askingPriceManwon` | `매각 예정가격(가격대)` | 매각가(만원 단위) 입력 |
| 4 | `im.usage` | `건축물 용도(용도지역)` | 주용도 또는 용도지역 명시 |
| 5 | `im.buildingScale` | `층수 또는 사용승인일` | 지상/지하 층수 또는 사용승인일 입력 |

---

### 4) `422 STATUTORY_DISCLOSURE_INCOMPLETE` 자가 검증 시나리오

중개사 파일럿 시작 1분 차에 **의도적 1회 실패 -> 수정 후 통과**를 경험하게 하면 게이트의 신뢰도를 높일 수 있습니다.

1. `/broker/profile`에서 일부러 `중개사무소 개설등록번호`를 비우거나 샘플 번호(`11680-2024-00123`)로 둔 상태에서 저장하지 않고, 혹은 샘플 연락처(`010-0000-0000`) 상태에서 뉴스레터/IM 발행을 시도합니다.
2. 서버가 **`HTTP 422`** 와 아래 표준 계약을 반환하는지 확인합니다:
   ```json
   {
     "ok": false,
     "code": "STATUTORY_DISCLOSURE_INCOMPLETE",
     "missingFields": ["..."],
     "missingLabels": ["..."],
     "message": "..."
   }
   ```
3. 화면 안내 메시지에 표기된 `missingLabels` 항목을 `/broker/profile`에서 실제 사무소 정보로 채우고 저장한 뒤, 다시 발행을 눌러 즉시 정상 통과되는 것을 확인합니다.

---

## Part 2. 실매물 1사이클 5분 완주 체험 가이드 (Step A ~ Step E)

실매물 1건을 등록하여 매수자/투자자에게 공유하고, 열람 승인·권한 회수 및 뉴스레터 발송 후 공용 PC 로그아웃까지 **총 5분(300초)** 안에 완주하는 표준 파일럿 시나리오입니다.

### 5분 전체 흐름 요약
- **Step A (`0:00 ~ 1:30`)**: 딜카드 · IM / Basic IM Studio 생성 및 Storage 영속화
- **Step B (`1:30 ~ 2:30`)**: 카카오톡 / 시크릿 브라우저 공유 링크 열람, OG 4종 마스킹 및 열람 게이트 신청(`G2`)
- **Step C (`2:30 ~ 3:45`)**: 소통함(`/broker/w/inbox`) 승인 · 스레드/매물 직교 회수 · 고객 삭제 PIPA 익명화
- **Step D (`3:45 ~ 4:45`)**: 뉴스레터(`/broker/w/newsletter`) 발행 · 5대 법정 표기 · `QUIET_HOURS` 및 카나리 발송
- **Step E (`4:45 ~ 5:00`)**: 공용 PC 스토리지 소거 및 폐기/격리 라우트(`404`/`308`/`410`) 확인

---

### Step A (`0:00 ~ 1:30`) — 딜카드 · IM · Basic IM Studio 생성

#### 사전 준비
- 브라우저 로그인 후 좌측/상단 내비게이션에서 `/broker/w/dealcards` -> `/broker/w/im` -> `/broker/basic-im-studio/[buildingId]` 동선 진입

#### 실행 체크리스트
1. **딜카드 생성 및 단일 SSoT 발행 게이트 확인 (`/broker/w/dealcards`)**
   - 실매물 1건을 등록하고 매각가·면적·용도·층수를 입력합니다.
   - *(검증 포인트)* `DealCard`는 단일 진실 원천(SSoT) 발행 게이트를 거치며, 만약 초안 상태에서 삭제를 실행할 경우 **DB Soft Delete가 선행된 뒤 메모리 캐시가 제거**됩니다. DB 쓰기 실패 시 메모리만 지우고 성공한 척하지 않고 솔직한 `500 DB_WRITE_FAILED`를 반환하는 구조입니다.
   - *(초대형 매물 테스트 — 참여자 C)* 매각가를 **1조 원 이상**(예: `1조 원`, `1조 500억 원`)으로 입력해 보면 가격대 계산(`derivePriceBand >= 1조`)이 절삭 없이 **`"1조대"`**, **`"1조 500억대"`**로 정확히 산출되는지 확인합니다.
2. **Basic IM Studio 지도 영속화 & 섹션 숨김 (`/broker/basic-im-studio/[buildingId]`)**
   - 위치 지도 생성을 실행합니다. 서버는 `fetchKakaoMapImage` -> `fetchSafeImageBuffer` SSRF 방어 로더를 거쳐 이미지를 가져온 뒤, 임시 URL에 의존하지 않고 **Supabase Storage(`building_photos`)에 직접 업로드·영속화**합니다. (스토리지 업로드 실패 시 조용한 묵인 대신 `502 STORAGE_UPLOAD_FAILED` 반환)
   - 특정 민감 섹션을 **"비공개 / 숨김(`hiddenSections`)"**으로 토글한 뒤 저장합니다.
3. **IM 워크스페이스 & PPTX 생성 확인 (`/broker/w/im`)**
   - 저장한 IM의 미리보기와 필요 시 스냅샷/PPTX 출력을 확인합니다.
   - *(확인 포인트)* `building_ssot_lite` 기반의 미완성 초안(draft) 상태에서는 외부 게이트 신청(`gate/submit`, `gate-request`) 및 스냅샷 우회 접근이 차단되며, `hiddenSections`는 클라이언트 UI에서만 가리는 것이 아니라 **서버(`im-lite`, `fetch-im-data`, `mobile-im-viewer`, `im-pro`)에서 데이터 자체를 차단·필터링**합니다.

---

### Step B (`1:30 ~ 2:30`) — 카톡/시크릿 링크 열람 · OG 4종 마스킹 · `G2` 게이트 신청

> **역할 전환**: 중개사 브라우저(로그인 상태)는 그대로 두고, **시크릿 창(Incognito)** 또는 **중개사 본인/동료 카카오톡 대화창**으로 공유 링크를 열어 "매수자/투자자 시선"을 체험합니다.

#### 실행 체크리스트
1. **카카오톡 / 링크 복사 후 OG 미리보기 확인**
   - 딜카드 또는 IM에서 공유 링크를 발급해 카카오톡 "나와의 채팅" 등에 붙여넣어 봅니다.
   - *(보안 확인)* OG 이미지/카드 라우트(`card`, `kakao`, `kakao-v2` 등 OG 계열)에는 `maskNeedles` 마스킹이 적용되어, 비공개 매물의 민감 식별 정보(지번·임대인 상세 등 마스킹 대상 토큰)가 카톡 썸네일 미리보기로 유출되지 않아야 합니다.
2. **시크릿 브라우저에서 공유 링크 1차 열람**
   - 비로그인 시크릿 창에서 공유 URL을 엽니다.
   - Step A에서 숨긴 `hiddenSections`가 시크릿 창 소스/화면 어디에도 노출되지 않는지 확인합니다.
   - *(참고)* 만약 `im_share_links` 조회 시 DB 장애가 발생하면 시스템은 임의로 열어주지 않고 Fail-Closed 원칙에 따라 **`503 GOVERNANCE_CHECK_UNAVAILABLE`**을 반환합니다.
3. **상세 열람 게이트(`G2`) 신청 (`gate/submit`, `gate-request`)**
   - 비공개 상세 정보(티저 이후 상세 자료)를 보기 위해 매수자 역할로 **열람 승인 요청(Gate Request)** 폼을 작성하여 제출합니다.
   - 유효하지 않은 UUID나 스냅샷 과다 요청(`snapshot/route.ts` UUID/Rate-limit/Draft 가드)은 차단되며, 정상 신청은 즉시 중개사의 소통함(`/broker/w/inbox`)으로 인입됩니다.

---

### Step C (`2:30 ~ 3:45`) — 소통함 승인 · 직교 권한 회수 · 고객 삭제 PIPA 처리

> **역할 전환**: 다시 **중개사 로그인 브라우저**의 `/broker/w/inbox`로 돌아옵니다.

#### 실행 체크리스트
1. **열람 신청 확인 및 승인 (`/broker/w/inbox`)**
   - Step B에서 시크릿 창으로 접수한 요청이 소통함에 도착했는지 확인합니다.
   - 승인 옵션 중 **`"IM 열람 승인 안내"`** (`TPL_INBOX_IM_APPROVED`)를 선택하여 열람을 승인합니다.
   - *(Phase 3 유의사항)* Phase 3에서는 `INBOX_ALIMTALK_LIVE`가 비활성화 상태이므로 실제 외부 휴대폰으로 솔라피 알림톡이 과금·발송되지는 않으며, 소통함 내 승인 상태 전이와 발송 가능 거버넌스 흐름까지를 검증합니다.
   - 승인 직후 **시크릿 창을 새로고침**하여 매수자 화면에서 상세 자료 열람이 해제(승인)되었는지 확인합니다.
2. **직교 권한 회수(Revoke) 2종 검증 (`scope: 'thread'` vs `scope: 'building'`)**
   - **단건 스레드 회수 (`scope: 'thread'`)**: 특정 매수자 대화(스레드)에 대해서만 링크 열람 권한을 회수합니다.
     - -> 해당 스레드의 공유 링크를 시크릿 창에서 재조회/외부 발송 시도 시 차단되며, 아웃바운드 처리 시 **`409 LINK_REVOKED_LOCKED`**가 반환됩니다.
     - -> 반면 동일 매물의 **다른 스레드/링크**에는 영향이 없어야 합니다(스레드·매물 직교 분리).
   - **매물 전체 회수 (`scope: 'building'`)**: 매물 보류·계약 완료 상황을 가정하여 해당 건물 전체 공유 링크를 일괄 회수합니다.
     - -> 해당 매물과 연결된 모든 스레드 링크가 일괄 잠금(`409 LINK_REVOKED_LOCKED`)되는지 확인합니다.
3. **고객 삭제 및 뉴스레터 수신거부 PIPA 개인정보 보호 확인**
   - 테스트용으로 등록한 매수자/구독자 레코드를 삭제 또는 구독 해지(`newsletter_subscription_toggled`) 처리합니다.
   - *(검증 포인트)* 감사 로그 및 통계(`inbox-actions-clients.ts`, `editions/route.ts`)에는 원문 이메일 대신 **SHA-256 `email_hash`**로 익명화 기록되며, 향후 `cron/retention-purge`가 `500`행 페이지네이션(`.range()`) 백필 실패 시 `magazine_purge_unsubscribed(30)` 일괄 파기를 안전하게 중단하여 감사 추적 누락을 막습니다.

---

### Step D (`3:45 ~ 4:45`) — 뉴스레터 생성 · 법정 표기 · `QUIET_HOURS` & 카나리 발송

> **경로**: `/broker/w/newsletter` (구 `/broker/campaign`, `/broker/w/magazine`, `/broker/magazine-editor` 접근 시 `308`로 자동 이동됨)

#### 실행 체크리스트
1. **에디션/이슈 작성 및 표지 이미지 보존 확인**
   - `/broker/w/newsletter`에서 새 뉴스레터 이슈를 만들고 **표지 이미지(`cover_image_url`)**를 지정한 뒤 자동/서버 초안 동기화(`useNewsletterServerDraftSync`)가 동작한 후 새로고침합니다.
   - *(검증 포인트)* 새로고침 후에도 **`cover_image_url`이 초기화·유실되지 않고 그대로 보존**되어야 합니다.
   - *(권한 격리)* 타인의 `editionId`로 `POST /api/magazine/issues` 호출 시 **`403` 또는 `404`**로 차단됩니다.
2. **이메일 & 카카오 텍스트 5대 법정 표기 검증**
   - 발송 전 미리보기에서 다음 두 채널을 확인합니다:
     - **이메일 본문/푸터**: `profiles.company` 포함 5대 법정 표기가 자동 삽입됨
     - **카카오톡 복사/공유 텍스트(`kakao-text.ts`)**: **`1,000`자 이하 제한**을 준수하면서 5대 법정 표기가 누락 없이 포함됨
   - 프로필 5대 표기가 불완전하면 `send_magazine` 게이트(`inbox-actions-leads.ts`)에서 `422 STATUTORY_DISCLOSURE_INCOMPLETE`로 발송이 차단됩니다.
3. **야간 발송 제한(`QUIET_HOURS`) & 대기열 우선순위(`pending_worker`) 이해**
   - 만약 파일럿 체험 시간이 **야간 발송 제한 시간대(`QUIET_HOURS`)**에 해당하면, 즉시 발송되지 않고 **`next_attempt_at`이 익일 `08:00 KST`**로 예약 보류됩니다.
   - 큐 워커(`distribute-queue.ts`)는 **`pending_worker` 우선 디큐(Dequeue)** 규칙으로 작업 유실 없이 순차 발송합니다.
4. **운영자 카나리 스위치 3단계 운영법 (`src/lib/magazine/send-flags.ts`)**

| 운영 단계 | `MAGAZINE_SEND_ENABLED` | `MAGAZINE_SEND_DRY_RUN` | `MAGAZINE_SEND_ALLOWLIST` | 동작 결과 |
|:---|:---:|:---:|:---|:---|
| **Stage 0 (기본 안전 잠금)** | `false` | `true` | 미사용/제한 | 일체 실발송 차단 (Fail-Closed) |
| **Stage 1 (카나리 Dry-Run)** | `true` | `true` | 파일럿 참여자 3~5명 이메일/번호 | 파이프라인·게이트·큐·로그 전 과정 실행, 외부 Resend 실전송은 생략 |
| **Stage 2 (파일럿 실발송)** | `true` | **`false`** | **파일럿 참여자 3~5명 + 운영자만 등록** | 허용된 본인 수신함으로만 실제 이메일 도착 확인 (일반 DB 오발송 0%) |

> **현장 안내**: Stage 2 실발송 테스트 시, `MAGAZINE_SEND_ALLOWLIST`에 포함되지 않은 일반 테스트 구독자는 건너뛰어지며, `Allowlist`에 등록된 중개사 본인 메일함으로만 5대 법정 표기가 담긴 뉴스레터가 정확히 수신됩니다.

---

### Step E (`4:45 ~ 5:00`) — 공용 PC 스토리지 소거 & 격리 라우트 확인

#### 실행 체크리스트
1. **공용/사무실 PC 환경 로그아웃 및 스토리지 소거 확인**
   - 중개사무소 공용 PC에서 사용 후 로그아웃하거나 계정/워크스페이스를 전환합니다.
   - 개발자 도구(`F12`) -> `Application` -> `Session Storage` / `Local Storage`를 확인하면, **`storage-namespace.ts`에 의해 `memo_transfer`, `kakao_text_*`, `cre_qa_*` 잔여 키가 말끔히 소거**되어 타인에게 이전 매물 메모나 카톡 복사용 텍스트가 남지 않음을 확인합니다.
2. **폐기/격리 라우트 동작 최종 확인 (운영자 또는 QA 동행 확인)**
   - `/funding`, `/broker/circles`, `/buildings/test-id/schedule` -> **`404`** (실험적 버티컬 격리)
   - `/broker/campaign`, `/broker/w/magazine`, `/broker/magazine-editor` -> **`308` -> `/broker/w/newsletter`**
   - `/broker/inbox` -> **`308` -> `/broker/w/inbox`**
   - `/api/broker/campaign` -> **`410 Gone` (`DEPRECATED_ROUTE`)** (비인증 요청 시 `401`)
   - `/broker/golden-admin` -> 일반 중개사 계정 접근 시 `requireAdminRsc()`에 의해 차단

---

### 시니어 현업 UX 관찰 포인트 & 5분 타임라인 기록표

파일럿 진행자는 중개사 옆에서 개입을 최소화하고, **어디서 멈칫하는지·어떤 용어를 낯설어하는지**를 아래 표에 시간대별로 기록합니다.

#### 시니어 UX 5대 관찰 포인트
1. **프로필 법정 표기 용어 인지**: *"개업공인중개사(대표자) 성명"*, *"중개사무소 개설등록번호"* 입력 시 안내 없이 30초 내 이해·입력하는가? `422` 차단 배너를 "오류"로 오인하지 않고 "법적 보호 장치"로 이해하는가?
2. **버튼 시인성 및 터치 타겟**: 13~14인치 노트북·모바일 카카오톡 웹뷰에서 **"IM 열람 승인 안내"**, **"공유 링크 복사"**, **"권한 회수(단건 vs 매물 전체)"** 버튼을 한 번에 찾는가?
3. **시크릿/카톡 전환 맥락 이해**: "내(중개사) 화면"과 "고객이 보는 공유 링크"의 차이를 혼동하지 않는가?
4. **스레드 vs 매물 회수 구분**: 특정 매수자 한 명만 차단(`thread`)하는 것과 매물 전체를 닫는(`building`) 차이를 UI에서 즉시 구분하는가?
5. **5분 완주 피로도**: 실매물 1건을 처음 잡아 완료할 때까지 불필요한 클릭이나 스크롤 이탈이 2회 이하인가?

#### 5분 타임라인 현장 기록표 (진행자용)

| 구간 | 목표 시간 | 완료 여부 (O/X) | 실제 소요(초) | 422 / 409 / 오류 발생 내역 | 멈칫함 / 질문 / 개선 메모 |
|:---|:---:|:---:|:---:|:---|:---|
| Profile (`/broker/profile`) | 사전 0:30 | | | | |
| Step A (딜카드·IM·스튜디오) | 0:00 ~ 1:30 | | | | |
| Step B (카톡/OG/시크릿/G2 신청) | 1:30 ~ 2:30 | | | | |
| Step C (소통함 승인·회수·삭제) | 2:30 ~ 3:45 | | | | |
| Step D (뉴스레터·법정표기·발송) | 3:45 ~ 4:45 | | | | |
| Step E (로그아웃·스토리지 소거) | 4:45 ~ 5:00 | | | | |

---

## Part 3. 5대 핵심 퍼널 SLO 관측 & 장애 초동 대응 플레이북

Phase 3의 핵심 무기는 장애를 고객 문의 전에 감지하는 **`src/lib/observability/funnel-slo.ts`** 입니다.

### 1) 구조화 로그 스키마 및 PII 자동 마스킹 규칙

- **로그 식별자**:
  - `event`: `'funnel_slo'`
  - `module`: `'funnel-slo'`
  - `msg`: `"[funnel-slo] <funnel>:<OK|DEGRADED|code>"`
- **PII 자동 마스킹 (`redactFunnelPii`)**:  
  운영 로그 및 웹훅 알림 페이로드가 외부로 나가기 전 이메일·전화번호·토큰은 각각 **`[EMAIL]`**, **`[PHONE]`**, **`[TOKEN]`** 으로 자동 치환되므로, 로그 검색 시 실명 이메일·전화번호로 검색하면 나오지 않으며 **매물 ID / 스레드 ID / `funnel` / `code`** 기준으로 추적해야 합니다.
- **실시간 경보 웹훅 (`notifySloAlert`)**:
  - 아래 `CRITICAL_SLO_CODES` 중 하나라도 발생하면 `ERROR_WEBHOOK_URL` 또는 `SLACK_WEBHOOK_URL`로 `2.5s` 타임아웃 내에 JSON 경보(`service: 'cre-dealcard'`, `type: 'funnel_slo_alert'`)를 전송합니다.

#### Vercel Logs 필터 검색 요령
- Vercel Dashboard -> Project -> **Logs** -> 검색창에 아래 키워드 조합 사용:
  - 전체 SLO 이벤트 조회: `[funnel-slo]` 또는 `funnel_slo`
  - 비정상/장애만 필터링: `[funnel-slo]` + `DEGRADED` 또는 각 `CRITICAL_SLO_CODES` 문자열
  - 특정 퍼널 추적: `[funnel-slo] share_view_to_gate:` 등 접두사 검색

---

### 2) 5대 퍼널(`FunnelName`) 정상 기준

| # | 퍼널 이름 (`FunnelName`) | 관측 대상 핵심 동선 | 정상 기준 |
|:---:|:---|:---|:---|
| 1 | `deal_creation` | 딜카드·IM·스튜디오 지도 생성 및 발행/Soft Delete | `OK` 비율 >= 99%, `DB_WRITE_FAILED` / `STORAGE_UPLOAD_FAILED` **0건** |
| 2 | `share_view_to_gate` | 공유 링크 조회 -> OG 마스킹 -> `gate/submit`·`gate-request` | `OK` 비율 >= 99%, `LOOKUP_FAILED` / `GOVERNANCE_CHECK_UNAVAILABLE` **0건** |
| 3 | `inbox_governance` | 소통함 열람 승인(`TPL_INBOX_IM_APPROVED`) 및 `thread`/`building` 회수 | 승인·회수 상태 불일치 **0건**, 회수 후 아웃바운드 `409 LINK_REVOKED_LOCKED` 정확 차단 |
| 4 | `newsletter_dispatch` | 이슈 생성 -> `send_magazine` 422 게이트 -> 카나리 큐(`distribute-queue`) 발송 | `QUEUE_STALLED` **0건**, 허용 외 대상 오발송 **0건**, `QUIET_HOURS` 익일 08:00 KST 이월 정상 |
| 5 | `api_availability` | 주요 워크스페이스 API 및 역온보딩·스냅샷·헬스 엔드포인트 | `verify-post-cutover-health.ts` 11/11 PASS 유지, 5xx 에러율 < 0.5% |

---

### 3) 5대 치명적 SLO 코드(`CRITICAL_SLO_CODES`) 초동 대응 Runbook

| 경보 코드 | 의미 및 추정 원인 | 5분 내 초동 점검 명령 / 경로 | 즉시 완화 및 복구 조치 |
|:---|:---|:---|:---|
| **`LOOKUP_FAILED`** | 공유 링크(`im_share_links`) 등 거버넌스 대상 DB 조회 실패 (Fail-Closed로 열람 차단됨) | 1. Supabase 상태 및 RLS 정책 확인<br>2. `npx tsx --env-file=.env.local scripts/verify-post-cutover-health.ts` 실행 | 일시적 커넥션 오류 시 재시도 안내; DB 장애 지속 시 Supabase 프로젝트 연결풀/서비스 키 상태 확인 후 파일럿 일시 정지 |
| **`DB_WRITE_FAILED`** | 딜카드·IM 삭제(DB-first soft delete) 또는 상태 저장 쓰기 실패 | 1. Vercel Logs에서 `[funnel-slo]` 직전 스택트레이스 확인<br>2. Supabase 테이블 쓰기 권한·디스크·제약조건 확인 | 시스템이 메모리 캐시를 먼저 지우지 않고 `500`으로 방어했으므로 데이터 유실은 없음. 원인 DB 제약 수정 후 사용자 재시도 |
| **`QUEUE_STALLED`** | 뉴스레터 분산 발송 큐(`distribute-queue.ts`)가 `pending_worker` 상태에서 정체되거나 크론이 밀림 | 1. `magazine_dispatch_logs` 최근 행 상태 점검<br>2. Vercel Cron 실행 로그 및 `CRON_SECRET` 일치 여부 확인 | 오발송/중복 발송 방지를 위해 **우선 `MAGAZINE_SEND_ENABLED=false`로 잠근 뒤** 정체 원인(Resend 한도, `CRON_SECRET` 불일치, `QUIET_HOURS` 오판) 해결 후 재개 |
| **`GOVERNANCE_CHECK_UNAVAILABLE`** | `im_share_links` 조회 불가 등으로 권한 검증 API가 `503` Fail-Closed 응답을 반환 중 | 1. `SHARE_LINK_SECRET` 및 Supabase 서비스 롤/클라이언트 연결 확인<br>2. `verify-post-cutover-health.ts` 중 `im_share_links` 응답 확인 | 의도된 보안 방어(무단 공개 방지)이므로 절대 Fail-Open으로 우회 금지. DB/환경변수 복구 즉시 `503` 자동 해소 |
| **`STORAGE_UPLOAD_FAILED`** | Basic IM Studio 위치 지도 이미지의 Supabase Storage(`building_photos`) 업로드 실패 (`502`) | 1. Supabase Storage `building_photos` 버킷 용량·권한(Policy) 확인<br>2. 외부 지도 API(`fetchKakaoMapImage` / `fetchSafeImageBuffer`) 응답 타임아웃·허용 호스트 확인 | Storage 버킷 쿼터/RLS 점검 및 외부 이미지 fetch 차단 여부 확인. 복구 전 임시 URL 폴백 허용 금지 |

---

### 4) 일일 점검 루틴 & QA 릴레이 포털 운영 (`/qa-signoff`, `/qa-broker`)

#### 파일럿 기간 일일 점검 루틴 (매일 오전 09:00 KST / 오후 18:00 KST, 소요 5분)
1. **웹훅/슬랙 채널 점검**: 간밤 `funnel_slo_alert` 수신 여부 및 `QUIET_HOURS` 보류 후 08:00 KST 정상 처리 여부 확인
2. **원격 헬스스크립트 실행**:
   ```powershell
   npx tsx --env-file=.env.local scripts/verify-post-cutover-health.ts
   ```
   -> 11개 항목 모두 PASS인지 확인
3. **Vercel Logs 점검**: `[funnel-slo]` 기준 `DEGRADED` 또는 `5xx` 빈도 확인
4. **QA 릴레이 포털 활용**:
   - 일반 사용자에게는 `404`로 은폐되어 있으나, 운영자·내부 QA는 키를 부착해 검증할 수 있습니다:
     - `/qa-signoff?qaKey=<QA_ACCESS_KEY>`
     - `/qa-broker?qaKey=<QA_BROKER_ACCESS_KEY>` (또는 `QA_ACCESS_KEY` / `QA_TESTER_ACCESS_KEY` 환경에 맞는 패스코드)
     - 기타 QA/테스트 전용 게이트 경로: `/qa-tester`, `/qa-showcase`, `/testguide`, `/newsletter-inbox-test`, `/dealcard-im-test`
   - **보안 주의**: 중개사에게 QA URL과 `qaKey` 쿼리를 절대 공유하지 말고, 파일럿은 항상 정규 운영 경로(`/broker/profile`, `/broker/w/*`)로만 진행합니다. 테스트 종료 후 공용 PC 브라우저 히스토리에서도 `?qaKey=` 흔적을 남기지 마십시오.

---

## Part 4. Phase 3 종료 판정(Go / No-Go), 14일 무장애 폴백 청산 & Phase 4 진입 기준

### 1) Phase 3 종료 정량·정성 Go / No-Go 판정표

| 판정 영역 | Go (통과) 필수 기준 | No-Go (보류/재수정) 기준 |
|:---|:---|:---|
| **운영 안정성 (14일 윈도우)** | 연속 **14일간** `CRITICAL_SLO_CODES` 5종 **미해결 장애 0건** 및 데이터 유실·오발송 **0건** | 1건이라도 원인 불명 재발 장애, 일반 구독자 오발송, 또는 권한 회수 미적용 열람 발생 |
| **릴리즈·헬스 게이트** | `verify-post-cutover-health.ts` **11/11 PASS**, `prod-smoke.spec.ts` **5/5 PASS** 상시 유지 | 1개 테이블·엔드포인트라도 스키마 드리프트 또는 격리(`404`/`308`/`410`) 훼손 |
| **법정 표기 게이트** | 5대 법정 표기 미완성·샘플값 상태에서 `422 STATUTORY_DISCLOSURE_INCOMPLETE` **100% 차단** 검증 | 샘플값(`홍길동`, `11680-2024-00123` 등)이 고객 뷰·이메일·카톡 텍스트에 1회라도 통과 |
| **현업 5분 완주율** | 참여 중개사 3~5명 전원 **Step A ~ Step E 1사이클 5분 내(또는 가이드 보조 없이) 완주**, 치명적 UX 블로커 0건 | 필수 버튼 미인지·화면 멈춤·워크플로우 단절로 중개사가 단독 완주 불가 |
| **보안·PIPA 위생** | 공용 PC 로그아웃 시 `storage-namespace.ts` 키 소거 확인 및 삭제 고객 `email_hash` 익명화 유지 | 이전 세션의 `memo_transfer`, `kakao_text_*`, `cre_qa_*` 잔존 또는 원문 이메일 로그 노출 |

---

### 2) 14일 무장애 입증 후 레거시 폴백 코드 청산 목록

Phase 3에서 연속 14일 무장애가 확인되고 Supabase 컷오버 테이블(`workspace_items`, `email_suppressions`, `im_share_links`, `magazine_dispatch_logs`)이 100% 안정화된 것이 입증되면, **Phase 4 작업 착수 직전 Cleanup PR**에서 아래 Pre-Cutover 폴백 부채를 안전하게 제거합니다.

| # | 제거 대상 심볼 / 패턴 | 위치 / 범위 | 제거 전 사전 확인 사항 |
|:---:|:---|:---|:---|
| 1 | `SUBSCRIBER_COLUMNS_PRECUTOVER` | `src/domain/magazine/send-batch.ts` | 원격 DB `magazine_subscribers` 신규 컬럼 정착 및 14일간 구컬럼 폴백 미발동 확인 |
| 2 | `isPreCutoverSchemaError` | `src/lib/im-lite/im-public-guard.ts` | IM 공개 가드 쿼리가 14일간 스키마 오류 없이 동작 확인 |
| 3 | `isMissingRelationOrColumnError` 폴백 분기 | 컷오버 이전 관계/컬럼 부재 우회 핸들러 전반 | 마이그레이션 누락 0건(`pglite-migrations-dryrun` + `verify-post-cutover-health.ts` PASS) 확인 |
| 4 | 레거시 Dual-Write 분기 | `workspace_items`(`269`행), `email_suppressions`, `im_share_links`, `magazine_dispatch_logs` 관련 구 저장소 이중 쓰기 | 14일간 신규 테이블 단일 읽기/쓰기 정합성 검증 완료 후 제거 |

> **경고**: Cleanup PR 반영 직후 반드시 `npx tsc --noEmit`, `npx tsx scripts/check-schema-drift.ts --strict-magazine`, `npm run preflight`, `npm run build` 및 `verify-post-cutover-health.ts`를 재실행하여 회귀가 없음을 확인합니다.

---

### 3) Phase 4 (PG 결제 · 솔라피 실시간 알림톡) 진입 승인 조건

다음 5가지가 모두 체크되어야 Phase 4 착수를 승인합니다:
- [ ] Phase 3 Go / No-Go 판정표 전 항목 **Go** 획득
- [ ] `MAGAZINE_SEND_ENABLED=true`, `MAGAZINE_SEND_DRY_RUN=false` 카나리 실발송 3~5명 대상 이상 없음 확인
- [ ] 14일 무장애 확인 및 Pre-Cutover 폴백 코드 Cleanup PR 머지·배포 완료
- [ ] (Phase 4 준비) 사업자 결제 연동(PG) 심사 및 플랜/과금 정책 확정
- [ ] (Phase 4 준비) 솔라피(Solapi) 알림톡 템플릿(`TPL_INBOX_IM_APPROVED` 포함) 카카오 심사 승인 및 `INBOX_ALIMTALK_LIVE=1` 전환 별도 승인

---

## 부록. 현업 중개사 5분 파일럿 현장 피드백 기록지

> 파일럿 종료 직후 현장에서 작성하여 취합합니다.

```markdown
### CRE DealCard 파일럿 현장 피드백 기록지
- **일시 / 빌드시각**: 2026-__-__ __:__ (Build Stamp: `#5fac400b`)
- **참여 중개사 유형**: [ ] 대표/시니어  [ ] 팀장/실무  [ ] 대형빌딩 전속
- **진행 환경**: [ ] 사무실 데스크톱  [ ] 노트북  [ ] 모바일/카카오톡 인앱

#### 1. 정량 소요 시간 및 완주 결과
- 프로필 5대 법정 표기 입력 시간: ____초 (자동 차단 `422` 경험 여부: 예 / 아니오)
- Step A ~ Step E 1사이클 총 소요 시간: ____분 ____초
- 단독 완주 여부: [ ] 100% 단독 완주  [ ] 구두 안내 1~2회 필요  [ ] 중단

#### 2. 단계별 체감 난이도 (1점 매우 어려움 ~ 5점 매우 쉬움)
- `/broker/profile` 5대 법정 표기 설정: [ 1 / 2 / 3 / 4 / 5 ]
- Step A (딜카드 · IM · 스튜디오 지도): [ 1 / 2 / 3 / 4 / 5 ]
- Step B (카톡 공유 · OG 미리보기 · 열람 요청): [ 1 / 2 / 3 / 4 / 5 ]
- Step C (소통함 승인 · 단건/전체 회수): [ 1 / 2 / 3 / 4 / 5 ]
- Step D (뉴스레터 표지 · 법정표기 · 발송): [ 1 / 2 / 3 / 4 / 5 ]

#### 3. 시니어 현장 관찰 & 정성 피드백
1) 가장 편리하거나 현업에서 바로 쓰고 싶었던 기능:
   - 

2) 용어가 낯설거나 버튼을 찾기 어려워 멈칫했던 지점 (화면명/버튼명 기재):
   - 

3) 고객(매수자/투자자)에게 공유했을 때 부족하거나 걱정되었던 점:
   - 

4) 운영자 관찰 메모 (네트워크 지연, `422`/`409`/`5xx` 로그, 기타 요청사항):
   - 
```
