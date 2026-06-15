'use client';

import { useState } from 'react';
import Link from 'next/link';

interface IMSection {
  section_type: string;
  title: string;
  markdown: string;
  confidence?: "confirmed" | "inferred" | "needs_check";
  aiRole?: string;
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
  const [sections, setSections] = useState<IMSection[]>(((content?.sections ?? []) as IMSection[]));
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  
  // Track which sections have been verified by the broker
  const initialVerified = new Set(
    sections.map((s, i) => s.confidence === 'confirmed' ? i : -1).filter(i => i !== -1)
  );
  const [verifiedSet, setVerifiedSet] = useState<Set<number>>(initialVerified);

  const [actionStatus, setActionStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [resultMsg, setResultMsg] = useState('');
  const [docStatus, setDocStatus] = useState(initialStatus);

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditDraft(sections[idx].markdown);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditDraft('');
  };

  const saveEdit = async (idx: number) => {
    const newSections = [...sections];
    newSections[idx] = { 
      ...newSections[idx], 
      markdown: editDraft,
      confidence: 'confirmed', // Broker has edited/verified it
    };
    
    setSections(newSections);
    setEditingIdx(null);
    
    const newVerified = new Set(verifiedSet);
    newVerified.add(idx);
    setVerifiedSet(newVerified);

    // Auto-save to DB
    try {
      await fetch(`/api/broker/im-lite/${docId}/save-sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: newSections }),
      });
    } catch (err) {
      console.error("Save failed", err);
    }
  };

  const toggleVerify = async (idx: number) => {
    const isVerified = verifiedSet.has(idx);
    const newVerified = new Set(verifiedSet);
    const newSections = [...sections];

    if (isVerified) {
      newVerified.delete(idx);
    } else {
      newVerified.add(idx);
      newSections[idx].confidence = 'confirmed';
    }

    setVerifiedSet(newVerified);
    setSections(newSections);

    if (!isVerified) {
      // Auto-save to DB when verifying
      try {
        await fetch(`/api/broker/im-lite/${docId}/save-sections`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sections: newSections }),
        });
      } catch (err) {
        console.error("Save failed", err);
      }
    }
  };

  const handleApprove = async () => {
    setActionStatus('loading');
    try {
      const res = await fetch(`/api/broker/im-lite/${docId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      setDocStatus('published');
      setResultMsg('IM이 성공적으로 공개되었습니다.');
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

  const allVerified = verifiedSet.size === sections.length;

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-32">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href={`/broker/deal-card/${buildingId}`} className="text-xs text-neutral-400 hover:text-white transition-colors">
            ← 딜카드
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white truncate max-w-xs">{title}</span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusBadge.color}`}>
              {statusBadge.label}
            </span>
          </div>
          <a
            href={`/im-lite/${buildingId}?doc=${docId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-300 transition-colors"
          >
            📄 미리보기
          </a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">모바일 투자설명서 검토</h1>
          <p className="text-sm text-neutral-400">
            AI가 작성한 초안입니다. 각 섹션을 확인하고 필요한 부분을 수정한 뒤 '확인'을 체크하세요. 모든 섹션이 확인되어야 공개할 수 있습니다.
          </p>
        </div>

        {/* Result message */}
        {actionStatus === 'done' && (
          <div className="mb-6 p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center">
            <h3 className="text-lg font-bold mb-2">✅ {resultMsg}</h3>
            <p className="text-sm text-emerald-500/80 mb-4">투자설명서가 성공적으로 공개되었습니다.</p>
            <a
              href={`/im-lite/${buildingId}?doc=${docId}`}
              className="inline-block px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-colors"
            >
              퍼블릭 IM 확인하기
            </a>
          </div>
        )}
        {actionStatus === 'error' && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
            ❌ {resultMsg}
          </div>
        )}

        {/* Section editor */}
        <div className="space-y-4 mb-8">
          {sections.map((section, idx) => {
            const isVerified = verifiedSet.has(idx);
            const isEditing = editingIdx === idx;
            
            let badgeUI = null;
            if (section.confidence === 'confirmed' || isVerified) {
              badgeUI = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">🟢 공공데이터 확인됨</span>;
            } else if (section.confidence === 'needs_check') {
              badgeUI = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">🔴 보완 필요</span>;
            } else {
              badgeUI = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">🟡 AI 추론 — 검토 권장</span>;
            }

            return (
              <div key={section.section_type ?? idx} className={`rounded-2xl border transition-colors ${isVerified ? 'border-neutral-800 bg-neutral-900/30' : 'border-neutral-700 bg-neutral-900/80'} overflow-hidden`}>
                <div className="p-4 flex items-center justify-between border-b border-neutral-800/50">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-white">{idx + 1}. {section.title}</span>
                    {badgeUI}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditing && (
                      <button
                        onClick={() => toggleVerify(idx)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                          isVerified 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                        }`}
                      >
                        {isVerified ? '✓ 확인완료' : '미확인'}
                      </button>
                    )}
                    <button
                      onClick={() => isEditing ? saveEdit(idx) : startEdit(idx)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                    >
                      {isEditing ? '💾 저장' : '✏ 수정'}
                    </button>
                  </div>
                </div>
                
                {isEditing ? (
                  <div className="flex flex-col md:flex-row border-t border-neutral-800 divide-y md:divide-y-0 md:divide-x divide-neutral-800 h-[400px]">
                    <div className="w-full md:w-1/2 flex flex-col">
                      <div className="px-4 py-2 bg-neutral-950 text-xs text-neutral-500 font-medium">마크다운 편집기</div>
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        className="w-full flex-1 bg-neutral-950 p-4 text-sm text-neutral-300 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                    <div className="w-full md:w-1/2 flex flex-col bg-neutral-900/50">
                      <div className="px-4 py-2 bg-neutral-950 text-xs text-neutral-500 font-medium">실시간 미리보기</div>
                      <div className="flex-1 p-4 overflow-y-auto">
                        <MarkdownRenderer content={editDraft} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-6 bg-neutral-950/30">
                    <MarkdownRenderer content={section.markdown} />
                  </div>
                )}
                {isEditing && (
                  <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex justify-end gap-2">
                    <button onClick={cancelEdit} className="text-xs px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg">취소</button>
                    <button onClick={() => saveEdit(idx)} className="text-xs px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg">저장 및 확인</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* Fixed Bottom Action Bar */}
      {docStatus !== 'published' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-900 border-t border-neutral-800 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="text-sm font-medium">
              <span className={allVerified ? 'text-emerald-400' : 'text-amber-400'}>
                {verifiedSet.size} / {sections.length} 섹션 확인 완료
              </span>
            </div>
            
            <button
              onClick={handleApprove}
              disabled={actionStatus === 'loading' || !allVerified}
              className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors disabled:opacity-50 disabled:bg-neutral-800 disabled:text-neutral-500 text-sm shadow-lg shadow-emerald-500/20"
            >
              {actionStatus === 'loading' ? '처리 중...' : '🚀 승인 및 공개'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Local Markdown Renderer ─────────────────────────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;
  let key = 0;

  const flush = () => {
    if (tableBuffer.length > 0) {
      elements.push(<TableFromLines key={key++} lines={tableBuffer} />);
      tableBuffer = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("|")) {
      inTable = true;
      tableBuffer.push(line);
      continue;
    }

    if (inTable && !line.startsWith("|")) {
      flush();
    }

    if (line.startsWith("### ")) {
      flush();
      elements.push(
        <h3 key={key++} className="text-xs font-bold uppercase tracking-wider text-primary mt-4 mb-2">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      flush();
      elements.push(
        <h2 key={key++} className="text-sm font-bold text-white mt-4 mb-2">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("**") && line.endsWith("**") && !line.includes(" ")) {
      flush();
      elements.push(
        <p key={key++} className="font-bold text-white text-sm">
          {line.slice(2, -2)}
        </p>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      flush();
      elements.push(
        <li key={key++} className="text-neutral-300 text-sm leading-relaxed ml-4 list-disc">
          <InlineMarkdown text={line.slice(2)} />
        </li>,
      );
    } else if (line.startsWith("> ")) {
      flush();
      elements.push(
        <blockquote
          key={key++}
          className="border-l-2 border-primary/50 bg-primary/5 rounded-r-lg py-1 px-3 my-2"
        >
          <p className="text-neutral-400 text-xs leading-relaxed">
            <InlineMarkdown text={line.slice(2)} />
          </p>
        </blockquote>,
      );
    } else if (line.trim() === "") {
      flush();
      elements.push(<div key={key++} className="h-2" />);
    } else {
      flush();
      elements.push(
        <p key={key++} className="text-neutral-300 text-sm leading-relaxed">
          <InlineMarkdown text={line} />
        </p>,
      );
    }
  }

  flush();
  return <div className="space-y-1">{elements}</div>;
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i} className="italic text-neutral-200">{part.slice(1, -1)}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function TableFromLines({ lines }: { lines: string[] }) {
  const rows = lines.filter((l) => !l.match(/^\|[\s-|]+\|$/));
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  const parseRow = (row: string) =>
    row
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

  const headers = parseRow(header);

  return (
    <div className="overflow-x-auto my-3 rounded-xl border border-neutral-800">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-950/50">
            {headers.map((h, i) => (
              <th key={i} className="text-left text-neutral-400 font-medium px-3 py-2">
                <InlineMarkdown text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20">
              {parseRow(row).map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-neutral-300">
                  <InlineMarkdown text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
