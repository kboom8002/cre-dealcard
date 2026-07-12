"use client";

import React, { useState, useEffect } from "react";
import { calculateFinancials, type FinancialInputs, type FinancialOutputs } from "@/domain/building/mobile-im/financials";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

export interface YieldSimulatorProps {
  initialPrice: number;
  initialRent: number;
  initialDeposit: number;
  initialMgmtFee: number;
  initialLoan: number;
}

export function YieldSimulator({ 
  initialPrice, 
  initialRent, 
  initialDeposit, 
  initialMgmtFee, 
  initialLoan 
}: YieldSimulatorProps) {
  const [price, setPrice] = useState(initialPrice);
  const [rent, setRent] = useState(initialRent);
  const [deposit, setDeposit] = useState(initialDeposit);
  const [loan, setLoan] = useState(initialLoan);

  const [results, setResults] = useState<FinancialOutputs | null>(null);

  useEffect(() => {
    const inputs: FinancialInputs = {
      monthlyRentKrw: rent * 10000,
      purchasePriceKrw: price * 10000,
      totalDepositManwon: deposit,
      mgmtFeeTotalManwon: initialMgmtFee,
      loanAmountManwon: loan,
      vacancyRatePct: 5,
    };
    const outputs = calculateFinancials(inputs);
    setResults(outputs);
  }, [price, rent, deposit, loan, initialMgmtFee]);

  if (!results) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm my-6">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <span>🧮</span> 인터랙티브 수익률 시뮬레이터
      </h3>
      
      <div className="space-y-4 mb-6">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium text-muted-foreground">매각 희망가 (만원)</span>
            <span className="font-bold text-primary">{price.toLocaleString()}</span>
          </div>
          <input 
            type="range" 
            min={Math.max(0, initialPrice * 0.5)} 
            max={initialPrice * 1.5} 
            step={1000}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium text-muted-foreground">대출 금액 (만원)</span>
            <span className="font-bold text-primary">{loan.toLocaleString()}</span>
          </div>
          <input 
            type="range" 
            min={0} 
            max={price * 0.8} // Max 80% LTV
            step={1000}
            value={loan}
            onChange={(e) => setLoan(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium text-muted-foreground">월 임대료 (만원)</span>
            <span className="font-bold text-primary">{rent.toLocaleString()}</span>
          </div>
          <input 
            type="range" 
            min={Math.max(0, initialRent * 0.5)} 
            max={initialRent * 2} 
            step={10}
            value={rent}
            onChange={(e) => setRent(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      </div>

      <div className="bg-secondary/30 rounded-lg p-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1">자기자본 소요액</div>
          <div className="text-lg font-bold">{results.equityRequired ? `${results.equityRequired}억` : '-'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">레버리지 수익률</div>
          <div className="text-lg font-bold text-emerald-600">{results.leveragedYield ? `${results.leveragedYield}%` : '-'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Cap Rate</div>
          <div className="text-lg font-bold">{results.capRate ? `${results.capRate.base}%` : '-'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">10년 보유 IRR</div>
          <div className="text-lg font-bold">{results.dcf10Year?.irrBase != null ? `${results.dcf10Year.irrBase}%` : results.irr5Year ? `${results.irr5Year.base}%` : '-'}</div>
        </div>
        {results.dcf10Year && (
          <div className="col-span-2 border-t border-border/50 pt-3 mt-1">
            <div className="text-xs text-muted-foreground mb-1">10년 DCF NPV</div>
            <div className={`text-lg font-bold ${results.dcf10Year.npvBase > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {results.dcf10Year.npvBase > 0 ? '+' : ''}{(results.dcf10Year.npvBase / 1e8).toFixed(1)}억
            </div>
            
            <div className="mt-4">
              <div className="text-xs text-muted-foreground mb-2">할인율 대비 NPV 민감도 분석 (억 원)</div>
              <div className="h-[150px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={results.dcf10Year.sensitivityMatrix.filter(m => m.exitCapRate === results.dcf10Year!.sensitivityMatrix[4].exitCapRate).map(m => ({
                      rate: (m.discountRate * 100).toFixed(1) + '%',
                      npv: Math.round(m.npv / 1e8)
                    }))} 
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="rate" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: 12, borderRadius: '8px' }} />
                    <Bar dataKey="npv" fill="#10b981" radius={[4, 4, 0, 0]}>
                      {
                        results.dcf10Year.sensitivityMatrix.filter(m => m.exitCapRate === results.dcf10Year!.sensitivityMatrix[4].exitCapRate).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.npv >= 0 ? '#10b981' : '#ef4444'} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
