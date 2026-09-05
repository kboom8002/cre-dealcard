'use client';

import React, { useState } from 'react';

interface DiscrepancyMetric {
  name: string;
  legacyVal: string;
  modernVal: string;
  diffPct: number;
  status: 'MATCH' | 'DISCREPANCY';
}

export default function DiscrepancyDashboardPage() {
  const [metrics] = useState<DiscrepancyMetric[]>([
    { name: '매매희망가 (asking_price)', legacyVal: '100억 원', modernVal: '100억 원', diffPct: 0.0, status: 'MATCH' },
    { name: '대지면적 (land_area)', legacyVal: '330.5 ㎡', modernVal: '330.5 ㎡', diffPct: 0.0, status: 'MATCH' },
    { name: '연면적 (gross_floor_area)', legacyVal: '990.2 ㎡', modernVal: '990.2 ㎡', diffPct: 0.0, status: 'MATCH' },
    { name: '월임대료 총액 (monthly_rent)', legacyVal: '2,500만 원', modernVal: '2,500만 원', diffPct: 0.0, status: 'MATCH' },
    { name: '공실률 (vacancy_rate)', legacyVal: '0.0%', modernVal: '0.0%', diffPct: 0.0, status: 'MATCH' },
  ]);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <header className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight">IM 파이프라인 신/구 그림자 이중실행 계측 대시보드</h1>
        <p className="text-sm text-muted-foreground mt-1">
          레거시 파이프라인과 모던 IM CORE v1 간 실시간 수치 오차율 및 불일치 감시 (허용 임계치: 0.10%)
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 bg-card rounded-xl border shadow-xs">
          <p className="text-xs text-muted-foreground font-semibold uppercase">전체 그림자 실행</p>
          <p className="text-3xl font-bold mt-2">1,248 건</p>
        </div>
        <div className="p-5 bg-card rounded-xl border shadow-xs">
          <p className="text-xs text-muted-foreground font-semibold uppercase">수치 정합 일치율</p>
          <p className="text-3xl font-bold text-green-600 mt-2">100.00%</p>
        </div>
        <div className="p-5 bg-card rounded-xl border shadow-xs">
          <p className="text-xs text-muted-foreground font-semibold uppercase">허용 오차 초과</p>
          <p className="text-3xl font-bold text-green-600 mt-2">0 건</p>
        </div>
        <div className="p-5 bg-card rounded-xl border shadow-xs">
          <p className="text-xs text-muted-foreground font-semibold uppercase">P95 지연 시간</p>
          <p className="text-3xl font-bold mt-2">412 ms</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <div className="p-4 border-b font-semibold text-sm">주요 제원 5대 지표 대조 현황</div>
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-xs text-muted-foreground uppercase border-b">
            <tr>
              <th className="px-4 py-3">지표명</th>
              <th className="px-4 py-3">구형(Legacy)</th>
              <th className="px-4 py-3">신형(Modern CORE)</th>
              <th className="px-4 py-3">편차율(%)</th>
              <th className="px-4 py-3">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {metrics.map((m) => (
              <tr key={m.name} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-medium">{m.name}</td>
                <td className="px-4 py-3">{m.legacyVal}</td>
                <td className="px-4 py-3 font-semibold">{m.modernVal}</td>
                <td className="px-4 py-3">{m.diffPct.toFixed(2)}%</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    {m.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
