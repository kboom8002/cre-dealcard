# 🔑 API 키 발급 및 환경변수 설정 완전 가이드

> **작성 기준**: 2026년 6월 | Phase 0~1 Mobile IM 기능 기준  
> **대상 독자**: 발급 경험이 없는 비전공자도 혼자 완료할 수 있도록 작성

이 가이드를 완료하면 **API 키 없이 Mock 데이터로만 동작하던 시스템**이  
**실제 공공 데이터 + AI 분석**이 결합된 풀스펙 Mobile IM 생성기로 전환됩니다.

---

## 📋 전체 환경변수 체크리스트

| 우선순위 | 환경변수명 | 발급처 | 필수/선택 | 키 없을 때 |
|:---:|---|---|:---:|---|
| 🔴 **필수** | `OPENAI_API_KEY` | OpenAI | 필수 | AI 생성 전면 중단 |
| 🔴 **필수** | `NEXT_PUBLIC_SUPABASE_URL` | Supabase | 필수 | DB 연결 불가 |
| 🔴 **필수** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | 필수 | DB 연결 불가 |
| 🔴 **필수** | `SUPABASE_SERVICE_ROLE_KEY` | Supabase | 필수 | 서버 DB 작업 불가 |
| 🟠 **핵심** | `DATA_GO_KR_API_KEY` | data.go.kr | 핵심 | 건물/공시지가/실거래 Mock |
| 🟠 **핵심** | `JUSO_CONFIRM_KEY` | juso.go.kr | 핵심 | 주소 정규화 Mock |
| 🟠 **핵심** | `KAKAO_REST_API_KEY` | developers.kakao.com | 핵심 | 지도/POI Mock |
| 🟡 **권장** | `NEXT_PUBLIC_KAKAO_MAP_KEY` | developers.kakao.com | 권장 | 지도 렌더링 비활성화 |
| 🟡 **권장** | `AI_IM_MODEL` | — | 권장 | gpt-4o 자동 사용 |
| 🟢 **선택** | `REGISTRY_API_KEY` | 대법원 | 선택 | 수동 확인 메시지 표시 |
| 🟢 **선택** | `VWORLD_API_KEY` | vworld.kr | 선택 | 지적도 시각화 비활성화 |
| 🟢 **선택** | `MOLIT_API_KEY` | data.go.kr | 선택 | `DATA_GO_KR_API_KEY`로 대체 |

---

## 1️⃣ OpenAI API 키 (`OPENAI_API_KEY`)

**용도**: Mobile IM 7개 섹션 서사 생성, 투자 메모 파싱, 다국어 번역  
**현재 사용 모델**: `gpt-4o` (기본값) → 추후 `claude-sonnet-4-5`로 교체 예정  
**없을 때**: AI 서사 생성 전면 중단, 프리미엄 템플릿 폴백으로만 동작

### 발급 절차

