"use client";

import React, { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from "recharts";

interface ABTestResult {
  variantName: string;
  totalViews: number;
  avgDurationSec: number;
  conversionRatePct: number;
  bounceRatePct: number;
}

const mockData: ABTestResult[] = [
  { variantName: "A (기존 템플릿)", totalViews: 1250, avgDurationSec: 45, conversionRatePct: 2.4, bounceRatePct: 68 },
  { variantName: "B (AI 최적화)", totalViews: 1310, avgDurationSec: 112, conversionRatePct: 5.8, bounceRatePct: 42 },
];

export function ABTestDashboard() {
  const [data] = useState<ABTestResult[]>(mockData);

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm my-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>🧪</span> A/B 테스트 성과 대시보드
        </h3>
        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">진행 중 (74% 신뢰도)</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-secondary/20 p-4 rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Variant B 전환율(Conversion)</div>
          <div className="text-2xl font-bold text-emerald-600">5.8% <span className="text-sm font-normal ml-1">(+141%)</span></div>
        </div>
        <div className="bg-secondary/20 p-4 rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Variant B 체류시간</div>
          <div className="text-2xl font-bold text-emerald-600">112초 <span className="text-sm font-normal ml-1">(+148%)</span></div>
        </div>
        <div className="bg-secondary/20 p-4 rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">이탈률 개선</div>
          <div className="text-2xl font-bold text-blue-500">-26%p</div>
        </div>
        <div className="bg-secondary/20 p-4 rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">승자(Winner) 추정</div>
          <div className="text-2xl font-bold text-primary">Variant B</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Conversion Rate Comparison */}
        <div>
          <h4 className="text-sm font-semibold mb-3 text-muted-foreground">목표 전환율 비교 (문의하기 클릭 등)</h4>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="variantName" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(val) => `${val}%`} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px' }} />
                <Bar dataKey="conversionRatePct" name="전환율(%)" radius={[4, 4, 0, 0]} barSize={40}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 1 ? '#10b981' : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Avg Duration Comparison */}
        <div>
          <h4 className="text-sm font-semibold mb-3 text-muted-foreground">평균 체류 시간 비교 (초)</h4>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="variantName" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px' }} />
                <Bar dataKey="avgDurationSec" name="체류 시간(초)" radius={[4, 4, 0, 0]} barSize={40}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 1 ? '#3b82f6' : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
