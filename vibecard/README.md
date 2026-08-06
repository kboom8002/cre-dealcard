# VIBE AI 명함 시스템 (Fork)

> 본 디렉토리는 CRE DealCard 메인 시스템에서 분리된 VIBE AI 명함 코드입니다.
> 별도 프로젝트로 발전시킬 예정이며, 현재는 아카이브 상태입니다.

## 구조
- `components/` — React UI 컴포넌트 (VibeCard, VibeCardHero 등)
- `pages/` — Next.js 페이지 (브로커 관리, 공개 뷰)
- `api/` — API 라우트 (OG 이미지, 분석, 크론)
- `domain/` — 도메인 로직 (vibe-scorer)
- `lib/` — 유틸리티 (벡터 연산, 템플릿, 분석)
- `ai/` — AI 에이전트/프롬프트
- `migrations/` — DB 스키마 (참조용)

## 원본 위치 매핑
| Fork 경로 | 원본 경로 |
|---|---|
| components/ | src/components/vibe-card/ |
| pages/broker-manage/ | src/app/(broker)/broker/vibe-card/ |
| pages/public-view/ | src/app/(public)/vibe-card/[slug]/ |
| domain/ | src/domain/vibe/ |
| lib/ | src/lib/vibe/ |
