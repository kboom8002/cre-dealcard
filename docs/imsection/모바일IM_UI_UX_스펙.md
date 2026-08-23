# CREDEAL 모바일 IM 뷰어 — UI/UX 스펙

> 작성일: 2026-08-23
> 근거: `mobile-im-viewer.tsx`, `hero-card.tsx`, `page.tsx`, `fetch-im-data.ts`, `globals.css`, `tailwind.config.ts`

---

## A. 화면 구조 (세로 플로우)

```
┌──────────────────────────────────────┐
│  Sticky Top Bar                      │  ← py-3, px-4
│  [보관함] [IM Lite 뱃지] [공유] [···] │
│  ○ ○ ● ○ ○ ○ ○  (Progress Dots)     │
├──────────────────────────────────────┤
│                                      │
│  Hero Header                         │  ← pt-8, pb-6
│  [건물타입 뱃지] [지역] [검증 뱃지]  │
│  ₩ 가격 밴드 (Price Band)            │
│  서브타이틀                           │
│                                      │
├──────────────────────────────────────┤
│  Hero Card (2×2 그리드)              │
│  ┌────────┬────────┐                 │
│  │ Cap Rate│ 매각가  │                 │
│  ├────────┼────────┤                 │
│  │ 대지비중│ WALE   │                 │
│  └────────┴────────┘                 │
├──────────────────────────────────────┤
│  Photo Gallery (가로 스크롤)          │
│  [사진1] [사진2] [지도] ───▶         │
├──────────────────────────────────────┤
│  Section Cards (아코디언)            │
│  ▸ 1. 자산 개요                      │
│  ▾ 2. 입지 분석     ← 펼침 상태      │
│    (마크다운 렌더링 영역)             │
│  ▸ 3. 임대 현황                      │
│  ─── CTA: 관심 표시 ───              │  ← index ≥ 2 이후 노출
│  ▸ 4. 수익 분석                      │
│  🔒 5. Pro 전용 (블러 프리뷰)        │
│  ▸ 6. 리스크                         │
│  ▸ 7. 투자 논거                      │
│  ▸ 8. 진행 절차                      │
│  ─── CTA: 프라이빗 IM 신청 ───      │
├──────────────────────────────────────┤
│  담당 중개인 정보                     │
│  면책 조항                            │
├──────────────────────────────────────┤
│  pb-24 (하단 바 공간 확보)            │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│  Floating Action Bar (하단 고정)     │
│  [공유] [PDF] [PPTX] [모드전환] [신청]│
└──────────────────────────────────────┘
```

### 레이아웃 규격

| 항목 | 값 | 근거 |
|---|---|---|
| 최대 콘텐츠 폭 | `max-w-2xl` (672px) | `mobile-im-viewer.tsx:1429` |
| 좌우 패딩 | `px-4` (16px) | 동일 |
| 하단 여백 | `pb-24` (96px) | Floating Action Bar 공간 확보 |
| Top Bar 패딩 | `py-3 px-4` (12px × 16px) | L1377 |
| Hero Header | `pt-8 pb-6` (32px × 24px) | L1431 |
| 반응형 전략 | Mobile-First, `sm:` 브레이크포인트만 사용 | 전체 |

---

## B. 컴포넌트 트리

```
page.tsx (서버 컴포넌트, SSR)
 └─ MobileIMViewer (L1226, CSR 'use client')
     ├─ Sticky Top Bar (L1377-1427)
     │   ├─ Progress Dots
     │   └─ ShareButton (L833)
     ├─ Hero Header (L1431-1498)
     ├─ HeroCard (hero-card.tsx:29)
     │   └─ MetricCell (hero-card.tsx:268)
     ├─ PhotoGallery (L244)
     │   ├─ KakaoStaticMap (L174)
     │   └─ Lightbox (L390)
     ├─ SectionCard[] (L478) × 7~8개
     │   ├─ MarkdownRenderer (L642)
     │   ├─ InlineMarkdown (L758)
     │   └─ TableFromLines (L791)
     ├─ CTA 영역 (L1548, L1579)
     ├─ 중개인 정보 + 면책 (L1622-1685)
     ├─ FloatingActionBar (L884)
     └─ IMInquiryBottomSheet (L24)
```

