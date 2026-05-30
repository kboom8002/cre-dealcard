/**
 * robots.txt generation
 *
 * - Allows all crawlers on public pages
 * - Blocks authenticated areas (/broker/, /api/, /admin/)
 * - References the sitemap
 */
import type { MetadataRoute } from "next";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://dealcard.kr";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/broker/", "/api/", "/admin/"],
      },
      {
        userAgent: "GPTBot",
        allow: ["/pulse/", "/insight/", "/agora/", "/services/", "/deal/"],
        disallow: ["/broker/", "/api/", "/admin/"],
      },
      {
        userAgent: "ClaudeBot",
        allow: ["/pulse/", "/insight/", "/agora/", "/services/", "/deal/"],
        disallow: ["/broker/", "/api/", "/admin/"],
      },
      {
        userAgent: "PerplexityBot",
        allow: ["/pulse/", "/insight/", "/agora/", "/services/", "/deal/"],
        disallow: ["/broker/", "/api/", "/admin/"],
      },
      {
        userAgent: "Google-Extended",
        allow: ["/pulse/", "/insight/", "/agora/", "/services/", "/deal/"],
        disallow: ["/broker/", "/api/", "/admin/"],
      },
      {
        userAgent: "anthropic-ai",
        allow: ["/pulse/", "/insight/", "/agora/", "/services/", "/deal/"],
        disallow: ["/broker/", "/api/", "/admin/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
