# Phase 1: 프리셋 시스템 & 편집 기반 계층 (2주)

> **의존성**: 없음 — 모든 후속 Phase의 전제 조건
> **산출물**: ThemeContext, HeaderFooterConfig, 확장된 CustomPreset, SlideManager, EditHistory

---

## 1.1 ThemeContext Provider 도입

### 현재 상태 (코드베이스 감사 결과)

- **React Context 부재**: `createContext` 검색 결과 Studio 관련 Context가 **0개**
- **현재 패턴**: Root Page Container → props drilling
  - `basic-im-studio/page.tsx`: `project` 상태를 `SlideNavigator`, `SlideEditor`, `SlidePreview`에 props로 전달
  - `pptx-editor/page.tsx`: `tokens` 상태를 `SlidePreviewSVG`, `TokenEditorPanel`에 props로 전달
- **문제**: 프리셋 전환 시 모든 하위 컴포넌트에 tokens를 수동 전파해야 함

### 설계

```typescript
// [신규] src/contexts/ThemeContext.tsx

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { PptxThemeTokens, getPptxTheme } from '@/domain/building/mobile-im/pptx/pptx-theme';

interface ThemeContextValue {
  tokens: PptxThemeTokens;
  presetId: string;
  switchPreset: (presetId: string) => void;           // 빌트인 프리셋 전환
  applyCustomTokens: (partial: Partial<PptxThemeTokens>) => void; // 개별 토큰 오버라이드
  resetToPreset: (presetId: string) => void;           // 프리셋 초기값으로 복원
  isDirty: boolean;                                     // 수정 여부 (저장 프롬프트용)
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};

export function ThemeProvider({ initialPresetId, children }: { initialPresetId: string; children: ReactNode }) {
  const [presetId, setPresetId] = useState(initialPresetId);
  const [baseTokens] = useState(() => getPptxTheme(initialPresetId));
  const [tokens, setTokens] = useState<PptxThemeTokens>(baseTokens);
  const [isDirty, setIsDirty] = useState(false);

  const switchPreset = useCallback((id: string) => {
    const newTokens = getPptxTheme(id);
    setPresetId(id);
    setTokens(newTokens);
    setIsDirty(false);
  }, []);

  const applyCustomTokens = useCallback((partial: Partial<PptxThemeTokens>) => {
    setTokens(prev => ({ ...prev, ...partial }));
    setIsDirty(true);
  }, []);

  const resetToPreset = useCallback((id: string) => {
    switchPreset(id);
  }, [switchPreset]);

  return (
    <ThemeContext.Provider value={{ tokens, presetId, switchPreset, applyCustomTokens, resetToPreset, isDirty }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

### 연쇄 수정 파일

| 파일 | 수정 내용 |
|:---|:---|
| `basic-im-studio/page.tsx` | `<ThemeProvider initialPresetId="credeal_basic">` 래핑 |
| `pptx-editor/page.tsx` | `<ThemeProvider initialPresetId={project.themeId}>` 래핑 |
| `SlidePreview.tsx` | `useTheme()` 훅으로 tokens 수신 → 색상 동적 적용 |
| `slide-preview-svg.tsx` | props `tokens` → `useTheme()` 전환 (하위 호환 유지) |
| `token-editor-panel.tsx` | `onTokenChange` → `applyCustomTokens` 위임 |

---

## 1.2 실시간 프리셋 갤러리 (F1)

### 현재 상태

- `floating-action-bar.tsx`: 7개 프리셋 드롭다운 → 서버에서 PPTX 재생성 → 다운로드
- `token-editor-panel.tsx`: 5개 Core Prime + 3개 Additional + N개 Custom → `onBasePresetChange` 호출
- `slide-preview-svg.tsx`: `tokens` prop 변경 시 즉시 리렌더 (SVG 엔진 **이미 100ms 이내 반응**)

### 설계

```typescript
// [신규] src/components/broker/im-studio/PresetGallery.tsx

interface PresetGalleryProps {
  className?: string;
}

