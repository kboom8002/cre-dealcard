'use client';

import React, { useState } from 'react';
import { Check, Copy, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { buildBriefingTemplate, formatKstDateTime } from './analytics-text';
import type { HotLead } from './types';

interface Props {
  lead: HotLead | null;
  onClose: () => void;
}

/**
 * 통화 브리핑(템플릿) — AI 가 생성한 스크립트가 아니라 실제 열람 데이터로 채운 고정 템플릿이다.
 * 데이터에 없는 사실(예: "방금 접수된 매물")은 쓰지 않으며, 문구는 복사해서 사용한다 (T3-16).
 */
export function CallBriefingModal({ lead, onClose }: Props) {
  const [copied, setCopied] = useState<'phone' | 'script' | null>(null);

  const copy = async (kind: 'phone' | 'script', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast.success(kind === 'phone' ? '전화번호가 복사되었습니다.' : '통화 브리핑 문구가 복사되었습니다.');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('복사하지 못했습니다. 직접 선택해서 복사해 주세요.');
    }
  };

  const script = lead ? buildBriefingTemplate(lead) : '';

  return (
    <Modal
      open={!!lead}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={lead ? `${lead.subscriber_name} 고객 통화 브리핑` : '통화 브리핑'}
      description="통화 전 참고용 템플릿입니다 (AI 생성 아님)."
    >
      {lead ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/5 bg-black/30 p-3 text-body">
            <div>
              <span className="block text-label text-ink-subtle">연락처</span>
              <span className="mt-0.5 flex items-center gap-1.5 font-mono font-bold text-slate-200">
                {lead.subscriber_phone}
                <button
                  type="button"
                  aria-label="전화번호 복사"
                  onClick={() => copy('phone', lead.subscriber_phone)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded text-ink-muted hover:text-white"
                >
                  {copied === 'phone' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </span>
            </div>
            <div>
              <span className="block text-label text-ink-subtle">매수 온도</span>
              <span className="mt-0.5 block font-bold text-white">{lead.buyerTemperature}</span>
            </div>
            <div>
              <span className="block text-label text-ink-subtle">최근 30일 열람</span>
              <span className="mt-0.5 block font-bold text-indigo-300">{lead.totalViews}회</span>
            </div>
            <div>
              <span className="block text-label text-ink-subtle">마지막 반응</span>
              <span className="mt-0.5 block font-mono text-label text-slate-300">{formatKstDateTime(lead.lastActiveAt)}</span>
            </div>
          </div>

          <div>
            <h3 className="mb-1.5 text-body font-bold text-slate-200">최근 집중해서 본 내용</h3>
            {lead.recentSections.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {lead.recentSections.map((s) => (
                  <span key={s} className="rounded bg-rose-500/20 px-2 py-0.5 text-label font-medium text-rose-200">✓ {s}</span>
                ))}
              </div>
            ) : (
              <p className="text-label text-ink-muted">연결된 섹션 열람 기록이 없습니다.</p>
            )}
          </div>

          <div>
            <h3 className="mb-1.5 text-body font-bold text-slate-200">통화 오프닝 (템플릿)</h3>
            <pre className="whitespace-pre-wrap rounded-lg border border-white/5 bg-black/20 p-3 font-sans text-body leading-relaxed text-slate-200">{script}</pre>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => copy('script', script)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-600 px-4 text-body font-bold text-slate-200 hover:bg-slate-800"
            >
              {copied === 'script' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              문구 복사
            </button>
            <a
              href={`tel:${lead.subscriber_phone}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-body font-bold text-white hover:bg-emerald-500"
            >
              <Phone className="h-4 w-4" />
              전화 걸기
            </a>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
