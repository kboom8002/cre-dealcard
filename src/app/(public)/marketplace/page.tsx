"use client";

import React, { useEffect, useState } from "react";

interface ListedSpace {
  id: string;
  building_id: string | null;
  floor: string | null;
  area_sqm: number | null;
  space_type: string;
  deposit: number | null;
  monthly_rent: number | null;
  maintenance_fee: number | null;
  area_signal: string;
  fit_summary: string;
  caution_summary: string;
  title: string;
  shortSummary: string;
  dealPoints: string[];
  cautionPoints: string[];
  hiddenInfoNotice: string[];
  kakaoText: string;
}

export default function MarketplaceSearchPortal() {
  const [spaces, setSpaces] = useState<ListedSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [spaceType, setSpaceType] = useState("all");
  const [region, setRegion] = useState("");
  const [depositMax, setDepositMax] = useState("");
  const [monthlyRentMax, setMonthlyRentMax] = useState("");
  const [areaMin, setAreaMin] = useState("");

  // Selected space detail modal
  const [selectedSpace, setSelectedSpace] = useState<ListedSpace | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [gateSuccess, setGateSuccess] = useState(false);

  useEffect(() => {
    fetchListedSpaces();
  }, [spaceType, depositMax, monthlyRentMax, areaMin]);

  const fetchListedSpaces = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (spaceType !== "all") params.append("space_type", spaceType);
      if (depositMax) params.append("deposit_max", depositMax);
      if (monthlyRentMax) params.append("monthly_rent_max", monthlyRentMax);
      if (areaMin) params.append("area_min", areaMin);
      if (region) params.append("region", region);

      const res = await fetch(`/api/marketplace/search?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "매물 검색 실패");
      setSpaces(json.data || []);
    } catch (err: any) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      fetchListedSpaces();
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactPhone) {
      alert("이름과 연락처를 입력해주세요.");
      return;
    }

    if (!selectedSpace || !selectedSpace.building_id) {
      alert("건물 정보를 확인할 수 없습니다.");
      return;
    }

    setGateSubmitting(true);
    try {
      const res = await fetch("/api/gate-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: selectedSpace.building_id,
          requestedLevel: "G1",
          requestedFields: ["area_signal", "fit_summary", "caution_summary"],
          reason: `성함/기업명: ${contactName}, 연락처: ${contactPhone}`,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "문의 접수 실패");
      }
      setGateSuccess(true);
      setContactName("");
      setContactPhone("");
    } catch (err: any) {
      alert(err.message || "문의 등록 실패");
    } finally {
      setGateSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans">
      {/* Premium Glassmorphic Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="space-y-0.5">
            <h1 className="text-base font-extrabold text-white tracking-tight flex items-center gap-1.5">
              <span>🏢</span> 이 공간, 딜 될까? <span className="text-[10px] bg-primary/20 text-primary font-bold px-1.5 py-0.5 rounded-full border border-primary/20">LEASING</span>
            </h1>
            <p className="text-[10px] text-slate-400">AI 기반 상업용 부동산 비공개 임대 마켓플레이스</p>
          </div>
          <a
            href="/login"
            className="text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg px-3 py-1.5 transition-colors"
          >
            중개인 로그인
          </a>
        </div>
      </header>

      {/* Main Body container */}
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Interactive Search & Filters Portal */}
        <div className="bg-[#121824] border border-slate-800/80 rounded-2xl p-4 space-y-4 shadow-md">
          {/* Keyword Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="권역 검색 (예: 성수, 강남, 홍대)..."
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              onKeyPress={handleSearchKeyPress}
              className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl pl-9 pr-12 py-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-all"
            />
            <span className="absolute left-3 top-3.5 text-xs text-slate-600">🔍</span>
            <button
              onClick={fetchListedSpaces}
              className="absolute right-2 top-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg px-3 py-1.5 text-[10px] transition-colors"
            >
              검색
            </button>
          </div>

          {/* Space Type Selector */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">공간 용도</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {[
                { value: "all", label: "전체" },
                { value: "office", label: "오피스" },
                { value: "retail", label: "상가/리테일" },
                { value: "f_and_b", label: "F&B/식음" },
                { value: "warehouse", label: "창고/물류" },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setSpaceType(t.value)}
                  type="button"
                  className={`shrink-0 rounded-lg px-3.5 py-2 text-[11px] font-semibold border transition-all ${
                    spaceType === t.value
                      ? "bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/30"
                      : "bg-[#0b0f19] border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Numerical Sliders */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">월세 상한선 (만원)</label>
              <input
                type="number"
                placeholder="상한선 없음"
                value={monthlyRentMax}
                onChange={(e) => setMonthlyRentMax(e.target.value)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">최소 전용면적 (평)</label>
              <input
                type="number"
                placeholder="면적 상관없음"
                value={areaMin ? Math.round(parseFloat(areaMin) / 3.3058).toString() : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setAreaMin(val ? (parseFloat(val) * 3.3058).toString() : "");
                }}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Results grid */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">공개 입점 제안 매물 ({spaces.length})</h2>

          {loading ? (
            <div className="flex justify-center py-16 text-primary">
              <div className="relative w-8 h-8">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-16 text-red-400 text-xs">⚠️ {error}</div>
          ) : spaces.length > 0 ? (
            <div className="space-y-3.5">
              {spaces.map((space) => {
                const spaceLabel = space.space_type === "office" ? "📁 오피스" : space.space_type === "f_and_b" ? "☕ F&B/식음" : "🛍️ 상가/리테일";
                return (
                  <div
                    key={space.id}
                    onClick={() => {
                      setSelectedSpace(space);
                      setGateSuccess(false);
                    }}
                    className="bg-[#131b2e] border border-slate-800 hover:border-primary/40 rounded-2xl p-4 transition-all cursor-pointer shadow-lg active:scale-[0.99]"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full font-medium">
                        {spaceLabel}
                      </span>
                      <span className="text-[10px] text-slate-500 font-sans">
                        {space.floor ? `${space.floor}` : "지상"}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white mt-2 leading-snug">{space.title}</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{space.shortSummary}</p>

                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-[11px]">
                      <div>
                        <span className="text-slate-600 font-medium">권역:</span> {space.area_signal}
                      </div>
                      <div>
                        <span className="text-slate-600 font-medium">전용 면적:</span>{" "}
                        {space.area_sqm ? `${Math.round(space.area_sqm / 3.3058)}평 (${space.area_sqm.toFixed(0)}㎡)` : "비공개"}
                      </div>
                      <div className="col-span-2 text-primary font-bold mt-1 text-xs">
                        보증금 {space.deposit ? `${space.deposit}만` : "비공개"} / 월차임 {space.monthly_rent ? `${space.monthly_rent}만` : "비공개"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#121824] border border-slate-800 rounded-2xl p-10 text-center text-slate-500 space-y-1">
              <p className="text-xs font-semibold">검색 조건에 맞는 공실 매물이 없습니다.</p>
              <p className="text-[10px]">필터를 조정하거나 다른 권역을 입력해보세요.</p>
            </div>
          )}
        </div>
      </div>

      {/* Selected Space Bottom Sheet / Modal */}
      {selectedSpace && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#0e1424] border border-slate-800 rounded-t-3xl max-h-[85vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Modal Header */}
            <div className="sticky top-0 bg-[#0e1424] border-b border-slate-800 px-5 py-4 flex justify-between items-center z-10">
              <div className="space-y-0.5">
                <span className="text-[9px] bg-primary/20 text-primary border border-primary/30 rounded-full px-2 py-0.5 font-bold uppercase tracking-wider">
                  Blind Space Details
                </span>
                <h3 className="text-sm font-bold text-white leading-snug">{selectedSpace.title}</h3>
              </div>
              <button
                onClick={() => setSelectedSpace(null)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-5">
              {/* Summary Card */}
              <div className="bg-[#131b2e] rounded-xl p-3 border border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">임대 예산 범위</p>
                  <p className="font-semibold text-white mt-0.5">
                    보증금 {selectedSpace.deposit ? `${selectedSpace.deposit}만` : "비공개"} / 월 {selectedSpace.monthly_rent ? `${selectedSpace.monthly_rent}만` : "비공개"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">임대 실평수</p>
                  <p className="font-semibold text-white mt-0.5">
                    {selectedSpace.area_sqm ? `${Math.round(selectedSpace.area_sqm / 3.3058)}평 (${selectedSpace.area_sqm}㎡)` : "비공개"}
                  </p>
                </div>
              </div>

              {/* Deal points */}
              <div className="space-y-1.5">
                <h4 className="text-[11px] text-success font-semibold tracking-wide uppercase">✨ 임대 장점 (USP)</h4>
                <ul className="space-y-1 text-xs text-slate-300">
                  {selectedSpace.dealPoints.map((point, index) => (
                    <li key={index} className="flex items-start gap-1.5 leading-relaxed">
                      <span className="text-success font-bold">✓</span> {point}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Caution points */}
              <div className="space-y-1.5">
                <h4 className="text-[11px] text-warning font-semibold tracking-wide uppercase">⚠️ 입점 확인사항</h4>
                <ul className="space-y-1 text-xs text-slate-300">
                  {selectedSpace.cautionPoints.map((point, index) => (
                    <li key={index} className="flex items-start gap-1.5 leading-relaxed">
                      <span className="text-warning font-bold">•</span> {point}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Safety Shield Guard Warning */}
              <div className="bg-[#121824] border border-slate-800 rounded-xl p-3.5 text-xs text-slate-400 space-y-2">
                <p className="font-semibold text-white flex items-center gap-1">🔒 비공개 처리된 정보</p>
                <p className="text-[10px] leading-relaxed">
                  임차인 영업권 보장 및 허위 매물 방지를 위하여 **정확한 건물 주소, 호실 번호, 임대인 신원, 현재 임차사 상호**는 비공개 처리되어 있습니다.
                </p>
              </div>

              {/* Contact Lead Form (Gate request) */}
              <div className="border-t border-slate-800/80 pt-4 space-y-3">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  📞 상세 자료 요청 & 현장 미팅 신청
                </h4>

                {gateSuccess ? (
                  <div className="bg-success/10 border border-success/20 text-success rounded-xl p-4 text-center space-y-1">
                    <p className="text-xs font-bold">✓ 상세 문의가 성공적으로 접수되었습니다!</p>
                    <p className="text-[10px] text-success/80">담당 중개사가 확인 후 입력하신 번호로 10분 내에 연락드립니다.</p>
                  </div>
                ) : (
                  <form onSubmit={handleContactSubmit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="성함 또는 기업명"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="bg-[#111726] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="연락처 (- 제외)"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="bg-[#111726] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={gateSubmitting}
                      className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-3 rounded-xl text-xs transition-colors"
                    >
                      {gateSubmitting ? "문의 전송 중..." : "🔒 담당 브로커에게 상세 주소/정보 요청 (무료)"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
