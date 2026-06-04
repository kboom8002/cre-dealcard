import type { VibeTemplateCssVars } from "@/lib/vibe/vibe-templates";

// ── Types ─────────────────────────────────────────────

interface VibeCardProfile {
  id: string;
  displayName: string;
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
}

export function VibeCardJsonLd({
  profile,
  broker,
  vibe,
  professional,
  stats,
  slug,
}: VibeCardJsonLdProps) {
  const name = profile.displayName;
  const companyName = profile.company || `${name} 공인중개사무소`;
  const pageUrl = `https://dealcard.kr/vibe-card/${slug}`;
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

  // 4. FAQ Schema
  const region = broker?.specialtyRegions[0] || "서울 주요 권역";
  const assets = broker?.specialtyAssets.join(", ") || "상업용 부동산";
  const experience = professional?.careerStartYear
    ? `${new Date().getFullYear() - professional.careerStartYear}년`
    : null;
  const vtiName = vibe?.vtiMeta?.labelKo || "Vibe AI 분석";

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    "mainEntity": [
      {
        "@type": "Question",
        "name": `${name} 공인중개사의 주요 전문 분야와 권역은 어디인가요?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${name} 공인중개사는 ${region} 지역을 중심으로 ${assets} 임대 및 매매 거래를 전문으로 진행하고 있습니다.${
            experience ? ` 해당 분야에서 약 ${experience}의 풍부한 실무 경력을 보유하고 있습니다.` : ""
          } 최근 DealCard 플랫폼에서 총 ${stats.dealCount}건의 딜카드를 관리 중입니다.`,
        },
      },
      {
        "@type": "Question",
        "name": "상담 및 수수료 정책은 어떻게 되나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${
            professional?.consultMethods && professional.consultMethods.length > 0
              ? `${professional.consultMethods.join(" 및 ")}을 통해 상담이 가능하며, `
              : ""
          }${
            professional?.feePolicy
              ? `수수료는 '${professional.feePolicy}' 정책을 따르고 있습니다.`
              : "구체적인 수수료 및 계약 조건은 개별 상담 시 상세하게 안내해 드립니다."
          }${
            professional?.responseTimeHours
              ? ` 문의 시 보통 ${professional.responseTimeHours}시간 이내에 신속하게 회신을 드립니다.`
              : ""
          }`,
        },
      },
      {
        "@type": "Question",
        "name": "중개사의 VTI 스타일 분석 결과는 무엇을 의미하나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `DealCard Vibe AI가 중개사의 실제 사진과 프로필 데이터를 기반으로 시각적/전문적 스타일을 분석한 결과입니다. ${name} 중개사는 '${vtiName}' 유형으로 분류되었으며, 분석 결과 ${
            vibe?.trust ? `신뢰 지수 ${Math.round(vibe.trust * 100)}%` : ""
          }${vibe?.valence ? `, 호감도 ${Math.round(vibe.valence * 100)}%` : ""}의 고유한 Vibe 템플릿과 상보적 비주얼이 자동 적용되어 있습니다.`,
        },
      },
    ],
  };

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </>
  );
}
