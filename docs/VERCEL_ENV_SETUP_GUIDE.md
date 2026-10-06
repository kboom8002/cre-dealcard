# Vercel 환경변수 설정 가이드 (모바일 매거진)

> 작성: 2026-10-06 · 대상 프로젝트: `kboom8002-5489s-projects/cre-dealcard` · 운영 기준 URL: `https://credeal.net` (`www.credeal.net` 도 같은 사이트)
> 이 문서에는 **비밀값 자체를 적지 않습니다.** 값이 필요한 곳은 "어디서 발급받는지"만 안내합니다.

---

## 0. 한눈에 보기

| 구분 | 변수 | 상태 |
|:--|:--|:--|
| ✅ 자동 생성·등록 완료 (Production) | `UNSUBSCRIBE_SECRET`, `MAGAZINE_SID_SECRET` | 무작위 64자 값을 새로 만들어 등록 (값은 어디에도 저장·출력하지 않음) |
| ✅ 자동 등록 완료 (Production) | `NEXT_PUBLIC_APP_BASE_URL=https://credeal.net` | 서버용 `APP_BASE_URL` 과 같은 값 |
| ✅ 자동 등록 완료 (Production) | `MAGAZINE_SEND_ENABLED=false`, `MAGAZINE_SEND_DRY_RUN=true`, `MAGAZINE_CRON_GENERATE_ENABLED=false`, `MAGAZINE_AUTO_SEND_ALLOWED=false`, `MAGAZINE_ALLOW_LLM_MOCK=false`, `MAGAZINE_TRACKING_ENABLED=true` | 모두 "안전한 기본값"(발송 꺼짐·드라이런) |
| 🔎 이미 있지만 값 확인 필요 | `APP_BASE_URL`, `CRON_SECRET`, `NEXT_PUBLIC_KAKAO_APP_KEY`, `OPENAI_API_KEY`, `AI_DEFAULT_MODEL` | §2 참고 |
| ✍️ 직접 찾아서 입력 | `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER_PHONE`, `SOLAPI_PFID` | §3 참고 (발송을 켜기 전까지는 **필수 아님**) |
| ⏸️ 지금은 비워 두기 | `MAGAZINE_SEND_ALLOWLIST`, `MAGAZINE_DAILY_CAP`, `MAGAZINE_OG_FONT_PATH` | §4 참고 |

> [!IMPORTANT]
> 환경변수를 추가·수정한 뒤에는 **재배포**해야 반영됩니다(Vercel 은 배포 시점에 값을 주입합니다). §5 를 보세요.

> [!NOTE]
> 자동 등록은 **Production 환경에만** 했습니다. Preview/Development 에서 매거진을 시험하려면 §6 의 방법으로 같은 이름을 해당 환경에도 추가하세요(값은 새로 생성하는 것을 권장).

---

## 1. 자동으로 해 둔 것 (확인용)

```powershell
npx vercel env ls production
```

목록에 아래 이름이 보이면 정상입니다(값은 화면에 나오지 않습니다).

`UNSUBSCRIBE_SECRET` · `MAGAZINE_SID_SECRET` · `NEXT_PUBLIC_APP_BASE_URL` · `MAGAZINE_SEND_ENABLED` · `MAGAZINE_SEND_DRY_RUN` · `MAGAZINE_CRON_GENERATE_ENABLED` · `MAGAZINE_AUTO_SEND_ALLOWED` · `MAGAZINE_ALLOW_LLM_MOCK` · `MAGAZINE_TRACKING_ENABLED`

### 각 변수의 역할