// 내부에서 useTheme() 사용 — props 불필요
export function PresetGallery({ className }: PresetGalleryProps) {
  const { presetId, switchPreset, isDirty } = useTheme();
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);

  // 커스텀 프리셋 로드 (GET /api/broker/pptx-preset)
  useEffect(() => { fetchCustomPresets(); }, []);

  // 빌트인 + 커스텀 통합 목록
  const allPresets = [...BUILTIN_PRESETS, ...customPresets];

  return (
    <div className={cn('flex gap-2 overflow-x-auto py-2', className)}>
      {allPresets.map(p => (
        <PresetCard
          key={p.id}
          preset={p}
          isActive={presetId === p.id}
          onClick={() => {
            if (isDirty && !confirm('저장하지 않은 변경사항이 있습니다. 프리셋을 전환하시겠습니까?'))
              return;
            switchPreset(p.id);
          }}
        />
      ))}
      <NewPresetCard /> {/* F8: 현재 상태를 커스텀 프리셋으로 저장 */}
    </div>
  );
}
```

### UX 흐름

```
┌──────────────────────────────────────────────────────────────┐
│ 프리셋 갤러리 (수평 스크롤)                                    │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌──────┐ │
│ │🏛 GI │ │🏢 CC│ │🏥 CV│ │📐 DB│ │🏛 IS│ │✏ 내 │ │ + 새 │ │
│ │ ✓   │ │     │ │     │ │     │ │     │ │프리셋│ │프리셋│ │
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └──────┘ │
│ ← 클릭 즉시 SVG 프리뷰 반영 (ThemeContext 통해 100ms 이내)   │
└──────────────────────────────────────────────────────────────┘
```

---

## 1.3 헤더/푸터 글로벌 설정 (F7)

### 현재 상태

- `imlib.ts`의 `head()`: `layoutStyle` 6종에 따라 다른 헤더 렌더링 — **하드코딩된 구조**
- `imlib.ts`의 `foot()`: `companyName`, `docno`, 페이지 번호 — **구성 불가**
- `a01-cover.ts`: `tokens.companyName`, `tokens.companyTagline`, `tokens.logoUrl` 사용
- `a10-closing.ts`: `broker` 객체에서 연락처 추출

### 설계

```typescript
// [신규] src/domain/building/mobile-im/pptx/header-footer.ts

export interface HeaderConfig {
  logoUrl?: string;           // Supabase Storage URL
  logoPosition: 'left' | 'right';
  companyName: string;
  tagline?: string;
  showOnCover: boolean;       // default: false
  showOnClosing: boolean;     // default: false
  heightInch: number;         // default: 0.35
}

export interface FooterConfig {
  disclaimer: string;         // default: '본 자료는 투자 참고용이며...'
  contactLine?: string;       // 'Tel. 02-XXX-XXXX | www.credeal.co.kr'
  showPageNumber: boolean;    // default: true
  pageNumberFormat: 'current' | 'current/total'; // default: 'current/total'
  showOnCover: boolean;       // default: false
  excludeSlideIndices: number[]; // 0-indexed
}

export interface HeaderFooterConfig {
  header: HeaderConfig;
  footer: FooterConfig;
}

export const DEFAULT_HEADER_FOOTER: HeaderFooterConfig = {
  header: {
    logoPosition: 'left',
    companyName: '',
    showOnCover: false,
    showOnClosing: false,
    heightInch: 0.35,
  },
  footer: {
    disclaimer: '본 자료는 투자 참고용으로 작성되었으며, 실제 투자 결정은 별도 실사에 기반하여야 합니다.',
    showPageNumber: true,
    pageNumberFormat: 'current/total',
    showOnCover: false,
    excludeSlideIndices: [],
  },
};
```

### imlib.ts 수정

```typescript
// [수정] src/domain/building/mobile-im/pptx/imlib.ts

// 기존: head(s, num, kicker, title, sub?)
// 신규: head(s, num, kicker, title, sub?, headerConfig?)
export function head(
  s: PptxGenJS.Slide, num: number, kicker: string, title: string,
  sub?: string, headerConfig?: HeaderConfig
) {
  // 기존 로직 유지
  // headerConfig 존재 시 로고 이미지 추가
  if (headerConfig?.logoUrl) {
    const logoX = headerConfig.logoPosition === 'left' ? M : W - M - 1.2;
    s.addImage({ path: headerConfig.logoUrl, x: logoX, y: 0.15, w: 1.2, h: headerConfig.heightInch });
  }
}