1. **[platform.openai.com](https://platform.openai.com/)** 접속 후 로그인 (Google 계정 가능)
2. 좌측 사이드바 → **API Keys** 클릭
3. **[+ Create new secret key]** 클릭
   - Name: `cre-dealcard-prod` (구분용)
   - Project: Default project 사용 가능
4. 생성된 키(`sk-...`로 시작하는 문자열)를 **즉시 복사** (창 닫으면 다시 볼 수 없음)
5. `.env.local`에 붙여넣기

### 요금 및 예산 설정 (중요)

- **요금**: GPT-4o 기준 입력 1M 토큰당 $2.50 / 출력 1M 토큰당 $10.00
- **Mobile IM 1건 생성 예상 비용**: 약 $0.03~0.08 (7섹션 × 900 토큰)
- **예산 한도 설정 권장** (초과 시 자동 차단):
  1. platform.openai.com → **Settings → Billing**
  2. **[Set usage limit]** → 월 한도 입력 (예: $20)

```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
AI_DEFAULT_MODEL=gpt-4o
AI_IM_MODEL=gpt-4o
```

> [!NOTE]
> `AI_IM_MODEL`을 별도로 설정하면 Mobile IM 전용 모델을 분리 관리할 수 있습니다.  
> Claude로 교체 시 `AI_IM_MODEL=claude-sonnet-4-5`로만 변경하면 됩니다.

---

## 2️⃣ Supabase 키 (`SUPABASE_*`)

**용도**: 사용자 인증, 건물 데이터 저장, Mobile IM 문서 관리, 열람 이벤트 추적  
**없을 때**: 앱 전체가 DB 연결 실패로 부팅 불가

### 발급 절차

1. **[supabase.com](https://supabase.com/)** 접속 → **Start your project** (GitHub 로그인 권장)
2. **[New project]** 클릭
   - Organization: 개인 계정 선택
   - **Project name**: `cre-dealcard`
   - **Database Password**: 강력한 비밀번호 생성 후 **반드시 별도 저장**
   - **Region**: `Northeast Asia (Seoul)` 선택 (ap-northeast-2)
3. 프로젝트 생성 후 대시보드 진입 (약 2분 소요)
4. 좌측 사이드바 → **Project Settings → API** 탭 클릭
5. 아래 3개 값을 복사:

| 항목 | 위치 | 환경변수명 |
|---|---|---|
| Project URL | `https://xxxx.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` |
| anon public key | `eyJ...` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role secret key | `eyJ...` | `SUPABASE_SERVICE_ROLE_KEY` |

> [!CAUTION]
> `SUPABASE_SERVICE_ROLE_KEY`는 DB 전체 접근 권한을 가집니다.  
> **절대 공개 GitHub에 커밋하지 마세요.** `.gitignore`에 `.env.local`이 포함되어 있는지 확인하세요.

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
```

---

## 3️⃣ 공공데이터포털 API 키 (`DATA_GO_KR_API_KEY`)

**용도**: 건축물대장, 개별공시지가, 토지이용계획, 실거래가 — **하나의 키로 4개 API 사용**  
**없을 때**: 모든 공공데이터 Mock 데이터로 대체 (주소 기반 추정값 반환)

### 발급 절차

1. **[data.go.kr](https://www.data.go.kr/)** 접속 → 우측 상단 **[회원가입]**
   - 개인 회원으로 가입 (사업자 등록 불필요)
   - 이메일 인증 후 로그인

2. 검색창에 아래 4개를 **각각 검색**하여 **[활용신청]** 클릭:

   | 검색어 | 사용 목적 | 신청 후 승인 |
   |---|---|:---:|
   | `국토교통부 건축물대장정보 서비스` | 연면적, 층수, 구조, 준공일 | 즉시 자동승인 |
   | `국토교통부 개별공시지가정보 서비스` | ㎡당 공시지가 → 평당가 환산 | 즉시 자동승인 |
   | `국토교통부 토지이용계획정보 서비스` | 용도지역, 건폐율/용적률 상한 | 즉시 자동승인 |
   | `상업업무용 부동산 매매 실거래가 자료` | 주변 실거래 비교 사례 | 즉시 자동승인 |

   > **활용 목적 기재 예시**:  
   > `상업용 부동산 투자 설명서(IM) 자동 생성 플랫폼 개발. 건물 기본 제원, 공시지가, 토지 규제 정보를 실시간으로 수집하여 브로커와 투자자에게 데이터 기반 분석 자료를 제공합니다.`

3. 인증키 확인:
   - 우측 상단 프로필 → **[마이페이지] → [개발계정]**
   - 목록에서 신청한 API 클릭 → **[일반 인증키 (Decoding)]** 복사
   
   > [!IMPORTANT]
   > 반드시 **Decoding** 키를 사용하세요. Encoding 키는 URL 인코딩된 형태로 Next.js 환경변수에서 오작동합니다.

4. 4개 API의 인증키가 **동일**합니다 (포털 계정 1개 = 1개의 마스터 키).

```
DATA_GO_KR_API_KEY=발급받은_디코딩_키_여기에_붙여넣기
```

---

## 4️⃣ 도로명주소 API 키 (`JUSO_CONFIRM_KEY`)

**용도**: 브로커가 입력한 자유형식 주소 → 표준 도로명 주소 + PNU 코드 변환  
**PNU 코드**는 공공데이터 API 호출의 핵심 파라미터입니다  
**없을 때**: 주소 해석 Mock (서울시 역삼동 기준 테스트 데이터 반환)

### 발급 절차

1. **[juso.go.kr (도로명주소 개발자센터)](https://business.juso.go.kr/)** 접속
2. 상단 메뉴 **[오픈API] → [도로명주소 API 신청]** 클릭
3. **[바로신청]** 버튼 클릭 (비회원 신청 가능)
4. 정보 입력:
   - **신청 구분**: 오픈 API (인터넷망)
   - **신청 용도**: 시스템 개발 및 주소 데이터 연동
   - **서비스 URL**: `http://localhost:3000` (개발용, 이후 배포 도메인 추가 가능)
5. 제출 즉시 **인증키(Confirm Key)** 발급 — 화면에 표시됨, 이메일로도 전송

```
JUSO_CONFIRM_KEY=발급받은_인증키_여기에_붙여넣기
```

---

## 5️⃣ 카카오 API 키 (`KAKAO_REST_API_KEY` / `NEXT_PUBLIC_KAKAO_MAP_KEY`)

**용도**:
- `KAKAO_REST_API_KEY`: 서버사이드 — 인근 지하철역 거리·도보 분 계산, 주변 카페·편의점·음식점 수 조회, 카카오 Static Map 이미지 URL 생성
- `NEXT_PUBLIC_KAKAO_MAP_KEY`: 클라이언트사이드 — 웹 지도 렌더링 (Map SDK)

**없을 때**: POI 데이터 Mock, 지도 이미지 placeholder로 대체

### 발급 절차

1. **[developers.kakao.com](https://developers.kakao.com/)** 접속 → **카카오 계정으로 로그인**
2. 우측 상단 **[내 애플리케이션] → [애플리케이션 추가하기]**
   - **앱 이름**: `CRE Mobile IM` (자유 입력)
   - **사업자명**: 개인 또는 회사명 (검증 없음)
   - **[저장]** 클릭
3. 생성된 앱 클릭 → **[앱 키]** 탭에서 2개 복사:
   - **JavaScript 키** → `NEXT_PUBLIC_KAKAO_MAP_KEY`에 사용
   - **REST API 키** → `KAKAO_REST_API_KEY`에 사용

4. **⚠️ 플랫폼 등록 (필수 — 이 단계를 빠뜨리면 지도가 표시되지 않습니다)**
   - 좌측 메뉴 **[플랫폼] → [Web 플랫폼 등록]**
   - 아래 도메인을 줄바꿈으로 구분해서 모두 입력:
     ```
     http://localhost:3000
     http://localhost:3005
     https://cre-dealcard.vercel.app
     ```
   - **[저장]** 클릭

5. **Static Map API 사용 설정**:
   - 좌측 메뉴 **[카카오맵] → [활성화 설정]** → **ON** 으로 전환
   - (별도 신청 없이 REST API 키와 동일하게 사용됨)

```
NEXT_PUBLIC_KAKAO_MAP_KEY=발급받은_JavaScript_키
KAKAO_REST_API_KEY=발급받은_REST_API_키
```

---

## 6️⃣ 대법원 등기정보광장 API (`REGISTRY_API_KEY`) — 선택

**용도**: 건물의 근저당·가압류·전세권 등 권리 관계 자동 조회  
**없을 때**: IM 리스크 섹션에 "수동 확인 필요" 안내 문구 자동 삽입 (시스템 중단 없음)

### 발급 절차

> [!WARNING]
> 등기정보광장 Open API는 **법원 공공데이터 포털을 통한 별도 계약**이 필요하며,  
> 개인 개발자보다는 **법인/기업 단위 신청**이 승인에 유리합니다.

1. **[iros.go.kr (인터넷 등기소)](https://www.iros.go.kr/)** 접속
2. 하단 **[Open API 서비스]** 또는 **[개발자 포털]** 링크 클릭
3. API 이용 신청서 작성 및 제출 (심사 후 승인, 평균 3~5 영업일 소요)
4. 승인 후 발급된 API 키를 아래에 입력:

```
REGISTRY_API_KEY=발급받은_등기_API_키
REGISTRY_API_ENDPOINT=https://data.iros.go.kr/openapi/v1/building/encumbrance
```

> [!NOTE]
> API 키가 없어도 시스템은 정상 동작합니다. IM 리스크 체크 섹션에  
> "⚠️ 등기 현황 수동 확인 필요 — 실사(DD) 과정에서 등기부등본 최신본을 반드시 확인하세요."  
> 메시지가 자동으로 삽입됩니다.

---

## 7️⃣ V-World API 키 (`VWORLD_API_KEY`) — 선택

**용도**: 국토지리정보원 공간정보 오픈플랫폼 — 용도지역 지적도 오버레이 시각화  
**없을 때**: 지적도 레이어 비활성화 (나머지 지도 기능 정상 동작)

### 발급 절차

1. **[vworld.kr](https://www.vworld.kr/)** 접속 → 회원가입/로그인
2. **[API 인증키 발급]** → 신청서 작성 (즉시 승인)
3. 발급된 키 복사:

```
VWORLD_API_KEY=발급받은_VWorld_키
```

---

## 8️⃣ Claude API 키 (`ANTHROPIC_API_KEY`) — 향후 전환 예정

현재는 GPT-4o를 사용하며, **향후 Claude Sonnet으로 교체** 예정입니다.  
아래 방법으로 미리 발급해 두면 `AI_IM_MODEL` 환경변수만 변경하면 즉시 전환됩니다.

### 발급 절차

1. **[console.anthropic.com](https://console.anthropic.com/)** 접속 → 회원가입
2. 좌측 **[API Keys] → [+ Create Key]**
   - Name: `cre-dealcard`
3. 발급된 키(`sk-ant-...`) 복사

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx

# 전환 시: AI_IM_MODEL=claude-sonnet-4-5 로 변경
```

---

## 📄 최종 `.env.local` 완성 템플릿

아래를 `c:/Users/User/cre-dealcard/.env.local` 파일에 붙여넣고  
발급받은 실제 키로 값을 교체하세요.

```env
# ================================================================
# 🔑 CRE DEALCARD — 환경변수 설정 파일
# 작성 기준: Phase 0~1 Mobile IM
# ⚠️ 이 파일을 절대 GitHub에 커밋하지 마세요 (.gitignore 확인)
# ================================================================

# ── 1. Supabase (필수) ──────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx

# ── 2. OpenAI (필수) ────────────────────────────────────────────
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
AI_DEFAULT_MODEL=gpt-4o
AI_IM_MODEL=gpt-4o

# ── 3. 공공데이터포털 — data.go.kr (핵심) ──────────────────────
# 건축물대장 + 개별공시지가 + 토지이용계획 + 실거래가 공용
DATA_GO_KR_API_KEY=디코딩키_여기에_붙여넣기

# 국토부 실거래 전용 (없으면 DATA_GO_KR_API_KEY 자동 사용)
MOLIT_API_KEY=

# ── 4. 도로명주소 API — juso.go.kr (핵심) ─────────────────────
JUSO_CONFIRM_KEY=인증키_여기에_붙여넣기

# ── 5. 카카오 (핵심) ────────────────────────────────────────────
# REST API 키 — 서버사이드 POI 검색 + Static Map
KAKAO_REST_API_KEY=REST_API_키_여기에_붙여넣기
# JavaScript 키 — 클라이언트 지도 렌더링
NEXT_PUBLIC_KAKAO_MAP_KEY=JavaScript_키_여기에_붙여넣기

# ── 6. 앱 기본 URL ─────────────────────────────────────────────
APP_BASE_URL=http://localhost:3000

# ── 7. 등기정보광장 (선택) ─────────────────────────────────────
# 없으면 IM 리스크 섹션에 "수동 확인 필요" 메시지 자동 삽입
REGISTRY_API_KEY=
REGISTRY_API_ENDPOINT=https://data.iros.go.kr/openapi/v1/building/encumbrance

# ── 8. V-World 지적도 (선택) ───────────────────────────────────
VWORLD_API_KEY=

# ── 9. Anthropic Claude (향후 전환 예정) ────────────────────────
# AI_IM_MODEL=claude-sonnet-4-5 로 변경 시 활성화
ANTHROPIC_API_KEY=
```

---

## 🚀 설정 후 검증 방법

`.env.local` 작성 완료 후 아래 순서로 검증하세요:

```powershell
# 1. 개발 서버 재시작
cd c:/Users/User/cre-dealcard
npm run dev

# 2. 브라우저에서 Demo 빌딩 Mobile IM 열람
# http://localhost:3000/im-lite/demo-gangnam-office

# 3. API 상태 확인 (선택)
# 브라우저 개발자도구 → Network 탭에서 API 응답 확인
# 각 공공 API 호출 성공 시 "mock: false" 가 응답에 포함됨
```

### 데이터 활성화 확인 포인트

| 확인 항목 | Mock 상태 | 실데이터 활성화 후 |
|---|---|---|
| IM §1 자산 개요 | 추정 면적·층수 | 건축물대장 정확한 수치 |
| IM §4 수익 분석 | 공시지가 "-" | 실제 ㎡당 공시지가 표시 |
| IM §2 입지 분석 | "인근 교통 양호" | "🚇 역삼역 도보 3분 (약 210m)" |
| IM §5 리스크 | 용적률 추정 | 실제 건폐율/용적률 + 법정 상한 |
| 실거래 비교 | 예시 데이터 | 해당 시군구 최근 거래 사례 |

---

## 🔗 발급 링크 요약

| 서비스 | 발급 URL | 소요 시간 |
|---|---|:---:|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | 즉시 |
| Supabase | [supabase.com/dashboard](https://supabase.com/dashboard) | 2분 |
| 공공데이터포털 | [data.go.kr](https://www.data.go.kr/) | 즉시 자동승인 |
| 도로명주소 API | [business.juso.go.kr](https://business.juso.go.kr/) | 즉시 |
| 카카오 개발자 | [developers.kakao.com](https://developers.kakao.com/) | 즉시 |
| V-World | [vworld.kr](https://www.vworld.kr/) | 즉시 |
| 대법원 등기정보광장 | [iros.go.kr](https://www.iros.go.kr/) | 3~5 영업일 |
| Anthropic Claude | [console.anthropic.com](https://console.anthropic.com/) | 즉시 |