| 변수 | 쓰임 | 값을 바꾸면? |
|:--|:--|:--|
| `UNSUBSCRIBE_SECRET` | 수신거부 링크 토큰 서명(HMAC). 없으면 해지 링크 발급이 **차단**됩니다 | **이미 보낸 메일·알림톡의 해지 링크가 전부 무효**가 됩니다 → 정말 필요할 때만 교체 |
| `MAGAZINE_SID_SECRET` | 구독자별 링크(`?sid=`) 서명, 열람 분석·핫리드 알림. 없으면 분석 수집 API 가 503 | 이미 배포된 개별 링크의 `sid` 가 무효가 됩니다 |
| `NEXT_PUBLIC_APP_BASE_URL` | 브라우저에서 만드는 공유·QR·OG 절대 URL | 서버용 `APP_BASE_URL` 과 **같은 값**이어야 합니다 |
| `MAGAZINE_SEND_ENABLED` | **발송 킬스위치**. `false` 면 어떤 이메일·알림톡도 나가지 않음 | `true` 는 §7 단계에서만 |
| `MAGAZINE_SEND_DRY_RUN` | `true` 면 판정·원장 기록만 하고 실제 발송 안 함 | 실발송 직전에 `false` |
| `MAGAZINE_CRON_GENERATE_ENABLED` | 주간 자동 초안 생성 크론 on/off (생성만, 발송 아님) | LLM 크레딧 충전 후 `true` |
| `MAGAZINE_AUTO_SEND_ALLOWED` | 자동 발송 허용(브로커 명시 동의 기능 승인 후에만) | 계속 `false` 권장 |
| `MAGAZINE_ALLOW_LLM_MOCK` | LLM 실패 시 가짜(Mock) 본문 허용 여부 | **운영은 항상 `false`** |
| `MAGAZINE_TRACKING_ENABLED` | 독자 열람 추적 수집 on/off | 추적 고지 문구와 함께 운영 |

---

## 2. 이미 있지만 **값을 직접 확인해야** 하는 변수

Vercel CLI 로는 "여러 환경에 공유된" 변수 값을 읽을 수 없어서 제가 값을 검증하지 못했습니다. 대시보드에서 눈으로 확인해 주세요.

**확인 방법 (공통)**: Vercel 대시보드 → `cre-dealcard` 프로젝트 → **Settings → Environment Variables** → 변수 오른쪽 **눈(👁) 아이콘** → 값 확인. 잘못됐으면 `⋯ → Edit` 로 수정 후 **재배포**.

