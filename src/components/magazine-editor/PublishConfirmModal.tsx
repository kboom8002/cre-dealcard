'use client';

import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { buildPublishSummary, type TargetSegment } from '@/lib/magazine/edition-save';

interface PublishConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 발행 기준일(KST, YYYY-MM-DD) */
  issueDate: string;
  targetSegment: TargetSegment;
  subscriberCount: number | null;
  sendEnabled: boolean | null;
  correction: boolean;
  busy: boolean;
  /** 자동 품질 점검 미통과 콘텐츠(서버 409 QUALITY_GATE_REVIEW 이후 true) */
  needsQualityAck?: boolean;
  /** 정정 발행이 아닌 최초 발행일 때 발송까지 함께 요청할지 */
  sendAfterPublish: boolean;
  onSendAfterPublishChange: (v: boolean) => void;
  onConfirm: (opts: { acknowledgeQualityGate: boolean }) => void;
  /** 발행 API 실패 시 모달 내부에 고정 표시할 오류 메시지 */
  publishError?: string | null;
  /** 발행 실패 후 모달 내부 [다시 시도] 핸들러 */
  onRetryPublish?: () => void;
}

/** 발행 확인 모달 — 날짜·대상·수신자 수·발송 여부를 보여주고 한 번 더 확인한다 (E-01). */
export function PublishConfirmModal(props: PublishConfirmModalProps) {
  const {
    open,
    onOpenChange,
    issueDate,
    targetSegment,
    subscriberCount,
    sendEnabled,
    correction,
    busy,
    needsQualityAck,
    sendAfterPublish,
    onSendAfterPublishChange,
    onConfirm,
    publishError,
    onRetryPublish,
  } = props;
  const [ack, setAck] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const summary = buildPublishSummary({ issueDate, targetSegment, subscriberCount, sendEnabled, correction });
  const confirmDisabled = busy || (!!needsQualityAck && !ack);
  const isSendBlocked = sendEnabled === false;

  const rows: Array<[string, string]> = [
    ['발행 날짜', summary.dateLabel],
    ['발송 대상', summary.segmentLabel],
    ['수신자 수', summary.recipientText],
    ['발송', correction ? '정정 발행은 공개 페이지만 갱신하며 이메일을 다시 보내지 않습니다' : summary.sendText],
  ];

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        onOpenChange(v);
      }}
      title={summary.title}
      description={
        correction
          ? '이미 발행된 내용을 고쳐 다시 공개합니다. 발행일과 최초 발행 기록은 유지됩니다.'
          : '발행하면 공개 페이지에 게시되고 이 호수는 잠깁니다.'
      }
      size="sm"
      initialFocusRef={confirmRef}
    >
      {!correction && isSendBlocked && (
        <div
          role="note"
          data-testid="publish-send-disabled-banner"
          className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/15 p-3.5 text-base text-amber-200 leading-relaxed"
        >
          <p className="font-bold text-amber-100">
            발행만 되고 구독자 발송은 중지 상태입니다(관리자 설정)
          </p>
          <p className="mt-1 text-sm text-amber-200/95 leading-relaxed">
            지금 [발행하기]를 누르시면 웹 매거진만 공개되며, 고객에게 카톡·이메일은 발송되지 않습니다(0건). 발행 후 나타나는 [링크 복사]나 [카카오톡 공유]로 직접 전달하실 수 있습니다.
          </p>
        </div>
      )}

      <dl className="space-y-2 text-body">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 border-b border-slate-700 pb-2">
            <dt className="shrink-0 font-semibold text-ink-subtle">{k}</dt>
            <dd className="text-right font-bold text-white">{v}</dd>
          </div>
        ))}
      </dl>

      {!correction && (
        <label
          className={`mt-4 flex min-h-11 items-start gap-2 text-body ${
            isSendBlocked ? 'cursor-not-allowed text-ink-subtle opacity-75' : 'text-ink-muted'
          }`}
        >
          <input
            type="checkbox"
            checked={isSendBlocked ? false : sendAfterPublish}
            disabled={isSendBlocked}
            onChange={(e) => {
              if (isSendBlocked) return;
              onSendAfterPublishChange(e.target.checked);
            }}
            className="mt-0.5 h-4 w-4 disabled:cursor-not-allowed"
          />
          <span>
            발행 후 구독자에게 발송 요청하기 (구독자에게 즉시 발송)
            {isSendBlocked && (
              <span className="block text-caption text-amber-300">
                발송이 중지된 상태라 자동 선택 해제되었으며 발행만 진행됩니다(관리자 설정).
              </span>
            )}
          </span>
        </label>
      )}

      <p className="mt-3 rounded-lg border border-slate-700/80 bg-slate-800/50 px-3 py-2 text-sm text-slate-300 leading-relaxed">
        💡 발행 후 오타를 발견하셔도 언제든 내용을 고친 뒤 [정정 발행] 버튼으로 즉시 수정본을 반영할 수 있습니다
      </p>

      {needsQualityAck && (
        <label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-body text-amber-200">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>자동 품질 점검을 통과하지 못했습니다. 내용을 직접 확인했으며 그대로 발행합니다.</span>
        </label>
      )}

      {publishError && (
        <div
          role="alert"
          data-testid="publish-modal-error"
          className="mt-4 space-y-2.5 rounded-xl border border-red-500/40 bg-red-500/15 p-3.5 text-sm text-red-200"
        >
          <p className="font-semibold leading-relaxed">{publishError}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (onRetryPublish) {
                onRetryPublish();
              } else {
                onConfirm({ acknowledgeQualityGate: ack });
              }
            }}
            className="w-full min-h-12 rounded-xl border border-red-400/50 bg-red-600/80 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={busy}
          className="min-h-12 rounded-xl border border-slate-600 px-4 py-2 text-body font-bold text-ink-muted hover:bg-slate-800 disabled:opacity-50"
        >
          취소
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={() => onConfirm({ acknowledgeQualityGate: ack })}
          disabled={confirmDisabled}
          className="min-h-12 rounded-xl bg-indigo-600 px-4 py-2 text-body font-black text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? '발행 중…' : correction ? '정정 발행' : '발행하기'}
        </button>
      </div>
    </Modal>
  );
}
