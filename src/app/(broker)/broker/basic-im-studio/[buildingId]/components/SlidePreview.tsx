'use client';

interface Slide {
  id: string;
  slideIndex: number;
  title: string;
  kicker: string;
  dataKey: string;
  layoutType: string;
  slideOverrides: Record<string, any>;
}

const SECTION_DESCRIPTIONS: Record<string, string> = {
  cover: '표지',
  highlights: '투자 핵심 포인트',
  overview: '건물 개요',
  location: '입지 분석',
  land: '토지 정보',
  gallery: '사진 갤러리',
  rentroll: '렌트롤',
  yield: '수익률',
  closing: '클로징',
};

export function SlidePreview({ slide }: { slide: Slide | null }) {
  if (!slide) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        슬라이드를 선택하면 프리뷰가 표시됩니다
      </div>
    );
  }

  const overrides = slide.slideOverrides || {};
  const sectionName = SECTION_DESCRIPTIONS[slide.dataKey] || slide.dataKey;

  return (
    <div className="p-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        라이브 프리뷰
      </h3>

      {/* 16:9 Preview Card */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <div className="h-full flex flex-col p-4">
          {/* Kicker */}
          <p className="text-[10px] font-bold tracking-widest" style={{ color: '#B98A2E' }}>
            {slide.kicker}
          </p>

          {/* Title */}
          <h2 className="text-sm font-bold mt-1" style={{ color: '#132A3A' }}>
            {overrides.title || slide.title}
          </h2>

          {/* Divider */}
          <div className="w-8 h-0.5 mt-1.5" style={{ backgroundColor: '#B98A2E' }} />

          {/* Content area */}
          <div className="flex-1 mt-3 rounded p-3" style={{ backgroundColor: '#F8FAFC' }}>
            {/* Render section-specific preview */}
            {slide.dataKey === 'cover' && (
              <div className="flex flex-col items-center justify-center h-full">
                <p className="text-xs text-gray-500">{overrides.subtitle || ''}</p>
                <h1 className="text-base font-bold mt-1" style={{ color: '#132A3A' }}>
                  {overrides.title || slide.title}
                </h1>
                <p className="text-[10px] text-gray-400 mt-2">{overrides.date || ''}</p>
              </div>
            )}

            {slide.dataKey === 'highlights' && (
              <div className="space-y-2">
                {overrides.keyInvestmentPoint && (
                  <p className="text-xs text-gray-700 leading-relaxed">
                    {overrides.keyInvestmentPoint}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {overrides.askingPrice && (
                    <div className="bg-white rounded p-1.5 text-center border">
                      <p className="text-[9px] text-gray-400">매각가</p>
                      <p className="text-xs font-bold" style={{ color: '#132A3A' }}>{overrides.askingPrice}억</p>
                    </div>
                  )}
                  {overrides.grossYield && (
                    <div className="bg-white rounded p-1.5 text-center border">
                      <p className="text-[9px] text-gray-400">수익률</p>
                      <p className="text-xs font-bold" style={{ color: '#132A3A' }}>{overrides.grossYield}%</p>
                    </div>
                  )}
                  {overrides.vacancySignal && (
                    <div className="bg-white rounded p-1.5 text-center border">
                      <p className="text-[9px] text-gray-400">공실</p>
                      <p className="text-xs font-bold" style={{ color: '#132A3A' }}>{overrides.vacancySignal}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {slide.dataKey === 'location' && (
              <div className="space-y-1.5">
                {overrides.mapImageUrl && overrides.mapImageUrl.startsWith('data:') && (
                  <img src={overrides.mapImageUrl} alt="지도" className="rounded max-h-24 w-full object-cover" />
                )}
                {overrides.address && <p className="text-xs text-gray-600">📍 {overrides.address}</p>}
                {overrides.transitInfo && <p className="text-xs text-gray-600">🚇 {overrides.transitInfo}</p>}
                {overrides.roadInfo && <p className="text-xs text-gray-600">🛣️ {overrides.roadInfo}</p>}
                {overrides.areaInfo && <p className="text-xs text-gray-600">🏢 {overrides.areaInfo}</p>}
              </div>
            )}

            {slide.dataKey === 'closing' && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                {overrides.brokerName && <p className="text-sm font-bold" style={{ color: '#132A3A' }}>{overrides.brokerName}</p>}
                {overrides.brokerPhone && <p className="text-xs text-gray-500 mt-0.5">{overrides.brokerPhone}</p>}
                {overrides.brokerCompany && <p className="text-xs text-gray-400 mt-0.5">{overrides.brokerCompany}</p>}
              </div>
            )}

            {/* Generic fallback for other sections */}
            {!['cover', 'highlights', 'location', 'closing'].includes(slide.dataKey) && (
              <div className="space-y-1">
                {Object.entries(overrides).map(([key, val]) => {
                  if (typeof val === 'string' && val.trim() && !val.startsWith('data:')) {
                    return (
                      <div key={key}>
                        <span className="text-[9px] text-gray-400">{key}: </span>
                        <span className="text-xs text-gray-700">{val}</span>
                      </div>
                    );
                  }
                  return null;
                })}
                {Object.keys(overrides).filter(k => {
                  const v = overrides[k];
                  return typeof v === 'string' && v.trim() && !v.startsWith('data:');
                }).length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">
                    [{sectionName}] 편집 데이터 없음
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center mt-2">
            <span className="text-[8px] text-gray-300">CONFIDENTIAL</span>
            <span className="text-[8px] text-gray-300">{slide.slideIndex} / 9</span>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="mt-4 p-3 bg-white rounded-lg border">
        <p className="text-xs text-gray-500">
          타입: <code className="text-blue-600">{slide.layoutType}</code>
        </p>
        <p className="text-xs text-gray-500 mt-1">
          데이터키: <code className="text-blue-600">{slide.dataKey}</code>
        </p>
        <p className="text-xs text-gray-500 mt-1">
          편집된 필드: {Object.keys(overrides).filter(k => overrides[k]).length}개
        </p>
      </div>
    </div>
  );
}
