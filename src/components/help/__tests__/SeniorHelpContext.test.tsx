// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import {
  SeniorHelpProvider,
  useSeniorHelp,
} from "../SeniorHelpContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STORAGE_KEY = "credeal-senior-helper-enabled";

interface ConsumerState {
  helperEnabled: boolean;
  isDrawerOpen: boolean;
  activeModuleId: string | null;
  toggleHelperEnabled: () => void;
  openHelpDrawer: (moduleId?: string) => void;
  closeHelpDrawer: () => void;
}

let latestState: ConsumerState | null = null;

function StateConsumer() {
  const ctx = useSeniorHelp();
  latestState = ctx;
  return (
    <div>
      <span data-testid="enabled">{String(ctx.helperEnabled)}</span>
      <span data-testid="drawer">{String(ctx.isDrawerOpen)}</span>
      <span data-testid="active-module">{ctx.activeModuleId ?? "none"}</span>
      <button data-testid="toggle-btn" onClick={ctx.toggleHelperEnabled}>
        Toggle
      </button>
      <button
        data-testid="open-drawer-btn"
        onClick={() => ctx.openHelpDrawer("module-05")}
      >
        Open
      </button>
      <button data-testid="close-drawer-btn" onClick={ctx.closeHelpDrawer}>
        Close
      </button>
    </div>
  );
}

describe("SeniorHelpContext & SeniorHelpProvider", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    latestState = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("provides default state with helperEnabled=true, isDrawerOpen=false, activeModuleId=null", async () => {
    await act(async () => {
      root.render(
        <SeniorHelpProvider>
          <StateConsumer />
        </SeniorHelpProvider>
      );
    });

    expect(latestState?.helperEnabled).toBe(true);
    expect(latestState?.isDrawerOpen).toBe(false);
    expect(latestState?.activeModuleId).toBeNull();
    expect(container.querySelector('[data-testid="enabled"]')?.textContent).toBe("true");
    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe("false");
    expect(container.querySelector('[data-testid="active-module"]')?.textContent).toBe("none");
  });

  it("hydrates helperEnabled=false when localStorage contains 'false'", async () => {
    window.localStorage.setItem(STORAGE_KEY, "false");

    await act(async () => {
      root.render(
        <SeniorHelpProvider>
          <StateConsumer />
        </SeniorHelpProvider>
      );
    });

    expect(latestState?.helperEnabled).toBe(false);
    expect(container.querySelector('[data-testid="enabled"]')?.textContent).toBe("false");
  });

  it("hydrates helperEnabled=true when localStorage contains 'true'", async () => {
    window.localStorage.setItem(STORAGE_KEY, "true");

    await act(async () => {
      root.render(
        <SeniorHelpProvider>
          <StateConsumer />
        </SeniorHelpProvider>
      );
    });

    expect(latestState?.helperEnabled).toBe(true);
    expect(container.querySelector('[data-testid="enabled"]')?.textContent).toBe("true");
  });

  it("handles localStorage getItem throwing errors gracefully", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: Access is denied");
    });

    await act(async () => {
      root.render(
        <SeniorHelpProvider>
          <StateConsumer />
        </SeniorHelpProvider>
      );
    });

    // Should gracefully fall back to default true
    expect(latestState?.helperEnabled).toBe(true);
  });

  it("toggles helperEnabled state and persists to localStorage", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    await act(async () => {
      root.render(
        <SeniorHelpProvider>
          <StateConsumer />
        </SeniorHelpProvider>
      );
    });

    expect(latestState?.helperEnabled).toBe(true);

    // Toggle 1: true -> false
    const toggleBtn = container.querySelector('[data-testid="toggle-btn"]') as HTMLButtonElement;
    await act(async () => {
      toggleBtn.click();
    });

    expect(latestState?.helperEnabled).toBe(false);
    expect(container.querySelector('[data-testid="enabled"]')?.textContent).toBe("false");
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, "false");

    // Toggle 2: false -> true
    await act(async () => {
      toggleBtn.click();
    });

    expect(latestState?.helperEnabled).toBe(true);
    expect(container.querySelector('[data-testid="enabled"]')?.textContent).toBe("true");
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, "true");
  });

  it("handles localStorage setItem throwing errors gracefully on toggle", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    await act(async () => {
      root.render(
        <SeniorHelpProvider>
          <StateConsumer />
        </SeniorHelpProvider>
      );
    });

    const toggleBtn = container.querySelector('[data-testid="toggle-btn"]') as HTMLButtonElement;
    await act(async () => {
      toggleBtn.click();
    });

    // Should successfully flip state in memory even if setItem threw
    expect(latestState?.helperEnabled).toBe(false);
  });

  it("manages drawer state via openHelpDrawer and closeHelpDrawer", async () => {
    await act(async () => {
      root.render(
        <SeniorHelpProvider>
          <StateConsumer />
        </SeniorHelpProvider>
      );
    });

    expect(latestState?.isDrawerOpen).toBe(false);
    expect(latestState?.activeModuleId).toBeNull();

    // Open with module
    const openBtn = container.querySelector('[data-testid="open-drawer-btn"]') as HTMLButtonElement;
    await act(async () => {
      openBtn.click();
    });

    expect(latestState?.isDrawerOpen).toBe(true);
    expect(latestState?.activeModuleId).toBe("module-05");
    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe("true");
    expect(container.querySelector('[data-testid="active-module"]')?.textContent).toBe("module-05");

    // Open without argument preserves previous activeModuleId
    await act(async () => {
      latestState?.openHelpDrawer();
    });
    expect(latestState?.isDrawerOpen).toBe(true);
    expect(latestState?.activeModuleId).toBe("module-05");

    // Close drawer
    const closeBtn = container.querySelector('[data-testid="close-drawer-btn"]') as HTMLButtonElement;
    await act(async () => {
      closeBtn.click();
    });

    expect(latestState?.isDrawerOpen).toBe(false);
    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe("false");
  });

  it("returns DEFAULT_CONTEXT when useSeniorHelp is called outside SeniorHelpProvider", async () => {
    await act(async () => {
      root.render(<StateConsumer />);
    });

    expect(latestState).toBeDefined();
    expect(latestState?.helperEnabled).toBe(true);
    expect(latestState?.isDrawerOpen).toBe(false);
    expect(latestState?.activeModuleId).toBeNull();

    // Callbacks outside provider should be safe no-ops
    expect(() => latestState?.toggleHelperEnabled()).not.toThrow();
    expect(() => latestState?.openHelpDrawer("mod-test")).not.toThrow();
    expect(() => latestState?.closeHelpDrawer()).not.toThrow();
  });
});
