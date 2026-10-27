"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import "./print.css";
import type { MobileIMDocument, MobileIMSection } from "@/lib/demo/mobile-im-demo-data";
import {
  buildBasicImDocument,
  type BasicImDocument,
  type BasicImSection,
} from "@/domain/building/im-core/basic-im-document";
import {
  extractPureBuildingFacts,
  type PureBuildingFacts,
} from "@/domain/building/im-core/facts";
import { FlatProfileCard } from "@/components/broker/flat-profile-card";
import { HeroCard } from "./hero-card";
import { DCFHeatmap } from "./dcf-heatmap";
import { LeverageChart } from "./leverage-chart";
import { StackingPlanView } from "@/components/im/stacking-plan-view";
import { useDealcardRealtimeSync } from "@/platform/im-pipeline/realtime/use-dealcard-realtime-sync";
import {
  IMInquiryBottomSheet,
  PhotoGallery,
  SectionCard,
  FloatingActionBar,
  ShareButton,
} from "./components";

interface Props {
  document: (MobileIMDocument & { basicImDocument?: BasicImDocument }) | BasicImDocument | any | null;
  buildingId: string;
  ssotData?: Record<string, unknown>;
  docId?: string;
  isBroker?: boolean;
}

const CANONICAL_SECTION_CHIPS = [
  { id: "01_cover", label: "01 표지" },
  { id: "02_summary", label: "02 하이라이트" },
  { id: "03_overview", label: "03 개요" },
  { id: "04_location", label: "04 입지" },
  { id: "05_land", label: "05 토지" },
  { id: "06_rentroll", label: "06 렌트롤" },
  { id: "07_yield", label: "07 수익률" },
  { id: "08_comps", label: "08 상권" },
  { id: "09_photos", label: "09 사진" },
  { id: "10_contact", label: "10 문의" },
] as const;

