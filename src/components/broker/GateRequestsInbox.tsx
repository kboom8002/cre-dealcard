'use client';

import React, { useState } from 'react';
import { copyText } from '@/lib/ux/clipboard';

export interface GateRequestItem {
  id: string;
  user_id?: string | null;
  building_id?: string | null;
  building_title?: string | null;
  buildingTitle?: string | null;
  reason?: string | null;
  requesterName?: string | null;
  requesterPhone?: string | null;
  requesterCompany?: string | null;
  cleanMessage?: string | null;
  shareUrl?: string | null;
  status: 'pending' | 'submitted' | 'broker_review' | 'approved' | 'rejected' | 'completed' | 'expired';
  created_at: string;
}

function isPendingGateStatus(status: GateRequestItem['status']): boolean {
  return status === 'pending' || status === 'submitted' || status === 'broker_review';
}

export function parseGateReasonDisplay(req: GateRequestItem): {
  requesterName: string;
  requesterPhone: string;
  requesterCompany: string;
  cleanMessage: string;
  buildingTitle: string;
} {
  let requesterName = (req.requesterName || '').trim();
  let requesterPhone = (req.requesterPhone || '').trim();
  let requesterCompany = (req.requesterCompany || '').trim();
  let cleanMessage = (req.cleanMessage || '').trim();
  const buildingTitle = (
    req.buildingTitle ||
    req.building_title ||
    '관심 매물'
  ).trim();

  const raw = (req.reason || '').trim();
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      requesterName =
        requesterName ||
        String(parsed.name || parsed.requesterName || parsed.clientName || '').trim();
      requesterPhone =
        requesterPhone ||
        String(parsed.phone || parsed.contact || parsed.requesterPhone || '').trim();
      requesterCompany =
        requesterCompany ||
        String(parsed.company || parsed.organization || parsed.requesterCompany || '').trim();
      cleanMessage =
        cleanMessage ||
        String(parsed.message || parsed.reason || parsed.note || '').trim();
    } catch {
      cleanMessage = cleanMessage || raw;
    }
  } else if (!cleanMessage) {
    const marketMatch = raw.match(
      /^성함\/기업명\s*:\s*([^,]+?)\s*,\s*연락처\s*:\s*(.+)$/
    );
    if (marketMatch) {
      requesterName = requesterName || marketMatch[1].trim();
      requesterPhone = requesterPhone || marketMatch[2].trim();
      cleanMessage = '마켓플레이스 IM 열람을 요청했습니다.';
    } else {
      cleanMessage = raw;
    }
  }

  if (requesterPhone === '010-0000-0000') {
    requesterPhone = '';
  }

  return {
    requesterName: requesterName || '이름 미입력 고객',
    requesterPhone,
    requesterCompany,
    cleanMessage: cleanMessage || '상세 IM 열람을 요청했습니다.',
    buildingTitle,
  };
}

export interface GateRequestsInboxProps {
  buildingId: string;
  buildingTitle?: string;
  initialRequests: GateRequestItem[];
}

