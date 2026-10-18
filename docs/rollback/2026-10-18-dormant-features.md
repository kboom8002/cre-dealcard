# 2026-10-18 비핵심 기능 및 Pro IM 숨김(Dormant) 처리 내역서

- **작업일**: 2026-10-18
- **목적**: 60대 서울 소형 상업용 빌딩 중개인 페르소나를 위해 핵심 3대 기능(**딜카드 · PPTX Basic IM · 모바일 매거진**)에 집중하고, 비핵심 메뉴 및 Pro IM 진입점을 UI에서 숨김 처리함.
- **검색 태그**: `DORMANT: ux60-focus` (`git grep -n "DORMANT: ux60-focus"`로 모든 변경 지점 즉시 확인 가능)

---

## 1. 하단 내비게이션 (`src/components/layout/BrokerBottomNav.tsx`)

### 숨긴 항목
- 우측 탭 `매칭` (`/broker/matching`, `id="nav-matching"`) → 핵심 기능인 `소식지` (`/broker/magazine-editor`, `id="nav-magazine"`)로 교체

### 복원용 원본 코드 (`NAV_ITEMS`)
```tsx
const NAV_ITEMS = [
  {
    href: "/broker",
    icon: LayoutDashboard,
    label: "홈",
    id: "nav-home",
    ariaLabel: "중개인 대시보드 홈",
    exact: true,
  },
  {
    href: "/broker/buildings",
    icon: Building2,
    label: "딜카드",
    id: "nav-buildings",
    ariaLabel: "내 딜카드 목록",
    exact: false,
  },
  // Center slot is occupied by the FAB — skip index 2
  {
    href: "/broker/matching",
    icon: Target,
    label: "매칭",
    id: "nav-matching",
    ariaLabel: "AI 매칭 결과",
    exact: false,
  },
] as const;
```

---

## 2. 더보기 메뉴 (`src/components/layout/BrokerMoreMenu.tsx`)

### 숨긴 항목 (총 6개 메뉴)
1. **메모함** (`/broker/memos`)
2. **임장 일정 관리** (`/broker/schedule`)
3. **내 서클 (팀 매칭)** (`/broker/circles`)
4. **딜 파이프라인** (`/broker/pipeline`)
5. **행동 퍼널 분석** (`/broker/funnel`)
6. **캠페인 카피 AI** (`/broker/campaign`)

### 복원 방법
`src/components/layout/BrokerMoreMenu.tsx` 내 `SECTIONS` 배열에서 `/* DORMANT: ux60-focus ... */` 주석 블록을 해제하면 즉시 복원됩니다.

### 복원용 원본 코드 (`SECTIONS[0].items`)
```tsx
      {
        href: "/broker/memos",
        icon: StickyNote,
        title: "메모함",
        desc: "저장된 유니버설 메모 관리",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
      },
      {
        href: "/broker/schedule",
        icon: CalendarCheck,
        title: "임장 일정 관리",
        desc: "가용 슬롯 · 예약 현황 · 대기열",
        color: "text-orange-400",
        bg: "bg-orange-500/10",
      },
      {
        href: "/broker/circles",
        icon: Users,
        title: "내 서클 (팀 매칭)",
        desc: "신뢰 동료 자산 공유 · 팀 AI 매칭",
        color: "text-amber-300",
        bg: "bg-amber-500/10",
      },
      {
        href: "/broker/clients",
        icon: Users,
        title: "고객 CRM",
        desc: "고객 관리 · 연락처 · 메모",
        color: "text-blue-400",
        bg: "bg-blue-500/10",
      },
      {
        href: "/broker/pipeline",
        icon: GitBranch,
        title: "딜 파이프라인",
        desc: "8단계 딜 진행 현황",
        color: "text-purple-400",
        bg: "bg-purple-500/10",
      },
      {
        href: "/broker/funnel",
        icon: GitBranch,
        title: "행동 퍼널 분석",
        desc: "딜카드 열람부터 계약까지 전환율 시각화",
        color: "text-rose-400",
        bg: "bg-rose-500/10",
      },
      {
        href: "/broker/campaign",
        icon: FileText,
        title: "캠페인 카피 AI",
        desc: "인스타그램, 블로그, 문자용 홍보 문구 자동 생성",
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
      },
      {
        href: "/broker/magazine-editor",
        icon: Palette,
        title: "콘텐츠 스튜디오",
        desc: "매거진 편집 · AI 화법 · 발행 · 성과",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
      },
```

---

## 3. 중개인 홈 대시보드 (`src/app/(broker)/broker/page.tsx`)

### 숨긴 항목
- 상단 KPI 스크롤 카드 중 `S/A 매칭` (`/broker/matching`), `매수 고객` (`/broker/buyer-intents`)
- 하단 3탭(`BrokerDashboardTabs`의 `⚡ 지금 처리`, `📈 인텔리전스`, `RoiCard`, `S등급 매칭 전환율`) → 접이식(`details`) 고급 통계 영역으로 이동 및 주 화면에서는 오늘의 일정·최근 알림·핵심 요약만 즉시 노출

