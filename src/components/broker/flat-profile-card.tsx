'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Phone, MessageSquare, Mail, User, ExternalLink } from 'lucide-react';

export interface FlatProfileCardProps {
  name: string;
  company?: string;
  specialty?: string;
  photoUrl?: string;
  phone?: string;
  email?: string;
  slug?: string;
  dealCount?: number;
  listingCount?: number;
  kakaoUrl?: string;
  variant?: 'compact' | 'full';
}

export function vibeToFlatProps(vibeProps: Record<string, any>): FlatProfileCardProps {
  if (!vibeProps) return { name: '' };

  const profile = vibeProps.profile || {};
  const vibe = vibeProps.vibe || {};
  const professional = vibeProps.professional || {};
  const stats = vibeProps.stats || {};

  return {
    name: vibeProps.name || vibeProps.brokerName || profile.displayName || profile.name || '',
    company: vibeProps.company || vibeProps.firmName || profile.company || '',
    specialty:
      vibeProps.specialty ||
      vibeProps.vti ||
      vibe.vti ||
      (Array.isArray(professional.dealSpecialty) ? professional.dealSpecialty.join(', ') : '') ||
      '',
    photoUrl: vibeProps.photoUrl || vibeProps.avatarUrl || vibeProps.photo_url || profile.photoUrl || '',
    phone: vibeProps.phone || vibeProps.contactPhone || profile.phone || '',
    email: vibeProps.email || vibeProps.contactEmail || vibeProps.email || '',
    slug: vibeProps.slug || profile.slug || profile.id || '',
    dealCount: vibeProps.dealCount ?? vibeProps.deal_count ?? stats.dealCount ?? professional.totalDealCount ?? 0,
    listingCount: vibeProps.listingCount ?? vibeProps.listing_count ?? stats.activeCount ?? 0,
    kakaoUrl: vibeProps.kakaoUrl || vibeProps.kakao_url || professional.kakaoChannel || '',
  };
}

