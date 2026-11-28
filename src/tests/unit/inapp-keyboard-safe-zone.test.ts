import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";
import {
  isInAppWebView,
  buildKakaoExternalOpenUrl,
} from "@/lib/ux/inapp-webview";
import {
  isTextInputElement,
  computeIsMobileKeyboardOpen,
} from "@/lib/ux/use-mobile-keyboard-safe-zone";

describe("inapp-webview detection & external browser escape URL", () => {
  const sampleUrl = "https://credeal.net/im-lite/bld-01?token=tok_abc";

  it("detects KAKAOTALK, NAVER, and Line/ in-app webviews", () => {
    const kakaoIos =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 KAKAOTALK 10.6.2";
    const kakaoAndroid =
      "Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 Chrome/123.0 Mobile Safari/537.36 KAKAOTALK 10.6.2";
    const naverUa =
      "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 NAVER(inapp; search; 1000; 12.6.1)";
    const lineUa =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1 Line/14.0.0";

    expect(isInAppWebView(kakaoIos)).toBe(true);
    expect(isInAppWebView(kakaoAndroid)).toBe(true);
    expect(isInAppWebView(naverUa)).toBe(true);
    expect(isInAppWebView(lineUa)).toBe(true);
  });

  it("builds Android intent:// URL with S.browser_fallback_url and Kakao iOS openExternal URL", () => {
    const kakaoAndroid =
      "Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 Chrome/123.0 Mobile Safari/537.36 KAKAOTALK 10.6.2";
    const naverAndroid =
      "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 NAVER(inapp; search; 1000; 12.6.1)";
    const lineAndroid =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36 Line/14.0";
    const kakaoIos =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 KAKAOTALK 10.6.2";

    const expectedFallback = encodeURIComponent(sampleUrl);
    const expectedIntent = `intent://credeal.net/im-lite/bld-01?token=tok_abc#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${expectedFallback};end`;

    expect(buildKakaoExternalOpenUrl(sampleUrl, kakaoAndroid)).toBe(expectedIntent);
    expect(buildKakaoExternalOpenUrl(sampleUrl, naverAndroid)).toBe(expectedIntent);
    expect(buildKakaoExternalOpenUrl(sampleUrl, lineAndroid)).toBe(expectedIntent);
    expect(buildKakaoExternalOpenUrl(sampleUrl, kakaoIos)).toBe(
      `kakaotalk://web/openExternal?url=${expectedFallback}`
    );
  });

  it("returns false and null for desktop Safari/Chrome and non-Line words", () => {
    const desktopSafari =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
    const desktopChrome =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

    expect(isInAppWebView(desktopSafari)).toBe(false);
    expect(isInAppWebView(desktopChrome)).toBe(false);
    expect(isInAppWebView("OnLineBrowser/2.0")).toBe(false);
    expect(buildKakaoExternalOpenUrl(sampleUrl, desktopSafari)).toBeNull();
    expect(buildKakaoExternalOpenUrl(sampleUrl, desktopChrome)).toBeNull();
  });
});

describe("computeIsMobileKeyboardOpen & isTextInputElement", () => {
  it("detects keyboard open when mobile viewport shrinks below 0.78 ratio (375x660 -> 375x400)", () => {
    expect(
      computeIsMobileKeyboardOpen({
        innerWidth: 375,
        innerHeight: 660,
        viewportHeight: 400,
        hasFocusedTextInput: false,
      })
    ).toBe(true);
  });

  it("detects keyboard open when a text input is focused on mobile", () => {
    expect(
      computeIsMobileKeyboardOpen({
        innerWidth: 375,
        innerHeight: 660,
        viewportHeight: 660,
        hasFocusedTextInput: true,
      })
    ).toBe(true);
  });

  it("stays false on desktop widths (1440x900) even with focused text input or small viewport", () => {
    expect(
      computeIsMobileKeyboardOpen({
        innerWidth: 1440,
        innerHeight: 900,
        viewportHeight: 900,
        hasFocusedTextInput: true,
      })
    ).toBe(false);
    expect(
      computeIsMobileKeyboardOpen({
        innerWidth: 1440,
        innerHeight: 900,
        viewportHeight: 400,
        hasFocusedTextInput: false,
      })
    ).toBe(false);
  });

  it("stays false on mobile when only a checkbox is focused and viewport is normal", () => {
    const checkboxMock = {
      tagName: "INPUT",
      type: "checkbox",
      getAttribute: (name: string) => (name === "type" ? "checkbox" : null),
    } as unknown as EventTarget;

    expect(isTextInputElement(checkboxMock)).toBe(false);
    expect(
      computeIsMobileKeyboardOpen({
        innerWidth: 375,
        innerHeight: 660,
        viewportHeight: 660,
        hasFocusedTextInput: isTextInputElement(checkboxMock),
      })
    ).toBe(false);
  });

  it("classifies text inputs, textarea, select, contenteditable, and non-text inputs accurately", () => {
    const makeEl = (
      tagName: string,
      attrs: Record<string, string> = {}
    ): EventTarget =>
      ({
        tagName,
        type: attrs.type,
        getAttribute: (name: string) => attrs[name] ?? null,
      }) as unknown as EventTarget;

    expect(isTextInputElement(makeEl("INPUT", { type: "text" }))).toBe(true);
    expect(isTextInputElement(makeEl("INPUT", { type: "tel" }))).toBe(true);
    expect(isTextInputElement(makeEl("INPUT", { type: "email" }))).toBe(true);
    expect(isTextInputElement(makeEl("INPUT"))).toBe(true);
    expect(isTextInputElement(makeEl("TEXTAREA"))).toBe(true);
    expect(isTextInputElement(makeEl("SELECT"))).toBe(true);
    expect(isTextInputElement(makeEl("DIV", { contenteditable: "true" }))).toBe(true);

    for (const nonText of [
      "checkbox",
      "radio",
      "file",
      "button",
      "submit",
      "reset",
      "hidden",
      "range",
      "color",
    ]) {
      expect(isTextInputElement(makeEl("INPUT", { type: nonText }))).toBe(false);
    }
    expect(isTextInputElement(null)).toBe(false);
  });
});

describe("floating-action-bar.tsx static hygiene", () => {
  it("imports inapp-webview helpers from @/lib/ux/inapp-webview without duplicate local function", () => {
    const fabPath = resolve(
      process.cwd(),
      "src/app/(public)/im-lite/[buildingId]/components/floating-action-bar.tsx"
    );
    const source = readFileSync(fabPath, "utf8");

    expect(source).toMatch(/from\s+["']@\/lib\/ux\/inapp-webview["']/);
    expect(source).not.toMatch(/function\s+isInAppWebView\b/);
    expect(source).not.toMatch(/function\s+buildKakaoExternalOpenUrl\b/);
  });
});
