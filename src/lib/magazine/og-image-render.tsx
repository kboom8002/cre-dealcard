/**
 * OG/스토리/카드 이미지 JSX (satori 호환: 모든 다자식 div 는 display:flex).
 *
 * - 크기는 호출부(IMAGE_SIZES)가 결정한다 — 이 파일은 크기를 바꾸지 않는다(실측 회귀 보호).
 * - 이모지 사용 안 함: satori 기본 이모지 로더가 외부 CDN 을 fetch 하기 때문(오프라인/서버리스에서 깨짐).
 * - 텍스트는 `t()`(latinSafe)를 통과시켜 한글 폰트가 없을 때 □ 대신 영문/숫자만 그린다.
 * - 하단 공백(T1-20, T1-UX-5, T3-55): 본문 영역을 `flex:1` + 세로 중앙 정렬, 브리핑 카드는 남는 높이를 채운다.
 */
import React from 'react';
import { MARKET_TEMP_CONFIG } from '@/domain/magazine/types';
import { latinSafe } from '@/lib/magazine/og-fonts';
import type { ImageModel } from '@/lib/magazine/og-image-data';

export type Translate = (s: string, latinFallback?: string) => string;

export function makeTranslate(hasKorean: boolean): Translate {
  return (s, fb = '') => latinSafe(s, hasKorean, fb);
}

export const ACCENT: Record<string, string> = {
  emerald: '#10b981',
  indigo: '#6366f1',
  rose: '#f43f5e',
  amber: '#f59e0b',
  slate: '#94a3b8',
};

export function clip(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

const FONT_FAMILY = '"Noto Sans KR", "Geist", sans-serif';

function BrandMark({ size }: { size: number }) {
  return (
    <div
      style={{
        display: 'flex',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${Math.round(size / 5)}px`,
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      }}
    />
  );
}

function TempBadge({ m, t, size }: { m: ImageModel; t: Translate; size: number }) {
  if (!m.marketTemp) return null;
  const cfg = MARKET_TEMP_CONFIG[m.marketTemp];
  const label = t(`시장 온도: ${m.marketTemp}`, 'Market');
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: `${Math.round(size / 2)}px ${size}px`,
        borderRadius: '30px',
        background: 'rgba(255,255,255,0.08)',
        border: `1px solid ${cfg.color}40`,
      }}
    >
      <div style={{ display: 'flex', width: '12px', height: '12px', borderRadius: '6px', background: cfg.color }} />
      <span style={{ color: cfg.color, fontSize: `${size}px`, fontWeight: 800 }}>{label}</span>
    </div>
  );
}

function Keywords({ m, t, size }: { m: ImageModel; t: Translate; size: number }) {
  const words = m.keywords.map((k) => t(k)).filter(Boolean);
  if (!words.length) return null;
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
      {words.map((kw, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#cbd5e1',
            padding: '8px 18px',
            borderRadius: '16px',
            fontSize: `${size}px`,
            fontWeight: 600,
          }}
        >{`#${kw}`}</div>
      ))}
    </div>
  );
}

function BrokerFooter({ m, t, scale }: { m: ImageModel; t: Translate; scale: number }) {
  const name = m.brokerName ? t(m.brokerName) : '';
  const company = m.company ? t(m.company) : '';
  const initial = (name || company).charAt(0) || 'C';
  const phone = m.phone ?? '';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        paddingTop: `${Math.round(28 * scale)}px`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: `${Math.round(20 * scale)}px` }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: `${Math.round(72 * scale)}px`,
            height: `${Math.round(72 * scale)}px`,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff',
            fontSize: `${Math.round(32 * scale)}px`,
            fontWeight: 900,
          }}
        >
          {initial}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {name || company ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              {name ? <span style={{ fontSize: `${Math.round(30 * scale)}px`, fontWeight: 900 }}>{name}</span> : null}
              {company ? (
                <span style={{ fontSize: `${Math.round(20 * scale)}px`, color: '#94a3b8' }}>{company}</span>
              ) : null}
            </div>
          ) : null}
          {phone ? (
            <span style={{ fontSize: `${Math.round(20 * scale)}px`, color: '#a5b4fc', fontWeight: 600 }}>{phone}</span>
          ) : null}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
        <div
          style={{
            display: 'flex',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff',
            padding: '10px 22px',
            borderRadius: '20px',
            fontSize: `${Math.round(20 * scale)}px`,
            fontWeight: 800,
          }}
        >
          credeal.net
        </div>
      </div>
    </div>
  );
}

