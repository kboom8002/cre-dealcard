'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Zap, Users, Flame, Building2, Tag, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonGroup, SkeletonText } from '@/components/ui/Skeleton';
import { toUserMessage } from '@/lib/magazine/user-message';
import { extractApiError } from './outreach/outreach-helpers';
import {
  MAX_HEADLINE_LENGTH,
  describeSpecialResult,
  evaluatePublishGate,
  parseSpecialPreview,
  targetingTiles,
  type SpecialOutcome,
  type SpecialPreview,
} from './outreach/special-edition-helpers';

interface SpecialEditionModalProps {
  buildingId: string;
  isOpen: boolean;
  onClose: () => void;
  /** 발행(에디션 생성)이 완료되면 호출. 발송 성공 여부와 무관하다. */
  onSuccess?: (edition: unknown) => void;
  /** 발송 기능이 꺼져 있다는 것을 미리 알고 있으면 true (선택). 서버 응답이 최종 근거다. */
  sendDisabled?: boolean;
}

type LoadResult = { key: string; preview: SpecialPreview | null; error: string | null };

const TILE_STYLE: Record<string, string> = {
  total: 'text-slate-200',
  matched: 'text-rose-300',
  hot: 'text-amber-300',
  untagged: 'text-ink-muted',
};

export function SpecialEditionModal({ buildingId, isOpen, onClose, onSuccess, sendDisabled }: SpecialEditionModalProps) {
  const uid = useId();
  const headlineId = `${uid}-headline`;
  const noteId = `${uid}-note`;
  const distributeId = `${uid}-distribute`;

  const [headline, setHeadline] = useState('');
  const [urgentNote, setUrgentNote] = useState('');
  // 안전 기본값: 발송은 브로커가 명시적으로 켠 경우에만 (S2-20)
  const [autoDistribute, setAutoDistribute] = useState(false);
  // 태그 없는 구독자는 브로커가 명시 선택해야 포함 (T2-13)
  const [includeUntagged, setIncludeUntagged] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [outcome, setOutcome] = useState<SpecialOutcome | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [loaded, setLoaded] = useState<LoadResult | null>(null);
  const headlineTouched = useRef(false);

  const requestKey = `${buildingId}|${includeUntagged ? 1 : 0}|${loadKey}`;
  const loading = isOpen && (!loaded || loaded.key !== requestKey);
  const preview = loaded?.preview ?? null;
  const loadError = !loading && loaded?.key === requestKey ? loaded.error : null;
  // 서버(special GET)가 알려 주는 발송 스위치가 최종 근거. 값이 없을 때만 호출부 힌트(sendDisabled)를 쓴다.
  const sendOff = preview?.sendEnabled != null ? preview.sendEnabled === false : sendDisabled === true;

  useEffect(() => {
    if (!isOpen) return;
    const ctrl = new AbortController();
    const params = new URLSearchParams({ buildingId });
    if (includeUntagged) params.set('includeUntagged', 'true');

    (async () => {
      try {
        const res = await fetch(`/api/broker/magazine/special?${params}`, { signal: ctrl.signal });
        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }
        if (ctrl.signal.aborted) return;
        if (!res.ok) {
          setLoaded({ key: requestKey, preview: null, error: extractApiError(json, res.status).message });
          return;
        }
        const parsed = parseSpecialPreview(json);
        if (!parsed) {
          setLoaded({ key: requestKey, preview: null, error: toUserMessage(null, 500) });
          return;
        }
        setLoaded({ key: requestKey, preview: parsed, error: null });
        if (!headlineTouched.current && parsed.defaultHeadline) setHeadline((cur) => cur || parsed.defaultHeadline || '');
      } catch (err) {
        if (ctrl.signal.aborted) return;
        console.error('[SpecialEditionModal] load failed:', err);
        setLoaded({ key: requestKey, preview: null, error: toUserMessage(err) });
      }
    })();

    return () => ctrl.abort();
  }, [isOpen, buildingId, includeUntagged, loadKey, requestKey]);

  const gate = evaluatePublishGate({
    loading,
    loadFailed: !!loadError,
    preview: loadError ? null : preview,
    headline,
    autoDistribute,
    publishing,
  });

  async function handlePublish() {
    if (!gate.canPublish) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/broker/magazine/special', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingId,
          headline: headline.trim(),
          urgentNote: urgentNote.trim() || undefined,
          autoDistribute,
          includeUntagged,
        }),
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      const result = describeSpecialResult({ ok: res.ok, status: res.status, json, autoDistribute });
      setOutcome(result);
      if (result.published && onSuccess) {
        const edition = json && typeof json === 'object' ? (json as { edition?: unknown }).edition : undefined;
        onSuccess(edition);
      }
      if (result.kind === 'error') toast.error(result.detail);
    } catch (err) {
      console.error('[SpecialEditionModal] publish failed:', err);
      setOutcome({ kind: 'error', published: false, sent: 0, title: '속보 발행에 실패했어요', detail: toUserMessage(err) });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => {
        if (!o && !publishing) onClose();
      }}
      title="속보 매거진 발행"
      description="입력한 매물 정보만으로 속보를 만들고, 원하면 관심 구독자에게 발송합니다."
      size="md"
      closeOnBackdrop={!publishing}
      closeOnEscape={!publishing}
    >
      {outcome ? (
        <OutcomePanel outcome={outcome} onClose={onClose} onRetry={outcome.kind === 'error' ? () => setOutcome(null) : undefined} />
      ) : loading && !preview ? (
        <SkeletonGroup label="매물과 구독자 정보를 불러오는 중" className="space-y-3 py-2">
          <SkeletonText lines={3} />
        </SkeletonGroup>
      ) : loadError ? (
        <ErrorState title="매물 정보를 불러오지 못했어요" description={loadError} onRetry={() => setLoadKey((k) => k + 1)} />
      ) : preview ? (
        <div className="space-y-4 text-slate-200">
          {/* 매물 요약 — 입력된 값만 표시 */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1">
            <div className="flex items-center justify-between gap-2 text-label">
              <span className="flex items-center gap-1.5 font-medium text-slate-300">
                <Building2 className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
                {[preview.building.areaSignal, preview.building.assetType].filter(Boolean).join(' · ') || '권역·자산유형 미입력'}
              </span>
              <span className="font-bold text-emerald-400">{preview.building.priceDisplay ?? '가격 미입력'}</span>
            </div>
            {preview.building.address ? <p className="text-caption text-ink-muted">{preview.building.address}</p> : null}
            {!preview.matchable ? (
              <p className="flex items-start gap-1.5 text-caption text-amber-300">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                권역·자산유형이 없어 발송 대상을 계산할 수 없어요. 발행만 할 수 있습니다.
              </p>
            ) : null}
          </div>

          {/* 타게팅 미리보기: 전체 / 매칭 / 핫리드 / 태그 없음 */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-label font-bold text-slate-300">
              <Users className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" /> 발송 대상 미리보기
              {loading ? <Loader2 className="h-3 w-3 animate-spin text-ink-subtle" aria-label="갱신 중" /> : null}
            </p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-busy={loading}>
              {targetingTiles(preview).map((t) => (
                <div key={t.key} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2" title={t.hint}>
                  <dt className="flex items-center gap-1 text-caption text-ink-muted">
                    {t.key === 'hot' ? <Flame className="h-3 w-3 text-rose-400" aria-hidden="true" /> : null}
                    {t.key === 'untagged' ? <Tag className="h-3 w-3" aria-hidden="true" /> : null}
                    {t.label}
                  </dt>
                  <dd className={`text-title font-bold ${TILE_STYLE[t.key]}`}>{t.count}명</dd>
                </div>
              ))}
            </dl>
            <p className="mt-1 text-caption text-ink-subtle">매칭 규칙: 권역과 자산유형이 모두 일치하는 구독자만 대상이에요. 태그가 없는 구독자는 기본 제외됩니다.</p>

            {preview.matchedPreview.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1" aria-label="매칭 대상 일부">
                {preview.matchedPreview.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex items-center gap-1 rounded-md border border-white/5 bg-slate-900 px-2 py-0.5 text-caption text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} aria-hidden="true" />
                    {m.name}
                  </li>
                ))}
                {preview.matched > 5 ? <li className="self-center text-caption text-ink-subtle">외 {preview.matched - 5}명</li> : null}
              </ul>
            ) : null}

            <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-800 px-3 text-label text-slate-300">
              <input
                type="checkbox"
                checked={includeUntagged}
                onChange={(e) => setIncludeUntagged(e.target.checked)}
                disabled={publishing || preview.untagged === 0}
                className="h-4 w-4 rounded"
              />
              태그 없는 구독자 {preview.untagged}명도 대상에 포함 (직접 선택)
            </label>
          </div>

          {/* 헤드라인 */}
          <div className="space-y-1.5">
            <label htmlFor={headlineId} className="text-label font-bold text-slate-300">
              속보 헤드라인
            </label>
            <input
              id={headlineId}
              type="text"
              value={headline}
              maxLength={MAX_HEADLINE_LENGTH}
              onChange={(e) => {
                headlineTouched.current = true;
                setHeadline(e.target.value);
              }}
              placeholder="예: [속보] 성수동 꼬마빌딩 신규 매물 안내"
              className="min-h-11 w-full rounded-xl border border-slate-700 bg-black/30 px-3 text-body text-white placeholder:text-ink-subtle focus:border-rose-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={noteId} className="text-label font-medium text-ink-muted">
              한줄 코멘트 (선택)
            </label>
            <input
              id={noteId}
              type="text"
              value={urgentNote}
              maxLength={120}
              onChange={(e) => setUrgentNote(e.target.value)}
              placeholder="전달하고 싶은 한 줄 (사실 확인된 내용만)"
              className="min-h-11 w-full rounded-xl border border-slate-700 bg-black/30 px-3 text-body text-white placeholder:text-ink-subtle focus:border-rose-500 focus:outline-none"
            />
          </div>

          {/* 발송 토글 — 기본 OFF */}
          <div className="flex min-h-11 items-start gap-2 rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3">
            <input
              id={distributeId}
              type="checkbox"
              checked={autoDistribute}
              onChange={(e) => setAutoDistribute(e.target.checked)}
              disabled={publishing}
              className="mt-0.5 h-4 w-4 shrink-0 rounded"
            />
            <label htmlFor={distributeId} className="cursor-pointer space-y-0.5">
              <span className="block text-label font-bold text-indigo-200">{`발행과 함께 매칭 구독자 ${preview.matched}명에게 발송`}</span>
              <span className="block text-caption text-ink-muted">
                끄면 발행만 합니다. 속보 발송은 주 2회까지, 수신 동의·수신거부가 확인된 구독자에게만 나가요.
              </span>
            </label>
          </div>
          {autoDistribute && sendOff ? (
            <p className="flex items-start gap-1.5 text-caption text-amber-300" role="status">
              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              현재 발송 기능이 꺼져 있어요. 발행은 되지만 독자에게는 발송되지 않습니다.
            </p>
          ) : null}
        </div>
      ) : null}

      {!outcome ? (
        <div className="mt-4 border-t border-slate-800 pt-3">
          {gate.reason ? (
            <p className="mb-2 text-caption text-amber-300" role="status">
              {gate.reason}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={publishing}
              className="min-h-11 rounded-lg border border-slate-700 px-4 text-label text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={!gate.canPublish}
              className="flex min-h-11 items-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-600 to-pink-600 px-4 text-label font-bold text-white shadow-lg shadow-rose-900/30 transition-all hover:from-rose-500 hover:to-pink-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>{autoDistribute ? '발행·발송 중...' : '발행 중...'}</span>
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  <span>{autoDistribute ? '속보 발행 및 발송' : '속보 발행'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function OutcomePanel({ outcome, onClose, onRetry }: { outcome: SpecialOutcome; onClose: () => void; onRetry?: () => void }) {
  const isError = outcome.kind === 'error';
  const isWarn = outcome.kind === 'send_stopped' || outcome.kind === 'dry_run' || outcome.kind === 'none_sent';
  const Icon = isError ? AlertTriangle : isWarn ? Info : CheckCircle2;
  const tone = isError ? 'text-rose-300 border-rose-500/30 bg-rose-950/20' : isWarn ? 'text-amber-200 border-amber-500/30 bg-amber-950/20' : 'text-emerald-200 border-emerald-500/30 bg-emerald-950/20';
  return (
    <div className="space-y-4" role={isError ? 'alert' : 'status'}>
      <div className={`flex items-start gap-2 rounded-xl border p-4 ${tone}`}>
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-body font-bold">{outcome.title}</p>
          {outcome.detail ? <p className="text-label opacity-90">{outcome.detail}</p> : null}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 rounded-lg border border-slate-700 px-4 text-label text-slate-300 hover:bg-slate-800"
          >
            다시 시도
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg bg-slate-700 px-4 text-label font-bold text-white hover:bg-slate-600"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
