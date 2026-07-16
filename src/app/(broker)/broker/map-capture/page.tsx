'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Download, Printer, Loader2, Search, Palette, RotateCcw } from 'lucide-react';

/* ── 카카오맵 SDK 글로벌 타입 ── */
declare global {
  interface Window {
    kakao: any;
  }
}

/* ── 마커 색상 프리셋 ── */
const MARKER_COLORS = [
  { id: 'red', label: '빨강', hex: '#ef4444', dark: '#b91c1c' },
  { id: 'blue', label: '파랑', hex: '#3b82f6', dark: '#1d4ed8' },
  { id: 'green', label: '초록', hex: '#22c55e', dark: '#15803d' },
  { id: 'orange', label: '주황', hex: '#f97316', dark: '#c2410c' },
  { id: 'purple', label: '보라', hex: '#a855f7', dark: '#7e22ce' },
  { id: 'pink', label: '분홍', hex: '#ec4899', dark: '#be185d' },
  { id: 'cyan', label: '청록', hex: '#06b6d4', dark: '#0e7490' },
  { id: 'black', label: '검정', hex: '#1f2937', dark: '#111827' },
];

/* ── 이미지 크기 프리셋 ── */
const SIZE_PRESETS = [
  { id: 'web', label: '웹용', width: 800, height: 500, dpi: 1 },
  { id: 'web-hd', label: '웹 HD', width: 1200, height: 750, dpi: 1 },
  { id: 'print-a4', label: '프린트 A4', width: 1600, height: 1000, dpi: 2 },
  { id: 'print-large', label: '프린트 대형', width: 2400, height: 1500, dpi: 2 },
];

interface GeoResult {
  lat: number;
  lng: number;
  address: string;
  roadAddress?: string | null;
}