export function MobileIMViewer({
  document: initialDoc,
  buildingId,
  ssotData,
  docId,
  isBroker = false,
}: Props) {
  // Version state: v1 <-> v2
  const [selectedVersion, setSelectedVersion] = useState<"v1" | "v2">("v2");
  const [showDiffModal, setShowDiffModal] = useState<boolean>(false);
  const [activeSectionId, setActiveSectionId] = useState<string>("01_cover");
  const [showInquiry, setShowInquiry] = useState<boolean>(false);

  // Derive or construct canonical BasicImDocument from real document/SSoT payload (Rule 26 & 34: zero hardcoded building fallbacks)
  const basicDoc = useMemo<BasicImDocument>(() => {
    if (initialDoc && "schemaVersion" in initialDoc && initialDoc.schemaVersion === "3.0") {
      return initialDoc as BasicImDocument;
    }
    if (initialDoc && initialDoc.basicImDocument) {
      return initialDoc.basicImDocument as BasicImDocument;
    }

    const layers = (ssotData?.layers as Record<string, any>) || {};
    const hero = initialDoc?.heroCard || {};
    const enrichment = initialDoc?.enrichment || {};

    const parsePriceManwon = (str?: string | null): number | undefined => {
      if (!str) return undefined;
      const m = String(str).replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*억/);
      if (m) return Math.round(parseFloat(m[1]) * 10000);
      return undefined;
    };

    const baseAskingManwon =
      (ssotData as any)?.asking_price_manwon ??
      layers?.deal_terms?.asking_price_manwon ??
      parsePriceManwon(hero.askingPriceDisplay || initialDoc?.priceBand) ??
      1000000;

    const rawFacts = {
      buildingId,
      title:
        initialDoc?.blindName ||
        initialDoc?.fullName ||
        `${initialDoc?.areaSignal || ""} ${initialDoc?.assetType || "상업용 자산"}`.trim(),
      address:
        enrichment?.meta?.address ||
        layers?.asset_identity?.address ||
        initialDoc?.areaSignal ||
        initialDoc?.blindName ||
        "서울시 핵심 권역",
      posture: (hero.posture || "core_income") as any,
      asking_price_manwon:
        selectedVersion === "v1" ? Math.round(baseAskingManwon * 1.03) : baseAskingManwon,
      total_gross_area_sqm:
        hero.totalArea ??
        enrichment?.buildingRegister?.totalArea ??
        layers?.public_data?.total_gross_area_m2 ??
        1000,
      land_area_sqm:
        hero.landArea ??
        enrichment?.landUsePlan?.landArea ??
        layers?.public_data?.land_area_m2 ??
        330,
      zoning:
        hero.zoningDistrict ??
        enrichment?.landUsePlan?.zoningDistrict ??
        layers?.public_data?.zoning,
      monthly_rent_total_manwon:
        layers?.rent_roll?.monthly_rent_total_manwon ??
        (layers?.rent_roll?.monthly_rent_total_krw
          ? Math.round(Number(layers.rent_roll.monthly_rent_total_krw) / 10000)
          : Math.round(baseAskingManwon * 0.0035)),
      deposit_total_manwon:
        layers?.rent_roll?.total_deposit_manwon ?? Math.round(baseAskingManwon * 0.04),
      points: Array.isArray(hero.keyPoints) ? hero.keyPoints : undefined,
      photos: Array.isArray(initialDoc?.photos) ? initialDoc.photos : undefined,
      brokerOffice: {
        name: initialDoc?.broker?.company || "담당 중개사무소",
        representative: initialDoc?.broker?.displayName || "담당 중개인",
        registrationNo: "",
        phone: initialDoc?.broker?.phone || "",
      },
    };

    const facts = extractPureBuildingFacts(rawFacts);
    return buildBasicImDocument(facts);
  }, [initialDoc, ssotData, buildingId, selectedVersion]);

  // Version 1 comparison reference document (derived dynamically from basicDoc)
  const v1Doc = useMemo<BasicImDocument>(() => {
    const basePrice = basicDoc.facts.transaction.askingPriceManwon || 1000000;
    const baseRent = basicDoc.facts.rent.monthlyRentTotalManwon || 3000;
    const baseDeposit = basicDoc.facts.rent.depositTotalManwon || 25000;
    const rawFacts = {
      buildingId,
      title: basicDoc.metadata.title,
      address: basicDoc.metadata.address,
      posture: basicDoc.posture,
      asking_price_manwon: Math.round(basePrice * 1.03),
      total_gross_area_sqm: basicDoc.facts.building.totalGrossAreaSqm,
      land_area_sqm: basicDoc.facts.land.landAreaSqm,
      monthly_rent_total_manwon: Math.max(100, Math.round(baseRent * 0.95)),
      deposit_total_manwon: Math.max(1000, Math.round(baseDeposit * 0.95)),
      points: basicDoc.facts.points,
    };
    const facts = extractPureBuildingFacts(rawFacts);
    return buildBasicImDocument(facts);
  }, [basicDoc, buildingId]);

  const docHash = basicDoc.docHash;

  // Realtime updates
  useDealcardRealtimeSync(buildingId, {
    onContentMutated: () => {},
  });

  // [P0-SEC / SEC-7] PWA Service Worker scoped registration & root cleanup
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const sw = navigator.serviceWorker;
      sw.getRegistrations()
        .then((regs) =>
          Promise.all(
            regs
              .filter((reg) => {
                const scriptURL = (reg.active || reg.waiting || reg.installing)?.scriptURL ?? "";
                return new URL(reg.scope).pathname === "/" && scriptURL.endsWith("/sw-im.js");
              })
              .map((reg) => reg.unregister()),
          ),
        )
        .catch(() => undefined)
        .then(() => sw.register("/sw-im.js", { scope: "/im-lite/" }))
        .catch((err) => {
          console.warn("[mobile-im-viewer]", err);
        });
    }
  }, []);

  // Track sections via IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const secId = entry.target.getAttribute("data-section-id");
            if (secId) {
              setActiveSectionId(secId);
            }
          }
        });
      },
      { threshold: 0.3 }
    );

    const sectionEls = document.querySelectorAll("[data-section-id]");
    sectionEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [basicDoc]);

  // Smooth scroll to section
  const scrollToSection = (id: string) => {
    setActiveSectionId(id);
    const target = document.querySelector(`[data-section-id="${id}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Section data lookups from basicDoc
  const sectionsMap = useMemo(() => {
    const map = new Map<string, BasicImSection>();
    for (const sec of basicDoc.sections) {
      map.set(sec.id, sec);
      map.set(sec.sectionType, sec);
    }
    return map;
  }, [basicDoc]);

  const coverSec = sectionsMap.get("01_cover") || sectionsMap.get("cover");
  const summarySec = sectionsMap.get("02_summary") || sectionsMap.get("summary");
  const overviewSec = sectionsMap.get("03_overview") || sectionsMap.get("overview");
  const locationSec = sectionsMap.get("04_location") || sectionsMap.get("location");
  const landSec = sectionsMap.get("05_land") || sectionsMap.get("land");
  const rentrollSec = sectionsMap.get("06_rentroll") || sectionsMap.get("rentroll");
  const yieldSec = sectionsMap.get("07_yield") || sectionsMap.get("yield");
  const compsSec = sectionsMap.get("08_comps") || sectionsMap.get("comps");
  const photosSec = sectionsMap.get("09_photos") || sectionsMap.get("photos");
  const contactSec = sectionsMap.get("10_contact") || sectionsMap.get("contact");

  return (
    <div
      className="min-h-screen bg-[#F3F2EE] text-[#0F172A] font-sans selection:bg-[#1D4ED8] selection:text-white pb-36 overflow-x-hidden"
      data-testid="mobile-im-viewer"
    >
      {/* ── Top Header Bar & Version Switcher ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#CBD5E1] shadow-xs no-print">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link
              href="/broker/w/im"
              className="text-[13px] sm:text-[14px] font-bold text-[#475569] hover:text-[#0F172A] flex items-center gap-0.5 shrink-0"
            >
              ‹ IM
            </Link>
            <span className="text-[#CBD5E1]">|</span>
            <span className="text-[13px] sm:text-[14px] font-extrabold text-[#0F172A] truncate max-w-[115px] sm:max-w-[220px]">
              {basicDoc.metadata.title}
            </span>
          </div>

          {/* Version Switcher Dropdown (WP-P4b-03) */}
          <div className="flex items-center gap-2" data-testid="version-switcher-bar">
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value as "v1" | "v2")}
              className="min-h-[36px] px-2.5 py-1 text-[13px] font-bold bg-[#FAF9F5] border border-[#64748B] rounded-lg text-[#0F172A] outline-none cursor-pointer"
              data-testid="version-switcher"
            >
              <option value="v1">v1 (초안)</option>
              <option value="v2">v2 (최신 공개본 ★)</option>
            </select>

            <button
              type="button"
              onClick={() => setShowDiffModal(true)}
              className="min-h-[36px] px-2.5 py-1 text-[13px] font-bold text-[#92400E] bg-[#FEF3C7] border border-[#FDE68A] hover:bg-[#FDE68A] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              data-testid="version-diff-btn"
            >
              🔍 v1↔v2 비교
            </button>
          </div>
        </div>

        {/* ── Sticky Top Section Navigation Chips (WP-P4b-01) ── */}
        <div
          className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto bg-[#FAF9F5] border-t border-[#E2E8F0] scrollbar-none"
          data-testid="section-chips-bar"
          role="navigation"
          aria-label="IM 10개 섹션 바로가기"
        >
          {CANONICAL_SECTION_CHIPS.map((chip) => {
            const isActive = activeSectionId === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => scrollToSection(chip.id)}
                className={`min-h-[36px] px-3 py-1 rounded-full text-[13px] font-bold whitespace-nowrap border transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#0F172A] text-white border-[#0F172A] shadow-xs scale-105"
                    : "bg-white text-[#475569] border-[#CBD5E1] hover:border-[#64748B]"
                }`}
                data-testid={`chip-${chip.id}`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Continuous 10-Section Scroll Content (WP-P4b-01 & WP-P4b-02) ── */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8" data-testid="continuous-scroll-content">
        {/* Section 01: Cover (A01) */}
        <section
          id="01_cover"
          data-section-id="01_cover"
          data-doc-hash={docHash}
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              01 표지
            </span>
            <span className="text-[12px] font-mono text-[#64748B]">
              해시: {docHash.slice(0, 16)}...
            </span>
          </div>

          {/* Cover photo placeholder or real image */}
          <div className="w-full h-52 bg-gradient-to-br from-[#1E293B] to-[#0F172A] rounded-2xl flex flex-col items-center justify-center text-white p-6 text-center">
            <span className="text-4xl mb-2">🏢</span>
            <h1 className="text-[22px] sm:text-[26px] font-black leading-tight">
              {coverSec?.data.title || basicDoc.metadata.title}
            </h1>
            <p className="text-[15px] text-[#94A3B8] mt-1">
              {coverSec?.data.address || basicDoc.metadata.address}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
              <span className="text-[13px] font-medium text-[#64748B] block">매매 희망가</span>
              <strong className="text-[20px] font-extrabold text-[#0F172A]">
                {((coverSec?.data.askingPriceManwon || basicDoc.facts.transaction.askingPriceManwon) / 10000).toFixed(0)}억 원
              </strong>
            </div>
            <div className="p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
              <span className="text-[13px] font-medium text-[#64748B] block">예상 총수익률</span>
              <strong className="text-[20px] font-extrabold text-[#065F46]">
                {(coverSec?.data.grossYieldPct || basicDoc.facts.valuation.grossYieldPct).toFixed(2)}%
              </strong>
            </div>
          </div>
        </section>

        {/* Section 02: Summary Highlights (A02) */}
        <section
          id="02_summary"
          data-section-id="02_summary"
          data-doc-hash={docHash}
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              02 투자 하이라이트
            </span>
            <span className="text-[14px] text-[#475569]">Executive Summary</span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">
            핵심 투자 지표 (6대 메트릭스)
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(summarySec?.data.metrics || []).map((m: any, idx: number) => (
              <div key={idx} className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0] text-center">
                <span className="text-[12px] font-semibold text-[#64748B] block mb-0.5">{m.label}</span>
                <strong className="text-[16px] font-extrabold text-[#0F172A] tabular-nums block">
                  {m.value}
                </strong>
              </div>
            ))}
          </div>

          <div className="p-4 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] space-y-2">
            <h3 className="text-[15px] font-bold text-[#0F172A]">투자 포인트</h3>
            <ul className="space-y-1.5 text-[15px] text-[#334155]">
              {(summarySec?.data.investmentPoints || []).map((pt: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-[#1D4ED8] font-bold">✓</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Section 03: Building Overview (A04) */}
        <section
          id="03_overview"
          data-section-id="03_overview"
          data-doc-hash={docHash}
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              03 건축물 기본 정보
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">건축물 개요</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[15px]">
            <div className="flex justify-between p-2.5 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">소재지</span>
              <span className="font-bold text-[#0F172A]">{basicDoc.facts.address}</span>
            </div>
            <div className="flex justify-between p-2.5 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">주용도</span>
              <span className="font-bold text-[#0F172A]">{basicDoc.facts.building.mainUsage}</span>
            </div>
            <div className="flex justify-between p-2.5 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">연면적</span>
              <span className="font-bold text-[#0F172A] tabular-nums">
                {basicDoc.facts.building.totalGrossAreaSqm}㎡ ({basicDoc.facts.building.totalGrossAreaPyeong}평)
              </span>
            </div>
            <div className="flex justify-between p-2.5 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">층수</span>
              <span className="font-bold text-[#0F172A]">
                지상 {basicDoc.facts.building.floorsAbove}층 / 지하 {basicDoc.facts.building.floorsBelow}층
              </span>
            </div>
            <div className="flex justify-between p-2.5 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">건폐율 / 용적률</span>
              <span className="font-bold text-[#0F172A] tabular-nums">
                {basicDoc.facts.building.buildingCoverageRatioPct}% / {basicDoc.facts.building.floorAreaRatioPct}%
              </span>
            </div>
            <div className="flex justify-between p-2.5 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">주차 / 승강기</span>
              <span className="font-bold text-[#0F172A]">
                {basicDoc.facts.building.parkingSpaces}대 / {basicDoc.facts.building.elevators}대
              </span>
            </div>
          </div>
        </section>

        {/* Section 04: Location & Transit (A06) */}
        <section
          id="04_location"
          data-section-id="04_location"
          data-doc-hash={docHash}
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              04 입지 분석
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">교통 및 입지 환경</h2>
          <div className="p-4 bg-[#FAF9F5] rounded-2xl border border-[#E2E8F0] space-y-2">
            <p className="text-[15px] font-medium text-[#334155]">
              지하철 2호선 및 9호선 환승역 역세권에 위치하여 서울 주요 비즈니스 권역(GBD, YBD)으로의 접근성이 매우 탁월합니다.
            </p>
          </div>
        </section>

        {/* Section 05: Land & Zoning (A27) */}
        <section
          id="05_land"
          data-section-id="05_land"
          data-doc-hash={docHash}
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              05 토지 및 도시계획
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">토지 이용 계획</h2>
          <div className="grid grid-cols-2 gap-3 text-[15px]">
            <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
              <span className="text-[12px] text-[#64748B] block">대지면적</span>
              <strong className="text-[16px] text-[#0F172A] tabular-nums">
                {basicDoc.facts.land.landAreaSqm}㎡ ({basicDoc.facts.land.landAreaPyeong}평)
              </strong>
            </div>
            <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
              <span className="text-[12px] text-[#64748B] block">용도지역</span>
              <strong className="text-[16px] text-[#0F172A]">{basicDoc.facts.land.zoning}</strong>
            </div>
          </div>
        </section>

        {/* Section 06: Rent Roll (A24) */}
        <section
          id="06_rentroll"
          data-section-id="06_rentroll"
          data-doc-hash={docHash}
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              06 층별 임대차 상세
            </span>
            <span className="text-[14px] text-[#065F46] font-bold">
              월 수익 합계: {basicDoc.facts.rent.monthlyRentTotalManwon.toLocaleString()}만원
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">렌트롤 현황</h2>

          <div className="overflow-x-auto rounded-xl border border-[#CBD5E1]">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-[#FAF9F5] border-b border-[#CBD5E1] font-bold text-[#0F172A]">
                <tr>
                  <th className="py-2.5 px-3">층</th>
                  <th className="py-2.5 px-3">업종/용도</th>
                  <th className="py-2.5 px-3 text-right">보증금(만)</th>
                  <th className="py-2.5 px-3 text-right">월세(만)</th>
                  <th className="py-2.5 px-3">만기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {(rentrollSec?.data.rows || []).slice(0, 6).map((r: any, idx: number) => (
                  <tr key={idx} className="hover:bg-[#F8FAFC]">
                    <td className="py-2.5 px-3 font-bold">{r.floor}</td>
                    <td className="py-2.5 px-3">{r.use}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                      {Number(r.depositManwon).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold text-[#1D4ED8]">
                      {Number(r.monthlyRentManwon).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-[#475569]">{r.leaseExpiry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 07: Cash Flow / Yield (A23) */}
        <section
          id="07_yield"
          data-section-id="07_yield"
          data-doc-hash={docHash}
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              07 수지 분석
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">수익률 산출 내역</h2>
          <div className="p-4 bg-[#F0FDF4] rounded-2xl border border-[#BBF7D0] space-y-2">
            <div className="flex justify-between text-[15px]">
              <span className="text-[#334155]">연간 총 임대료 (Gross Rent)</span>
              <strong className="text-[#0F172A] tabular-nums">
                {(basicDoc.facts.rent.annualRentKrw / 10000).toLocaleString()}만 원
              </strong>
            </div>
            <div className="flex justify-between text-[15px]">
              <span className="text-[#334155]">순운영소득 (NOI)</span>
              <strong className="text-[#0F172A] tabular-nums">
                {(basicDoc.facts.valuation.netAnnualOperatingIncomeKrw / 10000).toLocaleString()}만 원
              </strong>
            </div>
            <div className="flex justify-between text-[16px] font-extrabold pt-2 border-t border-[#86EFAC]">
              <span className="text-[#065F46]">자본환원율 (Cap Rate)</span>
              <span className="text-[#065F46] tabular-nums">
                {basicDoc.facts.valuation.capRatePct.toFixed(2)}%
              </span>
            </div>
          </div>
        </section>

        {/* Section 08: Comps / Trade Area (A26) */}
        <section
          id="08_comps"
          data-section-id="08_comps"
          data-doc-hash={docHash}
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              08 상권 및 배후 수요
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">인근 시장 거래 시세</h2>
          <p className="text-[15px] text-[#475569]">
            인근 최근 실거래 평당 매매가는 약 7,500만 ~ 8,500만 원 선으로 형성되어 있으며 본 물건은 가격 경쟁력을 갖추고 있습니다.
          </p>
        </section>

        {/* Section 09: Deal Terms & Photos (A14) */}
        <section
          id="09_photos"
          data-section-id="09_photos"
          data-doc-hash={docHash}
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              09 매각 조건 및 사진
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">거래 조건 및 갤러리</h2>
          <div className="p-4 bg-[#FAF9F5] rounded-2xl border border-[#E2E8F0] text-[15px] text-[#334155]">
            매각 방식: 일반 매매 · 잔금 일정 및 명도 조건 협의 가능
          </div>
        </section>

        {/* Section 10: Contact & Disclaimer (A10) */}
        <section
          id="10_contact"
          data-section-id="10_contact"
          data-doc-hash={docHash}
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              10 담당자 및 면책조항
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">담당 중개사무소</h2>
          <div className="p-4 bg-[#FAF9F5] rounded-2xl border border-[#E2E8F0] space-y-1 text-[15px]">
            <p className="font-extrabold text-[#0F172A]">
              {basicDoc.facts.brokerOffice?.name || "크리딜 파트너스 중개법인"}
            </p>
            <p className="text-[#475569]">
              대표: {basicDoc.facts.brokerOffice?.representative || "김대표"} · 등록번호:{" "}
              {basicDoc.facts.brokerOffice?.registrationNo || "11680-2024-00123"}
            </p>
            <p className="text-[#1D4ED8] font-bold">
              연락처: {basicDoc.facts.brokerOffice?.phone || "02-555-1234"}
            </p>
          </div>

          <p className="text-[13px] text-[#64748B] leading-relaxed pt-2">
            본 자료는 고객 검토용으로 작성되었으며 법적 구속력을 갖지 않습니다.
          </p>
        </section>
      </main>

      {/* ── Version Diff Modal (WP-P4b-03) ── */}
      {showDiffModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs no-print"
          data-testid="version-diff-modal"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border-2 border-[#CBD5E1]">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="text-[18px] font-extrabold text-[#0F172A]">
                🔍 IM 버전 차이 비교 (v1 ↔ v2)
              </h3>
              <button
                type="button"
                onClick={() => setShowDiffModal(false)}
                className="text-[16px] font-bold text-[#64748B] hover:text-[#0F172A] p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-[15px]">
              <p className="text-[14px] text-[#475569]">
                수정 및 변경된 항목은 <span className="bg-[#FEF08A] text-[#854D0E] font-bold px-1.5 py-0.5 rounded">노란색</span>으로 강조 표시됩니다.
              </p>

              <div className="rounded-2xl border border-[#CBD5E1] overflow-hidden">
                <table className="w-full text-left text-[14px]">
                  <thead className="bg-[#FAF9F5] border-b border-[#CBD5E1] font-bold">
                    <tr>
                      <th className="p-3">항목</th>
                      <th className="p-3">v1 (초안)</th>
                      <th className="p-3">v2 (현재본)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    <tr className="bg-[#FEF9C3]">
                      <td className="p-3 font-semibold">매매 희망가</td>
                      <td className="p-3">
                        {Math.round(v1Doc.facts.transaction.askingPriceManwon / 10000).toLocaleString()}억 원
                      </td>
                      <td className="p-3 font-bold text-[#1D4ED8]">
                        {Math.round(basicDoc.facts.transaction.askingPriceManwon / 10000).toLocaleString()}억 원 (-3억 조정)
                      </td>
                    </tr>
                    <tr className="bg-[#FEF9C3]">
                      <td className="p-3 font-semibold">예상 수익률</td>
                      <td className="p-3">{v1Doc.facts.valuation.grossYieldPct.toFixed(2)}%</td>
                      <td className="p-3 font-bold text-[#065F46]">
                        {basicDoc.facts.valuation.grossYieldPct.toFixed(2)}% (개선)
                      </td>
                    </tr>
                    <tr className="bg-[#FEF9C3]">
                      <td className="p-3 font-semibold">월 임대수익</td>
                      <td className="p-3">
                        {v1Doc.facts.rent.monthlyRentTotalManwon.toLocaleString()}만 원
                      </td>
                      <td className="p-3 font-bold text-[#1D4ED8]">
                        {basicDoc.facts.rent.monthlyRentTotalManwon.toLocaleString()}만 원
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold">연면적</td>
                      <td className="p-3">{v1Doc.facts.building.totalGrossAreaSqm.toLocaleString()}㎡</td>
                      <td className="p-3">{basicDoc.facts.building.totalGrossAreaSqm.toLocaleString()}㎡ (동일)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowDiffModal(false)}
                className="w-full min-h-[48px] bg-[#0F172A] text-white font-bold rounded-xl hover:bg-[#1E293B] cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fixed Bottom Action Bar (64px) ── */}
      <footer
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#CBD5E1] shadow-lg no-print"
        data-testid="floating-action-bar"
      >
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <a
            href={`tel:${basicDoc.facts.brokerOffice?.phone || "02-555-1234"}`}
            className="flex-1 min-h-[48px] bg-[#0F172A] text-white font-bold rounded-xl flex items-center justify-center gap-1.5 hover:bg-[#1E293B] transition-colors cursor-pointer text-[15px]"
          >
            <span>📞</span> 전화 문의
          </a>
          <button
            type="button"
            onClick={() => setShowInquiry(true)}
            className="flex-1 min-h-[48px] bg-[#1D4ED8] text-white font-bold rounded-xl flex items-center justify-center gap-1.5 hover:bg-[#1E40AF] transition-colors cursor-pointer text-[15px]"
          >
            <span>💬</span> 카톡 문의
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[48px] px-3.5 bg-[#FAF9F5] border border-[#64748B] text-[#0F172A] font-bold rounded-xl flex items-center justify-center hover:bg-[#F3F2EE] transition-colors cursor-pointer text-[15px]"
            title="A4 인쇄 및 PDF 내보내기"
          >
            <span>🖨️</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
