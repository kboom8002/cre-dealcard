/**
 * Dynamic sitemap.xml generation
 *
 * Generates URLs for all public pages:
 *  - Static pages (/, /hub, /guide, /explore, /agora, /services)
 *  - Deal pages (/deal/[region] and /deal/[region]/[id])
 *  - Space pages (/space/[region])
 *  - Market pages (/market/[region])
 *  - Broker profile pages (/broker-profile/[slug])
 *  - Agora pages (/agora, /agora/[category], /agora/[category]/[threadId])
 *  - Service pages (/services, /services/[category], /services/[category]/[id])
 *
 * Revalidated every hour via ISR.
 */
import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/service";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://dealcard.kr";

/** Canonical Korean CRE region slugs */
const REGIONS = [
  "gbd",
  "ybd",
  "cbd",
  "seongsu",
  "pangyo",
  "mapo",
  "jongno",
  "hongdae",
] as const;

export const revalidate = 3600; // ISR – regenerate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  /* ── 1. Static pages ──────────────────────────────────────────── */
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/hub`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/guide`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/explore`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/building-radar`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/owner-readiness`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/agora`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.85,
    },
  ];

  /* ── 1b. Agora category pages (7 categories × AEO) ───────────── */
  const AGORA_CATEGORIES = ["sale", "lease", "invest", "legal", "market", "manage", "finance"];
  const agoraCategoryPages: MetadataRoute.Sitemap = AGORA_CATEGORIES.map((cat) => ({
    url: `${BASE_URL}/agora/${cat}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  /* ── 1c. Service pages (/services + 7 categories) ────────────── */
  const VENDOR_CATEGORIES = ["interior", "legal", "tax", "pm_fm", "finance", "appraisal", "insurance"];
  const serviceCategoryPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/services`, lastModified: now, changeFrequency: "daily" as const, priority: 0.85 },
    ...VENDOR_CATEGORIES.map((cat) => ({
      url: `${BASE_URL}/services/${cat}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.75,
    })),
  ];

  /* ── 1d. Pulse + sub-tabs (insight moved to /pulse?tab=insight) ── */
  const pulseStaticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/pulse`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 },
    { url: `${BASE_URL}/pulse?tab=insight`, lastModified: now, changeFrequency: "daily" as const, priority: 0.8 },
    { url: `${BASE_URL}/pulse?tab=expert`, lastModified: now, changeFrequency: "daily" as const, priority: 0.75 },
    { url: `${BASE_URL}/building-radar`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.85 },
    { url: `${BASE_URL}/owner-readiness`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8 },
  ];

  /* ── 2. Region index pages (deal / space / market) ────────────── */
  const regionPages: MetadataRoute.Sitemap = REGIONS.flatMap((region) => [
    {
      url: `${BASE_URL}/deal/${region}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/space/${region}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/market/${region}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
  ]);

  /* ── 3. Individual deal pages from Supabase ───────────────────── */
  let dealPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServiceClient();
    const { data: buildings } = await supabase
      .from("building_ssot_lite")
      .select("id, area_signal, created_at")
      .not("area_signal", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (buildings) {
      dealPages = buildings.map((b) => {
        // Normalise area_signal to a URL-safe slug
        const regionSlug =
          b.area_signal?.replace(/\s+/g, "-").toLowerCase() ?? "unknown";
        return {
          url: `${BASE_URL}/deal/${regionSlug}/${b.id}`,
          lastModified: b.created_at ? new Date(b.created_at) : now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        };
      });
    }
  } catch (err) {
    // If Supabase is unreachable, gracefully degrade to static-only sitemap
    console.error("[sitemap] Failed to fetch buildings:", err);
  }

  /* ── 4. Broker profile pages ──────────────────────────────────── */
  let brokerPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServiceClient();
    const { data: brokers } = await supabase
      .from("profiles")
      .select("id, display_name, created_at")
      .eq("role", "broker")
      .limit(1000);

    if (brokers) {
      brokerPages = brokers.map((b) => {
        const slug = b.display_name
          ? b.display_name.replace(/\s+/g, "-").toLowerCase()
          : b.id;
        return {
          url: `${BASE_URL}/broker-profile/${slug}`,
          lastModified: b.created_at ? new Date(b.created_at) : now,
          changeFrequency: "monthly" as const,
          priority: 0.5,
        };
      });
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch brokers:", err);
  }

  /* ── 5. Agora thread pages ──────────────────────────────────────── */
  let agoraThreadPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServiceClient();
    const { data: threads } = await supabase
      .from("agora_threads")
      .select("id, category, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (threads) {
      agoraThreadPages = threads.map((t) => ({
        url: `${BASE_URL}/agora/${t.category}/${t.id}`,
        lastModified: t.created_at ? new Date(t.created_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.65,
      }));
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch agora threads:", err);
  }

  /* ── 6. Service card pages ────────────────────────────────────── */
  let serviceCardPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServiceClient();
    const { data: cards } = await supabase
      .from("service_cards")
      .select("id, service_category, created_at")
      .eq("status", "published")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (cards) {
      serviceCardPages = cards.map((c) => ({
        url: `${BASE_URL}/services/${c.service_category}/${c.id}`,
        lastModified: c.created_at ? new Date(c.created_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch service cards:", err);
  }

  /* ── 7. Pulse pages ────────────────────────────────────────── */
  let pulsePages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServiceClient();
    const { data: pulses } = await supabase
      .from("cre_pulses")
      .select("region, period_label, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(500);

    if (pulses) {
      pulsePages = pulses.map((p) => ({
        url: `${BASE_URL}/pulse/${p.region}/${p.period_label}`,
        lastModified: p.created_at ? new Date(p.created_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch pulses:", err);
  }

  /* ── 8. Oiticle pages ──────────────────────────────────────── */
  let oiticlePages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServiceClient();
    const { data: oiticles } = await supabase
      .from("cre_oiticles")
      .select("slug, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1000);

    if (oiticles) {
      oiticlePages = oiticles.map((o) => ({
        url: `${BASE_URL}/insight/${o.slug}`,
        lastModified: o.published_at ? new Date(o.published_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch oiticles:", err);
  }

  /* ── 9. Leasing pages (/leasing/[slug]) ────────────────────── */
  let leasingPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServiceClient();
    const { data: lPages } = await supabase
      .from("leasing_pages")
      .select("slug, updated_at")
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(2000);

    if (lPages) {
      leasingPages = lPages.map((p) => ({
        url: `${BASE_URL}/leasing/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.75,
      }));
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch leasing pages:", err);
  }

  return [
    ...staticPages,
    ...agoraCategoryPages,
    ...serviceCategoryPages,
    ...pulseStaticPages,
    ...regionPages,
    ...dealPages,
    ...brokerPages,
    ...agoraThreadPages,
    ...serviceCardPages,
    ...pulsePages,
    ...oiticlePages,
    ...leasingPages,
  ];
}