| 변수 | 올바른 값 | 어디서 확인/발급 | 비고 |
|:--|:--|:--|:--|
| `APP_BASE_URL` | `https://credeal.net` (끝에 `/` 없이) | 대시보드(위 방법) | **비어 있거나 `localhost` 이면 안 됩니다.** 비면 발송 배치가 `APP_BASE_URL is empty` 로 중단됩니다. `NEXT_PUBLIC_APP_BASE_URL` 과 **같은 값**이어야 합니다. (`credeal.net` 은 `www.credeal.net` 으로 307 리다이렉트됩니다) |
| `CRON_SECRET` | 추측 불가능한 임의 문자열(32자 이상 권장) | 대시보드 | Vercel 크론은 이 값이 있으면 자동으로 `Authorization: Bearer <값>` 을 붙여 호출합니다. 없거나 짧으면 `/api/cron/*`, `/api/pulse/generate` 가 401. 새로 만들려면 PowerShell: `[Convert]::ToBase64String((1..48 \| % { Get-Random -Maximum 256 }) -as [byte[]])` |
| `NEXT_PUBLIC_KAKAO_APP_KEY` | 카카오 **JavaScript 키** | [developers.kakao.com](https://developers.kakao.com) → 내 애플리케이션 → 앱 키 → **JavaScript 키** | 같은 앱의 **플랫폼 → Web** 에 `https://www.credeal.net`, `https://credeal.net` 이 등록돼 있어야 카카오 공유가 동작합니다. REST 키(`KAKAO_REST_API_KEY`)와 헷갈리지 마세요 |
| `OPENAI_API_KEY` | `sk-…` | [platform.openai.com](https://platform.openai.com) → API keys | **현재 크레딧이 소진(`credit_balance_exhausted`)되어 모든 LLM 기능이 실패합니다.** Billing 에서 충전하세요. 키 자체는 그대로 둬도 됩니다 |
| `AI_DEFAULT_MODEL` | 사용 중인 모델명 | 코드의 `model-selector` 가 읽음 | 비워 두면 코드 기본값을 씁니다. 모를 때는 건드리지 마세요 |

---

## 3. 직접 찾아서 입력해야 하는 변수

> 발송(이메일·알림톡)을 켜기 **전까지는 입력하지 않아도 매거진 열람·편집·구독 화면은 동작**합니다.
> 값이 없으면 발송은 `NO_PROVIDER` 로 **정직하게 차단**됩니다(가짜 성공 없음).

### 3-1. 개인정보 문의 이메일 — `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL`

- **무엇**: `/privacy` 페이지와 수신거부 안내에 표시되는 개인정보 문의 접수 이메일.
- **정하는 법**: 실제로 메일을 받아 볼 수 있는 업무용 주소(예: `privacy@회사도메인`). 법무 검토(`docs/magazine/audit-2026-10-04/legal-review-needed.md`) 때 함께 확정하세요.
- **필수 시점**: 서비스 공개 전(개인정보처리방침에 연락처가 필요합니다).

### 3-2. 이메일 발송 — `RESEND_API_KEY`, `EMAIL_FROM`

1. [resend.com](https://resend.com) 가입 → **Domains → Add Domain** 에 `credeal.net`(또는 발송용 서브도메인, 예 `mail.credeal.net`) 추가.
2. 화면에 나오는 **SPF / DKIM / (권장) DMARC** DNS 레코드를 등록.
   - `credeal.net` 의 네임서버는 Vercel 이므로 **Vercel 대시보드 → Domains → credeal.net → DNS Records** 에서 추가하면 됩니다.
3. Resend 에서 Domain 이 **Verified** 가 되면 **API Keys → Create API Key**(권한: *Sending access*) → `re_…` 값을 복사.
4. Vercel 에 입력:
   - `RESEND_API_KEY` = `re_…`
   - `EMAIL_FROM` = `크리딜 <magazine@도메인>` 형식. **반드시 3번에서 인증한 도메인의 주소**여야 합니다(다르면 발송 거부·스팸 처리).
5. 광고성 메일 요건(제목 `(광고)`, 전송자 명칭·연락처, 수신거부 링크)은 코드가 템플릿에 넣어 줍니다. 대신 `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` 이 실제로 응답 가능한 주소인지 확인하세요.

### 3-3. 카카오 알림톡 — `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER_PHONE`, `SOLAPI_PFID`

**4개가 모두 있어야** 알림톡이 나갑니다(하나라도 없으면 `NO_PROVIDER`).

1. [console.solapi.com](https://console.solapi.com) 가입·본인/사업자 인증.
2. **API Key 관리** → *API Key 생성* → `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`(생성 시 한 번만 표시되니 바로 복사).
3. **발신번호 관리**에서 발신번호 등록·인증 → `SOLAPI_SENDER_PHONE` (숫자만, 하이픈 없이, 예 `0212345678`).
4. **카카오 채널 연동**: 카카오톡 채널(비즈니스 채널)을 솔라피에 연동 → 채널 목록의 **pfId(`KA01PF…`)** 가 `SOLAPI_PFID`.
5. **알림톡 템플릿 등록·심사**(영업일 기준 수일 소요):
   - `TPL_MAGAZINE_WEEKLY_ISSUE`(주간호), `TPL_MAGAZINE_FLASH_ISSUE`(속보) 두 개.
   - 문안 초안: `src/domain/magazine/templates/flash-issue.kakao.md` (`(광고)` 표기·수신거부 안내 포함).
   - 심사 승인 **전에는 `MAGAZINE_SEND_ENABLED` 를 켜지 마세요.**
6. 이 4개 값은 템플릿 승인 후 Vercel 에 입력하는 것을 권장합니다.

---

## 4. 지금은 비워 두는 변수

| 변수 | 의미 | 언제 채우나 |
|:--|:--|:--|
| `MAGAZINE_SEND_ALLOWLIST` | 쉼표로 구분한 **허용 수신자(전화/이메일)**. 비면 "제한 없음" | **카나리 발송 단계**에 본인 번호·이메일만 넣어 테스트(§7). 비어 있으면 활성화 시 전원 발송 가능하므로 켜기 전 반드시 먼저 채우세요 |
| `MAGAZINE_DAILY_CAP` | 브로커별 일일 발송 상한 | 비우면 코드 기본값(주간=구독자 수) 사용. 필요할 때만 |
| `MAGAZINE_OG_FONT_PATH` | OG 이미지 한글 폰트 경로 오버라이드 | 비워 두면 번들된 Noto Sans KR 을 씁니다 |

---

## 5. 입력 방법과 재배포

### 방법 A — 대시보드 (권장, 비밀값에 안전)

1. Vercel 대시보드 → `cre-dealcard` → **Settings → Environment Variables → Add New**
2. Key / Value 입력, **Environments** 는 `Production` 체크, 비밀값이면 **Sensitive** 켜기(저장 후 값 조회 불가).
3. **Save** → 아래처럼 재배포.

### 방법 B — CLI

```powershell
# 대화형: 값은 실행 중 프롬프트에 붙여넣기
npx vercel env add RESEND_API_KEY production

# 비대화형
npx vercel env add NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL production --value "privacy@example.com" --yes
```

> [!WARNING]
> 이 환경의 `vercel` CLI 는 `env add` 가 **등록은 되지만 프로세스가 종료되지 않고 멈추는 현상**이 있었습니다.
> 30초쯤 뒤 `Ctrl+C` 로 끊고 `npx vercel env ls production` 으로 등록 여부를 확인하세요.
> 값 수정은 `npx vercel env rm <이름> production --yes` 후 다시 `add` 합니다.

### 재배포

- 코드를 push 하면 자동 배포됩니다(`git push origin main` — 배포 전 `npm run build` 로컬 검증 필수).
- 코드 변경 없이 환경변수만 반영하려면: 대시보드 → **Deployments → 최신 배포 `⋯` → Redeploy**.

---

## 6. Preview / 로컬 개발용

- **로컬(.env.local)** 에는 운영과 **다른 값**을 쓰세요. 새 비밀값 생성(PowerShell):

  ```powershell
  [Convert]::ToBase64String((1..48 | % { Get-Random -Maximum 256 }) -as [byte[]]).TrimEnd('=').Replace('+','-').Replace('/','_')
  ```

  `.env.local` 최소 예시(비밀값은 위 명령으로 각각 생성):

  ```dotenv
  APP_BASE_URL=http://localhost:3000
  NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
  UNSUBSCRIBE_SECRET=<새로 생성>
  MAGAZINE_SID_SECRET=<새로 생성, 위와 다른 값>
  CRON_SECRET=<새로 생성>
  MAGAZINE_SEND_ENABLED=false
  MAGAZINE_SEND_DRY_RUN=true
  ```
- **E2E 테스트**는 비밀값을 `.env.local` 이 아니라 **프로세스 환경변수**로만 줍니다(`e2e/magazine-golden-expected-fail.md` 참고).
- **Preview 배포**에서 시험하려면 §5 의 방법으로 같은 이름을 `Preview` 환경에도 추가하세요.

---

## 7. 발송 활성화 순서 (요약)

> 상세 절차·점검 SQL: `docs/magazine/audit-2026-10-04/send-activation-checklist.md`

1. **DB 마이그레이션 적용**(`supabase/MIGRATIONS.md`) — 특히 `20261004000001` RLS 잠금을 가장 먼저.
2. §2 의 값 확인 완료(`APP_BASE_URL`, `CRON_SECRET`).
3. §3 의 Resend/Solapi 값 입력 + 알림톡 템플릿 심사 승인.
4. **드라이런**: `MAGAZINE_SEND_ENABLED=true`, `MAGAZINE_SEND_DRY_RUN=true` → 판정·원장만 기록되는지 확인.
5. **카나리**: `MAGAZINE_SEND_ALLOWLIST` 에 본인 번호/이메일만 넣고 `MAGAZINE_SEND_DRY_RUN=false` → 본인에게만 도착하는지 확인.
6. 브로커 1명 → 전체 순으로 확대(`MAGAZINE_SEND_ALLOWLIST` 비우기는 마지막에).
7. 문제 시 즉시 `MAGAZINE_SEND_ENABLED=false` 로 되돌리고 재배포(롤백).

---

## 8. 증상별 점검

| 증상 | 원인 | 조치 |
|:--|:--|:--|
| 구독/투표가 503 `SERVICE_UNAVAILABLE`·`NOT_MIGRATED` | DB 마이그레이션 미적용 | `supabase/MIGRATIONS.md` 순서대로 적용 |
| `/api/cron/*` 401 | `CRON_SECRET` 없음/불일치 | §2 `CRON_SECRET` 설정 후 재배포 |
| 발송 결과가 전부 `blocked: SEND_DISABLED` | 킬스위치 꺼짐(정상) | §7 순서대로 활성화 |
| `blocked: NO_PROVIDER` | Resend/Solapi 키 미입력 | §3 |
| `blocked: NOT_ALLOWLISTED` | 카나리 허용목록에 없는 수신자 | `MAGAZINE_SEND_ALLOWLIST` 확인 |
| `APP_BASE_URL is empty` | `APP_BASE_URL` 비어 있음 | §2 |
| 분석 수집 API 503 | `MAGAZINE_SID_SECRET` 없음 | §1 (등록 완료 후 재배포) |
| 카카오 공유가 안 됨 | JS 키 오류/도메인 미등록 | §2 `NEXT_PUBLIC_KAKAO_APP_KEY` |
| AI 초안 생성 실패 | OpenAI 크레딧 소진 | §2 `OPENAI_API_KEY` Billing 충전 |
| OG 이미지 한글이 깨짐 | 폰트 번들 누락 | 배포 후 `/api/og/magazine` 확인, 필요 시 `MAGAZINE_OG_FONT_PATH` |
