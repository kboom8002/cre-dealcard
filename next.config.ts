import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