// 기존: foot(s, page, docno, onDark?)
// 신규: foot(s, page, docno, onDark?, footerConfig?, totalPages?)
export function foot(
  s: PptxGenJS.Slide, page: number, docno: string,
  onDark?: boolean, footerConfig?: FooterConfig, totalPages?: number
) {
  // 기존 로직 유지
  // footerConfig 존재 시 면책 문구 및 페이지 번호 포맷 적용
  if (footerConfig) {
    const pageText = footerConfig.pageNumberFormat === 'current/total'
      ? `${page} / ${totalPages ?? '?'}`
      : `${page}`;
    // ... 렌더링
  }
}
```

### UI 컴포넌트

```typescript
// [신규] src/components/broker/im-studio/HeaderFooterEditor.tsx

interface HeaderFooterEditorProps {
  config: HeaderFooterConfig;
  onChange: (config: HeaderFooterConfig) => void;
  onLogoUpload: (file: File) => Promise<string>; // returns URL
  onLogoRemove: () => void;
}

// 아코디언 UI:
// ├── 헤더 설정
// │   ├── 로고 업로드 (Supabase Storage)
// │   ├── 회사명 / 태그라인 텍스트 입력
// │   ├── 로고 위치 (좌/우) 토글
// │   └── 적용 범위 체크박스 (표지, 클로징)
// └── 푸터 설정
//     ├── 면책 문구 textarea
//     ├── 연락처 라인 입력
//     ├── 페이지 번호 표시 토글
//     └── 페이지 번호 포맷 선택
```

---

## 1.4 커스텀 프리셋 저장 + 디폴트 설정 (F8 + F9)

### 현재 상태

- `pptx_custom_presets` Supabase 테이블: `tokens JSONB`, `cover_style`, `layout_style`, `logo_url` — **HeaderFooterConfig 미포함**
- `is_company_default BOOLEAN` 컬럼 존재 — **UI 미연결**
- API: `POST/GET/PUT/DELETE /api/broker/pptx-preset` — **기본 CRUD 작동 중**

### Supabase 스키마 확장

```sql
-- [수정] 마이그레이션: pptx_custom_presets 테이블 확장
ALTER TABLE pptx_custom_presets
  ADD COLUMN IF NOT EXISTS header_footer JSONB DEFAULT '{}',     -- HeaderFooterConfig
  ADD COLUMN IF NOT EXISTS slide_defaults JSONB DEFAULT '[]',    -- SlideDefaultConfig[]
  ADD COLUMN IF NOT EXISTS is_user_default BOOLEAN DEFAULT false; -- 개인 디폴트 (F9)

-- is_user_default 고유 제약: 사용자당 하나만 디폴트
CREATE UNIQUE INDEX IF NOT EXISTS idx_pptx_presets_user_default
  ON pptx_custom_presets (user_id)
  WHERE is_user_default = true;
```

### 통합 프리셋 저장 인터페이스

```typescript
// [수정] src/app/api/broker/pptx-preset/route.ts — POST body 확장

interface CreatePresetRequest {
  preset_name: string;
  tokens: Partial<PptxThemeTokens>;
  cover_style: PptxThemeTokens['coverStyle'];
  layout_style: PptxThemeTokens['layoutStyle'];
  company_name?: string;
  company_tagline?: string;
  logo_url?: string;
  base_preset_id: string;
  // ── Phase 1 신규 ──
  header_footer?: HeaderFooterConfig;   // F7
  slide_defaults?: SlideDefaultConfig[]; // F2 (Phase 2에서 활용)
  is_user_default?: boolean;            // F9
}
```

### 디폴트 프리셋 적용 흐름

```
[브로커 로그인]
    ↓
[매물 선택 → Basic IM Studio 진입]
    ↓
[GET /api/broker/pptx-preset?is_user_default=true]
    ↓
  ┌─ 디폴트 프리셋 존재 → 자동 적용 (ThemeProvider initialPresetId)
  └─ 미존재 → 'credeal_basic' 기본값 사용
    ↓
[PresetGallery에서 ⭐ 기본 뱃지 표시]
    ↓
[다른 프리셋 위 우클릭 → "기본 프리셋으로 설정"]
    ↓
