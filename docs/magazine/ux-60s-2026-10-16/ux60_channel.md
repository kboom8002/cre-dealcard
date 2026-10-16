# 60대 관점 채널·콘텐츠·언어 감사 (C1~C7) — 2026-10-16

- 감사관: 채널·콘텐츠·언어 담당 서브에이전트. 범위는 화면 밖 접점(카톡 알림·카톡 미리보기·이메일·구독 확인·수신거부·오류 페이지)과 매거진 관련 문구 전체.
- 방법: 정적 분석, tsx로 템플릿 렌더(가상 입력, **실제 발송 없음**), Playwright 라이브러리로 로컬 HTML과 운영 사이트 캡처. 운영 사이트는 **GET 요청만** 보냈고 분석 비콘(analytics/track/insights)과 GET 이외 요청은 모두 막았습니다. dev 서버는 띄우지 않았습니다. 운영 DB는 읽기만 했고 개인정보 없이 집계만 냈습니다.
- 산출 폴더: `scratch\ux60\channel\` (아래 경로는 모두 이 폴더 기준)
- 페르소나: 독자 R(64세 건물주, 카톡 인앱 브라우저, 글꼴 크게) / 중개인 B(62세 대표)

---

## 1. 요약

| 등급 | 건수 | ID |
|:--|:--:|:--|
| **F0 차단** | 4 | C-01, C-02, C-03, C-04 |
| **F1 중대** | 5 | C-05, C-06, C-07, C-08, C-10 |
| F2 보통 | 10 | C-09, C-11, C-12, C-13, C-14, C-15, C-16, C-19, C-21, C-24 |
| F3 경미 | 5 | C-17, C-18, C-20, C-22, C-23 |
| **합계** | **24** | |

### 가장 시급한 5건 (Top 5)
1. **C-01 [F0] 운영 사이트의 매거진 호 페이지가 전부 500 오류입니다.** `/magazine/{slug}/{date}` 주소는 발행본이 있어도 없어도 모두 영어 오류 화면("This page couldn't load / Reload")이 뜹니다. 카톡 알림·이메일·공유 링크의 최종 목적지가 막힌 상태입니다. 크롤러 UA로 요청해도 500이라 카톡 링크 미리보기(제목·사진)도 나오지 않습니다.
2. **C-02 [F0] 전화번호만 넣은 구독자는 영원히 '확인 대기(pending)'에 머뭅니다.** 구독 폼은 휴대폰 필수·이메일 선택이고 인라인 카드도 기본값이 '카카오톡'인데, 확인 링크는 이메일로만 보낼 수 있습니다. 운영 DB 실측 결과 구독자 **6명 중 6명이 pending이고 6명 모두 이메일이 없습니다.** 확인 메시지를 다시 보내는 기능도 없습니다.
3. **C-03 [F0] `/privacy`·`/terms` 본문이 사실상 보이지 않습니다.** 검은 배경 위 진한 남색 글씨로, 대비가 **1.36:1**입니다(privacy 32개 요소, terms 20개 요소). 하단에는 매거진과 무관한 '홈·아고라·더보기' 바가 본문을 가립니다. 동의 판단의 근거 문서를 읽을 수 없는 상태입니다.
4. **C-04 [F0] 발송 스위치가 꺼져 있으면 이메일을 넣은 사람도 확인 메일을 받지 못합니다.** 확인 토큰은 7일 뒤 만료되므로, 나중에 발송을 켜도 기존 신청자는 아무것도 받지 못합니다. 화면에는 "본인 확인이 끝나면 받아보실 수 있습니다"라고만 나옵니다. 사용자가 "신청했는데 안 온다"를 겪는 구조입니다.
5. **C-05/C-07 [F1] 첫 메시지가 스미싱처럼 보입니다.** 알림톡 본문에 무작위 토큰이 붙은 **173자·176자 링크 2개**가 그대로 노출됩니다. 이메일 발신자 이름 기본값은 영어 `CRE Magazine`이고, 구독 확인 메일에는 중개사 연락처가 빠져 있습니다.

### 이전 감사(audit2_ux) 항목 재확인
| 항목 | 상태 |
|:--|:--|
| U2-20 해지 페이지(lang·title·viewport·버튼 대비) | **해결됨** — 다만 버튼 높이 44px, 되돌리기 없음은 여전합니다(C-11) |
| U2-21 이메일(프리헤더·링크 목적 분리·전화 CTA·단색 배경) | **해결됨** — 다크 강제 반전도 깨지지 않습니다 |
| U2-17/U2-31 용어 풀이 없음(Cap Rate·NPL·IM) | **일부 남아 있음** — 뷰어에는 풀이가 있으나 이메일·카톡 본문은 입력 그대로입니다(C-14) |
| U2-19 CTA 6종 경쟁 | **여전히 존재**(C-19) |
| S4 공개 레이아웃 혼입(ThemeToggle·BottomNav) | **여전히 존재** — /privacy에 '아고라' 하단 바가 보입니다(C-03) |

---

## 2. 접점별 점검표

판정 기호: ✅ 통과 · ⚠️ 주의 · ❌ 미달

### 2-1. 카톡 알림톡 (C1)
렌더 결과: `kakao-real.txt` (실제 형태의 sid·해지 토큰 사용, e2e 전용 시크릿, 발송 없음), `kakao.txt`

| 점검 | 판정 | 근거 |
|:--|:--:|:--|
| 광고 표기 `(광고)` 맨 앞 | ✅ | [kakao-text.ts:36](file:///c:/Users/User/cre-dealcard/src/domain/magazine/templates/kakao-text.ts#L36) |
| 발신자 식별 | ⚠️ | 첫 줄이 `(광고) 강남빌딩중개법인 김영수`로 법인명이 앞섭니다. 60대가 아는 이름은 '김영수 대표'입니다. 카톡 채널명(credeal?)과 중개사명이 다르면 의심이 커집니다 |
| 링크 신뢰 | ❌ | 매거진 링크 173자(`?sid=c2lkMS4z…`), 해지 링크 176자(`?t=djIu…`). 무작위 문자열 2개가 본문 절반을 차지합니다(C-05) |
| 글 길이 | ⚠️ | 623자, 12줄. 요약문 160자 안에 `Cap Rate` 같은 약어가 그대로 들어갑니다 |
| 버튼 문구 | ❌ | 알림톡 웹링크 버튼을 쓰지 않고 `▶ 매거진 보기: URL`처럼 텍스트로 넣습니다 |
| 심사 문안과 일치 | ❌ | 코드는 "이번 주 매거진이 도착했습니다", 심사 초안(md)은 "이번 주 시장 브리핑이 발행되었습니다"로 서로 다릅니다. 알림톡은 승인 문안과 다르면 발송이 실패합니다. 광고가 들어간 알림톡이라는 정책 이슈도 미해결입니다(C-06) |

### 2-2. 카톡 링크 미리보기(OG) (C1)
OG 이미지 주소 형식(코드 확인): `/api/og/magazine?brokerId={slug}&date=YYYY-MM-DD` ([share-urls.ts:54-63](file:///c:/Users/User/cre-dealcard/src/lib/magazine/share-urls.ts#L54-L63), [page.tsx:114](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/[date]/page.tsx#L114))

| 점검 | 판정 | 근거 |
|:--|:--:|:--|
| 호 페이지 og:title / og:description | ❌ | 페이지가 **500**이라 메타 태그가 없습니다(`og-meta.json`). 카톡 미리보기에 제목도 사진도 나오지 않습니다(C-01) |
| OG 이미지 자체 | ✅ | `og-demo-20261005.png`, `og-kim-20261004.png` 모두 200, 1200×630 |
| 250px 말풍선 축소 시 판독성 | ⚠️ | `c1-bubble-og-demo-20261005.png`: 제목(52px → 약 11px)만 겨우 읽힙니다. `CRE MAGAZINE`(18px → 약 3.8px), 날짜, '활성 매물/시장 상태' 라벨(13px대 → 약 3px), 중개사 이메일은 판독할 수 없습니다(C-09) |
| 이미지 속 신뢰 신호 | ⚠️ | 중개사 **전화번호가 아니라 이메일**이 표시됩니다. 영어 `CRE MAGAZINE`·`credeal.net` 위주입니다 |
| 이미지 내용 일관성 | ⚠️ | 헤드라인은 "서울 상가 공실 확대, 선별 대응 시점"인데 배지는 "시장 상태: **매수 과열**"이라 서로 어긋납니다(C-23) |
| 구독 페이지·아카이브 og:image | ❌ | `/magazine/demo/subscribe`, `/magazine/demo` 모두 og:image가 null이라 카톡 공유 시 썸네일이 없습니다(C-09) |
| 구독 페이지 og 문구 | ⚠️ | "[무료 구독] ○의 **CRE** 주간 매거진 / 실거래 분석과 시장 **인텔리전스**를…" — 영어 약어와 외래어가 섞여 있습니다 |

### 2-3. 이메일 (C2)
렌더 결과: `email.html`, `email.txt`, `email-minimal.html`
캡처: `c2-email-360.png`, `c2-email-360-zoom13.png`, `c2-email-360-dark.png`, `c2-email-360-forceddark.png`, `c2-email-360-nostyle.png`

| 점검 | 판정 | 측정·근거 |
|:--|:--:|:--|
| 제목 `(광고)` 접두 | ⚠️ | `(광고) [강남빌딩중개법인 김영수] 강남 꼬마빌딩, …` 법적으로 필수입니다. 다만 발신자 이름 기본값이 `CRE Magazine <magazine@credeal.net>`([send-providers.ts:55](file:///c:/Users/User/cre-dealcard/src/domain/magazine/send-providers.ts#L55))이라 받은편지함 목록에 '(광고)+영어 발신자' 조합이 뜹니다. 네이버·다음은 스팸함으로 보낼 가능성이 크고, 60대는 지울 확률이 높습니다(C-07) |
| 본문 글자 크기 | ⚠️ | 인사·브리핑 15px, 섹션 본문 14px, 매물 정보·날짜·배지 13px, 머리말·뉴스 출처·면책·푸터 12px. 14px 미만 요소 **12개**(60대 기준 미달, C-12) |
| 버튼 크기 | ⚠️ | '매거진 전체 보기' 164×44, '전화 상담' 227×44 → 높이 48px 미달. '수신거부'는 문장 속 링크로 **48×16**입니다 |
| 큰 글꼴(zoom 1.3) | ✅ | 가로 넘침 없음(360/360), 세로 1714 → 2650px |
| 다크 모드 | ✅ | `color-scheme: light only` 단색이라 강제 반전(forceddark)에서도 깨지지 않습니다 |
| 스타일 제거·이미지 차단 최악 조건 | ⚠️ | 이미지가 없어 차단 영향은 없습니다. 인라인 스타일이 전부 빠지면 `width="600"` 때문에 가로 608px로 스크롤이 생기고 버튼이 밑줄 링크(높이 21px)로 바뀝니다(C-22) |
| 수신거부 위치 | ⚠️ | 맨 아래 12px 문장 속 링크입니다. 법적 요건은 충족하지만 60대는 찾기 어렵습니다 |
| 한글 줄바꿈 | ❌ | `word-break: keep-all`이 없어 "기준 / 금리", "있 / 습니다", "감 / 소했습니다"처럼 단어 중간에서 끊깁니다(C-12) |
| 섹션 의미 | ❌ | '주목 매물' 아래에 '거래일 2026.09.28'이 붙어 지금 파는 건물인지 이미 팔린 건물인지 헷갈립니다(C-13) |
| 약어 | ❌ | 본문 "Cap Rate는 3.2%" — 렌더러에 용어 풀이 장치가 없습니다(C-14) |
| 최종 목적지 | ❌ | '매거진 전체 보기'를 누르면 현재 500 화면으로 갑니다(C-01) |

### 2-4. 구독 확인(더블 옵트인) (C3)
캡처: `c3-optin-email-360.png`(+zoom13), `c3-confirm-form-prod.png`(+zoom13), `c3-confirm-badlink-prod.png`

| 점검 | 판정 | 근거 |
|:--|:--:|:--|
| 확인 메일 제목 | ⚠️ | `[구독 확인] 강남빌딩중개법인 김영수 매거진 구독을 확인해 주세요` — 발신자 이름은 여전히 `CRE Magazine` |
| 확인 메일 본문 | ⚠️ | 15px. 2단계("버튼을 눌러 열린 페이지에서 '구독 확인하기'를 한 번 더") 설명이 한 문장에 몰려 있습니다. 대체 안내는 13px 긴 URL **복사·붙여넣기**인데 60대에게는 불가능에 가깝습니다 |
| 문의처 | ❌ | 구독 API가 `brokerContact`를 넘기지 않아([subscribe/route.ts:102-109](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/subscribe/route.ts#L102-L109)) "문의: 010-…" 줄이 아예 렌더되지 않습니다 |
| 확인 페이지(운영 GET) | ✅ | 16px, 버튼 310×49, 문구가 쉽습니다. 단 중개사 이름이 없습니다(누구 매거진인지 모름) |
| 확인 완료 후 | ⚠️ | "동의하신 채널로 보내드립니다" — 언제·무엇으로 오는지, 매거진 보기 링크가 없습니다 |
| 잘못된 링크 | ⚠️ | "구독 페이지에서 다시 신청해 주세요" — 링크도 전화번호도 없습니다(C-16) |

**60대가 "신청했는데 안 와요"를 겪는 경로 (시간순, 코드 기준)**

| 시점 | R이 하는 일 / 보는 화면 | 시스템 내부 | 근거 |
|:--|:--|:--|:--|
| T0 | 김 대표가 카톡으로 보낸 구독 링크를 엽니다. 폼에서 **휴대폰은 필수, 이메일은 '(선택)'**이라 이메일을 비웁니다. 안내문은 "알림톡 수신용 번호입니다" | `channel = emailTrim ? 'both' : 'kakao'` | [SubscribeFormClient.tsx:89](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L89), [:178](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L178), [:184](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L184) |
| T0+1초 | 초록 체크 아이콘, 토스트 "구독 신청이 접수되었습니다", "확인 후 발송이 시작됩니다. ○ 중개사의 매거진은 **매주 화요일 발송됩니다**." 그 아래 작은 글씨로 "다만 이메일 주소가 없어 … 발송되지 않습니다. 이메일 주소를 함께 입력해 **다시 신청해 주세요**" + 노란 글씨로 같은 내용 반복. **폼은 이미 사라져** 다시 입력할 곳이 없습니다 | `confirm_status='pending'`, `pendingReason=NO_EMAIL_CONFIRM_CHANNEL` | [SubscribeFormClient.tsx:105-124](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L105-L124), [subscribe/route.ts:38-39](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/subscribe/route.ts#L38-L39) |
| T0+1초 (이메일을 넣은 경우) | "구독 신청이 접수되었습니다. 본인 확인이 끝나면 매거진을 받아보실 수 있습니다." 확인 메일을 기다립니다 | `MAGAZINE_SEND_ENABLED=false` 또는 dry-run이면 `SEND_DISABLED`/`DRY_RUN` → 메일 미발송, pending 유지 | [consent-service.ts:547-548](file:///c:/Users/User/cre-dealcard/src/domain/magazine/consent-service.ts#L547-L548), [subscribe/route.ts:35](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/subscribe/route.ts#L35) |
| 첫 화요일 | 아무것도 오지 않습니다. "신청했는데 안 온다" | sendGate가 `PENDING_CONFIRM`으로 차단 | [send-gate.ts:164](file:///c:/Users/User/cre-dealcard/src/domain/magazine/send-gate.ts#L164) |
| T0+7일 | (이메일 입력자) 확인 링크 만료. 발송을 켜도 확인 메일을 다시 보내는 코드가 없습니다(`sendOptInConfirmation`은 구독 POST에서만 호출) | 재발송·리마인드 없음 | repo 전체 grep: 호출처는 [subscribe/route.ts:102](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/subscribe/route.ts#L102) 단 1곳 |
| 재시도 | 같은 번호로 다시 신청하면 하루 3회 제한에 걸리고, 이메일이 없으면 결과는 같습니다 | `target: max 3 / 86400s` | [subscribe/route.ts:62](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/subscribe/route.ts#L62) |
| 중개인 B | 구독자 목록에 '수신 확인 대기 중'만 보입니다. 고객에게 무엇을 하라고 안내해야 할지 모릅니다 | — | [special-edition-helpers.ts:127](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/outreach/special-edition-helpers.ts#L127) |

> 운영 DB 실측(개인정보 없이 집계): `active|pending|kakao|email:N` 5명, `active|pending|both|email:N` 1명 → **확인 완료 0명 / 6명**

### 2-5. 수신거부 (C4)
캡처: `c4-unsub-get-local.png`(+zoom13; 로컬 라우트 핸들러 GET, DB는 읽기만), `c4-unsub-done-local.png`(완료 문구는 [route.ts:251-256](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/unsubscribe/route.ts#L251-L256) 그대로 재현, POST 미실행), `c4-unsub-notoken-prod.png`, `c4-unsub-badtoken-prod.png`

| 점검 | 판정 | 근거 |
|:--|:--:|:--|
| 확인 단계(GET은 상태 변경 없음) | ✅ | 메일 스캐너가 먼저 열어도 해지되지 않습니다 |
| 글자·버튼 | ⚠️ | 본문 14px, 중개사 표시 13px, 버튼 134×44(48px 미달) |
| 무엇이 멈추는지 | ❌ | "이 중개사의 매거진"이라고만 합니다. 카톡·이메일 둘 다인지, 속보도 멈추는지 알 수 없습니다 |
| 취소 경로 | ❌ | '계속 받을게요' 버튼이 없습니다(창 닫기뿐) |
| 완료 후 되돌리기 | ❌ | "언제든 중개인 명함의 구독 링크로 다시 구독하실 수 있습니다" — 실수로 누른 60대는 복구 방법을 찾지 못합니다(C-11) |
| 오류 화면 | ⚠️ | "유효하지 않은 수신 거부 링크 / 메일에 있는 링크를 다시 확인해 주세요" — 카톡으로 받은 사람에게 '메일'이라고 안내하고, 전화번호·대체 경로가 없습니다 |
| 용어 | ⚠️ | '수신거부' 13건, '수신 거부' 11건으로 띄어쓰기가 섞여 있습니다. '거부'는 어감이 셉니다 → '그만 받기' 제안 |

### 2-6. 404·미발행·오류 페이지 (C4)
캡처: `c4-404-noslug-prod.png`, `c4-unpub-missing-prod.png`(+zoom13), `c4-unpub-future-prod.png`, `c4-unpub-invalid-prod.png`, `c4-issue-kim-prod.png`, `c4-404-generic-prod.png`, `c4-archive-prod.png`

| 주소(운영) | 기대 화면 | 실제 |
|:--|:--|:--|
| `/magazine/demo/2026-10-05` (발행본 있음) | 매거진 | **500 영어 오류** |
| `/magazine/test-broker-kim/2026-10-04` (발행본 있음) | 매거진 | **500** |
| `/magazine/demo/2026-10-14` (미발행) | `UnpublishedNotice` "아직 발행되지 않은 매거진입니다" | **500** |
| `/magazine/demo/2099-01-01`, `/not-a-date` | 미발행 / 형식 오류 안내 | **500** |
| `/magazine/없는slug/2026-10-13` | not-found | **500** |
| `/magazine/demo` (아카이브) | 목록 | 200. 날짜·태그 12px, '다음 호 구독하기 →' 98×44 |
| `/magazine-ux60-nope` | 404 | 정상 404(HTTP 404) 화면, 17px, '홈으로 돌아가기' 154×44 |

- 500 화면은 Next 기본 화면("This page couldn't load", 'Reload' 68×32 버튼)입니다. 매거진 전용 error 경계([magazine/error.tsx:36](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/error.tsx#L36) "매거진을 불러오지 못했습니다")조차 나오지 않으므로, 오류는 레이아웃이나 모듈을 불러오는 단계에서 나는 것으로 추정됩니다.
- 미발행 안내 문구([UnpublishedNotice.tsx:26-32](file:///c:/Users/User/cre-dealcard/src/components/magazine/UnpublishedNotice.tsx#L26-L32))는 코드상으로는 양호합니다. 다만 운영에서 확인할 수 없습니다.

---

## 3. 문구 감사 (C5)

### 3-1. 통계 (추출 스크립트: `copy-stats.json`, 원문 목록: `copy-strings.json`)
- 대상: 매거진 관련 121개 파일, 한글 문자열 **1,371개**(독자 접점 641개 / 중개인 에디터 730개). 주석·로그·throw는 제외했습니다.

**영어·약어·외래어 노출 빈도** (전체 기준, 괄호 안은 독자 접점)

| 용어 | 건수 | 대표 위치 | 비고 |
|:--|:--:|:--|:--|
| AI | 20 (6) | magazine-view.tsx:162 "AI 마켓 에디터 브리핑" | 독자에게 신뢰 저하 요인이 될 수 있습니다(AI가 썼다는 인상) |
| CRE | 19 (17) | subscribe/page.tsx:53 "[무료 구독] ○의 CRE 주간 매거진" | 60대는 모르는 약어입니다 |
| 브리핑 | 14 (5) | subscribe/page.tsx:51 | |
| 태그 | 14 | outreach-helpers.ts:150 | 중개인 B |
| 섹션 | 13 | analytics-text.ts:58 | 중개인 B |
| 체류 | 11 | EditorAnalyticsTab.tsx:192 | 중개인 B |
| QR | 10 | EditorOutreachTab.tsx:189 | 'QR 코드'는 수용 가능합니다 |
| 인텔리전스 | 9 (7) | ViewerBottomBar.tsx:62 "주간 꼬마빌딩 시장 AI 인텔리전스" | 뜻 전달이 안 됩니다 |
| 콘텐츠 | 9 | editor error.tsx:27 "콘텐츠 스튜디오" | |
| 에디션 | 8 | EditorPublishTab.tsx:88 "에디션 정보" | → "이번 호" |
| 온도 / 매수 온도 | 7 / 3 | CallBriefingModal.tsx:62 | 중개인 B |
| IM | 5 | analytics-text.ts:68 "IM(투자설명서) 요청" | 풀이는 있습니다 |
| URL | 5 | EditorCoverTab.tsx:208 "이미지 URL을 입력하세요" | |
| 아웃리치 | 5 | EditorOutreachTab.tsx:79 | → "고객 연락" |
| 템플릿 | 4 | CallBriefingModal.tsx:89 | |
| 필드노트 / 현장 노트 | 4 / 2 | EditorPublishTab.tsx:22 vs email-template.tsx:249 | 같은 섹션에 이름이 두 개입니다 |
| slug | 3 | SlugSetupGate.tsx:63 "매거진 주소(slug)" | 풀이는 있으나 노출 자체가 불필요합니다 |
| 핫리드 | 3 | EditorAnalyticsTab.tsx:297 | |
| DPI | 3 | MagazineQrModal.tsx:120 | |
| NOI / NPL | 2 / 2 | RoiCalculator.tsx:222, viewer-sections.tsx:190 "NPL 소싱" | NPL은 섹션 제목에서 풀이가 없습니다 |
| GBD·YBD·CBD | 각 1 | period-label.ts:22-24 | 풀이 있음 ✅ |
| CTA | 1 | outreach-helpers.ts:378 "CTA 클릭" | 중개인 B |
| dry-run / APP_BASE_URL | 1 / 1 | special-edition-helpers.ts:206, MagazineQrModal.tsx:142 | 개발 용어가 그대로 노출됩니다 |
| 1st-party ID | 1 | privacy/page.tsx:46 | 법률 문서에 개발 용어 |
| (이메일·카톡 본문) Cap Rate | 렌더러 풀이 0 | email.html·kakao.txt | 입력에 있으면 그대로 발송됩니다 |

**문장 길이·말투·기타**

| 지표 | 값 | 해석 |
|:--|:--|:--|
| 완결 문장(…다/요로 끝남) 중 40자 초과 | 32 / 511 = **6.3%** | JSX가 여러 줄로 나뉜 문장은 잘려 집계되므로 실제보다 낮게 잡혔습니다. 최장 문장은 subscribe/route.ts:39(63자), visitor-id.ts:23(73자), privacy/page.tsx:91(72자) |
| 존댓말 혼재 | '~해요/요'체 187건 vs '~합니다'체 264건, **두 체가 섞인 파일 35개** | 한 화면 안에서도 섞입니다. 예: 구독 폼 "…시작할 수 있어요"(196) / "…신청할 수 있습니다"(277) |
| 맥락 없는 버튼 라벨 | 9건 | '다시 시도'×3, '취소'×3, '닫기', '저장', '선택' |
| 이모지로 의미 전달 | 47건 | 🟣AI·🔵공공데이터·🟢실시간 배지(viewer-primitives.tsx:19-21), 🔥📈⏸️❄️⚪ 온도(EditorAnalyticsTab.tsx:25-29)는 색만으로 구분됩니다 |
| 법률·한자어 | '열람' 37, '광고성' 6, '수집·이용' 3, '위탁' 4, '수탁' 2, '파기' 3, '철회' 2, '처리정지'·'익명화'·'해시'·'국외'·'정보통신망법' 각 1 | '열람'은 독자 화면에도 다수('최근 매거진 열람하기') → '보기' |
| 상대 시간('n분 전') | 0건 | ✅ 절대 날짜만 사용합니다. 다만 날짜 표기는 '2026년 10월 13일'(본문), '2026.09.28'(매물), '2026.10.05'(OG)로 3종이 섞여 있습니다 |
| 숫자·금액 | 억 4, 만원 2, 평 10, ㎡ 0 | 이메일 '85억', '42.5억'(소수점 억), 본문 '평당 1억 5천만 원' 혼용 → '42억 5천만 원'으로 통일 권장 |
| 호칭 | '중개사' 23 vs '중개인' 4 | 해지 완료 문구에 '중개인 명함', 나머지는 '중개사' |

### 3-2. 원문 → 60대 친화 제안 (75건)

| # | 위치 | 원문 | 제안 |
|:--:|:--|:--|:--|
| 1 | [SubscribeFormClient.tsx:149](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L149) | 성함 또는 닉네임 (선택) | 불러 드릴 이름 (안 써도 돼요) |
| 2 | [SubscribeFormClient.tsx:178](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L178) | 알림톡 수신용 번호입니다. 숫자만 입력하면 하이픈이 자동으로 들어갑니다. | 숫자만 누르세요. (지금은 카카오톡 발송 준비 중이라 이메일로 먼저 보내 드려요) |
| 3 | [SubscribeFormClient.tsx:184](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L184) | 이메일 (선택) | 이메일 **(꼭 필요해요 — 확인 메일을 보내 드려요)** |
| 4 | [SubscribeFormClient.tsx:196](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L196) | 이메일을 입력하면 확인 링크를 받아 수신을 시작할 수 있어요. | 이메일이 없으면 지금은 받아 보실 수 없어요. |
| 5 | [SubscribeFormClient.tsx:203](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L203) | 관심 권역 (선택 · 맞춤 매물 안내) | 관심 있는 동네 (여러 개 고를 수 있어요) |
| 6 | [SubscribeFormClient.tsx:230](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L230) | 관심 자산 (선택) | 관심 있는 건물 종류 |
| 7 | [SubscribeFormClient.tsx:277](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L277) | 필수 동의 3개를 모두 체크하면 신청할 수 있습니다. | 위 네모 3개에 모두 체크하셔야 버튼이 눌려요. |
| 8 | [SubscribeFormClient.tsx:70](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L70) | 올바른 휴대폰 번호를 입력해주세요. | 휴대폰 번호 11자리를 다시 봐 주세요. (예: 010-1234-5678) — 토스트 대신 입력칸 바로 아래 고정 표시 |
| 9 | [SubscribeFormClient.tsx:102](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L102) | (토스트) 구독 신청이 접수되었습니다. | 삭제 — 결과 카드와 중복이고 5초 안에 사라집니다 |
| 10 | [SubscribeFormClient.tsx:114-120](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L114-L120) | 구독 신청이 접수되었습니다 / 확인 후 발송이 시작됩니다. ○ 중개사의 매거진은 매주 화요일 발송됩니다. | (pending) **"아직 끝나지 않았어요"** / ① 메일함에서 '구독 확인하기'를 눌러 주세요 ② 그다음 화요일부터 받으세요 — 체크 아이콘 대신 1·2단계 표시 |
| 11 | [subscribe/route.ts:35](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/subscribe/route.ts#L35) | 구독 신청이 접수되었습니다. 본인 확인이 끝나면 매거진을 받아보실 수 있습니다. | 신청을 받았어요. 확인 메일은 준비가 끝나는 대로 보내 드리고, 그 전에 ○ 대표가 직접 연락드릴 수 있어요. (실제 운영 상태를 정직하게) |
| 12 | [subscribe/route.ts:39](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/subscribe/route.ts#L39) | 구독 신청이 접수되었습니다. 다만 이메일 주소가 없어 … 다시 신청해 주세요. (108자) | 아직 받아 보실 수 없어요. 이메일을 적어 주시면 확인 메일을 보내 드려요. **[이메일 적기]** (폼을 그대로 두고 이메일 칸만 강조) |
| 13 | [subscribe-api.ts:28](file:///c:/Users/User/cre-dealcard/src/components/magazine/subscribe-api.ts#L28) | 이메일을 입력하지 않으면 확인 링크를 보낼 수 없어 수신이 시작되지 않습니다. | 삭제(12번과 중복 표시됨) |
| 14 | [ConsentCheckboxes.tsx:54](file:///c:/Users/User/cre-dealcard/src/components/magazine/ConsentCheckboxes.tsx#L54) | [필수] 개인정보 수집·이용에 동의합니다. (수집 항목: 연락처·이름, 목적: 매거진 발송, 보유: 수신 해지 시까지) | [필수] 매거진을 보내려고 **전화번호·이메일·이름**을 받아요. 그만 받으시면 **30일 뒤 지워요.** [자세히] |
| 15 | [ConsentCheckboxes.tsx:56](file:///c:/Users/User/cre-dealcard/src/components/magazine/ConsentCheckboxes.tsx#L56) | 처리방침 보기 | 자세히 보기 |
| 16 | [ConsentCheckboxes.tsx:64](file:///c:/Users/User/cre-dealcard/src/components/magazine/ConsentCheckboxes.tsx#L64) | [필수] 광고성 정보 수신에 동의합니다. (매거진 발송 · 21시~익일 08시 야간 제외 · 언제든 수신거부 가능) | [필수] 매거진(매물 광고 포함)을 받을게요. 밤 9시~아침 8시엔 안 보내요. 언제든 그만 받을 수 있어요. |
| 17 | [ConsentCheckboxes.tsx:71](file:///c:/Users/User/cre-dealcard/src/components/magazine/ConsentCheckboxes.tsx#L71) | [필수] 만 14세 이상입니다. | [필수] 만 14세 이상이에요. ('전체 동의' 큰 체크 1개 + 펼침 3개 구조 권장) |
| 18 | [visitor-id.ts:22-23](file:///c:/Users/User/cre-dealcard/src/lib/magazine/visitor-id.ts#L22-L23) | 열람 통계를 위해 이 브라우저에 임의의 방문자 번호를 13개월간 저장합니다(쿠키·기기 지문 아님). 서버에는 암호화(해시)된 값만 … | **읽음 표시 안내**: 몇 번 읽으셨는지 세려고 이 휴대폰에 번호를 저장해요. 구독자 전용 링크로 여시면 ○ 대표가 '읽으셨다'는 걸 볼 수 있어요. |
| 19 | [TrackingNotice.tsx:12](file:///c:/Users/User/cre-dealcard/src/components/magazine/TrackingNotice.tsx#L12) | 수신 해지·정보 삭제는 받은 메시지의 해지 링크 또는 담당 중개사에게 문의해 주세요. | 그만 받거나 내 정보를 지우려면 매거진 맨 아래 **'그만 받기'**를 누르시거나 ○ 대표(010-…)에게 전화하세요. |
| 20 | [TrackingNotice.tsx:19](file:///c:/Users/User/cre-dealcard/src/components/magazine/TrackingNotice.tsx#L19) | 개인정보 처리방침 | 개인정보 안내 전문 보기 |
| 21 | [privacy/page.tsx:25](file:///c:/Users/User/cre-dealcard/src/app/(public)/privacy/page.tsx#L25) | 개인정보 수집·이용 안내 | 내 정보, 이렇게 씁니다 (개인정보 수집·이용 안내) |
| 22 | [privacy/page.tsx:45-46](file:///c:/Users/User/cre-dealcard/src/app/(public)/privacy/page.tsx#L45-L46) | 익명 자체 식별자 기반 — 이름·연락처와 직접 연결하지 않는 1st-party ID 사용 | 구독자 전용 링크로 여시면 누가 읽었는지 담당 중개사가 볼 수 있습니다. (추적 고지와 모순 해소, C-10) |
| 23 | [privacy/page.tsx:95-96](file:///c:/Users/User/cre-dealcard/src/app/(public)/privacy/page.tsx#L95-L96) | 개인정보 처리 위탁 / 위탁 업무 범위를 넘어 … | 내 정보를 대신 처리하는 회사 / 이 회사들은 아래 일에만 정보를 씁니다. |
| 24 | [privacy/page.tsx:125](file:///c:/Users/User/cre-dealcard/src/app/(public)/privacy/page.tsx#L125) | 일부 수탁자는 국외 서버에서 정보를 처리·보관할 수 있습니다. | 일부 회사(예: 미국 서버)는 해외에 보관합니다. (국가·회사 명시) |
| 25 | [privacy/page.tsx:140](file:///c:/Users/User/cre-dealcard/src/app/(public)/privacy/page.tsx#L140) | 열람·정정·삭제·처리정지와 수신 동의의 철회를 요청 | 내 정보 보기·고치기·지우기·그만 쓰게 하기, 받기 동의 취소를 요청 |
| 26 | [legal-shared.tsx:35](file:///c:/Users/User/cre-dealcard/src/app/(public)/privacy/legal-shared.tsx#L35) | 매거진 하단에 기재된 발행 중개사 연락처 또는 서비스 운영자 문의 채널 | 전화 ○○○-○○○○ / 이메일 privacy@credeal.net (실제 연락처 확정) |
| 27 | [email-template.tsx:202](file:///c:/Users/User/cre-dealcard/src/domain/magazine/email-template.tsx#L202) | (광고) [강남빌딩중개법인 김영수] {제목} | (광고) 김영수 대표 \| {제목} — 발신자 이름도 `김영수 대표(강남빌딩중개법인)`로 |
| 28 | [email-template.tsx:222](file:///c:/Users/User/cre-dealcard/src/domain/magazine/email-template.tsx#L222) | (광고) ○ 주간 부동산 매거진 (12px) | (광고) ○ 대표가 보내는 이번 주 빌딩 소식 (15px) |
| 29 | [email-template.tsx:226](file:///c:/Users/User/cre-dealcard/src/domain/magazine/email-template.tsx#L226) | 시장 상태: 선별 매수 | 요즘 시장: 좋은 건물만 팔려요 (선별 매수) |
| 30 | [email-template.tsx:243](file:///c:/Users/User/cre-dealcard/src/domain/magazine/email-template.tsx#L243) | 전화 상담 010-0000-0001 | 김영수 대표에게 전화하기 (높이 52px) |
| 31 | [email-template.tsx:124](file:///c:/Users/User/cre-dealcard/src/domain/magazine/email-template.tsx#L124) | 주목 매물 (+ 거래일) | 최근 팔린 건물 (실거래) — 판매 중 매물과 분리 |
| 32 | [email-template.tsx:150](file:///c:/Users/User/cre-dealcard/src/domain/magazine/email-template.tsx#L150) | 비교 대안: A / B | 두 가지 방법 비교: A ↔ B |
| 33 | [email-template.tsx:276](file:///c:/Users/User/cre-dealcard/src/domain/magazine/email-template.tsx#L276) | 이 메일은 2026년 10월 1일 광고성 정보 수신에 동의하신 분께 발송되었습니다. | 2026년 10월 1일에 받아 보기를 신청하셔서 보내 드립니다. |
| 34 | [email-template.tsx:280](file:///c:/Users/User/cre-dealcard/src/domain/magazine/email-template.tsx#L280) | 더 이상 받고 싶지 않으시면 수신거부를 눌러 주세요. 즉시 처리됩니다. | **[그만 받기]** 회색 테두리 버튼(48px) + "누르면 확인 화면이 한 번 더 나와요" |
| 35 | [kakao-text.ts:36](file:///c:/Users/User/cre-dealcard/src/domain/magazine/templates/kakao-text.ts#L36) | (광고) {법인명} / ○님, 이번 주 매거진이 도착했습니다. | (광고) [김영수 대표] ○님, 이번 주 강남 빌딩 소식입니다. |
| 36 | [kakao-text.ts:37](file:///c:/Users/User/cre-dealcard/src/domain/magazine/templates/kakao-text.ts#L37) | ▶ 매거진 보기: https://…?sid=c2lkMS4z…(173자) | 웹링크 버튼 **[이번 호 보기]** (본문에서 URL 제거) |
| 37 | [kakao-text.ts:39](file:///c:/Users/User/cre-dealcard/src/domain/magazine/templates/kakao-text.ts#L39) | 수신 동의하신 분께 발송됩니다. / 수신거부: https://…(176자) | 그만 받기: 버튼 또는 080 무료 수신거부 번호 |
| 38 | [opt-in-confirm.ts:32](file:///c:/Users/User/cre-dealcard/src/domain/magazine/templates/opt-in-confirm.ts#L32) | [구독 확인] ○ 매거진 구독을 확인해 주세요 | [김영수 대표] 신청하신 매거진, 버튼 한 번만 눌러 주세요 |
| 39 | [opt-in-confirm.ts:62](file:///c:/Users/User/cre-dealcard/src/domain/magazine/templates/opt-in-confirm.ts#L62) | 아래 버튼을 눌러 열린 페이지에서 "구독 확인하기"를 한 번 더 눌러 주세요. | ① 아래 파란 버튼을 누르세요 ② 열린 화면에서 한 번 더 누르면 끝! |
| 40 | [opt-in-confirm.ts:66](file:///c:/Users/User/cre-dealcard/src/domain/magazine/templates/opt-in-confirm.ts#L66) | 버튼이 열리지 않으면 아래 주소를 브라우저에 붙여넣어 주세요. | 버튼이 안 눌리면 ○ 대표(010-…)에게 전화 주세요. 대신 처리해 드려요. |
| 41 | [confirm/route.ts:79](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/confirm/route.ts#L79) | 앞으로 동의하신 채널로 매거진을 보내드립니다. … | 끝났어요! 매주 화요일 오전 10시에 이메일로 보내 드려요. **[이번 호 먼저 보기]** |
| 42 | [confirm/route.ts:85](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/confirm/route.ts#L85) | 확인 링크의 유효 기간(7일)이 지났습니다. 구독 페이지에서 다시 신청해 주세요. | 7일이 지나 이 버튼은 쓸 수 없어요. **[다시 신청하기]** (구독 페이지 링크) |
| 43 | [confirm/route.ts:111](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/confirm/route.ts#L111) | 유효하지 않은 링크입니다 / 올바르지 않은 링크입니다. | 이 링크는 열 수 없어요 / 메일의 파란 버튼을 다시 눌러 보시거나 담당 중개사에게 연락해 주세요. |
| 44 | [unsubscribe/route.ts:67-68](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/unsubscribe/route.ts#L67-L68) | 유효하지 않은 수신 거부 링크 / 메일에 있는 링크를 다시 확인해 주세요. | 이 링크로는 그만 받기를 할 수 없어요 / 받으신 카톡·메일 맨 아래 버튼을 다시 눌러 주세요. |
| 45 | [unsubscribe/route.ts:157](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/unsubscribe/route.ts#L157) | 더 이상 이 중개사의 매거진을 받지 않으시겠습니까? | ○ 대표의 매거진(카톡·이메일·속보)을 **모두** 그만 받으시겠어요? |
| 46 | [unsubscribe/route.ts:160](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/unsubscribe/route.ts#L160) | 수신 거부하기 | 그만 받기 (+ 옆에 **[계속 받을게요]**) |
| 47 | [unsubscribe/route.ts:256](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/unsubscribe/route.ts#L256) | 언제든 중개인 명함의 구독 링크로 다시 구독하실 수 있습니다. | 실수로 누르셨나요? **[다시 받기]** (구독 페이지로 이동, 이름·번호 미리 채움 금지) |
| 48 | [UnpublishedNotice.tsx:32](file:///c:/Users/User/cre-dealcard/src/components/magazine/UnpublishedNotice.tsx#L32) | ○는 발행되지 않았거나 공개 대기 중입니다. | 이 날짜 매거진은 아직 없어요. **[가장 최근 호 보기]** |
| 49 | [magazine/error.tsx:36,44](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/error.tsx#L36-L44) | 매거진을 불러오지 못했습니다 / 홈으로 이동 | 잠시 문제가 생겼어요 / [다시 열기] [담당 중개사에게 전화] ('홈'은 독자에게 의미 없음) |
| 50 | (Next 기본 500) | This page couldn't load / Reload | 한국어 global-error: "잠시 후 다시 열어 주세요" + 전화 버튼 |
| 51 | [viewer-primitives.tsx:19-21](file:///c:/Users/User/cre-dealcard/src/components/magazine/viewer-primitives.tsx#L19-L21) | 🟣 AI 분석 / 🔵 공공데이터 / 🟢 실시간 | AI가 정리 / 국토부 실거래 자료 / 오늘 기준 (이모지 색에 의존하지 않기) |
| 52 | [viewer-sections.tsx:81](file:///c:/Users/User/cre-dealcard/src/components/magazine/viewer-sections.tsx#L81) | 렌탈 인덱스 | 임대료 지수 (100 = 작년 이맘때) |
| 53 | [viewer-sections.tsx:190](file:///c:/Users/User/cre-dealcard/src/components/magazine/viewer-sections.tsx#L190) | NPL 소싱 | 경매로 나온 빌딩 (부실채권) |
| 54 | [viewer-sections.tsx:152](file:///c:/Users/User/cre-dealcard/src/components/magazine/viewer-sections.tsx#L152) | 뉴스 큐레이션 | 이번 주 꼭 볼 뉴스 |
| 55 | [viewer-sections.tsx:262,279](file:///c:/Users/User/cre-dealcard/src/components/magazine/viewer-sections.tsx#L262-L279) | CRE 투자자 심리 지수 / 극단 위축 · 극단 과열 | 빌딩 투자 분위기 점수 / 꽁꽁 얼어붙음 · 너무 뜨거움 |
| 56 | [magazine-view.tsx:162](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx#L162) | AI 마켓 에디터 브리핑 | 이번 주 시장 한눈에 (AI 정리, ○ 대표 확인) |
| 57 | [magazine-view.tsx:268](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx#L268) | 주목 매물 하이라이트 | 눈여겨볼 매물 |
| 58 | [magazine-view.tsx:404](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx#L404) | 수지분석 계산기 | 내 건물 수익 계산기 |
| 59 | [RoiCalculator.tsx:183,222](file:///c:/Users/User/cre-dealcard/src/components/magazine/RoiCalculator.tsx#L183-L222) | 자기자본수익률 / NOI (순영업소득) | 내 돈 대비 수익률 / 1년 순수익 (NOI) |
| 60 | [ViewerBottomBar.tsx:62](file:///c:/Users/User/cre-dealcard/src/components/magazine/ViewerBottomBar.tsx#L62) | 주간 꼬마빌딩 시장 AI 인텔리전스 | 매주 받는 꼬마빌딩 시장 소식 |
| 61 | [subscribe/page.tsx:51,54](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/page.tsx#L51-L54) | 실거래가, 시장 인텔리전스, 추천 매물 브리핑을 … 카카오톡으로 | 실거래가·임대 시세·추천 매물을 매주 화요일에 보내 드려요 ('카카오톡' 약속은 실제 채널 준비 후에) |
| 62 | [subscribe/page.tsx:187](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/page.tsx#L187) | © CRE DealCard · 상업용 부동산 인텔리전스 네트워크 | 크레딜(CRE DealCard) · 문의 ○○○ |
| 63 | [ForwardSection.tsx:72](file:///c:/Users/User/cre-dealcard/src/components/magazine/ForwardSection.tsx#L72) | 💬 전달하기 | 카톡으로 친구에게 보내기 |
| 64 | [PollSection.tsx:184](file:///c:/Users/User/cre-dealcard/src/components/magazine/PollSection.tsx#L184) | 다시 시도 | 답 다시 보내기 |
| 65 | [SubscribeCard.tsx:112](file:///c:/Users/User/cre-dealcard/src/components/magazine/SubscribeCard.tsx#L112) | 중개인이 엄선한 최신 꼬마빌딩/CRE 정보 및 리포트를 | ○ 대표가 고른 꼬마빌딩 소식을 |
| 66 | [EditorOutreachTab.tsx:79](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/EditorOutreachTab.tsx#L79) | 아웃리치 | 고객 연락 |
| 67 | [EditorAnalyticsTab.tsx:297](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/EditorAnalyticsTab.tsx#L297) | 지금 연락해야 할 핫리드 | 오늘 전화해 볼 고객 |
| 68 | [EditorAnalyticsTab.tsx:150](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/EditorAnalyticsTab.tsx#L150) | 독자 인텔리전스 & 성과 대시보드 | 누가, 얼마나 읽었나 |
| 69 | [analytics-text.ts:63](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/analytics/analytics-text.ts#L63) | 섹션 체류: ○ ○초 | '○' 부분을 ○초 동안 읽음 |
| 70 | [outreach-helpers.ts:378](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/outreach/outreach-helpers.ts#L378) | CTA 클릭 | 버튼 누름 |
| 71 | [SlugSetupGate.tsx:63](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/SlugSetupGate.tsx#L63) | 매거진 주소(slug)를 먼저 설정하세요 | 매거진 인터넷 주소를 먼저 정해 주세요 (예: credeal.net/magazine/**kim-gangnam**) |
| 72 | [special-edition-helpers.ts:206](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/outreach/special-edition-helpers.ts#L206) | 시험 발송(dry-run)만 진행했어요 — 실제 발송은 없어요 | 연습으로만 보냈어요. 고객에게는 가지 않았어요. |
| 73 | [MagazineQrModal.tsx:142](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/MagazineQrModal.tsx#L142) | 서비스 주소(APP_BASE_URL) 설정이 필요해요. 관리자에게 문의해 주세요. | QR을 만들 수 없어요. 고객센터(○○○)에 알려 주세요. (환경변수명 제거) |
| 74 | [EditorPublishTab.tsx:88](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/EditorPublishTab.tsx#L88) | 에디션 정보 / 에디션 타입 / 에디션 라벨 | 이번 호 정보 / 종류 / 호 이름 |
| 75 | [CallBriefingModal.tsx:89](file:///c:/Users/User/cre-dealcard/src/components/magazine-editor/analytics/CallBriefingModal.tsx#L89) | 통화 오프닝 (템플릿) | 전화 첫마디 예시 |

---

## 4. 동의·법률 문구 개선안 (C6)

### 4-1. 현재 상태 (측정)
| 대상 | 길이 | 글자 크기·대비 | 문제 |
|:--|:--|:--|:--|
| 동의 ① 개인정보 ([ConsentCheckboxes.tsx:54](file:///c:/Users/User/cre-dealcard/src/components/magazine/ConsentCheckboxes.tsx#L54)) | 약 70자, 괄호 3중 | **13px**(text-xs), 체크박스 20×20(zoom 1.3에서 26×26) | 한 줄 안에 '수집 항목·목적·보유'가 몰려 있습니다. "보유: 수신 해지 시까지"는 처리방침의 "**해지 후 30일** 뒤 익명화"와 **다릅니다** |
| 동의 ② 광고성 정보 (:64) | 약 55자 | 13px | '광고성 정보'·'익일'·'수신거부' — '광고를 받는다'는 실감이 약합니다 |
| 동의 ③ 14세 (:71) | 12자 | 13px | 양호 |
| 행동 추적 고지 ([visitor-id.ts:22-23](file:///c:/Users/User/cre-dealcard/src/lib/magazine/visitor-id.ts#L22-L23) + TrackingNotice) | 2문장 128자 + 해지 안내 47자 | **12px** | '해시'·'기기 지문'·'임의의 방문자 번호'. 핵심("중개사가 내가 읽었는지 안다")이 문장 끝에 묻혀 있고, 처리방침의 "이름·연락처와 직접 연결하지 않는"과 **모순**됩니다. 보관 기간도 '13개월'(브라우저)과 '365일'(서버)로 섞여 있습니다 |
| `/privacy` 본문 | 9개 조항, zoom 1.3에서 4,688px(약 6화면) | 15px지만 **대비 1.36:1**(32개 요소), 시행일 2.62:1 | 읽을 수 없습니다. 요약이 없습니다. '처리위탁·수탁자·국외·처리정지·1st-party ID' 같은 말이 나옵니다. 하단 바('홈·아고라·더보기')가 본문을 가립니다 |
| `/terms` 본문 | — | 대비 1.36:1(20개 요소) | 위와 같습니다 |

캡처: `c6-subscribe-prod.png`(+zoom13), `c6-privacy-prod.png`, `c6-privacy-prod-zoom13.png`, 수치 `contrast.json`

### 4-2. 구조 제안: '쉬운 말 요약 3줄 + 전문 보기'
1. 체크박스는 **'모두 동의하고 받아 보기'** 큰 체크 1개(터치 영역 48px 이상, 글자 17px)로 두고, 아래에 3개 항목을 접어 둡니다(각 항목 '자세히' 펼침).
2. 항목마다 **누가·무엇을·언제까지** 순서의 한 문장 요약(16px 이상, 대비 7:1 이상)을 붙입니다.
3. '전문 보기'는 매거진 전용 밝은 배경 레이아웃의 `/privacy`로 연결하고, 하단 바·테마 토글은 빼고 첫 화면에 '3줄 요약' 박스를 둡니다.
4. 동의 문구·추적 고지·처리방침의 **보유기간·연결 여부를 한 SSOT 상수**에서 가져와 모순을 없앱니다.

### 4-3. 쉬운 말 버전 예시

> **☐ 모두 동의하고 무료로 받아 보기** (필수 3개)
>
> - **내 정보는 이렇게 써요** [자세히 ▾]
>   매거진을 보내려고 휴대폰 번호·이메일·이름을 받아요. 그만 받으시면 30일 뒤 지워요. 다른 회사에 팔지 않아요.
> - **광고가 들어 있어요** [자세히 ▾]
>   매거진에는 ○ 대표의 매물 소개(광고)가 들어 있어요. 매주 화요일 오전에 보내고, 밤 9시~아침 8시에는 보내지 않아요. 언제든 '그만 받기'를 누르면 바로 멈춰요.
> - **만 14세 이상이에요**
>
> **읽음 표시 안내**: 몇 번 읽으셨는지 세려고 이 휴대폰에 번호를 저장해요. 받으신 링크로 여시면 ○ 대표가 '읽으셨다'는 것을 볼 수 있어요. 원치 않으시면 ○ 대표에게 말씀해 주세요. [전문 보기]

**`/privacy` 첫 화면 3줄 요약 예시**
> 1. **무엇을** — 휴대폰 번호, 이메일, (원하시면) 이름과 관심 동네
> 2. **왜** — ○ 대표의 매거진을 보내고, 몇 번 읽으셨는지 알려 드리려고
> 3. **언제까지** — 그만 받으시면 30일 안에 지워요. 문의 ☎ ○○○-○○○○

---

## 5. 정보 구조 제안 (C7)

### 5-1. 현재 구조
- 독자 매거진 섹션 정의 **15개**([view-helpers.ts:84-100](file:///c:/Users/User/cre-dealcard/src/lib/magazine/view-helpers.ts#L84-L100)). 기본 순서(`ORDER_ALL`, 대상 미지정 시):
  `AI 브리핑 → 현장 노트 → 금주의 테마 → 주목 매물 → 투표 → 구독 → 중개사 프로필 → 시장 데이터 → 뉴스 → 경매 → 리포트 → 심리지수 → 수익 계산기 → 세무 클리닉 → 추천(레퍼럴)`
- 대표 데이터(운영 `magazine_issues`, 읽기 전용) 본문 글자 수: demo 2026-10-05 **1,993자**(뉴스 962자 = **48%**, 브리핑 686자 = 34%, 매물 91, 경매 91, 핵심지표 48). test-broker-kim 2026-10-04 1,909자(뉴스 50%). **현장 노트·세무 클리닉·시장 데이터 값은 비어 있습니다.**
- 60대 건물주 R의 핵심 관심(①내 건물 값 ②임대 시세 ③세금 ④매수자 동향)이 놓인 위치:

| 관심 | 해당 섹션 | 기본 순서 위치 | 대표 데이터 |
|:--|:--|:--:|:--|
| 내 건물 값 | 시장 데이터(실거래)·수익 계산기 | 8, 13 | 비어 있음 |
| 임대 시세 | 시장 데이터(임대 동향 '렌탈 인덱스') | 8 | 비어 있음 |
| 세금 | 세무 클리닉 | **14/15** | 비어 있음 |
| 매수자 동향 | 현장 노트·투표 | 2, 5 | 현장 노트 비어 있음 |
| (관심 낮음) 일반 뉴스 | 뉴스 | 9 | **전체 글자의 절반** |

- 행동 유도(CTA) 경쟁(재확인 U2-19): 하단 고정 바(전화·공유) / 투표 후 '매도 상담 문의하기' / 세무 '중개사에게 전화하기' / 구독 카드 / 프로필 '중개사 프로필 보기' / 추천 '전달하기' → **6종**. 구독 카드는 이미 구독해서 링크를 받은 사람에게도 5~6번째에 노출됩니다.
- 이메일은 '매거진 전체 보기'·'전화 상담' 2개로 적절합니다. 다만 섹션 이름이 뷰어와 다릅니다('현장 노트' vs '필드노트', '주목 매물' vs '주목 매물 하이라이트').

### 5-2. 제안
1. **건물주용 4블록 고정 순서**(`?target=seller` 기본값 또는 구독 시 '건물을 갖고 계신가요?' 질문으로 결정):
   ① **이번 주 한 줄 요약**(3문장 이내, 17px) → ② **우리 동네 시세**(실거래 3건 + 임대료 보합/상승/하락, 억·만원 표기) → ③ **세금 한 가지**(세무 클리닉을 위로) → ④ **○ 대표의 한마디 + [전화하기]** — 그 아래는 '더 보기'로 접습니다(뉴스·경매·리포트·심리지수·계산기).
2. 한 화면(360×780, 글꼴 1.3배)에 블록 1개만 보이게 하고, 블록마다 끝에 '다음: 세금 이야기 ↓'처럼 다음 안내를 붙입니다.
3. 데이터가 빈 섹션은 숨기고, 뉴스는 **최대 3건 + 제목만** 보여 줍니다(현재 전체 글자의 48%).
4. CTA는 **전화하기 1개를 고정**하고, 공유는 맨 끝, 구독 카드는 `sid`가 있는(이미 구독한) 방문자에게 숨깁니다.
5. 섹션 이름을 SSOT 한 곳에서 이메일·뷰어·에디터가 같이 쓰도록 맞춥니다.

---

## 6. 마찰 목록

### C-01 [F0] 운영 매거진 호 페이지 전부 500 (영어 오류 화면)
- 페르소나·단계: R — 카톡·이메일 링크 열기 / B — 공유 미리보기 확인
- 현상: `/magazine/demo/2026-10-05`, `/magazine/test-broker-kim/2026-10-04`(발행본 있음), `/2026-10-14`(미발행), `/2099-01-01`, `/not-a-date`, 없는 slug 모두 HTTP 500 "This page couldn't load · Reload". 크롤러 UA(`facebookexternalhit;kakaotalk-scrap`)도 500이고 og 메타가 없습니다. 아카이브·구독·privacy는 200입니다.
- 60대가 겪는 이유: 영어 + 'Reload'(68×32) 버튼 하나뿐 → "사기 링크였나?"(신뢰)·"내가 잘못 눌렀나?"(불안). 전화번호도 돌아갈 곳도 없습니다.
- 증거: `c4-unpub-missing-prod.png`, `c4-issue-kim-prod.png`, `c4-404-noslug-prod.png`, `og-meta.json`, `capture-results.json`
- 개선안: 즉시 원인 확인(배포 로그; 매거진 전용 error 경계도 렌더되지 않으므로 레이아웃·모듈 로드 단계가 의심됩니다). 한국어 `global-error`에 "잠시 후 다시 열어 주세요 [다시 열기] [담당 중개사에게 전화]"를 넣고, 운영 합성 모니터링(GET 200 + og:title 존재 확인)을 둡니다.
- 예상 효과: 링크 열기 성공률 0% → 정상화. 카톡 미리보기 복구.

### C-02 [F0] 전화번호만 넣은 구독자는 영원히 pending
- 페르소나·단계: R — 구독 신청 → 첫 수신
- 현상: 폼은 휴대폰 필수·이메일 '(선택)'이고 인라인 카드 기본값은 '카카오톡'입니다. 이메일이 없으면 확인 수단이 없고(알림톡 확인 템플릿 미승인), 재발송 기능도 없으며, 결과 화면에서 폼이 사라져 다시 입력할 수 없습니다. 같은 번호는 하루 3회로 제한됩니다.
- 60대가 겪는 이유: '(선택)'은 "안 써도 된다"로 읽힙니다. 성공 체크 아이콘과 "매주 화요일 발송됩니다"를 믿고 기다립니다. 작은 글씨의 '다시 신청해 주세요'는 읽지 못합니다.
- 증거: [SubscribeFormClient.tsx:89,178,184](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L89), [SubscribeCard.tsx:38](file:///c:/Users/User/cre-dealcard/src/components/magazine/SubscribeCard.tsx#L38), [consent-service.ts:253-254](file:///c:/Users/User/cre-dealcard/src/domain/magazine/consent-service.ts#L253-L254), 운영 DB pending 6/6·이메일 0/6
- 개선안: (단기) 카톡 확인 채널이 생기기 전까지 이메일을 **필수**로 하고 라벨을 "이메일 (확인 메일을 보내 드려요)"로 바꿉니다. 또는 중개인이 전화로 받은 동의를 기록하는 '대면 확인' 경로를 둡니다. pending 결과 화면은 폼을 유지한 채 이메일 칸만 강조합니다. (중기) 알림톡 확인 템플릿 승인 + 구독자 목록에 '확인 메일 다시 보내기' 버튼.
- 예상 효과: 확인 완료율 0% → 이메일 입력자 비율만큼 회복. "안 와요" 문의 제거.

### C-03 [F0] /privacy·/terms 본문 대비 1.36:1 + 무관한 하단 바
- 페르소나·단계: R — 동의 전 '처리방침 보기'
- 현상: 공개 레이아웃의 검은 배경(`rgb(9,9,11)`)에 `text-slate-800` 본문 → 대비 1.36:1(privacy 32개, terms 20개 요소), 시행일 2.62:1. 하단 고정 '홈·아고라·더보기'(12px)가 본문을 가립니다.
- 60대가 겪는 이유: 노안에는 사실상 빈 화면입니다. '아고라'는 무엇인지 모르는 메뉴입니다.
- 증거: `c6-privacy-prod.png`, `c6-privacy-prod-zoom13.png`, `contrast.json`, [legal-shared.tsx:40-43](file:///c:/Users/User/cre-dealcard/src/app/(public)/privacy/legal-shared.tsx#L40-L43)
- 개선안: `LegalPage`에 `bg-white` 밝은 배경을 강제하거나 매거진 전용 밝은 레이아웃으로 옮기고, 하단 바·테마 토글을 제외합니다. 본문 17px, 대비 7:1 이상. 첫 화면 '3줄 요약'(§4-3).
- 예상 효과: 동의 근거 문서 판독 가능. 법적 '쉽게 확인할 수 있는 방법' 리스크 해소.

### C-04 [F0] 발송 스위치가 꺼져 있으면 확인 메일 미발송 + 7일 뒤 만료 + 재발송 없음
- 페르소나·단계: R(이메일 입력자) — 확인 메일 대기 / B — 구독자 관리
- 현상: `MAGAZINE_SEND_ENABLED=false` 또는 dry-run이면 `SEND_DISABLED`/`DRY_RUN`으로 확인 메일을 보내지 않습니다. 확인 토큰 TTL은 7일이고, 재발송은 구독 POST에서만 일어납니다.
- 60대가 겪는 이유: "본인 확인이 끝나면"이라는 말만 있고, 본인이 무엇을 해야 하는지 모릅니다. 메일은 오지 않습니다.
- 증거: [consent-service.ts:547-548](file:///c:/Users/User/cre-dealcard/src/domain/magazine/consent-service.ts#L547-L548), [:42](file:///c:/Users/User/cre-dealcard/src/domain/magazine/consent-service.ts#L42), [subscribe/route.ts:35,99-112](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/subscribe/route.ts#L35), §2-4 시간순 표
- 개선안: 발송이 켜질 때 '확인 미완료 + 미만료/만료' 구독자에게 새 토큰으로 확인 메일을 일괄 재발송하는 잡을 만들고, 에디터에 '확인 메일 다시 보내기'를 둡니다. 구독 결과 문구는 운영 상태를 정직하게 안내합니다(제안표 #11).
- 예상 효과: 발송 개시 첫 주 확인 완료자 0 → 정상 전환.

### C-05 [F1] 알림톡 본문에 173·176자 무작위 토큰 링크 2개
- 페르소나·단계: R — 카톡 알림 수신
- 현상: `▶ 매거진 보기: https://www.credeal.net/magazine/demo/2026-10-13?sid=c2lkMS4z…JQEjIg`(173자), `수신거부: https://www.credeal.net/api/public/magazine/unsubscribe?t=djIu…EQ1XQ`(176자). 본문 623자 중 약 56%가 URL입니다.
- 60대가 겪는 이유: 스미싱 교육의 전형적 경고 신호('긴 영문 링크')입니다. 누르지 않거나 신고합니다.
- 증거: `kakao-real.txt`, [kakao-text.ts:37-39](file:///c:/Users/User/cre-dealcard/src/domain/magazine/templates/kakao-text.ts#L37-L39), [send-batch.ts:187-196](file:///c:/Users/User/cre-dealcard/src/domain/magazine/send-batch.ts#L187-L196)
- 개선안: 알림톡 **웹링크 버튼** 2개('이번 호 보기'·'그만 받기')로 옮겨 본문에서 URL을 없앱니다. 불가피하면 짧은 경로(`credeal.net/m/abc123`)와 서버 측 sid 매핑을 씁니다. 첫 줄은 사람 이름 + 관계("김영수 대표가 보내는").
- 예상 효과: 열람률 상승, 스팸 신고 감소.

### C-06 [F1] 알림톡 코드 본문 ≠ 심사 초안 + 광고성 알림톡 정책 미해결
- 페르소나·단계: B — 발송 준비 / R — 수신
- 현상: 코드 문안("이번 주 매거진이 도착했습니다", 요약 본문 포함)과 `weekly-issue.kakao.md` 초안("이번 주 시장 브리핑이 발행되었습니다", 헤드라인만)이 다릅니다. 알림톡은 원칙적으로 광고를 넣을 수 없어 친구톡·브랜드메시지 전환이 필요한데, 아직 미결입니다.
- 60대가 겪는 이유: (간접) 발송 실패 → C-02·C-04와 같은 "안 와요"로 이어집니다.
- 증거: [kakao-text.ts:36-39](file:///c:/Users/User/cre-dealcard/src/domain/magazine/templates/kakao-text.ts#L36-L39), [weekly-issue.kakao.md:9-16](file:///c:/Users/User/cre-dealcard/src/domain/magazine/templates/weekly-issue.kakao.md#L9-L16), [flash-issue.kakao.md:6](file:///c:/Users/User/cre-dealcard/src/domain/magazine/templates/flash-issue.kakao.md#L6)
- 개선안: 렌더러를 '승인 템플릿 + 변수 치환' 구조로 바꾸고, 문안을 md SSOT에서 생성해 일치 여부를 테스트합니다. 채널 유형(친구톡·브랜드메시지)을 결정합니다.
- 예상 효과: 발송 거부 리스크 제거.

### C-07 [F1] 이메일 발신자 'CRE Magazine'(영어) + (광고) 제목, 확인 메일에 연락처 없음
- 페르소나·단계: R — 받은편지함·확인 메일
- 현상: `EMAIL_FROM` 기본값이 `CRE Magazine <magazine@credeal.net>`(3곳)입니다. 구독 API가 `brokerContact`를 넘기지 않아 확인 메일의 '문의' 줄이 빠집니다.
- 60대가 겪는 이유: 모르는 영어 발신자 + '(광고)' → 스팸함으로 보내거나 지웁니다. 확인 메일이 진짜인지 물어볼 번호가 없습니다.
- 증거: [send-providers.ts:55](file:///c:/Users/User/cre-dealcard/src/domain/magazine/send-providers.ts#L55), [consent-service.ts:520](file:///c:/Users/User/cre-dealcard/src/domain/magazine/consent-service.ts#L520), [subscribe/route.ts:102-109](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/subscribe/route.ts#L102-L109), `optin.txt`
- 개선안: 발신자 이름을 `김영수 대표(강남빌딩중개법인)`처럼 구독자별 중개사로 지정하고(주소는 공용 + Reply-To 중개사), 확인 메일에 중개사 전화를 넣습니다. 제목은 "(광고) 김영수 대표 | …".
- 예상 효과: 받은편지함 도달률·개봉률 상승.

### C-08 [F1] 구독 결과 화면의 모순 문구 3중 표시
- 페르소나·단계: R — 신청 직후
- 현상: 초록 체크 + 토스트 "접수되었습니다" + "확인 후 발송이 시작됩니다. ○ 중개사의 매거진은 매주 화요일 발송됩니다." + (서버) "…발송되지 않습니다… 다시 신청해 주세요" + (노란 글씨) "…수신이 시작되지 않습니다". 이 모든 문구가 14px 이하로 한 카드에 들어 있습니다.
- 60대가 겪는 이유: 성공 신호(아이콘·큰 제목)만 기억하고 실패 안내는 놓칩니다.
- 증거: [SubscribeFormClient.tsx:105-124](file:///c:/Users/User/cre-dealcard/src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx#L105-L124), [SubscribeCard.tsx:116-125](file:///c:/Users/User/cre-dealcard/src/components/magazine/SubscribeCard.tsx#L116-L125), [subscribe-api.ts:27-28](file:///c:/Users/User/cre-dealcard/src/components/magazine/subscribe-api.ts#L27-L28)
- 개선안: pending이면 제목을 **"아직 끝나지 않았어요"**로 하고, 노란 경고 아이콘과 1·2단계 체크리스트, 한 가지 메시지만 표시합니다(제안표 #10·#12). 토스트는 삭제합니다.
- 예상 효과: 오해로 인한 이탈·"안 와요" 감소.

### C-09 [F2] OG 미리보기 판독성·누락
- 페르소나·단계: R — 카톡 대화방 링크 미리보기 / B — 공유
- 현상: 250px 축소 시 제목 외 모든 글자가 4px 이하입니다. 이미지에 영어 `CRE MAGAZINE`, 중개사 이메일이 들어갑니다. 구독·아카이브 페이지에는 og:image가 없습니다.
- 60대가 겪는 이유: 누가 보낸 무엇인지 미리보기만으로 알 수 없습니다.
- 증거: `c1-bubble-og-demo-20261005.png`, `og-meta.json`, [og-image-render.tsx:305-345](file:///c:/Users/User/cre-dealcard/src/lib/magazine/og-image-render.tsx#L305-L345)
- 개선안: OG에는 **제목(64px 이상) + "김영수 대표 · 강남" + 전화번호** 3요소만 남깁니다. 구독 페이지 전용 OG("김영수 대표의 매주 빌딩 소식 — 무료")를 추가합니다.
- 예상 효과: 링크 클릭 신뢰도 상승.

### C-10 [F1] 동의·추적 고지·처리방침 사이의 모순 + 작은 글씨
- 페르소나·단계: R — 동의
- 현상: 동의 ①은 "보유: 수신 해지 시까지", 처리방침은 "해지 30일 후 익명화"입니다. 추적 고지는 "구독자와 연결되어 표시될 수 있습니다", 처리방침은 "이름·연락처와 직접 연결하지 않는"입니다. 기간도 13개월과 365일로 섞여 있습니다. 동의는 13px, 고지는 12px입니다.
- 60대가 겪는 이유: 무슨 뜻인지 모르고 체크하게 됩니다. 나중에 "중개사가 내가 읽은 걸 안다"는 사실을 알게 되면 신뢰가 무너집니다.
- 증거: [ConsentCheckboxes.tsx:54](file:///c:/Users/User/cre-dealcard/src/components/magazine/ConsentCheckboxes.tsx#L54), [visitor-id.ts:22-23](file:///c:/Users/User/cre-dealcard/src/lib/magazine/visitor-id.ts#L22-L23), [privacy/page.tsx:45-46,68-73](file:///c:/Users/User/cre-dealcard/src/app/(public)/privacy/page.tsx#L45-L73), `c6-subscribe-prod.png`
- 개선안: §4-2·§4-3 구조. 보유기간·연결 여부를 한 상수에서 가져와 세 곳이 함께 쓰게 합니다. 법무 검토 시 이 모순 3건을 함께 넘깁니다.
- 예상 효과: 동의의 실질성 확보, 신뢰 상승.

### C-11 [F2] 수신거부: 범위 불명·취소 없음·되돌리기 없음
- 페르소나·단계: R — 그만 받기
- 현상: "이 중개사의 매거진"(무엇이 멈추는지 불명), '계속 받기' 버튼 없음, 완료 후 "중개인 명함의 구독 링크로". 본문 14px, 버튼 134×44.
- 60대가 겪는 이유: 떨리는 손으로 잘못 눌러도 되돌릴 수 없어 불안합니다.
- 증거: `c4-unsub-get-local.png`, `c4-unsub-done-local.png`, [unsubscribe/route.ts:153-162,251-256](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/unsubscribe/route.ts#L153-L162)
- 개선안: 제안표 #45~#47. 본문 17px, 버튼 52px, '계속 받을게요'(회색) 병치, 완료 화면에 '[다시 받기]'.
- 예상 효과: 실수 해지 복구 가능, 불안 감소.

### C-12 [F2] 이메일 글자 크기·줄바꿈·터치 영역
- 현상: 14px 미만 12개 요소(12~13px), 본문 14~15px. 한글이 단어 중간에서 끊깁니다. CTA 높이 44px, 수신거부 48×16.
- 증거: `c2-email-360.png`, `capture-results.json`, [email-template.tsx:98-176](file:///c:/Users/User/cre-dealcard/src/domain/magazine/email-template.tsx#L98-L176)
- 개선안: 본문 17px, 보조 15px, 면책·푸터 14px. 모든 td에 `word-break:keep-all`. 버튼 `padding:16px 28px`(높이 52px 이상), 수신거부는 테두리 버튼.
- 예상 효과: 돋보기 없이 판독 가능.

### C-13 [F2] '주목 매물'에 실거래일 혼재
- 현상: 이메일 '주목 매물'의 각 행에 '거래일 YYYY.MM.DD'가 붙습니다(실거래 사례인지 판매 중 매물인지 불명).
- 증거: [email-template.tsx:101-127](file:///c:/Users/User/cre-dealcard/src/domain/magazine/email-template.tsx#L101-L127), `c2-email-360.png`
- 개선안: '최근 팔린 건물(실거래)'과 '지금 나온 매물'로 섹션을 나눕니다.

### C-14 [F2] 이메일·카톡 본문의 약어에 풀이가 없음
- 현상: "Cap Rate는 3.2%"가 그대로 발송됩니다. 뷰어의 GlossaryTerm 같은 장치가 이메일·카톡 렌더러에는 없습니다.
- 증거: `email.txt`, `kakao-real.txt`, [kakao-text.ts:43](file:///c:/Users/User/cre-dealcard/src/domain/magazine/templates/kakao-text.ts#L43)
- 개선안: 렌더 시 용어 사전으로 첫 등장 약어를 'Cap Rate(연 수익률)'처럼 치환합니다. 품질 게이트에 '풀이 없는 약어' 경고를 추가합니다.

### C-15 [F2] 확인 2단 클릭 + 완료 후 다음 행동 없음
- 현상: 메일 버튼 → 페이지에서 다시 '구독 확인하기'를 눌러야 합니다(스캐너 대비 설계는 타당). 완료 페이지에 매거진 링크·중개사명·발송 요일이 없습니다. 만료 안내에 '다시 신청' 링크가 없습니다.
- 증거: `c3-confirm-form-prod.png`, [confirm/route.ts:65-91](file:///c:/Users/User/cre-dealcard/src/app/api/public/magazine/confirm/route.ts#L65-L91)
- 개선안: 메일에 "① 이 버튼 ② 열린 화면에서 한 번 더"를 번호로 표시합니다. 완료 페이지에 '[이번 호 먼저 보기]'와 요일·시간. 만료 페이지에 '[다시 신청하기]'.

### C-16 [F2] 오류 페이지에 행동 경로가 없음
- 현상: 확인·해지 오류 페이지에 링크·전화가 0개입니다. 카톡으로 받은 사람에게 "메일에 있는 링크"라고 안내합니다.
- 증거: `c3-confirm-badlink-prod.png`, `c4-unsub-badtoken-prod.png`
- 개선안: 모든 오류 페이지에 '담당 중개사에게 전화' 또는 '구독 페이지로' 1개 이상. 채널 중립 문구("받으신 카톡·메일").

### C-17 [F3] 말투·표기 혼재
- 현상: 두 말투가 섞인 파일 35개, '수신거부/수신 거부' 13/11, '중개사/중개인' 23/4, '현장 노트/필드노트', 날짜 표기 3종.
- 개선안: 독자 화면은 '~해요'체, 법률 문서는 '~합니다'체로 통일. 용어 사전(그만 받기·중개사·현장 노트) SSOT.

### C-18 [F3] 이모지 색으로 의미 전달
- 현상: 47건. 🟣🔵🟢 데이터 출처 배지, 🔥📈⏸️❄️⚪ 매수 온도(중개인 B).
- 개선안: 텍스트 라벨을 주(主)로 두고 이모지는 보조로만 씁니다.

### C-19 [F2] 정보 구조: 15섹션, 세금 14번째, 뉴스 48%, CTA 6종 (U2-19 재확인)
- 증거: [view-helpers.ts:103-114](file:///c:/Users/User/cre-dealcard/src/lib/magazine/view-helpers.ts#L103-L114), 운영 데이터 글자 수(§5-1)
- 개선안: §5-2 건물주 4블록 + 전화 CTA 1개 고정.

### C-20 [F3] 구독 페이지의 외래어·약어
- 현상: 'CRE', '시장 인텔리전스', '브리핑', '© … 인텔리전스 네트워크'. 칩 12px(📍서초구 등).
- 개선안: 제안표 #61·#62. 칩 15px.

### C-21 [F2] 중개인 에디터 용어 (B)
- 현상: 아웃리치·핫리드·에디션·체류·CTA 클릭·slug·dry-run·DPI·APP_BASE_URL·콘텐츠 스튜디오·독자 인텔리전스.
- 개선안: 제안표 #66~#75. 환경변수명은 화면에서 제거.

### C-22 [F3] 이메일 스타일 제거(최악 조건) 시 가로 스크롤
- 현상: 인라인 스타일이 모두 제거되면 `width="600"` 속성 때문에 608px 폭이 되고, 버튼은 밑줄 링크(높이 21px)로 바뀝니다.
- 증거: `c2-email-360-nostyle.png`
- 개선안: `width="100%"` + `max-width` 방식으로 바꾸고, 버튼 텍스트 앞에 '▶'를 붙여 텍스트만으로도 버튼임을 알게 합니다.

### C-23 [F3] OG 배지와 헤드라인의 모순
- 현상: "서울 상가 공실 확대, 선별 대응 시점"인데 배지는 "시장 상태: 매수 과열".
- 증거: `og-demo-20261005.png`
- 개선안: 품질 게이트에 시장 온도와 헤드라인 톤의 일관성 검사를 추가하거나, OG에서 배지를 빼는 방안.

### C-24 [F2] 개인정보 문의처 미확정
- 현상: `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL`이 없으면 "매거진 하단에 기재된 발행 중개사 연락처 또는 서비스 운영자 문의 채널"이 표시됩니다.
- 증거: [legal-shared.tsx:32-36](file:///c:/Users/User/cre-dealcard/src/app/(public)/privacy/legal-shared.tsx#L32-L36)
- 개선안: 전화·이메일을 명시합니다(제안표 #26).

---

### 부록: 산출 파일 (`scratch\ux60\channel\`)
- 렌더: `email.html`, `email.txt`, `email-minimal.html`, `kakao.txt`, `kakao-real.txt`, `kakao-ascii.txt`, `optin.html`, `optin.txt`, `unsub-get.html`, `unsub-done.html`
- 캡처: `c1-bubble-og-*.png`, `og-*.png`, `c2-email-*.png`, `c3-*.png`, `c4-*.png`, `c6-*.png`
- 수치: `capture-results.json`, `capture2-results.json`, `contrast.json`, `og-meta.json`, `copy-stats.json`, `copy-strings.json`
- 스크립트(재현용, 서브에이전트 scratch): `C:\Users\User\.gemini\antigravity\brain\7a41b9a7-0119-4a96-b734-bf1396e8fad4\scratch\` — `render-templates.ts`, `render-kakao-real.ts`, `render-unsub.ts`, `capture.cjs`, `capture2.cjs`, `contrast.cjs`, `copy-audit.cjs`, `q-published.mjs`, `q-volume.mjs`
- 안전: 앱 소스 수정 0건, git 조작 0건, 실제 발송 0건, 운영 쓰기 요청 0건(구독·확인·해지 POST 미실행), 분석 비콘 차단, LLM 호출 0회.
