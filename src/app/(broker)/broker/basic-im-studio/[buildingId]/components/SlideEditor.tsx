'use client';

import React, { useState } from 'react';
import type { PptxSlide } from '@/domain/building/pptx-studio/studio-service';
import { PresetGallery } from '@/components/broker/im-studio/PresetGallery';
import { HeaderFooterEditor } from '@/components/broker/im-studio/HeaderFooterEditor';
import { ArchetypeSelector } from '@/components/broker/im-studio/ArchetypeSelector';
import { AiTextGenerator } from '@/components/broker/im-studio/AiTextGenerator';
import { GalleryCurator, type StudioPhotoItem } from '@/components/broker/im-studio/GalleryCurator';

export type RightPanelTab = 'content' | 'theme' | 'branding';

interface SlideEditorProps {
  projectId: string;
  slide: PptxSlide;
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  onChange: (key: string, value: unknown) => void;
  onLayoutChange: (layoutType: string) => void;
  onSave: () => void;
  onResetSlide: () => void;
  saving: boolean;
}

interface FieldSpec {
  key: string;
  label: string;
  multiline?: boolean;
  aiEnabled?: boolean;
  placeholder?: string;
}

const SLIDE_FIELD_SPECS: Record<string, FieldSpec[]> = {
  cover: [
    { key: 'title', label: '표지 메인 타이틀 (건물명·매각명)' },
    { key: 'subtitle', label: '표지 서브타이틀 (용도·핵심 문구)' },
    { key: 'askingPrice', label: '매매 희망가 표기 (예: 95억 원)' },
    { key: 'address', label: '소재지 표기' },
    { key: 'date', label: '작성 기준일 (YYYY-MM-DD)' },
    { key: 'brokerCompany', label: '담당 중개법인 명칭' },
    { key: 'brokerName', label: '담당 컨설턴트 성명' },
    { key: 'brokerPhone', label: '담당자 연락처' },
  ],
  highlights: [
    { key: 'leadSentence', label: '슬라이드 상단 핵심 리드 문장', aiEnabled: true },
    { key: 'askingPrice', label: 'KPI 1: 매매 희망가' },
    { key: 'grossYield', label: 'KPI 2: 현행 임대수익률 (%)' },
    { key: 'stabilizedYield', label: 'KPI 3: 안정화 기대수익률 (%)' },
    { key: 'vacancySignal', label: 'KPI 4: 임대 가동 현황 / 공실률' },
    { key: 'keyInvestmentPoint', label: '투자 포인트 01 (입지·수익 구조)', aiEnabled: true },
    { key: 'investmentPoint2', label: '투자 포인트 02 (토지·건물 제원 강점)', aiEnabled: true },
    { key: 'investmentPoint3', label: '투자 포인트 03 (밸류애드·상승 여력)', aiEnabled: true },
  ],
  overview: [
    { key: 'buildingName', label: '건물명' },
    { key: 'address', label: '소재지 (도로명 · 지번)' },
    { key: 'landArea', label: '대지면적 (㎡ / 평)' },
    { key: 'archArea', label: '건축면적 (㎡ / 평)' },
    { key: 'grossArea', label: '연면적 (㎡ / 평)' },
    { key: 'floors', label: '건축규모 (지하 / 지상 층수)' },
    { key: 'zoning', label: '용도지역' },
    { key: 'bcrFar', label: '건폐율 / 용적률 (%)' },
    { key: 'completionYear', label: '사용승인연도 (준공연도)' },
    { key: 'parkingElevator', label: '주차대수 / 승강기' },
    { key: 'mainUse', label: '주용도' },
    { key: 'structureType', label: '주구조' },
    { key: 'askingPrice', label: '하단 매매 희망가' },
    { key: 'landUnitPrice', label: '하단 토지 평당가' },
    { key: 'rightCallout', label: '우측 자산 핵심 체크포인트 (줄바꿈 구분)', multiline: true, aiEnabled: true },
  ],
  location: [
    { key: 'address', label: '소재지' },
    { key: 'transitInfo', label: '대중교통 · 역세권 도보 시간' },
    { key: 'roadInfo', label: '접면도로 및 차량 진입 여건' },
    { key: 'areaInfo', label: '배후 상권 및 권역 특성' },
    { key: 'locationCallout', label: '입지 및 상권 종합 의견', multiline: true, aiEnabled: true },
    { key: 'mapImageUrl', label: '커스텀 위치도 이미지 URL (선택)' },
  ],
  land: [
    { key: 'landArea', label: '대지면적 (㎡ / 평)' },
    { key: 'landCategory', label: '지목 (예: 대)' },
    { key: 'zoningInfo', label: '용도지역 · 지구' },
    { key: 'bcrFar', label: '건폐율 / 용적률' },
    { key: 'officialLandPrice', label: '개별공시지가 (원/㎡ · 평당)' },
    { key: 'nationalLaw', label: '국토의 계획 및 이용에 관한 법률 사항' },
    { key: 'otherLaws', label: '다른 법령 등에 따른 지역·지구' },
    { key: 'landCallout', label: '토지 규제 및 공법 종합 검토 의견', multiline: true, aiEnabled: true },
    { key: 'cadastralMapImage', label: '커스텀 지적도·토지계획도 이미지 URL (선택)' },
  ],
  rentroll: [
    { key: 'depositTotal', label: '총 보증금 합계' },
    { key: 'monthlyRentTotal', label: '월 임대료 합계' },
    { key: 'occupancyRate', label: '임대 가동률 (%)' },
    { key: 'vacancySignal', label: '공실 현황 요약' },
    { key: 'stabilizedYieldTitle', label: '하단 매입 후 전략 배너 제목' },
    { key: 'turnaroundStrategy', label: '매입 후 임대차 재구성(Value-Add) 전략 상세', multiline: true, aiEnabled: true },
    { key: 'rentrollNotes', label: '렌트롤 각주 / 기준 안내 문구' },
  ],
  yield: [
    { key: 'capRateBase', label: '현행 임대수익률 (%)' },
    { key: 'capRateStabilized', label: '안정화 기대수익률 (%)' },
    { key: 'stabilizedAssumption', label: '안정화 수익률 산출 가정 설명', aiEnabled: true },
    { key: 'askingPrice', label: '매매 희망가 (A)' },
    { key: 'totalDeposit', label: '총 임대보증금 (B)' },
    { key: 'annualRent', label: '연간 임대수익 (C = 월세×12)' },
    { key: 'pricePerPyeong', label: '토지 평당 단가' },
    { key: 'yieldNotes', label: '수익률 및 공시지가 추이 해설', multiline: true, aiEnabled: true },
  ],
  comps: [
    { key: 'compsTitle', label: '시세 비교 표 제목' },
    { key: 'targetLandPricePerPy', label: '본건 토지 평당가' },
    { key: 'compsNotes', label: '인근 실거래 비교 시사점 코멘트', multiline: true, aiEnabled: true },
  ],
  gallery: [
    { key: 'galleryTitle', label: '갤러리 슬라이드 부제' },
  ],
  closing: [
    { key: 'closingLine', label: '매수 제안 한 줄 요약 문구', multiline: true, aiEnabled: true },
    { key: 'brokerCompany', label: '중개법인 · 사무소 명칭' },
    { key: 'brokerName', label: '담당자 성명 · 직책' },
    { key: 'brokerPhone', label: '담당자 직통 연락처' },
    { key: 'brokerEmail', label: '담당자 이메일' },
    { key: 'brokerRegNo', label: '중개사무소 등록번호' },
    { key: 'disclaimer', label: '법적 면책 고지 문구', multiline: true },
  ],
};

