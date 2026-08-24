'use client';

import React from 'react';
import { getMapTierCoordinates } from '@/domain/building/map-tier';

type MapTier = 'teaser' | 'basic' | 'pro';

interface TieredMapProps {
  lat?: number | null;
  lng?: number | null;
  tier: MapTier;
  areaSignal?: string;
  className?: string;
}

/**
 * Map component with tiered privacy:
 * - Teaser: District polygon only (no pin)
 * - Basic: Fuzzy offset (±150m) + 400m radius circle
 * - Pro: Exact coordinates + POI + Naver Map deeplink
 */
export function TieredMap({ lat, lng, tier, areaSignal, className = '' }: TieredMapProps) {
  if (!lat || !lng) {
    return (
      <div className={`bg-neutral-900 border border-neutral-800 rounded-xl flex items-center justify-center text-neutral-500 text-sm ${className}`}
        style={{ minHeight: '200px' }}>
        <span>🗺️ 위치 정보 없음</span>
      </div>
    );
  }

  // Apply tier-based coordinate transformation
  const mapResult = tier === 'pro'
    ? { displayCoordinates: { lat, lng }, isFuzzyOffset: false }
    : getMapTierCoordinates({ lat, lng }, 'basic');
  const displayLat = mapResult.displayCoordinates.lat;
  const displayLng = mapResult.displayCoordinates.lng;

  // Static map image URL (Kakao or OSM-based)
  const zoom = tier === 'teaser' ? 13 : tier === 'basic' ? 15 : 17;
  const mapUrl = `https://map.naver.com/p/search/${displayLat},${displayLng}`;

  return (
    <div className={`relative bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden ${className}`}
      style={{ minHeight: '200px' }}>
      {/* Map Placeholder - In production, integrate Naver/Kakao Maps SDK */}
      <div className="w-full h-full flex flex-col items-center justify-center py-8 space-y-3">
        <span className="text-3xl">🗺️</span>

        {tier === 'teaser' && (
          <>
            <span className="text-sm text-neutral-400">{areaSignal || '권역'} 일대</span>
            <span className="text-[10px] text-neutral-600">대략적인 위치만 표시</span>
          </>
        )}

        {tier === 'basic' && (
          <>
            <span className="text-sm text-neutral-400">반경 400m 내 위치</span>
            <div className="w-20 h-20 rounded-full border-2 border-dashed border-primary/30 flex items-center justify-center">
              <span className="text-neutral-500 text-[10px]">±150m</span>
            </div>
            <span className="text-[10px] text-neutral-600">IM 상세에서 정확한 위치 확인</span>
          </>
        )}

        {tier === 'pro' && (
          <>
            <span className="text-sm text-white font-medium">정확한 위치</span>
            <a href={mapUrl} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 bg-primary/20 text-primary text-xs font-bold rounded-lg hover:bg-primary/30 transition-colors">
              🗺️ 네이버 지도에서 보기
            </a>
          </>
        )}
      </div>

      {/* Privacy Tier Badge */}
      <div className="absolute top-2 right-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          tier === 'pro' ? 'bg-purple-500/20 text-purple-300'
          : tier === 'basic' ? 'bg-blue-500/20 text-blue-300'
          : 'bg-neutral-700/50 text-neutral-400'
        }`}>
          {tier === 'pro' ? '🔓 정확' : tier === 'basic' ? '🔒 근사치' : '🔐 권역'}
        </span>
      </div>
    </div>
  );
}
