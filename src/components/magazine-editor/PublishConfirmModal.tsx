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
  } = props;
  const [ack, setAck] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const summary = buildPublishSummary({ issueDate, targetSegment, subscriberCount, sendEnabled, correction });
  const confirmDisabled = busy || (!!needsQualityAck && !ack);

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
      <dl className="space-y-2 text-body">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 border-b border-slate-700 pb-2">
            <dt className="shrink-0 font-semibold text-ink-subtle">{k}</dt>
            <dd className="text-right font-bold text-white">{v}</dd>
          </div>
        ))}
      </dl>

      {!correction && (
        <label className="mt-4 flex min-h-11 items-start gap-2 text-body text-ink-muted">
          <input
            type="checkbox"
            checked={sendAfterPublish}
            onChange={(e) => onSendAfterPublishChange(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            발행 후 구독자에게 발송 요청하기
            {sendEnabled === false && (
              <span className="block text-caption text-amber-300">발송이 중지된 상태라 발행만 진행됩니다(관리자 설정).</span>
            )}
          </span>
        </label>
      )}

      {needsQualityAck && (
        <label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-body text-amber-200">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>자동 품질 점검을 통과하지 못했습니다. 내용을 직접 확인했으며 그대로 발행합니다.</span>
        </label>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={busy}
          className="min-h-11 rounded-xl border border-slate-600 px-4 py-2 text-body font-bold text-ink-muted hover:bg-slate-800 disabled:opacity-50"
        >
          취소
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={() => onConfirm({ acknowledgeQualityGate: ack })}
          disabled={confirmDisabled}
          className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 text-body font-black text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? '발행 중…' : correction ? '정정 발행' : '발행하기'}
        </button>
      </div>
    </Modal>
  );
}
