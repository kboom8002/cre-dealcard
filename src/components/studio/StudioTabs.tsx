'use client';

import Link from 'next/link';

interface StudioTabsProps {
  buildingId: string;
  activeTab: 'briefing' | 'lease' | 'files' | 'disclosure' | 'legal';
}

export function StudioTabs({ buildingId, activeTab }: StudioTabsProps) {
  const tabs = [
    { key: 'briefing', label: '📊 종합 대시보드', href: `/broker/buildings/${buildingId}/studio/briefing` },
    { key: 'lease', label: '📜 Rent Roll 상세 입력', href: `/broker/buildings/${buildingId}/studio/lease` },
    { key: 'files', label: '📂 증빙 서류 업로드', href: `/broker/buildings/${buildingId}/studio/files` },
    { key: 'disclosure', label: '🔒 Blind 공개 설정', href: `/broker/buildings/${buildingId}/studio/disclosure` },
    { key: 'legal', label: '⚖️ 한국법 필수 항목', href: `/broker/buildings/${buildingId}/studio/legal` },
  ] as const;

  return (
    <div className="flex border border-slate-200 bg-slate-100 p-1.5 rounded-t-2xl gap-1 overflow-x-auto scrollbar-none">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`flex-1 shrink-0 min-h-[44px] flex items-center justify-center text-center py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-200 whitespace-nowrap cursor-pointer ${
              isActive
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
