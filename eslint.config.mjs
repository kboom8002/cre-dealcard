import { defineConfig, globalIgnores } from "eslint/config";
import { builtinRules } from "eslint/use-at-your-own-risk";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// ─────────────────────────────────────────────────────────────────────────────
// WP-7.3A lint guard restructure
//
// Flat config merges rule *entries* per file: a later block that re-declares
// `no-restricted-syntax` REPLACES the earlier selector list instead of adding to it.
// The 14px block used to overlap the T-01 magazine paths (src/app/(magazine)/…,
// src/components/magazine/**, src/components/ui/**), silently dropping the KST
// `toISOString().slice(0, 10)` and arbitrary-px guards there.
//
// Fix: the T-01 magazine guard runs under its own rule id
// (`cre-magazine/no-restricted-syntax`, a re-registration of the core rule), so both
// guards always apply on overlapping paths and each keeps its own severity:
//   - 14px guard   → core `no-restricted-syntax`, "error" (CI sub-14 gate counts this id)
//   - T-01 guard   → `cre-magazine/no-restricted-syntax`, "warn" (unchanged level)
// ─────────────────────────────────────────────────────────────────────────────

const creMagazinePlugin = {
  meta: { name: "cre-magazine" },
  rules: {
    "no-restricted-syntax": builtinRules.get("no-restricted-syntax"),
  },
};

/** T-01: magazine area (UTC date slice → '@/lib/magazine/kst', arbitrary px text → type tokens). */
const MAGAZINE_GUARD_FILES = [
  "src/domain/magazine/**/*.{ts,tsx}",
  "src/lib/magazine/**/*.{ts,tsx}",
  "src/app/**/magazine/**/*.{ts,tsx}",
  "src/app/(broker)/broker/magazine-editor/**/*.{ts,tsx}",
  "src/app/(broker)/broker/w/newsletter/**/*.{ts,tsx}",
  "src/app/api/**/magazine*/**/*.{ts,tsx}",
  "src/components/magazine*/**/*.{ts,tsx}",
  "src/components/ui/**/*.{ts,tsx}",
];

const MAGAZINE_GUARD_SELECTORS = [
  {
    selector:
      "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString'][arguments.0.value=0][arguments.1.value=10]",
    message:
      "toISOString().slice(0, 10) 은 UTC 날짜다. KST 날짜는 '@/lib/magazine/kst' 의 todayKst()/toKstDate() 를 사용하세요.",
  },
  {
    selector: "Literal[value=/text-\\[\\d+px\\]/]",
    message: "임의 px 텍스트(text-[11px]) 금지. globals.css 의 타입 토큰(text-caption/label/body/reader/title/display) 사용.",
  },
  {
    selector: "TemplateElement[value.raw=/text-\\[\\d+px\\]/]",
    message: "임의 px 텍스트(text-[11px]) 금지. globals.css 의 타입 토큰 사용.",
  },
];

/**
 * WP 4-E / WP-7.3A: 14px (text-sm) minimum font-size guard (buyer-facing & broker UI).
 * Keep in sync with the sub-14 step in .github/workflows/ci.yml.
 */