[PATCH /api/broker/pptx-preset/{id} → is_user_default: true]
[DB 트리거: 기존 디폴트 → is_user_default: false 자동 해제]
```

---

## 1.5 슬라이드 순서 & 표시/숨김 (F10 + F11)

### 현재 상태

- `slide-deck-list.tsx` (PPTX Editor): **드래그&드롭 순서 변경 + 표시/숨김 토글 구현 완료**
  - `handleDragStart`, `handleDragOver`, `handleDrop`, `handleMove` 핸들러
  - `onReorder(reorderedSlideIds: string[])`, `onToggleVisibility(slideId: string)` 콜백
  - HTML5 Drag and Drop API 사용
- `SlideNavigator.tsx` (Basic Studio): **순서 변경/숨김 기능 없음** — 클릭 선택만 가능

### 설계: SlideNavigator 확장

```typescript
// [수정] src/app/(broker)/broker/basic-im-studio/[buildingId]/components/SlideNavigator.tsx

interface SlideNavigatorProps {
  slides: Slide[];
  selectedSlideId: string | null;
  onSelect: (id: string) => void;
  // ── Phase 1 신규 ──
  onReorder: (reorderedSlideIds: string[]) => void;
  onToggleVisibility: (slideId: string) => void;
}

// PROTECTED_SLIDES: cover(seq 1)와 closing(seq 9)은 이동/숨김 불가
const PROTECTED_DATA_KEYS = ['cover', 'closing'];
const isProtected = (slide: Slide) => PROTECTED_DATA_KEYS.includes(slide.dataKey);

// 드래그&드롭: slide-deck-list.tsx의 HTML5 DnD 로직을 재활용
// 표시/숨김: 각 슬라이드 카드 우측에 👁️/🚫 토글 버튼
// 잠금 표시: cover/closing에 🔒 아이콘 (드래그 핸들 비활성)
```

### API 연쇄 수정

```typescript
// [수정] src/app/api/broker/basic-im-studio/[id]/route.ts — PATCH action 확장

// 기존: action === 'override' → patchSlideOverrides()
// 신규: action === 'reorder'  → reorderSlides(projectId, orderedSlideIds, expectedLockVersion)
//       action === 'toggle'   → toggleSlideVisibility(projectId, slideId, hidden, expectedLockVersion)
```

---

## 1.6 Undo/Redo 히스토리 (F14)

### 현재 상태

- **상태 관리 라이브러리 미사용**: zustand, jotai, recoil 모두 미설치
- **Undo/Redo 없음**: `localOverrides` useState만 사용

### 설계: Zustand + Immer 도입

```bash
npm install zustand immer
```

```typescript
// [신규] src/stores/studio-edit-store.ts

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface EditHistoryEntry {
  timestamp: number;
  action: string;
  slideId?: string;
  fieldPath?: string;
  before: any;
  after: any;
}

interface StudioEditState {
  // 슬라이드 오버라이드 상태
  overrides: Record<string, Record<string, any>>; // slideId → fieldKey → value

  // Undo/Redo 스택
  undoStack: EditHistoryEntry[];
  redoStack: EditHistoryEntry[];
  maxHistory: number; // default: 50

  // Actions
  setField: (slideId: string, field: string, value: any) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // 동기화
  syncFromServer: (project: PptxProject) => void;
  getDirtySlideIds: () => string[];
}

export const useStudioEditStore = create<StudioEditState>()(
  immer((set, get) => ({
    overrides: {},
    undoStack: [],
    redoStack: [],
    maxHistory: 50,

    setField: (slideId, field, value) => {
      const before = get().overrides[slideId]?.[field];
      set(state => {
        if (!state.overrides[slideId]) state.overrides[slideId] = {};
        state.overrides[slideId][field] = value;
        state.undoStack.push({
          timestamp: Date.now(),
          action: 'field_edit',
          slideId, fieldPath: field,
          before, after: value,
        });
        if (state.undoStack.length > state.maxHistory) state.undoStack.shift();
        state.redoStack = []; // 새 편집 시 redo 스택 초기화
      });
    },

    undo: () => {
      const entry = get().undoStack[get().undoStack.length - 1];
      if (!entry) return;
      set(state => {
        const popped = state.undoStack.pop()!;
        if (popped.slideId && popped.fieldPath !== undefined) {
          state.overrides[popped.slideId][popped.fieldPath] = popped.before;
        }
        state.redoStack.push(popped);
      });
    },

    redo: () => { /* 역방향 undo */ },
    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    syncFromServer: (project) => {
      set(state => {
        for (const slide of project.slides) {
          state.overrides[slide.id] = { ...slide.slideOverrides };
        }
      });
    },

    getDirtySlideIds: () => {
      // 서버 상태와 비교하여 변경된 슬라이드 ID 목록 반환
      return Object.keys(get().overrides);
    },
  }))
);
```

### 키보드 바인딩

```typescript
// [신규] src/hooks/useUndoRedoShortcuts.ts

