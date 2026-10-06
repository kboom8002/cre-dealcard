import React from 'react';
import { Newspaper, ToggleRight, ToggleLeft, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { MAX_NEWS_SELECTION } from '@/lib/magazine/edition-save';
import { cleanNewsText, formatNewsSummary, topicLabel } from '@/lib/magazine/editor-labels';
import { EmptyState } from '@/components/ui/empty-state';

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
        <p className="text-label font-semibold text-slate-300">
          뉴스 큐레이션 ({selectedNewsIds.size}/{MAX_NEWS_SELECTION} 선택)
        </p>
        <span className="text-caption text-ink-subtle">
          최대 {MAX_NEWS_SELECTION}개까지 선택할 수 있습니다
        </span>
      </div>

      {allNews.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="w-8 h-8 opacity-60" />}
          title="선택할 뉴스가 없습니다"
          description="새 뉴스가 수집되면 이곳에 표시됩니다."
        />
      ) : (
        allNews.map((news, idx) => {
          const newsId = news.id ?? news.title;
          const isSelected = selectedNewsIds.has(newsId);
          const topic = topicLabel(news.topic);
          const summaryLines = formatNewsSummary(news.summary);
          return (
            <motion.button
              key={newsId ?? idx}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggleNews(newsId)}
              whileTap={{ scale: 0.98 }}
              className={`w-full min-h-11 text-left p-3 rounded-xl border transition-all duration-200 ${
                isSelected
                  ? 'bg-indigo-500/10 border-indigo-500/30'
                  : 'bg-slate-800/20 border-slate-700/40 opacity-70'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 flex-shrink-0" aria-hidden="true">
                  {isSelected ? (
                    <ToggleRight className="w-5 h-5 text-indigo-400" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-ink-subtle" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-label font-bold text-white leading-snug line-clamp-2 mb-1">
                    {cleanNewsText(news.title)}
                  </p>
                  {/* AI summary inline — "핵심 팩트: … | 브로커 임플리케이션: …" 파이프 원문을 줄 단위로 */}
                  {summaryLines.length > 0 && (
                    <ul className="text-caption text-ink-muted leading-relaxed mb-1.5 space-y-0.5 list-none">
                      {summaryLines.slice(0, 3).map((line, i) => (
                        <li key={i} className="line-clamp-2">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {news.importance_score != null && (
                      <span
                        className="inline-flex items-center gap-0.5 text-caption font-bold text-amber-300 bg-amber-500/12 border border-amber-500/20 px-1.5 py-0.5 rounded-full"
                        title="중요도"
                      >
                        <Star className="w-2.5 h-2.5" aria-hidden="true" />
                        <span className="sr-only">중요도 </span>
                        {news.importance_score}
                      </span>
                    )}
                    {topic && (
                      <span className="text-caption font-medium text-indigo-300 bg-indigo-500/12 border border-indigo-500/20 px-1.5 py-0.5 rounded-full">
                        {topic}
                      </span>
                    )}
                    {news.source && (
                      <span className="text-caption text-ink-subtle">
                        {news.source}
                      </span>
                    )}
                    {news.sentiment && (
                      <span
                        className={`text-caption font-bold px-1.5 py-0.5 rounded-full ${
                          news.sentiment === 'bullish'
                            ? 'text-emerald-300 bg-emerald-500/12'
                            : news.sentiment === 'bearish'
                            ? 'text-rose-300 bg-rose-500/12'
                            : 'text-ink-subtle bg-slate-500/12'
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
