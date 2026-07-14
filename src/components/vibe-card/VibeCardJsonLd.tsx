import type { VibeTemplateCssVars } from "@/lib/vibe/vibe-templates";

// ── Types ─────────────────────────────────────────────

interface VibeCardProfile {
  id: string;
  displayName: string;
  cardTitle?: string;
  company: string | null;
  phone: string | null;
  photoUrl: string | null;
  tagline: string | null;
}

interface VibeCardBroker {
  specialtyRegions: string[];
  specialtyAssets: string[];
  bio: string | null;
  isVerified: boolean | null;
}

interface VibeCardVibe {
  vector: Record<string, number>;
  vti: string;
  vtiMeta: {
    type: string;
    label: string;
    labelKo: string;
    emoji: string;
    color: string;
    description: string;
  } | null;
  complement: Record<string, number> | null;
  templateId: string | null;
  valence: number | null;
  trust: number | null;
  analyzedAt: string | null;
}

interface VibeCardProfessional {
  licenseNumber: string | null;
  careerStartYear: number | null;
  totalDealCount: number | null;
  dealSizeRange: string | null;
  dealSpecialty: string[];
  buyerTypes: string[];
  feePolicy: string | null;
  consultMethods: string[];
  responseTimeHours: number | null;
  kakaoChannel: string | null;
  naverBlogUrl: string | null;
  youtubeUrl: string | null;
  linkedinUrl: string | null;
  seoSummary: string | null;
  officeDistrict: string | null;
  languages: string[];
}

export interface VibeCardJsonLdProps {
  profile: VibeCardProfile;
  broker: VibeCardBroker | null;
  vibe: VibeCardVibe | null;
  professional: VibeCardProfessional | null;
  stats: {
    dealCount: number;
    activeCount: number;
  };
  slug: string;
  faqItems?: Array<{q: string; a: string}>;
}

export function VibeCardJsonLd({
  profile,
  broker,
  vibe,
  professional,
  stats,
  slug,
  faqItems,
}: VibeCardJsonLdProps) {
  const name = profile.displayName;
  const companyName = profile.company || `${name} 공인중개사무소`;
  const pageUrl = `https://credeal.net/vibe-card/${slug}`;
  const description = professional?.seoSummary || broker?.bio || `${name} 공인중개사의 DealCard Vibe 프로필입니다.`;

  // 1. SameAs URLs array
  const sameAs: string[] = [];
  if (professional?.naverBlogUrl) sameAs.push(professional.naverBlogUrl);
  if (professional?.youtubeUrl) sameAs.push(professional.youtubeUrl);
  if (professional?.linkedinUrl) sameAs.push(professional.linkedinUrl);
  if (professional?.kakaoChannel) sameAs.push(`https://pf.kakao.com/${professional.kakaoChannel}`);

  // 2. Person Schema
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${pageUrl}#person`,
    "name": name,
    "jobTitle": "공인중개사 (Licensed Real Estate Broker)",
    "description": description,
    "image": profile.photoUrl || undefined,
    "url": pageUrl,
    "sameAs": sameAs.length > 0 ? sameAs : undefined,
    "worksFor": {
      "@type": "Organization",
      "name": companyName,
    },
    "hasCredential": professional?.licenseNumber ? {
      "@type": "EducationalOccupationalCredential",
      "credentialCategory": "공인중개사 자격증 (Licensed Real Estate Agent License)",
      "recognizedBy": {
        "@type": "Organization",
        "name": "국토교통부 (Ministry of Land, Infrastructure and Transport)",
      },
      "credentialNumber": professional.licenseNumber,
    } : undefined,
    "areaServed": broker?.specialtyRegions.map((region) => ({
      "@type": "AdministrativeArea",
      "name": region,
    })),
    "knowsAbout": [
      ...(broker?.specialtyAssets || []),
      ...(professional?.dealSpecialty || []),
      "상업용 부동산 중개",
      "빌딩 매매",
      "사무실 임대차",
    ],
  };

  // 3. RealEstateAgent Schema
  const agentSchema = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    "@id": `${pageUrl}#agent`,
    "name": companyName,
    "url": pageUrl,
    "image": profile.photoUrl || undefined,
    "telephone": profile.phone || undefined,
    "priceRange": professional?.dealSizeRange || "₩₩₩",
    "areaServed": broker?.specialtyRegions.map((region) => ({
      "@type": "AdministrativeArea",
      "name": region,
    })),
    "address": {
      "@type": "PostalAddress",
      "addressLocality": professional?.officeDistrict || "서울특별시",
      "addressCountry": "KR",
    },
  };

  // 4. FAQ Schema — only render when user has defined FAQ items
  const validFaq = (faqItems || []).filter(item => item.q?.trim() && item.a?.trim());

  const faqSchema = validFaq.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    "mainEntity": validFaq.map(item => ({
      "@type": "Question",
      "name": item.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.a,
      },
    })),
  } : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(agentSchema) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}
    </>
  );
}
