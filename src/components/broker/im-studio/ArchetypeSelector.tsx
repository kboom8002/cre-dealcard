'use client';

import React from 'react';

export interface CompatibleArchetypeOption {
  layoutType: string;
  label: string;
  desc: string;
}

const COMPATIBLE_LAYOUTS_BY_DATA_KEY: Record<string, CompatibleArchetypeOption[]> = {
  cover: [
    { layoutType: 'A01_COVER', label: '표준 기관 매스 표지', desc: '우상단 3단 매스 + 하단 요약 바' },
    { layoutType: 'A01_SPLIT', label: '좌우 분할 표지', desc: '좌측 핵심 제원 · 우측 브랜드 패널' },
    { layoutType: 'A01_HERO', label: '전면 다크 히어로 표지', desc: '중앙 골드 프레임 집중형' },
  ],
  highlights: [
    { layoutType: 'A02_STAT_GRID', label: '4대 KPI 카드 + 3대 포인트', desc: '핵심 수익률·매매가 대형 카드 배치' },
    { layoutType: 'A02_EXECUTIVE', label: '핵심 리드문 + 상하 비교형', desc: '투자 포인트 서술 강조형 레이아웃' },
  ],
  overview: [
    { layoutType: 'A04_ASYMMETRIC', label: '좌측 11대 제원표 + 우측 외관/포인트', desc: '건축물대장 제원표 중심 표준형' },
    { layoutType: 'A04_WIDE_SPEC', label: '2단 제원표 + 하단 매매가 요약', desc: '다필지·상세 제원 강조형' },
  ],
  location: [
    { layoutType: 'A06_DIAGRAM', label: '좌측 위치도 + 우측 교통·상권 표', desc: '반경 500m POI 지도 + 입지 요약' },
    { layoutType: 'A06_TRANSIT_FOCUS', label: '역세권·배후수요 콜아웃 강조형', desc: '대중교통 및 주요 랜드마크 중심' },
  ],
  land: [
    { layoutType: 'A27_LAND_USE_PLAN', label: '토지이용계획확인원 표준 양식', desc: '좌측 지적도 + 우측 국토계획법/타법령' },
    { layoutType: 'A06_LAND_CADASTRAL', label: '지적도 대형 + 핵심 공법 요약', desc: '필지 경계 및 도로접면 강조형' },
  ],
  rentroll: [
    { layoutType: 'A24_RENTROLL_STACKING', label: '좌측 층별 렌트롤 + 우측 스태킹 플랜', desc: '층별 임대현황 및 전환 전략 통합형' },
    { layoutType: 'A24_TABLE_FOCUS', label: '전체폭 상세 렌트롤 테이블', desc: '다수 호실 상세 임대조건 강조형' },
  ],
  yield: [
    { layoutType: 'A23_YIELD_FORMULA', label: '수익률 산식 + 10년 공시지가 추이', desc: '현행 vs 안정화 수익률 + 지가 차트' },
    { layoutType: 'A23_DUAL_YIELD', label: '현행·안정화 듀얼 카드 비교형', desc: 'Value-Add 전환 수익률 집중 비교' },
  ],
  comps: [
    { layoutType: 'A26_BROKER_EXTRAS', label: '인근 실거래 비교표 + 평당가 차트', desc: '본건 vs 비교사례 평당가·수익률 대조' },
  ],
  gallery: [
    { layoutType: 'A14_GALLERY', label: '4분할 균등 사진 그리드', desc: '외관·주출입구·내부·도로 4컷 정방 배치' },
    { layoutType: 'A14_HERO_3', label: '대표 외관 대형 + 서브 3컷', desc: '메인 외관 사진 강조 레이아웃' },
  ],
  closing: [
    { layoutType: 'A10_CLOSING', label: '3단계 매입절차 + 문의처 · 면책고지', desc: '프로세스 바 + 출처 배지 + 담당자 카드' },
  ],
};

interface ArchetypeSelectorProps {
  dataKey: string;
  currentLayoutType: string;
  onSelectLayout: (layoutType: string) => void;
}

export function ArchetypeSelector({
  dataKey,
  currentLayoutType,
  onSelectLayout,
}: ArchetypeSelectorProps) {
  const options = COMPATIBLE_LAYOUTS_BY_DATA_KEY[dataKey] || [];
  if (options.length <= 1) return null;

  return (
    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0F172A]">
          📐 슬라이드 레이아웃 변형 선택
        </span>
        <span className="text-[10px] font-bold text-[#475569]">
          {options.length}개 호환 레이아웃
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {options.map(opt => {
          const active = currentLayoutType === opt.layoutType;
          return (
            <button
              key={opt.layoutType}
              type="button"
              onClick={() => onSelectLayout(opt.layoutType)}
              className={`px-3 py-2 rounded-lg border text-left transition-all flex items-center justify-between ${
                active
                  ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1E3A8A] shadow-2xs'
                  : 'border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-[#F1F5F9]'
              }`}
            >
              <div>
                <div className="text-xs font-bold">{opt.label}</div>
                <div className="text-[10px] text-[#475569]">{opt.desc}</div>
              </div>
              {active && (
                <span className="px-1.5 py-0.5 text-[10px] font-extrabold rounded bg-[#1D4ED8] text-white shrink-0">
                  적용됨
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
