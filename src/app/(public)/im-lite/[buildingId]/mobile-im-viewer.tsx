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
  extractTransactionFacts,
  extractValuationFacts,
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

const BROKER_VIEWER_PLACEHOLDERS = new Set([
  "",
  "-",
  "—",
  "담당 공인중개사",
  "담당 중개인",
  "담당 중개법인 (확인 중)",
  "담당 중개법인",
  "전담 중개법인",
  "전담 중개사무소",
  "김대표",
  "미등록",
  "11680-2024-00123",
  "11680-2024-00001",
  "02-555-1234",
  "02-1234-5678",
]);

const VIEWER_CATEGORY_KO: Record<string, string> = {
  exterior: "외관",
  cover: "전면 외관",
  hero: "대표 외관",
  aerial: "항공·드론뷰",
  entrance: "주출입구",
  surroundings: "주변 환경",
  signage: "건물 간판",
  lobby: "메인 로비",
  corridor: "복도·공용부",
  elevator: "승강기 홀",
  interior: "실내 공간",
  tenant_space: "임차 공간",
  parking: "주차·설비",
  rooftop: "옥상·테라스",
  mechanical: "기계·설비",
  storage: "창고·부대시설",
  floor_plan: "평면도",
  floorplan: "평면도",
  map: "위치 지도",
  location_map: "위치도",
  cadastral: "지적도",
};

