'use client';

/**
 * @file PhotoApprovalSection.tsx
 * @description D30 §5: 이미지 승인 UI 화면
 * 중개인이 각 사진의 PII(물건명·임차인명) 노출 여부를 확인하고 승인
 */

import React, { useState, useCallback } from 'react';

interface PhotoItem {
  url: string;
  fileName: string;
  approved: boolean;
  masked: boolean;
  piiChecked: boolean;
}

interface PhotoApprovalSectionProps {
  photos: Array<{ url: string; fileName: string }>;
  onApprovalChange?: (approvals: PhotoItem[]) => void;
}

export function PhotoApprovalSection({ photos, onApprovalChange }: PhotoApprovalSectionProps) {
  const [items, setItems] = useState<PhotoItem[]>(() =>
    photos.map(p => ({
      ...p,
      approved: false,
      masked: false,
      piiChecked: false,
    }))
  );

  const updateItem = useCallback((index: number, updates: Partial<PhotoItem>) => {
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      onApprovalChange?.(next);
      return next;
    });
  }, [onApprovalChange]);

  const approveAll = useCallback(() => {
    setItems(prev => {
      const next = prev.map(p => ({ ...p, approved: true, piiChecked: true }));
      onApprovalChange?.(next);
      return next;
    });
  }, [onApprovalChange]);

  const allApproved = items.every(i => i.approved && i.piiChecked);
  const approvedCount = items.filter(i => i.approved).length;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            📸 이미지 PII 확인 ({approvedCount}/{items.length})
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            각 사진에 물건명·임차인명 노출이 없는지 확인해 주세요
          </p>
        </div>
        <button
          onClick={approveAll}
          disabled={allApproved}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          전체 승인
        </button>
      </div>

      {/* 승인 상태 배지 */}
      {allApproved && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-xs text-green-800">
          ✅ 모든 사진의 PII 확인이 완료되었습니다. G20 게이트 통과 조건 충족.
        </div>
      )}

      {/* 사진 목록 */}
      <div className="grid grid-cols-2 gap-3">
        {items.map((item, idx) => (
          <div
            key={item.fileName}
            className={`relative rounded-lg border-2 overflow-hidden transition-colors ${
              item.approved ? 'border-green-400 bg-green-50/30' : 'border-gray-200'
            }`}
          >
            {/* 사진 미리보기 */}
            <div className="aspect-[4/3] bg-gray-100 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.fileName}
                className="w-full h-full object-cover"
              />
              {/* 승인 뱃지 */}
              {item.approved && (
                <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                  ✓
                </div>
              )}
              {/* 마스킹 표시 */}
              {item.masked && (
                <div className="absolute top-1 left-1 bg-orange-500 text-white rounded px-1.5 py-0.5 text-[9px]">
                  마스킹
                </div>
              )}
            </div>

            {/* 승인 컨트롤 */}
            <div className="p-2 space-y-1.5">
              <p className="text-[10px] text-gray-500 truncate">{item.fileName}</p>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.piiChecked}
                  onChange={e => updateItem(idx, { piiChecked: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                />
                <span className="text-[11px] text-gray-700">PII 미노출 확인</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.masked}
                  onChange={e => updateItem(idx, { masked: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-orange-600"
                />
                <span className="text-[11px] text-gray-700">마스킹 처리됨</span>
              </label>

              <button
                onClick={() => updateItem(idx, { approved: !item.approved, piiChecked: true })}
                className={`w-full py-1 text-[11px] font-medium rounded transition-colors ${
                  item.approved
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700'
                }`}
              >
                {item.approved ? '승인 완료' : '승인'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* G20 경고 */}
      {!allApproved && items.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
          ⚠️ 미승인 사진이 {items.length - approvedCount}건 남아 있습니다.
          모든 사진을 승인해야 G20(이미지 PII 승인) 게이트를 통과합니다.
        </div>
      )}
    </div>
  );
}
