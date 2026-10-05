'use client';

import React, { useEffect, useId, useState } from 'react';
import { Flame, Mail, Phone, Target, Trash2, X, Loader2, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonGroup, SkeletonText } from '@/components/ui/Skeleton';
import { TAG_GROUP_KEYS, type TagGroupKey } from '@/lib/magazine/tags';
import {
  TAG_GROUP_LABELS,
  TAG_PRESETS,
  addTag,
  buildTagsPatch,
  describeIntentResult,
  eventLabel,
  extractApiError,
  isUnsubscribedLike,
  networkErrorMessage,
  parseSubscriberHistory,
  pendingReasonInfo,
  readSubscriberTags,
  removeTag,
  statusLabel,
  tagRecordsEqual,
  type SubscriberHistory,
  type TagRecord,
} from './outreach-helpers';

export interface DetailSubscriber {
  id: string;
  subscriber_name: string;
  subscriber_phone: string;
  subscriber_email: string | null;
  channel: 'kakao' | 'email' | 'both';
  status: string;
  unsubscribed_at?: string | null;
  interest_profile?: unknown;
  interest_tags?: unknown;
  /** 서버 derivePendingReason 결과 — 확인 전인데 확인 채널(이메일)이 없으면 'NO_EMAIL_CONFIRM_CHANNEL' */
  pendingReason?: string | null;
  buyerTemperature?: string;
  temperatureConfig?: { label: string; color: string; badgeBg: string; description: string };
}

const CHANNEL_OPTIONS: Array<{ key: DetailSubscriber['channel']; label: string }> = [
  { key: 'kakao', label: '카카오톡' },
  { key: 'email', label: '이메일' },
  { key: 'both', label: '카카오+이메일' },
];

interface Props {
  subscriber: DetailSubscriber | null;
  onClose: () => void;
  /** 저장 성공 — 부모가 목록을 갱신한다 */
  onUpdated: () => void;
  onDeleted: () => void;
}

type HistoryState =
  | { key: string; status: 'ok'; history: SubscriberHistory }
  | { key: string; status: 'error'; message: string };

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/** 구독자 상세 — 공통 Modal(오른쪽 패널). 태그 편집 · 열람 이력 · AutoIntent · 삭제. */
export function SubscriberDetailModal({ subscriber, onClose, onUpdated, onDeleted }: Props) {
  return (
    <Modal
      open={!!subscriber}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="구독자 상세"
      size="md"
      side="right"
    >
      {subscriber ? (
        <DetailBody key={subscriber.id} subscriber={subscriber} onUpdated={onUpdated} onDeleted={onDeleted} />
      ) : null}
    </Modal>
  );
}

