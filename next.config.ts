import type { NextConfig } from "next";
import { execSync } from "child_process";

function resolveBuildSha(): string {
  const fromEnv = (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_BUILD_SHA ||
    ""
  ).trim();
  if (fromEnv) return fromEnv.slice(0, 8);
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim()
      .slice(0, 8);
  } catch {
    return "local";
  }
}

const RESOLVED_BUILD_SHA = resolveBuildSha();
const RESOLVED_BUILD_TIMESTAMP =
  process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || new Date().toISOString();

// ── H-01 보안 헤더 (S2-27) ───────────────────────────────────────────────────
// CSP 는 `Content-Security-Policy` 헤더로 **강제(enforce)** 적용된다(Report-Only 아님 — 관찰 기간 종료).
//  새 외부 출처를 추가할 때는 아래 정책을 함께 갱신해야 한다. 외부 의존은 코드 grep 기준:
//  Kakao SDK(t1.kakaocdn.net / dapi.kakao.com), Supabase, Pretendard(cdn.jsdelivr.net, globals.css @import),
//  Google Fonts, 현재 배포 호스트(VERCEL_URL 정확 일치만 허용 — *.vercel.app 와일드카드 금지), 이미지는 data:/blob:/https: 허용.
const VERCEL_DEPLOYMENT_HOST_RE = /^[a-z0-9-]+\.vercel\.app$/i;