function Stats({ m, t, size }: { m: ImageModel; t: Translate; size: number }) {
  const stats = m.stats
    .map((s) => ({ ...s, label: t(s.label), value: t(s.value) }))
    .filter((s) => s.label && s.value);
  if (!stats.length) return null;
  return (
    <div style={{ display: 'flex', gap: '16px' }}>
      {stats.map((s, i) => {
        const color = ACCENT[s.accent] ?? '#6366f1';
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderTop: `3px solid ${color}`,
              borderRadius: '12px',
              padding: '14px 20px',
              minWidth: '140px',
            }}
          >
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: `${size - 8}px`, fontWeight: 600, marginBottom: '6px' }}>
              {s.label}
            </span>
            <span style={{ color, fontSize: `${size}px`, fontWeight: 800 }}>{s.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function DealList({ m, t, size }: { m: ImageModel; t: Translate; size: number }) {
  // 주소는 이미 maskAddress(동 단위) 처리됨 — 정확한 지번은 절대 그리지 않는다.
  const rows = m.deals
    .map((d) => ({ title: t(d.title), address: t(d.address) }))
    .filter((d) => d.title || d.address);
  if (!rows.length) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.06) 100%)',
        border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: '24px',
        padding: '28px 34px',
      }}
    >
      <span style={{ color: '#a5b4fc', fontSize: `${size - 4}px`, fontWeight: 800 }}>{t('이번 주 매물 (동 단위)', 'Featured deals')}</span>
      {rows.map((d, i) => (
        <span key={i} style={{ color: '#e2e8f0', fontSize: `${size}px`, fontWeight: 600 }}>
          {clip(d.address ? `${d.title} · ${d.address}` : d.title, 40)}
        </span>
      ))}
    </div>
  );
}

function PageBg({ children, width, height, vertical }: { children: React.ReactNode; width: number; height: number; vertical?: boolean }) {
  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        background: vertical
          ? 'linear-gradient(180deg, #090a10 0%, #0f121d 50%, #06070b 100%)'
          : 'linear-gradient(135deg, #0f111a 0%, #060810 100%)',
        fontFamily: FONT_FAMILY,
        color: '#ffffff',
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '-120px',
          left: '15%',
          width: '700px',
          height: '500px',
          background: 'radial-gradient(ellipse, rgba(99,102,241,0.22), transparent 70%)',
        }}
      />
      {children}
    </div>
  );
}

/** 중립 브랜드 이미지 — 숫자·전화·가짜 지표 없음 (M2-09, T2-28b, T3-18) */
export function NeutralImage({ width, height }: { width: number; height: number }) {
  return (
    <PageBg width={width} height={height} vertical={height > width}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
        }}
      >
        <BrandMark size={Math.round(Math.min(width, height) / 14)} />
        <span
          style={{
            fontSize: `${Math.round(Math.min(width, height) / 8)}px`,
            fontWeight: 900,
            letterSpacing: '8px',
            color: '#ffffff',
          }}
        >
          CREDEAL
        </span>
        <span
          style={{
            fontSize: `${Math.round(Math.min(width, height) / 26)}px`,
            fontWeight: 600,
            letterSpacing: '4px',
            color: '#a5b4fc',
          }}
        >
          COMMERCIAL REAL ESTATE INTELLIGENCE
        </span>
      </div>
    </PageBg>
  );
}