function DetailBody({ subscriber, onUpdated, onDeleted }: { subscriber: DetailSubscriber; onUpdated: () => void; onDeleted: () => void }) {
  const uid = useId();
  const unsub = isUnsubscribedLike(subscriber);
  const pending = pendingReasonInfo(subscriber.pendingReason);

  const initialTags = readSubscriberTags(subscriber);
  const [savedTags, setSavedTags] = useState<TagRecord>(initialTags);
  const [tags, setTags] = useState<TagRecord>(initialTags);
  const [savedChannel, setSavedChannel] = useState(subscriber.channel);
  const [channel, setChannel] = useState(subscriber.channel);
  const [freeTag, setFreeTag] = useState('');
  const [tagNotice, setTagNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const [intentLoading, setIntentLoading] = useState(false);
  const [intentMsg, setIntentMsg] = useState<{ tone: 'success' | 'info' | 'error'; message: string } | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [historyTry, setHistoryTry] = useState(0);
  const [historyState, setHistoryState] = useState<HistoryState | null>(null);
  const historyKey = `${subscriber.id}|${historyTry}`;
  const historyLoading = historyState?.key !== historyKey;

  const dirty = !tagRecordsEqual(tags, savedTags) || channel !== savedChannel;

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/broker/magazine/analytics?subscriberId=${encodeURIComponent(subscriber.id)}`, { signal: ctrl.signal });
        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }
        if (ctrl.signal.aborted) return;
        if (!res.ok) {
          setHistoryState({ key: historyKey, status: 'error', message: extractApiError(json, res.status).message });
          return;
        }
        const history = parseSubscriberHistory(json);
        if (!history) {
          setHistoryState({ key: historyKey, status: 'error', message: '열람 이력 형식을 읽을 수 없어요.' });
          return;
        }
        setHistoryState({ key: historyKey, status: 'ok', history });
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setHistoryState({ key: historyKey, status: 'error', message: networkErrorMessage(err) });
      }
    })();
    return () => ctrl.abort();
  }, [subscriber.id, historyKey]);

  function handleAddTag(raw: string, group?: TagGroupKey) {
    const r = addTag(tags, raw, group);
    if (r.added) {
      setTags(r.record);
      setTagNotice('');
      setSaveMsg(null);
    } else {
      setTagNotice(r.reason ?? '');
    }
    return r.added;
  }

  async function handleSave() {
    if ((channel === 'email' || channel === 'both') && !subscriber.subscriber_email) {
      setSaveMsg({ tone: 'error', text: '이메일 수신을 선택하려면 이메일 주소가 먼저 필요해요.' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/broker/magazine/subscribers/${subscriber.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(channel !== savedChannel ? { channel } : {}), ...buildTagsPatch(tags) }),
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      if (!res.ok) {
        setSaveMsg({ tone: 'error', text: extractApiError(json, res.status).message });
        return;
      }
      setSavedTags(tags);
      setSavedChannel(channel);
      setSaveMsg({ tone: 'ok', text: '변경사항을 저장했어요.' });
      onUpdated();
    } catch (err) {
      setSaveMsg({ tone: 'error', text: networkErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoIntent() {
    setIntentLoading(true);
    setIntentMsg(null);
    try {
      const res = await fetch(`/api/broker/magazine/subscribers/${subscriber.id}/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      setIntentMsg(describeIntentResult(res.ok, res.status, json));
    } catch (err) {
      setIntentMsg({ tone: 'error', message: networkErrorMessage(err) });
    } finally {
      setIntentLoading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/broker/magazine/subscribers/${subscriber.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDeleted();
        return;
      }
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      setDeleteError(extractApiError(json, res.status).message);
    } catch (err) {
      setDeleteError(networkErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const tempColor = subscriber.temperatureConfig?.color;

  return (
    <div className="space-y-4 text-slate-200">
      {/* 프로필 */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/50 p-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-title"
          style={{ background: subscriber.temperatureConfig?.badgeBg || 'rgba(100,116,139,0.1)' }}
          aria-hidden="true"
        >
          {subscriber.buyerTemperature?.charAt(0) || '⚪'}
        </div>
        <div className="min-w-0">
          <p className="truncate text-body font-bold text-white">{subscriber.subscriber_name}</p>
          <p className="flex items-center gap-1.5 text-label text-ink-muted">
            <Phone className="h-3 w-3" aria-hidden="true" /> {subscriber.subscriber_phone}
          </p>
          {subscriber.subscriber_email ? (
            <p className="flex items-center gap-1.5 truncate text-label text-ink-muted">
              <Mail className="h-3 w-3" aria-hidden="true" /> {subscriber.subscriber_email}
            </p>
          ) : null}
        </div>
        <span
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-caption font-bold ${unsub ? 'bg-rose-500/20 text-rose-200' : 'bg-emerald-500/15 text-emerald-200'}`}
        >
          {statusLabel(subscriber.status)}
        </span>
      </div>

      {unsub ? (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-label text-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          수신거부한 구독자예요. 매거진·속보가 발송되지 않고, 다시 받으려면 고객 본인이 구독 페이지에서 직접 구독해야 해요.
        </p>
      ) : null}

      {!unsub && pending ? (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-label text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-bold">{pending.badge}</strong> — {pending.notice}
          </span>
        </p>
      ) : null}

      {/* 매수 온도 */}
      <div className="rounded-xl border border-slate-700/50 p-3" style={{ background: subscriber.temperatureConfig?.badgeBg }}>
        <div className="flex items-center justify-between">
          <span className="text-label font-bold" style={{ color: tempColor }}>
            {subscriber.buyerTemperature || '⚪ 미확인'}
          </span>
          <Flame className="h-4 w-4" style={{ color: tempColor }} aria-hidden="true" />
        </div>
        <p className="mt-1 text-caption text-ink-muted">{subscriber.temperatureConfig?.description || '아직 열람 이력이 부족해요.'}</p>
      </div>

      {/* 수신 채널 */}
      <fieldset className="space-y-2" disabled={unsub}>
        <legend className="text-label font-bold text-ink-muted">수신 채널</legend>
        <div className="flex gap-1.5" role="radiogroup" aria-label="수신 채널">
          {CHANNEL_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={channel === o.key}
              onClick={() => {
                setChannel(o.key);
                setSaveMsg(null);
              }}
              className={`min-h-11 flex-1 rounded-lg border text-label font-bold transition-all disabled:opacity-50 ${
                channel === o.key
                  ? 'border-indigo-500/40 bg-indigo-500/20 text-indigo-200'
                  : 'border-slate-700/50 bg-slate-800/50 text-ink-muted hover:text-slate-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* 관심사 태그 */}
      <section className="space-y-3" aria-labelledby={`${uid}-tags`}>
        <h4 id={`${uid}-tags`} className="text-label font-bold text-ink-muted">
          관심사 태그
        </h4>
        {TAG_GROUP_KEYS.map((group) => {
          const current = tags[group];
          return (
            <div key={group} className="space-y-1">
              <p className="text-label font-semibold text-slate-300">{TAG_GROUP_LABELS[group]}</p>
              <ul className="flex flex-wrap gap-1" aria-label={`${TAG_GROUP_LABELS[group]} 선택됨`}>
                {current.length === 0 ? <li className="text-caption text-ink-subtle">선택된 태그 없음</li> : null}
                {current.map((t) => (
                  <li
                    key={t}
                    className="inline-flex items-center gap-0.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 py-0.5 pl-2.5 pr-0.5 text-label text-indigo-200"
                  >
                    {t}
                    {!unsub ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTags((prev) => removeTag(prev, group, t));
                          setSaveMsg(null);
                        }}
                        aria-label={`${t} 태그 삭제`}
                        className="-my-2 flex h-11 w-11 items-center justify-center rounded-full hover:text-rose-300"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="w-2" />
                    )}
                  </li>
                ))}
              </ul>
              {!unsub ? (
                <div className="flex flex-wrap gap-1">
                  {TAG_PRESETS[group]
                    .filter((p) => !current.includes(p))
                    .map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleAddTag(preset, group)}
                        aria-label={`${TAG_GROUP_LABELS[group]} ${preset} 추가`}
                        className="min-h-11 rounded border border-slate-700/40 bg-slate-800/60 px-2 text-caption text-ink-muted transition-colors hover:border-indigo-500/30 hover:text-indigo-200"
                      >
                        + {preset}
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
          );
        })}

        {!unsub ? (
          <div className="space-y-1">
            <label htmlFor={`${uid}-free`} className="text-label font-semibold text-slate-300">
              직접 입력
            </label>
            <div className="flex gap-1.5">
              <input
                id={`${uid}-free`}
                type="text"
                value={freeTag}
                maxLength={30}
                onChange={(e) => setFreeTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (handleAddTag(freeTag)) setFreeTag('');
                  }
                }}
                placeholder="예: 성수동, 토지, 경매"
                className="min-h-11 flex-1 rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-reader text-white placeholder:text-ink-subtle outline-none focus:border-indigo-500/60"
              />
              <button
                type="button"
                onClick={() => {
                  if (handleAddTag(freeTag)) setFreeTag('');
                }}
                className="min-h-11 rounded-lg border border-slate-700 bg-slate-800 px-3 text-label font-bold text-slate-200 hover:bg-slate-700"
              >
                추가
              </button>
            </div>
            <p className="text-caption text-ink-subtle">권역·자산유형은 표준 이름으로 자동 맞춰지고, 그 외는 관심 토픽으로 저장돼요.</p>
            {tagNotice ? (
              <p role="status" className="text-caption text-amber-300">
                {tagNotice}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* 저장 */}
      {!unsub ? (
        <div className="space-y-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-600/30 text-label font-bold text-indigo-100 transition-colors hover:bg-indigo-600/40 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            {saving ? '저장 중...' : dirty ? '변경사항 저장' : '변경사항 없음'}
          </button>
          {saveMsg ? (
            <p role={saveMsg.tone === 'error' ? 'alert' : 'status'} className={`text-caption ${saveMsg.tone === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>
              {saveMsg.text}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 열람 이력 */}
      <section className="space-y-2" aria-labelledby={`${uid}-history`}>
        <h4 id={`${uid}-history`} className="text-label font-bold text-ink-muted">
          열람 이력 <span className="font-normal text-ink-subtle">(최근 30일)</span>
        </h4>
        {historyLoading ? (
          <SkeletonGroup label="열람 이력을 불러오는 중" className="py-1">
            <SkeletonText lines={3} />
          </SkeletonGroup>
        ) : historyState?.status === 'error' ? (
          <ErrorState
            title="열람 이력을 불러오지 못했어요"
            description={historyState.message}
            onRetry={() => setHistoryTry((n) => n + 1)}
            className="py-5"
          />
        ) : historyState?.status === 'ok' ? (
          <HistoryView history={historyState.history} />
        ) : null}
      </section>

      {/* AutoIntent */}
      {!unsub ? (
        <div className="space-y-2 rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-950/30 to-orange-950/20 p-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-rose-400" aria-hidden="true" />
            <span className="text-label font-bold text-rose-300">매수 의향서 초안 만들기</span>
          </div>
          <p className="text-caption text-ink-muted">
            구독자가 직접 선택한 관심 권역·자산유형과 입력한 예산이 모두 있을 때만 초안을 만들어요. 없는 정보는 지어내지 않아요.
          </p>
          <button
            type="button"
            onClick={handleAutoIntent}
            disabled={intentLoading}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/20 text-label font-bold text-rose-200 transition-colors hover:bg-rose-500/30 disabled:opacity-50"
          >
            {intentLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Target className="h-3.5 w-3.5" aria-hidden="true" />}
            {intentLoading ? '만드는 중...' : '의향서 초안 만들기'}
          </button>
          {intentMsg ? (
            <p
              role={intentMsg.tone === 'error' ? 'alert' : 'status'}
              className={`rounded-lg bg-black/20 px-2 py-1.5 text-center text-caption ${intentMsg.tone === 'error' ? 'text-rose-300' : intentMsg.tone === 'success' ? 'text-emerald-300' : 'text-slate-300'}`}
            >
              {intentMsg.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 삭제 */}
      <div className="border-t border-slate-800 pt-2">
        {confirmDelete ? (
          <div className="space-y-2">
            <p className="text-center text-label font-semibold text-rose-300">정말 이 구독자를 삭제할까요? 되돌릴 수 없어요.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="min-h-11 flex-1 rounded-lg border border-rose-500/30 bg-rose-600/20 text-label font-bold text-rose-200 disabled:opacity-50"
              >
                {deleting ? '삭제 중...' : '삭제'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="min-h-11 flex-1 rounded-lg border border-slate-700 bg-slate-800 text-label font-bold text-slate-300"
              >
                취소
              </button>
            </div>
            {deleteError ? (
              <p role="alert" className="text-center text-caption text-rose-300">
                {deleteError}
              </p>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 text-label text-ink-muted transition-colors hover:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> 구독자 삭제
          </button>
        )}
      </div>
    </div>
  );
}

function HistoryView({ history }: { history: SubscriberHistory }) {
  if (history.totalViews === 0 && history.events.length === 0) {
    return (
      <p role="status" className="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-center text-label text-ink-muted">
        최근 30일간 열람 이력이 없어요.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
          <dt className="text-caption text-ink-muted">열람</dt>
          <dd className="text-body font-bold text-white">{history.totalViews}회</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
          <dt className="text-caption text-ink-muted">평균 체류</dt>
          <dd className="text-body font-bold text-white">{history.avgDwellSeconds}초</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
          <dt className="text-caption text-ink-muted">마지막</dt>
          <dd className="text-label font-bold text-white">{formatDateTime(history.lastActivityAt)}</dd>
        </div>
      </dl>
      {history.sections.length > 0 ? (
        <p className="text-caption text-ink-muted">본 섹션: {history.sections.join(', ')}</p>
      ) : null}
      {history.events.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto" aria-label="최근 활동">
          {history.events.slice(0, 30).map((e, i) => (
            <li key={`${e.at ?? 'x'}-${i}`} className="flex items-center justify-between rounded-md bg-slate-900/50 px-2 py-1 text-caption text-slate-300">
              <span>
                {eventLabel(e.type)}
                {e.sectionId ? ` · ${e.sectionId}` : ''}
                {e.dwellSeconds ? ` · ${e.dwellSeconds}초` : ''}
              </span>
              <span className="text-ink-subtle">{formatDateTime(e.at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
