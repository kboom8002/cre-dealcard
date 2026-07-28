'use client';

import React, { useState, useRef } from 'react';

interface OcrSlot {
  key: string;
  label: string;
  value: string;
  confidence: number;
}

interface OcrUploadPanelProps {
  buildingId: string;
  onSlotsConfirmed: (slots: OcrSlot[]) => void;
}

/**
 * OCR Document Upload Panel.
 * Supports: 건축물대장, 등기부등본, 임대차 계약서
 * IMPORTANT: Rule #11 - OCR results MUST require human confirmation before saving.
 */
export function OcrUploadPanel({ buildingId, onSlotsConfirmed }: OcrUploadPanelProps) {
  const [docType, setDocType] = useState<'building_register' | 'registry' | 'lease_contract'>('building_register');
  const [uploading, setUploading] = useState(false);
  const [parsedSlots, setParsedSlots] = useState<OcrSlot[] | null>(null);
  const [editedSlots, setEditedSlots] = useState<OcrSlot[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docTypes = [
    { key: 'building_register' as const, label: '건축물대장', icon: '🏛️' },
    { key: 'registry' as const, label: '등기부등본', icon: '📜' },
    { key: 'lease_contract' as const, label: '임대차 계약서', icon: '📝' },
  ];

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('docType', docType);
      formData.append('buildingId', buildingId);

      const res = await fetch('/api/broker/ocr/parse', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const slots = data.slots || [];
        setParsedSlots(slots);
        setEditedSlots(slots.map((s: OcrSlot) => ({ ...s })));
      }
    } catch (err) {
      console.error('OCR upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const updateSlotValue = (index: number, value: string) => {
    setEditedSlots(prev => prev.map((s, i) => i === index ? { ...s, value } : s));
  };

  const confirmSlots = () => {
    onSlotsConfirmed(editedSlots);
    setParsedSlots(null);
    setEditedSlots([]);
  };

  return (
    <div className="bg-neutral-900/40 border border-neutral-800/50 rounded-xl p-4 space-y-4">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <span>📸</span> OCR 자동 추출
      </h3>

      {/* Document Type Selector */}
      <div className="flex gap-2">
        {docTypes.map(dt => (
          <button key={dt.key}
            onClick={() => setDocType(dt.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              docType === dt.key
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-600'
            }`}>
            <span>{dt.icon}</span> {dt.label}
          </button>
        ))}
      </div>

      {/* Upload Area */}
      {!parsedSlots && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-neutral-700 hover:border-primary/50 rounded-xl p-6 text-center cursor-pointer transition-colors">
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              <span className="text-xs text-neutral-400">문서 분석 중...</span>
            </div>
          ) : (
            <>
              <span className="text-2xl">📎</span>
              <p className="text-sm text-neutral-400 mt-2">문서 사진 또는 PDF 업로드</p>
              <p className="text-xs text-neutral-600 mt-1">PNG, JPG, PDF · 최대 10MB</p>
            </>
          )}
          <input ref={fileInputRef} type="file" className="hidden" accept=".png,.jpg,.jpeg,.pdf"
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
        </div>
      )}

      {/* Parsed Results - User Confirmation Required (Rule #11) */}
      {parsedSlots && (
        <div className="space-y-3">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-xs text-amber-300 font-bold flex items-center gap-1">
              <span>⚠️</span> 추출된 정보를 확인해 주세요. 자동 저장되지 않습니다.
            </p>
          </div>

          {editedSlots.map((slot, i) => (
            <div key={slot.key} className="flex items-center gap-3">
              <label className="text-xs text-neutral-400 w-24 shrink-0 text-right">{slot.label}</label>
              <input
                type="text"
                value={slot.value}
                onChange={e => updateSlotValue(i, e.target.value)}
                className={`flex-1 bg-neutral-800 border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary ${
                  slot.confidence > 0.8 ? 'border-emerald-500/30' : slot.confidence > 0.5 ? 'border-amber-500/30' : 'border-red-500/30'
                }`}
              />
              <span className={`text-[10px] w-8 text-right ${
                slot.confidence > 0.8 ? 'text-emerald-400' : slot.confidence > 0.5 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {Math.round(slot.confidence * 100)}%
              </span>
            </div>
          ))}

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setParsedSlots(null); setEditedSlots([]); }}
              className="px-4 py-2 bg-neutral-800 text-neutral-300 text-xs rounded-lg hover:bg-neutral-700 transition-colors">
              취소
            </button>
            <button onClick={confirmSlots}
              className="px-4 py-2 bg-primary text-black text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors">
              ✅ 확인 및 적용
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
