"use client";

import ServiceCard from "./ServiceCard";
import type { ServiceCardData } from "./ServiceCard";

interface Props {
  title?: string;
  serviceCards: ServiceCardData[];
}

export default function ServiceMatchSection({ title, serviceCards }: Props) {
  if (serviceCards.length === 0) return null;

  return (
    <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
        ✨ {title ?? "관련 전문 서비스"}
      </p>
      <div className="space-y-3">
        {serviceCards.map((card) => (
          <ServiceCard key={card.id} card={card} />
        ))}
      </div>
      <p className="text-[9px] text-slate-600 mt-3 text-center">
        DealCard 인증 서비스 파트너 · 리드 전환 시 건당 수수료 적용
      </p>
    </div>
  );
}
