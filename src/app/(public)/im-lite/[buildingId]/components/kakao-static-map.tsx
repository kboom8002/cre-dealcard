"use client";

import React from "react";

interface KakaoStaticMapProps {
  lat: number;
  lng: number;
  name: string;
  mapUrl?: string;
}

export function KakaoStaticMap({ lat, lng, name, mapUrl }: KakaoStaticMapProps) {
  const kakaoMapLink = `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`;
  const naverMapLink = `https://map.naver.com/p/search/${lat},${lng}`;

  return (
    <div className="relative w-full h-full bg-neutral-800 overflow-hidden group">
      {/* 맵 배경 이미지 (서버에서 생성된 카카오 정적 지도) */}
      <div className="absolute inset-0 pointer-events-none">
        {mapUrl ? (
          <img
            src={mapUrl}
            alt={`${name} 위치 지도`}
            className="w-full h-full object-cover opacity-90 transition-opacity duration-300 group-hover:opacity-100"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-800 text-neutral-500">
            <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-xs">지도를 불러올 수 없습니다</span>
          </div>
        )}
      </div>

      {/* 지도 바로가기 오버레이 (카카오맵 / 네이버 지도) */}
      <div className="absolute bottom-0 inset-x-0 z-20 p-2.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex gap-2">
        <a
          href={kakaoMapLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#FEE500] hover:bg-[#FDD835] text-[#3C1E1E] text-[11px] font-bold rounded-xl transition-all shadow-md active:scale-95"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 5.82 2 10.5c0 2.95 1.95 5.55 4.88 7.04-.15.57-.78 2.96-.81 3.13 0 0-.02.12.06.17.08.04.17.01.17.01.22-.03 2.58-1.71 3.66-2.43.64.09 1.33.14 2.04.14 5.52 0 10-3.82 10-8.56C22 5.82 17.52 2 12 2z" />
          </svg>
          카카오맵 길찾기
        </a>
        <a
          href={naverMapLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#03C75A] hover:bg-[#02B351] text-white text-[11px] font-bold rounded-xl transition-all shadow-md active:scale-95"
        >
          <span className="font-extrabold text-[10px]">N</span>
          네이버 지도
        </a>
      </div>
    </div>
  );
}
