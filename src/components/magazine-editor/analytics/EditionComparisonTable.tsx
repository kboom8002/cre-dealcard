'use client';

import React from 'react';
import { ArrowUpRight, Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export interface EditionComparisonItem {
  id: string;
  broker_id: string;
  edition_label?: string;
  title?: string;
  market_temp?: string | null;
  view_count?: number | null;
  published_at?: string | null;
  created_at?: string;
}

export interface EditionComparisonTableProps {
  editions: EditionComparisonItem[];
}

/** 호수 영문 표기(Vol.1 등)를 60대 친화 한글 호수 표기로 변환 */
export function formatEditionLabelKo(label: string | null | undefined): string {
  const raw = (label ?? '').trim();
  if (!raw) return '';
  const volMatch = raw.match(/^vol\.?\s*(\d+)$/i);
  if (volMatch) return `${volMatch[1]}호`;
  return raw;
}

/**
 * 발행 에디션별 성과 테이블 (U4 · EditionComparisonTable).
 * - 최소 글자 크기 14px 이상(text-sm / text-base)
 * - 새 창 열기 링크 터치 타깃 ≥44×48px (min-h-11 min-w-12) 및 한글 라벨('열기') 병기
 */
export function EditionComparisonTable({ editions }: EditionComparisonTableProps) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
          <Compass className="w-4 h-4 text-slate-300" aria-hidden="true" />
          발행 에디션별 성과
        </h4>
        <span className="text-sm text-slate-300">최근 20건</span>
      </div>
      {editions.length === 0 ? (
        <EmptyState
          title="아직 발행된 에디션이 없습니다"
          description="에디션을 발행하면 열람수가 여기에 표시됩니다."
        />
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto scrollbar-none">
          {editions.map((ed) => {
            const dateStr = (ed.published_at || ed.created_at)?.slice(0, 10);
            const koLabel = formatEditionLabelKo(ed.edition_label);
            return (
              <div
                key={ed.id}
                className="flex items-center justify-between bg-black/20 border border-white/5 hover:border-slate-700 p-3 rounded-xl text-base gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm text-slate-300">{dateStr}</span>
                    {koLabel ? (
                      <span className="text-sm text-indigo-300 font-semibold">{koLabel}</span>
                    ) : null}
                    {ed.market_temp ? (
                      <span className="text-sm px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                        {ed.market_temp}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-base text-white font-semibold truncate">
                    {ed.title || '제목 없음'}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-base text-white font-bold">{ed.view_count ?? 0}회</div>
                    <div className="text-sm text-slate-300">열람수</div>
                  </div>
                  <a
                    href={`/magazine/${ed.broker_id}/${dateStr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 min-w-12 items-center justify-center gap-1 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-200 hover:text-white transition-colors"
                    aria-label="새 창에서 열기"
                    title="새 창에서 열기"
                  >
                    <span>열기</span>
                    <ArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
