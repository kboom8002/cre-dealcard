import type { NextConfig } from "next";

// ── H-01 보안 헤더 (S2-27) ───────────────────────────────────────────────────
// CSP 는 Report-Only 로만 추가(1주 관찰 후 enforce). 외부 의존은 코드 grep 기준:
//  Kakao SDK(t1.kakaocdn.net / dapi.kakao.com), Supabase, Pretendard(cdn.jsdelivr.net, globals.css @import),
//  Google Fonts, 별도 배포 앱(*.vercel.app), 이미지는 data:/blob:/https: 허용.
const isDev = process.env.NODE_ENV !== "production";
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}https://t1.kakaocdn.net https://dapi.kakao.com`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.kakao.com https://*.kakaocdn.net https://*.vercel.app https://credeal.net https://www.credeal.net https://dealcard.kr${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-src 'self' https://*.kakao.com",
  "frame-ancestors 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
// 카메라/마이크(사진 OCR capture, 음성 메모)는 same-origin 허용, 결제·USB 등은 차단
const PERMISSIONS_POLICY = "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()";
const COMMON_SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  // E2E 격리: 별도 포트 dev 서버가 사용자 dev 서버와 .next 를 공유하지 않도록 (미설정 시 기본 .next)
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
  },
  serverExternalPackages: ['sharp', 'pdf-parse'],
  outputFileTracingExcludes: {
    "*": [
      "./docs/**",
      "./src/tests/**",
      "./.git/**",
      "./node_modules/playwright/**",
      "./node_modules/playwright-core/**",
      "./node_modules/@playwright/**",
    ],
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        has: [
          {
            type: 'header',
            key: 'Origin',
            value: '(?<origin>https://credeal\\.net|https://dealcard\\.kr|http://localhost:\\d+)',
          },
        ],
        headers: [
          { key: 'Access-Control-Allow-Origin', value: ':origin' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With' },
          { key: 'Access-Control-Expose-Headers', value: 'Content-Disposition, Content-Length, X-Slide-Count, X-File-Size, X-Audit-Violations, X-Audit-Layout, X-Audit-Standard, X-Warnings, X-TTS-Source, X-Project-Stage' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
      // Fallback for requests without a matching Origin header
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://credeal.net' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With' },
          { key: 'Access-Control-Expose-Headers', value: 'Content-Disposition, Content-Length, X-Slide-Count, X-File-Size, X-Audit-Violations, X-Audit-Layout, X-Audit-Standard, X-Warnings, X-TTS-Source, X-Project-Stage' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
      // ── H-01 보안 헤더 ──
      // X-Frame-Options: 기본 DENY, 같은 오리진 iframe 미리보기 경로(/magazine/*, /dc/* — LiveDealCardPreviewCard 가 /dc/{id}?preview=1 을 iframe)는 SAMEORIGIN.
      // (동일 키 규칙 중복 적용을 피하려고 DENY 규칙에서 해당 경로를 제외)
      {
        source: '/((?!magazine(?:/|$)|dc(?:/|$)).*)',
        headers: [{ key: 'X-Frame-Options', value: 'DENY' }],
      },
      {
        source: '/magazine/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      {
        source: '/dc/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      {
        source: '/:path*',
        headers: COMMON_SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
