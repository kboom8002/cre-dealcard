'use client';

import { useState } from 'react';
import { DealStage, BRIDGE_CONTRACTS, STAGE_LABELS } from '@/domain/pipeline/bridge-state-machine';

interface StageTransitionModalProps {
  dealId: string;
  buildingId: string;
  fromStage: DealStage;
  toStage: DealStage;
  onClose: () => void;
  onSuccess: () => void;
}

export function StageTransitionModal({
  dealId,
  buildingId,
  fromStage,
  toStage,
  onClose,
  onSuccess,
}: StageTransitionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Find contract
  const contract = BRIDGE_CONTRACTS.find(c => c.from === fromStage && c.to === toStage);
  const requiredFields = contract?.requiredFields || [];
  
  const [formData, setFormData] = useState<Record<string, string>>({});

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Check if all required fields are filled
    const missing = requiredFields.filter(f => !formData[f] || formData[f].trim() === '');
    if (missing.length > 0) {
      setError(`필수 정보를 모두 입력해주세요: ${missing.join(', ')}`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/broker/pipeline/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId,
          buildingId,
          from: fromStage,
          to: toStage,
          metadata: formData,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '상태 업데이트 실패');
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
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-bold">다음 단계로 이동: {STAGE_LABELS[toStage]}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            해당 단계로 넘어가기 위해 필요한 필수 정보를 입력해주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {requiredFields.map(field => (
            <div key={field} className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">
                {getFieldLabel(field)} <span className="text-destructive">*</span>
              </label>
              <input
                type={field.includes('price') || field.includes('date') ? 'text' : 'text'}
                placeholder={getFieldPlaceholder(field)}
                value={formData[field] || ''}
                onChange={(e) => handleChange(field, e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                required
              />
            </div>
          ))}

          {requiredFields.length === 0 && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              추가로 입력할 정보가 없습니다. 진행하시겠습니까?
            </div>
          )}

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2 rounded-md border border-input text-sm font-medium hover:bg-muted transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? '처리 중...' : '완료 및 이동'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getFieldLabel(field: string): string {
  const map: Record<string, string> = {
    gate_request_id: '자료 요청 ID',
    im_project_id: 'IM 프로젝트 ID',
    readiness_score: '준비도 점수',
    buyer_intent_lite_id: '매수자 의향서 ID',
    match_grade: '매칭 등급 (S/A/B)',
    buyer_reaction: '매수자 미팅 반응',
    price_gap: '가격 차이 (호가 vs 희망가)',
    agreed_price: '제안/합의 가격',
    key_conditions: '주요 계약 조건',
    closing_date: '잔금 예정일',
    fund_confirmed: '자금 조달 확정 여부',
  };
  return map[field] || field;
}

function getFieldPlaceholder(field: string): string {
  const map: Record<string, string> = {
    buyer_reaction: '예: 긍정적이나 가격 부담 느낌',
    price_gap: '예: 5억',
    agreed_price: '예: 120억',
    key_conditions: '예: 명도 조건 포함, 계약금 10%',
    closing_date: '예: 2026-08-31',
    fund_confirmed: '예: 은행 대출 승인 완료',
  };
  return map[field] || '내용을 입력하세요';
}
