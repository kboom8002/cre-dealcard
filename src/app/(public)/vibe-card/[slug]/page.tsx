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

  // 1. Resolve profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, company, phone, photo_url, tagline, role")
    .or(`id.eq.${slug},display_name.ilike.${nameFromSlug}`)
    .eq("role", "broker")
    .limit(1)
    .single();

  if (!profile) return null;

  // 2. Fetch broker_profiles (vibe data + specialties)
  const { data: bp } = await supabase
    .from("broker_profiles")
    .select(
      "specialty_regions, specialty_assets, bio, is_verified, vibe_vector, vibe_vti, vibe_complement, vibe_template_id, vibe_valence, vibe_trust, vibe_analyzed_at",
    )
    .eq("user_id", profile.id)
    .single();

  // 3. Deal count
  const { count: dealCount } = await supabase
    .from("building_ssot_lite")
    .select("id", { count: "exact", head: true })
    .eq("broker_id", profile.id);

  // 4. Active deal count
  const { count: activeCount } = await supabase
    .from("building_ssot_lite")
    .select("id", { count: "exact", head: true })
    .eq("broker_id", profile.id)
    .eq("status", "active");

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

  const { profile, vibe } = data;
  const vtiLabel = vibe?.vtiMeta?.label ?? "CRE Professional";
  const title = `${profile.displayName} — ${vtiLabel} | DealCard Vibe Card`;
  const description = vibe
    ? `${profile.displayName}의 Vibe AI 명함. ${vibe.vtiMeta?.emoji ?? ""} ${vibe.vtiMeta?.labelKo ?? ""} — DealCard에서 확인하세요.`
    : `${profile.displayName} 중개인의 Vibe AI 명함을 확인하세요. DealCard 검증 프로필.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      images: [`/api/og/vibe-card/${slug}`],
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
