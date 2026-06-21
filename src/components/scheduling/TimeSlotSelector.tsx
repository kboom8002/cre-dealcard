"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Clock, Users, ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface SlotInfo {
  id: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  status: "available" | "held" | "full";
  priceBand?: string | null;
}

interface TimeSlotSelectorProps {
  date: string;
  slots: SlotInfo[];
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  onJoinWaitlist: (slotId: string) => void;
}

export function TimeSlotSelector({ date, slots, selectedSlotId, onSelectSlot, onJoinWaitlist }: TimeSlotSelectorProps) {
  if (!date) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm flex flex-col gap-3 mt-4"
    >
      <h3 className="text-zinc-400 text-sm font-medium px-2 mb-1 flex items-center gap-2">
        <Clock className="w-4 h-4" /> 선택 가능한 시간
      </h3>

      <div className="flex flex-col gap-2">
        <AnimatePresence>
          {slots.length === 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-zinc-500 text-sm px-2"
            >
              해당 날짜에 예약 가능한 일정이 없습니다.
            </motion.p>
          )}

          {slots.map((slot, i) => {
            const isSelected = selectedSlotId === slot.id;
            const isAvailable = slot.status === "available";
            const isFull = slot.status === "full" || slot.status === "held";

            return (
              <motion.div
                key={slot.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <button
                  onClick={() => isAvailable ? onSelectSlot(slot.id) : null}
                  disabled={isFull}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl border transition-all duration-200 text-left",
                    isSelected 
                      ? "bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]" 
                      : isFull 
                        ? "bg-zinc-900/50 border-zinc-800/50 opacity-60" 
                        : "bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80"
                  )}
                >
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-lg font-semibold tracking-tight",
                      isSelected ? "text-blue-400" : isFull ? "text-zinc-500" : "text-zinc-200"
                    )}>
                      {slot.startTime} <span className="text-zinc-500 text-sm font-normal mx-1">~</span> {slot.endTime}
                    </span>
                    {slot.priceBand && (
                      <span className="text-xs text-zinc-500 mt-0.5">{slot.priceBand}</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {isFull ? (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onJoinWaitlist(slot.id); }}
                        className="flex items-center gap-1 text-xs font-medium bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-full hover:bg-zinc-700 transition-colors"
                      >
                        <Users className="w-3 h-3" /> 대기열 등록
                      </button>
                    ) : (
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                        isSelected ? "border-blue-500" : "border-zinc-700"
                      )}>
                        {isSelected && <motion.div layoutId="check" className="w-2.5 h-2.5 bg-blue-500 rounded-full" />}
                      </div>
                    )}
                  </div>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