export const SUB14_LOCKED_FILES = [
  "src/components/workspace/**/*.{ts,tsx}",
  "src/components/teaser/**/*.{ts,tsx}",
  "src/components/public/**/*.{ts,tsx}",
  "src/app/(public)/dc/**/*.{ts,tsx}",
  "src/app/(broker)/broker/tutorial/**/*.{ts,tsx}",
  "src/app/(magazine)/magazine/**/*.{ts,tsx}",
  "src/app/(broker)/broker/magazine-editor/**/*.{ts,tsx}",
  "src/components/magazine/**/*.{ts,tsx}",
  "src/components/magazine-editor/**/*.{ts,tsx}",
  "src/components/ui/**/*.{ts,tsx}",
  "src/components/help/**/*.{ts,tsx}",
  "src/components/layout/**/*.{ts,tsx}",
  "src/app/(auth)/**/*.{ts,tsx}",
  "src/app/(broker)/broker/clients/**/*.{ts,tsx}",
  "src/app/(public)/im-pro/**/*.{ts,tsx}",
  "src/app/(broker)/broker/w/inbox/**/*.{ts,tsx}",
  "src/app/(broker)/broker/w/im/**/*.{ts,tsx}",
  "src/app/(broker)/broker/w/newsletter/**/*.{ts,tsx}",
  "src/app/(broker)/broker/w/magazine/**/*.{ts,tsx}",
  "src/app/(public)/m/**/*.{ts,tsx}",
  "src/app/(public)/im-lite/**/*.{ts,tsx}",
  "src/app/(public)/nda/**/*.{ts,tsx}",
  "src/app/(public)/powered-by/**/*.{ts,tsx}",
  "src/app/(public)/guide/**/*.{ts,tsx}",
  "src/app/(public)/broker-profile/**/*.{ts,tsx}",
  "src/app/(admin)/**/*.{ts,tsx}",
  "src/app/admin/**/*.{ts,tsx}",
  "src/components/admin/**/*.{ts,tsx}",
  // WP-7.3A / WP-7.7C additions
  "src/app/(broker)/broker/buildings/**/*.{ts,tsx}",
  "src/app/(broker)/broker/im-approval/**/*.{ts,tsx}",
  "src/app/(broker)/broker/inbox/**/*.{ts,tsx}",
  "src/components/feedback/**/*.{ts,tsx}",
  "src/app/(broker)/broker/w/dealcards/**/*.{ts,tsx}",
  "src/components/broker/deal-card/**/*.{ts,tsx}",
  "src/app/(broker)/broker/deal-card/**/*.{ts,tsx}",
  "src/app/(broker)/broker/_components/**/*.{ts,tsx}",
  "src/app/(broker)/broker/profile/**/*.{ts,tsx}",
  "src/app/(public)/hub/**/*.{ts,tsx}",
  "src/app/(public)/search/**/*.{ts,tsx}",
  "src/app/(public)/deal/**/*.{ts,tsx}",
  "src/app/(public)/space/**/*.{ts,tsx}",
  "src/components/hub/**/*.{ts,tsx}",
  "src/components/search/**/*.{ts,tsx}",
  "src/app/(broker)/broker/basic-im-studio/**/*.{ts,tsx}",
  "src/components/broker/im-studio/**/*.{ts,tsx}",
  "src/components/im/**/*.{ts,tsx}",
  "src/components/gate/**/*.{ts,tsx}",
  "src/app/qa-full-loop/**/*.{ts,tsx}",
  "src/app/qa-full-loop-v2/**/*.{ts,tsx}",
  "src/app/qa-broker/full-loop/**/*.{ts,tsx}",
  "src/app/error.tsx",
  "src/app/global-error.tsx",
  "src/app/(public)/error.tsx",
  "src/app/(broker)/error.tsx",
  // Wave 4C: active public, landing & shared UI 14px minimum readability expansion
  "src/app/page.tsx",
  "src/components/landing/**/*.{ts,tsx}",
  "src/components/common/**/*.{ts,tsx}",
  "src/components/forms/**/*.{ts,tsx}",
  "src/components/cards/**/*.{ts,tsx}",
  "src/app/(public)/privacy/**/*.{ts,tsx}",
  "src/app/(public)/terms/**/*.{ts,tsx}",
  "src/app/(public)/owner-readiness/**/*.{ts,tsx}",
  "src/app/(public)/explore/**/*.{ts,tsx}",
  "src/app/(public)/insight/**/*.{ts,tsx}",
];

/**
 * Sub-14px text token: `text-xs` or `text-[0-13(.x)px]`, including Tailwind variant
 * prefixes (`sm:`, `md:hover:`, `[&_p]:`), the important modifier (`!text-xs`,
 * `text-xs!`) and a line-height suffix (`text-xs/5`).
 */
const SUB14_TOKEN_REGEX =
  "(?:^|\\s)(?:(?:[a-z0-9-]+|\\[[^\\]\\s]*\\]):)*!?text-(?:xs|\\[(?:[0-9]|1[0-3])(?:\\.\\d+)?px\\])!?(?=$|\\s|\\/)";

const SUB14_MESSAGE =
  "시니어 가독성 정책: 14px 미만 텍스트 토큰(text-xs, text-[13px] 이하, sm:/hover:/! 변형 포함) 사용 금지. text-sm(>=14px) 이상을 사용하세요.";

const SUB14_SELECTORS = [
  { selector: `Literal[value=/${SUB14_TOKEN_REGEX}/]`, message: SUB14_MESSAGE },
  { selector: `TemplateElement[value.raw=/${SUB14_TOKEN_REGEX}/]`, message: SUB14_MESSAGE },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next 가 jsx-a11y 플러그인을 이미 등록하므로 recommended 의 rules 만 병합한다
  // ("Cannot redefine plugin jsx-a11y" ConfigError 방지).
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // T-01: 매거진 영역 가드 — 별도 rule id 로 14px 가드와 충돌 없이 겹치는 경로에도 적용된다.
  {
    files: MAGAZINE_GUARD_FILES,
    plugins: { "cre-magazine": creMagazinePlugin },
    rules: {
      "cre-magazine/no-restricted-syntax": ["warn", ...MAGAZINE_GUARD_SELECTORS],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // WP 4-E: 14px (text-sm) minimum font-size guard across buyer-facing & broker workspace UI
  {
    files: SUB14_LOCKED_FILES,
    rules: {
      "no-restricted-syntax": ["error", ...SUB14_SELECTORS],
    },
  },
  // Predictive Error Audit: Block module/sync TDZ forward-references in server API & domain layers
  {
    files: ["src/app/api/**/*.{ts,tsx}", "src/domain/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-use-before-define": [
        "error",
        { functions: false, classes: true, variables: true },
      ],
    },
  },
]);

export default eslintConfig;