### 복원 방법
`src/app/(broker)/broker/page.tsx`의 `DORMANT: ux60-focus` 주석을 해제하고 `<BrokerDashboardTabs ... />` 직접 렌더링으로 되돌립니다.

---

## 4. 딜카드 상세 페이지 (`src/app/(broker)/broker/deal-card/[id]/page.tsx` 및 하위 컴포넌트)

### 숨긴 항목
1. **매칭 & 임차의향 허브 바로가기 2버튼** (`page.tsx` L341-354: `/broker/matching`, `/broker/tenant-intents`)
   - 대신 `📰 이번 주 소식지에 이 매물 넣기` (`/broker/magazine-editor?mode=simple&deals=${id}`) 및 `📊 투자설명서(Basic IM) 관리` 버튼으로 교체
2. **하단 스티키 바의 `AiMatchCtaButton` (`🎯 AI 매칭`)** (`page.tsx` L535)
3. **세부 4-Tab 중 `매수자`(`buyers`) 및 `분석`(`analytics`) 탭** (`src/components/broker/deal-card/DealCardTabs.tsx`)
   - `🏠 딜카드 개요`와 `📊 투자설명서 (IM)` 2개 탭만 노출
4. **Pro IM 생성 버튼 (`🎯 전문 IM`, `id="cta-mobile-im-pro"`)** (`src/app/(broker)/broker/deal-card/[id]/create-mobile-im-button.tsx` L85-93)
5. **IM 관리 패널 내 Pro IM 생성 버튼 및 `✏️ Pro 편집` 링크** (`src/app/(broker)/broker/deal-card/[id]/im-management-panel.tsx` L446-451, L491-499)
6. **딜카드 ⋮ 메뉴 내 `🤝 서클에 공유` 버튼** (`src/app/(broker)/broker/deal-card/[id]/DealCardActionsMenu.tsx` L132-142)
7. **공개 딜카드(`/dc/[id]`) 하단 `⚡ 중개사 전용 매칭 허브` 블록** (`src/app/(public)/dc/[id]/page.tsx` L313-337)
   - 매수자(고객) 화면에 중개사 전용 링크가 노출되던 결함이므로 숨김 처리

### 복원용 원본 코드 스니펫

#### 4-1. `src/components/broker/deal-card/DealCardTabs.tsx`
```tsx
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: '개요', icon: '🏠' },
  { key: 'im', label: 'IM', icon: '📱' },
  { key: 'buyers', label: '매수자', icon: '🎯' },
  { key: 'analytics', label: '분석', icon: '📊' },
];
```

#### 4-2. `src/app/(broker)/broker/deal-card/[id]/create-mobile-im-button.tsx`
```tsx
        <button
          onClick={() => { setStage('pro'); setShowBottomSheet(true); }}
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-2 py-3 text-xs sm:text-sm font-bold text-white whitespace-nowrap transition-all hover:opacity-90 active:scale-[0.98] shadow-md shadow-purple-900/30"
          id="cta-mobile-im-pro"
          data-testid="generate-pro-im"
          aria-label="전문 IM 생성"
        >
          🎯 전문 IM
        </button>
```

#### 4-3. `src/app/(broker)/broker/deal-card/[id]/im-management-panel.tsx`
```tsx
              <Link 
                href={`/broker/deal-card/${buildingId}/pptx-editor`}
                className="text-[10px] text-amber-500 hover:text-amber-400 whitespace-nowrap"
              >
                ✏️ Pro 편집
              </Link>
```
및 미생성 상태의 Pro 버튼:
```tsx
            <Button 
              size="sm" 
              variant="outline"
              className="h-9 font-bold text-xs border-amber-600/50 text-amber-700 hover:bg-amber-50"
              onClick={() => handleGenerateIM('pro')}
              disabled={generationStatus !== 'idle'}
            >
              🎯 전문 IM
            </Button>
```

#### 4-4. `src/app/(broker)/broker/deal-card/[id]/DealCardActionsMenu.tsx`
```tsx
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu(true);
                  setShowShareSheet(true);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-3 min-h-11 text-sm text-amber-400 font-bold hover:bg-amber-500/10 focus:bg-amber-500/10 focus:outline-none transition-colors text-left border-b border-border/50"
              >
                🤝 서클에 공유
              </button>
```

#### 4-5. `src/app/(broker)/broker/deal-card/new/page.tsx` (딜카드 생성 완료 화면 하단 보조 액션)
```tsx
                <button
                  onClick={() => setShowShareModal(true)}
                  className="py-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-indigo-500/25 transition-all"
                >
                  🤝 서클에 공유
                </button>
                <button
                  onClick={() => router.push("/broker/schedule")}
                  className="py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-amber-500/25 transition-all"
                >
                  📅 임장 슬롯 열기
                </button>
```

