import React from "react";
import { BookingFlow } from "@/components/scheduling/BookingFlow";
import { ScheduleAdvisorCard, RecommendedSlot } from "@/components/scheduling/ScheduleAdvisorCard";

export default function BuildingSchedulePage({ params }: { params: { id: string } }) {
  // In a real implementation, we'd fetch this from the server.
  const mockRecommendation: RecommendedSlot = {
    slot_id: "s1",
    date: "2026-06-25",
    time_range: "10:00 ~ 11:00",
    fit_reason: "대표님의 선호 요일(목요일)과 가장 일치하며, 채광이 가장 좋은 시간대입니다.",
    fit_score: 95,
    caution: "인기 시간대이므로 조기 마감될 수 있습니다."
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col pt-20 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-10">
        
        <div className="flex flex-col">
          <h1 className="text-4xl font-extrabold tracking-tight mb-4">
            방문 예약
          </h1>
          <p className="text-zinc-400 text-lg mb-8 leading-relaxed">
            건물주와 조율된 가용 시간에만 방문이 가능합니다. 원하시는 시간을 선택해 주시면 담당 중개인이 빠르게 확정해 드립니다.
          </p>

          <div className="mb-10">
            <ScheduleAdvisorCard 
              recommendation={mockRecommendation}
              onSelect={(slotId) => {
                // In a real implementation, this would trigger the BookingFlow
                alert(`추천 슬롯 ${slotId} 선택됨`);
              }}
            />
          </div>
        </div>

        <div className="flex items-start justify-center">
          <BookingFlow buildingId={params.id} />
        </div>

      </div>
    </div>
  );
}