### 컴포넌트 상세

| 컴포넌트 | 시작 라인 | 역할 |
|---|---|---|
| `IMInquiryBottomSheet` | L24 | 프라이빗 IM 신청 바텀시트 모달 |
| `KakaoStaticMap` | L174 | OSM 3×3 타일 정적 지도 + 카카오맵 링크 오버레이 |
| `PhotoGallery` | L244 | 가로 스크롤 갤러리 + 라이트박스 팝업 |
| `SectionCard` | L478 | 아코디언 섹션 (접힘/펼침/잠금) |
| `MarkdownRenderer` | L642 | 자체 마크다운 → JSX 파서 (외부 라이브러리 미사용) |
| `InlineMarkdown` | L758 | 인라인 마크다운 (**굵게**, _기울임_) 파서 |
| `TableFromLines` | L791 | 마크다운 표 → HTML `<table>` 변환 |
| `ShareButton` | L833 | Web Share API / 클립보드 복사 |
| `FloatingActionBar` | L884 | 하단 고정 CTA 바 (공유/PDF/PPTX/모드전환) |
| `MobileIMViewer` | L1226 | 최상위 뷰어 상태 제어 컴포넌트 |
| `HeroCard` | hero-card.tsx:29 | 핵심 투자 지표 2×2 그리드 |
| `MetricCell` | hero-card.tsx:268 | 개별 수치 표시 유닛 |

---

## C. 디자인 토큰

### 색상 체계 (`globals.css:7-75`)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--primary` | `#2563eb` (Blue-600) | 주요 CTA, 링크 |
| `--foreground` | 다크/라이트 모드별 가변 | 본문 텍스트 |
| `--cre-hot` | `#f43f5e` (Rose-500) | 인기/주목 매물 뱃지 |
| `--grade-S` | `#d97706` (Amber-600) | S등급 뱃지 |
| `--grade-A` | `#059669` (Emerald-600) | A등급 뱃지 |
| `--grade-B` | `#2563eb` (Blue-600) | B등급 뱃지 |
| `--grade-C` | `#6b7280` (Gray-500) | C등급 뱃지 |

### 폰트 크기 체계 (`globals.css:52-59, 170`)

| 클래스 | 크기 | 용도 |
|---|---|---|
| `text-2xs` | 11px | 캡션, 법적 문구 |
| `text-xs` | 13px | 보조 설명, 뱃지 |
| `text-sm` | 14px | 섹션 본문 |
| `text-base` | 17px (**CJK 상향**) | 기본 본문 |
| `text-lg` | 19px | 소제목 |
| `text-xl` / `sm:text-2xl` | 22px / 26px | 섹션 타이틀 |
| `text-3xl` | 32px | Hero 가격 |

> ⚠️ CJK 한글의 시각적 복잡도를 고려하여 기본 `text-base`를 16px → **17px**로 상향 조정

### 간격 체계 (Tailwind 4px Scale)

| 토큰 | 값 | 주 사용처 |
|---|---|---|
| `p-4` | 16px | 카드 내부 패딩 |
| `py-3` | 12px | Top Bar, 리스트 아이템 |
| `gap-3` | 12px | 그리드 간격 |
| `mb-8` | 32px | 섹션 간 여백 |
| `pb-24` | 96px | 하단 ActionBar 공간 |

### 모서리 둥글기

| 토큰 | 주 사용처 |
|---|---|
| `rounded-xl` | 섹션 카드 |
| `rounded-2xl` | Hero Card, 바텀시트 |
| `rounded-full` | 뱃지, 아바타 |

### 그림자 (`globals.css:43-47`)

