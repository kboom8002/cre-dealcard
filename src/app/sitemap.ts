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
 * All DB queries run concurrently with a strict 4-second timeout so `next build`
 * never hits the 60s static worker timeout on Vercel.
 */
import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/service";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://credeal.net";

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

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
      url: `${BASE_URL}/search`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.85,
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

  let dealPages: MetadataRoute.Sitemap = [];
  let brokerPages: MetadataRoute.Sitemap = [];
  let agoraThreadPages: MetadataRoute.Sitemap = [];
  let serviceCardPages: MetadataRoute.Sitemap = [];
  let pulsePages: MetadataRoute.Sitemap = [];
  let oiticlePages: MetadataRoute.Sitemap = [];
  let leasingPages: MetadataRoute.Sitemap = [];

  try {
    const supabase = createServiceClient();
    const emptyRes = { data: null as any[] | null };

    const [
      buildingsRes,
      brokersRes,
      threadsRes,
      cardsRes,
      pulsesRes,
      oiticlesRes,
      lPagesRes,
    ] = await Promise.all([
      withTimeout(
        supabase
          .from("building_ssot_lite")
          .select("id, area_signal, created_at")
          .not("area_signal", "is", null)
          .neq("status", "archived")
          .order("created_at", { ascending: false })
          .limit(500),
        4000,
        emptyRes,
      ),
      withTimeout(
        supabase
          .from("profiles")
          .select("id, created_at, broker_profiles!inner ( slug, is_public )")
          .eq("role", "broker")
          .eq("broker_profiles.is_public", true)
          .limit(300),
        4000,
        emptyRes,
      ),
      withTimeout(
        supabase
          .from("agora_threads")
          .select("id, category, created_at")
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(500),
        4000,
        emptyRes,
      ),
      withTimeout(
        supabase
          .from("service_cards")
          .select("id, service_category, created_at")
          .eq("status", "published")
          .eq("visibility", "public")
          .order("created_at", { ascending: false })
          .limit(300),
        4000,
        emptyRes,
      ),
      withTimeout(
        supabase
          .from("cre_pulses")
          .select("region, period_label, created_at")
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(200),
        4000,
        emptyRes,
      ),
      withTimeout(
        supabase
          .from("cre_oiticles")
          .select("slug, published_at")
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .limit(300),
        4000,
        emptyRes,
      ),
      withTimeout(
        supabase
          .from("leasing_pages")
          .select("slug, updated_at")
          .eq("status", "published")
          .order("updated_at", { ascending: false })
          .limit(300),
        4000,
        emptyRes,
      ),
    ]);

    if (buildingsRes?.data) {
      dealPages = buildingsRes.data.map((b: any) => {
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

    if (brokersRes?.data) {
      brokerPages = brokersRes.data.flatMap((b: any) => {
        const slug = b.broker_profiles?.slug || b.id;
        return [
          {
            url: `${BASE_URL}/broker-profile/${slug}`,
            lastModified: b.created_at ? new Date(b.created_at) : now,
            changeFrequency: "monthly" as const,
            priority: 0.5,
          },
        ];
      });
    }

    if (threadsRes?.data) {
      agoraThreadPages = threadsRes.data.map((t: any) => ({
        url: `${BASE_URL}/agora/${t.category}/${t.id}`,
        lastModified: t.created_at ? new Date(t.created_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.65,
      }));
    }

    if (cardsRes?.data) {
      serviceCardPages = cardsRes.data.map((c: any) => ({
        url: `${BASE_URL}/services/${c.service_category}/${c.id}`,
        lastModified: c.created_at ? new Date(c.created_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    }

    if (pulsesRes?.data) {
      pulsePages = pulsesRes.data.map((p: any) => ({
        url: `${BASE_URL}/pulse/${p.region}/${p.period_label}`,
        lastModified: p.created_at ? new Date(p.created_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
    }

    if (oiticlesRes?.data) {
      oiticlePages = oiticlesRes.data.map((o: any) => ({
        url: `${BASE_URL}/insight/${o.slug}`,
        lastModified: o.published_at ? new Date(o.published_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
    }

    if (lPagesRes?.data) {
      leasingPages = lPagesRes.data.map((p: any) => ({
        url: `${BASE_URL}/leasing/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.75,
      }));
    }
  } catch (err) {
    console.error("[sitemap] Degraded to static sitemap:", err);
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
