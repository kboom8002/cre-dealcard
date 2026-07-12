"use client";

import { useState, useMemo } from "react";
import { motion, useSpring, useTransform, useMotionValue } from "motion/react";
import { Phone, Mail, MapPin, Briefcase, Award, MessageSquare } from "lucide-react";
import Image from "next/image";
import type { VibeTemplateCssVars } from "@/lib/vibe/vibe-templates";
import type { VibeVtiType } from "@/lib/vibe/vibe-vector";
import { VibeBackground } from "./VibeBackground";
import { VibePhotoRing } from "./VibePhotoRing";
import { VibeCardFlip } from "./VibeCardFlip";

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

interface VibeCardTemplate {
  id: string;
  name: string;
  nameKo: string;
  css: VibeTemplateCssVars;
}

interface VibeCardStats {
  dealCount: number;
  activeCount: number;
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

export interface VibeCardHeroProps {
  profile: VibeCardProfile;
  broker: VibeCardBroker | null;
  vibe: VibeCardVibe | null;
  template: VibeCardTemplate | null;
  professional: VibeCardProfessional | null;
  stats: VibeCardStats;
  /** 회사 로고 URL (좌측 하단) */
  logoCompanyUrl?: string;
  /** 제휴사 로고 URL (우측 하단) */
  logoPartnerUrl?: string;
  /** 이메일 주소 */
  email?: string;
  /** 최신 매거진 (카드 뒷면에 표시) */
  latestMagazine?: {
    date: string;
    headline: string;
    url: string;
    marketTemp?: string;
  } | null;
}

// ── Market Temperature Config ────────────────────────

const MARKET_TEMP_MAP: Record<string, { emoji: string; color: string; label: string }> = {
  '적극 매수': { emoji: '🔥', color: '#ef4444', label: '적극 매수' },
  '선별 매수': { emoji: '📈', color: '#f59e0b', label: '선별 매수' },
  '관망':      { emoji: '⏸️', color: '#6b7280', label: '관망' },
  '조정 대기': { emoji: '📉', color: '#3b82f6', label: '조정 대기' },
  '위기 경계': { emoji: '🚨', color: '#dc2626', label: '위기 경계' },
};

// ── Contact Row ──────────────────────────────────────

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
  textColor,
  subtextColor,
  accentColor,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  href?: string;
  textColor: string;
  subtextColor: string;
  accentColor: string;
}) {
  const content = (
    <div className="flex items-center gap-3 py-1.5">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${accentColor}15` }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: accentColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-medium opacity-50" style={{ color: subtextColor }}>{label}</p>
        <p className="text-[12px] font-semibold truncate" style={{ color: textColor }}>{value}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block hover:opacity-80 transition-opacity" onClick={(e) => e.stopPropagation()}>
        {content}
      </a>
    );
  }
  return content;
}

// ── Main Component ───────────────────────────────────

export function VibeCardHero({
  profile,
  broker,
  vibe,
  template,
  professional,
  stats,
  logoCompanyUrl,
  logoPartnerUrl,
  email,
  latestMagazine,
}: VibeCardHeroProps) {
  // Use template CSS or default dark theme
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

  // Motion values for tilt & hologram
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 200, mass: 0.5 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [15, -15]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-15, 15]), springConfig);

  const sheenX = useSpring(useTransform(x, [-0.5, 0.5], [100, 0]), springConfig);
  const sheenY = useSpring(useTransform(y, [-0.5, 0.5], [100, 0]), springConfig);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left - width / 2;
    const mouseY = e.clientY - rect.top - height / 2;

    x.set(mouseX / width);
    y.set(mouseY / height);
  };

  const handlePointerLeave = () => {
    x.set(0);
    y.set(0);
  };

  const careerYears = professional?.careerStartYear
    ? new Date().getFullYear() - professional.careerStartYear
    : null;

  const companyLogo = logoCompanyUrl || "/logos/default-company-logo.png";
  const partnerLogo = logoPartnerUrl || "/logos/default-partner-logo.png";

  // Card Front Face — Professional Business Card
  const renderFront = () => (
    <VibeBackground
      css={css}
      className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/5 flex flex-col justify-between min-h-[520px]"
    >
      {/* Hologram Reflection Overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none mix-blend-color-dodge z-10"
        style={{
          background: useTransform(
            [sheenX, sheenY],
            ([sx, sy]) =>
              `radial-gradient(circle at ${sx}% ${sy}%, rgba(255, 255, 255, 0.15) 0%, transparent 60%),
               linear-gradient(${sx}deg, rgba(255, 255, 255, 0) 30%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0) 70%)`
          ),
        }}
      />

      {/* ── 1. Top Section: Avatar + Identity ── */}
      <div className="flex flex-col items-center pt-8 pb-3 px-6 text-center">
        <VibePhotoRing
          photoUrl={profile.photoUrl ?? undefined}
          name={profile.displayName}
          vtiType={(vibe?.vti as VibeVtiType) ?? "strategist"}
          ringColor={css.ringColor}
          ringGlow={css.ringGlow}
          coherence={vibe?.trust ?? 0.7}
          size={100}
        />
        <h2 className="mt-4 text-xl font-bold tracking-tight" style={{ color: css.textColor }}>
          {profile.displayName}
        </h2>
        <p className="text-xs mt-0.5 font-medium" style={{ color: css.accentColor }}>
          공인중개사
        </p>
        {profile.company && (
          <p className="text-[11px] mt-1 font-medium" style={{ color: css.subtextColor }}>
            {profile.company}
          </p>
        )}
        {profile.tagline && (
          <p className="text-[11px] leading-relaxed mt-2 italic opacity-80 max-w-[260px]" style={{ color: css.subtextColor }}>
            &ldquo;{profile.tagline}&rdquo;
          </p>
        )}
      </div>

      {/* ── 2. Contact Info Section ── */}
      <div className="px-6 space-y-0.5">
        <div
          className="rounded-2xl px-4 py-2 border border-white/5 backdrop-blur-md"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.12)" }}
        >
          {profile.phone && (
            <ContactRow
              icon={Phone}
              label="전화"
              value={profile.phone}
              href={`tel:${profile.phone}`}
              textColor={css.textColor}
              subtextColor={css.subtextColor}
              accentColor={css.accentColor}
            />
          )}
          {email && (
            <ContactRow
              icon={Mail}
              label="이메일"
              value={email}
              href={`mailto:${email}`}
              textColor={css.textColor}
              subtextColor={css.subtextColor}
              accentColor={css.accentColor}
            />
          )}
          {(broker?.specialtyRegions?.length ?? 0) > 0 && (
            <ContactRow
              icon={MapPin}
              label="전문 지역"
              value={broker!.specialtyRegions.slice(0, 3).join(" · ")}
              textColor={css.textColor}
              subtextColor={css.subtextColor}
              accentColor={css.accentColor}
            />
          )}
        </div>
      </div>

      {/* ── 3. Career Summary ── */}
      <div className="px-6 py-2">
        <div className="flex items-center justify-center gap-4 text-[10px]" style={{ color: css.subtextColor }}>
          {stats.dealCount > 0 && (
            <span className="flex items-center gap-1">
              <Briefcase className="w-3 h-3" style={{ color: css.accentColor }} />
              거래 {stats.dealCount}건
            </span>
          )}
          {professional?.totalDealCount && (
            <span className="flex items-center gap-1">
              <Briefcase className="w-3 h-3" style={{ color: css.accentColor }} />
              누적 {professional.totalDealCount}건+
            </span>
          )}
          {careerYears && careerYears > 0 && (
            <span className="flex items-center gap-1">
              <Award className="w-3 h-3" style={{ color: css.accentColor }} />
              경력 {careerYears}년
            </span>
          )}
          {professional?.licenseNumber && (
            <span className="flex items-center gap-1">
              <Award className="w-3 h-3" style={{ color: css.accentColor }} />
              자격증 보유
            </span>
          )}
        </div>
      </div>

      {/* ── 4. CTA Buttons ── */}
      <div className="px-6 pt-1 space-y-2 relative z-20">
        <a
          href={`/expert-note/request?broker=${encodeURIComponent(profile.displayName)}`}
          className="flex items-center justify-center gap-1.5 w-full rounded-2xl py-3 text-xs font-semibold shadow-lg hover:shadow-xl active:scale-[0.98] transition-all"
          style={{
            background: `linear-gradient(135deg, ${css.accentColor}, ${css.ringColor})`,
            color: "#fff",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <MessageSquare size={14} />
          전문가 상담 요청
        </a>

        <div className="flex gap-2">
          {profile.phone && (
            <a
              href={`tel:${profile.phone}`}
              className="flex-1 flex items-center justify-center gap-1 w-full rounded-xl py-2.5 text-[11px] font-semibold border backdrop-blur-sm transition-all active:scale-[0.97]"
              style={{
                backgroundColor: `${css.accentColor}12`,
                color: css.accentColor,
                borderColor: `${css.accentColor}25`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Phone size={12} />
              전화 연결
            </a>
          )}
          {professional?.kakaoChannel && (
            <a
              href={`https://pf.kakao.com/${professional.kakaoChannel}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1 w-full rounded-xl py-2.5 text-[11px] font-semibold transition-all active:scale-[0.97]"
              style={{
                backgroundColor: "#FEE500",
                color: "#000",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              💬 카카오 채널
            </a>
          )}
        </div>
      </div>

      {/* ── 5. Logo Overlay ── */}
      <div className="px-6 pt-3 pb-4 flex items-end justify-between relative z-20">
        <div className="w-[80px] h-[36px] relative opacity-70">
          <Image
            src={companyLogo}
            alt="회사 로고"
            fill
            className="object-contain object-left"
            sizes="80px"
          />
        </div>
        <div className="w-[80px] h-[36px] relative opacity-70">
          <Image
            src={partnerLogo}
            alt="제휴사 로고"
            fill
            className="object-contain object-right"
            sizes="80px"
          />
        </div>
      </div>

      {/* ── 6. Footer ── */}
      <div
        className="px-6 py-2.5 flex items-center justify-center text-[9px] font-medium tracking-wide"
        style={{ borderTop: `1px solid ${css.accentColor}10` }}
      >
        <span className="opacity-40">
          Powered by <span className="font-bold" style={{ color: css.textColor }}>DealCard</span>
        </span>
      </div>
    </VibeBackground>
  );

  // Card Back Face — Magazine Cover or Professional Details
  const renderMagazineBack = () => (
    <VibeBackground
      css={css}
      className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/5 flex flex-col justify-between min-h-[520px]"
    >
      {/* Hologram Reflection Overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none mix-blend-color-dodge z-10"
        style={{
          background: useTransform(
            [sheenX, sheenY],
            ([sx, sy]) =>
              `radial-gradient(circle at ${sx}% ${sy}%, rgba(255, 255, 255, 0.12) 0%, transparent 60%),
               linear-gradient(${sx}deg, rgba(255, 255, 255, 0) 30%, rgba(255, 255, 255, 0.05) 50%, rgba(255, 255, 255, 0) 70%)`
          ),
        }}
      />

      {/* ── 1. Header ── */}
      <div className="pt-8 pb-3 px-6 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wide" style={{ backgroundColor: `${css.accentColor}15`, color: css.accentColor }}>
          📰 주간 CRE 리포트
        </div>
        <h2 className="mt-3 text-lg font-bold" style={{ color: css.textColor }}>
          {profile.displayName}의 마켓 인사이트
        </h2>
      </div>

      {/* ── 2. Market Temperature Badge ── */}
      {latestMagazine?.marketTemp && MARKET_TEMP_MAP[latestMagazine.marketTemp] && (
        <div className="px-6 pb-2 flex justify-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border backdrop-blur-md"
            style={{
              backgroundColor: `${MARKET_TEMP_MAP[latestMagazine.marketTemp].color}10`,
              borderColor: `${MARKET_TEMP_MAP[latestMagazine.marketTemp].color}30`,
            }}
          >
            <span className="text-lg">{MARKET_TEMP_MAP[latestMagazine.marketTemp].emoji}</span>
            <span className="text-xs font-bold" style={{ color: MARKET_TEMP_MAP[latestMagazine.marketTemp].color }}>
              시장 온도: {MARKET_TEMP_MAP[latestMagazine.marketTemp].label}
            </span>
          </div>
        </div>
      )}

      {/* ── 3. Headline ── */}
      <div className="px-6 pb-3 flex-1">
        <div
          className="rounded-2xl p-5 border border-white/5 backdrop-blur-md"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.15)" }}
        >
          <p className="text-sm font-bold leading-relaxed line-clamp-3" style={{ color: css.textColor }}>
            &ldquo;{latestMagazine!.headline}&rdquo;
          </p>
          <p className="mt-3 text-[10px] font-medium opacity-60" style={{ color: css.subtextColor }}>
            📅 {latestMagazine!.date}
          </p>
        </div>

        {/* CTA Button */}
        <a
          href={latestMagazine!.url}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90"
          style={{
            background: `linear-gradient(135deg, ${css.accentColor}, ${css.ringColor || css.accentColor})`,
            color: "#fff",
            boxShadow: `0 4px 16px ${css.accentColor}40`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          📖 매거진 읽기
        </a>
      </div>

      {/* ── 4. Logo Overlay ── */}
      <div className="px-6 pt-2 pb-4 flex items-end justify-between relative z-20">
        <div className="w-[80px] h-[36px] relative opacity-70">
          <Image
            src={companyLogo}
            alt="회사 로고"
            fill
            className="object-contain object-left"
            sizes="80px"
          />
        </div>
        <div className="w-[80px] h-[36px] relative opacity-70">
          <Image
            src={partnerLogo}
            alt="제휴사 로고"
            fill
            className="object-contain object-right"
            sizes="80px"
          />
        </div>
      </div>

      {/* ── 5. Footer ── */}
      <div
        className="px-6 py-2.5 flex items-center justify-center text-[9px] font-medium tracking-wide"
        style={{ borderTop: `1px solid ${css.accentColor}10` }}
      >
        <span className="opacity-40">
          Powered by <span className="font-bold" style={{ color: css.textColor }}>DealCard</span>
        </span>
      </div>
    </VibeBackground>
  );

  // Card Back Face — Professional Details (Fallback)
  const renderProfessionalBack = () => (
    <VibeBackground
      css={css}
      className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/5 flex flex-col justify-between min-h-[520px]"
    >
      {/* Hologram Reflection Overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none mix-blend-color-dodge z-10"
        style={{
          background: useTransform(
            [sheenX, sheenY],
            ([sx, sy]) =>
              `radial-gradient(circle at ${sx}% ${sy}%, rgba(255, 255, 255, 0.12) 0%, transparent 60%),
               linear-gradient(${sx}deg, rgba(255, 255, 255, 0) 30%, rgba(255, 255, 255, 0.05) 50%, rgba(255, 255, 255, 0) 70%)`
          ),
        }}
      />

      {/* ── 1. Header ── */}
      <div className="pt-8 pb-4 px-6 text-center">
        <h3 className="text-xs font-bold uppercase tracking-wider opacity-80" style={{ color: css.subtextColor }}>
          전문 분야 & 소개
        </h3>
        <h2 className="mt-2 text-lg font-bold" style={{ color: css.textColor }}>
          {profile.displayName}
        </h2>
      </div>

      {/* ── 2. Bio ── */}
      {broker?.bio && (
        <div className="px-6 pb-3">
          <div
            className="rounded-2xl p-4 border border-white/5 backdrop-blur-md"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.12)" }}
          >
            <p className="text-[11px] leading-relaxed" style={{ color: css.textColor }}>
              {broker.bio}
            </p>
          </div>
        </div>
      )}

      {/* ── 3. Specialty Details ── */}
      <div className="px-6 pb-3 flex-1">
        <div className="space-y-3">
          {(broker?.specialtyRegions?.length ?? 0) > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5 opacity-50" style={{ color: css.subtextColor }}>전문 지역</p>
              <div className="flex flex-wrap gap-1.5">
                {broker!.specialtyRegions.map((r) => (
                  <span
                    key={r}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium border"
                    style={{
                      backgroundColor: `${css.accentColor}10`,
                      borderColor: `${css.accentColor}20`,
                      color: css.accentColor,
                    }}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(broker?.specialtyAssets?.length ?? 0) > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5 opacity-50" style={{ color: css.subtextColor }}>전문 자산</p>
              <div className="flex flex-wrap gap-1.5">
                {broker!.specialtyAssets.map((a) => (
                  <span
                    key={a}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium border"
                    style={{
                      backgroundColor: `${css.ringColor}10`,
                      borderColor: `${css.ringColor}20`,
                      color: css.ringColor,
                    }}
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* License & Career */}
          {(professional?.licenseNumber || careerYears) && (
            <div
              className="rounded-2xl p-3 border border-white/5 backdrop-blur-md space-y-1.5"
              style={{ backgroundColor: "rgba(0, 0, 0, 0.12)" }}
            >
              {professional?.licenseNumber && (
                <p className="text-[10px] font-medium" style={{ color: css.textColor }}>
                  📋 공인중개사 자격증 {professional.licenseNumber}
                </p>
              )}
              {careerYears && careerYears > 0 && (
                <p className="text-[10px] font-medium" style={{ color: css.textColor }}>
                  🏢 경력 {careerYears}년 · 누적 {professional?.totalDealCount ?? stats.dealCount}건 중개
                </p>
              )}
            </div>
          )}

          {/* SNS Links */}
          {(professional?.naverBlogUrl || professional?.youtubeUrl || professional?.linkedinUrl) && (
            <div className="flex gap-2 pt-1">
              {professional.naverBlogUrl && (
                <a
                  href={professional.naverBlogUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-all hover:opacity-80"
                  style={{
                    backgroundColor: `${css.accentColor}08`,
                    borderColor: `${css.accentColor}15`,
                    color: css.textColor,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  📝 블로그
                </a>
              )}
              {professional.youtubeUrl && (
                <a
                  href={professional.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-all hover:opacity-80"
                  style={{
                    backgroundColor: "rgba(255, 0, 0, 0.06)",
                    borderColor: "rgba(255, 0, 0, 0.15)",
                    color: css.textColor,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  ▶️ YouTube
                </a>
              )}
              {professional.linkedinUrl && (
                <a
                  href={professional.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-all hover:opacity-80"
                  style={{
                    backgroundColor: "rgba(0, 119, 181, 0.06)",
                    borderColor: "rgba(0, 119, 181, 0.15)",
                    color: css.textColor,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  💼 LinkedIn
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Logo Overlay (Back) ── */}
      <div className="px-6 pt-2 pb-4 flex items-end justify-between relative z-20">
        <div className="w-[80px] h-[36px] relative opacity-70">
          <Image
            src={companyLogo}
            alt="회사 로고"
            fill
            className="object-contain object-left"
            sizes="80px"
          />
        </div>
        <div className="w-[80px] h-[36px] relative opacity-70">
          <Image
            src={partnerLogo}
            alt="제휴사 로고"
            fill
            className="object-contain object-right"
            sizes="80px"
          />
        </div>
      </div>

      {/* ── 5. Footer ── */}
      <div
        className="px-6 py-2.5 flex items-center justify-center text-[9px] font-medium tracking-wide"
        style={{ borderTop: `1px solid ${css.accentColor}10` }}
      >
        <span className="opacity-40">
          Powered by <span className="font-bold" style={{ color: css.textColor }}>DealCard</span>
        </span>
      </div>
    </VibeBackground>
  );

  // Choose back face based on magazine availability
  const renderBack = () => latestMagazine ? renderMagazineBack() : renderProfessionalBack();

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* 3D Tilt Container */}
      <motion.div
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        className="transition-transform duration-200 ease-out"
      >
        <VibeCardFlip
          front={renderFront()}
          back={renderBack()}
          className="rounded-3xl shadow-2xl"
          hintColor={css.subtextColor}
        />
      </motion.div>
    </div>
  );
}
