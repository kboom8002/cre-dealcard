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
    color: "bg-amber-500",
    textColor: "text-amber-300",
    border: "border-amber-500/40",
  },
  {
    href: "/broker/lease-card/new",
    icon: Key,
    label: "임대 딜카드",
    color: "bg-blue-500",
    textColor: "text-blue-300",
    border: "border-blue-500/40",
  },
  {
    href: "/broker/buyer-intents/new",
    icon: Target,
    label: "매수 의향서",
    color: "bg-rose-500",
    textColor: "text-rose-300",
    border: "border-rose-500/40",
  },
  {
    href: "/broker/tenant-intents/new",
    icon: Tag,
    label: "임차 의향서",
    color: "bg-emerald-500",
    textColor: "text-emerald-300",
    border: "border-emerald-500/40",
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
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md"
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
            className="fixed bottom-[80px] left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <div className="bg-[#0f172a]/95 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-3.5 shadow-2xl w-56">
              <p className="text-[11px] font-bold text-amber-300/80 uppercase tracking-widest text-center mb-2.5">
                신규 프라이빗 등록
              </p>
              <div className="space-y-2">
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
                        "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all",
                        "bg-[#1e293b]/90 hover:bg-[#334155] active:scale-[0.98]",
                        action.border
                      )}
                    >
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shadow-md", action.color)}>
                        <Icon className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                      </div>
                      <span className={cn("text-xs font-bold", action.textColor)}>
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
          "fixed bottom-[12px] left-1/2 -translate-x-1/2 z-50",
          "w-14 h-14 rounded-full shadow-[0_0_20px_rgba(212,175,55,0.35)]",
          "flex items-center justify-center border border-amber-300/60",
          "transition-colors duration-200",
          open
            ? "bg-slate-800 hover:bg-slate-700"
            : "bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-300 hover:from-amber-500 hover:to-yellow-200"
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
            <Plus className="w-6 h-6 text-slate-950" strokeWidth={3} />
          )}
        </motion.div>
      </motion.button>
    </>
  );
}

