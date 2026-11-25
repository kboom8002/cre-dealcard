// @vitest-environment jsdom
/**
 * @file src/tests/qa/beta-0to1-auth-setup.test.tsx
 * @description 10인 클로즈 베타 0→1 로그인·회원가입·홈 60초 법정 5항목 세팅 회귀/신규 검증.
 */

import fs from "fs";
import path from "path";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const h = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockReplace: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  mockSignUp: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockServiceUpsert: vi.fn(async () => ({ error: null })),
  mockCookieSet: vi.fn(),
  searchParamsStr: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: h.mockPush,
    refresh: h.mockRefresh,
    replace: h.mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(h.searchParamsStr),
  redirect: (url: string) => h.mockRedirect(url),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: h.mockCookieSet,
    get: vi.fn(),
    delete: vi.fn(),
    getAll: () => [],
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      signUp: h.mockSignUp,
      signInWithPassword: h.mockSignInWithPassword,
      signOut: h.mockSignOut,
    },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: h.mockServiceUpsert,
    }),
  }),
}));

import AuthLayout from "@/app/(auth)/layout";
import LoginPage from "@/app/(auth)/login/page";
import SignupPage from "@/app/(auth)/signup/page";
import { login, signup } from "@/app/actions/auth";
import { BrokerHome4Doors } from "@/app/(broker)/broker/_components/BrokerHome4Doors";
import type { AggregatedBrokerHomeData } from "@/domain/broker/home-aggregated";
import { PURGE_STORAGE_COOKIE_NAME } from "@/lib/workspace/storage-namespace";

const SUB14_CLASS_RE =
  /(?:^|\s)(?:(?:[a-z0-9-]+|\[[^\]\s]*\]):)*!?text-(?:xs|\[(?:[0-9]|1[0-3])(?:\.\d+)?px\])!?(?=$|\s|\/)/;

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

function buildFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function buildHomeData(overrides?: Partial<AggregatedBrokerHomeData>): AggregatedBrokerHomeData {
  return {
    profile: {
      displayName: "박성훈",
      photoUrl: null,
      role: "broker",
    },
    resumeItem: null,
    doors: {
      magazine: {
        id: "magazine",
        title: "부동산뉴스",
        subtitle: "주간·월간 고객 소식지",
        href: "/broker/w/newsletter",
        icon: "📰",
        shortcutNumber: 1,
        badge: {
          count: 0,
          label: "0건",
          href: "/broker/w/newsletter",
          highlight: false,
        },
      },
      dealcards: {
        id: "dealcards",
        title: "딜카드",
        subtitle: "30초 생성 / 카카오톡 전송",
        href: "/broker/w/dealcards",
        icon: "📄",
        shortcutNumber: 2,
        badge: {
          count: 0,
          label: "0건",
          href: "/broker/w/dealcards",
          highlight: false,
        },
      },
      im: {
        id: "im",
        title: "IM",
        subtitle: "3분 완성 / 발표자료 & PDF",
        href: "/broker/w/im",
        icon: "📊",
        shortcutNumber: 3,
        badge: {
          count: 0,
          label: "0건",
          href: "/broker/w/im",
          highlight: false,
        },
      },
      inbox: {
        id: "inbox",
        title: "고객 소통",
        subtitle: "열람 고객 / 피드백",
        href: "/broker/w/inbox",
        icon: "💬",
        shortcutNumber: 4,
        badge: {
          count: 0,
          label: "새 소식 없음",
          href: "/broker/w/inbox",
          highlight: false,
        },
      },
    },
    ...overrides,
  };
}

