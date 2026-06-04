"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Plus, X, Building2, Key, Target, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHaptic } from "@/hooks/useHaptic";

const ACTIONS = [
  {
    href: "/broker/deal-card/new",
    icon: Building2,
    label: "매매 딜카드",
    color: "bg-blue-500",
    textColor: "text-blue-400",
    border: "border-blue-500/30",
  },
  {
    href: "/broker/lease-card/new",
    icon: Key,
    label: "임대 딜카드",
    color: "bg-primary",
    textColor: "text-primary",
    border: "border-primary/30",
  },
  {
    href: "/broker/buyer-intents/new",
    icon: Target,
    label: "매수 의향서",
    color: "bg-amber-500",
    textColor: "text-amber-400",
    border: "border-amber-500/30",
  },
  {
    href: "/broker/tenant-intents/new",
    icon: Tag,
    label: "임차 의향서",
    color: "bg-emerald-500",
    textColor: "text-emerald-400",
    border: "border-emerald-500/30",
  },
] as const;

export function BrokerCreateFAB() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const haptic = useHaptic();

  const handleToggle = () => {
    haptic.medium();
    setOpen((v) => !v);
  };

  const handleAction = (href: string) => {
    haptic.light();
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Action items — appear above FAB */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed bottom-[76px] left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <div className="bg-[#0e1424]/95 backdrop-blur-md border border-slate-800 rounded-2xl p-3 shadow-2xl w-52">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center mb-2">
                새로 만들기
              </p>
              <div className="space-y-1.5">
                {ACTIONS.map((action, i) => {
                  const Icon = action.icon;
                  return (
                    <motion.button
                      key={action.href}
                      type="button"
                      onClick={() => handleAction(action.href)}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all",
                        "bg-[#131b2e] hover:bg-[#1a2540] active:scale-[0.98]",
                        action.border
                      )}
                    >
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", action.color)}>
                        <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                      </div>
                      <span className={cn("text-xs font-semibold", action.textColor)}>
                        {action.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB button — sits in the center of BottomNav */}
      <motion.button
        type="button"
        id="broker-create-fab"
        aria-label="새로 만들기"
        onClick={handleToggle}
        className={cn(
          "fixed bottom-[10px] left-1/2 -translate-x-1/2 z-50",
          "w-14 h-14 rounded-full shadow-2xl",
          "flex items-center justify-center",
          "transition-colors duration-200",
          open
            ? "bg-slate-700 hover:bg-slate-600"
            : "bg-primary hover:bg-primary/90"
        )}
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.05 }}
      >
        <motion.div
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
          {open ? (
            <X className="w-6 h-6 text-white" strokeWidth={2.5} />
          ) : (
            <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
          )}
        </motion.div>
      </motion.button>
    </>
  );
}
