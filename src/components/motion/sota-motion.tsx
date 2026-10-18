"use client";

import React, { useState } from "react";
import { motion, AnimatePresence, type Transition, type Variants } from "motion/react";
import { ChevronDown } from "lucide-react";

/**
 * SOTA Spring Physics Constants (Linear / Toss / Apple HIG inspired)
 * Snappy, zero-overshoot damping so 60s users never experience motion sickness.
 */
export const SOTA_SPRING: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 32,
  mass: 0.8,
};

export const SOTA_GENTLE_SPRING: Transition = {
  type: "spring",
  stiffness: 290,
  damping: 30,
  mass: 0.85,
};

export const STAGGER_CONTAINER_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.02,
    },
  },
};

export const STAGGER_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.99 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: SOTA_GENTLE_SPRING,
  },
};

export function StaggerContainer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={STAGGER_CONTAINER_VARIANTS}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={STAGGER_ITEM_VARIANTS} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * SOTA Segmented Control with Shared `layoutId` Sliding Pill
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  badge?: React.ReactNode;
  testId?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  className = "",
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  layoutId: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex items-center p-1.5 rounded-2xl bg-slate-200/80 dark:bg-slate-800/90 border border-slate-300/80 dark:border-slate-700 shadow-inner ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={opt.testId}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-[15px] font-extrabold transition-colors select-none whitespace-nowrap ${
              active
                ? "text-blue-950 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={SOTA_SPRING}
                className="absolute inset-0 -z-10 rounded-xl bg-white dark:bg-indigo-600 shadow-[0_2px_8px_rgba(15,23,42,0.12),0_0_0_1px_rgba(37,99,235,0.22)]"
              />
            )}
            <span>{opt.label}</span>
            {opt.badge}
          </button>
        );
      })}
    </div>
  );
}

/**
 * SOTA Animated Accordion (Replaces raw HTML <details>/<summary>)
 */
export function AnimatedAccordion({
  title,
  subtitle,
  icon,
  badge,
  defaultOpen = false,
  children,
  className = "",
  summaryTestId,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  summaryTestId?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
        isOpen
          ? "border-blue-500/40 bg-white dark:bg-slate-900 shadow-[0_8px_24px_-4px_rgba(15,23,42,0.08)]"
          : "border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/60 shadow-[0_1px_3px_rgba(15,23,42,0.04)] hover:border-slate-300"
      } ${className}`}
    >
      <button
        type="button"
        data-testid={summaryTestId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        className="w-full px-5 py-4 text-left flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <span className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800/50 flex items-center justify-center text-lg shrink-0">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <div className="text-[16px] font-extrabold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
              <span>{title}</span>
              {badge}
            </div>
            {subtitle && (
              <p className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-extrabold text-slate-700 dark:text-slate-200 shrink-0">
          <span>{isOpen ? "접기" : "펼치기"}</span>
          <motion.span
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={SOTA_SPRING}
            className="inline-flex"
          >
            <ChevronDown className="w-4 h-4" />
          </motion.span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SOTA_GENTLE_SPRING}
            className="overflow-hidden"
          >
            <div className="p-5 pt-3 border-t border-slate-200/80 dark:border-slate-800">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
