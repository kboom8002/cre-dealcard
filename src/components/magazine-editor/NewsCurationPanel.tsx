import React from 'react';
import { Newspaper, ToggleRight, ToggleLeft, Star } from 'lucide-react';
import { motion } from 'motion/react';

interface NewsItem {
  id?: string;
  title: string;
  summary?: string;
  importance_score?: number;
  topic?: string;
  source?: string;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
}

interface NewsCurationPanelProps {
  allNews: NewsItem[];
  selectedNewsIds: Set<string>;
  toggleNews: (newsId: string) => void;
}

export function NewsCurationPanel({
  allNews,
  selectedNewsIds,
  toggleNews,
}: NewsCurationPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-slate-300">
          뉴스 큐레이션 ({selectedNewsIds.size}/{allNews.length})
        </p>
        <span className="text-[10px] text-slate-500">
          토글하여 매거진에 포함할 뉴스를 선택하세요
        </span>
      </div>

      {allNews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <Newspaper className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-xs">뉴스를 불러오는 중이거나 뉴스가 없습니다.</p>
        </div>
      ) : (
        allNews.map((news, idx) => {
          const newsId = news.id ?? news.title;
          const isSelected = selectedNewsIds.has(newsId);
          return (
            <motion.button
              key={newsId ?? idx}
              onClick={() => toggleNews(newsId)}
              whileTap={{ scale: 0.98 }}
              className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                isSelected
                  ? 'bg-indigo-500/10 border-indigo-500/30'
                  : 'bg-slate-800/20 border-slate-700/40 opacity-60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 flex-shrink-0">
                  {isSelected ? (
                    <ToggleRight className="w-5 h-5 text-indigo-400" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-slate-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-white leading-snug line-clamp-2 mb-1">
                    {news.title}
                  </p>
                  {/* AI summary inline */}
                  {news.summary && (
                    <p className="text-[10px] text-slate-400 leading-relaxed mb-1.5 line-clamp-3">
                      {news.summary}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {news.importance_score != null && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-300 bg-amber-500/12 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                        <Star className="w-2.5 h-2.5" />
                        {news.importance_score}
                      </span>
                    )}
                    {news.topic && (
                      <span className="text-[9px] font-medium text-indigo-300 bg-indigo-500/12 border border-indigo-500/20 px-1.5 py-0.5 rounded-full">
                        {news.topic}
                      </span>
                    )}
                    {news.source && (
                      <span className="text-[9px] text-slate-500">
                        {news.source}
                      </span>
                    )}
                    {news.sentiment && (
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          news.sentiment === 'bullish'
                            ? 'text-emerald-300 bg-emerald-500/12'
                            : news.sentiment === 'bearish'
                            ? 'text-rose-300 bg-rose-500/12'
                            : 'text-slate-400 bg-slate-500/12'
                        }`}
                      >
                        {news.sentiment === 'bullish'
                          ? '긍정'
                          : news.sentiment === 'bearish'
                          ? '부정'
                          : '중립'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })
      )}
    </div>
  );
}
