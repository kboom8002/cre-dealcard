# CRE Pulse + Oiticle 운영 가이드

> **시스템**: CRE DealCard — 메타 인텔리전스 기반 인사이트 콘텐츠 엔진  
> **최종 업데이트**: 2026-05-30  
> **관련 코드**: `src/domain/pulse/`, `src/app/api/pulse/`, `src/app/api/oiticle/`

---

## 목차

1. [DB 마이그레이션 적용](#1-db-마이그레이션-적용)
2. [환경 변수 설정](#2-환경-변수-설정)
3. [Vercel Cron 스케줄 설정](#3-vercel-cron-스케줄-설정)
4. [첫 번째 펄스 수동 생성 (검증)](#4-첫-번째-펄스-수동-생성-검증)
5. [첫 번째 오이티클 수동 생성 (검증)](#5-첫-번째-오이티클-수동-생성-검증)
6. [중개인/벤더 기고 운영 흐름](#6-중개인벤더-기고-운영-흐름)
7. [관리자 콘텐츠 검토·게시 프로세스](#7-관리자-콘텐츠-검토게시-프로세스)
8. [모니터링 및 장애 대응](#8-모니터링-및-장애-대응)
9. [LLM 비용 추정 및 제어](#9-llm-비용-추정-및-제어)
10. [콘텐츠 SEO 확인 체크리스트](#10-콘텐츠-seo-확인-체크리스트)

---

## 1. DB 마이그레이션 적용

### 1.1 마이그레이션 파일 확인

```
supabase/migrations/00031_pulse_oiticle.sql
```

이 파일은 다음 테이블을 생성합니다:

| 테이블 | 용도 |
|:---|:---|
| `cre_pulses` | 주간/월간 시장 펄스 (시그널 스냅샷 + AI 요약) |
| `cre_oiticles` | 롱폼 인사이트 콘텐츠 (8유형) |
| `increment_oiticle_views()` | 조회수 카운터 RPC 함수 |

### 1.2 로컬 적용

```bash
# Supabase CLI가 설치된 경우
npx supabase db push

# 또는 직접 SQL 실행
npx supabase db reset  # ⚠️ 전체 리셋 (개발환경만)
```

### 1.3 프로덕션 적용

```bash
# Supabase Dashboard → SQL Editor에서 직접 실행
# 또는 CI/CD 파이프라인에서 자동 적용

npx supabase db push --db-url "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
```

### 1.4 적용 확인

Supabase Dashboard → Table Editor에서 확인:

```sql
-- 테이블 존재 확인
SELECT tablename FROM pg_tables WHERE tablename IN ('cre_pulses', 'cre_oiticles');

-- RLS 정책 확인
SELECT policyname, tablename FROM pg_policies 
WHERE tablename IN ('cre_pulses', 'cre_oiticles');

-- 인덱스 확인
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('cre_pulses', 'cre_oiticles');

-- RPC 함수 확인
SELECT proname FROM pg_proc WHERE proname = 'increment_oiticle_views';
```

> [!WARNING]
> `set_updated_at()` 트리거 함수가 이미 존재해야 합니다.  
> 기존 마이그레이션에서 생성된 공통 함수입니다. 없으면 다음 SQL을 먼저 실행하세요:
> ```sql
> CREATE OR REPLACE FUNCTION set_updated_at()
> RETURNS TRIGGER AS $$
> BEGIN
>   NEW.updated_at = now();
>   RETURN NEW;
> END;
> $$ LANGUAGE plpgsql;
> ```

---

## 2. 환경 변수 설정

### 2.1 필수 환경 변수

| 변수명 | 용도 | 설정 위치 | 예시 |
|:---|:---|:---|:---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | Vercel + `.env.local` | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | 서비스 롤 키 (RLS 우회) | Vercel (서버만) | `eyJhbG...` |
| `CRON_SECRET` | Cron API 인증 시크릿 | Vercel (서버만) | 임의 문자열 (32자 이상 권장) |

### 2.2 LLM API 키 (택 1)

| 변수명 | 모델 | 용도 |
|:---|:---|:---|
| `GEMINI_API_KEY` | Gemini 2.0 Flash | **권장** — 비용 효율적, 한국어 품질 우수 |
| `OPENAI_API_KEY` | GPT-4o-mini | 대안 — 이미 프로젝트에 설정 가능 |

> [!IMPORTANT]
> **우선순위**: `GEMINI_API_KEY`가 설정되면 Gemini 사용, 없으면 `OPENAI_API_KEY` 사용.  
> 둘 다 없으면 **Fallback 템플릿**으로 기본 요약이 생성됩니다 (LLM 품질 ❌).

### 2.3 Vercel에서 설정

```bash
# Vercel CLI로 설정
vercel env add CRON_SECRET production
vercel env add GEMINI_API_KEY production

# 또는 Vercel Dashboard → Settings → Environment Variables
```

### 2.4 로컬 개발 설정 (`.env.local`)

```env
# ── 기존 설정 (이미 있을 것) ──
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...

# ── 새로 추가 ──
CRON_SECRET=your-secure-random-string-at-least-32-chars
GEMINI_API_KEY=AIza...   # Gemini 사용 시 (선택)
```

---

## 3. Vercel Cron 스케줄 설정

### 3.1 `vercel.json` 생성/수정

프로젝트 루트에 `vercel.json` 파일을 생성하거나 기존 파일에 `crons` 섹션을 추가합니다:

```json
{
  "crons": [
    {
      "path": "/api/pulse/generate",
      "schedule": "0 0 * * 1"
    },
    {
      "path": "/api/oiticle/generate",
      "schedule": "0 1 1 * *"
    }
  ]
}
```

| Cron | 스케줄 | 설명 |
|:---|:---|:---|
| `/api/pulse/generate` | `0 0 * * 1` | **매주 월요일 00:00 UTC** (한국시간 09:00) |
| `/api/oiticle/generate` | `0 1 1 * *` | **매월 1일 01:00 UTC** (한국시간 10:00) |

> [!NOTE]
> Vercel Cron은 **UTC 기준**입니다. 한국시간(KST)은 UTC+9이므로:
> - 한국시간 09:00 = UTC 00:00
> - 한국시간 10:00 = UTC 01:00

### 3.2 Cron 인증

Vercel Cron은 자동으로 `Authorization: Bearer <CRON_SECRET>` 헤더를 포함합니다.  
**`CRON_SECRET`** 환경 변수가 설정되어 있어야 인증이 통과됩니다.

Vercel의 기본 동작:
- 환경 변수 `CRON_SECRET`이 설정되면 → Vercel이 Cron 호출 시 자동으로 해당 값을 Bearer 토큰으로 전달
- API Route에서 `req.headers.get("authorization")`으로 검증

### 3.3 월간 오이티클 Cron 요청 바디

월간 배치 생성을 위해, Cron 경로에 `?mode=monthly_batch` 파라미터를 사용하거나,
별도 Cron 전용 API를 만들 수 있습니다. 현재 구현에서는 POST body로 `mode`를 전달합니다.

Vercel Cron은 GET 요청만 지원하므로, 월간 배치용 GET 엔드포인트를 추가로 구현하거나,
외부 스케줄러(GitHub Actions, Supabase Edge Functions)를 사용합니다:

**방법 A — Vercel Cron용 GET 엔드포인트 추가** (권장):

```typescript
// src/app/api/oiticle/monthly-batch/route.ts
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const supabase = createServiceClient();
  const results = await generateMonthlyMarketOiticles(supabase);
  return NextResponse.json({ generated: results.length, oiticles: results });
}
```

**방법 B — GitHub Actions 스케줄러**:

```yaml
# .github/workflows/monthly-oiticle.yml
name: Monthly Oiticle Generation
on:
  schedule:
    - cron: '0 1 1 * *'  # 매월 1일 UTC 01:00

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST "${{ secrets.APP_BASE_URL }}/api/oiticle/generate" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            -d '{"mode": "monthly_batch"}'
```

---

## 4. 첫 번째 펄스 수동 생성 (검증)

### 4.1 로컬에서 테스트

```bash
# 개발 서버 실행
npm run dev

# 전체 권역 펄스 생성 (8개 권역)
curl -X POST http://localhost:3000/api/pulse/generate \
  -H "Authorization: Bearer your-cron-secret" \
  -H "Content-Type: application/json"
```

**예상 응답:**

```json
{
  "generated": 8,
  "pulses": [
    { "region": "gbd", "id": "uuid...", "pulseScore": 62.5 },
    { "region": "ybd", "id": "uuid...", "pulseScore": 55.0 },
    ...
  ],
  "message": "8개 권역 주간 펄스 생성 완료"
}
```

### 4.2 생성 확인

```bash
# 펄스 목록 조회
curl http://localhost:3000/api/pulse/generate?region=gbd&limit=5

# 브라우저에서 확인
# http://localhost:3000/pulse        ← 메인 그리드
# http://localhost:3000/pulse/gbd/2026-W22  ← 상세 페이지
```

### 4.3 Supabase Dashboard에서 확인

```sql
SELECT id, region, period_label, pulse_score, trend, 
       LEFT(summary_ko, 50) as summary_preview, 
       seo_slug, created_at
FROM cre_pulses
ORDER BY created_at DESC
LIMIT 10;
```

### 4.4 프로덕션 배포 후 첫 실행

```bash
# 프로덕션에서 첫 펄스 생성
curl -X POST https://dealcard.kr/api/pulse/generate \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

---

## 5. 첫 번째 오이티클 수동 생성 (검증)

### 5.1 AI 자동 생성 (단일)

```bash
# 시세 분석(MA) 오이티클 생성
curl -X POST http://localhost:3000/api/oiticle/generate \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "auto",
    "type": "MA",
    "region": "gbd",
    "topic": "2026년 5월 GBD 오피스 시세 동향"
  }'
```

**예상 응답:**

```json
{
  "oiticle": {
    "id": "uuid...",
    "slug": "ma-2026년-5월-gbd-오피스-시세-동향-gbd-2026-05-30",
    "title": "2026년 5월 GBD 오피스 시세 분석 리포트",
    "status": "draft"
  }
}
```

### 5.2 월간 배치 생성

```bash
curl -X POST http://localhost:3000/api/oiticle/generate \
  -H "Authorization: Bearer your-cron-secret" \
  -H "Content-Type: application/json" \
  -d '{"mode": "monthly_batch"}'
```

### 5.3 각 유형별 테스트

```bash
# 법률 가이드 (LG)
curl -X POST http://localhost:3000/api/oiticle/generate \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "auto",
    "type": "LG",
    "topic": "상가 임대차 보증금 반환 실전 가이드"
  }'

# 투자 분석 (IA)
curl -X POST http://localhost:3000/api/oiticle/generate \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "auto",
    "type": "IA",
    "region": "pangyo",
    "topic": "판교 테크밸리 오피스 투자 시나리오 분석"
  }'

# 트렌드 전망 (TR)
curl -X POST http://localhost:3000/api/oiticle/generate \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "auto",
    "type": "TR",
    "topic": "2026 하반기 CRE 시장 전망"
  }'
```

### 5.4 생성된 오이티클 게시

AI 자동 생성 오이티클은 `status: "draft"` 상태입니다.  
관리자 검토 후 `published`로 변경해야 공개됩니다:

```sql
-- 검토 완료 후 게시
UPDATE cre_oiticles 
SET status = 'published', published_at = now() 
WHERE id = 'UUID_HERE';
```

---

## 6. 중개인/벤더 기고 운영 흐름

### 6.1 기고 API

```bash
curl -X POST http://localhost:3000/api/oiticle/generate \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "contribute",
    "type": "CS",
    "authorType": "broker",
    "authorId": "broker-uuid",
    "authorName": "김철수 (강남 에이전시)",
    "title": "강남 중소형 빌딩 100억대 거래 분석",
    "bodyMd": "## 거래 개요\n\n이 거래는 2026년 3월...\n\n## 핵심 성공 요인\n\n- 적정 가격 산정...",
    "region": "gbd"
  }'
```

**기고 프로세스:**

```
기고 접수 → status: "review" → 관리자 검토 → status: "published"
                                        └→ status: "draft" (수정 요청)
```

### 6.2 기고 시 자동 처리

LLM이 자동으로 다음을 추출합니다:
- `excerpt` — 150자 요약
- `seoTitle` — 60자 SEO 제목
- `seoDescription` — 160자 메타 설명
- `tags` — 자동 태그 3~5개

### 6.3 기고 자격

| 작성자 유형 | `author_type` | 기고 가능 유형 | 비고 |
|:---|:---|:---|:---|
| 인증 중개인 | `broker` | CS, MA, IA, TR | 딜카드 자동 연결 |
| 인증 벤더 | `vendor` | LG, TX, PM, PS | 서비스카드 자동 연결 |
| 관리자 | `admin` | 전체 | 편집국 명의 |

---

## 7. 관리자 콘텐츠 검토·게시 프로세스

### 7.1 검토 대기 목록 조회

```sql
-- 검토 대기 중인 오이티클
SELECT id, oiticle_type, title, author_name, author_type, 
       created_at, LEFT(excerpt, 80) as preview
FROM cre_oiticles
WHERE status IN ('draft', 'review')
ORDER BY created_at DESC;
```

### 7.2 게시 승인

```sql
-- 단일 게시
UPDATE cre_oiticles 
SET status = 'published', published_at = now()
WHERE id = 'UUID';

-- 일괄 게시 (draft → published)
UPDATE cre_oiticles 
SET status = 'published', published_at = now()
WHERE status = 'draft' 
  AND oiticle_type = 'MA';  -- 예: 모든 시세분석 초안 일괄 게시
```

### 7.3 보관 처리

```sql
-- 오래된 콘텐츠 아카이브
UPDATE cre_oiticles 
SET status = 'archived'
WHERE published_at < now() - interval '1 year'
  AND oiticle_type = 'MA';  -- 1년 이상 된 시세 분석
```

### 7.4 검토 워크플로우 권장 순서

1. **AI 초안 생성** (매주/매월 Cron)
2. **관리자 대시보드**에서 `draft` 목록 확인
3. 본문 내용 검수 (특히 수치 정확성, 블라인드 처리 여부)
4. 면책 조항 존재 여부 확인
5. SEO 제목·메타 설명 검토
6. `published` 상태로 전환
7. sitemap 자동 반영 확인

---

## 8. 모니터링 및 장애 대응

### 8.1 헬스 체크

```bash
# 펄스 API 동작 확인 (GET)
curl -s https://dealcard.kr/api/pulse/generate?limit=1 | jq .

# 오이티클 API 동작 확인 (GET)
curl -s https://dealcard.kr/api/oiticle/generate?limit=1 | jq .
```

### 8.2 주요 에러 시나리오

| 증상 | 원인 | 대응 |
|:---|:---|:---|
| `LLM call failed` 로그 | API 키 만료/쿼타 소진 | Vercel Dashboard에서 키 갱신 |
| `Save failed: duplicate key` | 동일 주차 중복 생성 | 기존 펄스 확인 후 수동 삭제 또는 skip |
| `Unauthorized (401)` | `CRON_SECRET` 불일치 | Vercel 환경 변수 재확인 |
| 펄스 점수 전부 50.0 | 파이프라인 데이터 없음 | 최소한의 seed 데이터 필요 |
| 오이티클 본문 빈 문자열 | LLM API 응답 실패 | fallback 확인, 키/쿼타 점검 |

### 8.3 Vercel Cron 실행 로그

- **Vercel Dashboard** → Deployments → Functions → Cron Invocations 탭
- 또는 **Vercel CLI**: `vercel logs --follow`

### 8.4 중복 방지

현재 `seo_slug`에 UNIQUE 제약이 있어, 동일 주차에 같은 권역 펄스를 중복 생성하면 에러 발생.  
Cron이 중복 실행될 경우를 대비해 **upsert 로직** 추가를 고려:

```sql
-- 이미 존재하는지 확인 후 생성
SELECT id FROM cre_pulses 
WHERE region = 'gbd' AND period_label = '2026-W22';
```

---

## 9. LLM 비용 추정 및 제어

### 9.1 주간 펄스 비용 (8권역 × 매주)

| 모델 | 호출 횟수 | 토큰/호출 | 주간 비용 | 월간 비용 |
|:---|:---:|:---:|:---:|:---:|
| **Gemini 2.0 Flash** | 8 | ~1,500 | **~$0.01** | ~$0.04 |
| GPT-4o-mini | 8 | ~1,500 | ~$0.05 | ~$0.20 |

### 9.2 월간 오이티클 비용 (8권역 시세분석)

| 모델 | 호출 횟수 | 토큰/호출 | 비용 |
|:---|:---:|:---:|:---:|
| **Gemini 2.0 Flash** | 16 (본문+메타) | ~4,000 | **~$0.03** |
| GPT-4o-mini | 16 | ~4,000 | ~$0.15 |

### 9.3 연간 총 추정 비용

| 시나리오 | Gemini Flash | GPT-4o-mini |
|:---|:---:|:---:|
| 주간 펄스 (52주 × 8권역) | ~$0.50 | ~$2.40 |
| 월간 시세분석 (12월 × 8권역) | ~$0.36 | ~$1.80 |
| 수시 오이티클 (연 60편) | ~$0.30 | ~$1.50 |
| **연간 합계** | **~$1.16** | **~$5.70** |

> [!TIP]
> **Gemini 2.0 Flash가 압도적으로 비용 효율적**입니다.  
> 한국어 품질도 충분하므로 `GEMINI_API_KEY` 사용을 권장합니다.

### 9.4 비용 제어 설정

```
# Google Cloud Console → API & Services → Credentials
# 일일 할당량 설정: 100 requests/day (충분)

# OpenAI Dashboard → Usage → Limits
# 월간 한도 설정: $10/month (충분)
```

---

## 10. 콘텐츠 SEO 확인 체크리스트

### 10.1 배포 후 즉시 확인

- [ ] `/pulse` 페이지 200 OK 응답
- [ ] `/insight` 페이지 200 OK 응답
- [ ] `/sitemap.xml`에 `/pulse`, `/insight` URL 포함 확인
- [ ] `robots.txt`에 `Disallow` 없는지 확인

### 10.2 펄스 생성 후 확인

- [ ] `/pulse/gbd/2026-W22` 형태 URL 접근 가능
- [ ] 페이지 `<title>` 태그에 권역명 + 주차 포함
- [ ] `<meta name="description">` 300자 이내 요약 포함
- [ ] Schema.org `AnalysisNewsArticle` JSON-LD 포함
- [ ] `/sitemap.xml`에 해당 URL 자동 추가됨

### 10.3 오이티클 게시 후 확인

- [ ] `/insight/[slug]` 페이지 200 OK
- [ ] `<title>` 에 SEO 제목 포함
- [ ] OpenGraph 메타태그 포함 (`og:title`, `og:description`, `og:type: article`)
- [ ] Schema.org `Article` JSON-LD에 `headline`, `datePublished`, `author` 포함
- [ ] 관련 인사이트 링크 표시
- [ ] 태그 클릭 시 필터 동작

### 10.4 Google Search Console 모니터링

배포 2~4주 후:
- [ ] URL 검사 도구에서 `/pulse/gbd/2026-W22` 색인 확인
- [ ] "페이지" 보고서에서 pulse/insight URL 증가 추세
- [ ] "실적" 보고서에서 CRE 관련 키워드 노출 확인

### 10.5 내부 링크 네트워크 확인

```
오이티클 → 관련 펄스 (source_pulse_id)
오이티클 → 태그 필터 (/insight?tag=...)
펄스 메인 → 인사이트 메인 (cross-link)
인사이트 메인 → 펄스 메인 (cross-link)
Hub → 펄스 + 인사이트 (카테고리 카드)
```

---

## 부록: 참고 파일 맵

```
cre-dealcard/
├── supabase/migrations/
│   └── 00031_pulse_oiticle.sql          # DB 스키마
├── src/domain/pulse/
│   ├── oiticle-types.ts                  # 8유형 + 프롬프트 + 루브릭
│   ├── cre-signal-aggregator.ts          # 5축 시그널 집계
│   ├── pulse-generator.ts               # 주간 펄스 생성 (LLM)
│   └── oiticle-generator.ts             # 오이티클 생성 (LLM + 기고)
├── src/app/api/
│   ├── pulse/generate/route.ts           # POST: 생성, GET: 목록
│   └── oiticle/generate/route.ts         # POST: 생성/기고, GET: 목록
├── src/app/(public)/
│   ├── pulse/
│   │   ├── page.tsx                      # 펄스 메인 (8권역 그리드)
│   │   └── [region]/[period]/page.tsx    # 펄스 상세 (SEO 랜딩)
│   ├── insight/
│   │   ├── page.tsx                      # 인사이트 메인 (필터)
│   │   └── [slug]/page.tsx              # 인사이트 상세 (SEO 랜딩)
│   └── hub/page.tsx                      # Hub (📡 + 📝 카드 추가됨)
├── src/components/pulse/
│   ├── PulseCard.tsx                     # 펄스 카드 UI
│   └── OiticleCard.tsx                   # 오이티클 카드 UI
├── src/app/sitemap.ts                    # 펄스/오이티클 URL 포함
└── src/lib/schema-org.ts                 # pulsePage() + oiticlePage()
```
