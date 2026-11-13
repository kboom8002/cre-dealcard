// @vitest-environment jsdom
/**
 * @file src/tests/workspace/workspace-list-primitives.test.tsx
 * @description P0 shared left-list primitives for the 4 broker workspaces:
 *  - list-date: Korean senior-friendly date labels, legacy "방금" handling, stable newest-first grouping
 *  - useListViewMode: default "simple", persisted + broadcast across components
 *  - ListToolbar: filter panel stays mounted (hidden) so legacy tab testids remain queryable
 *  - SimpleListRow: title · date · status only, selection shown by more than color (✓ + aria-current)
 */
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import {
  formatListDate,
  getListDateBucket,
  groupItemsByListDate,
  toListTime,
} from "@/lib/workspace/list-date";
import {
  LIST_VIEW_STORAGE_KEY,
  useListViewMode,
} from "@/components/workspace/list/useListViewMode";
import {
  DateGroupedList,
  ListToolbar,
  SelectedItemActions,
  SimpleListRow,
  WorkspaceListPanel,
} from "@/components/workspace/list/WorkspaceList";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 2026-11-13 (Fri) 15:00 local time
const NOW = new Date(2026, 10, 13, 15, 0, 0);

describe("list-date (P0)", () => {
  it("formats today as 오전/오후 time, yesterday as 어제, this year as M월 D일, older as YYYY. M. D.", () => {
    expect(formatListDate(new Date(2026, 10, 13, 14, 20), NOW)).toBe("오후 2:20");
    expect(formatListDate(new Date(2026, 10, 13, 0, 5), NOW)).toBe("오전 12:05");
    expect(formatListDate(new Date(2026, 10, 13, 12, 0), NOW)).toBe("오후 12:00");
    expect(formatListDate(new Date(2026, 10, 12, 23, 59), NOW)).toBe("어제");
    expect(formatListDate(new Date(2026, 10, 10, 9, 0), NOW)).toBe("11월 10일");
    expect(formatListDate(new Date(2025, 2, 4, 9, 0), NOW)).toBe("2025. 3. 4.");
  });

  it("treats bare YYYY-MM-DD / YYYY.MM.DD as a local date (no UTC day shift) and parses ISO with milliseconds", () => {
    expect(formatListDate("2026-11-10", NOW)).toBe("11월 10일");
    expect(formatListDate("2026.11.10", NOW)).toBe("11월 10일");
    expect(getListDateBucket("2026-11-13", NOW)).toBe("today");
    const isoMs = new Date(2026, 10, 13, 9, 30).toISOString(); // e.g. 2026-11-13T00:30:00.000Z
    expect(isoMs).toContain(".000Z");
    expect(formatListDate(isoMs, NOW)).toBe("오전 9:30");
  });

  it("[Negative] shows legacy relative strings verbatim, and unparseable/empty values safely", () => {
    expect(formatListDate("방금", NOW)).toBe("방금");
    expect(formatListDate("3분 전", NOW)).toBe("3분 전");
    expect(formatListDate("", NOW)).toBe("날짜 없음");
    expect(formatListDate(null, NOW)).toBe("날짜 없음");
    expect(formatListDate("알수없음", NOW)).toBe("알수없음");
    expect(toListTime("12", NOW)).toBeNull();
    expect(toListTime("방금", NOW)).toBe(NOW.getTime());
    expect(getListDateBucket("2일 전", NOW)).toBe("week");
    expect(getListDateBucket("알수없음", NOW)).toBe("unknown");
  });

  it("groups newest-first in fixed bucket order, keeping original order for equal/unknown times", () => {
    const items = [
      { id: "old", d: "2026-10-01T09:00:00" },
      { id: "legacyA", d: "방금" },
      { id: "yday", d: new Date(2026, 10, 12, 10, 0).toISOString() },
      { id: "legacyB", d: "방금" },
      { id: "none", d: "" },
      { id: "today", d: new Date(2026, 10, 13, 9, 0).toISOString() },
    ];
    const groups = groupItemsByListDate(items, (i) => i.d, NOW);
    expect(groups.map((g) => g.label)).toEqual(["오늘", "어제", "이전", "날짜 없음"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["legacyA", "legacyB", "today"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["yday"]);
    expect(groups[3].items.map((i) => i.id)).toEqual(["none"]);
  });
});

describe("Workspace list components (P0)", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function ModeProbe({ id }: { id: string }) {
    const [mode, setMode] = useListViewMode();
    return (
      <div>
        <span data-testid={`probe-${id}`}>{mode}</span>
        <ListToolbar
          viewMode={mode}
          onViewModeChange={setMode}
          filterPanel={<div data-testid={`legacy-tabs-${id}`}>전체 임대수익</div>}
          activeFilters={[]}
        />
      </div>
    );
  }

  it("defaults to 간단히, persists 자세히 to localStorage and syncs every mounted list", async () => {
    await act(async () => {
      root.render(
        <>
          <ModeProbe id="a" />
          <ModeProbe id="b" />
        </>
      );
    });
    expect(container.querySelector('[data-testid="probe-a"]')?.textContent).toBe("simple");

    const detailedBtn = container.querySelectorAll('[data-testid="ws-list-view-detailed"]')[0] as HTMLButtonElement;
    expect(detailedBtn.textContent).toBe("자세히");
    await act(async () => {
      detailedBtn.click();
    });
    expect(localStorage.getItem(LIST_VIEW_STORAGE_KEY)).toBe("detailed");
    expect(container.querySelector('[data-testid="probe-a"]')?.textContent).toBe("detailed");
    expect(container.querySelector('[data-testid="probe-b"]')?.textContent).toBe("detailed");
  });

  it("keeps the folded filter panel mounted but hidden, and opens it with the 필터 button", async () => {
    await act(async () => {
      root.render(<ModeProbe id="a" />);
    });
    const panel = container.querySelector('[data-testid="ws-list-filter-panel"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.hidden).toBe(true);
    // Legacy tab testids stay queryable while folded
    expect(container.querySelector('[data-testid="legacy-tabs-a"]')?.textContent).toContain("임대수익");

    const toggle = container.querySelector('[data-testid="ws-list-filter-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      toggle.click();
    });
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows active filters as removable chips with a count badge", async () => {
    const onClear = vi.fn();
    await act(async () => {
      root.render(
        <ListToolbar
          viewMode="simple"
          onViewModeChange={() => {}}
          filterPanel={<div />}
          activeFilters={[{ key: "posture", label: "임대수익", onClear }]}
        />
      );
    });
    const toggle = container.querySelector('[data-testid="ws-list-filter-toggle"]') as HTMLButtonElement;
    expect(toggle.textContent).toContain("1");
    const chip = container.querySelector('[data-testid="ws-list-active-filter-posture"]') as HTMLButtonElement;
    expect(chip.textContent).toContain("임대수익");
    await act(async () => {
      chip.click();
    });
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders a simple row with only title · date · status, and marks selection with ✓ + aria-current", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(
        <WorkspaceListPanel testId="demo-list" controls={<button type="button">＋ 새로 만들기</button>} bodyLabel="목록 2건">
          <DateGroupedList
            now={NOW}
            items={[
              { id: "a", title: "서교동 근생빌딩", d: new Date(2026, 10, 13, 14, 20).toISOString(), sel: true },
              { id: "b", title: "성수동 사옥", d: new Date(2026, 10, 12, 9, 0).toISOString(), sel: false },
            ]}
            getDate={(i) => i.d}
            getKey={(i) => i.id}
            renderRow={(i) => (
              <SimpleListRow
                now={NOW}
                testId={`dealcard-item-${i.id}`}
                title={i.title}
                date={i.d}
                selected={i.sel}
                onSelect={() => onSelect(i.id)}
                status={{ label: "준비됨", tone: "ready", testId: `dealcard-status-badge-${i.id}` }}
              />
            )}
          />
        </WorkspaceListPanel>
      );
    });

    expect(container.querySelector('[data-testid="ws-list-control-zone"]')?.className).toContain("sticky");
    expect(container.querySelector('[data-testid="ws-list-body-label"]')?.textContent).toBe("목록 2건");
    expect(container.querySelector('[data-testid="ws-date-group-today"]')?.textContent).toContain("오늘");
    expect(container.querySelector('[data-testid="ws-date-group-yesterday"]')?.textContent).toContain("어제");

    const rowA = container.querySelector('[data-testid="dealcard-item-a"]') as HTMLElement;
    const rowB = container.querySelector('[data-testid="dealcard-item-b"]') as HTMLElement;
    expect(rowA.getAttribute("aria-current")).toBe("true");
    expect(rowA.textContent).toContain("✓");
    expect(rowA.textContent).toContain("선택됨");
    expect(rowB.getAttribute("aria-current")).toBeNull();
    expect(rowB.textContent).not.toContain("✓");
    expect(container.querySelector('[data-testid="dealcard-item-a-date"]')?.textContent).toBe("오후 2:20");
    expect(container.querySelector('[data-testid="dealcard-status-badge-a"]')?.textContent).toContain("준비됨");
    // Negative: no destructive buttons inside simple rows
    expect(rowA.querySelectorAll("button").length).toBe(0);

    await act(async () => {
      rowB.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("SelectedItemActions renders 복제하기 / 삭제하기 and hides itself when no handler", async () => {
    const onDelete = vi.fn();
    await act(async () => {
      root.render(<SelectedItemActions itemLabel="서교동" onDelete={onDelete} />);
    });
    expect(container.querySelector('[data-testid="ws-selected-duplicate-btn"]')).toBeNull();
    const del = container.querySelector('[data-testid="ws-selected-delete-btn"]') as HTMLButtonElement;
    expect(del.textContent).toBe("삭제하기");
    await act(async () => {
      del.click();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<SelectedItemActions itemLabel="서교동" />);
    });
    expect(container.querySelector('[data-testid="ws-selected-item-actions"]')).toBeNull();
  });
});
