'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';

export interface ActionItem {
  id: string;
  type: 'hot_lead' | 'pro_request' | 'tagging' | 'stagnant';
  title: string;
  subtitle: string;
  dealId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

interface ActionQueueProps {
  items: ActionItem[];
}

const TYPE_CONFIG = {
  hot_lead: { icon: '🔥', label: 'Hot Lead', color: 'border-orange-500/30 bg-orange-500/5', badge: 'bg-orange-500/20 text-orange-300' },
  pro_request: { icon: '🔑', label: 'Pro 접근 요청', color: 'border-purple-500/30 bg-purple-500/5', badge: 'bg-purple-500/20 text-purple-300' },
  tagging: { icon: '🏷️', label: '태깅 대기', color: 'border-blue-500/30 bg-blue-500/5', badge: 'bg-blue-500/20 text-blue-300' },
  stagnant: { icon: '⏳', label: '정체 딜', color: 'border-amber-500/30 bg-amber-500/5', badge: 'bg-amber-500/20 text-amber-300' },
};

export function ActionQueue({ items: initialItems }: ActionQueueProps) {
  const [items, setItems] = useState(initialItems);
  const [processing, setProcessing] = useState<string | null>(null);

  const dismissItem = (id: string) => {
    setProcessing(id);
    setTimeout(() => {
      setItems(prev => prev.filter(item => item.id !== id));
      setProcessing(null);
    }, 300);
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
        <span className="text-4xl mb-3">✨</span>
        <p className="text-[15px] font-medium">모든 작업을 완료했습니다!</p>
        <p className="text-[13px] text-neutral-600 mt-1">새로운 알림이 도착하면 여기에 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[15px] font-bold text-white flex items-center gap-2">
          <span>⚡</span> 지금 처리 ({items.length})
        </h3>
      </div>
      <AnimatePresence>
        {items.map(item => {
          const config = TYPE_CONFIG[item.type];
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, x: 100 }}
              transition={{ duration: 0.25 }}
              className={`rounded-xl border p-4 ${config.color} ${processing === item.id ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{config.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${config.badge}`}>
                      {config.label}
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {new Date(item.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[15px] font-medium text-white truncate">{item.title}</p>
                  <p className="text-[13px] text-neutral-400 mt-0.5">{item.subtitle}</p>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 mt-3">
                    {item.type === 'hot_lead' && (
                      <>
                        <button onClick={() => dismissItem(item.id)}
                          className="px-3 py-1.5 bg-primary/20 text-primary text-[13px] font-bold rounded-lg hover:bg-primary/30 transition-colors">
                          📞 전화
                        </button>
                        <button onClick={() => dismissItem(item.id)}
                          className="px-3 py-1.5 bg-neutral-800 text-neutral-300 text-[13px] rounded-lg hover:bg-neutral-700 transition-colors">
                          ⏰ 나중에
                        </button>
                      </>
                    )}
                    {item.type === 'pro_request' && (
                      <>
                        <button onClick={() => dismissItem(item.id)}
                          className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 text-[13px] font-bold rounded-lg hover:bg-emerald-500/30 transition-colors">
                          ✅ NDA 승인
                        </button>
                        <button onClick={() => dismissItem(item.id)}
                          className="px-3 py-1.5 bg-red-500/20 text-red-300 text-[13px] rounded-lg hover:bg-red-500/30 transition-colors">
                          ❌ 거부
                        </button>
                      </>
                    )}
                    {item.type === 'tagging' && (
                      <div className="flex flex-wrap gap-1.5">
                        {['가격 불일치', '대출 거절', '주차 부족', '입지 불만', '퇴거 이슈'].map(reason => (
                          <button key={reason} onClick={() => dismissItem(item.id)}
                            className="px-2.5 py-1 bg-neutral-800 text-neutral-300 text-[11px] rounded-full hover:bg-primary/20 hover:text-primary transition-colors">
                            {reason}
                          </button>
                        ))}
                      </div>
                    )}
                    {item.type === 'stagnant' && (
                      <>
                        {item.dealId && (
                          <Link href={`/broker/deal/${item.dealId}`}
                            className="px-3 py-1.5 bg-primary/20 text-primary text-[13px] font-bold rounded-lg hover:bg-primary/30 transition-colors">
                            ▶ 다음 액션
                          </Link>
                        )}
                        <button onClick={() => dismissItem(item.id)}
                          className="px-3 py-1.5 bg-neutral-800 text-neutral-300 text-[13px] rounded-lg hover:bg-neutral-700 transition-colors">
                          📋 상태 메모
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