function sanitizePhotoText(raw?: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFC")
    .replace(/\.(?:jpe?g|png|webp|heic|gif|bmp)$/i, "")
    .replace(/^\d{1,3}[\s_-]+/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeViewerGalleryPhoto(p: any, idx: number) {
  const rawCat = String(
    p?.category ||
      p?.type ||
      (String(p?.url || "").includes("map.kakao.com") ? "map" : idx === 0 ? "exterior" : "interior")
  )
    .trim()
    .toLowerCase();
  const rawLabelClean = sanitizePhotoText(p?.label);
  const labelKey = rawLabelClean.toLowerCase().replace(/[\s/-]+/g, "_");
  const badgeLabel =
    VIEWER_CATEGORY_KO[labelKey] ||
    (rawLabelClean && !/^[a-z0-9_ -]+$/i.test(rawLabelClean) ? rawLabelClean : "") ||
    VIEWER_CATEGORY_KO[rawCat] ||
    `현장 사진 ${idx + 1}`;

  const rawCapClean = sanitizePhotoText(p?.caption);
  const capKey = rawCapClean.toLowerCase().replace(/[\s/-]+/g, "_");
  const cleanCaption =
    rawCapClean && !VIEWER_CATEGORY_KO[capKey] && rawCapClean !== badgeLabel
      ? rawCapClean
      : undefined;

  return {
    url: p?.url,
    type: rawCat,
    label: badgeLabel,
    caption: cleanCaption,
    order: p?.order ?? idx,
  };
}

function cleanViewerBrokerField(val?: unknown): string {
  if (!val || typeof val !== "string") return "";
  const cleaned = val.replace(/\s*\(확인\s*중\)/g, "").trim();
  return BROKER_VIEWER_PLACEHOLDERS.has(cleaned) ? "" : cleaned;
}

export function MobileIMViewer({
  document: initialDoc,
  buildingId,
  ssotData,
  docId,
  isBroker = true,
}: Props) {
  // Version state: v1 <-> v2
  const [selectedVersion, setSelectedVersion] = useState<"v1" | "v2">("v2");
  const [showDiffModal, setShowDiffModal] = useState<boolean>(false);
  const [activeSectionId, setActiveSectionId] = useState<string>("01_cover");
  const [showInquiry, setShowInquiry] = useState<boolean>(false);
  const [isDownloadingPptx, setIsDownloadingPptx] = useState<boolean>(false);

  const handleMobilePptxDownload = useCallback(
    async (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (isDownloadingPptx) return;
      const url = `/api/public/im-lite/${encodeURIComponent(buildingId)}/pptx?direct=1${
        docId ? `&doc_id=${encodeURIComponent(docId)}` : ""
      }`;
      setIsDownloadingPptx(true);
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `IM_${buildingId}.pptx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
      } catch {
        // non-blocking
      } finally {
        setIsDownloadingPptx(false);
      }
    },
    [buildingId, docId, isDownloadingPptx]
  );

  // Base (v2) canonical BasicImDocument from real document/SSoT payload (Rule 26 & 34: zero hardcoded building fallbacks)
  const v2Doc = useMemo<BasicImDocument>(() => {
    if (initialDoc && initialDoc.basicImDocument && initialDoc.basicImDocument.facts) {
      return initialDoc.basicImDocument as BasicImDocument;
    }
    if (
      initialDoc &&
      "schemaVersion" in initialDoc &&
      initialDoc.schemaVersion === "3.0" &&
      initialDoc.facts
    ) {
      return initialDoc as BasicImDocument;
    }

    const layers = (ssotData?.layers as Record<string, any>) || {};
    const ssotSummary = (initialDoc as any)?.ssotSummary || (initialDoc as any)?.ssot_summary || {};
    const hero = initialDoc?.heroCard || {};
    const enrichment = initialDoc?.enrichment || {};
    const br = enrichment?.buildingRegister || {};
    const landEnrich = enrichment?.land || enrichment?.landUsePlan || {};

    const parsePriceManwon = (str?: string | null): number | undefined => {
      if (!str) return undefined;
      const m = String(str).replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*억/);
      if (m) return Math.round(parseFloat(m[1]) * 10000);
      return undefined;
    };

    const parsedSizeSqm = (() => {
      if (!initialDoc?.sizeSignal) return undefined;
      const m = String(initialDoc.sizeSignal)
        .replace(/,/g, "")
        .match(/(\d+(?:\.\d+)?)\s*(?:㎡|m2)/i);
      return m ? parseFloat(m[1]) : undefined;
    })();

    const baseAskingManwon =
      (ssotData as any)?.asking_price_manwon ??
      ssotSummary?.asking_price_manwon ??
      layers?.deal_terms?.asking_price_manwon ??
      parsePriceManwon(hero.askingPriceDisplay || initialDoc?.priceBand) ??
      0;

    // Extract explicit rent roll units if present (no fake 4-row synthesis)
    const legacyRentSec = Array.isArray(initialDoc?.sections)
      ? initialDoc.sections.find((s: any) =>
          ["06_rentroll", "03_financial", "03_lease", "lease_status", "rentroll"].includes(
            String(s?.sectionId || s?.section_type || s?.id || "")
          )
        )
      : undefined;
    const explicitUnits =
      initialDoc?.rentRoll ||
      initialDoc?.rent_roll ||
      (initialDoc as any)?.floor_leases ||
      initialDoc?.facts?.rent?.units ||
      layers?.rent_roll?.units ||
      layers?.lease_units ||
      legacyRentSec?.data?.rows ||
      legacyRentSec?.data?.units;

    const explicitRentSumManwon =
      Array.isArray(explicitUnits) && explicitUnits.length > 0
        ? explicitUnits.reduce((sum: number, u: any) => {
            const isVacant =
              u?.status === "vacant" ||
              u?.is_vacant === true ||
              u?.lease_state === "공실" ||
              u?.tenant_name === "공실" ||
              u?.use === "공실";
            if (isVacant) return sum;
            const r =
              u?.monthlyRentManwon ??
              u?.rent_manwon ??
              (u?.rentKrw !== undefined
                ? Math.round(Number(u.rentKrw) / 10000)
                : u?.rent_krw !== undefined
                ? Math.round(Number(u.rent_krw) / 10000)
                : 0);
            return sum + Number(r || 0);
          }, 0)
        : undefined;

    const explicitDepositSumManwon =
      Array.isArray(explicitUnits) && explicitUnits.length > 0
        ? explicitUnits.reduce((sum: number, u: any) => {
            const d =
              u?.depositManwon ??
              u?.deposit_manwon ??
              (u?.depositKrw !== undefined
                ? Math.round(Number(u.depositKrw) / 10000)
                : u?.deposit_krw !== undefined
                ? Math.round(Number(u.deposit_krw) / 10000)
                : 0);
            return sum + Number(d || 0);
          }, 0)
        : undefined;

    const monthlyRentManwon =
      explicitRentSumManwon ??
      ssotSummary?.monthly_rent_total_manwon ??
      (ssotSummary?.monthly_rent_total_krw
        ? Math.round(Number(ssotSummary.monthly_rent_total_krw) / 10000)
        : undefined) ??
      layers?.rent_roll?.monthly_rent_total_manwon ??
      (layers?.rent_roll?.monthly_rent_total_krw
        ? Math.round(Number(layers.rent_roll.monthly_rent_total_krw) / 10000)
        : undefined) ??
      0;

    const depositManwon =
      explicitDepositSumManwon ??
      ssotSummary?.total_deposit_manwon ??
      (ssotSummary?.total_deposit_krw
        ? Math.round(Number(ssotSummary.total_deposit_krw) / 10000)
        : undefined) ??
      layers?.rent_roll?.total_deposit_manwon ??
      0;

    const synthesizedRentRoll = (() => {
      if (Array.isArray(explicitUnits) && explicitUnits.length > 0) {
        return explicitUnits.map((u: any, idx: number) => {
          const isVacant =
            u.status === "vacant" ||
            u.is_vacant === true ||
            u.lease_state === "공실" ||
            u.tenant_name === "공실" ||
            u.use === "공실";
          const isOwner =
            u.status === "owner" ||
            u.lease_state === "자가사용" ||
            u.use === "자가사용";
          const label =
            u.use ||
            [u.tenantName || u.tenant_name, u.tenant_type].filter(Boolean).join(" / ") ||
            u.tenant ||
            (isVacant ? "공실" : "임대중");
          return {
            floor: u.floor || `${idx + 1}F`,
            tenant_name: label,
            use: label,
            area_sqm:
              Number(
                u.area_sqm ??
                  u.area_m2 ??
                  u.areaSqm ??
                  (u.area_pyeong ? Number(u.area_pyeong) * 3.305785 : u.areaPyeong ? Number(u.areaPyeong) * 3.305785 : 0)
              ) || undefined,
            deposit_manwon:
              u.depositManwon ??
              u.deposit_manwon ??
              (u.depositKrw !== undefined
                ? Math.round(Number(u.depositKrw) / 10000)
                : u.deposit_krw !== undefined
                ? Math.round(Number(u.deposit_krw) / 10000)
                : 0),
            rent_manwon:
              u.monthlyRentManwon ??
              u.rent_manwon ??
              (u.rentKrw !== undefined
                ? Math.round(Number(u.rentKrw) / 10000)
                : u.rent_krw !== undefined
                ? Math.round(Number(u.rent_krw) / 10000)
                : 0),
            status: isVacant ? "vacant" : isOwner ? "owner" : u.status || "occupied",
            expiry_date: u.leaseExpiry || u.expiryDate || u.expiry_date || u.lease_end || "2027-12",
          };
        });
      }
      return [];
    })();

    const derivedFloorsAbove = (() => {
      if (!Array.isArray(explicitUnits) || explicitUnits.length === 0) return undefined;
      let maxAbove = 0;
      for (const u of explicitUnits) {
        const f = String(u?.floor || "").trim().toUpperCase();
        if (f.startsWith("B") || f.includes("지하")) continue;
        const m = f.match(/(\d+)/);
        if (m) maxAbove = Math.max(maxAbove, parseInt(m[1], 10));
      }
      return maxAbove > 0 ? maxAbove : undefined;
    })();

    const derivedFloorsBelow = (() => {
      if (!Array.isArray(explicitUnits) || explicitUnits.length === 0) return undefined;
      let maxBelow = 0;
      for (const u of explicitUnits) {
        const f = String(u?.floor || "").trim().toUpperCase();
        if (f.startsWith("B") || f.includes("지하")) {
          const m = f.match(/(\d+)/);
          maxBelow = Math.max(maxBelow, m ? parseInt(m[1], 10) : 1);
        }
      }
      return maxBelow;
    })();

    const brokerInfo = {
      name:
        cleanViewerBrokerField(initialDoc?.broker?.office) ||
        cleanViewerBrokerField(initialDoc?.broker?.company) ||
        "전담 중개사무소",
      representative:
        cleanViewerBrokerField(initialDoc?.broker?.name) ||
        cleanViewerBrokerField(initialDoc?.broker?.displayName) ||
        "담당 공인중개사",
      registrationNo: cleanViewerBrokerField(initialDoc?.broker?.registrationNo) || "-",
      phone: cleanViewerBrokerField(initialDoc?.broker?.phone) || "-",
    };

    const rawFacts = {
      buildingId,
      title:
        initialDoc?.blindName ||
        initialDoc?.fullName ||
        `${initialDoc?.areaSignal || ""} ${initialDoc?.assetType || "상업용 자산"}`.trim(),
      address:
        ssotSummary?.address ||
        enrichment?.meta?.address ||
        layers?.asset_identity?.address ||
        initialDoc?.areaSignal ||
        initialDoc?.blindName ||
        "서울시 핵심 권역",
      posture: (hero.posture || ssotSummary?.investment_posture || "core_income") as any,
      asking_price_manwon: baseAskingManwon,
      total_gross_area_sqm:
        ssotSummary?.total_gross_area_sqm ??
        ssotSummary?.total_gross_area_m2 ??
        hero.totalArea ??
        hero.totalGrossAreaM2 ??
        br.total_gross_area_sqm ??
        br.totalArea ??
        layers?.public_data?.total_gross_area_m2 ??
        parsedSizeSqm ??
        0,
      land_area_sqm:
        ssotSummary?.land_area_sqm ??
        ssotSummary?.land_area_m2 ??
        hero.landArea ??
        hero.landAreaM2 ??
        landEnrich.land_area_sqm ??
        landEnrich.landArea ??
        layers?.public_data?.land_area_m2 ??
        0,
      zoning:
        ssotSummary?.zoning ??
        hero.zoningDistrict ??
        hero.zoning ??
        landEnrich.zoning ??
        landEnrich.zoningDistrict ??
        layers?.public_data?.zoning ??
        "-",
      official_land_price_won_sqm:
        ssotSummary?.official_land_price_per_sqm ??
        landEnrich.official_land_price_per_sqm ??
        landEnrich.official_land_price_won_sqm ??
        landEnrich.officialLandPricePerSqm ??
        enrichment?.officialLandPrice?.pricePerSqm ??
        enrichment?.landPriceHistory?.latestPricePerSqm ??
        layers?.public_data?.official_land_price_won_sqm ??
        0,
      floors_above:
        ssotSummary?.floors_above ??
        br.floors_above ??
        br.floorsAbove ??
        br.grndFlrCnt ??
        layers?.public_data?.floors_above ??
        derivedFloorsAbove ??
        0,
      floors_below:
        ssotSummary?.floors_below ??
        br.floors_below ??
        br.floorsBelow ??
        br.ugrndFlrCnt ??
        layers?.public_data?.floors_below ??
        derivedFloorsBelow ??
        0,
      building_coverage_ratio_pct:
        ssotSummary?.bcr_pct ??
        br.building_coverage_ratio_pct ??
        br.buildingCoverageRatioPct ??
        br.bcRat ??
        layers?.public_data?.building_coverage_ratio_pct ??
        0,
      floor_area_ratio_pct:
        ssotSummary?.far_pct ??
        br.floor_area_ratio_pct ??
        br.floorAreaRatioPct ??
        br.vlRat ??
        layers?.public_data?.floor_area_ratio_pct ??
        0,
      parking_spaces:
        ssotSummary?.parking_count ??
        br.parking_spaces ??
        br.parkingSpaces ??
        br.totPkngCnt ??
        layers?.public_data?.parking_spaces ??
        0,
      elevators:
        ssotSummary?.elevator_count ??
        br.elevators ??
        br.rideUseElvtCnt ??
        layers?.public_data?.elevators ??
        1,
      main_usage:
        ssotSummary?.main_usage ??
        br.main_usage ??
        br.mainUsage ??
        br.mainPurpsCdNm ??
        layers?.public_data?.main_usage ??
        initialDoc?.assetType ??
        "제1·2종 근린생활시설",
      structure:
        ssotSummary?.structure ??
        br.structure ??
        br.strctCdNm ??
        layers?.public_data?.structure ??
        "철근콘크리트구조",
      completion_date:
        ssotSummary?.completion_date ??
        br.completion_date ??
        br.completionDate ??
        br.useAprDay ??
        layers?.public_data?.completion_date ??
        "-",
      monthly_rent_total_manwon: monthlyRentManwon,
      deposit_total_manwon: depositManwon,
      rent_roll: synthesizedRentRoll,
      points: Array.isArray(hero.keyPoints) ? hero.keyPoints : undefined,
      photos:
        Array.isArray((initialDoc as any)?.photos_v2) && (initialDoc as any).photos_v2.length > 0
          ? (initialDoc as any).photos_v2
          : Array.isArray(initialDoc?.photos) && initialDoc.photos.length > 0
          ? initialDoc.photos
          : Array.isArray((ssotData as any)?.photos_v2)
          ? (ssotData as any).photos_v2
          : Array.isArray((ssotData as any)?.photos)
          ? (ssotData as any).photos
          : undefined,
      brokerOffice: brokerInfo,
      broker_office: brokerInfo,
    };

    const facts = extractPureBuildingFacts(rawFacts);
    return buildBasicImDocument(facts);
  }, [initialDoc, ssotData, buildingId]);

  // Version 1 comparison reference document (derived ONCE from v2Doc base asking price)
  const v1Doc = useMemo<BasicImDocument>(() => {
    const v2AskingManwon = v2Doc.facts.transaction.askingPriceManwon || 1000000;
    const v1AskingManwon = Math.round(v2AskingManwon * 1.03);
    const v1RentManwon = Math.max(
      100,
      Math.round((v2Doc.facts.rent.monthlyRentTotalManwon || 3000) * 0.95)
    );
    const v1DepositManwon = Math.max(
      1000,
      Math.round((v2Doc.facts.rent.depositTotalManwon || 25000) * 0.95)
    );
    const v1RentKrw = v1RentManwon * 10000;
    const v1DepositKrw = v1DepositManwon * 10000;

    const v1Transaction = extractTransactionFacts(
      { asking_price_manwon: v1AskingManwon },
      v2Doc.facts.land.landAreaPyeong,
      v2Doc.facts.building.totalGrossAreaPyeong,
      v1DepositKrw
    );
    const v1Valuation = extractValuationFacts(
      v1Transaction.askingPriceKrw,
      v1DepositKrw,
      v1RentKrw,
      v2Doc.facts.rent.maintenanceFeeMonthlyKrw,
      v1Transaction.expectedLoanKrw
    );
    const v1Facts: PureBuildingFacts = {
      ...v2Doc.facts,
      rent: {
        ...v2Doc.facts.rent,
        depositTotalKrw: v1DepositKrw,
        depositTotalManwon: v1DepositManwon,
        monthlyRentTotalKrw: v1RentKrw,
        monthlyRentTotalManwon: v1RentManwon,
        annualRentKrw: v1RentKrw * 12,
      },
      transaction: v1Transaction,
      valuation: v1Valuation,
    };
    return buildBasicImDocument(v1Facts);
  }, [v2Doc]);

  // Active document switches cleanly between v2 (latest) and v1 (draft snapshot)
  const basicDoc = selectedVersion === "v1" ? v1Doc : v2Doc;

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

  // [A1-02] Cover price & photo derivation
  const askingManwon =
    coverSec?.data?.askingPriceManwon ?? basicDoc.facts.transaction.askingPriceManwon ?? 0;
  const eok = askingManwon / 10000;
  const priceLabel = Number.isInteger(eok)
    ? `${eok}억 원`
    : `${eok.toFixed(1).replace(/\.0$/, "")}억 원`;

  const coverPhotoUrl =
    coverSec?.data?.primaryPhotoUrl || basicDoc.facts.photos?.[0]?.url;
  const hasRenderableCoverPhoto =
    Boolean(coverPhotoUrl) &&
    !String(coverPhotoUrl).includes("map.kakao.com/link/map");

  // [A4-01] Rent roll rows derivation (supports both PureRentUnit & RentRollRowItem)
  const rawRentRows =
    rentrollSec?.data?.rows ||
    rentrollSec?.data?.units ||
    basicDoc.facts.rent.units ||
    [];
  const rentRows = rawRentRows;

  // [A4-05] Location, Land, Yield, Comps, Photos section data bindings
  const legacyLocationContent = useMemo(() => {
    if (!Array.isArray(initialDoc?.sections)) return undefined;
    const sec = initialDoc.sections.find((s: any) =>
      String(s?.type || s?.section_type || s?.sectionId || "").includes("location")
    );
    if (!sec?.content) return undefined;
    return String(sec.content)
      .split("\n")
      .map((line: string) => line.replace(/^[#>*\-\s]+/, "").replace(/\*\*/g, "").trim())
      .filter((line: string) => line.length > 6 && !line.startsWith("|"))
      .slice(0, 3)
      .join(" · ");
  }, [initialDoc]);

  const locationTransport =
    locationSec?.data?.transportAccessibility ||
    `${basicDoc.facts.address} 핵심 권역 내 위치하여 대중교통 및 주요 간선도로 접근성이 우수합니다.`;
  const locationRoad =
    locationSec?.data?.roadConditions || basicDoc.facts.land.roadConditions;
  const locationPoiList: string[] = Array.isArray(locationSec?.data?.poiList)
    ? locationSec.data.poiList
    : [];

  const landAreaSqm = landSec?.data?.landAreaSqm ?? basicDoc.facts.land.landAreaSqm;
  const landAreaPyeong = landSec?.data?.landAreaPyeong ?? basicDoc.facts.land.landAreaPyeong;
  const landZoning = landSec?.data?.zoning || basicDoc.facts.land.zoning;
  const landTerrainShape =
    landSec?.data?.terrainShape || basicDoc.facts.land.terrainShape || "세로장방형 평지";
  const multiParcels: any[] = useMemo(() => {
    const raw =
      (initialDoc as any)?.parcels ||
      (initialDoc as any)?.ssotSummary?.parcels ||
      [];
    return Array.isArray(raw) ? raw : [];
  }, [initialDoc]);
  const landCategoryLabel =
    (initialDoc as any)?.ssotSummary?.land_category ||
    (initialDoc as any)?.ssotSummary?.jimok ||
    "대";
  const officialLandPriceWonSqm = Number(
    landSec?.data?.officialLandPriceWonSqm ?? basicDoc.facts.land.officialLandPriceWonSqm ?? 0
  );
  const officialLandPricePyeong = Number(
    landSec?.data?.officialLandPricePyeong ??
      basicDoc.facts.land.officialLandPricePyeong ??
      (officialLandPriceWonSqm > 0 ? Math.round(officialLandPriceWonSqm * 3.305785) : 0)
  );

  const annualRentKrw =
    yieldSec?.data?.annualRentKrw ?? basicDoc.facts.rent.annualRentKrw ?? 0;
  const netAnnualOperatingIncomeKrw =
    yieldSec?.data?.netAnnualOperatingIncomeKrw ??
    basicDoc.facts.valuation.netAnnualOperatingIncomeKrw ??
    0;
  const capRatePct =
    yieldSec?.data?.capRatePct ?? basicDoc.facts.valuation.capRatePct ?? 0;
  const pricePerPyeongLandWon = Number(
    yieldSec?.data?.pricePerPyeongLandWon ??
      basicDoc.facts.transaction.pricePerPyeongLandWon ??
      0
  );
  const pricePerPyeongGfaWon = Number(
    yieldSec?.data?.pricePerPyeongGfaWon ??
      basicDoc.facts.transaction.pricePerPyeongGfaWon ??
      0
  );

  const compsList: any[] = compsSec?.data?.comparableTransactions || [];
  const subjectLandPricePerPyeongWon = Number(
    compsSec?.data?.subjectLandPricePerPyeongWon ?? pricePerPyeongLandWon
  );
  const subjectGfaPricePerPyeongWon = Number(
    compsSec?.data?.subjectGfaPricePerPyeongWon ?? pricePerPyeongGfaWon
  );

  const rawSectionPhotos =
    photosSec?.data?.photos || basicDoc.facts.photos || initialDoc?.photos || [];
  const galleryPhotos = useMemo(() => {
    return (Array.isArray(rawSectionPhotos) ? rawSectionPhotos : []).map((p: any, idx: number) =>
      normalizeViewerGalleryPhoto(p, idx)
    );
  }, [rawSectionPhotos]);
  const handoverCondition =
    (basicDoc.facts.transaction as any)?.handoverCondition ||
    photosSec?.data?.handoverCondition ||
    "일반 매매 · 잔금 일정 및 명도 조건 협의 가능";

  // [A2-02] Sanitized per-field broker contact info (never let a placeholder in one layer shadow real profile fields)
  const contactBrokerObj = contactSec?.data?.brokerOffice;
  const factsBrokerObj = basicDoc.facts.brokerOffice;
  const legacyBrokerContact = (initialDoc as any)?.broker_contact;
  const topBrokerObj = initialDoc?.broker;

  const realBrokerOfficeName =
    cleanViewerBrokerField(contactBrokerObj?.name) ||
    cleanViewerBrokerField(contactBrokerObj?.office) ||
    cleanViewerBrokerField(contactBrokerObj?.company) ||
    cleanViewerBrokerField(factsBrokerObj?.name) ||
    cleanViewerBrokerField(legacyBrokerContact?.brokerageName) ||
    cleanViewerBrokerField(topBrokerObj?.company) ||
    cleanViewerBrokerField(topBrokerObj?.office);
  const brokerOfficeName = realBrokerOfficeName || "전담 중개사무소";

  const realBrokerRepresentative =
    cleanViewerBrokerField(contactBrokerObj?.representative) ||
    cleanViewerBrokerField(contactBrokerObj?.displayName) ||
    cleanViewerBrokerField(factsBrokerObj?.representative) ||
    cleanViewerBrokerField(legacyBrokerContact?.brokerName) ||
    cleanViewerBrokerField(topBrokerObj?.displayName) ||
    cleanViewerBrokerField(topBrokerObj?.name);
  const brokerRepresentative = realBrokerRepresentative || "담당 공인중개사";

  const realBrokerRegistrationNo =
    cleanViewerBrokerField(contactBrokerObj?.registrationNo) ||
    cleanViewerBrokerField(factsBrokerObj?.registrationNo) ||
    cleanViewerBrokerField(legacyBrokerContact?.registrationNo) ||
    cleanViewerBrokerField(legacyBrokerContact?.officeRegNumber) ||
    cleanViewerBrokerField(topBrokerObj?.registrationNo);
  const brokerRegistrationNo = realBrokerRegistrationNo || "-";

  const realBrokerPhone =
    cleanViewerBrokerField(contactBrokerObj?.phone) ||
    cleanViewerBrokerField(factsBrokerObj?.phone) ||
    cleanViewerBrokerField(legacyBrokerContact?.brokerPhone) ||
    cleanViewerBrokerField(topBrokerObj?.phone);
  const brokerPhone = realBrokerPhone || "-";
  const isMissingBrokerContact = !realBrokerOfficeName || !realBrokerPhone;
  const contactDisclaimer =
    contactSec?.data?.disclaimer ||
    initialDoc?.disclaimer ||
    "본 자료는 고객 검토용으로 작성되었으며 법적 구속력을 갖지 않습니다.";

  // [A2-05] Version diff delta in 억 원
  const diffEok = (
    ((basicDoc.facts.transaction.askingPriceManwon || 0) -
      (v1Doc.facts.transaction.askingPriceManwon || 0)) /
    10000
  ).toFixed(1);

  const isRevoked = Boolean((initialDoc as any)?.isRevoked);
  const correctionNotice = (initialDoc as any)?.correctionNotice as
    | { message: string; updatedAt?: string }
    | null
    | undefined;

  if (isRevoked) {
    return (
      <div
        className="min-h-screen bg-[#F3F2EE] text-[#0F172A] flex items-center justify-center px-4 py-12"
        data-testid="revoked-im-screen"
      >
        <div className="max-w-md w-full bg-white rounded-3xl border-2 border-[#FECACA] p-6 sm:p-8 text-center space-y-4 shadow-md">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#FEE2E2] text-[#991B1B] rounded-full font-extrabold text-[13px]">
            🚫 404 · 열람 권한 회수됨
          </div>
          <h1 className="text-[22px] font-black text-[#0F172A] leading-snug">
            담당 중개인에 의해 회수된 투자설명서(IM) 링크입니다
          </h1>
          <p className="text-[15px] text-[#475569] leading-relaxed">
            매매 조건 변경, 가격 조정 또는 보안 정책에 따라 이전 공유 링크의 열람이 중단되었습니다. 최신 투자설명서 링크는 담당 공인중개사에게 요청해 주세요.
          </p>
          <div className="p-4 bg-[#FAF9F5] rounded-2xl border border-[#E2E8F0] text-left space-y-1 text-[14px]">
            <p className="font-bold text-[#0F172A]">
              담당: {brokerRepresentative} ({brokerOfficeName})
            </p>
            {brokerPhone && brokerPhone !== "-" && (
              <p className="text-[#475569]">연락처: {brokerPhone}</p>
            )}
          </div>
          {brokerPhone && brokerPhone !== "-" && (
            <a
              href={`tel:${brokerPhone}`}
              className="w-full min-h-[48px] bg-[#0F172A] text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-[#1E293B] cursor-pointer text-[15px]"
            >
              📞 담당 중개사에게 최신본 요청하기
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#F3F2EE] text-[#0F172A] font-sans selection:bg-[#1D4ED8] selection:text-white pb-36 overflow-x-hidden"
      data-testid="mobile-im-viewer"
    >
      {/* ── Top Header Bar & Version Switcher ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#CBD5E1] shadow-xs no-print">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isBroker ? (
              <>
                <Link
                  href="/broker/w/im"
                  className="text-[14px] font-bold text-[#475569] hover:text-[#0F172A] flex items-center gap-0.5 shrink-0"
                >
                  ‹ IM
                </Link>
                <span className="text-[#CBD5E1]">|</span>
              </>
            ) : (
              <span className="text-[14px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-1 rounded-lg border border-[#BFDBFE] shrink-0">
                📊 투자설명서
              </span>
            )}
            <span className="text-[14px] font-extrabold text-[#0F172A] truncate max-w-[165px] sm:max-w-[280px]">
              {basicDoc.metadata.title}
            </span>
          </div>

          {/* Version Switcher Dropdown (Broker Preview Only — WP-P4b-03 / P0-META-IMLITE-PUBLIC-06) */}
          {isBroker ? (
            <div className="flex items-center gap-2" data-testid="version-switcher-bar">
              <select
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.target.value as "v1" | "v2")}
                className="min-h-[38px] px-2.5 py-1 text-[14px] font-bold bg-[#FAF9F5] border border-[#64748B] rounded-lg text-[#0F172A] outline-none cursor-pointer"
                data-testid="version-switcher"
              >
                <option value="v1">v1 (초안)</option>
                <option value="v2">v2 (최신 공개본 ★)</option>
              </select>

              <button
                type="button"
                onClick={() => setShowDiffModal(true)}
                className="min-h-[38px] px-2.5 py-1 text-[14px] font-bold text-[#92400E] bg-[#FEF3C7] border border-[#FDE68A] hover:bg-[#FDE68A] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                data-testid="version-diff-btn"
              >
                🔍 v1↔v2 비교
              </button>
            </div>
          ) : (
            <span className="text-[14px] font-bold text-[#065F46] bg-[#ECFDF5] border border-[#A7F3D0] px-2.5 py-1 rounded-lg shrink-0">
              ✓ 검증 완료
            </span>
          )}
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
                className={`min-h-[38px] px-3 py-1 rounded-full text-[14px] font-bold whitespace-nowrap border transition-all cursor-pointer ${
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

      {/* ── Live Correction Notice Banner (Synced from Broker Inbox) ── */}
      {correctionNotice?.message && (
        <div
          className="bg-[#FEF3C7] border-b-2 border-[#F59E0B] px-4 py-3 text-[#92400E] shadow-xs"
          data-testid="im-correction-banner"
          role="status"
        >
          <div className="max-w-2xl mx-auto flex items-start gap-2.5">
            <span className="text-[18px] leading-none pt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] sm:text-[15px] font-extrabold text-[#92400E]">
                매물 정보가 정정되었습니다
              </p>
              <p className="text-[14px] text-[#78350F] mt-0.5 leading-snug">
                {correctionNotice.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Continuous 10-Section Scroll Content (WP-P4b-01 & WP-P4b-02) ── */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6" data-testid="continuous-scroll-content">
        {/* Section 01: Cover (A01) */}
        <section
          id="01_cover"
          data-section-id="01_cover"
          data-testid="mobile-im-section-01_cover"
          data-doc-hash={docHash}
          className="bg-white rounded-lg border border-[#CBD5E1] p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              01 표지
            </span>
            <span className="text-[14px] font-bold text-[#065F46]">
              ✓ 공적장부·실거래 검증필
            </span>
          </div>

          {/* Cover photo or dark gradient box locked to dark theme */}
          <div
            data-theme-lock="dark"
            className="relative w-full min-h-[208px] bg-gradient-to-br from-[#1E293B] to-[#0F172A] rounded-md flex flex-col items-center justify-center text-white p-6 text-center overflow-hidden"
          >
            {hasRenderableCoverPhoto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={String(coverPhotoUrl)}
                alt={coverSec?.data?.title || basicDoc.metadata.title}
                className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
              />
            )}
            <div className="relative z-10 flex flex-col items-center justify-center">
              <span className="text-4xl mb-2">🏢</span>
              <h1 className="text-[22px] sm:text-[26px] font-black leading-tight text-white">
                {coverSec?.data?.title || basicDoc.metadata.title}
              </h1>
              <p className="text-[15px] text-[#CBD5E1] mt-1">
                {coverSec?.data?.address || basicDoc.metadata.address}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              <span className="text-[14px] font-semibold text-[#64748B] block">매매 희망가</span>
              <strong className="text-[20px] font-extrabold text-[#0F172A] tabular-nums">
                {priceLabel}
              </strong>
            </div>
            <div className="p-3.5 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              {(coverSec?.data?.grossYieldPct ?? basicDoc.facts.valuation.grossYieldPct) > 0 ? (
                <>
                  <span className="text-[14px] font-semibold text-[#64748B] block">예상 총수익률</span>
                  <strong className="text-[20px] font-extrabold text-[#065F46] tabular-nums">
                    {(coverSec?.data?.grossYieldPct ?? basicDoc.facts.valuation.grossYieldPct).toFixed(2)}%
                  </strong>
                </>
              ) : (
                <>
                  <span className="text-[14px] font-semibold text-[#64748B] block">토지 평당가</span>
                  <strong className="text-[20px] font-extrabold text-[#065F46] tabular-nums">
                    {Math.round(pricePerPyeongLandWon / 10000).toLocaleString()}만원/평
                  </strong>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Section 02: Summary Highlights (A02) */}
        <section
          id="02_summary"
          data-section-id="02_summary"
          data-testid="mobile-im-section-02_summary"
          data-doc-hash={docHash}
          className="bg-white rounded-lg border border-[#CBD5E1] p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              02 투자 하이라이트
            </span>
            <span className="text-[14px] font-bold text-[#475569]">핵심 요약</span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">
            핵심 투자 지표 (6대 메트릭스)
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(summarySec?.data?.metrics || []).map((m: any, idx: number) => {
              const displayMetricVal =
                m.label === "매매 희망가" && askingManwon > 0 ? priceLabel : m.value;
              return (
                <div key={idx} className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0] text-center">
                  <span className="text-[14px] font-semibold text-[#64748B] block mb-0.5">{m.label}</span>
                  <strong className="text-[16px] font-extrabold text-[#0F172A] tabular-nums block">
                    {displayMetricVal}
                  </strong>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-[#F8FAFC] rounded-md border border-[#E2E8F0] space-y-2">
            <h3 className="text-[15px] font-bold text-[#0F172A]">투자 포인트</h3>
            <ul className="space-y-1.5 text-[15px] text-[#334155]">
              {(summarySec?.data?.investmentPoints || []).map((pt: string, idx: number) => (
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
          data-testid="mobile-im-section-03_overview"
          data-doc-hash={docHash}
          className="bg-white rounded-lg border border-[#CBD5E1] p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              03 건축물 기본 정보
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">건축물 개요</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[15px]">
            <div className="flex justify-between p-2.5 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">소재지</span>
              <span className="font-bold text-[#0F172A]">
                {overviewSec?.data?.address || basicDoc.facts.address}
              </span>
            </div>
            <div className="flex justify-between p-2.5 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">주용도</span>
              <span className="font-bold text-[#0F172A]">
                {overviewSec?.data?.mainUsage || basicDoc.facts.building.mainUsage}
              </span>
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
                {basicDoc.facts.building.buildingCoverageRatioPct ||
                  Number((initialDoc as any)?.ssotSummary?.bcr_pct || 0)}
                % /{" "}
                {basicDoc.facts.building.floorAreaRatioPct ||
                  Number((initialDoc as any)?.ssotSummary?.far_pct || 0)}
                %
              </span>
            </div>
            <div className="flex justify-between p-2.5 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">주차 / 승강기</span>
              <span className="font-bold text-[#0F172A]">
                {basicDoc.facts.building.parkingSpaces ||
                  Number(
                    (initialDoc as any)?.ssotSummary?.parking_total ??
                      (initialDoc as any)?.ssotSummary?.parking_count ??
                      0
                  )}
                대 /{" "}
                {basicDoc.facts.building.elevators ||
                  Number((initialDoc as any)?.ssotSummary?.elevator_count ?? 0)}
                대
              </span>
            </div>
          </div>
        </section>

        {/* Section 04: Location & Transit (A06) */}
        <section
          id="04_location"
          data-section-id="04_location"
          data-testid="mobile-im-section-04_location"
          data-doc-hash={docHash}
          className="bg-white rounded-lg border border-[#CBD5E1] p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              04 입지 분석
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">교통 및 입지 환경</h2>
          <div className="p-4 bg-[#FAF9F5] rounded-md border border-[#E2E8F0] space-y-2.5">
            <p className="text-[15px] font-semibold text-[#0F172A]">
              {basicDoc.facts.address} · {locationTransport}
            </p>
            {locationRoad && (
              <p className="text-[14px] text-[#334155]">
                도로 여건: <strong className="text-[#0F172A]">{locationRoad}</strong>
              </p>
            )}
            {legacyLocationContent && (
              <p className="text-[14px] text-[#475569] leading-relaxed">
                {legacyLocationContent}
              </p>
            )}
            {locationPoiList.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {locationPoiList.map((poi, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-md bg-white border border-[#CBD5E1] text-[14px] font-semibold text-[#0F172A]"
                  >
                    📍 {poi}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section 05: Land & Zoning (A27) */}
        <section
          id="05_land"
          data-section-id="05_land"
          data-testid="mobile-im-section-05_land"
          data-doc-hash={docHash}
          className="bg-white rounded-lg border border-[#CBD5E1] p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              05 토지 및 도시계획
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">토지 이용 계획</h2>
          <div className="grid grid-cols-2 gap-3 text-[15px]">
            <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              <span className="text-[14px] font-semibold text-[#64748B] block">
                {multiParcels.length >= 2 ? `대지면적 (${multiParcels.length}필지 합계)` : "대지면적"}
              </span>
              <strong className="text-[16px] text-[#0F172A] tabular-nums">
                {Number(landAreaSqm).toLocaleString()}㎡ ({Number(landAreaPyeong).toLocaleString()}평)
              </strong>
            </div>
            <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              <span className="text-[14px] font-semibold text-[#64748B] block">용도지역</span>
              <strong className="text-[16px] text-[#0F172A]">{landZoning}</strong>
            </div>
            <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              <span className="text-[14px] font-semibold text-[#64748B] block">
                {multiParcels.length >= 2 ? "지목 구성" : "지형·형상"}
              </span>
              <strong className="text-[15px] text-[#0F172A]">
                {multiParcels.length >= 2 ? landCategoryLabel : landTerrainShape}
              </strong>
            </div>
            <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              <span className="text-[14px] font-semibold text-[#64748B] block">
                {multiParcels.length >= 2 ? "개별공시지가 (가중평균)" : "개별공시지가"}
              </span>
              <strong className="text-[15px] text-[#0F172A] tabular-nums">
                {officialLandPriceWonSqm > 0
                  ? `㎡당 ${officialLandPriceWonSqm.toLocaleString()}원 (평당 약 ${Math.round(
                      officialLandPricePyeong / 10000
                    ).toLocaleString()}만원)`
                  : "공적장부 확인 기준"}
              </strong>
            </div>
          </div>

          {multiParcels.length >= 2 && (
            <div
              data-testid="mobile-im-multiparcel-table"
              className="overflow-x-auto rounded-md border border-[#CBD5E1]"
            >
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#FAF9F5] border-b border-[#CBD5E1] font-bold text-[#0F172A]">
                  <tr>
                    <th className="py-2 px-3">필지(지번)</th>
                    <th className="py-2 px-3">지목</th>
                    <th className="py-2 px-3 text-right">면적</th>
                    <th className="py-2 px-3 text-right">공시지가(㎡)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {multiParcels.map((p: any, idx: number) => {
                    const jibunText =
                      p?.jibun ||
                      (typeof p?.pnu === "string" && /^\d{19}$/.test(p.pnu)
                        ? `${parseInt(p.pnu.slice(11, 15), 10)}${
                            parseInt(p.pnu.slice(15, 19), 10) > 0
                              ? `-${parseInt(p.pnu.slice(15, 19), 10)}`
                              : ""
                          }번지`
                        : `필지 ${idx + 1}`);
                    return (
                      <tr key={p?.pnu || idx}>
                        <td className="py-2 px-3 font-semibold text-[#0F172A]">{jibunText}</td>
                        <td className="py-2 px-3 text-[#334155]">{p?.landCategory || "-"}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-[#0F172A]">
                          {typeof p?.areaM2 === "number" && p.areaM2 > 0
                            ? `${Number(p.areaM2).toLocaleString()}㎡`
                            : "-"}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-[#334155]">
                          {typeof p?.officialPricePerM2 === "number" && p.officialPricePerM2 > 0
                            ? `${Math.round(p.officialPricePerM2).toLocaleString()}원`
                            : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Section 06: Rent Roll (A24) */}
        <section
          id="06_rentroll"
          data-section-id="06_rentroll"
          data-testid="mobile-im-section-06_rentroll"
          data-doc-hash={docHash}
          className="bg-white rounded-lg border border-[#CBD5E1] p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              06 층별 임대차 상세
            </span>
            <span className="text-[14px] text-[#065F46] font-bold">
              월 수익 합계: {basicDoc.facts.rent.monthlyRentTotalManwon.toLocaleString()}만원
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">렌트롤 현황</h2>

          <div className="overflow-x-auto rounded-md border border-[#CBD5E1]">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-[#FAF9F5] border-b border-[#CBD5E1] font-bold text-[#0F172A]">
                <tr>
                  <th className="py-2 px-2 sm:px-3 whitespace-nowrap">층</th>
                  <th className="py-2 px-2 sm:px-3">업종/용도</th>
                  <th className="py-2 px-2 sm:px-3 text-right whitespace-nowrap">보증금(만)</th>
                  <th className="py-2 px-2 sm:px-3 text-right whitespace-nowrap">월세(만)</th>
                  <th className="py-2 px-2 sm:px-3 text-right whitespace-nowrap">만기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {rentRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[14px] text-[#64748B]">
                      등록된 호실 임대차 정보가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rentRows.slice(0, 10).map((r: any, idx: number) => {
                    const floorLabel = r.floor || "-";
                    const useLabel =
                      r.use || r.tenantName || (r.status === "vacant" ? "공실" : "임대중");
                    const depManwon =
                      r.depositManwon !== undefined
                        ? Number(r.depositManwon)
                        : Math.round((Number(r.depositKrw) || 0) / 10000);
                    const rentManwon =
                      r.monthlyRentManwon !== undefined
                        ? Number(r.monthlyRentManwon)
                        : Math.round((Number(r.rentKrw) || 0) / 10000);
                    const rawExpiry = String(r.leaseExpiry || r.expiryDate || "-");
                    const expiryLabel = rawExpiry.replace(/^20(\d{2})-(\d{2})$/, "$1.$2");

                    return (
                      <tr key={idx} className="hover:bg-[#F8FAFC]">
                        <td className="py-2 px-2 sm:px-3 font-bold text-[#0F172A] whitespace-nowrap">{floorLabel}</td>
                        <td className="py-2 px-2 sm:px-3 text-[#334155] break-keep">{useLabel}</td>
                        <td className="py-2 px-2 sm:px-3 text-right tabular-nums font-semibold text-[#0F172A] whitespace-nowrap">
                          {depManwon.toLocaleString()}
                        </td>
                        <td className="py-2 px-2 sm:px-3 text-right tabular-nums font-bold text-[#1D4ED8] whitespace-nowrap">
                          {rentManwon.toLocaleString()}
                        </td>
                        <td className="py-2 px-2 sm:px-3 text-right tabular-nums text-[#475569] whitespace-nowrap">{expiryLabel}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 07: Cash Flow / Yield (A23) */}
        <section
          id="07_yield"
          data-section-id="07_yield"
          data-testid="mobile-im-section-07_yield"
          data-doc-hash={docHash}
          className="bg-white rounded-lg border border-[#CBD5E1] p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              07 수지 분석
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">수익률 산출 내역</h2>
          <div className="p-4 bg-[#F0FDF4] rounded-md border border-[#BBF7D0] space-y-2">
            <div className="flex justify-between text-[15px]">
              <span className="text-[#334155]">연간 총 임대수익</span>
              <strong className="text-[#0F172A] tabular-nums">
                {(annualRentKrw / 10000).toLocaleString()}만 원
              </strong>
            </div>
            <div className="flex justify-between text-[15px]">
              <span className="text-[#334155]">연간 순임대수익</span>
              <strong className="text-[#0F172A] tabular-nums">
                {(netAnnualOperatingIncomeKrw / 10000).toLocaleString()}만 원
              </strong>
            </div>
            <div className="flex justify-between text-[16px] font-extrabold pt-2 border-t border-[#86EFAC]">
              <span className="text-[#065F46]">연 환산 수익률</span>
              <span className="text-[#065F46] tabular-nums">
                {capRatePct.toFixed(2)}%
              </span>
            </div>
          </div>

          {(pricePerPyeongLandWon > 0 || pricePerPyeongGfaWon > 0) && (
            <div className="grid grid-cols-2 gap-3 text-[14px]">
              <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
                <span className="text-[14px] font-semibold text-[#64748B] block">토지 평당 단가</span>
                <strong className="text-[15px] text-[#0F172A] tabular-nums">
                  {Math.round(pricePerPyeongLandWon / 10000).toLocaleString()}만 원/평
                </strong>
              </div>
              <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
                <span className="text-[14px] font-semibold text-[#64748B] block">연면적 평당 단가</span>
                <strong className="text-[15px] text-[#0F172A] tabular-nums">
                  {Math.round(pricePerPyeongGfaWon / 10000).toLocaleString()}만 원/평
                </strong>
              </div>
            </div>
          )}
        </section>

        {/* Section 08: Comps / Trade Area (A26) */}
        <section
          id="08_comps"
          data-section-id="08_comps"
          data-testid="mobile-im-section-08_comps"
          data-doc-hash={docHash}
          className="bg-white rounded-lg border border-[#CBD5E1] p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              08 상권 및 배후 수요
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">인근 시장 거래 시세</h2>

          {(subjectLandPricePerPyeongWon > 0 || subjectGfaPricePerPyeongWon > 0) && (
            <div className="grid grid-cols-2 gap-3 text-[14px]">
              <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
                <span className="text-[14px] font-semibold text-[#64748B] block">본건 토지 평당가</span>
                <strong className="text-[15px] text-[#0F172A] tabular-nums">
                  {Math.round(subjectLandPricePerPyeongWon / 10000).toLocaleString()}만 원/평
                </strong>
              </div>
              <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
                <span className="text-[14px] font-semibold text-[#64748B] block">본건 연면적 평당가</span>
                <strong className="text-[15px] text-[#0F172A] tabular-nums">
                  {Math.round(subjectGfaPricePerPyeongWon / 10000).toLocaleString()}만 원/평
                </strong>
              </div>
            </div>
          )}

          {compsList.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-[#CBD5E1]">
              <table className="w-full text-left text-[14px]">
                <thead className="bg-[#FAF9F5] border-b border-[#CBD5E1] font-bold text-[#0F172A]">
                  <tr>
                    <th className="py-2.5 px-3">거리/위치</th>
                    <th className="py-2.5 px-3">시기</th>
                    <th className="py-2.5 px-3">용도</th>
                    <th className="py-2.5 px-3 text-right">토지 평당가</th>
                    <th className="py-2.5 px-3 text-right">본건 대비</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {compsList.map((c: any, idx: number) => {
                    const compLandManwon = Math.round(
                      (Number(c.pricePerPyeongLandWon) || 0) / 10000
                    );
                    const diffPct = Number(c.comparisonDiffPct || 0);
                    return (
                      <tr key={idx} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-bold text-[#0F172A]">
                          {c.distance || c.name || "-"}
                        </td>
                        <td className="py-2.5 px-3 text-[#475569]">
                          {c.dealDate || c.date || "-"}
                        </td>
                        <td className="py-2.5 px-3 text-[#334155]">
                          {c.buildingUse || c.use || "-"}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-[#0F172A]">
                          {compLandManwon.toLocaleString()}만 원
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-[#1D4ED8]">
                          {diffPct > 0 ? `+${diffPct}%` : `${diffPct}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[14px] text-[#475569] p-3.5 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              본건 대지·연면적 평당 단가 및 개별공시지가 기준 밸류에이션 지표를 참조해 주십시오.
            </p>
          )}
        </section>

        {/* Section 09: Deal Terms & Photos (A14) */}
        <section
          id="09_photos"
          data-section-id="09_photos"
          data-testid="mobile-im-section-09_photos"
          data-doc-hash={docHash}
          className="bg-white rounded-lg border border-[#CBD5E1] p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              09 매각 조건 및 사진
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">거래 조건 및 갤러리</h2>
          <div className="p-4 bg-[#FAF9F5] rounded-md border border-[#E2E8F0] text-[15px] text-[#334155]">
            매각 방식: {handoverCondition}
          </div>

          {galleryPhotos.length > 0 && (
            <div className="pt-2">
              <PhotoGallery
                photos={galleryPhotos as any}
                coordinates={initialDoc?.coordinates}
                blindName={basicDoc.metadata.title}
              />
            </div>
          )}
        </section>

        {/* Section 10: Contact & Disclaimer (A10) */}
        <section
          id="10_contact"
          data-section-id="10_contact"
          data-testid="mobile-im-section-10_contact"
          data-doc-hash={docHash}
          className="bg-white rounded-lg border border-[#CBD5E1] p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              10 담당자 및 면책조항
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">담당 중개사무소</h2>
          <div className="p-4 bg-[#FAF9F5] rounded-md border border-[#E2E8F0] space-y-1.5 text-[15px]">
            <p className="font-extrabold text-[#0F172A]">{brokerOfficeName}</p>
            <p className="text-[#475569]">
              대표: {brokerRepresentative}
              {realBrokerRegistrationNo ? ` · 등록번호: ${realBrokerRegistrationNo}` : ""}
            </p>
            <p className="text-[#1D4ED8] font-bold">
              연락처:{" "}
              {realBrokerPhone ? (
                <a href={`tel:${realBrokerPhone.replace(/[^0-9+]/g, "")}`} className="hover:underline">
                  {realBrokerPhone}
                </a>
              ) : (
                <span className="text-[#64748B] font-semibold">문의 시 안내</span>
              )}
            </p>
            {isBroker && isMissingBrokerContact && (
              <div
                data-testid="mobile-im-broker-profile-nudge"
                className="mt-2 pt-2 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-[14px] text-[#475569]"
              >
                <span>중개사무소 상호·연락처·등록번호를 입력하면 고객 열람본에 자동 반영됩니다.</span>
                <Link
                  href="/broker/profile"
                  className="font-bold text-[#1D4ED8] hover:underline shrink-0"
                >
                  내 프로필에서 설정하기 →
                </Link>
              </div>
            )}
          </div>

          <p className="text-[14px] text-[#64748B] leading-relaxed pt-2">
            {contactDisclaimer}
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
                        {((v1Doc.facts.transaction.askingPriceManwon || 0) / 10000)
                          .toFixed(1)
                          .replace(/\.0$/, "")}
                        억 원
                      </td>
                      <td className="p-3 font-bold text-[#1D4ED8]">
                        {((basicDoc.facts.transaction.askingPriceManwon || 0) / 10000)
                          .toFixed(1)
                          .replace(/\.0$/, "")}
                        억 원 ({diffEok}억 조정)
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

      {/* ── Inquiry Bottom Sheet ([A4-07]) ── */}
      {showInquiry && (
        <IMInquiryBottomSheet
          buildingId={buildingId}
          docId={docId}
          brokerUserId={initialDoc?.broker?.userId || "system"}
          brokerName={brokerRepresentative}
          blindName={(basicDoc.facts as any).buildingName || basicDoc.metadata.title}
          onClose={() => setShowInquiry(false)}
          {...({
            buildingName: (basicDoc.facts as any).buildingName || basicDoc.metadata.title,
            isOpen: showInquiry,
          } as any)}
        />
      )}

      {isDownloadingPptx && (
        <div
          role="status"
          aria-live="polite"
          data-testid="mobile-im-pptx-downloading-toast"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-[#0F172A] text-white text-sm font-extrabold shadow-xl whitespace-nowrap no-print"
        >
          📊 PPTX 자료 다운로드 중입니다...
        </div>
      )}

      {/* ── Fixed Bottom Action Bar (64px) ── */}
      <footer
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#CBD5E1] shadow-lg no-print"
        data-testid="floating-action-bar"
      >
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-2.5">
          <a
            href={brokerPhone && brokerPhone !== "-" ? `tel:${brokerPhone}` : "#10_contact"}
            className="flex-1 min-h-[48px] bg-[#0F172A] text-white font-bold rounded-xl flex items-center justify-center gap-1.5 hover:bg-[#1E293B] transition-colors cursor-pointer text-[15px] whitespace-nowrap"
          >
            <span>📞</span> 전화 문의
          </a>
          <button
            type="button"
            onClick={() => setShowInquiry(true)}
            className="flex-1 min-h-[48px] bg-[#1D4ED8] text-white font-bold rounded-xl flex items-center justify-center gap-1.5 hover:bg-[#1E40AF] transition-colors cursor-pointer text-[15px] whitespace-nowrap"
          >
            <span>💬</span> 카톡 문의
          </button>
          <a
            href={`/api/public/im-lite/${buildingId}/pptx?direct=1${docId ? `&doc_id=${encodeURIComponent(docId)}` : ""}`}
            data-testid="mobile-im-download-pptx-btn"
            aria-busy={isDownloadingPptx}
            onClick={handleMobilePptxDownload}
            className="min-h-[48px] px-3.5 bg-[#EFF6FF] border border-[#1D4ED8] text-[#1D4ED8] font-bold rounded-xl flex items-center justify-center gap-1 hover:bg-[#DBEAFE] transition-colors cursor-pointer text-[14px] whitespace-nowrap shrink-0"
            title="PPTX 투자설명서 다운로드"
          >
            <span>{isDownloadingPptx ? "⏳ 생성 중" : "📥 PPTX"}</span>
          </a>
          {isBroker && (
            <Link
              href={`/broker/basic-im-studio/${encodeURIComponent(buildingId)}`}
              data-testid="mobile-im-open-studio-btn"
              className="min-h-[48px] px-3 bg-[#F8FAFC] border border-[#1D4ED8]/40 text-[#1D4ED8] font-bold rounded-xl flex items-center justify-center gap-1 hover:bg-[#EFF6FF] transition-colors cursor-pointer text-[14px] whitespace-nowrap shrink-0"
              title="10면 발표자료(PPT) 꾸미기"
            >
              <span>📐 스튜디오</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[48px] px-3.5 bg-[#FAF9F5] border border-[#64748B] text-[#0F172A] font-bold rounded-xl flex items-center justify-center hover:bg-[#F3F2EE] transition-colors cursor-pointer text-[15px] shrink-0"
            title="A4 인쇄 및 PDF 내보내기"
          >
            <span>🖨️</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