export function OgImage({ m, t, width, height }: { m: ImageModel; t: Translate; width: number; height: number }) {
  const headline = clip(t(m.headline, 'CRE Market Briefing'), 60);
  return (
    <PageBg width={width} height={height}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '48px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BrandMark size={14} />
            <span style={{ color: '#a5b4fc', fontSize: '18px', fontWeight: 800, letterSpacing: '3px' }}>CRE MAGAZINE</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <span style={{ color: '#fff', fontSize: '26px', fontWeight: 700 }}>{m.dateLabel}</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '16px' }}>{t(m.dateKorean) === m.dateKorean ? m.dateKorean : ''}</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            justifyContent: 'center',
            alignItems: 'flex-start',
            gap: '20px',
          }}
        >
          <TempBadge m={m} t={t} size={16} />
          <div style={{ display: 'flex', fontSize: '52px', fontWeight: 900, lineHeight: 1.3, letterSpacing: '-1px', wordBreak: 'keep-all' }}>
            {headline}
          </div>
          <Keywords m={m} t={t} size={16} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <Stats m={m} t={t} size={22} />
          <BrokerFooter m={m} t={t} scale={0.8} />
        </div>
      </div>
    </PageBg>
  );
}

export function StoryImage({ m, t, width, height }: { m: ImageModel; t: Translate; width: number; height: number }) {
  const headline = clip(t(m.headline, 'CRE Market Briefing'), 70);
  const theme = m.themeTitle ? t(m.themeTitle) : '';
  const briefing = m.briefing ? clip(t(m.briefing), 420) : '';
  return (
    <PageBg width={width} height={height} vertical>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '80px 70px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <BrandMark size={22} />
            <span style={{ color: '#a5b4fc', fontSize: '24px', fontWeight: 800, letterSpacing: '4px' }}>CRE MAGAZINE</span>
          </div>
          <div
            style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: '8px 20px',
              borderRadius: '30px',
              fontSize: '22px',
              fontWeight: 700,
              color: '#e2e8f0',
            }}
          >
            {m.dateLabel}
          </div>
        </div>

        {/* 본문: 남는 높이를 차지하고 세로 중앙 정렬 → 하단 공백 제거 */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: '40px', paddingTop: '40px', paddingBottom: '40px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
            <div style={{ display: 'flex' }}>
              <TempBadge m={m} t={t} size={22} />
            </div>
            <div style={{ display: 'flex', fontSize: '68px', fontWeight: 900, lineHeight: 1.25, letterSpacing: '-1.5px', wordBreak: 'keep-all' }}>
              {headline}
            </div>
            <Keywords m={m} t={t} size={22} />
          </div>

          {briefing ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '28px',
                padding: '44px',
                gap: '22px',
              }}
            >
              {theme ? <span style={{ fontSize: '30px', fontWeight: 800, color: '#f8fafc' }}>{clip(theme, 50)}</span> : null}
              <div style={{ display: 'flex', fontSize: '30px', lineHeight: 1.6, color: '#cbd5e1', wordBreak: 'keep-all' }}>
                {briefing}
              </div>
            </div>
          ) : null}

          <DealList m={m} t={t} size={26} />
          <Stats m={m} t={t} size={26} />
        </div>

        <BrokerFooter m={m} t={t} scale={1} />
      </div>
    </PageBg>
  );
}

export function CardImage({ m, t, width, height }: { m: ImageModel; t: Translate; width: number; height: number }) {
  const headline = clip(t(m.headline, 'CRE Market Briefing'), 60);
  const briefing = m.briefing ? clip(t(m.briefing), 240) : '';
  return (
    <PageBg width={width} height={height}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '64px 70px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#a5b4fc', fontSize: '22px', fontWeight: 800, letterSpacing: '3px' }}>CRE MAGAZINE</span>
          <span style={{ color: '#94a3b8', fontSize: '22px' }}>{m.dateLabel}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: '26px' }}>
          <div style={{ display: 'flex' }}>
            <TempBadge m={m} t={t} size={20} />
          </div>
          <div style={{ display: 'flex', fontSize: '64px', fontWeight: 900, lineHeight: 1.3, wordBreak: 'keep-all' }}>{headline}</div>
          {briefing ? (
            <div style={{ display: 'flex', fontSize: '28px', lineHeight: 1.6, color: '#cbd5e1', wordBreak: 'keep-all' }}>{briefing}</div>
          ) : null}
          <Keywords m={m} t={t} size={20} />
        </div>

        <BrokerFooter m={m} t={t} scale={0.9} />
      </div>
    </PageBg>
  );
}
