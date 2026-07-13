import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { VTI_PROTOTYPES } from "@/lib/vibe/vibe-vector";
import { getTemplateById, ALL_VIBE_TEMPLATES } from "@/lib/vibe/vibe-templates";
import { matchTemplates } from "@/lib/vibe/vibe-complement";
import type { Vibe7D } from "@/lib/vibe/vibe-vector";
import { VibeCardManage } from "./vibe-card-manage";

export const metadata: Metadata = {
  title: "내 Vibe 명함 관리 | DealCard",
  description: "AI Vibe 명함을 관리하고, 재생성하고, 공유하세요.",
};

export default async function VibeCardManagePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  // 1. profiles
  const { data: profile } = await svc
    .from("profiles")
    .select("id, display_name, company, phone, photo_url, tagline")
    .eq("id", user.id)
    .single();

  // 2. broker_profiles (없으면 자동 생성)
  const bpSelect = "slug, specialty_regions, specialty_assets, bio, is_verified, vibe_vector, vibe_vti, vibe_complement, vibe_template_id, vibe_valence, vibe_trust, vibe_analyzed_at, license_number, career_start_year, total_deal_count_self, deal_size_range, deal_specialty, buyer_types, preferred_price_range, fee_policy, consult_methods, response_time_hours, kakao_channel, naver_blog_url, youtube_url, linkedin_url, seo_summary, office_district, languages, photo_url, logo_company_url, logo_partner_url, card_name, card_title";

  let { data: bp } = await svc
    .from("broker_profiles")
    .select(bpSelect)
    .eq("user_id", user.id)
    .maybeSingle();

  // broker_profiles 행이 없으면 자동 생성 (slug 포함)
  if (!bp) {
    const baseName = (profile?.display_name || user.id.substring(0, 8)) as string;
    const slugBase = baseName.toLowerCase().replace(/[^a-z0-9\uAC00-\uD7A3]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const newSlug = `${slugBase}-${user.id.substring(0, 6)}`;
    await svc.from("broker_profiles").insert({
      user_id: user.id,
      slug: newSlug,
    });
    // 재조회
    ({ data: bp } = await svc
      .from("broker_profiles")
      .select(bpSelect)
      .eq("user_id", user.id)
      .maybeSingle());
  }

  // 3. slug 자동 생성 (행은 있는데 slug만 없는 경우)
  let slug = bp?.slug || null;
  if (bp && !slug) {
    const baseName = (profile?.display_name || user.id.substring(0, 8)) as string;
    const slugBase = baseName.toLowerCase().replace(/[^a-z0-9\uAC00-\uD7A3]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    slug = `${slugBase}-${user.id.substring(0, 6)}`;
    await svc.from("broker_profiles").update({ slug }).eq("user_id", user.id);
  }

  // 4. Deal counts
  const { count: dealCount } = await svc
    .from("building_ssot_lite")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);

  const { count: activeCount } = await svc
    .from("building_ssot_lite")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .eq("status", "public_signal_ready");

  // 5. VTI metadata
  const vtiMeta = bp?.vibe_vti
    ? VTI_PROTOTYPES.find((p) => p.meta.type === bp.vibe_vti)?.meta ?? null
    : null;

  // 6. Template
  let template = bp?.vibe_template_id
    ? getTemplateById(bp.vibe_template_id) ?? null
    : null;

  if (!template && bp?.vibe_vector && bp?.vibe_complement) {
    const matches = matchTemplates(
      bp.vibe_vector as Vibe7D,
      bp.vibe_complement as Vibe7D,
      ALL_VIBE_TEMPLATES,
      1
    );
    if (matches[0]) template = matches[0].template;
  }

  // 7. Build data
  const data = {
    slug: slug || "",
    profile: {
      id: user.id,
      displayName: (bp?.card_name as string) || profile?.display_name || "중개인",
      cardTitle: (bp?.card_title as string) || "공인중개사",
      company: profile?.company ?? null,
      phone: profile?.phone ?? null,
      photoUrl: profile?.photo_url ?? bp?.photo_url ?? null,
      tagline: profile?.tagline ?? null,
    },
    broker: bp ? {
      specialtyRegions: (bp.specialty_regions as string[]) ?? [],
      specialtyAssets: (bp.specialty_assets as string[]) ?? [],
      bio: bp.bio as string | null,
      isVerified: bp.is_verified as boolean | null,
    } : null,
    vibe: bp?.vibe_vector ? {
      vector: bp.vibe_vector as Record<string, number>,
      vti: bp.vibe_vti as string,
      vtiMeta: vtiMeta ? {
        type: vtiMeta.type,
        label: vtiMeta.label_en,
        labelKo: vtiMeta.label_ko,
        emoji: vtiMeta.emoji,
        color: vtiMeta.color,
        description: vtiMeta.description,
      } : null,
      complement: bp.vibe_complement as Record<string, number> | null,
      templateId: bp.vibe_template_id as string | null,
      valence: bp.vibe_valence as number | null,
      trust: bp.vibe_trust as number | null,
      analyzedAt: bp.vibe_analyzed_at as string | null,
    } : null,
    template: template ? {
      id: template.id,
      name: template.name_en,
      nameKo: template.name_ko,
      css: template.css,
    } : null,
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
      languages: (bp.languages as string[]) ?? [],
    } : null,
    stats: {
      dealCount: dealCount ?? 0,
      activeCount: activeCount ?? 0,
    },
    logoCompanyUrl: (bp?.logo_company_url as string) || null,
    logoPartnerUrl: (bp?.logo_partner_url as string) || null,
  };

  // 8. Latest magazine (for card back face preview)
  if (slug) {
    const { data: latestMag } = await svc
      .from("magazine_issues")
      .select("issue_date, content")
      .eq("broker_id", slug)
      .order("issue_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestMag) {
      (data as any).latestMagazine = {
        date: latestMag.issue_date,
        headline: (latestMag.content as any)?.headline || '주간 시장 리포트',
        url: `/magazine/${slug}/${latestMag.issue_date}`,
        marketTemp: (latestMag.content as any)?.market_temp ?? undefined,
      };
    }
  }

  return <VibeCardManage data={data} />;
}
