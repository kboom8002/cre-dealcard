'use client';

interface Slide {
  id: string;
  slideIndex: number;
  title: string;
  kicker: string;
  dataKey: string;
  slideOverrides: Record<string, any>;
  hidden: boolean;
}

const SLIDE_ICONS: Record<string, string> = {
  cover: '📚',
  highlights: '⭐',
  overview: '🏢',
  location: '📍',
  land: '🗺️',
  gallery: '📷',
  rentroll: '📊',
  yield: '💰',
  closing: '📝',
};

function getCompleteness(slide: Slide): number {
  const overrides = slide.slideOverrides || {};
  const filledFields = Object.values(overrides).filter(
    v => v !== null && v !== undefined && v !== ''
  ).length;
  if (filledFields === 0) return 0;
  // Estimate based on typical field count per section
  const expectedFields: Record<string, number> = {
    cover: 3, highlights: 4, overview: 2, location: 3,
    land: 2, gallery: 1, rentroll: 1, yield: 2, closing: 3,
  };
  const expected = expectedFields[slide.dataKey] || 3;
  return Math.min(100, Math.round((filledFields / expected) * 100));
}

export function SlideNavigator({
  slides,
  selectedSlideId,
  onSelect,
}: {
  slides: Slide[];
  selectedSlideId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="p-3 space-y-2">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-3">
        슬라이드 구성 (9면)
      </h2>
      {slides.map(slide => {
        const isSelected = slide.id === selectedSlideId;
        const completeness = getCompleteness(slide);
        const icon = SLIDE_ICONS[slide.dataKey] || '📄';

        return (
          <button
            key={slide.id}
            onClick={() => onSelect(slide.id)}
            className={`w-full text-left p-3 rounded-lg border transition-all ${
              isSelected
                ? 'border-blue-500 bg-blue-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${
                  isSelected ? 'text-blue-700' : 'text-gray-700'
                }`}>
                  {slide.slideIndex}. {slide.title}
                </p>
                <p className="text-xs text-gray-400 truncate">{slide.kicker}</p>
              </div>
            </div>
            {/* Completeness bar */}
            <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  completeness >= 80 ? 'bg-green-500' :
                  completeness >= 40 ? 'bg-yellow-500' : 'bg-gray-300'
                }`}
                style={{ width: `${completeness}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
