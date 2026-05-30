"use client";

import { motion } from "motion/react";
import { KpiSparkline } from "./KpiSparkline";
import {
  Building2,
  Users,
  UserCheck,
  Star,
} from "lucide-react";

interface KpiData {
  label: string;
  value: number;
  previousValue?: number;
  unit?: string;
  sparkData?: { value: number }[];
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconColor: string;
  iconBg: string;
  higherIsBetter?: boolean;
}

interface KpiGridProps {
  saleCount: number;
  leaseCount: number;
  buyerCount: number;
  tenantCount: number;
  matchCount: number;
  clientCount: number;
}

// Demo sparkline data — in production, pass actual historical data as props
function mockSpark(base: number): { value: number }[] {
  return Array.from({ length: 7 }, (_, i) => ({
    value: Math.max(0, base + Math.round((Math.random() - 0.5) * (base * 0.3))),
  }));
}

export function KpiGrid({
  saleCount,
  leaseCount,
  buyerCount,
  tenantCount,
  matchCount,
  clientCount,
}: KpiGridProps) {
  const kpis: KpiData[] = [
    {
      label: "매매물건",
      value: saleCount,
      previousValue: Math.max(0, saleCount - 2),
      sparkData: mockSpark(saleCount),
      icon: Building2,
      iconColor: "text-blue-400",
      iconBg: "bg-blue-500/10",
    },
    {
      label: "임대물건",
      value: leaseCount,
      previousValue: Math.max(0, leaseCount - 1),
      sparkData: mockSpark(leaseCount),
      icon: Building2,
      iconColor: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
    },
    {
      label: "매수고객",
      value: buyerCount,
      previousValue: Math.max(0, buyerCount - 3),
      sparkData: mockSpark(buyerCount),
      icon: Users,
      iconColor: "text-purple-400",
      iconBg: "bg-purple-500/10",
    },
    {
      label: "임차고객",
      value: tenantCount,
      previousValue: Math.max(0, tenantCount - 1),
      sparkData: mockSpark(tenantCount),
      icon: Users,
      iconColor: "text-amber-400",
      iconBg: "bg-amber-500/10",
    },
    {
      label: "S/A 매칭",
      value: matchCount,
      previousValue: Math.max(0, matchCount - 1),
      sparkData: mockSpark(matchCount),
      icon: Star,
      iconColor: "text-amber-400",
      iconBg: "bg-amber-500/10",
    },
    {
      label: "관리고객",
      value: clientCount,
      previousValue: Math.max(0, clientCount - 2),
      sparkData: mockSpark(clientCount),
      icon: UserCheck,
      iconColor: "text-teal-400",
      iconBg: "bg-teal-500/10",
    },
  ];

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
        핵심 KPI
      </p>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="bg-card border border-border rounded-2xl p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${kpi.iconBg}`}>
                  <Icon className={`w-3.5 h-3.5 ${kpi.iconColor}`} strokeWidth={2} />
                </div>
              </div>
              <KpiSparkline
                value={kpi.value}
                previousValue={kpi.previousValue}
                data={kpi.sparkData}
                label={kpi.label}
                higherIsBetter={kpi.higherIsBetter}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
