"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Award, HelpCircle, Share2, Sparkles } from "lucide-react";
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

interface VibeCardTemplate {
  id: string;
  name: string;
  nameKo: string;
  css: VibeTemplateCssVars;
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

interface VibeCardStats {
  dealCount: number;
  activeCount: number;
}

interface VibeCardDetailsProps {
  profile: VibeCardProfile;
  broker: VibeCardBroker | null;
  vibe: VibeCardVibe | null;
  template: VibeCardTemplate | null;
  professional: VibeCardProfessional | null;
  stats: VibeCardStats;
  faqItems?: Array<{q: string; a: string}>;
}

// ── Accordion Item Component ──────────────────────────

function AccordionItem({
  title,
  icon,
  isOpen,
  onClick,
  css,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onClick: () => void;
  css: VibeTemplateCssVars;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all duration-200"
      style={{
        backgroundColor: css.cardBg,
        borderColor: isOpen ? `${css.accentColor}30` : `${css.accentColor}10`,
        boxShadow: isOpen ? `0 4px 20px -5px ${css.accentColor}15` : "none",
      }}
    >
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between p-4 text-left transition-colors duration-150"
        style={{
          color: css.textColor,
        }}
      >
        <div className="flex items-center gap-3">
          <span style={{ color: css.accentColor }}>{icon}</span>
          <span className="text-sm font-semibold tracking-tight">{title}</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ color: css.subtextColor }}
        >
          <ChevronDown size={18} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <div
              className="px-4 pb-5 pt-1 text-xs leading-relaxed space-y-4"
              style={{
                color: css.textColor,
                borderTop: `1px solid ${css.accentColor}0a`,
              }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Component ───────────────────────────────────

export function VibeCardDetails({
  profile,
  broker,
  vibe,
  template,
  professional,
  stats,
  faqItems,
}: VibeCardDetailsProps) {
  const [openSection, setOpenSection] = useState<string | null>("professional");

  const css = useMemo(() => {
    return template?.css ?? {
      bgGradient: "linear-gradient(135deg, #0b0f19 0%, #1a2333 50%, #0f1729 100%)",
      accentColor: "#8b5cf6",
      textColor: "#f1f5f9",
      subtextColor: "#94a3b8",
      ringColor: "#8b5cf6",
      ringGlow: "0 0 24px rgba(139,92,246,0.25)",
      badgeBg: "rgba(139,92,246,0.12)",
      cardBg: "#0f172a",
      fontFamily: "'Pretendard', sans-serif",
    };
  }, [template]);

  const toggleSection = (section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  // Filter out empty FAQ items (both q and a must be filled)
  const validFaqItems = (faqItems || []).filter(
    (item) => item.q?.trim() && item.a?.trim()
  );

  return (
    <div className="w-full space-y-3">
      {/* ── 1. 전문 프로필 ── */}
      {professional && (
        <AccordionItem
          title="전문 프로필"
          icon={<Award size={18} />}
          isOpen={openSection === "professional"}
          onClick={() => toggleSection("professional")}
          css={css}
        >
          <div className="space-y-3.5">
            {broker?.bio && (
              <div className="text-xs opacity-90 leading-relaxed border-l-2 pl-3" style={{ borderColor: css.accentColor, whiteSpace: 'pre-wrap' }}>
                {broker.bio}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {professional.licenseNumber && (
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                  <p className="opacity-50 font-medium">등록 자격증</p>
                  <p className="font-bold mt-0.5">공인중개사 {professional.licenseNumber}</p>
                </div>
              )}
              {professional.careerStartYear && (
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                  <p className="opacity-50 font-medium">경력 요약</p>
                  <p className="font-bold mt-0.5">경력 {new Date().getFullYear() - professional.careerStartYear}년차</p>
                </div>
              )}
            </div>

            {professional.dealSpecialty.length > 0 && (
              <div>
                <p className="text-[10px] opacity-50 font-bold mb-1.5 uppercase">딜 전문 분야</p>
                <div className="flex flex-wrap gap-1.5">
                  {professional.dealSpecialty.map((item, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-medium"
                      style={{ backgroundColor: `${css.accentColor}12`, color: css.textColor }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {professional.buyerTypes.length > 0 && (
              <div>
                <p className="text-[10px] opacity-50 font-bold mb-1.5 uppercase">주요 매수자 유형</p>
                <div className="flex flex-wrap gap-1.5">
                  {professional.buyerTypes.map((item, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-medium"
                      style={{ backgroundColor: `${css.ringColor}12`, color: css.textColor }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </AccordionItem>
      )}


      {/* ── 4. 소셜 채널 ── */}
      {professional && (professional.naverBlogUrl || professional.youtubeUrl || professional.linkedinUrl) && (
        <AccordionItem
          title="소셜 링크 및 미디어"
          icon={<Share2 size={18} />}
          isOpen={openSection === "socials"}
          onClick={() => toggleSection("socials")}
          css={css}
        >
          <div className="grid grid-cols-2 gap-2 text-center text-[10px] font-bold">
            {professional.naverBlogUrl && (
              <a
                href={professional.naverBlogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-xl border transition-colors"
                style={{
                  backgroundColor: `${css.accentColor}0a`,
                  color: css.textColor,
                  borderColor: `${css.accentColor}15`,
                }}
              >
                📝 네이버 블로그
              </a>
            )}
            {professional.youtubeUrl && (
              <a
                href={professional.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-xl border transition-colors"
                style={{
                  backgroundColor: `${css.accentColor}0a`,
                  color: css.textColor,
                  borderColor: `${css.accentColor}15`,
                }}
              >
                📺 유튜브 채널
              </a>
            )}
            {professional.linkedinUrl && (
              <a
                href={professional.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-xl border transition-colors"
                style={{
                  backgroundColor: `${css.accentColor}0a`,
                  color: css.textColor,
                  borderColor: `${css.accentColor}15`,
                }}
              >
                💼 링크드인 프로필
              </a>
            )}
          </div>
        </AccordionItem>
      )}

      {/* ── 5. 자주 묻는 질문 (FAQ) — 사용자 입력 항목만 표시 ── */}
      {validFaqItems.length > 0 && (
        <AccordionItem
          title="자주 묻는 질문 (FAQ)"
          icon={<HelpCircle size={18} />}
          isOpen={openSection === "faq"}
          onClick={() => toggleSection("faq")}
          css={css}
        >
          <div className="space-y-4">
            {validFaqItems.map((faq, idx) => (
              <div key={idx} className="space-y-1.5 p-3 rounded-xl bg-white/5 border border-white/5">
                <p className="font-bold flex items-start gap-1.5" style={{ color: css.accentColor }}>
                  <span className="font-mono text-sm leading-none">Q.</span>
                  <span className="tracking-tight">{faq.q}</span>
                </p>
                <p className="opacity-90 pl-4 leading-relaxed tracking-tight text-[11px]">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </AccordionItem>
      )}
    </div>
  );
}
