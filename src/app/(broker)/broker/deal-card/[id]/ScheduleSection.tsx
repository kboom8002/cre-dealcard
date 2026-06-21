'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Calendar, ChevronRight } from 'lucide-react';

interface ScheduleSectionProps {
  buildingId: string;
}

export function ScheduleSection({ buildingId }: ScheduleSectionProps) {
  const [slotsCount, setSlotsCount] = useState<number | null>(null);
  const [bookingsCount, setBookingsCount] = useState<number | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchData() {
      // Fetch upcoming slots
      const { data: slots } = await supabase
        .from('availability_slots')
        .select('id')
        .eq('building_id', buildingId)
        .gte('slot_date', new Date().toISOString().split('T')[0]);
      
      setSlotsCount(slots?.length || 0);

      // Fetch confirmed/held bookings for these slots
      if (slots && slots.length > 0) {
        const slotIds = slots.map((s) => s.id);
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id')
          .in('slot_id', slotIds)
          .in('status', ['hold', 'confirmed']);
        setBookingsCount(bookings?.length || 0);
      } else {
        setBookingsCount(0);
      }
    }
    fetchData();
  }, [buildingId, supabase]);

  if (slotsCount === null) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 animate-pulse h-24" />
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-amber-600 dark:text-amber-500 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> 임장 일정 관리
        </h2>
        <Link 
          href={`/broker/schedule?buildingId=${buildingId}`}
          className="text-xs font-semibold text-amber-600 dark:text-amber-500 hover:underline flex items-center"
        >
          상세 설정 <ChevronRight className="w-3 h-3 ml-0.5" />
        </Link>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 bg-card rounded-lg p-3 border border-border/50 text-center shadow-sm">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">예약 대기/확정</p>
          <p className="text-xl font-black text-foreground mt-1">{bookingsCount}건</p>
        </div>
        <div className="flex-1 bg-card rounded-lg p-3 border border-border/50 text-center shadow-sm">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">오픈된 슬롯</p>
          <p className="text-xl font-black text-foreground mt-1">{slotsCount}개</p>
        </div>
      </div>
      
      {slotsCount === 0 && (
        <div className="mt-2 text-center">
          <Link
            href={`/broker/schedule?buildingId=${buildingId}&setup=true`}
            className="inline-flex w-full items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-600 shadow-sm"
          >
            임장 가능 시간 등록하기
          </Link>
        </div>
      )}
    </div>
  );
}