describe("10-Broker Closed Beta 0→1 Auth & 60s Setup Flow", () => {
  let container: HTMLDivElement;
  let root: Root;
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    h.mockPush.mockReset();
    h.mockRefresh.mockReset();
    h.mockReplace.mockReset();
    h.mockRedirect.mockClear();
    h.mockSignUp.mockReset();
    h.mockSignInWithPassword.mockReset();
    h.mockSignOut.mockReset();
    h.mockServiceUpsert.mockClear();
    h.searchParamsStr = "";

    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = `${PURGE_STORAGE_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("Track 1: renders AuthLayout Korean subtitle + 4 core pills, LoginPage password eye toggle, remembered email, logout banner & redirectTo link", async () => {
    const layoutHtml = renderToStaticMarkup(
      React.createElement(AuthLayout, null, React.createElement("div", null, "inner")),
    );
    expect(layoutHtml).toContain("상업용 부동산 중개인 전용");
    expect(layoutHtml).not.toContain("CRE Intelligence Platform");
    expect(layoutHtml).toContain("부동산뉴스");
    expect(layoutHtml).toContain("딜카드");
    expect(layoutHtml).toContain("고객 소통");

    window.localStorage.setItem("credeal_remembered_email", "beta@credeal.kr");
    document.cookie = `${PURGE_STORAGE_COOKIE_NAME}=1; path=/; SameSite=Lax`;
    h.searchParamsStr = "redirectTo=%2Fbroker%2Fw%2Fim";

    await act(async () => {
      root.render(React.createElement(LoginPage));
    });

    const emailInput = container.querySelector('input[name="email"]') as HTMLInputElement;
    const pwInput = container.querySelector('input[name="password"]') as HTMLInputElement;
    const pwToggle = container.querySelector(
      '[data-testid="login-password-toggle"]',
    ) as HTMLButtonElement;
    const loggedOutBanner = container.querySelector('[data-testid="login-logged-out-banner"]');
    const signupLink = container.querySelector('a[href^="/signup"]') as HTMLAnchorElement;

    expect(emailInput.value).toBe("beta@credeal.kr");
    expect(loggedOutBanner?.textContent).toContain("안전하게 로그아웃");
    expect(signupLink?.getAttribute("href")).toBe("/signup?redirectTo=%2Fbroker%2Fw%2Fim");

    expect(pwInput.type).toBe("password");
    expect(pwToggle.getAttribute("aria-label")).toBe("비밀번호 보기");
    await act(async () => {
      pwToggle.click();
    });
    expect(pwInput.type).toBe("text");
    expect(pwToggle.getAttribute("aria-label")).toBe("비밀번호 숨기기");
  });

  it("Track 1 & 2: differentiates login error states and returns needsEmailConfirmation on signUp session: null", async () => {
    h.mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "email_not_confirmed", message: "Email not confirmed" },
    });
    const unconfirmed = await login(
      undefined,
      buildFormData({ email: "new@credeal.kr", password: "Password123!" }),
    );
    expect(unconfirmed?.message).toContain("이메일 인증이 아직 완료되지 않았습니다");

    h.mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 429, message: "Too many requests" },
    });
    const throttled = await login(
      undefined,
      buildFormData({ email: "new@credeal.kr", password: "Password123!" }),
    );
    expect(throttled?.message).toContain("로그인 시도가 너무 많습니다");

    h.mockSignUp.mockResolvedValueOnce({
      data: { user: { id: "new-user-99" }, session: null },
      error: null,
    });
    const signupRes = await signup(
      undefined,
      buildFormData({
        displayName: "박성훈",
        email: "park99@credeal.kr",
        password: "Password123!",
        agreeTerms: "on",
        agreePrivacy: "on",
      }),
    );
    expect(signupRes).toEqual({
      needsEmailConfirmation: true,
      confirmedEmail: "park99@credeal.kr",
    });

    await act(async () => {
      root.render(React.createElement(SignupPage));
    });
    const nameInput = container.querySelector('input[name="displayName"]') as HTMLInputElement;
    expect(nameInput.placeholder).toBe("예: 박성훈");
    expect(container.textContent).toContain("담당자 성함");
    expect(container.textContent).toContain("가입 직후 60초 만에 입력합니다");
  });

  it("Track 3: QuickStatutorySetupCard renders on incomplete home, syncs self-rep checkbox, rejects sample reg number, and saves 5 statutory fields", async () => {
    // Omitted statutory stays clean (backward compatibility with home-v2.test.tsx)
    await act(async () => {
      root.render(React.createElement(BrokerHome4Doors, { data: buildHomeData() }));
    });
    expect(container.querySelector('[data-testid="home-quick-statutory-setup-card"]')).toBeNull();
    expect(container.querySelector('[data-testid="home-profile-missing-badge"]')).toBeNull();

    // Incomplete statutory renders 60s setup card + ?focus=statutory profile badge
    const incompleteData = buildHomeData({
      statutory: {
        isComplete: false,
        filledCount: 1,
        totalCount: 5,
        missingLabels: [
          "중개사무소 명칭",
          "중개사무소 소재지",
          "연락처(전화번호)",
          "중개사무소 등록번호",
        ],
        initialValues: {
          displayName: "박성훈",
          company: "",
          representativeName: "",
          officeRegNumber: "",
          officeAddress: "",
          phone: "",
        },
      },
    });

    await act(async () => {
      root.render(React.createElement(BrokerHome4Doors, { data: incompleteData }));
    });

    const profileBtn = container.querySelector(
      '[data-testid="home-profile-settings-btn"]',
    ) as HTMLAnchorElement;
    expect(profileBtn.getAttribute("href")).toBe("/broker/profile?focus=statutory");
    expect(container.querySelector('[data-testid="home-profile-missing-badge"]')?.textContent).toContain(
      "미입력 (1/5)",
    );
    expect(
      container.querySelector('[data-testid="quick-setup-self-rep-preview"]')?.textContent,
    ).toContain("대표자: 박성훈");

    // Toggle self-rep checkbox off and enter separate representative name
    const selfRepToggle = container.querySelector(
      '[data-testid="quick-setup-self-rep-toggle"]',
    ) as HTMLInputElement;
    await act(async () => {
      selfRepToggle.click();
    });
    const repInput = container.querySelector("#quick-setup-rep") as HTMLInputElement;
    expect(repInput).not.toBeNull();

    const companyInput = container.querySelector("#quick-setup-company") as HTMLInputElement;
    const regInput = container.querySelector("#quick-setup-reg") as HTMLInputElement;
    const addrInput = container.querySelector("#quick-setup-address") as HTMLInputElement;
    const phoneInput = container.querySelector("#quick-setup-phone") as HTMLInputElement;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    // Sample registration number must block before fetch
    await act(async () => {
      setInputValue(companyInput, "한강부동산중개법인");
      setInputValue(repInput, "정대표");
      setInputValue(regInput, "11680-2024-00123");
      setInputValue(addrInput, "서울특별시 영등포구 양평로 10, 1층");
      setInputValue(phoneInput, "01012345678");
    });
    expect(phoneInput.value).toBe("010-1234-5678");

    const form = container.querySelector(
      '[data-testid="home-quick-statutory-setup-card"] form',
    ) as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="quick-setup-error-alert"]')?.textContent).toContain(
      "샘플 개설등록번호",
    );

    // Replace with real registration number -> PUT /api/broker/profile succeeds
    await act(async () => {
      setInputValue(regInput, "11560-2024-00088");
    });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/broker/profile");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({
      display_name: "박성훈",
      company: "한강부동산중개법인",
      representative_name: "정대표",
      office_reg_number: "11560-2024-00088",
      office_address: "서울특별시 영등포구 양평로 10, 1층",
      phone: "010-1234-5678",
    });

    expect(container.querySelector('[data-testid="home-quick-statutory-setup-card"]')).toBeNull();
    expect(container.querySelector('[data-testid="home-statutory-complete-banner"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="home-profile-missing-badge"]')).toBeNull();
  });

  it("Track 3 & 4: supports dismiss on home card, groups office_reg_number inside Section 1 on /broker/profile, and enforces >=14px typography", async () => {
    const incompleteData = buildHomeData({
      statutory: {
        isComplete: false,
        filledCount: 1,
        totalCount: 5,
        missingLabels: ["중개사무소 명칭"],
        initialValues: {
          displayName: "박성훈",
          company: "",
          representativeName: "",
          officeRegNumber: "",
          officeAddress: "",
          phone: "",
        },
      },
    });
    await act(async () => {
      root.render(React.createElement(BrokerHome4Doors, { data: incompleteData }));
    });
    const dismissBtn = container.querySelector(
      '[data-testid="quick-setup-dismiss-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      dismissBtn.click();
    });
    expect(container.querySelector('[data-testid="home-quick-statutory-setup-card"]')).toBeNull();
    expect(container.querySelector('[data-testid="home-profile-missing-badge"]')).not.toBeNull();

    const profileSrc = readRepoFile("src/app/(broker)/broker/profile/page.tsx");
    const regIdx = profileSrc.indexOf('id="profile-office-reg-number"');
    const toggleIdx = profileSrc.indexOf('data-testid="profile-optional-sections-toggle"');
    expect(regIdx).toBeGreaterThan(-1);
    expect(toggleIdx).toBeGreaterThan(regIdx);

    for (const relPath of [
      "src/app/(auth)/layout.tsx",
      "src/app/(auth)/login/page.tsx",
      "src/app/(auth)/signup/page.tsx",
      "src/app/(broker)/broker/_components/BrokerHome4Doors.tsx",
      "src/app/(broker)/broker/_components/QuickStatutorySetupCard.tsx",
      "src/app/(broker)/broker/profile/page.tsx",
    ]) {
      const src = readRepoFile(relPath);
      expect(src, `${relPath} must avoid <14px classes`).not.toMatch(SUB14_CLASS_RE);
    }
  });
});
