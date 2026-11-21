"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
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
  extractValuationFacts,
  type PureBuildingFacts,
} from "@/domain/building/im-core/facts";
import {
  resolveLeaseOccupancy,
  summarizeLeaseOccupancy,
  sumLeasedRentRoll,
} from "@/domain/building/mobile-im/lease-vacancy";
import { buildYieldSetFromBody } from "@/domain/building/mobile-im/yield-set";
import { FlatProfileCard } from "@/components/broker/flat-profile-card";
import { HeroCard } from "./hero-card";
import { DCFHeatmap } from "./dcf-heatmap";
import { LeverageChart } from "./leverage-chart";
import { StackingPlanView } from "@/components/im/stacking-plan-view";
import { useDealcardRealtimeSync } from "@/platform/im-pipeline/realtime/use-dealcard-realtime-sync";
import {
  KakaoStaticMap,
  PhotoGallery,
  SectionCard,
  FloatingActionBar,
  ShareButton,
} from "./components";

const IMInquiryBottomSheet = dynamic(
  () =>
    import("./components/im-inquiry-bottom-sheet").then(
      (m) => m.IMInquiryBottomSheet
    ),
  { ssr: false, loading: () => null }
);
import {
  isInAppWebView,
  buildKakaoExternalOpenUrl,
  isExplicitKakaoChannelUrl,
} from "./components/floating-action-bar";
import { copyText, COPY_FAILED_MESSAGE } from "@/lib/ux/clipboard";
import { toast } from "sonner";
import {
  BROKER_VIEWER_PLACEHOLDERS,
  sanitizeStatutoryField,
} from "@/lib/legal/broker-statutory-disclosure";
import { ReaderFontScaleToggle } from "@/components/ui/ReaderFontScaleToggle";

export { isInAppWebView, buildKakaoExternalOpenUrl };

interface Props {
  document: (MobileIMDocument & { basicImDocument?: BasicImDocument }) | BasicImDocument | any | null;
  buildingId: string;
  ssotData?: Record<string, unknown>;
  docId?: string;
  isBroker?: boolean;
  shareToken?: string;
}

const CANONICAL_SECTION_CHIPS = [
  { id: "01_cover", label: "표지" },
  { id: "02_summary", label: "투자 하이라이트" },
  { id: "03_overview", label: "건축물 개요" },
  { id: "04_location", label: "입지 분석" },
  { id: "05_land", label: "토지·도시계획" },
  { id: "06_rentroll", label: "층별 임대차" },
  { id: "07_yield", label: "수익률" },
  { id: "08_comps", label: "인근 실거래" },
  { id: "09_photos", label: "사진·조건" },
  { id: "10_contact", label: "문의" },
] as const;

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

function cleanViewerBrokerField(
  val?: unknown,
  kind?: "name" | "regNo" | "officeName" | "address" | "phone"
): string {
  if (!val || typeof val !== "string") return "";
  const cleaned = val.replace(/\s*\(확인\s*중\)/g, "").trim();
  if (BROKER_VIEWER_PLACEHOLDERS.has(cleaned)) return "";
  return sanitizeStatutoryField(cleaned, kind) || "";
}

