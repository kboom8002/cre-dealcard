// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  UndoToastProvider,
  useUndoToast,
} from "@/components/workspace/UndoConfirmToast";

function TestConsumer({
  onTrigger,
}: {
  onTrigger: (trigger: () => void) => void;
}) {
  const { showUndoToast, dismissToast } = useUndoToast();

  React.useEffect(() => {
    onTrigger(() => {
      showUndoToast({
        message: "매물을 보관함으로 이동했습니다.",
        durationMs: 8000,
        undoAction: vi.fn(),
        undoLabel: "되돌리기",
        variant: "warning",
      });
    });
  }, [showUndoToast, onTrigger]);

  return <div>테스트 컴포넌트</div>;
}

describe("WP-P2-07: Unified Undo/Confirm Toast System", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("renders high-contrast undo toast with countdown when triggered", () => {
    let triggerFn = () => {};

    act(() => {
      root.render(
        <UndoToastProvider>
          <TestConsumer onTrigger={(fn) => (triggerFn = fn)} />
        </UndoToastProvider>
      );
    });

    // Before trigger: no toast
    expect(container.querySelector('[data-testid="undo-confirm-toast"]')).toBeNull();

    // Trigger toast
    act(() => {
      triggerFn();
    });

    const toast = container.querySelector('[data-testid="undo-confirm-toast"]');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain("매물을 보관함으로 이동했습니다.");
    expect(toast?.textContent).toContain("되돌리기");
    expect(toast?.getAttribute("role")).toBe("alert");
  });

  it("executes undoAction callback and dismisses toast when clicked", async () => {
    const undoCallback = vi.fn();

    function ActionConsumer() {
      const { showUndoToast } = useUndoToast();
      return (
        <button
          id="fire-btn"
          onClick={() =>
            showUndoToast({
              message: "항목이 삭제되었습니다.",
              undoAction: undoCallback,
              undoLabel: "실행 취소",
            })
          }
        >
          삭제
        </button>
      );
    }

    act(() => {
      root.render(
        <UndoToastProvider>
          <ActionConsumer />
        </UndoToastProvider>
      );
    });

    act(() => {
      (container.querySelector("#fire-btn") as HTMLButtonElement).click();
    });

    const undoBtn = container.querySelector('[data-testid="undo-action-btn"]') as HTMLButtonElement;
    expect(undoBtn).toBeTruthy();

    await act(async () => {
      undoBtn.click();
    });

    expect(undoCallback).toHaveBeenCalledTimes(1);

    // Toast dismissed after undo
    expect(container.querySelector('[data-testid="undo-confirm-toast"]')).toBeNull();
  });

  it("dismisses toast upon pressing Escape key", () => {
    let triggerFn = () => {};

    act(() => {
      root.render(
        <UndoToastProvider>
          <TestConsumer onTrigger={(fn) => (triggerFn = fn)} />
        </UndoToastProvider>
      );
    });

    act(() => {
      triggerFn();
    });

    expect(container.querySelector('[data-testid="undo-confirm-toast"]')).toBeTruthy();

    // Fire Escape keydown
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(container.querySelector('[data-testid="undo-confirm-toast"]')).toBeNull();
  });

  it("auto-dismisses toast after duration window expires", () => {
    let triggerFn = () => {};

    act(() => {
      root.render(
        <UndoToastProvider>
          <TestConsumer onTrigger={(fn) => (triggerFn = fn)} />
        </UndoToastProvider>
      );
    });

    act(() => {
      triggerFn();
    });

    expect(container.querySelector('[data-testid="undo-confirm-toast"]')).toBeTruthy();

    // Advance timers by 8500ms
    act(() => {
      vi.advanceTimersByTime(8500);
    });

    expect(container.querySelector('[data-testid="undo-confirm-toast"]')).toBeNull();
  });
});