/* ── SVG 마커 이미지 생성 ── */
function createMarkerSvg(color: string, label: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
      <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="18" cy="18" r="8" fill="#fff" opacity="0.9"/>
      <text x="18" y="22" text-anchor="middle" font-size="12" font-weight="bold" fill="${color}" font-family="sans-serif">${label}</text>
    </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export default function MapCapturePage() {
  const [addressA, setAddressA] = useState('');
  const [addressB, setAddressB] = useState('');
  const [colorA, setColorA] = useState(MARKER_COLORS[0]); // 빨강
  const [colorB, setColorB] = useState(MARKER_COLORS[1]); // 파랑
  const [sizePreset, setSizePreset] = useState(SIZE_PRESETS[0]); // 웹용

  const [geoA, setGeoA] = useState<GeoResult | null>(null);
  const [geoB, setGeoB] = useState<GeoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const sdkLoaded = useRef(false);

  /* ── 카카오맵 SDK 로드 ── */
  useEffect(() => {
    if (sdkLoaded.current) return;
    const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
    if (!appKey) return;

    if (window.kakao?.maps) {
      sdkLoaded.current = true;
      return;
    }

    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.async = true;
    script.onload = () => {
      window.kakao.maps.load(() => {
        sdkLoaded.current = true;
      });
    };
    document.head.appendChild(script);
  }, []);

  /* ── 주소 → 좌표 변환 ── */
  const geocode = useCallback(async (address: string): Promise<GeoResult> => {
    const res = await fetch('/api/broker/map-capture/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || '주소 변환 실패');
    }
    return res.json();
  }, []);

  /* ── 지도 생성 ── */
  const handleGenerateMap = async () => {
    if (!addressA.trim() || !addressB.trim()) {
      setError('두 주소를 모두 입력해주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    setMapReady(false);

    try {
      const [resultA, resultB] = await Promise.all([
        geocode(addressA.trim()),
        geocode(addressB.trim()),
      ]);
      setGeoA(resultA);
      setGeoB(resultB);

      // SDK 로드 대기
      await new Promise<void>((resolve) => {
        const check = () => {
          if (window.kakao?.maps) resolve();
          else setTimeout(check, 100);
        };
        check();
      });

      // 맵 렌더링
      if (!mapContainerRef.current) return;

      const { kakao } = window;
      const map = new kakao.maps.Map(mapContainerRef.current, {
        center: new kakao.maps.LatLng(
          (resultA.lat + resultB.lat) / 2,
          (resultA.lng + resultB.lng) / 2
        ),
        level: 5,
      });
      mapRef.current = map;

      // LatLngBounds로 두 마커가 모두 보이도록
      const bounds = new kakao.maps.LatLngBounds();
      const posA = new kakao.maps.LatLng(resultA.lat, resultA.lng);
      const posB = new kakao.maps.LatLng(resultB.lat, resultB.lng);
      bounds.extend(posA);
      bounds.extend(posB);

      // 마커 A
      const markerImgA = new kakao.maps.MarkerImage(
        createMarkerSvg(colorA.hex, 'A'),
        new kakao.maps.Size(36, 48),
        { offset: new kakao.maps.Point(18, 48) }
      );
      const markerA = new kakao.maps.Marker({ position: posA, image: markerImgA });
      markerA.setMap(map);

      // 마커 B
      const markerImgB = new kakao.maps.MarkerImage(
        createMarkerSvg(colorB.hex, 'B'),
        new kakao.maps.Size(36, 48),
        { offset: new kakao.maps.Point(18, 48) }
      );
      const markerB = new kakao.maps.Marker({ position: posB, image: markerImgB });
      markerB.setMap(map);

      // InfoWindow (라벨)
      const iwA = new kakao.maps.InfoWindow({
        content: `<div style="padding:4px 10px;font-size:12px;font-weight:bold;white-space:nowrap;background:#fff;border:2px solid ${colorA.hex};border-radius:8px;color:${colorA.dark};">A. ${resultA.address}</div>`,
      });
      iwA.open(map, markerA);

      const iwB = new kakao.maps.InfoWindow({
        content: `<div style="padding:4px 10px;font-size:12px;font-weight:bold;white-space:nowrap;background:#fff;border:2px solid ${colorB.hex};border-radius:8px;color:${colorB.dark};">B. ${resultB.address}</div>`,
      });
      iwB.open(map, markerB);

      // 바운드 적용 (여유 패딩)
      map.setBounds(bounds, 80);

      setMapReady(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ── 이미지 캡처 ── */
  const handleCapture = async (forPrint = false) => {
    if (!mapContainerRef.current || !mapReady) return;
    setCapturing(true);

    try {
      const { default: html2canvas } = await import('html2canvas');
      const scale = forPrint ? (sizePreset.dpi >= 2 ? 3 : 2) : sizePreset.dpi >= 2 ? 2 : 1.5;

      const canvas = await html2canvas(mapContainerRef.current, {
        scale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      if (forPrint) {
        // 프린트용: 새 창에서 이미지 표시 후 인쇄
        const imgData = canvas.toDataURL('image/png');
        const printWin = window.open('', '_blank');
        if (printWin) {
          printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head><title>지도 인쇄</title>
            <style>
              @page { size: landscape; margin: 1cm; }
              body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
              img { max-width: 100%; height: auto; }
            </style>
            </head>
            <body>
              <img src="${imgData}" />
              <script>window.onload=function(){window.print();}</script>
            </body>
            </html>
          `);
          printWin.document.close();
        }
      } else {
        // 다운로드
        const link = document.createElement('a');
        link.download = `map-${sizePreset.id}-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    } catch (err) {
      console.error('Capture failed:', err);
      setError('이미지 캡처에 실패했습니다.');
    } finally {
      setCapturing(false);
    }
  };

  /* ── 초기화 ── */
  const handleReset = () => {
    setAddressA('');
    setAddressB('');
    setGeoA(null);
    setGeoB(null);
    setMapReady(false);
    setError(null);
    if (mapContainerRef.current) {
      mapContainerRef.current.innerHTML = '';
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white pb-24">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-blue-400" />
            </div>
            <h1 className="text-2xl font-black">지도 캡처 도구</h1>
          </div>
          <p className="text-sm text-neutral-400">
            2개의 주소를 입력하면 카카오맵에 마커를 표시하고 이미지로 추출합니다.
          </p>
        </div>

        {/* ── 설정 패널 ── */}
        <div className="space-y-4 mb-6">
          {/* 주소 A */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white"
                   style={{ backgroundColor: colorA.hex }}>A</div>
              <span className="text-sm font-bold">주소 A</span>
            </div>
            <input
              type="text"
              value={addressA}
              onChange={(e) => setAddressA(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateMap()}
              placeholder="예: 서울 강남구 테헤란로 152"
              className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
            />
            {/* 마커 색상 선택 */}
            <div className="flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-neutral-500" />
              <span className="text-[11px] text-neutral-500">마커 색상:</span>
              <div className="flex gap-1.5">
                {MARKER_COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setColorA(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      colorA.id === c.id ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            {geoA && (
              <p className="text-[11px] text-green-400">
                ✓ {geoA.address} ({geoA.lat.toFixed(6)}, {geoA.lng.toFixed(6)})
              </p>
            )}
          </div>

          {/* 주소 B */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white"
                   style={{ backgroundColor: colorB.hex }}>B</div>
              <span className="text-sm font-bold">주소 B</span>
            </div>
            <input
              type="text"
              value={addressB}
              onChange={(e) => setAddressB(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateMap()}
              placeholder="예: 서울 서초구 서초대로 398"
              className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
            />
            <div className="flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-neutral-500" />
              <span className="text-[11px] text-neutral-500">마커 색상:</span>
              <div className="flex gap-1.5">
                {MARKER_COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setColorB(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      colorB.id === c.id ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            {geoB && (
              <p className="text-[11px] text-green-400">
                ✓ {geoB.address} ({geoB.lat.toFixed(6)}, {geoB.lng.toFixed(6)})
              </p>
            )}
          </div>

          {/* 이미지 크기 선택 */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-3">
            <span className="text-sm font-bold">이미지 크기</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSizePreset(preset)}
                  className={`rounded-xl px-3 py-2.5 text-xs font-semibold border transition-all ${
                    sizePreset.id === preset.id
                      ? 'bg-blue-500/15 border-blue-500/50 text-blue-300'
                      : 'bg-neutral-950 border-neutral-700 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  <div>{preset.label}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">{preset.width}×{preset.height}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 액션 버튼 ── */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleGenerateMap}
            disabled={loading || !addressA.trim() || !addressB.trim()}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl px-6 py-3.5 text-sm transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? '지도 생성 중...' : '지도 생성'}
          </button>
          {mapReady && (
            <>
              <button
                onClick={() => handleCapture(false)}
                disabled={capturing}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl px-5 py-3.5 text-sm transition-colors"
              >
                {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                이미지 저장
              </button>
              <button
                onClick={() => handleCapture(true)}
                disabled={capturing}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold rounded-xl px-5 py-3.5 text-sm transition-colors"
              >
                <Printer className="w-4 h-4" />
                인쇄
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl px-4 py-3.5 text-sm transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* ── 에러 ── */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-800/50 rounded-2xl">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* ── 지도 미리보기 ── */}
        <div
          className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden"
          style={{ display: mapReady || loading ? 'block' : 'none' }}
        >
          <div
            ref={mapContainerRef}
            style={{
              width: `${Math.min(sizePreset.width, 800)}px`,
              height: `${Math.min(sizePreset.height, 500)}px`,
              maxWidth: '100%',
              margin: '0 auto',
            }}
          />
          {mapReady && geoA && geoB && (
            <div className="px-4 py-3 border-t border-neutral-800 text-[11px] text-neutral-500 flex justify-between">
              <span>A: {geoA.address} → B: {geoB.address}</span>
              <span>{sizePreset.label} ({sizePreset.width}×{sizePreset.height})</span>
            </div>
          )}
        </div>

        {/* ── 빈 상태 ── */}
        {!mapReady && !loading && (
          <div className="bg-neutral-900/50 border border-dashed border-neutral-800 rounded-2xl p-12 text-center">
            <MapPin className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
            <p className="text-neutral-500 text-sm">두 주소를 입력하고 &quot;지도 생성&quot;을 누르세요.</p>
            <p className="text-neutral-600 text-xs mt-1">마커 색상과 이미지 크기를 선택할 수 있습니다.</p>
          </div>
        )}
      </div>
    </main>
  );
}
