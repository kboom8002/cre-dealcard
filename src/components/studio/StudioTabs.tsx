'use client';

import Link from 'next/link';

interface StudioTabsProps {
  buildingId: string;
  activeTab: 'briefing' | 'lease' | 'files' | 'disclosure';
}

export function StudioTabs({ buildingId, activeTab }: StudioTabsProps) {
  const tabs = [
    { key: 'briefing', label: '📊 종합 대시보드', href: `/broker/buildings/${buildingId}/studio/briefing` },
    { key: 'lease', label: '📜 Rent Roll 상세 입력', href: `/broker/buildings/${buildingId}/studio/lease` },
    { key: 'files', label: '📂 증빙 서류 업로드', href: `/broker/buildings/${buildingId}/studio/files` },
    { key: 'disclosure', label: '🔒 Blind 공개 설정', href: `/broker/buildings/${buildingId}/studio/disclosure` },
  ] as const;

  return (
    <div className="flex border-b border-neutral-800 bg-neutral-900/40 p-1 rounded-t-2xl gap-1 overflow-x-auto scrollbar-none">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`flex-1 shrink-0 text-center py-3 px-4 rounded-xl text-xs font-bold transition-all duration-200 whitespace-nowrap cursor-pointer ${
              isActive
                ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/30'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
