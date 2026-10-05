'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { messageFromResponse, toUserMessage } from '@/lib/magazine/user-message';
import { describeEvent, formatKstDateTime, formatSeconds } from './analytics-text';
import type { SubscriberDetail } from './types';

interface Props {
  subscriberId: string | null;
  /** 목록에서 이미 알고 있는 이름(로딩 중 제목) */
  fallbackName?: string;
  onClose: () => void;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SubscriberDetail };

/** 고객 이름 클릭 → 우측 상세 패널: 열람 횟수·평균 체류·섹션·최근 30건 (T3-19). 실패는 ErrorState(빈 상태 위장 금지). */
export function SubscriberDetailPanel({ subscriberId, fallbackName, onClose }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!subscriberId) return;
    const ctrl = new AbortController();
    (async () => {
      setState({ status: 'loading' });
      try {
        const res = await fetch(`/api/broker/magazine/analytics?subscriberId=${encodeURIComponent(subscriberId)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const message = await messageFromResponse(res);
          if (!ctrl.signal.aborted) setState({ status: 'error', message });
          return;
        }
        const data = (await res.json()) as SubscriberDetail;
        if (!ctrl.signal.aborted) setState({ status: 'ready', data });
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setState({ status: 'error', message: toUserMessage(err) });
      }
    })();
    return () => ctrl.abort();
  }, [subscriberId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const title = state.status === 'ready' ? `${state.data.subscriber.subscriber_name} 열람 이력` : `${fallbackName ?? '고객'} 열람 이력`;

  return (
    <Modal
      open={!!subscriberId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={title}
      description="최근 30일, 내 호수에 대한 이 구독자의 열람 활동입니다."
      side="right"
    >
      {state.status === 'loading' ? (
        <p role="status" className="py-10 text-center text-body text-ink-muted">불러오는 중…</p>
      ) : state.status === 'error' ? (
        <ErrorState title="열람 이력을 불러오지 못했습니다" description={state.message} onRetry={retry} />
      ) : (
        <DetailBody data={state.data} />
      )}
    </Modal>
  );
}

function DetailBody({ data }: { data: SubscriberDetail }) {
  const a = data.analytics;
  const sections = a.sections ?? [];
  const labelById = new Map(sections.map((s) => [s.sectionId, s.label]));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-black/30 p-3">
          <div className="text-title font-black text-white">{a.totalViews}</div>
          <div className="text-label text-ink-subtle">열람 횟수</div>
        </div>
        <div className="rounded-lg bg-black/30 p-3">
          <div className="text-title font-black text-white">{formatSeconds(a.avgDwellSeconds, a.avgDwellSamples)}</div>
          <div className="text-label text-ink-subtle">평균 체류</div>
        </div>
        <div className="rounded-lg bg-black/30 p-3">
          <div className="text-label font-bold text-white">{formatKstDateTime(a.lastActivityAt)}</div>
          <div className="text-label text-ink-subtle">마지막 활동</div>
        </div>
      </div>

      {a.temperature ? (
        <p className="text-label text-ink-muted">
          매수 온도 <strong className="text-white">{a.temperature.label}</strong> · 점수 {a.temperature.score}
          (관심사 {a.temperature.engagementScore} · 행동 {a.temperature.crossChannelScore})
        </p>
      ) : null}

      <section aria-labelledby="sub-sections">
        <h3 id="sub-sections" className="mb-2 text-body font-bold text-white">본 섹션</h3>
        {sections.length === 0 ? (
          <EmptyState title="섹션 열람 기록이 없습니다" />
        ) : (
          <ul className="space-y-1.5">
            {sections.map((s) => (
              <li key={s.sectionId} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-body">
                <span className="text-slate-200">{s.label}</span>
                <span className="text-label text-ink-muted">
                  {s.count}회 · 체류 {formatSeconds(s.avgDwellSeconds)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sub-events">
        <h3 id="sub-events" className="mb-2 text-body font-bold text-white">최근 활동 (최대 30건)</h3>
        {a.recentEvents.length === 0 ? (
          <EmptyState title="최근 30일 활동 기록이 없습니다" description="아직 이 구독자의 열람 이벤트가 연결되지 않았습니다. 개인 링크로 접속한 열람만 구독자에게 연결됩니다." />
        ) : (
          <ul className="space-y-1">
            {a.recentEvents.map((ev) => (
              <li key={ev.id} className="flex items-start justify-between gap-3 rounded-lg bg-black/20 px-3 py-2 text-label">
                <span className="text-slate-200">
                  {describeEvent({ ...ev, section_label: ev.section_id ? labelById.get(ev.section_id) ?? null : null })}
                </span>
                <span className="shrink-0 font-mono text-ink-subtle">{formatKstDateTime(ev.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
