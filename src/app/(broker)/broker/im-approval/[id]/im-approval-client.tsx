'use client';

import { useState } from 'react';
import Link from 'next/link';

interface IMSection {
  section_type: string;
  title: string;
  markdown: string;
  confidence?: string;
}

interface Props {
  docId: string;
  title: string;
  content: Record<string, unknown>;
  status: string;
  buildingId: string;
  createdAt: string;
}

export function IMApprovalClient({ docId, title, content, status: initialStatus, buildingId, createdAt }: Props) {
  const sections = ((content?.sections ?? []) as IMSection[]);
  const [editedSections, setEditedSections] = useState<IMSection[]>(sections);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [actionStatus, setActionStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [resultMsg, setResultMsg] = useState('');
  const [docStatus, setDocStatus] = useState(initialStatus);
  const [brokerNotes, setBrokerNotes] = useState('');

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditDraft(editedSections[idx].markdown);
  };

  const saveEdit = (idx: number) => {
    setEditedSections((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], markdown: editDraft };
      return next;
    });
    setEditingIdx(null);
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    setActionStatus('loading');
    try {
      const res = await fetch(`/api/broker/im-lite/${docId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, broker_notes: brokerNotes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      setDocStatus(action === 'approve' ? 'published' : 'revision_needed');
      setResultMsg(data.message ?? (action === 'approve' ? '승인 완료' : '수정 요청 등록'));
      setActionStatus('done');
    } catch (err: unknown) {
      setResultMsg(err instanceof Error ? err.message : 'Error');
      setActionStatus('error');
    }
  };

  const statusBadge = {
    pending_approval: { label: '심사 중', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    published: { label: '공개됨', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    revision_needed: { label: '수정 요청', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    draft: { label: '초안', color: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30' },
  }[docStatus] ?? { label: docStatus, color: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30' };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/broker" className="text-xs text-neutral-400 hover:text-white transition-colors">
            ← 대시보드
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white truncate max-w-xs">{title}</span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusBadge.color}`}>
              {statusBadge.label}
            </span>
          </div>
          <a
            href={`/api/public/im-lite/${buildingId}/export?doc_id=${docId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-300 transition-colors"
          >
            📄 미리보기
          </a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Meta */}
        <div className="mb-6 text-xs text-neutral-500">
          문서 ID: {docId} &nbsp;·&nbsp; 생성: {new Date(createdAt).toLocaleDateString('ko-KR')}
        </div>

        {/* Result message */}
        {actionStatus === 'done' && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
            ✅ {resultMsg}
          </div>
        )}
        {actionStatus === 'error' && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
            ❌ {resultMsg}
          </div>
        )}

        {/* Section editor */}
        <div className="space-y-4 mb-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">섹션 검토 및 편집</h2>
          {editedSections.map((section, idx) => (
            <div key={section.section_type ?? idx} className="rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-white">{section.title}</span>
                  {section.confidence && (
                    <span className="ml-2 text-[10px] text-neutral-500 border border-neutral-700 rounded-full px-2 py-0.5">
                      {section.confidence}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => editingIdx === idx ? saveEdit(idx) : startEdit(idx)}
                  className="text-xs px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                >
                  {editingIdx === idx ? '저장' : '편집'}
                </button>
              </div>
              {editingIdx === idx ? (
                <div className="px-4 pb-4">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="w-full h-48 bg-neutral-950 border border-neutral-700 rounded-xl p-3 text-sm text-neutral-300 font-mono resize-y focus:outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-neutral-600 mt-1">마크다운 형식으로 편집하세요.</p>
                </div>
              ) : (
                <div className="px-4 pb-4">
                  <pre className="text-xs text-neutral-400 font-mono whitespace-pre-wrap line-clamp-4">
                    {section.markdown.slice(0, 300)}{section.markdown.length > 300 ? '...' : ''}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Broker notes */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-neutral-400 mb-2">브로커 노트 (선택)</label>
          <textarea
            value={brokerNotes}
            onChange={(e) => setBrokerNotes(e.target.value)}
            placeholder="수정 요청 시 구체적인 내용을 입력하세요..."
            className="w-full h-24 bg-neutral-900 border border-neutral-700 rounded-xl p-3 text-sm text-neutral-300 focus:outline-none focus:border-primary resize-none"
          />
        </div>

        {/* Action buttons */}
        {docStatus === 'pending_approval' && (
          <div className="flex gap-3">
            <button
              onClick={() => handleAction('approve')}
              disabled={actionStatus === 'loading'}
              className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors disabled:opacity-50 text-sm"
            >
              {actionStatus === 'loading' ? '처리 중...' : '✅ 승인 (공개)'}
            </button>
            <button
              onClick={() => handleAction('reject')}
              disabled={actionStatus === 'loading'}
              className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 text-sm border border-neutral-700"
            >
              🔁 수정 요청
            </button>
          </div>
        )}

        {docStatus !== 'pending_approval' && (
          <div className="text-center text-sm text-neutral-500 py-4">
            현재 상태: <span className="text-white font-bold">{statusBadge.label}</span>
            {' '}&nbsp;·&nbsp;{' '}
            <Link href="/broker" className="text-primary hover:underline">대시보드로 돌아가기</Link>
          </div>
        )}
      </div>
    </div>
  );
}