import { useEffect } from 'react';
import { useStudioEditStore } from '@/stores/studio-edit-store';

export function useUndoRedoShortcuts() {
  const { undo, redo, canUndo, canRedo } = useStudioEditStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) { if (canRedo()) redo(); }
        else { if (canUndo()) undo(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, canUndo, canRedo]);
}
```

---

## Phase 1 파일 변경 요약

| 유형 | 파일 | 변경 |
|:---:|:---|:---|
| 🆕 | `src/contexts/ThemeContext.tsx` | ThemeProvider + useTheme 훅 |
| 🆕 | `src/components/broker/im-studio/PresetGallery.tsx` | 프리셋 갤러리 Carousel |
| 🆕 | `src/components/broker/im-studio/HeaderFooterEditor.tsx` | 헤더/푸터 설정 UI |
| 🆕 | `src/domain/building/mobile-im/pptx/header-footer.ts` | HeaderFooterConfig 타입 + 기본값 |
| 🆕 | `src/stores/studio-edit-store.ts` | Zustand Undo/Redo 스토어 |
| 🆕 | `src/hooks/useUndoRedoShortcuts.ts` | Ctrl+Z/Y 키보드 바인딩 |
| 📝 | `basic-im-studio/page.tsx` | ThemeProvider 래핑 + onReorder/onToggle props |
| 📝 | `pptx-editor/page.tsx` | ThemeProvider 래핑 |
| 📝 | `SlideNavigator.tsx` | 드래그&드롭 + 표시/숨김 토글 추가 |
| 📝 | `SlidePreview.tsx` | useTheme() 훅으로 동적 색상 |
| 📝 | `slide-preview-svg.tsx` | useTheme() 하위 호환 유지 |
| 📝 | `token-editor-panel.tsx` | useTheme() 연동 |
| 📝 | `imlib.ts` | head()/foot() headerConfig/footerConfig 파라미터 추가 |
| 📝 | `pptx-renderer.ts` | HeaderFooterConfig 주입 → imlib 전달 |
| 📝 | `basic-im-studio/[id]/route.ts` | reorder/toggle action 추가 |
| 📝 | `/api/broker/pptx-preset/route.ts` | header_footer, is_user_default 필드 |
| 📝 | Supabase migration | pptx_custom_presets 컬럼 3개 추가 |
| 📦 | `package.json` | `zustand`, `immer` 추가 |

---

## Phase 1 검증 계획

| 검증 항목 | 방법 |
|:---|:---|
| ThemeContext 즉시 반영 | SVG 프리뷰에서 프리셋 전환 → 100ms 이내 색상 변경 확인 |
| 헤더/푸터 PPTX 반영 | 다운로드된 PPTX 파일에서 로고/면책 문구 위치 확인 |
| 커스텀 프리셋 CRUD | API 호출 → Supabase 데이터 확인 → 프리셋 목록 갱신 |
| 디폴트 프리셋 자동 적용 | 새 매물 진입 시 사용자 디폴트 프리셋 자동 로드 |
| 슬라이드 순서 변경 | 드래그 → 프리뷰 순서 반영 → PPTX 다운로드 순서 확인 |
| 슬라이드 숨김 | 토글 → PPTX 다운로드에서 해당 슬라이드 제외 확인 |
| Undo/Redo | Ctrl+Z → 이전 값 복원, Ctrl+Shift+Z → 재적용 |
| OCC (동시 편집 방지) | 두 탭에서 동시 편집 → 409 STALE_LOCK_ERROR 확인 |
