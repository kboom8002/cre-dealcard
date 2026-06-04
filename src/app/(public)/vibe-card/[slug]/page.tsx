import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { VTI_PROTOTYPES } from "@/lib/vibe/vibe-vector";
import { getTemplateById } from "@/lib/vibe/vibe-templates";
import { VibeCardView } from "./vibe-card-view";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// ── Data fetching (shared by metadata + page) ────────

async function getVibeCardData(slug: string) {
  const supabase = createServiceClient();
  const nameFromSlug = decodeURIComponent(slug).replace(/-/g, " ");

  // 1. Resolve profile by broker_profiles.slug first, or fallback to profiles id/name match
  let profileId: string | null = null;
  const decodedSlug = decodeURIComponent(slug);

  const { data: bpBySlug } = await supabase
    .from("broker_profiles")
    .select("user_id")
    .eq("slug", decodedSlug)
    .limit(1)
    .maybeSingle();

  if (bpBySlug) {
    profileId = bpBySlug.user_id;
  }

  let query = supabase
    .from("profiles")
    .select("id, display_name, company, phone, photo_url, tagline, role")
    .eq("role", "broker");

  if (profileId) {
    query = query.eq("id", profileId);
  } else {
    query = query.or(`id.eq.${slug},display_name.ilike.${nameFromSlug}`);
  }

  const { data: profile } = await query.limit(1).single();

  if (!profile) return null;

  // 2. Fetch broker_profiles (vibe data + specialties)
  const { data: bp } = await supabase
    .from("broker_profiles")
    .select(
      "specialty_regions, specialty_assets, bio, is_verified, vibe_vector, vibe_vti, vibe_complement, vibe_template_id, vibe_valence, vibe_trust, vibe_analyzed_at, license_number, career_start_year, total_deal_count_self, deal_size_range, deal_specialty, buyer_types, preferred_price_range, fee_policy, consult_methods, response_time_hours, kakao_channel, naver_blog_url, youtube_url, linkedin_url, seo_summary, office_district, languages",
    )
    .eq("user_id", profile.id)
    .single();

  // 3. Deal count
  const { count: dealCount } = await supabase
    .from("building_ssot_lite")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", profile.id);

  // 4. Active deal count
  const { count: activeCount } = await supabase
    .from("building_ssot_lite")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", profile.id)
    .eq("status", "public_signal_ready");

  // 5. Resolve VTI metadata
  const vtiMeta = bp?.vibe_vti
    ? VTI_PROTOTYPES.find((p) => p.meta.type === bp.vibe_vti)?.meta ?? null
    : null;

  // 6. Resolve template
  const template = bp?.vibe_template_id
    ? getTemplateById(bp.vibe_template_id) ?? null
    : null;

  return {
    profile: {
      id: profile.id,
      displayName: profile.display_name ?? nameFromSlug,
      company: profile.company ?? null,
      phone: profile.phone ?? null,
      photoUrl: profile.photo_url ?? null,
      tagline: profile.tagline ?? null,
    },
    broker: bp
      ? {
          specialtyRegions: (bp.specialty_regions as string[]) ?? [],
          specialtyAssets: (bp.specialty_assets as string[]) ?? [],
          bio: bp.bio as string | null,
          isVerified: bp.is_verified as boolean | null,
        }
      : null,
    vibe: bp?.vibe_vector
      ? {
          vector: bp.vibe_vector as Record<string, number>,
          vti: bp.vibe_vti as string,
          vtiMeta: vtiMeta
            ? {
                type: vtiMeta.type,
                label: vtiMeta.label_en,
                labelKo: vtiMeta.label_ko,
                emoji: vtiMeta.emoji,
                color: vtiMeta.color,
                description: vtiMeta.description,
              }
            : null,
          complement: bp.vibe_complement as Record<string, number> | null,
          templateId: bp.vibe_template_id as string | null,
          valence: bp.vibe_valence as number | null,
          trust: bp.vibe_trust as number | null,
          analyzedAt: bp.vibe_analyzed_at as string | null,
        }
      : null,
    template: template
      ? {
          id: template.id,
          name: template.name_en,
          nameKo: template.name_ko,
          css: template.css,
        }
      : null,
    professional: bp ? {
      licenseNumber: bp.license_number as string | null,
      careerStartYear: bp.career_start_year as number | null,
      totalDealCount: bp.total_deal_count_self as number | null,
      dealSizeRange: bp.deal_size_range as string | null,
      dealSpecialty: (bp.deal_specialty as string[]) ?? [],
      buyerTypes: (bp.buyer_types as string[]) ?? [],
      feePolicy: bp.fee_policy as string | null,
      consultMethods: (bp.consult_methods as string[]) ?? [],
      responseTimeHours: bp.response_time_hours as number | null,
      kakaoChannel: bp.kakao_channel as string | null,
      naverBlogUrl: bp.naver_blog_url as string | null,
      youtubeUrl: bp.youtube_url as string | null,
      linkedinUrl: bp.linkedin_url as string | null,
      seoSummary: bp.seo_summary as string | null,
      officeDistrict: bp.office_district as string | null,
      languages: (bp.languages as string[]) ?? ['한국어'],
    } : null,
    stats: {
      dealCount: dealCount ?? 0,
      activeCount: activeCount ?? 0,
    },
    slug,
  };
}

// ── Metadata ─────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getVibeCardData(slug);

  if (!data) {
    return { title: "Broker Not Found — DealCard" };
  }

  const { profile, broker, professional, vibe } = data;
  const regions = broker?.specialtyRegions ?? [];
  const assets = broker?.specialtyAssets ?? [];
  const title = `${profile.displayName} 공인중개사 | ${regions[0] ?? ""} ${assets[0] ?? "상업용 부동산"} 전문 | DealCard`;
  const careerYears = professional?.careerStartYear ? `${new Date().getFullYear() - professional.careerStartYear}년 경력` : "";
  const dealInfo = professional?.totalDealCount ? `, 누적 거래 ${professional.totalDealCount}건` : "";
  const trustInfo = vibe?.trust ? `, Vibe 신뢰도 ${Math.round(vibe.trust * 100)}%` : "";
  const description = professional?.seoSummary ?? broker?.bio ?? `${profile.displayName} 공인중개사의 ${regions[0] ?? ""} ${assets[0] ?? "상업용 부동산"} 전문 프로필. ${careerYears}${dealInfo}${trustInfo}.`;

  return {
    title,
    description,
    keywords: [
      `${profile.displayName} 공인중개사`,
      `${regions[0] ?? ""} 상업용 부동산`,
      `${assets[0] ?? "상업용 부동산"} 전문 중개`,
      "DealCard",
      "딜카드",
      "Vibe AI 명함",
    ],
    alternates: {
      canonical: `https://dealcard.kr/vibe-card/${slug}`,
    },
    openGraph: {
      title,
      description,
      type: "profile",
      url: `https://dealcard.kr/vibe-card/${slug}`,
      images: [
        {
          url: `/api/og/vibe-card/${slug}`,
          width: 1200,
          height: 630,
          alt: `${profile.displayName} 공인중개사 명함`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/api/og/vibe-card/${slug}`],
    },
  };
}

export const revalidate = 1800; // 30 minutes

// ── Page Component ───────────────────────────────────

export default async function VibeCardPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getVibeCardData(slug);

  if (!data) return notFound();

  return <VibeCardView data={data} />;
}
