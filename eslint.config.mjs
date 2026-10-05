import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next 가 jsx-a11y 플러그인을 이미 등록하므로 recommended 의 rules 만 병합한다
  // ("Cannot redefine plugin jsx-a11y" ConfigError 방지).
  { rules: jsxA11y.flatConfigs.recommended.rules },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // T-01: 매거진 영역 가드 (UTC 날짜 slice 금지 → @/lib/magazine/kst, 임의 px 텍스트 금지 → 타입 토큰)
  {
    files: [
      "src/domain/magazine/**/*.{ts,tsx}",
      "src/lib/magazine/**/*.{ts,tsx}",
      "src/app/**/magazine/**/*.{ts,tsx}",
      "src/app/api/**/magazine*/**/*.{ts,tsx}",
      "src/components/magazine*/**/*.{ts,tsx}",
      "src/components/ui/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
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
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;
