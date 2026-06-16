'use client';

import { useState } from 'react';
import { User, Briefcase, FileText, CheckCircle, XCircle } from 'lucide-react';

interface GateRequestReviewModalProps {
  dealId: string;
  buildingId: string;
  buyerType: string;
  buyerBudget: string;
  buyerPurpose: string;
  ndaSigned: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function GateRequestReviewModal({
  dealId,
  buildingId,
  buyerType,
  buyerBudget,
  buyerPurpose,
  ndaSigned,
  onClose,
  onSuccess,
}: GateRequestReviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleReview = async (decision: 'approved' | 'rejected') => {
    setLoading(true);
    setError('');
    try {
      // 1. API: Gate Request Approve
      // MVP: We assume gate_request_id is fetchable or we pass it. For now, we transition pipeline.
      const res = await fetch('/api/broker/pipeline/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId,
          buildingId,
          from: 'gate_requested',
          to: decision === 'approved' ? 'im_created' : 'failed',
          metadata: { 
            im_project_id: `proj-${Date.now()}`, 
            readiness_score: '85',
            gate_decision: decision
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '처리 실패');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 rounded-xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">자료 요청(Gate) 응대 수락</h2>
            <p className="text-xs text-muted-foreground mt-1">
              요청한 매수자의 자격을 확인하고 Full IM 공유를 수락합니다.
            </p>
          </div>
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Buyer Info */}
          <div className="bg-muted/30 p-4 rounded-lg space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold">{buyerType}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">투자 예산</p>
                <p className="font-semibold">{buyerBudget || '미기재'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">매수 목적</p>
                <p className="font-semibold truncate">{buyerPurpose || '미기재'}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-border mt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">NDA(비밀유지계약) 서명</span>
                {ndaSigned ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="w-3.5 h-3.5" /> 완료됨
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                    <XCircle className="w-3.5 h-3.5" /> 미완료
                  </span>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => handleReview('rejected')}
              disabled={loading}
              className="flex-1 py-2 rounded-md border border-destructive text-destructive text-sm font-bold hover:bg-destructive/10 transition-colors"
            >
              거절 (Reject)
            </button>
            <button
              type="button"
              onClick={() => handleReview('approved')}
              disabled={loading}
              className="flex-[2] py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? '처리 중...' : '수락 및 IM 공유 (Approve)'}
            </button>
          </div>
          
          <button onClick={onClose} className="w-full text-center text-xs text-muted-foreground hover:underline mt-2">
            나중에 결정하기
          </button>
        </div>
      </div>
    </div>
  );
}
