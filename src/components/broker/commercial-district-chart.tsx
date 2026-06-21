"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import type { CommercialDistrictAnalysis } from "@/lib/external/semas-commercial-api";

interface CommercialDistrictChartProps {
  data: CommercialDistrictAnalysis | null;
}

export function CommercialDistrictChart({ data }: CommercialDistrictChartProps) {
  if (!data) return null;

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm my-6">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <span>🏪</span> 소상공인 상권 분석 ({data.districtName})
      </h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-secondary/30 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">상점 수</div>
          <div className="text-xl font-bold">{data.storeCount.toLocaleString()}개</div>
        </div>
        <div className="bg-secondary/30 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">일평균 유동인구</div>
          <div className="text-xl font-bold">{data.footfallDaily.toLocaleString()}명</div>
        </div>
        <div className="bg-secondary/30 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">상권 매출 지수</div>
          <div className="text-xl font-bold text-emerald-600">{data.salesIndex}</div>
        </div>
        <div className="bg-secondary/30 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">폐업률</div>
          <div className="text-xl font-bold text-red-500">{data.closingRate.toFixed(1)}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div>
          <div className="text-sm font-semibold mb-3 text-muted-foreground">시간대별 유동인구</div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.footfallByTime} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} width={45} />
                <Tooltip 
                  cursor={{ fill: '#f3f4f6' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div>
          <div className="text-sm font-semibold mb-3 text-muted-foreground">주요 업종 비율</div>
          <div className="h-[200px] w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.topCategories}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="share"
                  nameKey="name"
                >
                  {data.topCategories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any) => `${(Number(value) * 100).toFixed(1)}%`}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Custom Legend */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-2">
              {data.topCategories.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span className="truncate w-20" title={entry.name}>{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