export function SlideEditor({
  projectId,
  slide,
  activeTab,
  onTabChange,
  onChange,
  onLayoutChange,
  onSave,
  onResetSlide,
  saving,
}: SlideEditorProps) {
  const dataKey = slide.dataKey || 'overview';
  const overrides = (slide.slideOverrides || {}) as Record<string, any>;
  const fields = SLIDE_FIELD_SPECS[dataKey] || SLIDE_FIELD_SPECS[dataKey.toLowerCase()] || SLIDE_FIELD_SPECS.overview;

  // Quick-add comparable state for 'comps' slide
  const [compName, setCompName] = useState('');
  const [compDate, setCompDate] = useState('2025.12');
  const [compPrice, setCompPrice] = useState('');
  const [compLandPy, setCompLandPy] = useState('');
  const [compUnitManwon, setCompUnitManwon] = useState('');
  const [uploadingImageKey, setUploadingImageKey] = useState<string | null>(null);

  // Quick-add tenant row state for 'rentroll' slide
  const [rrFloor, setRrFloor] = useState('');
  const [rrUnit, setRrUnit] = useState('');
  const [rrTenant, setRrTenant] = useState('');
  const [rrAreaPy, setRrAreaPy] = useState('');
  const [rrDeposit, setRrDeposit] = useState('');
  const [rrRent, setRrRent] = useState('');
  const [rrIsVacant, setRrIsVacant] = useState(false);

  const rawTenantList: any[] = Array.isArray(overrides.tenantData) ? overrides.tenantData : [];

  const handleRecalculateRentRollTotals = () => {
    if (rawTenantList.length === 0) return;
    let totalDeposit = 0;
    let totalRent = 0;
    let occupiedCount = 0;
    let vacantCount = 0;
    for (const r of rawTenantList) {
      const isVacant = Boolean(
        r.is_vacant ||
          r.status === '공실' ||
          String(r.tenant_name || r.tenant || '').includes('공실')
      );
      if (isVacant) {
        vacantCount += 1;
      } else {
        occupiedCount += 1;
        totalDeposit += Number(r.deposit_manwon || 0) || 0;
        totalRent += Number(r.rent_manwon || 0) || 0;
      }
    }
    const totalCount = rawTenantList.length;
    const occPct = Math.round((occupiedCount / totalCount) * 100);
    onChange('depositTotal', `${totalDeposit.toLocaleString()}만 원`);
    onChange('monthlyRentTotal', `${totalRent.toLocaleString()}만 원/월`);
    onChange('occupancyRate', `${occPct}%`);
    onChange(
      'vacancySignal',
      vacantCount === 0 ? '전실 임대 가동' : `공실 ${vacantCount}실 (공실률 ${100 - occPct}%)`
    );
  };

  const handleToggleTenantVacant = (idx: number) => {
    const next = rawTenantList.map((r: any, i: number) => {
      if (i !== idx) return r;
      const curVac = Boolean(r.is_vacant || r.status === '공실');
      const nextVac = !curVac;
      return {
        ...r,
        is_vacant: nextVac,
        status: nextVac ? '공실' : '임대중',
        tenant_name: nextVac ? '공실' : r.tenant_name === '공실' ? '임차중' : r.tenant_name,
        tenant: nextVac ? '공실' : r.tenant === '공실' ? '임차중' : r.tenant,
      };
    });
    onChange('tenantData', next);
  };

  const handleRemoveTenantRow = (idx: number) => {
    const next = rawTenantList.filter((_: any, i: number) => i !== idx);
    onChange('tenantData', next);
  };

  const handleAddTenantRow = () => {
    if (!rrFloor.trim() && !rrTenant.trim()) return;
    const parseNum = (v: string) => {
      const n = parseFloat(String(v || '').replace(/[^0-9.-]/g, ''));
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const areaPy = parseNum(rrAreaPy);
    const depositVal = parseNum(rrDeposit) ?? 0;
    const rentVal = parseNum(rrRent) ?? 0;
    const floorLabel = rrFloor.trim() || '1F';
    const unitLabel = rrUnit.trim();
    const tenantLabel = rrIsVacant ? '공실' : rrTenant.trim() || '임차중';

    const newRow = {
      floor: floorLabel,
      unit_label: unitLabel || undefined,
      unit_number: unitLabel || undefined,
      tenant_name: tenantLabel,
      tenant: tenantLabel,
      area_pyeong: areaPy,
      area_sqm: areaPy ? Number((areaPy * 3.305785).toFixed(2)) : undefined,
      deposit_manwon: depositVal,
      rent_manwon: rentVal,
      is_vacant: rrIsVacant,
      status: rrIsVacant ? '공실' : '임대중',
    };
    const next = [...rawTenantList, newRow];
    onChange('tenantData', next);
    setRrFloor('');
    setRrUnit('');
    setRrTenant('');
    setRrAreaPy('');
    setRrDeposit('');
    setRrRent('');
    setRrIsVacant(false);
  };

  const rawCompsList: any[] = Array.isArray(overrides.comparables)
    ? overrides.comparables
    : Array.isArray(overrides.compsRows)
    ? overrides.compsRows
    : [];

  const handleAddComp = () => {
    if (!compName.trim()) return;
    const parseNum = (v: string) => {
      const n = parseFloat(String(v || '').replace(/[^0-9.-]/g, ''));
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const priceEok = parseNum(compPrice);
    const landPy = parseNum(compLandPy);
    const unitManwon =
      parseNum(compUnitManwon) ??
      (priceEok && landPy ? Math.round((priceEok * 10000) / landPy) : undefined);

    const newItem = {
      location: compName.trim(),
      name: compName.trim(),
      as_of: compDate.trim() || '-',
      trade_date: compDate.trim() || '-',
      price_eok: priceEok,
      price: compPrice.trim() || (priceEok ? `${priceEok}억` : '-'),
      land_area_pyeong: landPy,
      land_pyeong: compLandPy.trim() || (landPy ? String(landPy) : '-'),
      land_price_per_pyeong_manwon: unitManwon,
      land_unit_manwon: compUnitManwon.trim() || (unitManwon ? unitManwon.toLocaleString() : '-'),
    };
    const next = [...rawCompsList, newItem];
    onChange('comparables', next);
    onChange('compsRows', next);
    setCompName('');
    setCompPrice('');
    setCompLandPy('');
    setCompUnitManwon('');
  };

  const handleRemoveComp = (idx: number) => {
    const next = rawCompsList.filter((_: any, i: number) => i !== idx);
    onChange('comparables', next);
    onChange('compsRows', next);
  };

  const handleMapFileUpload = async (fieldName: string, file?: File | null) => {
    if (!file) return;
    setUploadingImageKey(fieldName);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('slideId', slide.id);
      formData.append('fieldName', fieldName);

      const res = await fetch(`/api/broker/basic-im-studio/${encodeURIComponent(projectId)}/map-upload`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (json?.ok) {
        const updatedSlide = json.project?.slides?.find((s: any) => s.id === slide.id);
        const savedDataUrl = updatedSlide?.slideOverrides?.[fieldName];
        if (savedDataUrl) {
          onChange(fieldName, savedDataUrl);
          return;
        }
      }
      // Fallback: read client-side Data URL directly so preview updates immediately
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onChange(fieldName, reader.result);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onChange(fieldName, reader.result);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadingImageKey(null);
    }
  };

  return (
    <aside
      data-testid="studio-slide-editor"
      className="w-96 border-l border-[#CBD5E1] bg-white flex flex-col shrink-0 h-full overflow-hidden"
    >
      {/* Top 3-Tab Switcher */}
      <div
        data-testid="studio-right-tabs"
        className="grid grid-cols-3 border-b border-[#CBD5E1] bg-[#F8FAFC] p-1.5 gap-1 shrink-0"
      >
        {([
          { id: 'content', label: '📝 슬라이드 편집' },
          { id: 'theme', label: '🎨 테마·프리셋' },
          { id: 'branding', label: '🏢 헤더·푸터' },
        ] as const).map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`studio-tab-${tab.id}`}
              data-active-pill={active ? 'true' : undefined}
              onClick={() => onTabChange(tab.id)}
              className={`py-2 px-2 rounded-lg text-xs font-extrabold transition-all ${
                active
                  ? 'bg-[#1D4ED8] text-white shadow-xs'
                  : 'text-[#334155] hover:text-[#0F172A] hover:bg-[#E2E8F0]/60'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'theme' ? (
          <PresetGallery />
        ) : activeTab === 'branding' ? (
          <HeaderFooterEditor />
        ) : (
          /* TAB 1: SLIDE CONTENT EDITOR */
          <div className="space-y-4 text-[#0F172A]">
            {/* Slide Common Title & Kicker */}
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1E3A8A]">
                  슬라이드 {String(slide.slideIndex).padStart(2, '0')} 헤더 설정
                </span>
                <span className="text-[10px] font-mono font-bold text-[#475569]">
                  {slide.layoutType}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-[#334155] mb-0.5">
                    상단 영문 키커 (Kicker)
                  </label>
                  <input
                    type="text"
                    value={String(overrides.kicker ?? slide.kicker ?? '')}
                    onChange={e => onChange('kicker', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#334155] mb-0.5">
                    슬라이드 제목 (Title)
                  </label>
                  <input
                    type="text"
                    value={String(overrides.title ?? slide.title ?? '')}
                    onChange={e => onChange('title', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                </div>
              </div>
            </div>

            {/* Compatible Layout / Archetype Switcher */}
            <ArchetypeSelector
              dataKey={dataKey}
              currentLayoutType={slide.layoutType}
              onSelectLayout={onLayoutChange}
            />

            {/* Gallery Curator if Gallery Slide */}
            {dataKey === 'gallery' && (
              <GalleryCurator
                photos={(overrides.photos as StudioPhotoItem[]) || []}
                galleryLayout={String(overrides.galleryLayout || 'grid_4')}
                onChangePhotos={nextPhotos => onChange('photos', nextPhotos)}
                onChangeLayout={nextLayout => onChange('galleryLayout', nextLayout)}
              />
            )}

            {/* Structured Field Inputs */}
            <div className="space-y-3">
              {fields.map(f => {
                const currentVal = String(overrides[f.key] ?? '');
                const isImageUploadField = f.key === 'mapImageUrl' || f.key === 'cadastralMapImage';
                return (
                  <div key={f.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <label className="block text-xs font-bold text-[#0F172A]">
                        {f.label}
                      </label>
                      {f.aiEnabled && (
                        <AiTextGenerator
                          projectId={projectId}
                          slideId={slide.id}
                          dataKey={dataKey}
                          fieldKey={f.key}
                          currentText={currentVal}
                          onApply={refined => onChange(f.key, refined)}
                        />
                      )}
                      {isImageUploadField && (
                        <label className="cursor-pointer px-2 py-0.5 rounded bg-[#EFF6FF] border border-[#BFDBFE] text-[10px] font-extrabold text-[#1E3A8A] hover:bg-[#DBEAFE]">
                          {uploadingImageKey === f.key ? '업로드 중…' : '📁 이미지 파일 업로드'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingImageKey === f.key}
                            onChange={e => handleMapFileUpload(f.key, e.target.files?.[0])}
                          />
                        </label>
                      )}
                    </div>
                    {f.multiline ? (
                      <textarea
                        rows={3}
                        value={currentVal}
                        onChange={e => onChange(f.key, e.target.value)}
                        placeholder={f.placeholder || `${f.label} 입력`}
                        className="w-full px-3 py-2 text-xs font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] resize-y"
                      />
                    ) : (
                      <input
                        type="text"
                        value={currentVal}
                        onChange={e => onChange(f.key, e.target.value)}
                        placeholder={f.placeholder || `${f.label} 입력`}
                        className="w-full px-3 py-2 text-xs font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Interactive Rent Roll Row Manager for 'rentroll' slide */}
            {(dataKey === 'rentroll' || dataKey === 'rentRoll') && (
              <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-[#0F172A]">
                    🏢 층·호수별 임대차 행 관리 ({rawTenantList.length}건)
                  </div>
                </div>

                {rawTenantList.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRecalculateRentRollTotals}
                    className="w-full py-1.5 px-2.5 text-[11px] font-extrabold rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] hover:bg-[#DBEAFE] transition-colors"
                  >
                    🔄 행 기준 보증금·월세·가동률 합계 자동 계산
                  </button>
                )}

                {rawTenantList.length > 0 && (
                  <div className="space-y-1.5">
                    {rawTenantList.map((r: any, idx: number) => {
                      const unitStr = r.unit_label || r.unit_number || r.unit || '';
                      const isVac = Boolean(r.is_vacant || r.status === '공실');
                      const tenantStr = isVac
                        ? '공실'
                        : r.tenant_name || r.tenant || r.use || '임차중';
                      const areaStr = r.area_pyeong
                        ? `${r.area_pyeong}평`
                        : r.area_sqm
                        ? `${(Number(r.area_sqm) * 0.3025).toFixed(1)}평`
                        : '-';
                      return (
                        <div
                          key={idx}
                          className="p-2 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-extrabold text-[#1E3A8A] shrink-0">
                                {r.floor || '-'}
                                {unitStr ? ` · ${unitStr}` : ''}
                              </span>
                              <span className="font-bold text-[#0F172A] truncate">
                                {tenantStr}
                              </span>
                              <span className="text-[11px] text-[#475569] shrink-0">
                                ({areaStr})
                              </span>
                            </div>
                            <div className="text-[11px] font-medium text-[#334155]">
                              보증금 {(r.deposit_manwon ?? 0).toLocaleString()}만 / 월세 {(r.rent_manwon ?? 0).toLocaleString()}만
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleTenantVacant(idx)}
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                                isVac
                                  ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
                                  : 'bg-[#D1FAE5] border-[#A7F3D0] text-[#065F46]'
                              }`}
                            >
                              {isVac ? '공실' : '임차중'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveTenantRow(idx)}
                              className="px-1.5 py-0.5 text-[11px] font-bold text-[#B91C1C] hover:underline"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                  <div className="text-xs font-bold text-[#0F172A]">➕ 임대차 호실 직접 추가</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={rrFloor}
                      onChange={e => setRrFloor(e.target.value)}
                      placeholder="층, 예: 1F, 2F, B1"
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                    <input
                      type="text"
                      value={rrUnit}
                      onChange={e => setRrUnit(e.target.value)}
                      placeholder="호수, 예: 101호 (선택)"
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={rrTenant}
                      onChange={e => setRrTenant(e.target.value)}
                      placeholder="임차인·업종, 예: 메디컬의원"
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                    <input
                      type="text"
                      value={rrAreaPy}
                      onChange={e => setRrAreaPy(e.target.value)}
                      placeholder="전용면적(평)"
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={rrDeposit}
                      onChange={e => setRrDeposit(e.target.value)}
                      placeholder="보증금(만원)"
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                    <input
                      type="text"
                      value={rrRent}
                      onChange={e => setRrRent(e.target.value)}
                      placeholder="월임대료(만원)"
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-[#334155] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rrIsVacant}
                      onChange={e => setRrIsVacant(e.target.checked)}
                      className="rounded border-[#CBD5E1]"
                    />
                    공실 여부 체크박스
                  </label>
                  <button
                    type="button"
                    onClick={handleAddTenantRow}
                    className="w-full py-1.5 text-xs font-extrabold rounded-lg bg-[#0F172A] text-white hover:bg-[#1E293B]"
                  >
                    임대차 호실 추가
                  </button>
                </div>
              </div>
            )}

            {/* Market Comparables List Editor for 'comps' slide */}
            {dataKey === 'comps' && (
              <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
                <div className="text-xs font-extrabold text-[#0F172A]">
                  📊 비교 사례 행 관리 ({rawCompsList.length}건)
                </div>
                {rawCompsList.length > 0 && (
                  <div className="space-y-1.5">
                    {rawCompsList.map((c: any, i: number) => (
                      <div
                        key={i}
                        className="px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] flex items-center justify-between text-xs"
                      >
                        <div className="truncate pr-2">
                          <span className="font-bold text-[#0F172A]">{c.location || c.name || c.address}</span>
                          <span className="text-[#475569] ml-1.5">
                            ({c.price || `${c.price_eok || '-'}억`} · 평당 {c.land_price_per_pyeong_manwon?.toLocaleString?.() || c.land_unit_manwon || '-'}만)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveComp(i)}
                          className="text-[11px] font-bold text-[#B91C1C] hover:underline shrink-0"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                  <div className="text-xs font-bold text-[#0F172A]">➕ 인근 비교사례 직접 추가</div>
                  <input
                    type="text"
                    value={compName}
                    onChange={e => setCompName(e.target.value)}
                    placeholder="소재지 또는 건물명 (예: 당산동4가 근생빌딩)"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={compDate}
                      onChange={e => setCompDate(e.target.value)}
                      placeholder="거래시점 (예: 25.11)"
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                    <input
                      type="text"
                      value={compPrice}
                      onChange={e => setCompPrice(e.target.value)}
                      placeholder="거래가 (예: 88억)"
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                    <input
                      type="text"
                      value={compLandPy}
                      onChange={e => setCompLandPy(e.target.value)}
                      placeholder="대지면적(평) (예: 112)"
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                    <input
                      type="text"
                      value={compUnitManwon}
                      onChange={e => setCompUnitManwon(e.target.value)}
                      placeholder="토지평당가(만) (예: 7,850)"
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddComp}
                    className="w-full py-1.5 text-xs font-extrabold rounded-lg bg-[#0F172A] text-white hover:bg-[#1E293B]"
                  >
                    비교사례 행 추가
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="p-3.5 border-t border-[#CBD5E1] bg-[#F8FAFC] flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onResetSlide}
          disabled={saving}
          className="px-3 py-2.5 text-xs font-bold text-[#334155] hover:text-[#0F172A] bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] rounded-xl transition-colors"
          title="이 슬라이드의 텍스트·수치를 공부/초기 추출값으로 되돌립니다"
        >
          ↺ 초기값 복원
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex-1 py-2.5 px-4 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-extrabold rounded-xl text-xs transition-colors disabled:opacity-50 shadow-xs"
        >
          {saving ? '⏳ 저장 중...' : '💾 현재 슬라이드 저장'}
        </button>
      </div>
    </aside>
  );
}