export function FlatProfileCard({
  name,
  company,
  specialty,
  photoUrl,
  phone,
  email,
  slug,
  dealCount = 0,
  listingCount = 0,
  kakaoUrl,
  variant = 'full',
}: FlatProfileCardProps) {
  const [imgError, setImgError] = useState(false);

  const specialtyTags = useMemo(() => {
    if (!specialty) return [];
    if (Array.isArray(specialty)) return specialty;
    return specialty
      .split(/[,/|]+/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }, [specialty]);

  const handlePhoneClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  const handleKakaoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (kakaoUrl) {
      window.open(kakaoUrl, '_blank', 'noopener,noreferrer');
    } else if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  const handleEmailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (email) {
      window.location.href = `mailto:${email}`;
    }
  };

  const profileUrl = slug ? `/broker-profile/${slug}` : undefined;

  const renderAvatar = (sizePx: number) => {
    const sizeStyle = { width: `${sizePx}px`, height: `${sizePx}px` };
    const borderStyle = { border: '2px solid #fbbf24', borderRadius: '9999px' };

    const avatarContent = photoUrl && !imgError ? (
      <img
        src={photoUrl}
        alt={name || '중개사 프로필'}
        onError={() => setImgError(true)}
        className="object-cover w-full h-full rounded-full"
      />
    ) : (
      <div className="w-full h-full rounded-full bg-slate-700 flex items-center justify-center text-amber-400 font-bold">
        {name ? name.charAt(0) : <User className="w-1/2 h-1/2" />}
      </div>
    );

    if (profileUrl) {
      return (
        <Link
          href={profileUrl}
          className="relative inline-block flex-shrink-0 transition-transform hover:scale-105"
          style={{ ...sizeStyle, ...borderStyle }}
          title={`${name} 프로필 보기`}
        >
          {avatarContent}
        </Link>
      );
    }

    return (
      <div
        className="relative flex-shrink-0"
        style={{ ...sizeStyle, ...borderStyle }}
      >
        {avatarContent}
      </div>
    );
  };

  if (variant === 'compact') {
    return (
      <div
        className="flat-profile-card-compact rounded-xl p-4 text-white border border-slate-700 shadow-sm"
        style={{
          backgroundColor: 'rgba(30, 41, 59, 0.9)',
          borderColor: '#334155',
        }}
      >
        <div className="flex items-start gap-3">
          {renderAvatar(48)}

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="truncate">
                {profileUrl ? (
                  <Link
                    href={profileUrl}
                    className="font-bold text-base text-white hover:text-amber-400 transition-colors inline-block"
                  >
                    {name || '중개사'}
                  </Link>
                ) : (
                  <span className="font-bold text-base text-white">{name || '중개사'}</span>
                )}
                {company && (
                  <span className="text-xs text-slate-300 ml-2 truncate font-normal">
                    {company}
                  </span>
                )}
              </div>
            </div>

            {specialtyTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {specialtyTags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: 'rgba(251, 191, 36, 0.1)',
                      color: '#fbbf24',
                      border: '1px solid rgba(251, 191, 36, 0.3)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-3">
              <button
                type="button"
                onClick={handlePhoneClick}
                disabled={!phone}
                className="flex-1 min-w-0 py-1.5 px-2 rounded-lg text-xs font-medium text-white flex items-center justify-center gap-1 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#059669' }}
              >
                <Phone className="w-3.5 h-3.5" />
                <span>📞 전화</span>
              </button>

              <button
                type="button"
                onClick={handleKakaoClick}
                disabled={!kakaoUrl && !phone}
                className="flex-1 min-w-0 py-1.5 px-2 rounded-lg text-xs font-medium text-black flex items-center justify-center gap-1 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#facc15', color: '#000000' }}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>💬 카카오</span>
              </button>

              <button
                type="button"
                onClick={handleEmailClick}
                disabled={!email}
                className="flex-1 min-w-0 py-1.5 px-2 rounded-lg text-xs font-medium text-white flex items-center justify-center gap-1 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#475569' }}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>📧 이메일</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // full variant
  return (
    <div
      className="flat-profile-card-full rounded-xl p-6 text-white border border-slate-700 shadow-md max-w-md w-full mx-auto"
      style={{
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        borderColor: '#334155',
      }}
    >
      <div className="flex flex-col items-center text-center">
        {renderAvatar(80)}

        <div className="mt-3">
          {profileUrl ? (
            <Link
              href={profileUrl}
              className="text-xl font-bold text-white hover:text-amber-400 transition-colors inline-flex items-center gap-1"
            >
              {name || '중개사'}
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </Link>
          ) : (
            <h3 className="text-xl font-bold text-white">{name || '중개사'}</h3>
          )}

          {company && <p className="text-sm text-slate-300 mt-1">{company}</p>}
        </div>

        {specialtyTags.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-3">
            {specialtyTags.map((tag, idx) => (
              <span
                key={idx}
                className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{
                  backgroundColor: 'rgba(251, 191, 36, 0.1)',
                  color: '#fbbf24',
                  border: '1px solid rgba(251, 191, 36, 0.3)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="w-full py-3 px-4 my-4 bg-slate-900/60 rounded-lg border border-slate-700/60 flex items-center justify-center gap-4 text-sm">
          <div className="text-slate-300">
            거래실적 <span className="font-bold text-amber-400 ml-1">{dealCount}</span>건
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <div className="text-slate-300">
            관리매물 <span className="font-bold text-amber-400 ml-1">{listingCount}</span>건
          </div>
        </div>

        <div className="w-full grid grid-cols-3 gap-2 mt-1">
          <button
            type="button"
            onClick={handlePhoneClick}
            disabled={!phone}
            className="py-2.5 px-3 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#059669' }}
          >
            <Phone className="w-4 h-4" />
            <span>📞 전화</span>
          </button>

          <button
            type="button"
            onClick={handleKakaoClick}
            disabled={!kakaoUrl && !phone}
            className="py-2.5 px-3 rounded-lg text-sm font-medium text-black flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#facc15', color: '#000000' }}
          >
            <MessageSquare className="w-4 h-4" />
            <span>💬 카카오</span>
          </button>

          <button
            type="button"
            onClick={handleEmailClick}
            disabled={!email}
            className="py-2.5 px-3 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#475569' }}
          >
            <Mail className="w-4 h-4" />
            <span>📧 이메일</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default FlatProfileCard;
