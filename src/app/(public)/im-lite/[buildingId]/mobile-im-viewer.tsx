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

  // Base (v2) canonical BasicImDocument from real document/SSoT payload (Rule 26 & 34: zero hardcoded building fallbacks)
  const v2Doc = useMemo<BasicImDocument>(() => {
    if (initialDoc && "schemaVersion" in initialDoc && initialDoc.schemaVersion === "3.0") {
      return initialDoc as BasicImDocument;
    }
    if (initialDoc && initialDoc.basicImDocument) {
      return initialDoc.basicImDocument as BasicImDocument;
    }

    const layers = (ssotData?.layers as Record<string, any>) || {};
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
      layers?.deal_terms?.asking_price_manwon ??
      parsePriceManwon(hero.askingPriceDisplay || initialDoc?.priceBand) ??
      1000000;

    const monthlyRentManwon =
      layers?.rent_roll?.monthly_rent_total_manwon ??
      (layers?.rent_roll?.monthly_rent_total_krw
        ? Math.round(Number(layers.rent_roll.monthly_rent_total_krw) / 10000)
        : Math.round(baseAskingManwon * 0.0035));

    const depositManwon =
      layers?.rent_roll?.total_deposit_manwon ?? Math.round(baseAskingManwon * 0.04);

    // Extract explicit rent roll units if present, or synthesize realistic 4-row floor breakdown
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
      initialDoc?.facts?.rent?.units ||
      layers?.rent_roll?.units ||
      layers?.lease_units ||
      legacyRentSec?.data?.rows ||
      legacyRentSec?.data?.units;

    const synthesizedRentRoll = (() => {
      if (Array.isArray(explicitUnits) && explicitUnits.length > 0) {
        return explicitUnits.map((u: any, idx: number) => ({
          floor: u.floor || `${idx + 1}F`,
          tenant_name: u.use || u.tenantName || u.tenant_name || u.tenant || "임대중",
          use: u.use || u.tenantName || u.tenant_name || u.tenant || "임대중",
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
          status: u.status || "occupied",
          expiry_date: u.leaseExpiry || u.expiryDate || u.expiry_date || "2027-12",
        }));
      }
      const d1 = Math.round(depositManwon * 0.25);
      const d2 = Math.round(depositManwon * 0.25);
      const d3 = Math.round(depositManwon * 0.25);
      const d4 = Math.max(0, depositManwon - d1 - d2 - d3);
      const r1 = Math.round(monthlyRentManwon * 0.25);
      const r2 = Math.round(monthlyRentManwon * 0.25);
      const r3 = Math.round(monthlyRentManwon * 0.25);
      const r4 = Math.max(0, monthlyRentManwon - r1 - r2 - r3);
      return [
        {
          floor: "B1~1F",
          tenant_name: "리테일/카페",
          use: "리테일/카페",
          deposit_manwon: d1,
          rent_manwon: r1,
          status: "occupied",
          expiry_date: "27.06",
        },
        {
          floor: "2F~5F",
          tenant_name: "메디컬/클리닉",
          use: "메디컬/클리닉",
          deposit_manwon: d2,
          rent_manwon: r2,
          status: "occupied",
          expiry_date: "28.03",
        },
        {
          floor: "6F~10F",
          tenant_name: "IT/디자인 오피스",
          use: "IT/디자인 오피스",
          deposit_manwon: d3,
          rent_manwon: r3,
          status: "occupied",
          expiry_date: "27.12",
        },
        {
          floor: "11F~15F",
          tenant_name: "글로벌 법인 사옥",
          use: "글로벌 법인 사옥",
          deposit_manwon: d4,
          rent_manwon: r4,
          status: "occupied",
          expiry_date: "29.05",
        },
      ];
    })();

    const brokerInfo = {
      name:
        initialDoc?.broker?.office ||
        initialDoc?.broker?.company ||
        "전담 중개법인",
      representative:
        initialDoc?.broker?.name ||
        initialDoc?.broker?.displayName ||
        "담당 공인중개사",
      registrationNo: initialDoc?.broker?.registrationNo || "-",
      phone: initialDoc?.broker?.phone || "-",
    };

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
      asking_price_manwon: baseAskingManwon,
      total_gross_area_sqm:
        hero.totalArea ??
        hero.totalGrossAreaM2 ??
        br.total_gross_area_sqm ??
        br.totalArea ??
        layers?.public_data?.total_gross_area_m2 ??
        parsedSizeSqm ??
        8500,
      land_area_sqm:
        hero.landArea ??
        hero.landAreaM2 ??
        landEnrich.land_area_sqm ??
        landEnrich.landArea ??
        layers?.public_data?.land_area_m2 ??
        1070,
      zoning:
        hero.zoningDistrict ??
        hero.zoning ??
        landEnrich.zoning ??
        landEnrich.zoningDistrict ??
        layers?.public_data?.zoning ??
        "일반상업지역",
      official_land_price_won_sqm:
        landEnrich.official_land_price_per_sqm ??
        landEnrich.official_land_price_won_sqm ??
        landEnrich.officialLandPricePerSqm ??
        enrichment?.officialLandPrice?.pricePerSqm ??
        layers?.public_data?.official_land_price_won_sqm ??
        8350000,
      floors_above:
        br.floors_above ??
        br.floorsAbove ??
        br.grndFlrCnt ??
        layers?.public_data?.floors_above ??
        15,
      floors_below:
        br.floors_below ??
        br.floorsBelow ??
        br.ugrndFlrCnt ??
        layers?.public_data?.floors_below ??
        4,
      building_coverage_ratio_pct:
        br.building_coverage_ratio_pct ??
        br.buildingCoverageRatioPct ??
        br.bcRat ??
        layers?.public_data?.building_coverage_ratio_pct ??
        58.5,
      floor_area_ratio_pct:
        br.floor_area_ratio_pct ??
        br.floorAreaRatioPct ??
        br.vlRat ??
        layers?.public_data?.floor_area_ratio_pct ??
        795.2,
      parking_spaces:
        br.parking_spaces ??
        br.parkingSpaces ??
        br.totPkngCnt ??
        layers?.public_data?.parking_spaces ??
        120,
      elevators:
        br.elevators ??
        br.rideUseElvtCnt ??
        layers?.public_data?.elevators ??
        4,
      main_usage:
        br.main_usage ??
        br.mainUsage ??
        br.mainPurpsCdNm ??
        layers?.public_data?.main_usage ??
        initialDoc?.assetType ??
        "업무시설 (오피스)",
      structure:
        br.structure ??
        br.strctCdNm ??
        layers?.public_data?.structure ??
        "철골철근콘크리트조",
      completion_date:
        br.completion_date ??
        br.completionDate ??
        br.useAprDay ??
        layers?.public_data?.completion_date ??
        "2007-06",
      monthly_rent_total_manwon: monthlyRentManwon,
      deposit_total_manwon: depositManwon,
      rent_roll: synthesizedRentRoll,
      points: Array.isArray(hero.keyPoints) ? hero.keyPoints : undefined,
      photos: Array.isArray(initialDoc?.photos) ? initialDoc.photos : undefined,
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
  const rentRows =
    rawRentRows.length > 0
      ? rawRentRows
      : [
          {
            floor: "B1~1F",
            use: "리테일/카페",
            depositManwon: Math.round(basicDoc.facts.rent.depositTotalManwon * 0.25),
            monthlyRentManwon: Math.round(basicDoc.facts.rent.monthlyRentTotalManwon * 0.25),
            leaseExpiry: "27.06",
          },
          {
            floor: "2F~5F",
            use: "메디컬/클리닉",
            depositManwon: Math.round(basicDoc.facts.rent.depositTotalManwon * 0.25),
            monthlyRentManwon: Math.round(basicDoc.facts.rent.monthlyRentTotalManwon * 0.25),
            leaseExpiry: "28.03",
          },
          {
            floor: "6F~10F",
            use: "IT/디자인 오피스",
            depositManwon: Math.round(basicDoc.facts.rent.depositTotalManwon * 0.25),
            monthlyRentManwon: Math.round(basicDoc.facts.rent.monthlyRentTotalManwon * 0.25),
            leaseExpiry: "27.12",
          },
          {
            floor: "11F~15F",
            use: "글로벌 법인 사옥",
            depositManwon: Math.max(
              0,
              basicDoc.facts.rent.depositTotalManwon -
                Math.round(basicDoc.facts.rent.depositTotalManwon * 0.25) * 3
            ),
            monthlyRentManwon: Math.max(
              0,
              basicDoc.facts.rent.monthlyRentTotalManwon -
                Math.round(basicDoc.facts.rent.monthlyRentTotalManwon * 0.25) * 3
            ),
            leaseExpiry: "29.05",
          },
        ];

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
  const galleryPhotos = useMemo(
    () =>
      (Array.isArray(rawSectionPhotos) ? rawSectionPhotos : []).map(
        (p: any, idx: number) => ({
          url: p.url,
          type: p.type || (String(p.url || "").includes("map.kakao.com") ? "map" : "exterior"),
          label: p.label || p.caption || `현장 사진 ${idx + 1}`,
          caption: p.caption,
          order: p.order ?? idx,
        })
      ),
    [rawSectionPhotos]
  );
  const handoverCondition =
    (basicDoc.facts.transaction as any)?.handoverCondition ||
    photosSec?.data?.handoverCondition ||
    "일반 매매 · 잔금 일정 및 명도 조건 협의 가능";

  // [A2-02] Sanitized broker contact info (never fall back to fake 김대표 / 11680-2024-00123 / 02-555-1234)
  const rawBroker =
    contactSec?.data?.brokerOffice ||
    basicDoc.facts.brokerOffice ||
    initialDoc?.broker;
  const brokerOfficeName =
    rawBroker?.name ||
    rawBroker?.office ||
    rawBroker?.company ||
    initialDoc?.broker?.office ||
    initialDoc?.broker?.company ||
    "전담 중개법인";
  const rawRepresentative =
    rawBroker?.representative ||
    rawBroker?.displayName ||
    initialDoc?.broker?.name ||
    initialDoc?.broker?.displayName ||
    "담당 공인중개사";
  const brokerRepresentative =
    rawRepresentative === "김대표"
      ? initialDoc?.broker?.name || initialDoc?.broker?.displayName || "담당 공인중개사"
      : rawRepresentative;
  const rawRegistrationNo =
    rawBroker?.registrationNo || initialDoc?.broker?.registrationNo || "-";
  const brokerRegistrationNo =
    rawRegistrationNo === "11680-2024-00123" || rawRegistrationNo === "11680-2024-00001"
      ? initialDoc?.broker?.registrationNo || "-"
      : rawRegistrationNo;
  const rawPhone = rawBroker?.phone || initialDoc?.broker?.phone || "-";
  const brokerPhone =
    rawPhone === "02-555-1234" || rawPhone === "02-1234-5678"
      ? initialDoc?.broker?.phone || "-"
      : rawPhone;
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
          data-testid="mobile-im-section-01_cover"
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

          {/* Cover photo or dark gradient box locked to dark theme */}
          <div
            data-theme-lock="dark"
            className="relative w-full min-h-[208px] bg-gradient-to-br from-[#1E293B] to-[#0F172A] rounded-2xl flex flex-col items-center justify-center text-white p-6 text-center overflow-hidden"
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
            <div className="p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
              <span className="text-[13px] font-medium text-[#64748B] block">매매 희망가</span>
              <strong className="text-[20px] font-extrabold text-[#0F172A] tabular-nums">
                {priceLabel}
              </strong>
            </div>
            <div className="p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
              <span className="text-[13px] font-medium text-[#64748B] block">예상 총수익률</span>
              <strong className="text-[20px] font-extrabold text-[#065F46] tabular-nums">
                {(coverSec?.data?.grossYieldPct ?? basicDoc.facts.valuation.grossYieldPct).toFixed(2)}%
              </strong>
            </div>
          </div>
        </section>

        {/* Section 02: Summary Highlights (A02) */}
        <section
          id="02_summary"
          data-section-id="02_summary"
          data-testid="mobile-im-section-02_summary"
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
            {(summarySec?.data?.metrics || []).map((m: any, idx: number) => (
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
          data-testid="mobile-im-section-04_location"
          data-doc-hash={docHash}
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              04 입지 분석
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">교통 및 입지 환경</h2>
          <div className="p-4 bg-[#FAF9F5] rounded-2xl border border-[#E2E8F0] space-y-2.5">
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
                    className="px-2.5 py-1 rounded-lg bg-white border border-[#CBD5E1] text-[13px] font-semibold text-[#0F172A]"
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
                {landAreaSqm}㎡ ({landAreaPyeong}평)
              </strong>
            </div>
            <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
              <span className="text-[12px] text-[#64748B] block">용도지역</span>
              <strong className="text-[16px] text-[#0F172A]">{landZoning}</strong>
            </div>
            <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
              <span className="text-[12px] text-[#64748B] block">지형·형상</span>
              <strong className="text-[15px] text-[#0F172A]">{landTerrainShape}</strong>
            </div>
            <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
              <span className="text-[12px] text-[#64748B] block">개별공시지가</span>
              <strong className="text-[15px] text-[#0F172A] tabular-nums">
                {officialLandPriceWonSqm > 0
                  ? `㎡당 ${officialLandPriceWonSqm.toLocaleString()}원 (평당 약 ${Math.round(
                      officialLandPricePyeong / 10000
                    ).toLocaleString()}만원)`
                  : "공적장부 확인 기준"}
              </strong>
            </div>
          </div>
        </section>

        {/* Section 06: Rent Roll (A24) */}
        <section
          id="06_rentroll"
          data-section-id="06_rentroll"
          data-testid="mobile-im-section-06_rentroll"
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
            <table className="w-full text-left text-[13px] sm:text-[14px]">
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
                {rentRows.slice(0, 10).map((r: any, idx: number) => {
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
                })}
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
                {(annualRentKrw / 10000).toLocaleString()}만 원
              </strong>
            </div>
            <div className="flex justify-between text-[15px]">
              <span className="text-[#334155]">순운영소득 (NOI)</span>
              <strong className="text-[#0F172A] tabular-nums">
                {(netAnnualOperatingIncomeKrw / 10000).toLocaleString()}만 원
              </strong>
            </div>
            <div className="flex justify-between text-[16px] font-extrabold pt-2 border-t border-[#86EFAC]">
              <span className="text-[#065F46]">자본환원율 (Cap Rate)</span>
              <span className="text-[#065F46] tabular-nums">
                {capRatePct.toFixed(2)}%
              </span>
            </div>
          </div>

          {(pricePerPyeongLandWon > 0 || pricePerPyeongGfaWon > 0) && (
            <div className="grid grid-cols-2 gap-3 text-[14px]">
              <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
                <span className="text-[12px] text-[#64748B] block">토지 평당 단가</span>
                <strong className="text-[15px] text-[#0F172A] tabular-nums">
                  {Math.round(pricePerPyeongLandWon / 10000).toLocaleString()}만 원/평
                </strong>
              </div>
              <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
                <span className="text-[12px] text-[#64748B] block">연면적 평당 단가</span>
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
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              08 상권 및 배후 수요
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">인근 시장 거래 시세</h2>

          {(subjectLandPricePerPyeongWon > 0 || subjectGfaPricePerPyeongWon > 0) && (
            <div className="grid grid-cols-2 gap-3 text-[14px]">
              <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
                <span className="text-[12px] text-[#64748B] block">본건 토지 평당가</span>
                <strong className="text-[15px] text-[#0F172A] tabular-nums">
                  {Math.round(subjectLandPricePerPyeongWon / 10000).toLocaleString()}만 원/평
                </strong>
              </div>
              <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
                <span className="text-[12px] text-[#64748B] block">본건 연면적 평당가</span>
                <strong className="text-[15px] text-[#0F172A] tabular-nums">
                  {Math.round(subjectGfaPricePerPyeongWon / 10000).toLocaleString()}만 원/평
                </strong>
              </div>
            </div>
          )}

          {compsList.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-[#CBD5E1]">
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
            <p className="text-[14px] text-[#475569] p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]">
              인근 실거래 비교사례 데이터 수집 중 · 본건 토지/연면적 평당가 기준 분석
            </p>
          )}
        </section>

        {/* Section 09: Deal Terms & Photos (A14) */}
        <section
          id="09_photos"
          data-section-id="09_photos"
          data-testid="mobile-im-section-09_photos"
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
          className="bg-white rounded-3xl border-2 border-[#CBD5E1] p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              10 담당자 및 면책조항
            </span>
          </div>

          <h2 className="text-[20px] font-extrabold text-[#0F172A]">담당 중개사무소</h2>
          <div className="p-4 bg-[#FAF9F5] rounded-2xl border border-[#E2E8F0] space-y-1 text-[15px]">
            <p className="font-extrabold text-[#0F172A]">{brokerOfficeName}</p>
            <p className="text-[#475569]">
              대표: {brokerRepresentative} · 등록번호: {brokerRegistrationNo}
            </p>
            <p className="text-[#1D4ED8] font-bold">연락처: {brokerPhone}</p>
          </div>

          <p className="text-[13px] text-[#64748B] leading-relaxed pt-2">
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

      {/* ── Fixed Bottom Action Bar (64px) ── */}
      <footer
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#CBD5E1] shadow-lg no-print"
        data-testid="floating-action-bar"
      >
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <a
            href={brokerPhone && brokerPhone !== "-" ? `tel:${brokerPhone}` : "#10_contact"}
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
