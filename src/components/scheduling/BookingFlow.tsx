"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CalendarPicker } from "./CalendarPicker";
import { TimeSlotSelector, SlotInfo } from "./TimeSlotSelector";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface BookingFlowProps {
  buildingId: string;
  proxyBuyerId?: string; // If provided, broker is booking on behalf of this buyer
  onBookingComplete?: () => void;
}

export function BookingFlow({ buildingId, proxyBuyerId, onBookingComplete }: BookingFlowProps) {
  const [step, setStep] = useState<"date" | "time" | "confirm">("date");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const [slotsByDate, setSlotsByDate] = useState<Record<string, SlotInfo[]>>({});
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data: dbSlots } = await supabase
      .from('availability_slots')
      .select('*')
      .eq('building_id', buildingId)
      .gte('slot_date', today)
      .order('slot_start', { ascending: true });

    if (dbSlots) {
      const datesSet = new Set<string>();
      const byDate: Record<string, SlotInfo[]> = {};
      
      dbSlots.forEach(s => {
        datesSet.add(s.slot_date);
        if (!byDate[s.slot_date]) byDate[s.slot_date] = [];
        const start = new Date(s.slot_start);
        const end = new Date(s.slot_end);
        const formatTime = (d: Date) => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        byDate[s.slot_date].push({
          id: s.id,
          startTime: formatTime(start),
          endTime: formatTime(end),
          status: s.status === 'available' ? 'available' : 'full', // simplified
        });
      });
      
      setDates(Array.from(datesSet).sort());
      setSlotsByDate(byDate);
    }
    setLoading(false);
  }, [buildingId, supabase]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setStep("time");
  };

  const handleSlotSelect = async (slotId: string) => {
    setSubmitting(true);
    
    // In a real app, user should be logged in or we ask for contact info
    const { data: { user } } = await supabase.auth.getUser();
    
    // API 호출로 CAS 락 확보
    try {
      const res = await fetch("/api/broker/schedule/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId,
          requesterId: user ? user.id : null,
          matchResultId: proxyBuyerId || undefined,
        }),
      });

      if (res.ok) {
        setSelectedSlot(slotId);
        setStep("confirm");
        onBookingComplete?.();
      } else {
        const errData = await res.json();
        alert(errData.error || "예약에 실패했습니다. 이미 다른 사용자가 선점 중인 시간대일 수 있습니다.");
      }
    } catch (err: any) {
      alert("예약 요청 중 서버 오류가 발생했습니다.");
    }
    
    setSubmitting(false);
  };

  const resetFlow = () => {
    setStep("date");
    setSelectedDate(null);
    setSelectedSlot(null);
    fetchSlots(); // refresh slots
  };

  if (loading) {
    return (
      <div className="w-full max-w-sm mx-auto flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto relative min-h-[500px]">
      <AnimatePresence mode="wait">
        
        {step === "date" && (
          <motion.div
            key="step-date"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex flex-col gap-4"
          >
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">언제 방문하실까요?</h2>
            {dates.length === 0 ? (
              <p className="text-zinc-500 bg-zinc-100 dark:bg-zinc-800/50 p-4 rounded-xl text-sm">
                현재 예약 가능한 일정이 없습니다.
              </p>
            ) : (
              <CalendarPicker 
                availableDates={dates}
                selectedDate={selectedDate}
                onSelectDate={handleDateSelect}
              />
            )}
          </motion.div>
        )}

        {step === "time" && (
          <motion.div
            key="step-time"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex flex-col"
          >
            <button 
              onClick={() => setStep("date")}
              className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white mb-4 transition-colors w-fit"
            >
              <ArrowLeft className="w-4 h-4" /> 날짜 다시 선택
            </button>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">{selectedDate}</h2>
            
            {submitting ? (
               <div className="py-10 flex flex-col items-center justify-center space-y-3">
                 <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                 <p className="text-sm font-medium">예약 처리 중...</p>
               </div>
            ) : (
              <TimeSlotSelector 
                date={selectedDate!}
                slots={slotsByDate[selectedDate!] || []}
                selectedSlotId={selectedSlot}
                onSelectSlot={handleSlotSelect}
                onJoinWaitlist={() => alert('대기열')}
              />
            )}
          </motion.div>
        )}

        {step === "confirm" && (
          <motion.div
            key="step-confirm"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-zinc-900/80 rounded-2xl border border-border shadow-lg mt-10"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.2 }}
            >
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4" />
            </motion.div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">예약이 신청되었습니다</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
              선택하신 일정이 가승인 되었습니다.<br/>담당자의 최종 확인 후 확정됩니다.
            </p>
            
            <button 
              onClick={resetFlow}
              className="w-full py-3 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              확인
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
