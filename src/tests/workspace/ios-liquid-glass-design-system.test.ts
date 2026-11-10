/**
 * @file src/tests/workspace/ios-liquid-glass-design-system.test.ts
 * @description Contract tests for the Apple iOS 18 / macOS Sequoia "Cupertino Daylight & Spatial Liquid Glass" Design System.
 *
 * Verifies:
 * 1. Core CSS tokens (--ios-*) and 4-Tier Liquid Glass surface utilities in globals.css
 * 2. 100% preservation of Senior Ergonomic Typography (17px base) & Touch Target (48px/56px) invariants
 * 3. Hardware/Preview dark-lock isolation ([data-theme-lock="dark"]) and Institutional Slate preservation
 * 4. Spatial Chrome & Glass adoption across WorkspaceShell, BrokerSeniorLayout, WorkspaceBottomNav, and BrokerHome4Doors
 * 5. Mandatory negative pairs for every positive assertion (Rule 7)
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = process.cwd();

function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.resolve(ROOT, relPath), "utf-8");
}

describe("Apple iOS SOTA 'Cupertino Daylight & Spatial Liquid Glass' Design System Contracts", () => {
  const globalsCss = readProjectFile("src/app/globals.css");
  const workspaceShell = readProjectFile("src/components/workspace/WorkspaceShell.tsx");
  const brokerSeniorLayout = readProjectFile("src/components/layout/BrokerSeniorLayout.tsx");
  const workspaceBottomNav = readProjectFile("src/components/workspace/WorkspaceBottomNav.tsx");
  const brokerHome4Doors = readProjectFile("src/app/(broker)/broker/_components/BrokerHome4Doors.tsx");

  it("LG-01: globals.css defines Cupertino Daylight & Spatial Liquid Glass tokens (--ios-*) and reusable glass utilities", () => {
    // Positive assertions: Core iOS palette & glass tokens
    expect(globalsCss).toContain("--ios-canvas-bg: #F5F5F7;");
    expect(globalsCss).toContain("--ios-canvas-mesh:");
    expect(globalsCss).toContain("--ios-glass-chrome: rgba(255, 255, 255, 0.72);");
    expect(globalsCss).toContain("--ios-glass-card: rgba(255, 255, 255, 0.84);");
    expect(globalsCss).toContain("--ios-fill-tertiary: rgba(118, 118, 128, 0.11);");
    expect(globalsCss).toContain("--ios-label-primary: #1D1D1F;");
    expect(globalsCss).toContain("--ios-blue: #007AFF;");
    expect(globalsCss).toContain("--ios-indigo: #5856D6;");
    expect(globalsCss).toContain("--ios-green: #28CD41;");
    expect(globalsCss).toContain("--ios-amber: #FF9500;");
    expect(globalsCss).toContain("--ios-rose: #FF2D55;");

    // Reusable glass classes
    expect(globalsCss).toContain(".ios-glass-chrome");
    expect(globalsCss).toContain(".ios-glass-card");
    expect(globalsCss).toContain(".ios-glass-pill");
    expect(globalsCss).toContain(".ios-segmented-track");
    expect(globalsCss).toContain(".ios-segmented-pill");

    // Negative pair: .broker-paper-theme root no longer forces flat yellowish-beige #F3F2EE as --background
    expect(globalsCss).not.toMatch(/\.broker-paper-theme\s*\{[^}]*--background:\s*#F3F2EE/);
  });

  it("LG-02: globals.css preserves 100% of senior typography scales (17px base) and touch targets (48px/56px)", () => {
    // Positive assertions: Font scale & touch targets preserved
    expect(globalsCss).toContain("--font-scale-normal: 17px;");
    expect(globalsCss).toContain("--font-scale-large: 19px;");
    expect(globalsCss).toContain("--font-scale-xlarge: 21px;");
    expect(globalsCss).toContain("--text-base: 1.0625rem;");
    expect(globalsCss).toContain(".ws-touch-target");
    expect(globalsCss).toContain("min-height: 48px;");
    expect(globalsCss).toContain(".ws-touch-primary");
    expect(globalsCss).toContain("min-height: 56px;");
    expect(globalsCss).toContain("font-variant-numeric: tabular-nums;");

    // Negative pair: Base font scale is never shrunk to 12px or 14px
    expect(globalsCss).not.toContain("--font-scale-normal: 12px;");
    expect(globalsCss).not.toContain("--font-scale-normal: 14px;");
  });

  it("LG-03: globals.css upgrades callouts to iOS Tinted Glass while preserving [data-theme-lock='dark'] isolation", () => {
    // Positive assertions: Tinted glass callouts with backdrop-filter and specular rim
    expect(globalsCss).toContain("background-color: rgba(0, 122, 255, 0.085) !important;");
    expect(globalsCss).toContain("background-color: rgba(255, 149, 0, 0.09) !important;");
    expect(globalsCss).toContain("background-color: rgba(40, 205, 65, 0.09) !important;");
    expect(globalsCss).toContain("backdrop-filter: blur(12px) saturate(160%);");
    expect(globalsCss).toContain('[data-theme-lock="dark"]');

    // Negative pair: Callouts in .broker-paper-theme no longer force opaque #FFFBEB or #EFF6FF fills
    expect(globalsCss).not.toContain("background-color: #FFFBEB !important;");
    expect(globalsCss).not.toContain("background-color: #EFF6FF !important;");
  });

  it("LG-04: WorkspaceShell, BrokerSeniorLayout, and WorkspaceBottomNav adopt Frosted Glass Chrome & Segmented Controls", () => {
    // Positive assertions
    expect(workspaceShell).toContain("ios-glass-chrome");
    expect(workspaceShell).toContain("ios-glass-pill");
    expect(workspaceShell).toContain("ios-segmented-track");
    expect(workspaceShell).toContain("ios-segmented-pill");
    expect(workspaceShell).toContain("bg-[#F5F5F7]");

    expect(brokerSeniorLayout).toContain("ios-glass-chrome");
    expect(brokerSeniorLayout).toContain("ios-glass-pill");
    expect(brokerSeniorLayout).toContain("bg-[#F5F5F7]");

    expect(workspaceBottomNav).toContain("ios-glass-chrome");
    expect(workspaceBottomNav).toContain("backdrop-blur-2xl");

    // Negative pair: WorkspaceShell and BrokerSeniorLayout no longer hardcode flat #F3F2EE background
    expect(workspaceShell).not.toContain("bg-[#F3F2EE]");
    expect(brokerSeniorLayout).not.toContain("bg-[#F3F2EE]");
  });

  it("LG-05: BrokerHome4Doors replaces thick rainbow borders with Spatial Liquid Glass Cards and System Accents", () => {
    // Positive assertions
    expect(brokerHome4Doors).toContain("ios-glass-card");
    expect(brokerHome4Doors).toContain("backdrop-blur-2xl");
    expect(brokerHome4Doors).toContain("from-[#1A88FF] to-[#007AFF]");
    expect(brokerHome4Doors).toContain("from-[#24B63E] to-[#188C2C]");
    expect(brokerHome4Doors).toContain("from-[#6B69E6] to-[#4A48C4]");
    expect(brokerHome4Doors).toContain("from-[#FFAA00] to-[#E68600]");

    // Negative pair: Old thick pastel border classes are completely removed from 4-Door hub
    expect(brokerHome4Doors).not.toContain("border-blue-300 hover:border-blue-500 bg-white");
    expect(brokerHome4Doors).not.toContain("border-emerald-300 hover:border-emerald-500 bg-white");
  });
});
