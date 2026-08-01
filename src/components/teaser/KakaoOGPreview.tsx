import React from 'react';

interface KakaoOGPreviewProps {
  archetype?: string;
  regionLabel: string;
  title: string;
  price: string;
  highlights: string;
}

export function KakaoOGPreview({
  archetype,
  regionLabel,
  title,
  price,
  highlights
}: KakaoOGPreviewProps) {
  return (
    <div className="bg-[#F2F2F2] p-4 rounded-xl max-w-sm mx-auto font-sans">
      <div className="bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200">
        <div className="bg-[#4B3074] p-4 text-white">
          <div className="text-[10px] font-medium opacity-80 mb-1">
            CREDEAL {archetype ? `· ${archetype.replace(/_/g, ' ')}` : ''}
          </div>
          <div className="text-sm font-bold leading-snug mb-1">
            {title}
          </div>
          <div className="text-[11px] opacity-90">
            {price} {highlights ? `· ${highlights}` : ''}
          </div>
        </div>
        <div className="p-4 space-y-2">
          <div className="text-[13px] font-bold text-gray-800">
            [{regionLabel}] {title} {price}
          </div>
          <div className="text-[12px] text-gray-500 line-clamp-2">
            {highlights}
          </div>
          <div className="pt-2 text-center text-[12px] text-blue-500 border-t border-gray-100 mt-2">
            ──── 딜카드 보기 ────
          </div>
        </div>
      </div>
    </div>
  );
}
