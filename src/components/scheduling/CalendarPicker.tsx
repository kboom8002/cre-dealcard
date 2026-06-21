"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface CalendarPickerProps {
  availableDates: string[]; // ISO Date strings e.g. "2026-06-25"
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

export function CalendarPicker({ availableDates, selectedDate, onSelectDate }: CalendarPickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 5, 1)); // Jun 2026 for demo
  
  // Dummy logic to generate month days
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1);
    // adjust timezone manually to format YYYY-MM-DD
    const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      date: isoDate,
      day: i + 1,
      isAvailable: availableDates.includes(isoDate),
    };
  });

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };
  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const monthNames = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

  return (
    <div className="w-full max-w-sm rounded-2xl bg-zinc-900/80 p-6 backdrop-blur-md border border-zinc-800 shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <button onClick={prevMonth} className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="font-semibold text-lg text-zinc-100 tracking-wide">
          {currentMonth.getFullYear()}년 {monthNames[currentMonth.getMonth()]}
        </div>
        <button onClick={nextMonth} className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-4 gap-x-2 text-center mb-2">
        {["일", "월", "화", "수", "목", "금", "토"].map(d => (
          <div key={d} className="text-xs font-medium text-zinc-500">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-2 gap-x-2">
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        
        {days.map((day) => {
          const isSelected = selectedDate === day.date;
          return (
            <button
              key={day.date}
              onClick={() => day.isAvailable && onSelectDate(day.date)}
              disabled={!day.isAvailable}
              className="relative w-10 h-10 mx-auto flex items-center justify-center rounded-full focus:outline-none group"
            >
              {isSelected && (
                <motion.div
                  layoutId="selected-date"
                  className="absolute inset-0 bg-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              
              <span className={cn(
                "relative z-10 text-sm font-medium transition-colors duration-200",
                isSelected ? "text-white" : 
                day.isAvailable ? "text-zinc-200 group-hover:text-blue-400" : "text-zinc-700"
              )}>
                {day.day}
              </span>

              {day.isAvailable && !isSelected && (
                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-blue-500/50 group-hover:bg-blue-400 transition-colors" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
