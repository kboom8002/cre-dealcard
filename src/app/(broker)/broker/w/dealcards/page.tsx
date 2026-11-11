"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { Card4ConfirmCard } from "@/components/broker/deal-card/Card4ConfirmCard";
import { KakaoBubblePreview } from "@/components/broker/deal-card/KakaoBubblePreview";
import { PreSendConfirmationSheet } from "@/components/broker/deal-card/PreSendConfirmationSheet";
import { MemoImportModal } from "@/components/broker/deal-card/MemoImportModal";
import {
  resolveCard4AreaLabel,
  type Card4Data,
  type DealCardPosture,
} from "@/lib/deal-card/card4-schema";
import { cleanBlindPoints, validateBlindPoints } from "@/lib/deal-card/blind-guard";
import {
  deriveDealCardHeadline,
  normalizeDealCardCopy,
  repairDealCardLine,
  repairDealCardPoints,
} from "@/lib/deal-card/copy-limits";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";
import { useWorkspaceAutosave } from "@/lib/hooks/useWorkspaceAutosave";
import { POSTURE_LABELS, TERMS } from "@/lib/ux/lexicon";

/**
 * 서버/로컬에서 불러온 카드의 문구를 18자 SSOT 로 맞춘다.
 * - 장점 3줄: 어절 경계 교정 (하드 절단 금지)
 * - 한 줄 제목이 비어 있고 카드 내용이 있으면, 미리보기/OG 가 쓰던 파생 제목을 **같은 입력 필드**에 채운다.
 * - 면적(area)이 아직 초기화되지 않은(undefined) 경우에만 스펙에서 초기 라벨을 채운다 (사용자가 "" 로 비운 값은 보존).
 */
function hydrateCard4(card4: Card4Data): Card4Data {
  const normalized = normalizeDealCardCopy(card4, { fillHeadline: true });
  if (normalized.area === undefined) {
    const initialArea = resolveCard4AreaLabel(normalized);
    if (initialArea) {
      return { ...normalized, area: initialArea };
    }
  }
  return normalized;
}

function hydrateItem<T extends { card4: Card4Data }>(item: T): T {
  const card4 = hydrateCard4(item.card4);
  return card4 === item.card4 ? item : { ...item, card4 };
}

/**
 * 카톡·문자·메모 원문에서 딜카드 4항목 + 장점 3줄 + 한 줄 제목을 안전하게 추출한다.
 * - 번지/건물명/상호 등 민감 식별자는 cleanBlindPoints 로 자동 마스킹
 * - 원문에 없는 수익률 등 숫자는 절대 날조하지 않는다
 */
