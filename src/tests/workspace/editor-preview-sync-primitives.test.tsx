/**
 * @vitest-environment jsdom
 */
import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import {
  useEditorPreviewSync,
  PreviewCausalityBar,
  PreviewPregenerationCard,
  PreviewEditableUnit,
} from "@/components/workspace/preview-sync";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  usePathname: () => "/broker/w/im",
  useSearchParams: () => new URLSearchParams("buildingId=bld-1&tab=preview"),
}));

import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

function TestHarness() {
  const [tab, setTab] = useState<"step1" | "step2">("step1");
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  const sync = useEditorPreviewSync<"step1" | "step2">({
    onSelectTab: setTab,
    units: {
      "unit-title": {
        unitId: "unit-title",
        label: "표지 제목",
        tab: "step1",
        editorSelector: "#editor-title-card",
        focusSelector: "#editor-title-input",
      },
      "unit-detail": {
        unitId: "unit-detail",
        label: "상세 조건",
        tab: "step2",
        editorSelector: "#editor-detail-card",
        focusSelector: "#editor-detail-input",
        onBeforeFocus: () => setDisclosureOpen(true),
      },
    },
  });

  return (
    <div data-testid="test-root" data-active-tab={tab}>
      <div data-testid="col-editor">
        <div id="editor-title-card" className={tab === "step1" ? "block" : "hidden"}>
          <input
            id="editor-title-input"
            data-testid="editor-title-input"
            onFocus={() => sync.notifyEditorFocus("unit-title")}
          />
        </div>
        <div id="editor-detail-card" className={tab === "step2" ? "block" : "hidden"}>
          <div className={disclosureOpen ? "block" : "hidden"}>
            <input
              id="editor-detail-input"
              data-testid="editor-detail-input"
              onFocus={() => sync.notifyEditorFocus("unit-detail")}
            />
          </div>
        </div>
      </div>

      <div data-testid="workspace-col-preview">
        <PreviewEditableUnit
          unitId="unit-title"
          label="표지 제목"
          testId="preview-unit-title"
          isActive={sync.activeUnitId === "unit-title"}
          onActivate={sync.focusEditorUnit}
        >
          <span>표지 미리보기</span>
          <PreviewEditableUnit
            unitId="unit-detail"
            label="상세 조건"
            testId="preview-unit-detail"
            isActive={sync.activeUnitId === "unit-detail"}
            onActivate={sync.focusEditorUnit}
          >
            <span>중첩 상세 항목</span>
          </PreviewEditableUnit>
        </PreviewEditableUnit>
      </div>
    </div>
  );
}

describe("P0 Editor <-> Preview SOTA Sync Primitives", () => {
  beforeEach(() => {
    cleanup();
    mockReplace.mockReset();
  });

  it("renders all 4 states of PreviewCausalityBar with honest Korean labels and action callbacks", () => {
    const onStart = vi.fn();
    const onResync = vi.fn();

    const { getByTestId, rerender } = render(
      <PreviewCausalityBar lifecycle="pre_generation" onStartInput={onStart} />
    );
    expect(getByTestId("preview-causality-bar").getAttribute("data-lifecycle")).toBe(
      "pre_generation"
    );
    expect(getByTestId("preview-causality-bar").textContent).toContain("미리보기 생성 전");
    fireEvent.click(getByTestId("preview-causality-start-btn"));
    expect(onStart).toHaveBeenCalledTimes(1);

    rerender(<PreviewCausalityBar lifecycle="live_draft" />);
    expect(getByTestId("preview-causality-bar").textContent).toContain("실시간 미리보기");

    rerender(
      <PreviewCausalityBar lifecycle="published_clean" liveUrl="https://credeal.net/im-lite/1" />
    );
    expect(getByTestId("preview-causality-bar").textContent).toContain("고객 화면과 일치");
    expect(getByTestId("preview-causality-live-link").getAttribute("href")).toBe(
      "https://credeal.net/im-lite/1"
    );

    rerender(
      <PreviewCausalityBar lifecycle="published_dirty" onResyncPublished={onResync} />
    );
    expect(getByTestId("preview-causality-bar").textContent).toContain("고객 화면에는 반영 전");
    fireEvent.click(getByTestId("preview-causality-resync-btn"));
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it("renders PreviewPregenerationCard checklist and triggers direct editor jump actions", () => {
    const onPrimary = vi.fn();
    const onItem = vi.fn();
    const { getByTestId, getByText } = render(
      <PreviewPregenerationCard
        testId="im-preview-pregeneration-state"
        title="주소와 매매가를 입력해 주세요"
        description="핵심 2가지만 채우면 모바일 IM이 바로 나타납니다."
        checklist={[
          { label: "1. 건물 주소 입력", done: false, onClick: onItem },
          { label: "2. 희망 매매가 입력", done: true },
        ]}
        primaryActionLabel="① 주소 입력하기"
        onPrimaryAction={onPrimary}
      />
    );
    expect(getByTestId("im-preview-pregeneration-state").textContent).toContain("생성 전");
    fireEvent.click(getByText("입력하기 ›"));
    expect(onItem).toHaveBeenCalledTimes(1);
    fireEvent.click(getByTestId("im-preview-pregeneration-state-primary-btn"));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it("supports Click-to-Edit across tabs + collapsed disclosures, nested unit isolation, and Editor -> Preview focus sync", () => {
    const { getByTestId } = render(<TestHarness />);

    // Same-tab click focuses input immediately and marks preview unit active
    fireEvent.click(getByTestId("preview-unit-title"));
    expect(document.activeElement).toBe(getByTestId("editor-title-input"));
    expect(getByTestId("preview-unit-title").getAttribute("data-preview-active")).toBe("true");

    // Nested unit click stops propagation, switches tab -> step2, opens disclosure, and focuses detail input
    fireEvent.click(getByTestId("preview-unit-detail"));
    expect(getByTestId("test-root").getAttribute("data-active-tab")).toBe("step2");
    expect(document.activeElement).toBe(getByTestId("editor-detail-input"));
    expect(getByTestId("preview-unit-detail").getAttribute("data-preview-active")).toBe("true");
    expect(getByTestId("preview-unit-title").getAttribute("data-preview-active")).toBe("false");
  });

  it("closes WorkspaceShell preview drawer and flips mobile preview -> editor on workspace:focus-editor event", () => {
    const { getByTestId, queryByTestId } = render(
      <WorkspaceShell
        workspace="im"
        selectedBuildingId="bld-1"
        editorSlot={<div data-testid="dummy-editor">편집창</div>}
        previewSlot={<div data-testid="dummy-preview">미리보기창</div>}
      />
    );

    // Open <1280px preview drawer first
    fireEvent.click(getByTestId("workspace-editor-preview-drawer-btn"));
    expect(getByTestId("workspace-preview-drawer-backdrop")).not.toBeNull();

    // Dispatch focus-editor event wrapped in act so React flushes listener state updates
    act(() => {
      window.dispatchEvent(
        new CustomEvent("workspace:focus-editor", {
          detail: { unitId: "im-unit-cover", label: "표지 제목" },
        })
      );
    });

    // Drawer closes & mobile ?tab=preview flips to ?tab=editor
    expect(queryByTestId("workspace-preview-drawer-backdrop")).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("tab=editor"));
  });
});
