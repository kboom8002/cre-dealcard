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
  const [status, setStatus] = useState<'idle' | 'uploading' | 'parsed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parsedSlots, setParsedSlots] = useState<OcrSlot[] | null>(null);
  const [editedSlots, setEditedSlots] = useState<OcrSlot[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploading = status === 'uploading';

  const docTypes = [
    { key: 'building_register' as const, label: '건축물대장', icon: '🏛️' },
    { key: 'registry' as const, label: '등기부등본', icon: '📜' },
    { key: 'lease_contract' as const, label: '임대차 계약서', icon: '📝' },
  ];

  const triggerFilePicker = () => {
    if (uploading) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  const handleUpload = async (file: File) => {
    setStatus('uploading');
    setErrorMessage(null);
    setParsedSlots(null);
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
        const slots: OcrSlot[] = Array.isArray(data.slots) ? data.slots : [];
        if (slots.length === 0) {
          setStatus('error');
          setErrorMessage('추출된 항목이 없습니다. 더 선명한 사진이나 다른 문서로 다시 시도해 주세요.');
          return;
        }
        setParsedSlots(slots);
        setEditedSlots(slots.map((s: OcrSlot) => ({ ...s })));
        setStatus('parsed');
      } else {
        const errData = await res.json().catch(() => ({}));
        setStatus('error');
        setErrorMessage(
          typeof errData?.error === 'string' && errData.error.trim()
            ? errData.error
            : '문서 분석에 실패했습니다. 다시 파일을 선택해 시도해 주세요.'
        );
      }
    } catch (err) {
      console.error('OCR upload failed:', err);
      setStatus('error');
      setErrorMessage('네트워크 오류로 문서 분석에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const updateSlotValue = (index: number, value: string) => {
    setEditedSlots(prev => prev.map((s, i) => i === index ? { ...s, value } : s));
  };

  const confirmSlots = () => {
    onSlotsConfirmed(editedSlots);
    setParsedSlots(null);
    setEditedSlots([]);
    setStatus('idle');
    setErrorMessage(null);
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
            type="button"
            onClick={() => setDocType(dt.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              docType === dt.key
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-600'
            }`}>
            <span>{dt.icon}</span> {dt.label}
          </button>
        ))}
      </div>

      {/* Error Banner with Retry Button */}
      {status === 'error' && errorMessage && (
        <div
          role="alert"
          data-testid="ocr-upload-error"
          className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2"
        >
          <p className="text-sm text-red-300 font-medium">{errorMessage}</p>
          <button
            type="button"
            data-testid="ocr-retry-upload-btn"
            onClick={triggerFilePicker}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-semibold rounded-lg border border-neutral-600 transition-colors min-h-[36px]"
          >
            다시 파일 선택
          </button>
        </div>
      )}

      {/* Upload Area (accessible in both idle and error states) */}
      {!parsedSlots && (
        <div
          role="button"
          tabIndex={0}
          data-testid="ocr-upload-dropzone"
          onClick={triggerFilePicker}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              triggerFilePicker();
            }
          }}
          className="border-2 border-dashed border-neutral-700 hover:border-primary/50 rounded-xl p-6 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]">
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              <span className="text-sm text-neutral-400">문서 분석 중...</span>
            </div>
          ) : (
            <>
              <span className="text-2xl">📎</span>
              <p className="text-sm text-neutral-400 mt-2">
                {status === 'error' ? '다른 문서 사진 또는 PDF 다시 선택하기' : '문서 사진 또는 PDF 업로드'}
              </p>
              <p className="text-sm text-neutral-500 mt-1">PNG, JPG, PDF · 최대 10MB</p>
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
            <p className="text-sm text-amber-300 font-bold flex items-center gap-1">
              <span>⚠️</span> 추출된 정보를 확인해 주세요. 자동 저장되지 않습니다.
            </p>
          </div>

          {editedSlots.map((slot, i) => (
            <div key={slot.key} className="flex items-center gap-3">
              <label className="text-sm text-neutral-400 w-24 shrink-0 text-right">{slot.label}</label>
              <input
                type="text"
                value={slot.value}
                onChange={e => updateSlotValue(i, e.target.value)}
                className={`flex-1 bg-neutral-800 border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary ${
                  slot.confidence > 0.8 ? 'border-emerald-500/30' : slot.confidence > 0.5 ? 'border-amber-500/30' : 'border-red-500/30'
                }`}
              />
              <span className={`text-sm w-10 text-right ${
                slot.confidence > 0.8 ? 'text-emerald-400' : slot.confidence > 0.5 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {Math.round(slot.confidence * 100)}%
              </span>
            </div>
          ))}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setParsedSlots(null); setEditedSlots([]); setStatus('idle'); setErrorMessage(null); }}
              className="px-4 py-2 bg-neutral-800 text-neutral-300 text-sm rounded-lg hover:bg-neutral-700 transition-colors min-h-[44px]">
              취소
            </button>
            <button
              type="button"
              onClick={confirmSlots}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors min-h-[44px]">
              ✅ 확인 및 적용
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