function parseMemoIntoCard4(memoText: string, prevCard4: Card4Data): Card4Data {
  const text = memoText.trim();
  if (!text) return prevCard4;

  // 1. 매물 성격(posture) 추정
  let posture: DealCardPosture = prevCard4.posture || "income";
  if (/신축|개발|철거|나대지|부지|재건축|용적률/.test(text) && !/사옥/.test(text)) {
    posture = "value_add";
  } else if (/사옥|자가\s*사용|본사|직접\s*입주/.test(text)) {
    posture = "owner_occupied";
  } else if (/임대|수익|월세|만실|보증금/.test(text)) {
    posture = "income";
  }

  // 2. 지역(region) 추출 (번지 제외)
  let region = prevCard4.region || "";
  const guDongMatch = text.match(/([가-힣]{2,6}(?:구|군))\s+([가-힣]{2,8}(?:동|읍|면))/);
  const cityGuMatch = text.match(/([가-힣]{2,6}시)\s+([가-힣]{2,6}(?:구|동|읍|면))/);
  const stationMatch = text.match(/([가-힣]{2,8}역)\s*(?:인근|부근|역세권|도보\s*\d+분)?/);
  const singleGuOrDongMatch = text.match(
    /(?:^|[\s,·/])([가-힣]{2,6}(?:구|동))(?=\s|,|·|\/|\d|$)/
  );
  const falsePositiveDong = new Set([
    "근린생활동",
    "유동",
    "변동",
    "가동",
    "이동",
    "공동",
    "활동",
    "자동",
    "수동",
    "입구",
    "출구",
    "창구",
    "지구",
    "가구",
  ]);

  if (guDongMatch) {
    region = `${guDongMatch[1]} ${guDongMatch[2]}`;
  } else if (cityGuMatch && !cityGuMatch[1].startsWith("서울")) {
    region = `${cityGuMatch[1]} ${cityGuMatch[2]}`;
  } else if (singleGuOrDongMatch && !falsePositiveDong.has(singleGuOrDongMatch[1])) {
    region = singleGuOrDongMatch[1];
  } else if (stationMatch) {
    region = stationMatch[1].endsWith("인근") ? stationMatch[1] : `${stationMatch[1]} 인근`;
  }
  if (region) {
    region = cleanBlindPoints([region])[0]?.trim() || region;
  }

  // 3. 용도(use) 추출
  let use = prevCard4.use || "";
  if (/근린생활시설|근생빌딩|근생상가|올근생|근생/.test(text)) {
    use = "근린생활시설";
  } else if (/지식산업센터/.test(text)) {
    use = "지식산업센터";
  } else if (/업무시설|오피스빌딩|오피스|사옥빌딩|사옥/.test(text)) {
    use = "업무시설";
  } else if (/숙박시설|호텔|모텔/.test(text)) {
    use = "숙박시설";
  } else if (/물류센터|창고시설|물류|창고/.test(text)) {
    use = "창고시설";
  } else if (/메디컬빌딩|병원|의원/.test(text)) {
    use = "메디컬빌딩";
  } else if (/상가주택|다가구/.test(text)) {
    use = "상가주택";
  } else if (/나대지|신축\s*부지|개발\s*부지/.test(text)) {
    use = "신축부지";
  }

  // 4. 면적(gfaPyung / landAreaPyung / area) 추출
  const toPyung = (rawNum: string, unit: string): number | undefined => {
    const n = parseFloat(rawNum.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    if (/㎡|m2/i.test(unit)) return Math.round(n / 3.3058);
    return Math.round(n);
  };

  const gfaMatch = text.match(/(?:연면적|건평)\s*[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i);
  const landMatch = text.match(/(?:대지면적|토지면적|대지|토지)\s*[:：]?\s*(?:약\s*)?([\d,.]+)\s*(평|㎡|m2)/i);
  const gfaPyung = (gfaMatch ? toPyung(gfaMatch[1], gfaMatch[2]) : undefined) ?? prevCard4.gfaPyung;
  const landAreaPyung =
    (landMatch ? toPyung(landMatch[1], landMatch[2]) : undefined) ?? prevCard4.landAreaPyung;

  let area = prevCard4.area;
  if (posture === "value_add" && landAreaPyung) {
    area = `토지 ${landAreaPyung}평`;
  } else if (gfaPyung) {
    area = `연면적 ${gfaPyung}평`;
  } else if (landAreaPyung) {
    area = `토지 ${landAreaPyung}평`;
  }

  // 5. 가격 구간(priceBand) 추출 (보증금/대출 숫자와 구분)
  let priceBand = prevCard4.priceBand || "";
  const explicitBandMatch = text.match(/(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)\s*억/);
  if (explicitBandMatch) {
    priceBand = `${explicitBandMatch[1]}~${explicitBandMatch[2]}억`;
  } else {
    const explicitAskMatch = text.match(
      /(?:매매가|매각가|희망가|매가|매매)\s*[:：]?\s*(?:약\s*)?(\d+(?:[.,]\d+)?)\s*억(?:\s*(\d+)\s*천)?/
    );
    let askEok: number | null = null;
    if (explicitAskMatch) {
      askEok =
        parseFloat(explicitAskMatch[1].replace(/,/g, "")) +
        (explicitAskMatch[2] ? parseFloat(explicitAskMatch[2]) * 0.1 : 0);
    } else {
      const strippedSubAmounts = text.replace(
        /(?:보증금|전세금|대출|융자|근저당)\s*[:：]?\s*(?:약\s*)?\d+(?:[.,]\d+)?\s*억/g,
        ""
      );
      const allEok = Array.from(strippedSubAmounts.matchAll(/(\d+(?:[.,]\d+)?)\s*억/g))
        .map((m) => parseFloat(m[1].replace(/,/g, "")))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (allEok.length > 0) {
        askEok = Math.max(...allEok);
      }
    }

    if (askEok !== null && askEok > 0) {
      if (askEok >= 100) {
        const low = Math.floor(askEok / 10) * 10;
        priceBand = `${low}~${low + 10}억`;
      } else if (askEok >= 20) {
        const low = Math.floor(askEok / 5) * 5;
        priceBand = `${low}~${low + 5}억`;
      } else {
        const low = Math.max(1, Math.floor(askEok));
        priceBand = `${low}~${low + 2}억`;
      }
    }
  }

  // 6. 장점 3줄 추출 (블라인드 정제 + 18자 어절 경계 교정)
  const rawClauses = text
    .split(/[\n,;/·]+/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 3);

  const candidatePoints: string[] = [];
  for (const clause of rawClauses) {
    if (/^(?:주소|소재지|위치|매매가|매각가|보증금|연락처|전화)\s*[:：]/.test(clause)) continue;
    if (/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/.test(clause)) continue;
    const cleaned = cleanBlindPoints([clause])[0]?.trim() || "";
    if (!cleaned) continue;
    const repaired = repairDealCardLine(cleaned);
    if (
      repaired &&
      repaired.length >= 3 &&
      repaired !== region &&
      repaired !== use &&
      !candidatePoints.includes(repaired)
    ) {
      candidatePoints.push(repaired);
    }
    if (candidatePoints.length >= 3) break;
  }

  const fallbackByPosture: Record<DealCardPosture, [string, string, string]> = {
    income: ["접근성 좋은 입지", "안정적 임차 구성", "꾸준한 임대수익 구조"],
    owner_occupied: ["사옥 활용 쉬운 구조", "출퇴근 편한 입지", "즉시 검토 가능 매물"],
    value_add: ["신축·리모델링 검토 부지", "가치 상승 여지 보유", "토지 활용도 높은 입지"],
  };

  const existingValid = prevCard4.points.map((p) => p.trim()).filter(Boolean);
  const mergedRawPoints = [...candidatePoints, ...existingValid];
  const points = repairDealCardPoints(mergedRawPoints, {
    fillEmpty: true,
    fallbacks: fallbackByPosture[posture],
  });

  const headline = deriveDealCardHeadline({ posture, points });

  return {
    ...prevCard4,
    headline,
    posture,
    region: region || prevCard4.region,
    use: use || prevCard4.use,
    ...(area !== undefined ? { area } : {}),
    ...(gfaPyung !== undefined ? { gfaPyung } : {}),
    ...(landAreaPyung !== undefined ? { landAreaPyung } : {}),
    priceBand: priceBand || prevCard4.priceBand,
    points,
    provenance: {
      points: ["broker", "broker", "broker"],
    },
  };
}

interface BuildingListItem {
  id: string;
  title: string;
  region: string;
  use: string;
  priceBand: string;
  status: "draft" | "sent" | "archived";
  updatedAt: string;
  card4: Card4Data;
}

const SAMPLE_CARD4: Card4Data = {
  headline: "대로변 코너 만실 운영 매물",
  posture: "income",
  region: "영등포구 양평동",
  use: "근린생활시설",
  area: "연면적 439평",
  gfaPyung: 439,
  landAreaPyung: 127,
  priceBand: "90~100억",
  points: [
    "역세권 도보 3분 코너",
    "우량 임차인 전층 만실",
    "안정적인 임대수익 구조",
  ],
  pointTones: ["amber", "sky", "mint"],
  provenance: {
    points: ["public", "broker", "ai"],
  },
  card4_version: 1,
};

const EMPTY_CARD4: Card4Data = {
  headline: "",
  posture: "income",
  region: "",
  use: "",
  area: "",
  priceBand: "",
  points: ["", "", ""],
  pointTones: ["amber", "sky", "mint"],
  provenance: {
    points: ["broker", "broker", "broker"],
  },
  card4_version: 1,
};

const INITIAL_BUILDINGS: BuildingListItem[] = [
  {
    id: "bld-01",
    title: "영등포구 양평동 근린생활시설",
    region: "영등포구 양평동",
    use: "근린생활시설",
    priceBand: "90~100억",
    status: "draft",
    updatedAt: "방금",
    card4: SAMPLE_CARD4,
  },
];

const INITIAL_IDS = new Set(INITIAL_BUILDINGS.map((b) => b.id));
const STORAGE_KEY = "credeal-w-dealcards-v5";

interface BrokerProfileSummary {
  displayName: string;
  company: string;
  phone: string;
  registrationNo: string;
  slug: string;
  photoUrl: string | null;
}

function DealCardsWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  const rawBuildingIdParam = searchParams.get("buildingId") || searchParams.get("id");
  const buildingIdParam = rawBuildingIdParam ? rawBuildingIdParam.trim() || null : null;
  const isNewParam = searchParams.get("new") === "true";

  const [items, setItems] = useState<BuildingListItem[]>(INITIAL_BUILDINGS);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => buildingIdParam || INITIAL_BUILDINGS[0]?.id || null
  );
  const [syncedServerIds, setSyncedServerIds] = useState<Set<string>>(() => new Set());
  const [brokerProfile, setBrokerProfile] = useState<BrokerProfileSummary | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [postureFilter, setPostureFilter] = useState<"all" | "income" | "owner_value">("all");
  const [isPreSendOpen, setIsPreSendOpen] = useState(false);
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);

  const hasHandledNewRef = useRef(false);
  const initialBuildingIdParamRef = useRef<string | null>(buildingIdParam);
  const lastSyncedQueryIdRef = useRef<string | null>(null);
  const userInteractedRef = useRef<boolean>(false);
  const userEditedIdsRef = useRef<Set<string>>(new Set());

  const persistItems = useCallback((nextItems: BuildingListItem[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
    } catch {
      // ignore
    }
  }, []);

  const markServerSynced = useCallback((id: string) => {
    if (!id) return;
    setSyncedServerIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const unmarkServerSynced = useCallback((id: string) => {
    if (!id) return;
    setSyncedServerIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // SSOT activeItem & resolvedActiveId — 유령 buildingId 로 인한 입력 동결 및 0-하이라이트 원천 차단 (DC-01)
  const activeItem = useMemo(() => {
    if (selectedId) {
      const bySelected = items.find((it) => it.id === selectedId);
      if (bySelected) return bySelected;
    }
    if (buildingIdParam) {
      const byQuery = items.find((it) => it.id === buildingIdParam);
      if (byQuery) return byQuery;
    }
    return items[0] ?? null;
  }, [items, selectedId, buildingIdParam]);

  const resolvedActiveId = activeItem?.id ?? null;

  const [currentCard4, setCurrentCard4] = useState<Card4Data>(
    () => activeItem?.card4 || SAMPLE_CARD4
  );
  const [syncedBuildingId, setSyncedBuildingId] = useState<string>(
    () => activeItem?.id || ""
  );
  const effectiveCard4 =
    activeItem && activeItem.id !== syncedBuildingId ? activeItem.card4 : currentCard4;

  const resolvedActiveIdRef = useRef<string | null>(resolvedActiveId);
  const currentCard4Ref = useRef<Card4Data>(effectiveCard4);
  resolvedActiveIdRef.current = resolvedActiveId;
  currentCard4Ref.current = effectiveCard4;

  const selectDealCard = useCallback(
    (nextId: string, options?: { syncUrl?: boolean }) => {
      if (!nextId) return;
      userInteractedRef.current = true;
      setSelectedId(nextId);
      if (options?.syncUrl ?? true) {
        router.replace(`/broker/w/dealcards?buildingId=${encodeURIComponent(nextId)}&tab=editor`);
      }
    },
    [router]
  );

  // 마운트 시 1회만 서버 요약 조회 + 미동기화 로컬 초안/인메모리 편집 보존 병합 (DC-02)
  useEffect(() => {
    try {
      const savedRaw = window.localStorage.getItem(STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hydratedLocal = parsed.map((it: BuildingListItem) =>
            it?.card4 ? hydrateItem(it) : it
          );
          setItems(hydratedLocal);
          const initTargetId = initialBuildingIdParamRef.current;
          const initMatch =
            (initTargetId && hydratedLocal.find((it) => it.id === initTargetId)) ||
            hydratedLocal[0];
          if (initMatch && !userInteractedRef.current) {
            setSelectedId(initMatch.id);
            setCurrentCard4(initMatch.card4);
            setSyncedBuildingId(initMatch.id);
          }
        }
      }
    } catch {
      // ignore storage error
    }

    const initQueryId = initialBuildingIdParamRef.current;
    const querySuffix = initQueryId ? `?buildingId=${encodeURIComponent(initQueryId)}` : "";
    fetch(`/api/broker/workspace/summary${querySuffix}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.brokerProfile) {
          setBrokerProfile(data.brokerProfile);
        }
        if (data?.ok && Array.isArray(data.dealcards)) {
          const serverIds = new Set<string>();
          for (const rawSrv of data.dealcards as BuildingListItem[]) {
            if (rawSrv?.id) serverIds.add(rawSrv.id);
          }
          if (serverIds.size > 0) {
            setSyncedServerIds((prev) => {
              const next = new Set(prev);
              for (const id of serverIds) next.add(id);
              return next;
            });
          }

          setItems((prev) => {
            const localMap = new Map(prev.map((it) => [it.id, it]));
            const mergedServer: BuildingListItem[] = data.dealcards.map(
              (rawSrv: BuildingListItem) => {
                const srv = rawSrv?.card4 ? hydrateItem(rawSrv) : rawSrv;
                const local = localMap.get(srv.id);
                const effectiveStatus =
                  srv.status === "sent" || local?.status === "sent"
                    ? ("sent" as const)
                    : srv.status;
                // 인메모리 편집이 이미 시작되었거나 로컬 버전이 더 최신이면 사용자 수정을 보존
                if (
                  local &&
                  (userEditedIdsRef.current.has(srv.id) ||
                    (local.card4.card4_version || 1) > (srv.card4.card4_version || 1))
                ) {
                  return {
                    ...local,
                    status: effectiveStatus,
                  };
                }
                return {
                  ...srv,
                  status: effectiveStatus,
                };
              }
            );

            // 서버에 아직 없는 모든 미동기화 로컬 초안 보존 (초기 샘플 미편집분만 서버 목록 존재 시 교체)
            const unsyncedLocals = prev.filter(
              (loc) =>
                !serverIds.has(loc.id) &&
                (!INITIAL_IDS.has(loc.id) ||
                  userEditedIdsRef.current.has(loc.id) ||
                  (loc.card4.card4_version || 1) > 1)
            );

            const finalMerged = [...unsyncedLocals, ...mergedServer];
            if (finalMerged.length > 0) {
              persistItems(finalMerged);
              const preferredId = userInteractedRef.current
                ? resolvedActiveIdRef.current
                : (initQueryId && finalMerged.some((m) => m.id === initQueryId)
                    ? initQueryId
                    : finalMerged[0]?.id) ?? null;
              const targetItem =
                (preferredId && finalMerged.find((m) => m.id === preferredId)) ||
                finalMerged[0];
              if (targetItem) {
                if (!userInteractedRef.current) {
                  setSelectedId(targetItem.id);
                }
                if (!userEditedIdsRef.current.has(targetItem.id)) {
                  setCurrentCard4(targetItem.card4);
                  setSyncedBuildingId(targetItem.id);
                }
              }
              return finalMerged;
            }
            return prev;
          });
        }
      })
      .catch(() => {
        // Offline or test environment fallback
      })
      .finally(() => {
        setIsHydrated(true);
      });
  }, [persistItems]);

  // 외부 URL 쿼리(?buildingId=) 변경 동기화 및 존재하지 않는 ID 정규화 (DC-01)
  useEffect(() => {
    if (!buildingIdParam) {
      lastSyncedQueryIdRef.current = null;
      return;
    }
    if (buildingIdParam === lastSyncedQueryIdRef.current) {
      return;
    }
    const matched = items.find((it) => it.id === buildingIdParam);
    if (matched) {
      lastSyncedQueryIdRef.current = buildingIdParam;
      setSelectedId(matched.id);
      return;
    }
    if (isHydrated) {
      lastSyncedQueryIdRef.current = buildingIdParam;
      const fallback = (userInteractedRef.current ? activeItem : null) ?? items[0];
      if (fallback) {
        setSelectedId(fallback.id);
        router.replace(
          `/broker/w/dealcards?buildingId=${encodeURIComponent(fallback.id)}&tab=editor`
        );
      }
    }
  }, [buildingIdParam, items, activeItem, isHydrated, router]);

  const performServerSave = useCallback(
    async ({ id, data: payloadCard4 }: { id: string; data: Card4Data }) => {
      if (!id) throw new Error("Missing buildingId");
      const res = await fetch("/api/broker/workspace/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          buildingId: id,
          card4: payloadCard4,
        }),
      });
      if (!res.ok) {
        throw new Error(`Save failed (${res.status})`);
      }
      const data = await res.json().catch(() => null);
      markServerSynced(id);
      try {
        const imRaw = window.localStorage.getItem("credeal-w-im-v4");
        if (imRaw) {
          const imParsed = JSON.parse(imRaw);
          if (Array.isArray(imParsed)) {
            const nextIm = imParsed.map((it: Record<string, unknown>) =>
              it.buildingId === id || it.id === id ? { ...it, isDirty: false } : it
            );
            window.localStorage.setItem("credeal-w-im-v4", JSON.stringify(nextIm));
          }
        }
      } catch {
        // ignore storage errors
      }
      return {
        version: data?.card4?.card4_version ?? payloadCard4.card4_version ?? 1,
      };
    },
    [markServerSynced]
  );

  const autosave = useWorkspaceAutosave<Card4Data>({
    id: resolvedActiveId,
    ready: isHydrated,
    data: effectiveCard4,
    debounceMs: 900,
    onSave: performServerSave,
  });

  useEffect(() => {
    if (activeItem) {
      setCurrentCard4(activeItem.card4);
      setSyncedBuildingId(activeItem.id);
    }
  }, [resolvedActiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 카드 ID 별 격리된 업데이트 핸들러 — 비동기 AI / 실행 취소 시 타 카드 오염 원천 차단 (DC-03)
  const handleCardChangeFor = useCallback(
    (targetId: string, updated: Card4Data) => {
      if (!targetId) return;
      userEditedIdsRef.current.add(targetId);
      const nextVersion = (updated.card4_version || 1) + 1;
      const withMeta: Card4Data = {
        ...updated,
        card4_version: nextVersion,
      };

      if (targetId === resolvedActiveIdRef.current) {
        setCurrentCard4(withMeta);
        setSyncedBuildingId(targetId);
        currentCard4Ref.current = withMeta;
      }

      setItems((prev) => {
        const next = prev.map((it) =>
          it.id === targetId
            ? {
                ...it,
                title: `${withMeta.region} ${withMeta.use}`.trim() || "새 딜카드",
                region: withMeta.region,
                use: withMeta.use,
                priceBand: withMeta.priceBand,
                updatedAt: "방금",
                card4: withMeta,
              }
            : it
        );
        persistItems(next);
        return next;
      });

      if (targetId !== resolvedActiveIdRef.current) {
        void performServerSave({ id: targetId, data: withMeta }).catch(() => {});
      }
    },
    [persistItems, performServerSave]
  );

  const handleFlushSave = useCallback(async (): Promise<boolean> => {
    const activeId = resolvedActiveIdRef.current;
    if (!activeId) return false;
    const isAlreadySaved =
      syncedServerIds.has(activeId) &&
      !autosave.dirty &&
      autosave.status === "saved";
    if (isAlreadySaved) return true;

    const flushed = await autosave.flush();
    if (flushed) return true;

    try {
      await performServerSave({ id: activeId, data: currentCard4Ref.current });
      return true;
    } catch {
      return false;
    }
  }, [autosave, performServerSave, syncedServerIds]);

  const handleMarkSent = useCallback(() => {
    const activeId = resolvedActiveIdRef.current;
    if (!activeId) return;
    setItems((prev) => {
      const next = prev.map((it) =>
        it.id === activeId ? { ...it, status: "sent" as const, updatedAt: "방금" } : it
      );
      persistItems(next);
      return next;
    });
    void fetch("/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark_sent",
        buildingId: activeId,
        card4: currentCard4Ref.current,
      }),
    })
      .then((res) => {
        if (res.ok) markServerSynced(activeId);
      })
      .catch(() => {});
  }, [markServerSynced, persistItems]);

  const handleCreateNew = useCallback(() => {
    const newId = `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newItem: BuildingListItem = {
      id: newId,
      title: "새 딜카드",
      region: "",
      use: "",
      priceBand: "",
      status: "draft",
      updatedAt: "방금",
      card4: { ...EMPTY_CARD4 },
    };
    userInteractedRef.current = true;
    setItems((prev) => {
      const next = [newItem, ...prev];
      persistItems(next);
      return next;
    });
    setSelectedId(newId);
    setCurrentCard4({ ...EMPTY_CARD4 });
    setSyncedBuildingId(newId);
    void fetch("/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert",
        buildingId: newId,
        card4: newItem.card4,
      }),
    })
      .then((res) => {
        if (res.ok) markServerSynced(newId);
      })
      .catch(() => {});
    router.replace(`/broker/w/dealcards?buildingId=${encodeURIComponent(newId)}&tab=editor`);
    showUndoToast({
      message: "빈 딜카드를 새로 열었어요. 지역과 용도부터 적어 보세요.",
      variant: "success",
    });
  }, [markServerSynced, persistItems, router, showUndoToast]);

  const handleFillSample = () => {
    const targetId = resolvedActiveId;
    if (!targetId) return;
    const prevSnapshot: Card4Data = {
      ...effectiveCard4,
      points: [...effectiveCard4.points] as [string, string, string],
    };
    handleCardChangeFor(targetId, { ...SAMPLE_CARD4 });
    showUndoToast({
      message: "예시 내용을 채웠어요",
      undoAction: () => handleCardChangeFor(targetId, prevSnapshot),
    });
  };

  const handleAutoMaskActiveCard = useCallback(() => {
    const targetId = resolvedActiveIdRef.current;
    if (!targetId) return;
    const base = currentCard4Ref.current;
    const prevSnapshot: Card4Data = {
      ...base,
      points: [...base.points] as [string, string, string],
    };
    const cleanedPts = cleanBlindPoints(base.points).map((p) =>
      repairDealCardLine(p)
    ) as [string, string, string];
    const cleanedHeadline = base.headline
      ? repairDealCardLine(cleanBlindPoints([base.headline])[0] ?? "")
      : base.headline;
    let cleanedRegion = cleanBlindPoints([base.region])[0] || base.region;
    const cleanedUse = cleanBlindPoints([base.use])[0] || base.use;
    const cleanedArea = base.area ? cleanBlindPoints([base.area])[0] : base.area;
    const cleanedPriceBand = base.priceBand
      ? cleanBlindPoints([base.priceBand])[0]
      : base.priceBand;

    const recheck = validateBlindPoints(cleanedPts, {
      region: cleanedRegion,
      assetType: cleanedUse,
    });
    if (recheck.requiresDongToGuFallback && recheck.suggestedRegion) {
      cleanedRegion = recheck.suggestedRegion;
    }

    handleCardChangeFor(targetId, {
      ...base,
      region: cleanedRegion,
      use: cleanedUse,
      area: cleanedArea,
      priceBand: cleanedPriceBand,
      ...(cleanedHeadline !== undefined ? { headline: cleanedHeadline } : {}),
      points: cleanedPts,
    });

    showUndoToast({
      message: "위치가 드러나는 표현을 자동으로 가렸어요",
      undoAction: () => handleCardChangeFor(targetId, prevSnapshot),
    });
  }, [handleCardChangeFor, showUndoToast]);

  const handleSelectMemo = useCallback(
    (memoText: string) => {
      const targetId = resolvedActiveIdRef.current;
      if (!targetId || !memoText.trim()) return;
      const base = currentCard4Ref.current;
      const prevSnapshot: Card4Data = {
        ...base,
        points: [...base.points] as [string, string, string],
      };
      const parsedCard4 = parseMemoIntoCard4(memoText, base);
      handleCardChangeFor(targetId, parsedCard4);
      showUndoToast({
        message: "메모 내용을 딜카드 항목에 채웠어요",
        variant: "success",
        undoAction: () => handleCardChangeFor(targetId, prevSnapshot),
      });
    },
    [handleCardChangeFor, showUndoToast]
  );

  useEffect(() => {
    if (isNewParam && !hasHandledNewRef.current) {
      hasHandledNewRef.current = true;
      handleCreateNew();
    }
  }, [isNewParam, handleCreateNew]);

  const handleDuplicateItem = (source: BuildingListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const newId = `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cloned: BuildingListItem = {
      ...source,
      id: newId,
      title: `${source.title} (사본)`,
      status: "draft",
      updatedAt: "방금",
      card4: {
        ...source.card4,
        headline: source.card4.headline ? repairDealCardLine(source.card4.headline) : "",
        card4_version: 1,
      },
    };
    userInteractedRef.current = true;
    setItems((prev) => {
      const next = [cloned, ...prev];
      persistItems(next);
      return next;
    });
    setSelectedId(newId);
    setCurrentCard4(cloned.card4);
    setSyncedBuildingId(newId);
    void fetch("/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert",
        buildingId: newId,
        card4: cloned.card4,
      }),
    })
      .then((res) => {
        if (res.ok) markServerSynced(newId);
      })
      .catch(() => {});
    router.replace(`/broker/w/dealcards?buildingId=${encodeURIComponent(newId)}&tab=editor`);
    showUndoToast({
      message: `'${source.title}' 딜카드를 복제했어요`,
      variant: "success",
    });
  };

  const handleDeleteItem = (target: BuildingListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    // 삭제 직전 대기 중인 디바운스 자동저장을 즉시 취소하여 삭제된 카드 부활 차단 (DC-01 / SH-02)
    (autosave as { cancelPending?: (k?: string) => void }).cancelPending?.(target.id);
    unmarkServerSynced(target.id);

    const prevSnapshot = [...items];
    const remaining = items.filter((it) => it.id !== target.id);
    const nextList: BuildingListItem[] =
      remaining.length > 0
        ? remaining
        : [
            {
              id: `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: "새 딜카드",
              region: "",
              use: "",
              priceBand: "",
              status: "draft",
              updatedAt: "방금",
              card4: { ...EMPTY_CARD4 },
            },
          ];
    userInteractedRef.current = true;
    setItems(nextList);
    persistItems(nextList);
    void fetch("/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        buildingId: target.id,
      }),
    }).catch(() => {});

    if (target.id === resolvedActiveId && nextList[0]) {
      const nextActive = nextList[0];
      setSelectedId(nextActive.id);
      setCurrentCard4(nextActive.card4);
      setSyncedBuildingId(nextActive.id);
      router.replace(
        `/broker/w/dealcards?buildingId=${encodeURIComponent(nextActive.id)}&tab=editor`
      );
    }

    showUndoToast({
      message: `'${target.title}' 딜카드를 삭제했어요`,
      undoAction: () => {
        userInteractedRef.current = true;
        setItems(prevSnapshot);
        persistItems(prevSnapshot);
        setSelectedId(target.id);
        setCurrentCard4(target.card4);
        setSyncedBuildingId(target.id);
        router.replace(
          `/broker/w/dealcards?buildingId=${encodeURIComponent(target.id)}&tab=editor`
        );
        void fetch("/api/broker/workspace/summary", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "restore",
            buildingId: target.id,
            card4: target.card4,
          }),
        })
          .then((res) => {
            if (res.ok) markServerSynced(target.id);
          })
          .catch(() => {});
      },
    });
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredItems = items.filter((it) => {
    const searchable = [
      it.title,
      it.region,
      it.use,
      it.priceBand,
      it.card4.region || "",
      it.card4.use || "",
      it.card4.priceBand || "",
      it.card4.headline || "",
      it.card4.points.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
    const itemPosture = it.card4.posture || "income";
    const matchesPosture =
      postureFilter === "all" ||
      (postureFilter === "income" && itemPosture === "income") ||
      (postureFilter === "owner_value" &&
        (itemPosture === "owner_occupied" || itemPosture === "value_add"));
    return matchesQuery && matchesPosture;
  });

  const isBlankCard =
    !effectiveCard4.region?.trim() &&
    !effectiveCard4.use?.trim() &&
    !effectiveCard4.priceBand?.trim();

  /* ── Column 1: ① 고르기 목록 ── */
  const listSlot = (
    <div className="space-y-3" data-testid="dealcard-airtable-list">
      {/* Header Summary */}
      <div
        data-theme-lock="dark"
        className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-[#1D1D1F] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_12px_rgba(15,23,42,0.12)]"
      >
        <span className="text-sm font-semibold text-white">
          내 딜카드 목록
        </span>
        <span className="text-sm font-semibold text-[#FFAA00]">
          총 {filteredItems.length}건
        </span>
      </div>

      {/* Primary Create Button */}
      <button
        type="button"
        onClick={handleCreateNew}
        data-testid="workspace-new-dealcard-btn"
        className="w-full min-h-[52px] rounded-2xl bg-gradient-to-b from-[#1A88FF] to-[#007AFF] hover:brightness-105 text-white font-semibold text-base flex items-center justify-center gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_rgba(0,122,255,0.28)] transition-all cursor-pointer"
      >
        <span>＋</span>
        <span>새 딜카드 만들기</span>
      </button>

      {/* Search Input */}
      <div className="relative">
        <label htmlFor="dealcard-search-input" className="sr-only">
          딜카드 검색
        </label>
        <input
          id="dealcard-search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="지역, 용도, 가격, 장점 키워드로 찾기..."
          className="w-full min-h-[48px] px-3.5 rounded-2xl bg-white/92 border border-slate-900/[0.12] text-base text-[#1D1D1F] placeholder:text-[#6E6E73] focus:outline-none focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/18 transition-all"
        />
      </div>

      {/* 매물 유형 필터 (iOS Segmented Control) */}
      <div
        role="tablist"
        aria-label="매물 유형별 보기"
        data-testid="dealcard-posture-switcher"
        className="grid grid-cols-3 gap-1 p-1 rounded-2xl ios-segmented-track bg-[#767680]/[0.11] border border-white/60"
      >
        {(
          [
            { id: "all", label: "전체" },
            { id: "income", label: "임대수익" },
            { id: "owner_value", label: "사옥·개발" },
          ] as const
        ).map((tab) => {
          const active = postureFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`dealcard-posture-tab-${tab.id}`}
              onClick={() => setPostureFilter(tab.id)}
              className={`min-h-[44px] px-2 py-1.5 rounded-xl text-sm font-semibold flex items-center justify-center transition-all cursor-pointer ${
                active
                  ? "ios-segmented-pill bg-white text-[#007AFF]"
                  : "text-[#3A3A3C] hover:text-[#1D1D1F]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Items List (Spatial Liquid Glass Cards) */}
      <div className="space-y-2.5 pt-1" role="list">
        {filteredItems.length === 0 && searchQuery.trim() ? (
          <div
            data-testid="dealcard-empty-search"
            className="p-5 rounded-2xl bg-white/92 border border-slate-200 text-center space-y-3"
          >
            <p className="text-sm font-bold text-[#1D1D1F] break-keep">
              &lsquo;{searchQuery.trim()}&rsquo; 검색 결과와 일치하는 딜카드가 없습니다.
            </p>
            <button
              type="button"
              data-testid="dealcard-clear-search-btn"
              onClick={() => setSearchQuery("")}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-sm font-bold transition cursor-pointer"
            >
              검색어 지우기
            </button>
          </div>
        ) : filteredItems.length === 0 && postureFilter !== "all" ? (
          <div
            data-testid="dealcard-empty-filter"
            className="p-5 rounded-2xl bg-white/92 border border-slate-200 text-center space-y-3"
          >
            <p className="text-sm font-bold text-[#1D1D1F] break-keep">
              선택한 유형의 딜카드가 아직 없습니다.
            </p>
            <button
              type="button"
              onClick={() => setPostureFilter("all")}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-sm font-bold transition cursor-pointer"
            >
              전체 보기
            </button>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isSelected = item.id === resolvedActiveId;
            const itemPosture = item.card4.posture || "income";
            const postureLabel = POSTURE_LABELS[itemPosture].shortBadge;
            const itemBlind = validateBlindPoints([
              ...item.card4.points,
              item.card4.region || "",
              item.card4.use || "",
              item.card4.area || "",
              item.card4.priceBand || "",
              item.card4.headline || "",
            ]);

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                aria-current={isSelected ? "true" : undefined}
                data-selected={isSelected ? "true" : "false"}
                data-testid={`dealcard-item-${item.id}`}
                onClick={() => {
                  selectDealCard(item.id);
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectDealCard(item.id);
                  }
                }}
                className={`relative min-h-[84px] p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-center ios-glass-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] ${
                  isSelected
                    ? "ios-glass-card-active bg-white/95 border-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_20px_-4px_rgba(0,122,255,0.14)] ring-2 ring-[#007AFF]/20"
                    : "bg-white/82 border-slate-900/[0.075] hover:bg-white/95"
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0 top-2.5 bottom-2.5 w-1.5 bg-[#007AFF] rounded-r-full" />
                )}

                {/* Line 1: Title + Status Badge */}
                <div className="flex items-center justify-between gap-2 pl-2">
                  <h3
                    data-single-line-title="true"
                    title={item.card4.headline || item.title}
                    className={`text-base break-keep ${
                      isSelected ? "font-bold text-[#0040DD]" : "font-bold text-[#1D1D1F]"
                    }`}
                  >
                    {item.title || "새 딜카드"}
                  </h3>
                  <span
                    className={`text-sm px-2.5 py-0.5 rounded-full font-semibold shrink-0 border ${
                      !itemBlind.isValid
                        ? "bg-[#FF2D55]/12 text-[#C8102E] border-[#FF2D55]/25"
                        : item.status === "sent"
                        ? "bg-[#28CD41]/12 text-[#116B22] border-[#28CD41]/25"
                        : "bg-[#767680]/10 text-[#3A3A3C] border-slate-900/[0.08]"
                    }`}
                  >
                    {!itemBlind.isValid
                      ? "⚠ 확인 필요"
                      : item.status === "sent"
                      ? TERMS.statusSent
                      : TERMS.statusDraft}
                  </span>
                </div>

                {/* Line 2: Price + Posture + Quick Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pl-2 mt-2">
                  <div className="flex items-center gap-1.5 text-sm text-[#515154] font-medium">
                    <span className="font-bold text-[#1D1D1F]">
                      {item.priceBand || "가격 미입력"}
                    </span>
                    <span>·</span>
                    <span>{postureLabel}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid={`dealcard-duplicate-${item.id}`}
                      onClick={(e) => handleDuplicateItem(item, e)}
                      className="min-h-[36px] text-sm font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer"
                    >
                      복제
                    </button>
                    <button
                      type="button"
                      data-testid={`dealcard-delete-${item.id}`}
                      onClick={(e) => handleDeleteItem(item, e)}
                      className="min-h-[36px] text-sm font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 border border-slate-300 cursor-pointer"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  /* ── Column 2: ② 채우기 (Card4 Editor) ── */
  const isSampleCard =
    resolvedActiveId === "bld-01" &&
    !isBlankCard &&
    (effectiveCard4.region?.includes("양평동") || activeItem?.title?.includes("양평동"));

  const editorTargetId = resolvedActiveId || "";

  const editorSlot = (
    <div className="space-y-4">
      {/* Column 2 Top Action Bar: 카톡·메모 붙여넣기 & IM 편집 연동 (DC-07, DC-08) */}
      <div
        data-testid="dealcard-editor-toolbar"
        className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2.5"
      >
        <button
          type="button"
          data-testid="dealcard-open-memo-import-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setIsMemoModalOpen(true)}
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 text-sm font-extrabold transition cursor-pointer inline-flex items-center gap-1.5"
        >
          <span>📋 카톡·메모 붙여넣기</span>
        </button>

        {activeItem && (
          <a
            href={`/broker/w/im?buildingId=${encodeURIComponent(activeItem.id)}`}
            data-testid="dealcard-open-im-link"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                return;
              }
              e.preventDefault();
              void handleFlushSave();
              router.push(`/broker/w/im?buildingId=${encodeURIComponent(activeItem.id)}`);
            }}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-sm font-extrabold transition cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>📊 이 매물로 IM 편집 →</span>
          </a>
        )}
      </div>

      {isSampleCard && (
        <div
          data-testid="dealcard-sample-banner"
          className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm font-bold text-amber-950">
            💡 현재 예시 딜카드(영등포구 양평동)가 열려 있습니다. 새 매물을 작성하려면 오른쪽 버튼을 눌러 빈 양식으로 시작하세요.
          </p>
          <button
            type="button"
            data-testid="dealcard-sample-reset-btn"
            data-theme-lock="dark"
            onClick={handleCreateNew}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-amber-900 hover:bg-amber-950 text-white text-sm font-extrabold transition cursor-pointer shrink-0"
          >
            새 빈 딜카드로 시작하기
          </button>
        </div>
      )}
      {isBlankCard && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex flex-wrap items-center justify-between gap-3">
          <p className="text-base font-bold text-blue-950">
            처음 작성하시나요? 예시를 불러와서 숫자만 고쳐 쓰실 수도 있어요.
          </p>
          <button
            type="button"
            data-testid="dealcard-fill-sample-btn"
            onClick={handleFillSample}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-white hover:bg-blue-100 text-blue-900 border border-blue-300 text-sm font-extrabold transition cursor-pointer"
          >
            예시 채우기
          </button>
        </div>
      )}
      <Card4ConfirmCard
        key={editorTargetId}
        card4={effectiveCard4}
        onChange={(next) => handleCardChangeFor(editorTargetId, next)}
      />
    </div>
  );

  /* ── Column 3: ③ 확인하고 보내기 ── */
  const previewSlot = (
    <div className="space-y-4">
      <KakaoBubblePreview
        card4={effectiveCard4}
        dealId={resolvedActiveId || ""}
        brokerName={brokerProfile?.displayName}
        brokerSpecialty={brokerProfile?.company}
        brokerPhone={brokerProfile?.phone}
      />
    </div>
  );

  /* ── Primary Action Button mounted at bottom of Column 3 (and mirrored on <1280px) ── */
  const primaryActionSlot = (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setIsPreSendOpen(true)}
      data-testid="workspace-primary-send-btn"
      className="w-full min-h-[56px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-lg flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
    >
      <span>{TERMS.sendKakao}</span>
    </button>
  );

  const isActiveSavedOnServer = Boolean(
    resolvedActiveId &&
      syncedServerIds.has(resolvedActiveId) &&
      !autosave.dirty &&
      autosave.status === "saved"
  );

  return (
    <>
      <WorkspaceShell
        workspace="dealcards"
        listTitle={TERMS.colPick}
        editorTitle={TERMS.colFill}
        previewTitle={TERMS.colPreviewSend}
        listSlot={listSlot}
        editorSlot={editorSlot}
        previewSlot={previewSlot}
        primaryActionSlot={primaryActionSlot}
        saveState={autosave.status}
        lastSavedAt={autosave.lastSavedAt}
        onRetrySave={() => {
          void handleFlushSave();
        }}
        selectedBuildingId={resolvedActiveId || ""}
        selectedLabel={activeItem?.title || "새 딜카드"}
      />
      <PreSendConfirmationSheet
        isOpen={isPreSendOpen}
        onClose={() => setIsPreSendOpen(false)}
        card4={effectiveCard4}
        dealId={resolvedActiveId || ""}
        isSaved={isActiveSavedOnServer}
        onFlushSave={handleFlushSave}
        onAutoMask={handleAutoMaskActiveCard}
        onSendToClient={() => {
          handleMarkSent();
        }}
        onCopyLink={() => {
          handleMarkSent();
          showUndoToast({
            message: "링크를 복사했어요. 카카오톡에 붙여넣어 보내세요.",
            variant: "success",
          });
        }}
      />
      <MemoImportModal
        isOpen={isMemoModalOpen}
        onClose={() => setIsMemoModalOpen(false)}
        onSelectMemo={handleSelectMemo}
      />
    </>
  );
}

export default function DealCardsWorkspacePage() {
  return (
    <UndoToastProvider>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen bg-[#F5F5F7] text-[#3A3A3C] font-semibold text-lg">
            딜카드 작업공간을 불러오는 중...
          </div>
        }
      >
        <DealCardsWorkspaceInner />
      </Suspense>
    </UndoToastProvider>
  );
}