export function MobileIMViewer({
  document: initialDoc,
  buildingId,
  ssotData,
  docId,
  // WP-7.3D P2-4: broker UI must be opted-in by a server-verified owner check (default off).
  isBroker = false,
  shareToken,
}: Props) {
  // Version state: v1 <-> v2 (only active when real previousVersion history exists)
  const [selectedVersion, setSelectedVersion] = useState<"v1" | "v2">("v2");
  const [showDiffModal, setShowDiffModal] = useState<boolean>(false);
  const [showAllRentRows, setShowAllRentRows] = useState<boolean>(false);
  const [activeSectionId, setActiveSectionId] = useState<string>("01_cover");
  const [showInquiry, setShowInquiry] = useState<boolean>(false);
  const [isDownloadingPptx, setIsDownloadingPptx] = useState<boolean>(false);
  const [inAppWebView, setInAppWebView] = useState<boolean>(false);
  const [dismissedWebViewBanner, setDismissedWebViewBanner] = useState<boolean>(false);
  const mountedAtRef = useRef<number>(Date.now());
  const activeSectionRef = useRef<string>("01_cover");
  const dwellSentRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && isInAppWebView(navigator.userAgent)) {
      setInAppWebView(true);
    }
  }, []);

  useEffect(() => {
    activeSectionRef.current = activeSectionId;
  }, [activeSectionId]);

  useEffect(() => {
    if (!buildingId) return;
    const resolvedToken =
      (shareToken && shareToken.trim()) ||
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("token")?.trim() || undefined
        : undefined);
    // Avoid recording owner self-preview clicks unless visiting with an issued recipient share token
    if (isBroker && !resolvedToken) return;

    mountedAtRef.current = Date.now();
    dwellSentRef.current = false;

    const endpoint = `/api/public/im-lite/${encodeURIComponent(buildingId)}/view`;
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section_viewed: activeSectionRef.current,
        ...(resolvedToken ? { share_token: resolvedToken } : {}),
      }),
    }).catch(() => {});

    const sendDwell = () => {
      if (dwellSentRef.current) return;
      dwellSentRef.current = true;
      const dwellSeconds = Math.max(1, Math.round((Date.now() - mountedAtRef.current) / 1000));
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          dwell_seconds: dwellSeconds,
          section_viewed: activeSectionRef.current,
          ...(resolvedToken ? { share_token: resolvedToken } : {}),
        }),
      }).catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        sendDwell();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendDwell);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendDwell);
    };
  }, [buildingId, isBroker, shareToken]);

  const resolvedPptxDownloadUrl = useMemo(() => {
    const effectiveToken =
      (typeof shareToken === "string" && shareToken.trim()) ||
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("token")?.trim() || ""
        : "");
    const prebuiltUrl = (initialDoc as any)?.pptxDownloadUrl;
    if (typeof prebuiltUrl === "string" && prebuiltUrl.trim()) {
      return prebuiltUrl.trim();
    }
    const grantId = (initialDoc as any)?.grantId;
    if (typeof grantId === "string" && grantId.trim()) {
      return `/api/public/im-pro/${encodeURIComponent(grantId.trim())}/pptx${
        effectiveToken ? `?token=${encodeURIComponent(effectiveToken)}` : ""
      }`;
    }
    return `/api/public/im-lite/${encodeURIComponent(buildingId)}/pptx?direct=1${
      docId ? `&doc_id=${encodeURIComponent(docId)}` : ""
    }${effectiveToken ? `&token=${encodeURIComponent(effectiveToken)}` : ""}`;
  }, [initialDoc, buildingId, docId, shareToken]);

  const hasDirectPrebuiltPptxUrl = Boolean(
    (typeof (initialDoc as any)?.pptxDownloadUrl === "string" &&
      (initialDoc as any).pptxDownloadUrl.trim()) ||
      (typeof (initialDoc as any)?.grantId === "string" && (initialDoc as any).grantId.trim())
  );

  const handleOpenExternalBrowser = useCallback(async () => {
    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const externalUrl = buildKakaoExternalOpenUrl(currentUrl, ua);
    if (externalUrl) {
      try {
        window.location.assign(externalUrl);
        return;
      } catch {
        // Fall through to copyText link fallback
      }
    }
    const ok = await copyText(currentUrl);
    if (ok) {
      toast.success("링크가 복사되었습니다. Safari 또는 Chrome 주소창에 붙여넣어 열어주세요.");
    } else {
      toast.error(COPY_FAILED_MESSAGE);
    }
  }, []);

  const handleCopyViewerLink = useCallback(async () => {
    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    const ok = await copyText(currentUrl);
    if (ok) {
      toast.success("링크가 복사되었습니다. 외부 브라우저 주소창에 붙여넣어 주세요.");
    } else {
      toast.error(COPY_FAILED_MESSAGE);
    }
  }, []);

  const handleMobilePptxDownload = useCallback(
    async (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (isDownloadingPptx) return;

      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      const inWebView = isInAppWebView(ua);

      if (inWebView) {
        setInAppWebView(true);
        setDismissedWebViewBanner(false);
        toast.info(
          "카카오톡 등 앱 내 브라우저에서는 파일 저장이 차단될 수 있습니다. 외부 브라우저(Safari/Chrome)로 열기를 이용해 주세요.",
          {
            action: {
              label: "외부 브라우저(Safari/Chrome)로 열기",
              onClick: () => {
                void handleOpenExternalBrowser();
              },
            },
          }
        );
        try {
          window.location.assign(resolvedPptxDownloadUrl);
        } catch {
          toast.error("다운로드 창을 열지 못했습니다. 상단 '외부 브라우저로 열기'를 눌러주세요.");
        }
        return;
      }

      if (hasDirectPrebuiltPptxUrl || /iPhone|iPad|iPod|Android/i.test(ua)) {
        try {
          window.location.assign(resolvedPptxDownloadUrl);
        } catch {
          toast.error("PPTX 파일 다운로드를 시작하지 못했습니다.");
        }
        return;
      }

      setIsDownloadingPptx(true);
      try {
        const res = await fetch(resolvedPptxDownloadUrl, { cache: "no-store" });
        if (!res.ok) {
          let errMsg = "PPTX 자료를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.";
          try {
            const errJson = await res.json();
            if (typeof errJson?.reason === "string" && errJson.reason.trim()) {
              errMsg = errJson.reason.trim();
            } else if (typeof errJson?.error === "string" && errJson.error.trim()) {
              errMsg = errJson.error.trim();
            }
          } catch {
            // Non-JSON error body
          }
          toast.error(errMsg);
          return;
        }
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
        toast.error("PPTX 다운로드 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setIsDownloadingPptx(false);
      }
    },
    [
      buildingId,
      hasDirectPrebuiltPptxUrl,
      handleOpenExternalBrowser,
      isDownloadingPptx,
      resolvedPptxDownloadUrl,
    ]
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

    const normalizedLeaseRows =
      Array.isArray(explicitUnits) && explicitUnits.length > 0
        ? explicitUnits.map((u: any, idx: number) => {
            const depMan =
              u?.depositManwon ??
              u?.deposit_manwon ??
              (u?.depositKrw !== undefined
                ? Math.round(Number(u.depositKrw) / 10000)
                : u?.deposit_krw !== undefined
                ? Math.round(Number(u.deposit_krw) / 10000)
                : 0);
            const rentMan =
              u?.monthlyRentManwon ??
              u?.rent_manwon ??
              (u?.rentKrw !== undefined
                ? Math.round(Number(u.rentKrw) / 10000)
                : u?.rent_krw !== undefined
                ? Math.round(Number(u.rent_krw) / 10000)
                : 0);
            const rawText = [
              u?.lease_state,
              u?.leaseState,
              u?.tenant_type,
              u?.tenantType,
              u?.use,
              u?.tenantName,
              u?.tenant_name,
              u?.tenant,
            ]
              .filter(Boolean)
              .join(" ");
            const hasFutureTransition = /입주\s*예정|전환\s*예정|명도\s*후\s*사옥|사옥\s*사용\s*가능/i.test(
              rawText
            );
            const hasPositiveRent = Number(rentMan) > 0;
            const explicitOwnerKeyword =
              !hasFutureTransition &&
              (u?.status === "owner" ||
                u?.lease_state === "자가사용" ||
                u?.lease_state === "자가" ||
                (!hasPositiveRent &&
                  /(?:^|[\s/()·])(?:자가사용|자가|사옥)(?:$|[\s/()·])/.test(rawText)));
            const explicitVacantKeyword =
              u?.status === "vacant" ||
              u?.is_vacant === true ||
              u?.lease_state === "공실" ||
              /(?:^|[\s/()·])공실(?:$|[\s/()·])/.test(rawText);
            const rawExpiry = String(
              u?.leaseExpiry ?? u?.expiryDate ?? u?.expiry_date ?? u?.lease_end ?? ""
            ).trim();
            const normalizedCandidate = {
              ...u,
              floor: u?.floor || `${idx + 1}F`,
              lease_state: explicitVacantKeyword
                ? "공실"
                : explicitOwnerKeyword
                ? "자가사용"
                : u?.lease_state ?? u?.leaseState,
              tenant_name: u?.tenantName ?? u?.tenant_name ?? u?.use ?? "",
              tenant_type: u?.tenantType ?? u?.tenant_type ?? u?.use ?? "",
              use: u?.use ?? u?.tenantName ?? u?.tenant_name ?? "",
              deposit_manwon: Number(depMan) || 0,
              rent_manwon: Number(rentMan) || 0,
              monthly_rent_manwon: Number(rentMan) || 0,
              is_vacant: Boolean(explicitVacantKeyword),
              lease_end: rawExpiry && rawExpiry !== "-" ? rawExpiry : "",
            };
            const occ = resolveLeaseOccupancy(normalizedCandidate);
            return {
              ...normalizedCandidate,
              resolvedOccupancy: occ,
              cleanExpiry: rawExpiry && rawExpiry !== "-" ? rawExpiry : "-",
            };
          })
        : null;

    const leasedSums = normalizedLeaseRows ? sumLeasedRentRoll(normalizedLeaseRows) : null;
    const leaseOccSummary = normalizedLeaseRows
      ? summarizeLeaseOccupancy(normalizedLeaseRows)
      : null;

    const monthlyRentManwon =
      leasedSums?.monthlyRentManwon ??
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
      leasedSums?.depositManwon ??
      ssotSummary?.total_deposit_manwon ??
      (ssotSummary?.total_deposit_krw
        ? Math.round(Number(ssotSummary.total_deposit_krw) / 10000)
        : undefined) ??
      layers?.rent_roll?.total_deposit_manwon ??
      0;

    const synthesizedRentRoll = (() => {
      if (normalizedLeaseRows && normalizedLeaseRows.length > 0) {
        return normalizedLeaseRows.map((u: any) => {
          const isVacant = u.resolvedOccupancy === "공실";
          const isOwner = u.resolvedOccupancy === "자가사용";
          const label =
            u.use ||
            [u.tenantName || u.tenant_name, u.tenant_type].filter(Boolean).join(" / ") ||
            u.tenant ||
            (isVacant ? "공실" : isOwner ? "자가사용" : "임대중");
          return {
            floor: u.floor,
            tenant_name: label,
            use: label,
            area_sqm:
              Number(
                u.area_sqm ??
                  u.area_m2 ??
                  u.areaSqm ??
                  (u.area_pyeong
                    ? Number(u.area_pyeong) * 3.305785
                    : u.areaPyeong
                    ? Number(u.areaPyeong) * 3.305785
                    : 0)
              ) || undefined,
            deposit_manwon: u.deposit_manwon,
            rent_manwon: u.rent_manwon,
            lease_state: u.resolvedOccupancy,
            status: isVacant ? "vacant" : isOwner ? "owner" : "occupied",
            expiry_date: u.cleanExpiry !== "-" ? u.cleanExpiry : undefined,
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

    const topBrokerProfile = (initialDoc as any)?.brokerProfile;
    const ssotBrokerProfile = (ssotData as any)?.brokerProfile || (ssotData as any)?.broker;
    const brokerInfo = {
      name:
        cleanViewerBrokerField(initialDoc?.broker?.office, "officeName") ||
        cleanViewerBrokerField(initialDoc?.broker?.company, "officeName") ||
        cleanViewerBrokerField(initialDoc?.broker?.officeName, "officeName") ||
        cleanViewerBrokerField(topBrokerProfile?.company, "officeName") ||
        cleanViewerBrokerField(topBrokerProfile?.officeName, "officeName") ||
        cleanViewerBrokerField(ssotBrokerProfile?.company, "officeName") ||
        cleanViewerBrokerField(ssotBrokerProfile?.officeName, "officeName") ||
        "전담 중개사무소",
      representative:
        cleanViewerBrokerField(initialDoc?.broker?.representativeName, "name") ||
        cleanViewerBrokerField(initialDoc?.broker?.representative_name, "name") ||
        cleanViewerBrokerField(initialDoc?.broker?.name, "name") ||
        cleanViewerBrokerField(initialDoc?.broker?.displayName, "name") ||
        cleanViewerBrokerField(topBrokerProfile?.representativeName, "name") ||
        cleanViewerBrokerField(topBrokerProfile?.representative_name, "name") ||
        cleanViewerBrokerField(topBrokerProfile?.displayName, "name") ||
        cleanViewerBrokerField(ssotBrokerProfile?.representativeName, "name") ||
        cleanViewerBrokerField(ssotBrokerProfile?.representative_name, "name") ||
        cleanViewerBrokerField(ssotBrokerProfile?.displayName, "name") ||
        "담당 공인중개사",
      registrationNo:
        cleanViewerBrokerField(initialDoc?.broker?.registrationNo, "regNo") ||
        cleanViewerBrokerField(initialDoc?.broker?.officeRegNumber, "regNo") ||
        cleanViewerBrokerField(initialDoc?.broker?.office_reg_number, "regNo") ||
        cleanViewerBrokerField(topBrokerProfile?.registrationNo, "regNo") ||
        cleanViewerBrokerField(topBrokerProfile?.officeRegNumber, "regNo") ||
        cleanViewerBrokerField(topBrokerProfile?.office_reg_number, "regNo") ||
        cleanViewerBrokerField(ssotBrokerProfile?.registrationNo, "regNo") ||
        cleanViewerBrokerField(ssotBrokerProfile?.officeRegNumber, "regNo") ||
        cleanViewerBrokerField(ssotBrokerProfile?.office_reg_number, "regNo") ||
        "-",
      address:
        cleanViewerBrokerField(initialDoc?.broker?.officeAddress, "address") ||
        cleanViewerBrokerField(initialDoc?.broker?.office_address, "address") ||
        cleanViewerBrokerField(initialDoc?.broker?.address, "address") ||
        cleanViewerBrokerField(topBrokerProfile?.officeAddress, "address") ||
        cleanViewerBrokerField(topBrokerProfile?.office_address, "address") ||
        cleanViewerBrokerField(ssotBrokerProfile?.officeAddress, "address") ||
        cleanViewerBrokerField(ssotBrokerProfile?.office_address, "address") ||
        undefined,
      phone:
        cleanViewerBrokerField(initialDoc?.broker?.phone, "phone") ||
        cleanViewerBrokerField(topBrokerProfile?.phone, "phone") ||
        cleanViewerBrokerField(ssotBrokerProfile?.phone, "phone") ||
        "-",
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
        0,
      main_usage:
        ssotSummary?.main_usage ??
        br.main_usage ??
        br.mainUsage ??
        br.mainPurpsCdNm ??
        layers?.public_data?.main_usage ??
        initialDoc?.assetType ??
        "-",
      structure:
        ssotSummary?.structure ??
        br.structure ??
        br.strctCdNm ??
        layers?.public_data?.structure ??
        "-",
      completion_date:
        ssotSummary?.completion_date ??
        br.completion_date ??
        br.completionDate ??
        br.useAprDay ??
        layers?.public_data?.completion_date ??
        "-",
      pnu:
        (initialDoc as any)?.pnu ??
        ssotSummary?.pnu ??
        enrichment?.pnu ??
        (ssotData as any)?.pnu ??
        undefined,
      enrichment,
      financials: initialDoc?.financials,
      heroCard: hero,
      ssot_summary: ssotSummary,
      monthly_rent_total_manwon: monthlyRentManwon,
      deposit_total_manwon: depositManwon,
      rent_roll: synthesizedRentRoll,
      comps:
        (initialDoc as any)?.comps ||
        (initialDoc as any)?.comparable_transactions ||
        (initialDoc as any)?.comparableTransactions ||
        (initialDoc as any)?.broker_extras?.market_comps ||
        undefined,
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

    // Align occupancy with lease-vacancy SSoT (Rule 75: excluding self-use & non-leasable from vacancy denominator)
    if (leaseOccSummary && leaseOccSummary.total > 0) {
      const occPct =
        leaseOccSummary.vacancyPct != null
          ? Math.max(0, Math.round((100 - leaseOccSummary.vacancyPct) * 10) / 10)
          : facts.rent.occupancyRatePct;
      facts.rent = {
        ...facts.rent,
        unitCount: leaseOccSummary.total,
        occupiedCount: leaseOccSummary.leased + leaseOccSummary.ownerUse,
        ...(leaseOccSummary.ownerUse > 0 ? { ownerOccupiedCount: leaseOccSummary.ownerUse } : {}),
        vacantCount: leaseOccSummary.vacant,
        occupancyRatePct: occPct,
      };
    }

    // Align Cap Rate / NOI / Gross Yield with FinancialCalculator / YieldSet SSoT when claims exist
    if (initialDoc?.financials || initialDoc?.heroCard) {
      const yieldSet = buildYieldSetFromBody({
        ...(initialDoc || {}),
        asking_price_manwon: baseAskingManwon || undefined,
        floor_leases: normalizedLeaseRows || (initialDoc as any)?.floor_leases,
        ssot_summary: {
          ...ssotSummary,
          asking_price_manwon: ssotSummary?.asking_price_manwon ?? (baseAskingManwon || undefined),
          total_deposit_manwon: ssotSummary?.total_deposit_manwon ?? depositManwon,
          monthly_rent_total_krw:
            ssotSummary?.monthly_rent_total_krw ?? monthlyRentManwon * 10000,
        },
      });
      const heroNoiKrw =
        typeof hero?.noiBaseBil === "number" && Number.isFinite(hero.noiBaseBil)
          ? Math.round(hero.noiBaseBil * 1e8)
          : null;
      const heroCapPct =
        typeof hero?.capRateBase === "number" && Number.isFinite(hero.capRateBase)
          ? hero.capRateBase
          : null;
      facts.valuation = extractValuationFacts(
        facts.transaction.askingPriceKrw,
        facts.rent.depositTotalKrw,
        facts.rent.monthlyRentTotalKrw,
        facts.rent.maintenanceFeeMonthlyKrw,
        facts.transaction.expectedLoanKrw,
        4.5,
        {
          noiBaseKrw: yieldSet.noiBaseKrw ?? heroNoiKrw,
          capRatePct: yieldSet.noiCapRate ?? heroCapPct,
          grossYieldPct: yieldSet.grossYieldNetOfDeposit,
          grossYieldOnPricePct: yieldSet.grossYieldOnPrice,
          cashOnCashPct:
            typeof initialDoc?.financials?.leveragedYield === "number"
              ? initialDoc.financials.leveragedYield
              : null,
        }
      );
    }

    return buildBasicImDocument(facts);
  }, [initialDoc, ssotData, buildingId]);

  // Real previous version document ONLY when document.previousVersion history exists (zero synthetic v1 math)
  const v1Doc = useMemo<BasicImDocument | null>(() => {
    const prev = (initialDoc as any)?.previousVersion;
    if (!prev || typeof prev !== "object") return null;
    if (prev.basicImDocument && prev.basicImDocument.facts) {
      return prev.basicImDocument as BasicImDocument;
    }
    if ("schemaVersion" in prev && prev.schemaVersion === "3.0" && prev.facts) {
      return prev as BasicImDocument;
    }
    if (prev.facts && prev.facts.transaction) {
      return buildBasicImDocument(prev.facts as PureBuildingFacts);
    }
    return buildBasicImDocument(extractPureBuildingFacts(prev));
  }, [initialDoc]);

  // Active document switches between v2 (latest) and real v1 (when previousVersion exists)
  const rawBasicDoc = selectedVersion === "v1" && v1Doc ? v1Doc : v2Doc;
  const hiddenSectionSet = useMemo(() => {
    const rawList = [
      ...(Array.isArray(initialDoc?.hiddenSections) ? initialDoc.hiddenSections : []),
      ...(Array.isArray((initialDoc as Record<string, unknown> | null)?.hidden_sections)
        ? ((initialDoc as Record<string, unknown>).hidden_sections as unknown[])
        : []),
    ];
    return new Set(
      rawList.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())
    );
  }, [initialDoc]);

  const basicDoc = useMemo<BasicImDocument>(() => {
    if (hiddenSectionSet.size === 0 || !Array.isArray(rawBasicDoc.sections)) {
      return rawBasicDoc;
    }
    return {
      ...rawBasicDoc,
      sections: rawBasicDoc.sections.filter(
        (sec) => !hiddenSectionSet.has(sec.id) && !hiddenSectionSet.has(sec.sectionType)
      ),
    };
  }, [rawBasicDoc, hiddenSectionSet]);

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

  // [A4-01] Rent roll rows derivation — 최고층 → 1층 → 지하층(PPTX·PDF 동일 정렬)
  const rawRentRows =
    rentrollSec?.data?.rows ||
    rentrollSec?.data?.units ||
    basicDoc.facts.rent.units ||
    [];
  const rentRows = useMemo(() => {
    if (!Array.isArray(rawRentRows) || rawRentRows.length <= 1) return rawRentRows;
    const rankFloor = (raw: unknown): number => {
      const s = String(raw ?? "").trim().toUpperCase();
      if (!s || /합계|총계|소계/.test(s)) return -9999;
      const b = s.match(/^(?:B|지하\s*)(\d+)/);
      if (b) return -Number(b[1]);
      const neg = s.match(/^-(\d+)$/);
      if (neg) return -Number(neg[1]);
      if (/^(?:RF|옥상|루프탑)/.test(s)) return 900;
      const ab = s.match(/^(\d+)\s*(?:F|층)?/);
      if (ab) return Number(ab[1]);
      return -500;
    };
    return [...rawRentRows].sort(
      (a: any, b: any) => rankFloor(b?.floor) - rankFloor(a?.floor),
    );
  }, [rawRentRows]);

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
    landSec?.data?.terrainShape || basicDoc.facts.land.terrainShape || "공적장부 확인 필요";
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

  // SSoT Leased Rent-Roll & Occupancy summary (Rule 75: excluding 공실 and 사옥/자가사용 rows)
  const leasedRentRollSummary = useMemo(() => {
    if (!Array.isArray(rentRows) || rentRows.length === 0) return null;
    const normalized = rentRows.map((r: any) => {
      const rawText = [
        r?.lease_state,
        r?.leaseState,
        r?.tenant_type,
        r?.tenantType,
        r?.use,
        r?.tenantName,
        r?.tenant_name,
      ]
        .filter(Boolean)
        .join(" ");
      const hasFuture = /입주\s*예정|전환\s*예정|명도\s*후\s*사옥|사옥\s*사용\s*가능/i.test(rawText);
      const isVacant =
        r?.status === "vacant" ||
        r?.is_vacant === true ||
        r?.lease_state === "공실" ||
        /(?:^|[\s/()·])공실(?:$|[\s/()·])/.test(rawText);
      const depMan =
        r?.depositManwon !== undefined
          ? Number(r.depositManwon)
          : r?.deposit_manwon !== undefined
          ? Number(r.deposit_manwon)
          : Math.round((Number(r?.depositKrw) || 0) / 10000);
      const rentMan =
        r?.monthlyRentManwon !== undefined
          ? Number(r.monthlyRentManwon)
          : r?.rent_manwon !== undefined
          ? Number(r.rent_manwon)
          : Math.round((Number(r?.rentKrw) || 0) / 10000);
      const hasPositiveRent = Number(rentMan) > 0;
      const isOwner =
        !isVacant &&
        !hasFuture &&
        (r?.status === "owner" ||
          r?.lease_state === "자가사용" ||
          r?.lease_state === "자가" ||
          (!hasPositiveRent &&
            /(?:^|[\s/()·])(?:자가사용|자가|사옥)(?:$|[\s/()·])/.test(rawText)));
      return {
        ...r,
        lease_state: isVacant ? "공실" : isOwner ? "자가사용" : r?.lease_state,
        tenant_name: r?.tenantName ?? r?.tenant_name ?? r?.use ?? "",
        tenant_type: r?.tenantType ?? r?.tenant_type ?? r?.use ?? "",
        use: r?.use ?? r?.tenantName ?? r?.tenant_name ?? "",
        deposit_manwon: Number(depMan) || 0,
        rent_manwon: Number(rentMan) || 0,
        monthly_rent_manwon: Number(rentMan) || 0,
      };
    });
    return {
      sums: sumLeasedRentRoll(normalized),
      occupancy: summarizeLeaseOccupancy(normalized),
    };
  }, [rentRows]);

  const monthlyRentDisplayManwon =
    leasedRentRollSummary != null
      ? leasedRentRollSummary.sums.monthlyRentManwon
      : basicDoc.facts.rent.monthlyRentTotalManwon;

  const ssotYieldSet = useMemo(() => {
    if (!initialDoc?.financials && !initialDoc?.heroCard) return null;
    const ssotSummary = (initialDoc as any)?.ssot_summary || (initialDoc as any)?.ssotSummary || {};
    return buildYieldSetFromBody({
      ...(initialDoc || {}),
      asking_price_manwon: askingManwon || undefined,
      ssot_summary: {
        ...ssotSummary,
        asking_price_manwon: ssotSummary?.asking_price_manwon ?? (askingManwon || undefined),
        total_deposit_manwon:
          ssotSummary?.total_deposit_manwon ??
          (leasedRentRollSummary?.sums.depositManwon ?? basicDoc.facts.rent.depositTotalManwon),
        monthly_rent_total_krw:
          ssotSummary?.monthly_rent_total_krw ?? monthlyRentDisplayManwon * 10000,
      },
    });
  }, [initialDoc, askingManwon, leasedRentRollSummary, basicDoc.facts.rent.depositTotalManwon, monthlyRentDisplayManwon]);

  const annualRentKrw =
    leasedRentRollSummary != null
      ? leasedRentRollSummary.sums.monthlyRentManwon * 12 * 10000
      : yieldSec?.data?.annualRentKrw ?? basicDoc.facts.rent.annualRentKrw ?? 0;
  const netAnnualOperatingIncomeKrw =
    ssotYieldSet?.noiBaseKrw ??
    (typeof initialDoc?.heroCard?.noiBaseBil === "number"
      ? Math.round(initialDoc.heroCard.noiBaseBil * 1e8)
      : undefined) ??
    yieldSec?.data?.netAnnualOperatingIncomeKrw ??
    basicDoc.facts.valuation.netAnnualOperatingIncomeKrw ??
    0;
  const capRatePct =
    ssotYieldSet?.noiCapRate ??
    (typeof initialDoc?.heroCard?.capRateBase === "number"
      ? initialDoc.heroCard.capRateBase
      : undefined) ??
    yieldSec?.data?.capRatePct ??
    basicDoc.facts.valuation.capRatePct ??
    0;
  const estimatedEquityKrw =
    (typeof initialDoc?.financials?.equityRequired === "number"
      ? Math.round(initialDoc.financials.equityRequired * 1e8)
      : undefined) ??
    (typeof initialDoc?.heroCard?.equityRequiredBil === "number"
      ? Math.round(initialDoc.heroCard.equityRequiredBil * 1e8)
      : undefined) ??
    yieldSec?.data?.estimatedEquityKrw ??
    basicDoc.facts.transaction.estimatedEquityKrw;
  const occupancyRatePct =
    leasedRentRollSummary?.occupancy.vacancyPct != null
      ? Math.max(0, Math.round((100 - leasedRentRollSummary.occupancy.vacancyPct) * 10) / 10)
      : typeof initialDoc?.heroCard?.occPct === "number"
      ? initialDoc.heroCard.occPct
      : yieldSec?.data?.occupancyRatePct ?? basicDoc.facts.rent.occupancyRatePct;
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
  const expectedRentRows = useMemo<any[]>(() => {
    const raw =
      (initialDoc as any)?.expected_rent_roll ??
      (initialDoc as any)?.expectedRentRoll ??
      (ssotData as any)?.expected_rent_roll ??
      [];
    return Array.isArray(raw) ? raw : [];
  }, [initialDoc, ssotData]);
  const cadastralImageUrl = useMemo(() => {
    const url =
      (initialDoc as any)?.enrichment?.cadastralMapImage ??
      (ssotData as any)?.enrichment?.cadastralMapImage ??
      (initialDoc as any)?.cadastralMapImage;
    return typeof url === "string" && url.trim().length > 0 ? url.trim() : "";
  }, [initialDoc, ssotData]);
  const visibleChips = useMemo(() => {
    let bodyIdx = 0;
    return CANONICAL_SECTION_CHIPS.filter((c) => c.id !== "08_comps" || compsList.length > 0).map(
      (c) => {
        if (c.id === "01_cover") {
          return { id: c.id, no: "표지", label: "표지" };
        }
        bodyIdx += 1;
        const no = String(bodyIdx).padStart(2, "0");
        return { id: c.id, no, label: `${no} ${c.label}` };
      },
    );
  }, [compsList.length]);
  const sectionNoById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of visibleChips) map[c.id] = c.no;
    return map;
  }, [visibleChips]);
  const expectedYieldPct = useMemo(() => {
    const stabVal = ssotYieldSet?.stabilized?.value;
    if (typeof stabVal === "number" && Number.isFinite(stabVal) && stabVal > 0 && stabVal <= 25) {
      return stabVal;
    }
    if (expectedRentRows.length === 0 || askingManwon <= 0) return 0;
    let depMan = 0;
    let rentMan = 0;
    for (const r of expectedRentRows) {
      const d = Number(r?.depositManwon ?? r?.deposit_manwon ?? (Number(r?.depositKrw ?? r?.deposit_krw) || 0) / 10000);
      const m = Number(r?.monthlyRentManwon ?? r?.monthly_rent_manwon ?? (Number(r?.rentKrw ?? r?.monthly_rent_krw) || 0) / 10000);
      if (Number.isFinite(d) && d > 0) depMan += d;
      if (Number.isFinite(m) && m > 0) rentMan += m;
    }
    const denom = askingManwon - depMan;
    if (denom <= 0 || rentMan <= 0) return 0;
    const rawPct = ((rentMan * 12) / denom) * 100;
    return rawPct <= 25 ? Number(rawPct.toFixed(2)) : 0;
  }, [ssotYieldSet, expectedRentRows, askingManwon]);
  const hasVerifiedPublicLedger = useMemo(() => {
    const pnuCandidates = [
      basicDoc.facts.land.pnu,
      (initialDoc as any)?.pnu,
      (initialDoc as any)?.ssotSummary?.pnu,
      (initialDoc as any)?.ssot_summary?.pnu,
      (initialDoc as any)?.enrichment?.pnu,
      (ssotData as any)?.pnu,
    ];
    const hasValidPnu = pnuCandidates.some(
      (v) => typeof v === "string" && /^\d{19}$/.test(v.trim())
    );

    const brObj =
      (initialDoc as any)?.enrichment?.buildingRegister ||
      (initialDoc as any)?.buildingRegister ||
      (ssotData as any)?.enrichment?.buildingRegister;
    const hasBuildingRegister = Boolean(
      (brObj &&
        typeof brObj === "object" &&
        (Number(brObj.totalArea || brObj.total_gross_area_sqm || 0) > 0 ||
          Number(brObj.grndFlrCnt || brObj.floors_above || 0) > 0 ||
          Boolean(brObj.mainPurpsCdNm || brObj.useAprDay))) ||
        (initialDoc as any)?.ssotSummary?.building_register_verified === true ||
        (initialDoc as any)?.ssot_summary?.building_register_verified === true
    );

    const hasOfficialLandPrice =
      officialLandPriceWonSqm > 0 ||
      Number((initialDoc as any)?.enrichment?.officialLandPrice?.pricePerSqm || 0) > 0 ||
      Number((initialDoc as any)?.enrichment?.landPriceHistory?.latestPricePerSqm || 0) > 0;

    const hasVerifiedComps = Array.isArray(compsList) && compsList.length > 0;

    return Boolean(hasValidPnu || hasBuildingRegister || hasOfficialLandPrice || hasVerifiedComps);
  }, [basicDoc.facts.land.pnu, initialDoc, ssotData, officialLandPriceWonSqm, compsList]);
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

  const legacyCustomSections = useMemo<MobileIMSection[]>(() => {
    if (
      !initialDoc ||
      initialDoc.basicImDocument ||
      ("schemaVersion" in initialDoc && initialDoc.schemaVersion === "3.0") ||
      !Array.isArray(initialDoc.sections)
    ) {
      return [];
    }
    return (initialDoc.sections as MobileIMSection[]).filter(
      (s: any) =>
        s &&
        typeof s.sectionId === "string" &&
        !hiddenSectionSet.has(s.sectionId) &&
        !hiddenSectionSet.has(s.id) &&
        !hiddenSectionSet.has(s.section_type) &&
        !CANONICAL_SECTION_CHIPS.some((c) => c.id === s.sectionId),
    );
  }, [initialDoc, hiddenSectionSet]);

  const isIncomeSectionLocked = useMemo(
    () =>
      legacyCustomSections.some(
        (s) => (s.sectionId === "income_analysis" || s.sectionId === "04_finance") && Boolean(s.locked),
      ),
    [legacyCustomSections],
  );

  const [openLegacySections, setOpenLegacySections] = useState<Record<string, boolean>>(() => {
    const first = Array.isArray(initialDoc?.sections) ? initialDoc.sections[0]?.sectionId : undefined;
    return first ? { [first]: true, income_analysis: true } : { income_analysis: true };
  });

  // [A2-02] Sanitized per-field broker contact info (never let a placeholder in one layer shadow real profile fields)
  const contactBrokerObj = contactSec?.data?.brokerOffice;
  const factsBrokerObj = basicDoc.facts.brokerOffice as Record<string, any> | undefined;
  const initialBrokerProfile = (initialDoc as any)?.brokerProfile;
  const legacyBrokerContact = (initialDoc as any)?.broker_contact;
  const topBrokerObj = initialDoc?.broker;
  const ssotBrokerProfileObj =
    (ssotData as any)?.brokerProfile ||
    (ssotData as any)?.broker ||
    (ssotData as any)?.broker_office;

  const realBrokerOfficeName =
    cleanViewerBrokerField(contactBrokerObj?.name, "officeName") ||
    cleanViewerBrokerField(contactBrokerObj?.office, "officeName") ||
    cleanViewerBrokerField(contactBrokerObj?.company, "officeName") ||
    cleanViewerBrokerField(contactBrokerObj?.officeName, "officeName") ||
    cleanViewerBrokerField(factsBrokerObj?.name, "officeName") ||
    cleanViewerBrokerField(factsBrokerObj?.company, "officeName") ||
    cleanViewerBrokerField(initialBrokerProfile?.company, "officeName") ||
    cleanViewerBrokerField(initialBrokerProfile?.officeName, "officeName") ||
    cleanViewerBrokerField(initialBrokerProfile?.office_name, "officeName") ||
    cleanViewerBrokerField(legacyBrokerContact?.brokerageName, "officeName") ||
    cleanViewerBrokerField(topBrokerObj?.company, "officeName") ||
    cleanViewerBrokerField(topBrokerObj?.office, "officeName") ||
    cleanViewerBrokerField(topBrokerObj?.officeName, "officeName") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.company, "officeName") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.officeName, "officeName") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.name, "officeName") ||
    cleanViewerBrokerField((ssotData as any)?.broker_company, "officeName") ||
    cleanViewerBrokerField((ssotData as any)?.office_name, "officeName");
  const brokerOfficeName = realBrokerOfficeName || "전담 중개사무소";

  const realBrokerRepresentative =
    cleanViewerBrokerField(contactBrokerObj?.representativeName, "name") ||
    cleanViewerBrokerField(contactBrokerObj?.representative_name, "name") ||
    cleanViewerBrokerField(contactBrokerObj?.representative, "name") ||
    cleanViewerBrokerField(contactBrokerObj?.displayName, "name") ||
    cleanViewerBrokerField(factsBrokerObj?.representativeName, "name") ||
    cleanViewerBrokerField(factsBrokerObj?.representative_name, "name") ||
    cleanViewerBrokerField(factsBrokerObj?.representative, "name") ||
    cleanViewerBrokerField(initialBrokerProfile?.representativeName, "name") ||
    cleanViewerBrokerField(initialBrokerProfile?.representative_name, "name") ||
    cleanViewerBrokerField(initialBrokerProfile?.displayName, "name") ||
    cleanViewerBrokerField(initialBrokerProfile?.display_name, "name") ||
    cleanViewerBrokerField(legacyBrokerContact?.brokerName, "name") ||
    cleanViewerBrokerField(topBrokerObj?.representativeName, "name") ||
    cleanViewerBrokerField(topBrokerObj?.representative_name, "name") ||
    cleanViewerBrokerField(topBrokerObj?.displayName, "name") ||
    cleanViewerBrokerField(topBrokerObj?.name, "name") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.representativeName, "name") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.representative_name, "name") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.displayName, "name") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.display_name, "name") ||
    cleanViewerBrokerField((ssotData as any)?.representative_name, "name");
  const brokerRepresentative = realBrokerRepresentative || "담당 공인중개사";

  const realBrokerRegistrationNo =
    cleanViewerBrokerField(contactBrokerObj?.registrationNo, "regNo") ||
    cleanViewerBrokerField(contactBrokerObj?.officeRegNumber, "regNo") ||
    cleanViewerBrokerField(contactBrokerObj?.office_reg_number, "regNo") ||
    cleanViewerBrokerField(factsBrokerObj?.registrationNo, "regNo") ||
    cleanViewerBrokerField(factsBrokerObj?.officeRegNumber, "regNo") ||
    cleanViewerBrokerField(factsBrokerObj?.office_reg_number, "regNo") ||
    cleanViewerBrokerField(initialBrokerProfile?.registrationNo, "regNo") ||
    cleanViewerBrokerField(initialBrokerProfile?.officeRegNumber, "regNo") ||
    cleanViewerBrokerField(initialBrokerProfile?.office_reg_number, "regNo") ||
    cleanViewerBrokerField(legacyBrokerContact?.registrationNo, "regNo") ||
    cleanViewerBrokerField(legacyBrokerContact?.officeRegNumber, "regNo") ||
    cleanViewerBrokerField(topBrokerObj?.registrationNo, "regNo") ||
    cleanViewerBrokerField(topBrokerObj?.officeRegNumber, "regNo") ||
    cleanViewerBrokerField(topBrokerObj?.office_reg_number, "regNo") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.registrationNo, "regNo") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.officeRegNumber, "regNo") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.office_reg_number, "regNo") ||
    cleanViewerBrokerField((ssotData as any)?.office_reg_number, "regNo");
  const brokerRegistrationNo = realBrokerRegistrationNo || "-";

  const realBrokerOfficeAddress =
    cleanViewerBrokerField(contactBrokerObj?.officeAddress, "address") ||
    cleanViewerBrokerField(contactBrokerObj?.office_address, "address") ||
    cleanViewerBrokerField(contactBrokerObj?.address, "address") ||
    cleanViewerBrokerField(factsBrokerObj?.officeAddress, "address") ||
    cleanViewerBrokerField(factsBrokerObj?.office_address, "address") ||
    cleanViewerBrokerField(factsBrokerObj?.address, "address") ||
    cleanViewerBrokerField(initialBrokerProfile?.officeAddress, "address") ||
    cleanViewerBrokerField(initialBrokerProfile?.office_address, "address") ||
    cleanViewerBrokerField(initialBrokerProfile?.address, "address") ||
    cleanViewerBrokerField(legacyBrokerContact?.officeAddress, "address") ||
    cleanViewerBrokerField(legacyBrokerContact?.office_address, "address") ||
    cleanViewerBrokerField(legacyBrokerContact?.address, "address") ||
    cleanViewerBrokerField(topBrokerObj?.officeAddress, "address") ||
    cleanViewerBrokerField(topBrokerObj?.office_address, "address") ||
    cleanViewerBrokerField(topBrokerObj?.address, "address") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.officeAddress, "address") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.office_address, "address") ||
    cleanViewerBrokerField((ssotData as any)?.office_address, "address") ||
    cleanViewerBrokerField((ssotData as any)?.officeAddress, "address");

  const realBrokerPhone =
    cleanViewerBrokerField(contactBrokerObj?.phone, "phone") ||
    cleanViewerBrokerField(factsBrokerObj?.phone, "phone") ||
    cleanViewerBrokerField(initialBrokerProfile?.phone, "phone") ||
    cleanViewerBrokerField(legacyBrokerContact?.brokerPhone, "phone") ||
    cleanViewerBrokerField(topBrokerObj?.phone, "phone") ||
    cleanViewerBrokerField(ssotBrokerProfileObj?.phone, "phone") ||
    cleanViewerBrokerField((ssotData as any)?.broker_phone, "phone");
  const brokerPhone = realBrokerPhone || "-";
  const isMissingBrokerContact =
    !realBrokerOfficeName ||
    !realBrokerPhone ||
    !realBrokerRegistrationNo ||
    !realBrokerOfficeAddress;
  const contactDisclaimer =
    contactSec?.data?.disclaimer ||
    initialDoc?.disclaimer ||
    "본 자료는 고객 검토용으로 작성되었으며 법적 구속력을 갖지 않습니다.";

  // [A2-05] Version diff delta in 억 원 (only meaningful when real v1Doc exists)
  const diffEok = v1Doc
    ? (
        ((v2Doc.facts.transaction.askingPriceManwon || 0) -
          (v1Doc.facts.transaction.askingPriceManwon || 0)) /
        10000
      ).toFixed(1)
    : "0.0";

  const realKakaoChannelUrl = useMemo(() => {
    const candidates = [
      (contactBrokerObj as any)?.kakaoChannelUrl,
      (contactBrokerObj as any)?.kakaoUrl,
      (initialBrokerProfile as any)?.kakaoChannelUrl,
      (initialBrokerProfile as any)?.kakaoUrl,
      (topBrokerObj as any)?.kakaoChannelUrl,
      (topBrokerObj as any)?.kakaoUrl,
      (topBrokerObj as any)?.kakao_url,
      (ssotBrokerProfileObj as any)?.kakaoChannelUrl,
      (ssotBrokerProfileObj as any)?.kakaoUrl,
      (initialDoc as any)?.kakaoChannelUrl,
      (initialDoc as any)?.kakaoUrl,
    ];
    for (const c of candidates) {
      if (isExplicitKakaoChannelUrl(c)) return c.trim();
    }
    return null;
  }, [
    contactBrokerObj,
    initialBrokerProfile,
    topBrokerObj,
    ssotBrokerProfileObj,
    initialDoc,
  ]);

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
        <div className="max-w-md w-full bg-white rounded-3xl border border-[#CBD5E1] p-6 sm:p-8 text-center space-y-4 shadow-md">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#F1F5F9] text-[#334155] rounded-full font-extrabold text-sm">
            🔒 열람 기간 만료 · 최신 자료 안내
          </div>
          <h1 className="text-2xl font-black text-[#0F172A] leading-snug">
            매물 조건 업데이트로 이전 안내 링크의 열람이 종료되었습니다
          </h1>
          <p className="text-base text-[#475569] leading-relaxed">
            매매 조건 변경 또는 최신 자료 반영에 따라 기존 공유 링크는 더 이상 열람하실 수 없습니다. 최신 투자설명서(IM)는 담당 공인중개사에게 편하게 요청해 주세요.
          </p>
          <div className="p-4 bg-[#FAF9F5] rounded-2xl border border-[#E2E8F0] text-left space-y-1 text-sm">
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
              className="w-full min-h-[48px] bg-[#0F172A] text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-[#1E293B] cursor-pointer text-base"
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
                  className="text-sm font-bold text-[#475569] hover:text-[#0F172A] flex items-center gap-0.5 shrink-0"
                >
                  ‹ IM
                </Link>
                <span className="text-[#CBD5E1]">|</span>
              </>
            ) : (
              <span className="text-sm font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-1 rounded-lg border border-[#BFDBFE] shrink-0">
                📊 투자설명서
              </span>
            )}
            <span className="text-sm font-extrabold text-[#0F172A] truncate max-w-[165px] sm:max-w-[280px]">
              {basicDoc.metadata.title}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <ReaderFontScaleToggle variant="light" />

            {/* Version Switcher Dropdown (Broker Preview Only when real previousVersion exists) */}
            {isBroker ? (
              v1Doc ? (
                <div className="flex items-center gap-2" data-testid="version-switcher-bar">
                  <select
                    value={selectedVersion}
                    onChange={(e) => setSelectedVersion(e.target.value as "v1" | "v2")}
                    className="min-h-[44px] px-2.5 py-1 text-[max(16px,1rem)] font-bold bg-[#FAF9F5] border border-[#64748B] rounded-lg text-[#0F172A] outline-none cursor-pointer"
                    data-testid="version-switcher"
                  >
                    <option value="v1">v1 (이전 버전)</option>
                    <option value="v2">v2 (최신 공개본 ★)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowDiffModal(true)}
                    className="min-h-[44px] px-2.5 py-1 text-sm font-bold text-[#92400E] bg-[#FEF3C7] border border-[#FDE68A] hover:bg-[#FDE68A] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    data-testid="version-diff-btn"
                  >
                    🔍 v1↔v2 비교
                  </button>
                </div>
              ) : null
            ) : hasVerifiedPublicLedger ? (
              <span className="text-sm font-bold text-[#065F46] bg-[#ECFDF5] border border-[#A7F3D0] px-2.5 py-1 rounded-lg shrink-0">
                ✓ 공적장부·실거래 검증필
              </span>
            ) : (
              <span className="text-sm font-semibold text-[#475569] bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1 rounded-lg shrink-0">
                중개인 입력 기준 · 공적장부 대조 예정
              </span>
            )}
          </div>
        </div>

        {/* ── Sticky Top Section Navigation Chips (WP-P4b-01) ── */}
        <div
          className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto bg-[#FAF9F5] border-t border-[#E2E8F0] scrollbar-none"
          data-testid="section-chips-bar"
          role="navigation"
          aria-label="IM 섹션 바로가기"
        >
          {visibleChips.map((chip) => {
            const isActive = activeSectionId === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => scrollToSection(chip.id)}
                className={`min-h-[44px] px-3 py-1 rounded-full text-sm font-bold whitespace-nowrap border transition-all cursor-pointer ${
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
            <span className="text-lg leading-none pt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm sm:text-base font-extrabold text-[#92400E]">
                매물 정보가 정정되었습니다
              </p>
              <p className="text-sm text-[#78350F] mt-0.5 leading-snug">
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="shrink-0 whitespace-nowrap text-sm font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              01 표지
            </span>
            {hasVerifiedPublicLedger ? (
              <span
                className="text-sm font-bold text-[#065F46]"
                data-testid="public-ledger-verified-badge"
              >
                ✓ 공적장부·실거래 검증필
              </span>
            ) : (
              <span
                className="text-sm font-semibold text-[#64748B]"
                data-testid="public-ledger-pending-badge"
              >
                중개인 입력 기준 · 공적장부 대조 예정
              </span>
            )}
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
              <h1 className="text-2xl sm:text-3xl font-black leading-tight text-white">
                {coverSec?.data?.title || basicDoc.metadata.title}
              </h1>
              <p className="text-base text-[#CBD5E1] mt-1">
                {coverSec?.data?.address || basicDoc.metadata.address}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              <span className="text-sm font-semibold text-[#64748B] block">매매 희망가</span>
              <strong className="text-xl font-extrabold text-[#0F172A] tabular-nums">
                {priceLabel}
              </strong>
            </div>
            <div className="p-3.5 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              {(coverSec?.data?.grossYieldPct ?? basicDoc.facts.valuation.grossYieldPct) > 0 ? (
                <>
                  <span className="text-sm font-semibold text-[#64748B] block">예상 총수익률</span>
                  <strong className="text-xl font-extrabold text-[#065F46] tabular-nums">
                    {(coverSec?.data?.grossYieldPct ?? basicDoc.facts.valuation.grossYieldPct).toFixed(2)}%
                  </strong>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-[#64748B] block">토지 평당가</span>
                  <strong className="text-xl font-extrabold text-[#065F46] tabular-nums">
                    {Math.round(pricePerPyeongLandWon / 10000).toLocaleString()}만원/평
                  </strong>
                </>
              )}
            </div>
          </div>
          {(realBrokerOfficeName ||
            realBrokerRepresentative ||
            realBrokerRegistrationNo ||
            realBrokerOfficeAddress ||
            realBrokerPhone) && (
            <p
              data-testid="mobile-im-cover-statutory"
              className="text-sm text-[#475569] border-t border-[#E2E8F0] pt-3 leading-relaxed break-keep"
            >
              {[
                realBrokerOfficeName,
                realBrokerRepresentative ? `대표 ${realBrokerRepresentative}` : "",
                realBrokerRegistrationNo ? `등록번호 ${realBrokerRegistrationNo}` : "",
                realBrokerOfficeAddress ? `소재지 ${realBrokerOfficeAddress}` : "",
                realBrokerPhone ? `연락처 ${realBrokerPhone}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
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
            <span className="text-sm font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              {sectionNoById["02_summary"] ?? "01"} 투자 하이라이트
            </span>
            <span className="text-sm font-bold text-[#475569]">핵심 요약</span>
          </div>

          <h2 className="text-xl font-extrabold text-[#0F172A]">
            핵심 투자 지표 (6대 메트릭스)
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(summarySec?.data?.metrics || []).map((m: any, idx: number) => {
              const displayMetricVal =
                m.label === "매매 희망가" && askingManwon > 0 ? priceLabel : m.value;
              return (
                <div key={idx} className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0] text-center">
                  <span className="text-sm font-semibold text-[#64748B] block mb-0.5">{m.label}</span>
                  <strong className="text-base font-extrabold text-[#0F172A] tabular-nums block">
                    {displayMetricVal}
                  </strong>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-[#F8FAFC] rounded-md border border-[#E2E8F0] space-y-2">
            <h3 className="text-base font-bold text-[#0F172A]">투자 포인트</h3>
            <ul className="space-y-1.5 text-base text-[#334155]">
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
            <span className="text-sm font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              {sectionNoById["03_overview"] ?? "02"} 건축물 기본 정보
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-[#0F172A]">건축물 개요</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-base">
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
                {basicDoc.facts.building.floorsAbove > 0 || basicDoc.facts.building.floorsBelow > 0
                  ? `지상 ${basicDoc.facts.building.floorsAbove}층 / 지하 ${basicDoc.facts.building.floorsBelow}층`
                  : "공적장부 확인 필요"}
              </span>
            </div>
            {(() => {
              const resolvedBcr =
                Number(basicDoc.facts.building.buildingCoverageRatioPct || 0) ||
                Number((initialDoc as any)?.ssotSummary?.bcr_pct || 0);
              const resolvedFar =
                Number(basicDoc.facts.building.floorAreaRatioPct || 0) ||
                Number((initialDoc as any)?.ssotSummary?.far_pct || 0);
              const resolvedParking =
                Number(basicDoc.facts.building.parkingSpaces || 0) ||
                Number(
                  (initialDoc as any)?.ssotSummary?.parking_total ??
                    (initialDoc as any)?.ssotSummary?.parking_count ??
                    0
                );
              const resolvedElevators =
                Number(basicDoc.facts.building.elevators || 0) ||
                Number((initialDoc as any)?.ssotSummary?.elevator_count || 0);

              return (
                <>
                  {(resolvedBcr > 0 || resolvedFar > 0) && (
                    <div className="flex justify-between p-2.5 border-b border-[#F1F5F9]">
                      <span className="text-[#64748B]">건폐율 / 용적률</span>
                      <span className="font-bold text-[#0F172A] tabular-nums">
                        {resolvedBcr > 0 ? `${resolvedBcr}%` : "-"} /{" "}
                        {resolvedFar > 0 ? `${resolvedFar}%` : "-"}
                      </span>
                    </div>
                  )}
                  {(resolvedParking > 0 || resolvedElevators > 0) && (
                    <div className="flex justify-between p-2.5 border-b border-[#F1F5F9]">
                      <span className="text-[#64748B]">
                        {resolvedParking > 0 && resolvedElevators > 0
                          ? "주차 / 승강기"
                          : resolvedParking > 0
                          ? "주차"
                          : "승강기"}
                      </span>
                      <span className="font-bold text-[#0F172A]">
                        {resolvedParking > 0 && resolvedElevators > 0
                          ? `${resolvedParking}대 / ${resolvedElevators}대`
                          : resolvedParking > 0
                          ? `총 ${resolvedParking}대`
                          : `${resolvedElevators}대`}
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
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
            <span className="text-sm font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              {sectionNoById["04_location"] ?? "03"} 입지 분석
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-[#0F172A]">교통 및 입지 환경</h2>
          <div className="p-4 bg-[#FAF9F5] rounded-md border border-[#E2E8F0] space-y-2.5">
            <p className="text-base font-semibold text-[#0F172A]">
              {basicDoc.facts.address} · {locationTransport}
            </p>
            {locationRoad && (
              <p className="text-sm text-[#334155]">
                도로 여건: <strong className="text-[#0F172A]">{locationRoad}</strong>
              </p>
            )}
            {legacyLocationContent && (
              <p className="text-sm text-[#475569] leading-relaxed">
                {legacyLocationContent}
              </p>
            )}
            {locationPoiList.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {locationPoiList.map((poi, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-md bg-white border border-[#CBD5E1] text-sm font-semibold text-[#0F172A]"
                  >
                    📍 {poi}
                  </span>
                ))}
              </div>
            )}
          </div>
          {Number.isFinite(Number(initialDoc?.coordinates?.lat)) &&
            Number.isFinite(Number(initialDoc?.coordinates?.lng)) &&
            Number(initialDoc?.coordinates?.lat) > 0 &&
            Number(initialDoc?.coordinates?.lng) > 0 && (
              <div
                className="h-[200px] sm:h-[230px] rounded-md overflow-hidden border border-[#CBD5E1]"
                data-testid="mobile-im-location-map"
              >
                <KakaoStaticMap
                  lat={Number(initialDoc.coordinates.lat)}
                  lng={Number(initialDoc.coordinates.lng)}
                  name={basicDoc.metadata.title || basicDoc.facts.address || "본건"}
                />
              </div>
            )}
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
            <span className="text-sm font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              {sectionNoById["05_land"] ?? "04"} 토지 및 도시계획
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-[#0F172A]">토지 이용 계획</h2>
          <div className="grid grid-cols-2 gap-3 text-base">
            <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              <span className="text-sm font-semibold text-[#64748B] block">
                {multiParcels.length >= 2 ? `대지면적 (${multiParcels.length}필지 합계)` : "대지면적"}
              </span>
              <strong className="text-base text-[#0F172A] tabular-nums">
                {Number(landAreaSqm).toLocaleString()}㎡ ({Number(landAreaPyeong).toLocaleString()}평)
              </strong>
            </div>
            <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              <span className="text-sm font-semibold text-[#64748B] block">용도지역</span>
              <strong className="text-base text-[#0F172A]">{landZoning}</strong>
            </div>
            <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              <span className="text-sm font-semibold text-[#64748B] block">
                {multiParcels.length >= 2 ? "지목 구성" : "지형·형상"}
              </span>
              <strong className="text-base text-[#0F172A]">
                {multiParcels.length >= 2 ? landCategoryLabel : landTerrainShape}
              </strong>
            </div>
            <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
              <span className="text-sm font-semibold text-[#64748B] block">
                {multiParcels.length >= 2 ? "개별공시지가 (가중평균)" : "개별공시지가"}
              </span>
              <strong className="text-base text-[#0F172A] tabular-nums">
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
              <table className="w-full text-left text-sm">
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

          {cadastralImageUrl && (
            <div
              className="rounded-md border border-[#CBD5E1] bg-[#FAF9F5] p-3 space-y-2"
              data-testid="mobile-im-cadastral-map"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-[#475569]">
                <span>지적도 · 토지이용계획</span>
                <span>토지이음 · V-World</span>
              </div>
              <img
                src={cadastralImageUrl}
                alt="본건 지적도 및 토지이용계획"
                className="w-full max-h-[320px] object-contain rounded border border-[#E2E8F0] bg-white"
              />
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
          {rentRows.length > 10 && (
            <style>{`@media print { [data-rentroll-extra-row="true"] { display: table-row !important; } }`}</style>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              {sectionNoById["06_rentroll"] ?? "05"} 층별 임대차 상세
            </span>
            <span className="text-sm text-[#065F46] font-bold">
              월 수익 합계: {monthlyRentDisplayManwon.toLocaleString()}만원
              {typeof occupancyRatePct === "number" && rentRows.length > 0
                ? ` · 임대율 ${occupancyRatePct.toFixed(1).replace(/\.0$/, "")}%`
                : ""}
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-[#0F172A]">층별 임대차 현황</h2>

          <div className="overflow-x-auto rounded-md border border-[#CBD5E1]">
            <table className="w-full text-left text-sm">
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
                    <td colSpan={5} className="py-8 text-center text-sm text-[#64748B]">
                      등록된 호실 임대차 정보가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rentRows.map((r: any, idx: number) => {
                    const floorLabel = r.floor || "-";
                    const cleanTenant = String(r.tenantName ?? r.tenant ?? "").trim();
                    let rawUse = String(r.use ?? r.tenant_type ?? "").trim();
                    if (cleanTenant && rawUse.startsWith(`${cleanTenant} / `)) {
                      rawUse = rawUse.slice(cleanTenant.length + 3).trim();
                    }
                    const useLabel =
                      cleanTenant && rawUse && rawUse !== cleanTenant
                        ? `${cleanTenant} (${rawUse})`
                        : rawUse ||
                          cleanTenant ||
                          (r.status === "vacant"
                            ? "공실"
                            : r.status === "owner"
                            ? "자가사용"
                            : "임대중");
                    const depManwon =
                      r.depositManwon !== undefined
                        ? Number(r.depositManwon)
                        : Math.round((Number(r.depositKrw) || 0) / 10000);
                    const rentManwon =
                      r.monthlyRentManwon !== undefined
                        ? Number(r.monthlyRentManwon)
                        : Math.round((Number(r.rentKrw) || 0) / 10000);
                    const rawExpiry = String(
                      r.leaseExpiry ?? r.expiryDate ?? r.expiry_date ?? r.lease_end ?? ""
                    ).trim();
                    const expiryLabel =
                      !rawExpiry || rawExpiry === "-"
                        ? "-"
                        : rawExpiry.replace(/^20(\d{2})-(\d{2})$/, "$1.$2");
                    const isCollapsedOnScreen = idx >= 10 && !showAllRentRows;

                    return (
                      <tr
                        key={idx}
                        data-rentroll-extra-row={idx >= 10 ? "true" : undefined}
                        className={
                          isCollapsedOnScreen
                            ? "hidden print:table-row hover:bg-[#F8FAFC]"
                            : "hover:bg-[#F8FAFC]"
                        }
                      >
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

          {rentRows.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAllRentRows((prev) => !prev)}
              data-testid="rentroll-toggle-btn"
              className="w-full min-h-[44px] py-2.5 px-4 rounded-md border border-[#CBD5E1] bg-[#FAF9F5] hover:bg-[#F1F5F9] text-sm font-bold text-[#1D4ED8] transition-colors cursor-pointer no-print"
            >
              {showAllRentRows
                ? "10개 호실만 접기"
                : `전체 ${rentRows.length}개 호실 모두 보기`}
            </button>
          )}

          {expectedRentRows.length > 0 && (
            <div
              className="pt-3 mt-3 border-t border-dashed border-[#CBD5E1] space-y-2"
              data-testid="mobile-im-expected-rentroll"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-extrabold text-[#0F172A]">기대수익률 임대차 현황</h3>
                {expectedYieldPct > 0 && (
                  <span className="text-sm font-bold text-[#92400E] bg-[#FEF3C7] px-2.5 py-0.5 rounded-full">
                    기대수익률 {expectedYieldPct.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="overflow-x-auto rounded-md border border-[#FCD34D]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FFFBEB] border-b border-[#FCD34D] font-bold text-[#0F172A]">
                    <tr>
                      <th className="py-2 px-2 sm:px-3 whitespace-nowrap">층</th>
                      <th className="py-2 px-2 sm:px-3">업종/용도</th>
                      <th className="py-2 px-2 sm:px-3 text-right whitespace-nowrap">보증금(만)</th>
                      <th className="py-2 px-2 sm:px-3 text-right whitespace-nowrap">월세(만)</th>
                      <th className="py-2 px-2 sm:px-3 text-right whitespace-nowrap">비고/조건</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FDE68A]">
                    {expectedRentRows.map((er: any, idx: number) => {
                      const base = rentRows[idx] ?? rentRows.find((br: any) => String(br?.floor ?? "").trim() === String(er?.floor ?? "").trim());
                      const floorLabel = String(er?.floor ?? "-").trim() || "-";
                      const cleanTenant = String(er?.tenantName ?? er?.tenant ?? "").trim();
                      let rawUse = String(er?.use ?? er?.sector ?? er?.purpose ?? "").trim();
                      if (cleanTenant && rawUse.startsWith(`${cleanTenant} / `)) {
                        rawUse = rawUse.slice(cleanTenant.length + 3).trim();
                      }
                      const useLabel =
                        cleanTenant && rawUse && rawUse !== cleanTenant
                          ? `${cleanTenant} (${rawUse})`
                          : rawUse || cleanTenant || "-";
                      const baseUseLabel = base ? String(base?.use ?? base?.tenantName ?? "").trim() : "";
                      const depMan = Number(er?.depositManwon ?? er?.deposit_manwon ?? (Number(er?.depositKrw ?? er?.deposit_krw) || 0) / 10000) || 0;
                      const baseDep = base ? Number(base?.depositManwon ?? (Number(base?.depositKrw) || 0) / 10000) || 0 : depMan;
                      const rentMan = Number(er?.monthlyRentManwon ?? er?.monthly_rent_manwon ?? (Number(er?.rentKrw ?? er?.monthly_rent_krw) || 0) / 10000) || 0;
                      const baseRent = base ? Number(base?.monthlyRentManwon ?? (Number(base?.rentKrw) || 0) / 10000) || 0 : rentMan;
                      const noteLabel = String(er?.note ?? er?.status ?? "").trim() || "-";
                      const depChanged = Boolean(base) && Math.round(depMan) !== Math.round(baseDep);
                      const rentChanged = Boolean(base) && Math.round(rentMan) !== Math.round(baseRent);
                      const useChanged = Boolean(base) && useLabel !== baseUseLabel && rawUse !== baseUseLabel;
                      return (
                        <tr key={idx} className="hover:bg-[#FFFDF5]">
                          <td className="py-2 px-2 sm:px-3 font-bold text-[#0F172A] whitespace-nowrap">{floorLabel}</td>
                          <td className={`py-2 px-2 sm:px-3 break-keep ${useChanged ? "italic bg-[#FDF8EC] text-[#8E6A20] font-semibold" : "text-[#334155]"}`}>{useLabel}</td>
                          <td className={`py-2 px-2 sm:px-3 text-right tabular-nums whitespace-nowrap ${depChanged ? "italic bg-[#FDF8EC] text-[#8E6A20] font-semibold" : "font-semibold text-[#0F172A]"}`}>{depMan.toLocaleString()}</td>
                          <td className={`py-2 px-2 sm:px-3 text-right tabular-nums whitespace-nowrap ${rentChanged ? "italic bg-[#FDF8EC] text-[#8E6A20] font-bold" : "font-bold text-[#1D4ED8]"}`}>{rentMan.toLocaleString()}</td>
                          <td className="py-2 px-2 sm:px-3 text-right text-xs text-[#64748B] whitespace-nowrap">{noteLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-[#8E6A20] italic">
                * 현행 대비 기대수익률 전환으로 변경된 항목은 이탤릭·음영으로 표시됩니다.
              </p>
            </div>
          )}
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
            <span className="text-sm font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              {sectionNoById["07_yield"] ?? "06"} 수지 분석
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-[#0F172A]">수익률 산출 내역</h2>
          <div className="p-4 bg-[#F0FDF4] rounded-md border border-[#BBF7D0] space-y-2">
            <div className="flex justify-between text-base">
              <span className="text-[#334155]">연간 총 임대수익</span>
              <strong className="text-[#0F172A] tabular-nums">
                {(annualRentKrw / 10000).toLocaleString()}만 원
              </strong>
            </div>
            <div className="flex justify-between text-base">
              <span className="text-[#334155]">연간 순임대수익</span>
              <strong className="text-[#0F172A] tabular-nums">
                {(netAnnualOperatingIncomeKrw / 10000).toLocaleString()}만 원
              </strong>
            </div>
            {!isIncomeSectionLocked && typeof estimatedEquityKrw === "number" && estimatedEquityKrw > 0 && (
              <div className="flex justify-between text-base">
                <span className="text-[#334155]">예상 자기자본 (실투자금)</span>
                <strong className="text-[#0F172A] tabular-nums">
                  {Math.round(estimatedEquityKrw / 10000).toLocaleString()}만 원
                </strong>
              </div>
            )}
            {(() => {
              const displayCurrentYieldPct =
                Number(
                  coverSec?.data?.grossYieldPct ??
                    basicDoc.facts.valuation.grossYieldPct ??
                    0
                ) || capRatePct;
              const showCapRateSub =
                capRatePct > 0 &&
                Math.abs(capRatePct - displayCurrentYieldPct) >= 0.02;
              return (
                <>
                  <div className="flex justify-between text-base font-extrabold pt-2 border-t border-[#86EFAC]">
                    <span className="text-[#065F46]">현행 임대수익률 (보증금 차감)</span>
                    <span className="text-[#065F46] tabular-nums">
                      {displayCurrentYieldPct.toFixed(2)}%
                    </span>
                  </div>
                  {showCapRateSub && (
                    <div className="flex justify-between text-sm text-[#475569]">
                      <span>순수익률 (운영비 차감 추정 Cap Rate)</span>
                      <span className="font-semibold tabular-nums">
                        {capRatePct.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
            {expectedYieldPct > 0 && (
              <div
                className="flex justify-between text-base font-extrabold pt-1 text-[#92400E]"
                data-testid="mobile-im-expected-yield-row"
              >
                <span>기대수익률 (전환·개선 가정)</span>
                <span className="tabular-nums">{expectedYieldPct.toFixed(2)}%</span>
              </div>
            )}
          </div>

          {(pricePerPyeongLandWon > 0 || pricePerPyeongGfaWon > 0) && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
                <span className="text-sm font-semibold text-[#64748B] block">토지 평당 단가</span>
                <strong className="text-base text-[#0F172A] tabular-nums">
                  {Math.round(pricePerPyeongLandWon / 10000).toLocaleString()}만 원/평
                </strong>
              </div>
              <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
                <span className="text-sm font-semibold text-[#64748B] block">연면적 평당 단가</span>
                <strong className="text-base text-[#0F172A] tabular-nums">
                  {Math.round(pricePerPyeongGfaWon / 10000).toLocaleString()}만 원/평
                </strong>
              </div>
            </div>
          )}
        </section>

        {/* Section 08: Comps / Trade Area (A26) */}
        {compsList.length > 0 && (
        <section
          id="08_comps"
          data-section-id="08_comps"
          data-testid="mobile-im-section-08_comps"
          data-doc-hash={docHash}
          className="bg-white rounded-lg border border-[#CBD5E1] p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              {sectionNoById["08_comps"] ?? "07"} 인근 실거래 비교
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-[#0F172A]">인근 시장 거래 시세</h2>

          {(subjectLandPricePerPyeongWon > 0 || subjectGfaPricePerPyeongWon > 0) && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
                <span className="text-sm font-semibold text-[#64748B] block">본건 토지 평당가</span>
                <strong className="text-base text-[#0F172A] tabular-nums">
                  {Math.round(subjectLandPricePerPyeongWon / 10000).toLocaleString()}만 원/평
                </strong>
              </div>
              <div className="p-3 bg-[#FAF9F5] rounded-md border border-[#E2E8F0]">
                <span className="text-sm font-semibold text-[#64748B] block">본건 연면적 평당가</span>
                <strong className="text-base text-[#0F172A] tabular-nums">
                  {Math.round(subjectGfaPricePerPyeongWon / 10000).toLocaleString()}만 원/평
                </strong>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border border-[#CBD5E1]">
            <table className="w-full text-left text-sm">
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
        </section>
        )}

        {/* Section 09: Deal Terms & Photos (A14) */}
        <section
          id="09_photos"
          data-section-id="09_photos"
          data-testid="mobile-im-section-09_photos"
          data-doc-hash={docHash}
          className="bg-white rounded-lg border border-[#CBD5E1] p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              {sectionNoById["09_photos"] ?? "07"} 매각 조건 및 사진
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-[#0F172A]">거래 조건 및 갤러리</h2>
          <div className="p-4 bg-[#FAF9F5] rounded-md border border-[#E2E8F0] text-base text-[#334155]">
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
            <span className="text-sm font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE]">
              {sectionNoById["10_contact"] ?? "08"} 담당자 및 면책조항
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-[#0F172A]">담당 중개사무소</h2>
          <div className="p-4 bg-[#FAF9F5] rounded-md border border-[#E2E8F0] space-y-1.5 text-base">
            <p className="font-extrabold text-[#0F172A]">{brokerOfficeName}</p>
            <p className="text-[#475569]">
              대표 공인중개사: {brokerRepresentative}
              {realBrokerRegistrationNo ? ` · 등록번호: ${realBrokerRegistrationNo}` : ""}
            </p>
            {realBrokerOfficeAddress && (
              <p className="text-[#475569]" data-testid="mobile-im-broker-office-address">
                소재지: {realBrokerOfficeAddress}
              </p>
            )}
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
                className="mt-2 pt-2 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-sm text-[#475569]"
              >
                <span>중개사무소 상호·소재지·등록번호·대표자·연락처를 입력하면 고객 열람본에 자동 반영됩니다.</span>
                <Link
                  href="/broker/profile"
                  className="font-bold text-[#1D4ED8] hover:underline shrink-0"
                >
                  내 프로필에서 설정하기 →
                </Link>
              </div>
            )}
          </div>

          <p className="text-sm text-[#64748B] leading-relaxed pt-2">
            {contactDisclaimer}
          </p>
        </section>

        {/* Legacy / Pro IM Custom Sections & Gated Financial Charts */}
        {legacyCustomSections.length > 0 && (
          <div className="space-y-4" data-testid="mobile-im-legacy-custom-sections">
            {legacyCustomSections.map((sec, idx) => {
              const isOpen = Boolean(openLegacySections[sec.sectionId] ?? idx === 0);
              return (
                <div key={sec.sectionId || idx} className="space-y-3">
                  <SectionCard
                    section={sec}
                    index={idx}
                    isOpen={isOpen}
                    onToggle={() =>
                      setOpenLegacySections((prev) => ({
                        ...prev,
                        [sec.sectionId]: !isOpen,
                      }))
                    }
                  />
                  {!sec.locked && sec.sectionId === "income_analysis" && (
                    <>
                      {initialDoc?.financials && (
                        <LeverageChart
                          equityBil={Number(
                            initialDoc.financials.equityRequiredBil ??
                              initialDoc.financials.equityRequired ??
                              0,
                          )}
                          depositBil={Number(initialDoc.financials.totalDepositBil ?? 0)}
                          loanBil={Number(initialDoc.financials.loanAmountBil ?? 0)}
                          leveragedYieldPct={
                            initialDoc.financials.leveragedYieldPct ??
                            initialDoc.financials.leveragedYield ??
                            null
                          }
                        />
                      )}
                      {initialDoc?.dcf10Year &&
                        Array.isArray(initialDoc.dcf10Year.sensitivityMatrix) &&
                        initialDoc.dcf10Year.sensitivityMatrix.length > 0 && (
                          <DCFHeatmap
                            dcfOutputs={initialDoc.dcf10Year}
                            waccBase={Number(initialDoc?.financials?.waccPct ?? 5.5) / 100}
                          />
                        )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Version Diff Modal (Only rendered when real previousVersion history exists) ── */}
      {showDiffModal && v1Doc && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs no-print"
          data-testid="version-diff-modal"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border-2 border-[#CBD5E1]">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="text-lg font-extrabold text-[#0F172A]">
                🔍 IM 버전 차이 비교 (v1 ↔ v2)
              </h3>
              <button
                type="button"
                onClick={() => setShowDiffModal(false)}
                className="text-base font-bold text-[#64748B] hover:text-[#0F172A] p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-base">
              <p className="text-sm text-[#475569]">
                수정 및 변경된 항목은 <span className="bg-[#FEF08A] text-[#854D0E] font-bold px-1.5 py-0.5 rounded">노란색</span>으로 강조 표시됩니다.
              </p>

              <div className="rounded-2xl border border-[#CBD5E1] overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAF9F5] border-b border-[#CBD5E1] font-bold">
                    <tr>
                      <th className="p-3">항목</th>
                      <th className="p-3">v1 (이전 버전)</th>
                      <th className="p-3">v2 (현재본)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    <tr
                      className={
                        v1Doc.facts.transaction.askingPriceManwon !==
                        v2Doc.facts.transaction.askingPriceManwon
                          ? "bg-[#FEF9C3]"
                          : undefined
                      }
                    >
                      <td className="p-3 font-semibold">매매 희망가</td>
                      <td className="p-3">
                        {((v1Doc.facts.transaction.askingPriceManwon || 0) / 10000)
                          .toFixed(1)
                          .replace(/\.0$/, "")}
                        억 원
                      </td>
                      <td className="p-3 font-bold text-[#1D4ED8]">
                        {((v2Doc.facts.transaction.askingPriceManwon || 0) / 10000)
                          .toFixed(1)
                          .replace(/\.0$/, "")}
                        억 원 ({diffEok}억 변동)
                      </td>
                    </tr>
                    <tr
                      className={
                        v1Doc.facts.valuation.grossYieldPct !== v2Doc.facts.valuation.grossYieldPct
                          ? "bg-[#FEF9C3]"
                          : undefined
                      }
                    >
                      <td className="p-3 font-semibold">예상 수익률</td>
                      <td className="p-3">{v1Doc.facts.valuation.grossYieldPct.toFixed(2)}%</td>
                      <td className="p-3 font-bold text-[#065F46]">
                        {v2Doc.facts.valuation.grossYieldPct.toFixed(2)}%
                      </td>
                    </tr>
                    <tr
                      className={
                        v1Doc.facts.rent.monthlyRentTotalManwon !==
                        v2Doc.facts.rent.monthlyRentTotalManwon
                          ? "bg-[#FEF9C3]"
                          : undefined
                      }
                    >
                      <td className="p-3 font-semibold">월 임대수익</td>
                      <td className="p-3">
                        {v1Doc.facts.rent.monthlyRentTotalManwon.toLocaleString()}만 원
                      </td>
                      <td className="p-3 font-bold text-[#1D4ED8]">
                        {v2Doc.facts.rent.monthlyRentTotalManwon.toLocaleString()}만 원
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold">연면적</td>
                      <td className="p-3">{v1Doc.facts.building.totalGrossAreaSqm.toLocaleString()}㎡</td>
                      <td className="p-3">{v2Doc.facts.building.totalGrossAreaSqm.toLocaleString()}㎡</td>
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

      {/* ── Fixed Bottom Action Bar (Safe-Area Aware) ── */}
      <footer
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#CBD5E1] shadow-lg pb-[max(0.5rem,env(safe-area-inset-bottom))] no-print"
        data-testid="floating-action-bar"
      >
        {inAppWebView && !dismissedWebViewBanner && (
          <div
            data-testid="inapp-webview-banner"
            className="bg-[#FFFBEB] border-b border-[#FDE68A] px-4 py-2 text-[#92400E]"
          >
            <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold">
                카카오톡 등 앱 내 브라우저에서는 PPTX 파일 저장이 제한될 수 있습니다.
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="open-external-browser-btn"
                  onClick={() => void handleOpenExternalBrowser()}
                  className="min-h-[44px] px-3 py-1.5 rounded-lg bg-[#0F172A] text-white font-bold hover:bg-[#1E293B] transition-colors cursor-pointer"
                >
                  외부 브라우저(Safari/Chrome)로 열기
                </button>
                <button
                  type="button"
                  data-testid="copy-im-link-btn"
                  onClick={() => void handleCopyViewerLink()}
                  className="min-h-[44px] px-3 py-1.5 rounded-lg bg-white border border-[#F59E0B] text-[#92400E] font-bold hover:bg-[#FEF3C7] transition-colors cursor-pointer"
                >
                  링크 복사
                </button>
                <button
                  type="button"
                  aria-label="배너 닫기"
                  onClick={() => setDismissedWebViewBanner(true)}
                  className="min-h-[44px] min-w-[44px] px-2 py-1.5 text-[#92400E] hover:text-[#78350F] font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-2 min-h-14 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
          <div className="flex items-stretch gap-2 w-full sm:flex-1 min-w-0">
            <a
              href={brokerPhone && brokerPhone !== "-" ? `tel:${brokerPhone}` : "#10_contact"}
              className="shrink-0 min-h-[48px] px-3 py-2 bg-[#0F172A] text-white font-bold rounded-xl flex items-center justify-center gap-1.5 hover:bg-[#1E293B] transition-colors cursor-pointer text-sm sm:text-base whitespace-nowrap"
            >
              <span>📞</span>
              <span>전화 문의</span>
            </a>
            {realKakaoChannelUrl ? (
              <a
                href={realKakaoChannelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 min-h-[48px] px-2.5 sm:px-3 py-2 bg-[#FEE500] text-[#3C1E1E] font-bold rounded-xl flex items-center justify-center gap-1 hover:bg-[#FDD835] transition-colors cursor-pointer text-sm sm:text-base leading-snug break-keep text-center overflow-hidden"
              >
                <span>💬</span>
                <span>카톡 상담</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setShowInquiry(true)}
                className="flex-1 min-w-0 min-h-[48px] px-2.5 sm:px-3 py-2 bg-[#1D4ED8] text-white font-bold rounded-xl flex items-center justify-center gap-1 hover:bg-[#1E40AF] transition-colors cursor-pointer text-sm sm:text-base leading-snug break-keep text-center overflow-hidden"
              >
                <span aria-hidden="true" className="shrink-0">📩</span>
                <span>간편 문의 · 자료 요청</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end sm:justify-start">
            <a
              href={resolvedPptxDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="mobile-im-download-pptx-btn"
              aria-busy={isDownloadingPptx}
              onClick={handleMobilePptxDownload}
              className="flex-1 sm:flex-initial min-h-[48px] px-3.5 bg-[#EFF6FF] border border-[#1D4ED8] text-[#1D4ED8] font-bold rounded-xl flex items-center justify-center gap-1 hover:bg-[#DBEAFE] transition-colors cursor-pointer text-sm whitespace-nowrap shrink-0"
              title="PPTX 투자설명서 다운로드"
            >
              <span>{isDownloadingPptx ? "⏳ 생성 중" : "📥 PPTX"}</span>
            </a>
            {isBroker && (
              <Link
                href={`/broker/basic-im-studio/${encodeURIComponent(buildingId)}`}
                data-testid="mobile-im-open-studio-btn"
                className="flex-1 sm:flex-initial min-h-[48px] px-3 bg-[#F8FAFC] border border-[#1D4ED8]/40 text-[#1D4ED8] font-bold rounded-xl flex items-center justify-center gap-1 hover:bg-[#EFF6FF] transition-colors cursor-pointer text-sm whitespace-nowrap shrink-0"
                title="10면 발표자료(PPT) 꾸미기"
              >
                <span>📐 스튜디오</span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[48px] min-w-[48px] px-3.5 bg-[#FAF9F5] border border-[#64748B] text-[#0F172A] font-bold rounded-xl flex items-center justify-center hover:bg-[#F3F2EE] transition-colors cursor-pointer text-base shrink-0"
              title="A4 인쇄 및 PDF 내보내기"
            >
              <span>🖨️</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
