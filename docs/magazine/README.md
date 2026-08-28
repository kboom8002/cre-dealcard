# 📰 모닝 인텔리전스 & 매거진 시스템 감사 문서

> **감사 일시**: 2026-08-28  
> **대상 범위**: Morning Intelligence Hub + Mobile Magazine + Cross-Channel Analytics  
> **작성 근거**: 코드베이스 정밀 분석 (src/domain, src/app/api, src/components, supabase/migrations)

---

## 문서 목차

| # | 문서 | 내용 |
|---|------|------|
| 01 | [모닝 인텔리전스 아키텍처](./01-morning-intelligence-architecture.md) | 3대 운영 모드, 데이터 수집 파이프라인, LLM 브리핑 생성, 복합 심리지수 산출 |
| 02 | [매거진 시스템 아키텍처](./02-magazine-system-architecture.md) | 에디션 생성, 품질 게이트, 배포 레일, 구독자 관리, 리더 분석 |
| 03 | [API 레퍼런스](./03-api-reference.md) | 모든 관련 엔드포인트 (인증, 공개, Cron) 상세 명세 |
| 04 | [데이터베이스 스키마](./04-database-schema.md) | 16개 핵심 테이블, 마이그레이션 이력, RLS 정책 |
| 05 | [데이터 플로우 & 통합 아키텍처](./05-data-flow-and-integration.md) | 전체 파이프라인 흐름도, 크로스채널 리드 스코어링, 피드백 루프 |
| 06 | [파일 인벤토리](./06-file-inventory.md) | 기능별 전체 파일 목록 (도메인, API, UI, 훅, 테스트, 문서) |

---

## 시스템 핵심 개요

```
┌────────────────────────────────────────────────────────────────────┐
│                    CRE DealCard 인텔리전스 플라이휠                  │
│                                                                    │
│  정보 수집          가공             제안           배포    분석    │
│  (Morning Intel) → (Magazine Editor) → (Mobile IM) → (Outreach) → │
│       ↑                                                     │      │
│       └─────────── 피드백 루프 (Analytics) ──────────────────┘      │
└────────────────────────────────────────────────────────────────────┘
```

### 모닝 인텔리전스 (Morning Intelligence Hub)
CRE 1인 중개사가 **매일 아침 08:00 KST** 하나의 대시보드에서 권역별 시장 동향, 실거래, 경매, 임대 시세, 투자 심리 지수를 확인하고, AI 브리핑과 고객 상담 화법을 활용하는 인텔리전스 엔진.

### 모바일 매거진 (Mobile Magazine)
모닝 인텔리전스에서 수집·가공된 정보와 브로커의 딜카드·모바일 IM을 결합하여, 매수자/투자자에게 **카카오톡 알림톡** 및 **웹 뷰어**로 전달하는 아웃바운드 CRM & 브랜딩 미디어 채널.

### 크로스채널 분석 (Cross-Channel Analytics)
Vibe Card → Magazine → Mobile IM 3채널 터치포인트를 통합 추적하여 **핫리드(≥80점)** 자동 감지 및 브로커 실시간 알림.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router), React 19, TypeScript 5 |
| 데이터베이스 | Supabase (PostgreSQL), RLS |
| AI/LLM | OpenAI (gpt-4o-mini, gpt-4o), AI SDK |
| 알림 | Solapi 카카오 알림톡 |
| 배포 | Vercel (Cron, Serverless Functions) |
| 테스트 | Vitest, Playwright |

---

## 관련 기존 문서

- [61-morning-intelligence-hub-guide.md](../61-morning-intelligence-hub-guide.md)
- [66-integrated-magazine-intelligence-user-guide-jsrealty.md](../66-integrated-magazine-intelligence-user-guide-jsrealty.md)
- [Mobile-Magazine-System-Architecture-and-Guide.md](../Mobile-Magazine-System-Architecture-and-Guide.md)
- [personalized-magazine-standard-spec.md](../personalized-magazine-standard-spec.md)
- [credal_v3/SDD-magazine.md](../credal_v3/SDD-magazine.md)