function buildCspPolicy(frameAncestors: "'none'" | "'self'"): string {
  const isDevRuntime = process.env.NODE_ENV !== "production";
  const rawVercelUrl = (process.env.VERCEL_URL ?? "").trim();
  const vercelConnectOrigin = VERCEL_DEPLOYMENT_HOST_RE.test(rawVercelUrl)
    ? ` https://${rawVercelUrl}`
    : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${isDevRuntime ? "'unsafe-eval' " : ""}https://t1.kakaocdn.net https://*.kakaocdn.net https://dapi.kakao.com https://*.daumcdn.net`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
    "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.kakao.com https://*.kakaocdn.net https://*.daumcdn.net${vercelConnectOrigin} https://credeal.net https://www.credeal.net${isDevRuntime ? " ws://localhost:* http://localhost:*" : ""}`,
    "frame-src 'self' https://*.kakao.com",
    `frame-ancestors ${frameAncestors}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

// 카메라/마이크(사진 OCR capture, 음성 메모)는 same-origin 허용, 결제·USB 등은 차단
const PERMISSIONS_POLICY = "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()";

const nextConfig: NextConfig = {
  // E2E 격리: 별도 포트 dev 서버가 사용자 dev 서버와 .next 를 공유하지 않도록 (미설정 시 기본 .next)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    NEXT_PUBLIC_BUILD_SHA: RESOLVED_BUILD_SHA,
    NEXT_PUBLIC_BUILD_TIMESTAMP: RESOLVED_BUILD_TIMESTAMP,
    NEXT_PUBLIC_VERCEL_ENV:
      process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 3600,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ["lucide-react", "motion", "recharts", "date-fns"],
  },
  serverExternalPackages: ['sharp', 'pdf-parse', 'heic-convert', 'heic-decode', 'libheif-js'],
  outputFileTracingExcludes: {
    "*": [
      "./docs/**",
      "./src/tests/**",
      "./.git/**",
      "./node_modules/playwright/**",
      "./node_modules/playwright-core/**",
      "./node_modules/@playwright/**",
      "./public/tutorials/**",
      "./e2e/**",
      "./scripts/**",
      "./supabase/**",
      "./test-results/**",
      "./playwright-report/**",
      "./node_modules/typescript/**",
      "./node_modules/vitest/**",
      "./CREDEAL_IM_MODERNIZATION/**",
      "./public/vibe-bg/**",
    ],
  },
  outputFileTracingIncludes: {
    // OG/이미지 라우트가 fs.readFile 로 읽는 번들 한글 폰트(Noto Sans KR, OFL) — src/lib/magazine/og-fonts.ts
    "/api/og/**": ["./public/fonts/**"],
    "/api/magazine/**": ["./public/fonts/**"],
    "/api/public/qa-sample-kit": ["./public/test-images/**", "./public/CREDEAL_rentroll_template_v1.5.xlsx"],
    "/api/**": ["./credeal/ssot/**"],
  },
  async redirects() {
    return [
      // WP-P1-11: 307 redirects for legacy deal card routes
      // Note: /broker/deal-card/:id is handled in src/proxy.ts so social crawlers (kakaotalk-scrap) can read OG tags without being redirected to /broker/w/dealcards -> /login.
      {
        source: '/broker/deal-card/new',
        destination: '/broker/w/dealcards?new=true',
        permanent: false,
      },
      // WP-P4b-05: 307 redirects for legacy IM lite routes
      {
        source: '/broker/buildings/:id/im-lite',
        destination: '/broker/w/im?buildingId=:id',
        permanent: false,
      },
      {
        source: '/broker/settings/profile',
        destination: '/broker/profile',
        permanent: false,
      },
    ];
  },
  async headers() {
    const isDevRuntime = process.env.NODE_ENV !== "production";
    const cspStrict = buildCspPolicy("'none'");
    const cspSameoriginIframe = buildCspPolicy("'self'");
    const commonSecurityHeaders = [
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
      { key: "Content-Security-Policy", value: cspStrict },
    ];
    const allowedOriginPattern = isDevRuntime
      ? '(?<origin>https://(?:www\\.)?credeal\\.net|http://localhost:\\d+)'
      : '(?<origin>https://(?:www\\.)?credeal\\.net)';
    return [
      // Default CORS baseline for /api/* (must precede conditional `has: Origin` rule because later matching Next.js header rules override earlier keys)
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://credeal.net' },
          { key: 'Vary', value: 'Origin' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With' },
          { key: 'Access-Control-Expose-Headers', value: 'Content-Disposition, Content-Length, X-Slide-Count, X-File-Size, X-Audit-Violations, X-Audit-Layout, X-Audit-Standard, X-Warnings, X-TTS-Source, X-Project-Stage' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
      // Dynamic Origin reflection for allowlisted apex & www domains (overrides baseline above when Origin matches)
      {
        source: '/api/:path*',
        has: [
          {
            type: 'header',
            key: 'Origin',
            value: allowedOriginPattern,
          },
        ],
        headers: [
          { key: 'Access-Control-Allow-Origin', value: ':origin' },
          { key: 'Vary', value: 'Origin' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With' },
          { key: 'Access-Control-Expose-Headers', value: 'Content-Disposition, Content-Length, X-Slide-Count, X-File-Size, X-Audit-Violations, X-Audit-Layout, X-Audit-Standard, X-Warnings, X-TTS-Source, X-Project-Stage' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
      // ── H-01 보안 헤더 ──
      // 기본 경로는 X-Frame-Options: DENY + CSP frame-ancestors 'none' 으로 클릭재킹 차단.
      // 같은 오리진 iframe 미리보기 경로(/magazine/*, /dc/*, /im-lite/*)만 뒤에 배치해 SAMEORIGIN/'self' 로 재정의.
      {
        source: '/:path*',
        headers: commonSecurityHeaders,
      },
      {
        source: '/((?!magazine(?:/|$)|dc(?:/|$)|im-lite(?:/|$)).*)',
        headers: [{ key: 'X-Frame-Options', value: 'DENY' }],
      },
      {
        source: '/magazine/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: cspSameoriginIframe },
        ],
      },
      {
        source: '/dc/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: cspSameoriginIframe },
        ],
      },
      {
        source: '/im-lite/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: cspSameoriginIframe },
        ],
      },
    ];
  },
};

export default nextConfig;
