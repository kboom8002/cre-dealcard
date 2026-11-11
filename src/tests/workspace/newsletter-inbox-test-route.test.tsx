// @vitest-environment jsdom
/**
 * @file src/tests/workspace/newsletter-inbox-test-route.test.tsx
 * @description Verification suite for /newsletter-inbox-test MECE 6-Axis 36-Item Click-Through Workbench
 */
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import NewsletterInboxTestPage from "@/app/newsletter-inbox-test/page";
import {
  MECE_AXES,
  MECE_36_STEPS,
  RED_FLAG_ORACLES,
  SIGN_OFF_GATES,
} from "@/lib/testguide/newsletter-inbox-mece-data";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("/newsletter-inbox-test MECE Click-Through Workbench", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("maintains strict MECE integrity across 6 axes, 36 sequential steps, and 6 red-flag oracles", () => {
    expect(MECE_AXES).toHaveLength(6);
    expect(MECE_36_STEPS).toHaveLength(36);
    expect(RED_FLAG_ORACLES).toHaveLength(6);
    expect(SIGN_OFF_GATES).toHaveLength(3);

    const codes = new Set<string>();
    MECE_36_STEPS.forEach((step, idx) => {
      expect(step.stepNumber).toBe(idx + 1);
      expect(codes.has(step.code)).toBe(false);
      codes.add(step.code);
      expect(step.actionSteps.length).toBeGreaterThan(0);
      expect(step.passCriteria.length).toBeGreaterThan(0);
      expect(step.failTrap.length).toBeGreaterThan(5);
    });

    // Sum of axis itemCount must equal 36
    const axisSum = MECE_AXES.reduce((acc, ax) => acc + ax.itemCount, 0);
    expect(axisSum).toBe(36);
  });

  it("supports step-by-step click-through PASS auto-advance, FAIL blocker gating, link vault, and markdown sign-off export", async () => {
    await act(async () => {
      root.render(<NewsletterInboxTestPage />);
    });

    // Starts at Step 1: [NL-101]
    const stepCode = container.querySelector('[data-testid="active-step-code"]');
    expect(stepCode?.textContent).toContain("[NL-101]");
    expect(container.querySelector('[data-testid="verdict-badge"]')?.textContent).toContain(
      "점검 진행 중 (0/36)"
    );

    // Click [PASS 판정 & 다음 문항 ->]
    const passBtn = container.querySelector(
      '[data-testid="btn-pass-and-next"]'
    ) as HTMLButtonElement;
    expect(passBtn).not.toBeNull();

    await act(async () => {
      passBtn.click();
    });

    // Advances automatically to [NL-102] and updates PASS count
    expect(container.querySelector('[data-testid="active-step-code"]')?.textContent).toContain(
      "[NL-102]"
    );
    expect(container.querySelector('[data-testid="header-pass-count"]')?.textContent).toContain(
      "PASS 1"
    );

    // Jump to [NL-202] (copy trap verification) via left rail
    const navNl202 = container.querySelector(
      '[data-testid="nav-step-NL-202"]'
    ) as HTMLButtonElement;
    expect(navNl202).not.toBeNull();
    await act(async () => {
      navNl202.click();
    });

    expect(container.querySelector('[data-testid="active-step-code"]')?.textContent).toContain(
      "[NL-202]"
    );
    const copyTrapBtn = container.querySelector(
      '[data-testid="copy-snippet-nl202-trap-headline"]'
    ) as HTMLButtonElement;
    expect(copyTrapBtn).not.toBeNull();
    await act(async () => {
      copyTrapBtn.click();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "상가 매수 시 일부 '공간'의 호황을 건물 전체 임대수입으로 계산해선 안 된다"
    );

    // Jump to S0 item [IB-502] and mark FAIL -> verdict must turn S0 Blocker STOP
    const navIb502 = container.querySelector(
      '[data-testid="nav-step-IB-502"]'
    ) as HTMLButtonElement;
    await act(async () => {
      navIb502.click();
    });
    const failBtn = container.querySelector(
      '[data-testid="btn-mark-fail"]'
    ) as HTMLButtonElement;
    await act(async () => {
      failBtn.click();
    });
    expect(container.querySelector('[data-testid="verdict-badge"]')?.textContent).toContain(
      "출시 중단 (S0 치명 1건)"
    );

    // Toggle Scratch Link Vault
    const vaultBtn = container.querySelector(
      '[data-testid="toggle-link-vault-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      vaultBtn.click();
    });
    expect(container.querySelector('[data-testid="scratch-link-vault"]')).not.toBeNull();

    // Switch to Matrix view, then Report view
    const matrixTab = container.querySelector(
      '[data-testid="mode-tab-matrix"]'
    ) as HTMLButtonElement;
    await act(async () => {
      matrixTab.click();
    });
    expect(container.querySelector('[data-testid="matrix-sheet-view"]')).not.toBeNull();

    const reportTab = container.querySelector(
      '[data-testid="mode-tab-report"]'
    ) as HTMLButtonElement;
    await act(async () => {
      reportTab.click();
    });
    const previewText =
      container.querySelector('[data-testid="report-markdown-preview"]')?.textContent ?? "";
    expect(previewText).toContain("뉴스레터 · 소통관리함 상용화 MECE 완전 점검 결과서");
    expect(previewText).toContain("[IB-502]");
    expect(previewText).toContain("S0 Blocker 결함 1건");
  });
});