export default function GateRequestsInbox({
  buildingId,
  buildingTitle,
  initialRequests,
}: GateRequestsInboxProps) {
  const [requests, setRequests] = useState<GateRequestItem[]>(initialRequests);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleAction = async (
    reqItem: GateRequestItem,
    action: 'approve' | 'reject'
  ) => {
    setLoadingId(reqItem.id);
    setFeedback(null);
    try {
      const res = await fetch('/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action === 'approve' ? 'approve_gate' : 'reject_gate',
          threadId: reqItem.id,
          buildingId: reqItem.building_id || buildingId,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        const nextStatus = action === 'approve' ? 'approved' : 'rejected';
        const issuedShareUrl =
          typeof json.shareUrl === 'string'
            ? json.shareUrl
            : `/im-lite/${reqItem.building_id || buildingId}`;
        setRequests((prev) =>
          prev.map((r) =>
            r.id === reqItem.id
              ? { ...r, status: nextStatus, shareUrl: issuedShareUrl }
              : r
          )
        );
        if (action === 'approve') {
          const fullUrl =
            typeof window !== 'undefined' && issuedShareUrl.startsWith('/')
              ? `${window.location.origin}${issuedShareUrl}`
              : issuedShareUrl;
          const copied = await copyText(fullUrl);
          setFeedback(
            copied
              ? '승인 완료! 전용 링크가 복사되었습니다. 카톡에 붙여넣어 보내세요.'
              : '승인이 완료되었습니다. 전용 링크 복사 버튼을 눌러 전달해 주세요.'
          );
        } else {
          setFeedback('IM 열람 요청을 거절했습니다.');
        }
      } else {
        setFeedback(json?.error || '요청 처리에 실패했습니다. 다시 시도해 주세요.');
      }
    } catch {
      setFeedback('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleCopyShareLink = async (reqItem: GateRequestItem) => {
    const pathUrl =
      reqItem.shareUrl || `/im-lite/${reqItem.building_id || buildingId}`;
    const fullUrl =
      typeof window !== 'undefined' && pathUrl.startsWith('/')
        ? `${window.location.origin}${pathUrl}`
        : pathUrl;
    const ok = await copyText(fullUrl);
    setFeedback(
      ok
        ? '전용 링크가 클립보드에 복사되었습니다.'
        : '링크 복사에 실패했습니다. 다시 시도해 주세요.'
    );
  };

  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mb-2 text-base font-bold text-slate-900">
          IM 열람 요청 내역
        </div>
        <p className="text-sm text-slate-600">
          아직 접수된 상세 IM 열람 요청이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            고객 IM 열람 요청 관리
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">
            고객의 열람 요청 사유를 확인하고 승인하면 전용 링크를 바로 전달할 수 있습니다.
          </p>
        </div>
        <span className="inline-flex min-h-[36px] items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">
          대기 {requests.filter((r) => isPendingGateStatus(r.status)).length}건
        </span>
      </div>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 rounded-lg border border-slate-200 bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
        >
          {feedback}
        </div>
      )}

      <div className="space-y-3">
        {requests.map((req) => {
          const parsed = parseGateReasonDisplay({
            ...req,
            buildingTitle: req.buildingTitle || req.building_title || buildingTitle,
          });
          const statusLabel: Record<GateRequestItem['status'], string> = {
            pending: 'IM 요청 대기',
            submitted: 'IM 요청 대기',
            broker_review: '검토 진행 중',
            approved: '승인 완료',
            rejected: '요청 거절',
            completed: '열람 완료',
            expired: '기한 만료',
          };
          const statusBadgeClass: Record<GateRequestItem['status'], string> = {
            pending: 'bg-amber-100 text-amber-900 border border-amber-300',
            submitted: 'bg-amber-100 text-amber-900 border border-amber-300',
            broker_review: 'bg-amber-100 text-amber-900 border border-amber-300',
            approved: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
            rejected: 'bg-rose-100 text-rose-800 border border-rose-200',
            completed: 'bg-blue-100 text-blue-900 border border-blue-200',
            expired: 'bg-slate-200 text-slate-700 border border-slate-300',
          };

          return (
            <div
              key={req.id}
              className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-bold ${statusBadgeClass[req.status]}`}
                  >
                    {statusLabel[req.status]}
                  </span>
                  <span className="text-base font-bold text-slate-900">
                    {parsed.requesterName}
                  </span>
                  {parsed.requesterCompany && (
                    <span className="text-sm font-medium text-slate-600">
                      · {parsed.requesterCompany}
                    </span>
                  )}
                  <span className="rounded bg-slate-200/80 px-2 py-0.5 text-sm font-semibold text-slate-700">
                    {parsed.buildingTitle}
                  </span>
                </div>

                <p className="text-base text-slate-800">{parsed.cleanMessage}</p>

                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <span>
                    연락처:{' '}
                    <strong className="font-semibold text-slate-800">
                      {parsed.requesterPhone || '전화번호 없음'}
                    </strong>
                  </span>
                  <span>
                    요청 일시: {new Date(req.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {parsed.requesterPhone ? (
                  <a
                    href={`tel:${parsed.requesterPhone}`}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-100"
                  >
                    전화 걸기
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex min-h-[48px] cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400"
                  >
                    전화번호 없음
                  </button>
                )}

                {isPendingGateStatus(req.status) && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAction(req, 'approve')}
                      disabled={loadingId === req.id}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      승인하고 IM 보내기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(req, 'reject')}
                      disabled={loadingId === req.id}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      거절
                    </button>
                  </>
                )}

                {(req.status === 'approved' || req.status === 'completed') && (
                  <button
                    type="button"
                    onClick={() => handleCopyShareLink(req)}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    전용 링크 복사
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