| 토큰 | 주 사용처 |
|---|---|
| `shadow-sm` | 섹션 카드, HeroCard |
| `shadow-2xl` | 바텀시트 오버레이 |

---

## D. 인터랙션 패턴

### 아코디언 (섹션 접힘/펼침)

- **상태 관리**: `openSections` (Set 객체) — 다중 오픈 허용 (`L1229`)
- **트랜지션**: 화살표 아이콘 `rotate-180` CSS transition
- **잠금(Lock)**: `locked: true` 시 `disabled` 처리 + 🔒 아이콘 + 어두운 오버레이 (`L509, L595`)

### CTA 버튼 배치

| 위치 | 조건 | 버튼 |
|---|---|---|
| 섹션 중간 (index ≥ 2 이후) | 항상 | "1-tap 관심 표시 및 상세 자료 요청" (`L1548`) |
| 마지막 섹션 하단 | Basic 등급 | Pro 전용 블러 프리뷰 + 업셀 CTA (`L1579-1590`) |
| Floating Action Bar | 항상 | 공유 / PDF / PPTX / 모드전환 / 신청 (`L1688`) |

### 이미지 갤러리

- **기본**: CSS `snap-x` 가로 스크롤 캐러셀 (`L314`)
- **라이트박스**: Fixed z-[100] 전체 화면, `onTouchStart/End` 좌우 스와이프 (`L390-395`)

### 지도

- **렌더링**: OSM 3×3 타일 정적 이미지 (카카오맵 API 호출 없음) (`L174-232`)
- **인터랙션**: 카카오맵 외부 링크 아웃바운드 버튼 오버레이

### 바텀시트

- **애니메이션**: `animate-in slide-in-from-bottom` (`L87`)
- **상태**: 신청 → 전송 중 → 성공 뷰 전환

---

## E. 상태 관리

### React Hooks

| 상태 | 타입 | 용도 | 라인 |
|---|---|---|---|
| `name`, `phone`, `email` | `useState<string>` | 바텀시트 폼 입력 | L34-40 |
| `submitting`, `submitted` | `useState<boolean>` | 폼 전송 상태 | L34-40 |
| `activeIdx` | `useState<number>` | 갤러리 현재 인덱스 | L250 |
| `lightboxOpen`, `lightboxIdx` | `useState<boolean/number>` | 라이트박스 상태 | L250 |
| `openSections` | `useState<Set<number>>` | 아코디언 오픈 섹션 | L1229 |
| `activeSection` | `useState<number>` | 화면 노출 섹션 인덱스 | L1235 |
| `showInquiry` | `useState<boolean>` | 바텀시트 노출 여부 | L1231 |

### SSR vs CSR 경계

| 계층 | 렌더링 | 역할 |
|---|---|---|
| `page.tsx` | **SSR** (Server Component) | 데이터 fetch, SEO 메타, OG 이미지 |
| `MobileIMViewer` | **CSR** (`'use client'`) | 인터랙션, 상태, 이벤트 |

### 사용자 행동 트래킹

- **Intersection Observer**: 화면 노출 섹션 실시간 감지 → Progress Dots 활성화 + View API 호출 (`L1294`)
- **체류 시간(Dwell time)**: `beforeunload` 이벤트로 총 체류 시간 트래킹 (`L1260`)

---

## F. 접근성/규격

| 항목 | 현황 |
|---|---|
| 최소 터치 영역 | `w-10 h-10` (40px) 또는 패딩으로 ~44px 확보 (`L398, L416`) |
| 최소 폰트 크기 | 면책 조항 `text-[10px]` 제외, 일반 본문 13px 이상 |
| 이미지 Alt 텍스트 | `next/image`에 `item.label` 동적 할당 (`L334, L445`), 지도 타일은 `alt=""` |
| SEO 메타태그 | `generateMetadata()` → OG Title/Description/Image, Twitter Card (`page.tsx:27`) |
| 스크린 리더 | `aria-label`, `aria-expanded` 미사용 — 접근성 보강 여지 있음 |
