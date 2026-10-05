'use client';

import React from 'react';
import { POLL_HIDDEN_TEXT } from './analytics-text';
import type { PollResults } from './types';

interface Props {
  hourly: PollResults['hourly'];
  hidden: PollResults['hourlyHidden'];
}

/**
 * 투표 시간대(KST 0~23시) 분포. 서버가 숨긴 경우(표본<5 / 타임스탬프 없음) 사유만 보여준다.
 * 막대 차트는 시각용(aria-hidden)이고, 같은 값을 스크린리더용 표(sr-only table)로 함께 제공한다 (U-03).
 */
export function PollHourly({ hourly, hidden }: Props) {
  if (!hourly) {
    if (!hidden) return null;
    return <p className="text-label text-ink-subtle">{POLL_HIDDEN_TEXT[hidden]}</p>;
  }
  const max = Math.max(...hourly.map((h) => h.count), 1);
  const peak = hourly.reduce((best, h) => (h.count > best.count ? h : best), hourly[0]);
  return (
    <div className="space-y-1">
      <p className="text-label text-ink-muted">
        투표 시간대 분포 (한국 시간) · 가장 많은 시간대 {peak.hour}시 ({peak.count}명)
      </p>
      <div className="flex h-16 items-end gap-0.5" aria-hidden="true">
        {hourly.map((h) => (
          <div
            key={h.hour}
            title={`${h.hour}시 ${h.count}명`}
            className="flex-1 rounded-t bg-violet-400/70"
            style={{ height: `${Math.max(h.count > 0 ? 8 : 2, Math.round((h.count / max) * 100))}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-label text-ink-subtle" aria-hidden="true">
        <span>0시</span>
        <span>12시</span>
        <span>23시</span>
      </div>
      <table className="sr-only">
        <caption>시간대별 투표 수 (한국 시간)</caption>
        <thead>
          <tr>
            <th scope="col">시간</th>
            <th scope="col">투표 수</th>
          </tr>
        </thead>
        <tbody>
          {hourly
            .filter((h) => h.count > 0)
            .map((h) => (
              <tr key={h.hour}>
                <th scope="row">{h.hour}시</th>
                <td>{h.count}명</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
