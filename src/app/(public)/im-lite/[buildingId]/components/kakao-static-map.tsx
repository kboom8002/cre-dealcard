"use client";

import React from "react";

interface KakaoStaticMapProps {
  lat: number;
  lng: number;
  name: string;
}

export function KakaoStaticMap({ lat, lng, name }: KakaoStaticMapProps) {
  const kakaoMapLink = `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`;
  const naverMapLink = `https://map.naver.com/p/search/${lat},${lng}`;

  // OpenStreetMap 정적 타일 — zoom 14로 주변 역세권 및 간선 도로망 맥락 확보
  const zoom = 14;
  const exactX = ((lng + 180) / 360) * Math.pow(2, zoom);
  const exactY =
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
    Math.pow(2, zoom);

  const tileX = Math.floor(exactX);
  const tileY = Math.floor(exactY);

  // 타일 내 서브픽셀 오프셋 계산 (정밀도 1px 이내 보정)
  const offsetX = (exactX - tileX) * 256;
  const offsetY = (exactY - tileY) * 256;
  const shiftX = 128 - offsetX;
  const shiftY = 128 - offsetY;

  // 3x3 타일 그리드로 충분한 맵 영역 커버
  const tileUrl = (x: number, y: number) =>
    `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

  return (
    <div className="relative w-full h-full bg-neutral-800 overflow-hidden group">
      {/* 3x3 타일 그리드 — 정확한 좌표가 정중앙(50%, 50%)에 오도록 서브픽셀 이동 */}
      <div
        className="absolute grid grid-cols-3 grid-rows-3 pointer-events-none"
        style={{
          width: "768px",
          height: "768px",
          left: "50%",
          top: "50%",
          transform: `translate(calc(-50% + ${shiftX}px), calc(-50% + ${shiftY}px))`,
        }}
      >
        {[-1, 0, 1].map((dy) =>
          [-1, 0, 1].map((dx) => (
            <img
              key={`${dx}_${dy}`}
              src={tileUrl(tileX + dx, tileY + dy)}
              alt=""
              className="w-[256px] h-[256px] block select-none"
              style={{ imageRendering: "auto" }}
              loading="eager"
            />
          ))
        )}
      </div>

      {/* 중앙 마커 핀 — 정중앙 좌표 바로 위에 정확히 위치 */}
      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
        <div className="relative -mt-8 filter drop-shadow-lg">
          <svg width="44" height="54" viewBox="0 0 32 40" fill="none">
            <path
              d="M16 0C7.164 0 0 7.164 0 16c0 12 16 24 16 24s16-12 16-24C32 7.164 24.836 0 16 0z"
              fill="#3b82f6"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
            <circle cx="16" cy="16" r="6.5" fill="white" />
            <circle cx="16" cy="16" r="3.5" fill="#1d4ed8" />
          </svg>
        </div>
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

      {/* OSM 저작자 표시 */}
      <div className="absolute top-2 right-2 z-20">
        <span className="text-[8px] text-neutral-300 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/10">
          © OpenStreetMap
        </span>
      </div>
    </div>
  );
}
