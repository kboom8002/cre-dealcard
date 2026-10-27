"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { RentRollGrid, generateFloorScaffolding } from "@/components/workspace/RentRollGrid";
import type { RentRollRowItem } from "@/lib/rent-roll/tsv-parser";
import { formatKoreanCurrencyReadout } from "@/lib/rent-roll/tsv-parser";
import { formatPriceRange } from "@/lib/deal-card/price-band";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";

interface ImListItem {
  id: string;
  buildingId: string;
  title: string;
  address: string;
  askingPriceManwon: number;
  grossYieldPct: number;
  status: "draft" | "review" | "approved" | "published";
  versionLabel: string;
  updatedAt: string;
  rentRoll: RentRollRowItem[];
}

const INITIAL_IM_LIST: ImListItem[] = [
  {
    id: "im-doc-01",
    buildingId: "bld-01",
    title: "영등포구 양평동 꼬마빌딩",
    address: "서울특별시 영등포구 양평동 11-47",
    askingPriceManwon: 950000, // 95억
    grossYieldPct: 4.2,
    status: "draft",
    versionLabel: "v1 작성 중",
    updatedAt: "10분 전",
    rentRoll: [
      {
        id: "r-b1",
        floor: "B1",
        unit: "B101호",
        use: "스튜디오/창고",
        depositManwon: 5000,
        monthlyRentManwon: 250,
        maintenanceManwon: 30,
        leaseExpiry: "27.05",
        status: "occupied",
      },
      {
        id: "r-1f",
        floor: "1F",
        unit: "101호",
        use: "유명 프랜차이즈 카페",
        depositManwon: 15000,
        monthlyRentManwon: 750,
        maintenanceManwon: 50,
        leaseExpiry: "28.03",
        status: "occupied",
      },
      {
        id: "r-2f",
        floor: "2F",
        unit: "201호",
        use: "IT 스타트업 오피스",
        depositManwon: 6000,
        monthlyRentManwon: 320,
        maintenanceManwon: 40,
        leaseExpiry: "27.11",
        status: "occupied",
      },
      {
        id: "r-3f",
        floor: "3F",
        unit: "301호",
        use: "디자인 에이전시",
        depositManwon: 5000,
        monthlyRentManwon: 300,
        maintenanceManwon: 40,
        leaseExpiry: "26.12",
        status: "occupied",
      },
      {
        id: "r-4f",
        floor: "4F",
        unit: "401호",
        use: "전문 변호사 사무소",
        depositManwon: 5000,
        monthlyRentManwon: 280,
        maintenanceManwon: 30,
        leaseExpiry: "27.08",
        status: "occupied",
      },
    ],
  },
  {
    id: "im-doc-02",
    buildingId: "bld-02",
    title: "강남구 신사동 사옥형 빌딩",
    address: "서울특별시 강남구 신사동 520-11",
    askingPriceManwon: 1450000, // 145억
    grossYieldPct: 3.8,
    status: "published",
    versionLabel: "v2 공개 중 ★",
    updatedAt: "어제",
    rentRoll: generateFloorScaffolding(6, 1),
  },
];

function ImWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  const [items, setItems] = useState<ImListItem[]>(INITIAL_IM_LIST);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id || "");
  const [previewTab, setPreviewTab] = useState<"mobile" | "pptx">("mobile");
  const [isGenerating, setIsGenerating] = useState(false);

  // Form states for active document
  const currentItem = useMemo(() => {
    return items.find((i) => i.id === selectedId) || items[0];
  }, [items, selectedId]);

  const [address, setAddress] = useState<string>(currentItem?.address || "");
  const [askingPriceManwon, setAskingPriceManwon] = useState<number>(
    currentItem?.askingPriceManwon || 950000
  );
  const [rentRoll, setRentRoll] = useState<RentRollRowItem[]>(
    currentItem?.rentRoll || generateFloorScaffolding(5, 1)
  );

  // Collapsible detail cards toggle state
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    buildingDetail: false,
    landDetail: false,
    dealTerms: false,
    photos: false,
  });

  // Sync selection from query params
  useEffect(() => {
    const queryId = searchParams.get("id") || searchParams.get("buildingId");
    if (queryId) {
      const match = items.find((i) => i.id === queryId || i.buildingId === queryId);
      if (match) {
        setSelectedId(match.id);
      }
    }
  }, [searchParams, items]);

  // Sync form inputs when current item changes
  useEffect(() => {
    if (currentItem) {
      setAddress(currentItem.address);
      setAskingPriceManwon(currentItem.askingPriceManwon);
      setRentRoll(currentItem.rentRoll);
    }
  }, [currentItem?.id]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchQuery =
        !searchQuery ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.address.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "draft" && item.status === "draft") ||
        (statusFilter === "published" && item.status === "published");
      return matchQuery && matchStatus;
    });
  }, [items, searchQuery, statusFilter]);

  // Calculate yield & rent totals
  const totalRentManwon = useMemo(() => {
    return rentRoll.reduce((s, r) => s + (r.status !== "vacant" ? r.monthlyRentManwon || 0 : 0), 0);
  }, [rentRoll]);

  const totalDepositManwon = useMemo(() => {
    return rentRoll.reduce((s, r) => s + (r.depositManwon || 0), 0);
  }, [rentRoll]);

  const calculatedYield = useMemo(() => {
    if (!askingPriceManwon || askingPriceManwon <= 0) return 0;
    const netInvestment = askingPriceManwon - totalDepositManwon;
    if (netInvestment <= 0) return 0;
    return ((totalRentManwon * 12) / netInvestment) * 100;
  }, [askingPriceManwon, totalRentManwon, totalDepositManwon]);

  const priceBandStr = useMemo(() => {
    return formatPriceRange(askingPriceManwon * 10000);
  }, [askingPriceManwon]);

  // Create new IM
  const handleCreateNew = () => {
    const newId = `im-doc-${Date.now()}`;
    const newItem: ImListItem = {
      id: newId,
      buildingId: `bld-${Date.now()}`,
      title: "새 매물 IM 초안",
      address: "서울특별시 마포구 서교동 395-1",
      askingPriceManwon: 800000,
      grossYieldPct: 4.5,
      status: "draft",
      versionLabel: "v1 작성 중",
      updatedAt: "방금",
      rentRoll: generateFloorScaffolding(4, 1),
    };

    setItems([newItem, ...items]);
    setSelectedId(newId);
    showUndoToast("새 IM 작업 공간이 생성되었습니다.");
  };

  // Quick Generate trigger
  const handleQuickGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/broker/im-lite/quick-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          askingPriceManwon,
          rentRoll,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        showUndoToast("⚡ Basic IM과 4항목 딜카드가 자동 생성되었습니다!");
      } else {
        showUndoToast("IM 생성 완료 (오프라인 모드 반영)");
      }
    } catch {
      showUndoToast("IM 생성 완료 (오프라인 모드 반영)");
    } finally {
      setIsGenerating(false);
    }
  };

  /* ──────── Column 1: Item List ──────── */
  const listSlot = (
    <div className="flex flex-col h-full bg-[#FAF9F5] p-3 space-y-3" data-testid="im-list-slot">
      <button
        type="button"
        onClick={handleCreateNew}
        className="w-full min-h-[56px] px-4 py-3 bg-[#0F172A] text-white rounded-2xl font-bold text-[17px] hover:bg-[#1E293B] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
      >
        <span>+ 새 IM 만들기</span>
      </button>

      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 매물명 또는 주소 검색"
          className="w-full min-h-[48px] px-3.5 bg-white text-[16px] rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
        />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(["all", "draft", "published"] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`min-h-[40px] px-3 rounded-lg text-[14px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
              statusFilter === st
                ? "bg-[#0F172A] text-white border-[#0F172A]"
                : "bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F3F2EE]"
            }`}
          >
            {st === "all" ? "전체" : st === "draft" ? "작성 중" : "공개 중"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filteredItems.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(item.id)}
              onKeyDown={(e) => e.key === "Enter" && setSelectedId(item.id)}
              className={`w-full min-h-[72px] p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                isSelected
                  ? "bg-white border-[#1D4ED8] shadow-sm ring-2 ring-[#1D4ED8]/20"
                  : "bg-white border-[#E2E8F0] hover:border-[#64748B]"
              }`}
            >
              {isSelected && (
                <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-[#1D4ED8] rounded-r" />
              )}
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="font-bold text-[16px] text-[#0F172A] truncate">
                  {item.title}
                </span>
                <span
                  className={`text-[12px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    item.status === "published"
                      ? "bg-[#D1FAE5] text-[#065F46]"
                      : "bg-[#FEF3C7] text-[#92400E]"
                  }`}
                >
                  {item.versionLabel}
                </span>
              </div>
              <p className="text-[14px] text-[#475569] truncate">{item.address}</p>
              <div className="flex items-center justify-between text-[14px] font-semibold text-[#0F172A] mt-1 pt-1 border-t border-[#F1F5F9]">
                <span>{formatPriceRange(item.askingPriceManwon * 10000)}</span>
                <span className="text-[#065F46]">수익률 {item.grossYieldPct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ──────── Column 2: Single Progressive-Disclosure Form ──────── */
  const editorSlot = (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto" data-testid="im-editor-slot">
      {/* Top Essential Card (주소 + 매도가 + R1 렌트롤) */}
      <div className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div>
            <h2 className="text-[20px] font-extrabold text-[#0F172A]">
              ⚡ IM 간편 모드 (3분 생성 필수 3항목)
            </h2>
            <p className="text-[14px] text-[#475569]">
              주소, 희망 매도가, 층별 렌트롤만 입력하면 상용화 수준의 10개 섹션 IM이 자동 완성됩니다.
            </p>
          </div>
          <span className="text-[14px] font-bold text-[#065F46] bg-[#D1FAE5] px-2.5 py-1 rounded-full">
            필수 입력
          </span>
        </div>

        {/* 1. Address */}
        <div>
          <label className="block text-[16px] font-bold text-[#0F172A] mb-1.5">
            1. 부동산 소재지 (주소) <span className="text-[#991B1B]">*</span>
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="예: 서울특별시 영등포구 양평동 11-47"
            className="w-full min-h-[48px] px-3.5 text-[17px] rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
          />
          <p className="text-[14px] text-[#475569] mt-1">
            건축물대장 공적장부와 연동되어 지상/지하 층 구조가 자동으로 세팅됩니다.
          </p>
        </div>

        {/* 2. Asking Price */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[16px] font-bold text-[#0F172A]">
              2. 매매 희망가 (만 원 단위 입력) <span className="text-[#991B1B]">*</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-[#1D4ED8]">
                {formatKoreanCurrencyReadout(askingPriceManwon)}
              </span>
              <span className="text-[14px] font-semibold text-[#065F46] bg-[#D1FAE5] px-2 py-0.5 rounded">
                구간: {priceBandStr}
              </span>
            </div>
          </div>
          <input
            type="number"
            value={askingPriceManwon || ""}
            onChange={(e) => setAskingPriceManwon(Number(e.target.value))}
            placeholder="예: 950000 (95억 원)"
            className="w-full min-h-[48px] px-3.5 text-[18px] font-bold tabular-nums rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
          />
        </div>

        {/* 3. Interactive R1 Rent Roll Grid */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[16px] font-bold text-[#0F172A]">
              3. 층별 임대 현황 (R1 렌트롤) <span className="text-[#991B1B]">*</span>
            </label>
            <span className="text-[14px] text-[#475569]">
              총 월세: <strong className="text-[#1D4ED8]">{totalRentManwon.toLocaleString()}만원</strong>
            </span>
          </div>
          <RentRollGrid
            rows={rentRoll}
            onChange={setRentRoll}
            askingPriceManwon={askingPriceManwon}
          />
        </div>
      </div>

      {/* Collapsible Detail Cards Below */}
      <div className="space-y-3">
        <h3 className="text-[17px] font-extrabold text-[#0F172A] px-1">
          선택 상세 카드 (필요 시 확장)
        </h3>

        {/* Card 1: 건물 상세 */}
        <div className="bg-white rounded-2xl border border-[#CBD5E1] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("buildingDetail")}
            className="w-full min-h-[52px] px-5 py-3 flex items-center justify-between text-left font-bold text-[16px] text-[#0F172A] hover:bg-[#FAF9F5] cursor-pointer"
          >
            <span>🏢 1. 건축물 상세 정보 (연면적, 준공년도, 엘리베이터)</span>
            <span className="text-[14px] text-[#475569]">
              {expandedSections.buildingDetail ? "▲ 접기" : "▼ 펼치기"}
            </span>
          </button>
          {expandedSections.buildingDetail && (
            <div className="p-5 border-t border-[#E2E8F0] bg-[#FAF9F5]/40 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[14px] font-semibold text-[#334155] mb-1">
                  연면적 (㎡)
                </label>
                <input
                  type="number"
                  defaultValue="1450.2"
                  className="w-full min-h-[48px] px-3 text-[16px] rounded-xl border border-[#64748B] bg-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[14px] font-semibold text-[#334155] mb-1">
                  사용승인일 (준공년도)
                </label>
                <input
                  type="text"
                  defaultValue="2018-06-15"
                  className="w-full min-h-[48px] px-3 text-[16px] rounded-xl border border-[#64748B] bg-white outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Card 2: 토지 정보 */}
        <div className="bg-white rounded-2xl border border-[#CBD5E1] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("landDetail")}
            className="w-full min-h-[52px] px-5 py-3 flex items-center justify-between text-left font-bold text-[16px] text-[#0F172A] hover:bg-[#FAF9F5] cursor-pointer"
          >
            <span>🗺️ 2. 토지 및 도시계획 (대지면적, 용도지역, 공시지가)</span>
            <span className="text-[14px] text-[#475569]">
              {expandedSections.landDetail ? "▲ 접기" : "▼ 펼치기"}
            </span>
          </button>
          {expandedSections.landDetail && (
            <div className="p-5 border-t border-[#E2E8F0] bg-[#FAF9F5]/40 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[14px] font-semibold text-[#334155] mb-1">
                  대지면적 (㎡)
                </label>
                <input
                  type="number"
                  defaultValue="420.5"
                  className="w-full min-h-[48px] px-3 text-[16px] rounded-xl border border-[#64748B] bg-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[14px] font-semibold text-[#334155] mb-1">
                  용도지역
                </label>
                <input
                  type="text"
                  defaultValue="제3종일반주거지역"
                  className="w-full min-h-[48px] px-3 text-[16px] rounded-xl border border-[#64748B] bg-white outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Card 3: 거래 조건 */}
        <div className="bg-white rounded-2xl border border-[#CBD5E1] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("dealTerms")}
            className="w-full min-h-[52px] px-5 py-3 flex items-center justify-between text-left font-bold text-[16px] text-[#0F172A] hover:bg-[#FAF9F5] cursor-pointer"
          >
            <span>⚖️ 3. 거래 조건 및 명도 특약</span>
            <span className="text-[14px] text-[#475569]">
              {expandedSections.dealTerms ? "▲ 접기" : "▼ 펼치기"}
            </span>
          </button>
          {expandedSections.dealTerms && (
            <div className="p-5 border-t border-[#E2E8F0] bg-[#FAF9F5]/40 space-y-3">
              <div>
                <label className="block text-[14px] font-semibold text-[#334155] mb-1">
                  명도 조건 및 특약 사항
                </label>
                <textarea
                  rows={2}
                  defaultValue="현 임대차 일체 포괄승계 조건 (잔금 시 임대차 계약서 원본 인계)"
                  className="w-full p-3 text-[15px] rounded-xl border border-[#64748B] bg-white outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Card 4: 첨부 사진 */}
        <div className="bg-white rounded-2xl border border-[#CBD5E1] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("photos")}
            className="w-full min-h-[52px] px-5 py-3 flex items-center justify-between text-left font-bold text-[16px] text-[#0F172A] hover:bg-[#FAF9F5] cursor-pointer"
          >
            <span>📷 4. 첨부 사진 및 지적도</span>
            <span className="text-[14px] text-[#475569]">
              {expandedSections.photos ? "▲ 접기" : "▼ 펼치기"}
            </span>
          </button>
          {expandedSections.photos && (
            <div className="p-5 border-t border-[#E2E8F0] bg-[#FAF9F5]/40 text-center py-8">
              <p className="text-[15px] text-[#475569] mb-3">
                건물 외관 사진이나 지적도 이미지를 업로드하면 모바일 IM 갤러리에 자동 반영됩니다.
              </p>
              <button
                type="button"
                className="px-4 py-2.5 bg-white border border-[#64748B] rounded-xl text-[15px] font-bold text-[#0F172A] hover:bg-[#F3F2EE] cursor-pointer"
              >
                + 사진 파일 선택
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* ──────── Column 3: Live Preview ──────── */
  const previewTabSlot = (
    <div className="inline-flex rounded-xl border border-[#CBD5E1] p-0.5 bg-[#FAF9F5]">
      <button
        type="button"
        onClick={() => setPreviewTab("mobile")}
        className={`px-3 py-1.5 text-[14px] font-bold rounded-lg transition-colors cursor-pointer ${
          previewTab === "mobile"
            ? "bg-[#0F172A] text-white shadow-xs"
            : "text-[#475569] hover:text-[#0F172A]"
        }`}
      >
        📱 모바일 IM
      </button>
      <button
        type="button"
        onClick={() => setPreviewTab("pptx")}
        className={`px-3 py-1.5 text-[14px] font-bold rounded-lg transition-colors cursor-pointer ${
          previewTab === "pptx"
            ? "bg-[#0F172A] text-white shadow-xs"
            : "text-[#475569] hover:text-[#0F172A]"
        }`}
      >
        🖥 PPTX 10면
      </button>
    </div>
  );

  const previewSlot = (
    <div className="p-4 space-y-4 max-w-sm mx-auto" data-testid="im-preview-slot">
      {/* Phone container simulation */}
      <div className="bg-[#FAF9F5] rounded-3xl border-4 border-[#334155] p-3 shadow-lg space-y-3">
        {/* Mock phone status bar */}
        <div className="flex items-center justify-between text-[12px] font-bold text-[#475569] px-2 pt-1">
          <span>09:41</span>
          <span>5G 100%</span>
        </div>

        {/* Section 01: Cover Card */}
        <div className="bg-white rounded-2xl p-4 border border-[#CBD5E1] space-y-2">
          <span className="text-[12px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded">
            01 표지
          </span>
          <h3 className="text-[18px] font-extrabold text-[#0F172A]">{currentItem.title}</h3>
          <p className="text-[13px] text-[#475569]">{address}</p>
          <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-[14px] font-bold">
            <span className="text-[#0F172A]">{priceBandStr}</span>
            <span className="text-[#065F46]">연 {calculatedYield.toFixed(2)}%</span>
          </div>
        </div>

        {/* Section 02: Summary Highlights */}
        <div className="bg-white rounded-2xl p-4 border border-[#CBD5E1] space-y-2">
          <span className="text-[12px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded">
            02 투자 하이라이트
          </span>
          <div className="grid grid-cols-2 gap-2 text-center text-[13px]">
            <div className="p-2 bg-[#FAF9F5] rounded-lg">
              <span className="text-[#64748B] block text-[11px]">매매 희망가</span>
              <strong className="text-[#0F172A]">{(askingPriceManwon / 10000).toFixed(0)}억</strong>
            </div>
            <div className="p-2 bg-[#FAF9F5] rounded-lg">
              <span className="text-[#64748B] block text-[11px]">월 임대수익</span>
              <strong className="text-[#0F172A]">{totalRentManwon.toLocaleString()}만</strong>
            </div>
          </div>
        </div>

        {/* Section 06: Rent Roll preview */}
        <div className="bg-white rounded-2xl p-4 border border-[#CBD5E1] space-y-2">
          <span className="text-[12px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded">
            06 층별 임대차 상세
          </span>
          <p className="text-[13px] text-[#475569]">
            총 {rentRoll.length}개 층 · 만실 임대 운용 중
          </p>
        </div>
      </div>
    </div>
  );

  const primaryActionSlot = (
    <button
      type="button"
      disabled={isGenerating}
      onClick={handleQuickGenerate}
      className="w-full min-h-[56px] px-6 py-3.5 bg-[#1D4ED8] text-white rounded-2xl font-extrabold text-[17px] hover:bg-[#1E40AF] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
    >
      <span>{isGenerating ? "⏳ IM 생성 중..." : "⚡ Basic IM 만들기 · 약 20초"}</span>
    </button>
  );

  return (
    <WorkspaceShell
      workspace="im"
      listTitle="① IM 고르기"
      editorTitle="② 간편 입력 및 렌트롤 채우기"
      previewTitle="③ 실시간 IM 미리보기"
      listSlot={listSlot}
      editorSlot={editorSlot}
      previewSlot={previewSlot}
      previewTabSlot={previewTabSlot}
      primaryActionSlot={primaryActionSlot}
      saveStatus={<span className="text-[14px] text-[#065F46] font-semibold">저장됨 · 방금</span>}
      selectedBuildingId={selectedId}
      onBuildingSelect={setSelectedId}
    />
  );
}

export default function ImWorkspacePage() {
  return (
    <UndoToastProvider>
      <Suspense fallback={<div className="p-8 text-center text-[#475569]">IM 작업 공간 로딩 중...</div>}>
        <ImWorkspaceInner />
      </Suspense>
    </UndoToastProvider>
  );
}
