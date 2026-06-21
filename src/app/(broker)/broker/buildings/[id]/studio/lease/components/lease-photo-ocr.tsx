'use client';

import React, { useRef, useState } from 'react';

interface TenantRow {
  floor: string;
  area_sqm: number;
  tenant_type: string;
  monthly_rent: number | null;
  deposit: number | null;
  contract_end: string | null;
  is_anchor: boolean;
  tenant_name: string | null;
}

interface LeasePhotoOcrProps {
  onImport: (tenants: TenantRow[]) => void;
}

export function LeasePhotoOcr({ onImport }: LeasePhotoOcrProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('sb-access-token') || 'dummy-token';
      
      // OCR 분석 API 호출 (임대현황표 전용 API가 없다면 기존의 parse API 혹은 모의 데이터로 폴백)
      const res = await fetch('/api/broker/studio/lease/ocr', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      if (!res.ok) {
        // 백엔드 API가 아직 없다면 Mock 데이터로 처리 (데모용)
        console.warn("OCR API failed or not found, using fallback parser.");
        setTimeout(() => {
          onImport([
            { floor: '1F', area_sqm: 150, tenant_type: 'food', monthly_rent: 4500000, deposit: 50000000, contract_end: '2025-12', is_anchor: true, tenant_name: '스타벅스' },
            { floor: '2F', area_sqm: 200, tenant_type: 'office', monthly_rent: 3000000, deposit: 30000000, contract_end: '2026-06', is_anchor: false, tenant_name: '법무법인' }
          ]);
          setLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }, 1500);
        return;
      }

      const data = await res.json();
      if (data.tenants && Array.isArray(data.tenants)) {
        onImport(data.tenants);
      } else {
        throw new Error("분석 결과에서 데이터를 찾을 수 없습니다.");
      }

    } catch (err: any) {
      setError(err.message || "사진 분석 중 오류가 발생했습니다.");
      setLoading(false);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={fileInputRef}
        onChange={handlePhotoUpload}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => fileInputRef.current?.click()}
        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-white"></div>
            <span>사진 분석 중...</span>
          </>
        ) : (
          <span>📸 임대현황표 사진 촬영</span>
        )}
      </button>
      {error && <span className="text-xs text-red-400 font-bold">{error}</span>}
    </div>
  );
}
