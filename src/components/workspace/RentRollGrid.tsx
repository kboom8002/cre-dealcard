"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { RentRollRowItem, RentRollStatus } from "@/lib/rent-roll/tsv-parser";
import {
  parseTsvRentRoll,
  formatKoreanCurrencyReadout,
  normalizeFloorName,
} from "@/lib/rent-roll/tsv-parser";
import { parseLeaseExpiryDate } from "@/lib/rent-roll/date-parser";
import { PYEONG_TO_SQM_V15 } from "@/domain/building/mobile-im/rentroll-meta";
import {
  MobileRentRollCards,
  parseAreaCellValue,
  parseManwonCellValue,
} from "./MobileRentRollCards";

export { parseAreaCellValue };

export interface BuildingRegisterFloorItem {
  flrGb?: string;
  flrGbCdNm?: string;
  flrNo?: number;
  floorName?: string;
  mainPurpose?: string;
  areaSqm?: number;
}

export interface RentRollGridProps {
  rows: RentRollRowItem[];
  onChange: (rows: RentRollRowItem[]) => void;
  floorsAbove?: number;
  floorsBelow?: number;
  buildingFloors?: BuildingRegisterFloorItem[];
  askingPriceManwon?: number;
  extraToolbarAction?: React.ReactNode;
  disableAutoScaffold?: boolean;
  className?: string;
}

export function hasExistingRentRollData(rows?: RentRollRowItem[]): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  return rows.some(
    (r) =>
      (r.depositManwon || 0) > 0 ||
      (r.monthlyRentManwon || 0) > 0 ||
      (r.maintenanceManwon || 0) > 0 ||
      Boolean(r.tenantName?.trim())
  );
}

/**
 * 층 정렬 랭크 (최고층 → 1F → B1 → B2 순, PPTX/IM 표와 동일).
 */
export function rankFloorTopDown(rawFloor: unknown): number {
  const s = String(rawFloor ?? "").trim().toUpperCase();
  if (!s) return -9999;
  if (/^(?:RF|PH|R|옥상|옥탑)/.test(s)) {
    const rm = s.match(/(\d+)/);
    return 900 + (rm ? Number(rm[1]) : 0);
  }
  const bMatch = s.match(/^(?:B|지하\s*)(\d+)/);
  if (bMatch) return -Number(bMatch[1]);
  const negMatch = s.match(/^-(\d+)/);
  if (negMatch) return -Number(negMatch[1]);
  const gMatch = s.match(/(\d+)\s*(?:F|층)?/);
  if (gMatch) return Number(gMatch[1]);
  return -500;
}

function toUnitPrefixAndBase(floorLabel: string): { prefix: string; unitNo: string } {
  const norm = normalizeFloorName(floorLabel).toUpperCase();
  const bMatch = norm.match(/^B(\d+)/);
  if (bMatch) {
    return { prefix: `B${bMatch[1]}`, unitNo: `B${bMatch[1]}01호` };
  }
  const gMatch = norm.match(/^(\d+)/);
  if (gMatch) {
    return { prefix: gMatch[1], unitNo: `${gMatch[1]}01호` };
  }
  return { prefix: "", unitNo: "101호" };
}

/**
 * 건축물대장 층별 정보 또는 지상/지하 층수 기반으로 최고층→지하층 순 초기 행을 생성합니다.
 */
export function generateFloorScaffolding(
  floorsAbove: number = 4,
  floorsBelow: number = 1,
  buildingFloors?: BuildingRegisterFloorItem[]
): RentRollRowItem[] {
  if (Array.isArray(buildingFloors) && buildingFloors.length > 0) {
    const mapped = buildingFloors
      .map((f, idx) => {
        const gb = String(f.flrGb || f.flrGbCdNm || f.floorName || "");
        const no = Number(f.flrNo ?? 0);
        const area =
          typeof f.areaSqm === "number" && Number.isFinite(f.areaSqm) && f.areaSqm > 0
            ? Math.round(f.areaSqm * 100) / 100
            : undefined;
        let floor = f.floorName ? normalizeFloorName(f.floorName) : "";
        if (!floor) {
          if (/지하|B/i.test(gb) && no > 0) floor = `B${no}`;
          else if (/옥탑|PH|RF/i.test(gb)) floor = no > 1 ? `옥탑${no}` : "옥탑";
          else if (no > 0) floor = `${no}F`;
          else floor = `${idx + 1}F`;
        }
        // 면적 없는 순수 옥탑/부속행 제외
        if (/옥탑/.test(floor) && (!area || area <= 0)) return null;
        const purpose = String(f.mainPurpose || "").trim();
        const defaultUse = purpose || (floor === "1F" ? "근린생활시설" : "업무시설");
        const { unitNo } = toUnitPrefixAndBase(floor);
        return {
          id: `scaffold-${floor.toLowerCase()}-${idx}`,
          floor,
          unit: unitNo,
          use: defaultUse,
          ...(area ? { areaSqm: area } : {}),
          depositManwon: 0,
          monthlyRentManwon: 0,
          maintenanceManwon: 0,
          leaseExpiry: "",
          status: "occupied" as RentRollStatus,
        } satisfies RentRollRowItem;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (mapped.length > 0) {
      return mapped.sort((a, b) => rankFloorTopDown(b.floor) - rankFloorTopDown(a.floor));
    }
  }

  const generated: RentRollRowItem[] = [];
  for (let f = floorsAbove; f >= 1; f--) {
    generated.push({
      id: `scaffold-${f}f`,
      floor: `${f}F`,
      unit: `${f}01호`,
      use: f === 1 ? "근린생활시설" : "업무시설",
      depositManwon: 0,
      monthlyRentManwon: 0,
      maintenanceManwon: 0,
      leaseExpiry: "",
      status: "occupied",
    });
  }
  for (let b = 1; b <= floorsBelow; b++) {
    generated.push({
      id: `scaffold-b${b}`,
      floor: `B${b}`,
      unit: `B${b}01호`,
      use: "근린생활시설",
      depositManwon: 0,
      monthlyRentManwon: 0,
      maintenanceManwon: 0,
      leaseExpiry: "",
      status: "occupied",
    });
  }
  return generated;
}

export function RentRollGrid({
  rows,
  onChange,
  floorsAbove = 5,
  floorsBelow = 1,
  buildingFloors,
  askingPriceManwon,
  extraToolbarAction,
  disableAutoScaffold = false,
  className = "",
}: RentRollGridProps) {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isCompact, setIsCompact] = useState<boolean>(false);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; colKey: string } | null>(null);
  const [cellDraft, setCellDraft] = useState<{ key: string; value: string } | null>(null);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const [aiRawText, setAiRawText] = useState<string>("");
  const [isAiParsing, setIsAiParsing] = useState<boolean>(false);
  const [pendingAiRows, setPendingAiRows] = useState<{
    rows: RentRollRowItem[];
    source: "table" | "ai";
  } | null>(null);
  const [showExclusiveArea, setShowExclusiveArea] = useState<boolean>(false);
  const prevNonVacantRef = useRef<Record<string, { use: string; tenantName?: string }>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Responsive width detection (<640px mobile cards; desktop always shows single-header Excel table)
  useEffect(() => {
    const checkWidth = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkWidth();
    window.addEventListener("resize", checkWidth);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          if (w > 0) {
            setIsCompact(w < 540);
          }
        }
      });
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", checkWidth);
      observer?.disconnect();
    };
  }, []);

  // Pre-fill scaffolding if rows empty
  useEffect(() => {
    if (disableAutoScaffold) return;
    if (!rows || rows.length === 0) {
      const scaffold = generateFloorScaffolding(floorsAbove, floorsBelow, buildingFloors);
      onChange(scaffold);
    }
  }, [disableAutoScaffold, rows, floorsAbove, floorsBelow, buildingFloors, onChange]);

  const handleUpdateRow = (index: number, patch: Partial<RentRollRowItem>) => {
    if (index < 0 || index >= rows.length) return;
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const handleStatusChange = (index: number, status: RentRollStatus) => {
    if (index < 0 || index >= rows.length) return;
    const row = rows[index];
    if (!row) return;
    const rowKey = row.id || String(index);
    const isVacant = status === "vacant";

    if (isVacant) {
      if (row.status !== "vacant") {
        prevNonVacantRef.current[rowKey] = {
          use: row.use && row.use !== "공실" ? row.use : "",
          tenantName: row.tenantName && row.tenantName !== "공실" ? row.tenantName : undefined,
        };
      }
      handleUpdateRow(index, {
        status,
        use: "공실",
        tenantName: undefined,
      });
    } else {
      const saved = prevNonVacantRef.current[rowKey];
      const restoredUse =
        row.status === "vacant"
          ? saved?.use ?? (row.use === "공실" ? "" : row.use)
          : row.use === "공실"
          ? ""
          : row.use;
      const restoredTenant =
        row.status === "vacant"
          ? saved?.tenantName ?? (row.tenantName === "공실" ? undefined : row.tenantName)
          : row.tenantName;
      handleUpdateRow(index, {
        status,
        use: restoredUse,
        tenantName: restoredTenant,
      });
    }
  };

  const handleExpiryChange = (index: number, rawExpiry: string) => {
    const parsed = parseLeaseExpiryDate(rawExpiry);
    handleUpdateRow(index, {
      leaseExpiry: rawExpiry,
      normalizedExpiry: parsed.normalized,
      isExpired: parsed.isExpired,
    });
  };

  const handleAddRow = useCallback(() => {
    let maxGround = 0;
    for (const r of rows) {
      const norm = normalizeFloorName(r.floor);
      if (!/^B/i.test(norm)) {
        const m = norm.match(/(\d+)/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > maxGround) maxGround = n;
        }
      }
    }
    const nextFloorNum = maxGround + 1;
    const nextFloorName = `${nextFloorNum}F`;

    const newRow: RentRollRowItem = {
      id: `rr-${Date.now()}-${rows.length}`,
      floor: nextFloorName,
      unit: `${nextFloorNum}01호`,
      use: "근린생활시설",
      depositManwon: 0,
      monthlyRentManwon: 0,
      maintenanceManwon: 0,
      leaseExpiry: "",
      status: "occupied",
    };
    onChange([newRow, ...rows]);
  }, [rows, onChange]);

  const handleSplitUnitAt = useCallback(
    (index: number) => {
      const source = rows[index];
      if (!source) return;
      const floorNorm = normalizeFloorName(source.floor || "1F");
      const sameFloorRows = rows.filter(
        (r) => normalizeFloorName(r.floor || "") === floorNorm
      );
      const { prefix } = toUnitPrefixAndBase(floorNorm);

      let maxSub = 0;
      for (const r of sameFloorRows) {
        const m = String(r.unit || "").match(/(\d{2,4})/);
        if (m) {
          const tail = parseInt(m[1].slice(-2), 10);
          if (Number.isFinite(tail) && tail > maxSub) maxSub = tail;
        }
      }

      const nextRows = [...rows];
      let firstUnit = source.unit?.trim() || "";
      if (!firstUnit) {
        firstUnit = `${prefix || "1"}01호`;
        nextRows[index] = { ...source, unit: firstUnit };
        maxSub = Math.max(maxSub, 1);
      } else if (maxSub === 0) {
        maxSub = sameFloorRows.length;
      }
      const nextSubStr = String(maxSub + 1).padStart(2, "0");
      const nextUnit = `${prefix || "1"}${nextSubStr}호`;

      const inserted: RentRollRowItem = {
        id: `rr-${Date.now()}-${rows.length}-${nextSubStr}`,
        floor: source.floor || floorNorm,
        unit: nextUnit,
        use: source.use && source.use !== "공실" ? source.use : "근린생활시설",
        depositManwon: 0,
        monthlyRentManwon: 0,
        maintenanceManwon: 0,
        leaseExpiry: "",
        status: "occupied",
      };
      nextRows.splice(index + 1, 0, inserted);
      onChange(nextRows);
      setActiveCell({ rowIdx: index + 1, colKey: "tenantName" });
    },
    [rows, onChange]
  );

  const handleDeleteRow = (index: number) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, idx) => idx !== index));
  };

  // TSV Clipboard Paste Handler
  const applyTsvText = useCallback(
    (clipboardData: string): boolean => {
      if (!clipboardData || (!clipboardData.includes("\t") && !clipboardData.includes("\n"))) {
        return false;
      }
      const result = parseTsvRentRoll(clipboardData, rows.length + 1);
      if (result.rows.length > 0) {
        const sortedRows = [...result.rows].sort(
          (a, b) => rankFloorTopDown(b.floor) - rankFloorTopDown(a.floor)
        );
        onChange(sortedRows);
        setPasteNotice(
          result.hasUnitMistakes
            ? "⚠️ 엑셀 데이터 중 원 단위(예: 50,000,000)가 감지되어 만 원(5,000만 원)으로 자동 보정되었습니다."
            : `✓ ${sortedRows.length}개 행이 최고층→지하순으로 반영되었습니다.`
        );
        setTimeout(() => setPasteNotice(null), 8000);
        return true;
      }
      return false;
    },
    [onChange, rows.length]
  );

  const handlePaste = (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData.getData("text");
    if (!clipboardData || (!clipboardData.includes("\t") && !clipboardData.includes("\n"))) {
      return;
    }
    e.preventDefault();
    applyTsvText(clipboardData);
  };

  const handleClickPasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
        const text = await navigator.clipboard.readText();
        if (applyTsvText(text)) return;
      }
    } catch {
      // Fallback if clipboard read permission denied
    }
    setPasteNotice("💡 아래 표의 아무 칸이나 클릭한 뒤 복사한 임대 표를 붙여넣어 주세요.");
    setTimeout(() => setPasteNotice(null), 6000);
  };

  const isStructuredTableInput = useMemo(() => {
    const trimmed = aiRawText.trim();
    if (trimmed.length < 4) return false;
    if (trimmed.includes("\t")) return true;
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.some((l) => (l.match(/\|/g) || []).length >= 2);
  }, [aiRawText]);

  const detectedTablePreview = useMemo(() => {
    if (!isStructuredTableInput) return null;
    const parsed = parseTsvRentRoll(aiRawText, 1);
    return parsed.rows.length > 0 ? parsed : null;
  }, [aiRawText, isStructuredTableInput]);

  const applyParsedAiRows = (mappedRows: RentRollRowItem[], source: "table" | "ai") => {
    const sorted = [...mappedRows].sort(
      (a, b) => rankFloorTopDown(b.floor) - rankFloorTopDown(a.floor)
    );
    onChange(sorted);
    setPendingAiRows(null);
    setIsAiDrawerOpen(false);
    setAiRawText("");
    setPasteNotice(
      source === "table"
        ? `✓ 붙여넣은 표에서 ${sorted.length}개 호실을 자동 반영했습니다.`
        : `✓ AI가 텍스트에서 ${sorted.length}개 호실 임대 현황을 자동 구성했습니다.`
    );
    setTimeout(() => setPasteNotice(null), 8000);
  };

  const handleParseAiText = async () => {
    const trimmed = aiRawText.trim();
    if (trimmed.length < 5) {
      setPasteNotice("임대차 내역 텍스트를 5자 이상 입력해 주세요.");
      return;
    }

    if (detectedTablePreview && detectedTablePreview.rows.length > 0) {
      if (hasExistingRentRollData(rows)) {
        setPendingAiRows({ rows: detectedTablePreview.rows, source: "table" });
      } else {
        applyParsedAiRows(detectedTablePreview.rows, "table");
      }
      return;
    }

    setIsAiParsing(true);
    setPasteNotice(null);
    try {
      const res = await fetch("/api/broker/rent-roll/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.floorLeases) && data.floorLeases.length > 0) {
        const mapped: RentRollRowItem[] = data.floorLeases.map(
          (fl: Record<string, unknown>, idx: number) => {
            const floorLabel = normalizeFloorName(String(fl.floor || `${idx + 1}F`));
            const isVac =
              Boolean(fl.is_vacant) || fl.lease_state === "공실" || fl.tenant_type === "공실";
            const isOwner = !isVac && (fl.lease_state === "자가사용" || fl.lease_state === "자가");
            const status: RentRollStatus = isVac ? "vacant" : isOwner ? "owner" : "occupied";
            const rawExpiry = String(fl.lease_end || fl.lease_expiry || "").trim();
            const parsedExp = parseLeaseExpiryDate(rawExpiry);
            const exclSqm = Number(fl.exclusive_area_sqm ?? fl.exclusiveAreaSqm);
            const noteStr = fl.note != null ? String(fl.note).trim() : "";
            const contractGroupStr =
              fl.contract_group != null ? String(fl.contract_group).trim() : "";
            const legalBasisStr = fl.legal_basis != null ? String(fl.legal_basis).trim() : "";
            const firstContractStr =
              fl.first_contract_date != null ? String(fl.first_contract_date).trim() : "";
            const isProxyArea = Boolean(fl.area_sqm_is_proxy ?? fl.areaSqmIsProxy);
            return {
              id: `rr-ai-${Date.now()}-${idx}`,
              floor: floorLabel,
              unit: String(fl.unit_label || fl.unit || "").trim(),
              tenantName: isVac ? undefined : fl.tenant_name ? String(fl.tenant_name) : undefined,
              use: isVac ? "공실" : String(fl.tenant_type || fl.use || "근린생활시설"),
              ...(Number(fl.area_sqm) > 0 ? { areaSqm: Number(fl.area_sqm) } : {}),
              ...(Number.isFinite(exclSqm) && exclSqm > 0 ? { exclusiveAreaSqm: exclSqm } : {}),
              ...(isProxyArea ? { areaSqmIsProxy: true } : {}),
              ...(contractGroupStr ? { contractGroup: contractGroupStr } : {}),
              ...(legalBasisStr ? { legalBasis: legalBasisStr } : {}),
              ...(firstContractStr ? { firstContractDate: firstContractStr } : {}),
              depositManwon: Number(fl.deposit_manwon) || 0,
              monthlyRentManwon: isVac ? 0 : Number(fl.rent_manwon) || 0,
              maintenanceManwon: isVac ? 0 : Number(fl.mgmt_fee_manwon) || 0,
              leaseExpiry: rawExpiry,
              normalizedExpiry: parsedExp.normalized,
              isExpired: parsedExp.isExpired,
              status,
              ...(noteStr ? { note: noteStr } : {}),
            };
          }
        );
        if (hasExistingRentRollData(rows)) {
          setPendingAiRows({ rows: mapped, source: "ai" });
        } else {
          applyParsedAiRows(mapped, "ai");
        }
      } else {
        setPasteNotice(
          data?.error || "텍스트에서 임대차 내역을 인식하지 못했습니다. 층/금액을 확인해 주세요."
        );
      }
    } catch {
      setPasteNotice("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setIsAiParsing(false);
    }
  };

  // Global paste listener while RentRollGrid is visible on screen
  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      if (!containerRef.current || containerRef.current.offsetParent === null) return;
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") &&
        !containerRef.current.contains(activeEl)
      ) {
        return;
      }
      if (activeEl?.getAttribute("data-testid") === "rent-roll-ai-textarea") {
        return;
      }
      const text = e.clipboardData?.getData("text") || "";
      if (text && (text.includes("\t") || text.includes("\n"))) {
        e.preventDefault();
        applyTsvText(text);
      }
    };
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, [applyTsvText]);

  const focusGridCell = useCallback((targetRowIdx: number, colKey: string): boolean => {
    if (!gridRef.current) return false;
    const direct = gridRef.current.querySelector<HTMLInputElement>(
      `input[data-rr-row="${targetRowIdx}"][data-rr-col="${colKey}"]`
    );
    if (direct && !direct.disabled) {
      direct.focus();
      direct.select?.();
      return true;
    }
    const fallback = gridRef.current.querySelector<HTMLInputElement>(
      `input[data-rr-row="${targetRowIdx}"]:not([disabled])`
    );
    if (fallback) {
      fallback.focus();
      fallback.select?.();
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!activeCell) return;
    focusGridCell(activeCell.rowIdx, activeCell.colKey);
  }, [activeCell, rows.length, focusGridCell]);

  // Keyboard navigation across cells
  const handleKeyDown = (e: React.KeyboardEvent, rowIdx: number, colKey: string) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (rowIdx >= rows.length - 1) {
        handleAddRow();
        setActiveCell({ rowIdx: 0, colKey });
      } else {
        setActiveCell({ rowIdx: rowIdx + 1, colKey });
        focusGridCell(rowIdx + 1, colKey);
      }
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      if (rowIdx > 0) {
        setActiveCell({ rowIdx: rowIdx - 1, colKey });
        focusGridCell(rowIdx - 1, colKey);
      }
    } else if (e.ctrlKey && (e.key === "d" || e.key === "D")) {
      if (rowIdx > 0) {
        e.preventDefault();
        const aboveRow = rows[rowIdx - 1];
        const aboveVal = aboveRow ? aboveRow[colKey as keyof RentRollRowItem] : undefined;
        handleUpdateRow(rowIdx, { [colKey]: aboveVal });
      }
    }
  };

  // Summary calculations
  const totals = useMemo(() => {
    const totalDeposit =
      Math.round(
        rows.reduce(
          (s, r) => s + (r.status !== "vacant" && r.status !== "owner" ? r.depositManwon || 0 : 0),
          0
        ) * 10
      ) / 10;
    const totalRent =
      Math.round(
        rows.reduce(
          (s, r) =>
            s + (r.status !== "vacant" && r.status !== "owner" ? r.monthlyRentManwon || 0 : 0),
          0
        ) * 10
      ) / 10;
    const totalMaintenance =
      Math.round(
        rows.reduce(
          (s, r) =>
            s + (r.status !== "vacant" && r.status !== "owner" ? r.maintenanceManwon || 0 : 0),
          0
        ) * 10
      ) / 10;
    const annualRent = Math.round(totalRent * 12 * 10) / 10;

    let grossYieldPct: number | null = null;
    let noiCapRatePct: number | null = null;
    if (askingPriceManwon && askingPriceManwon > 0) {
      const netInvestment =
        totalDeposit > 0 && askingPriceManwon > totalDeposit
          ? askingPriceManwon - totalDeposit
          : askingPriceManwon;
      if (netInvestment > 0) {
        grossYieldPct = (annualRent / netInvestment) * 100;
      }
      const annualNoi = annualRent * 0.95; // 표준 운영비(OPEX) 5% 차감 기준
      noiCapRatePct = (annualNoi / askingPriceManwon) * 100;
    }

    return {
      totalDeposit,
      totalRent,
      totalMaintenance,
      annualRent,
      capRate: grossYieldPct,
      grossYieldPct,
      noiCapRatePct,
    };
  }, [rows, askingPriceManwon]);

  const activeRow =
    activeCell && rows[activeCell.rowIdx] ? rows[activeCell.rowIdx] : null;
  const showExclusiveCol =
    showExclusiveArea || rows.some((r) => (r.exclusiveAreaSqm ?? 0) > 0);

  if (isMobile) {
    return (
      <div onPaste={handlePaste}>
        {pasteNotice && (
          <div className="p-3 mb-3 bg-[#FEF3C7] text-[#92400E] text-sm font-semibold rounded-xl border border-[#FDE68A]">
            {pasteNotice}
          </div>
        )}
        <MobileRentRollCards
          rows={rows}
          onChange={onChange}
          onAddFloor={handleAddRow}
          className={className}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`space-y-2.5 ${className}`}
      onPaste={handlePaste}
      data-testid="rent-roll-grid"
      data-compact={isCompact ? "true" : "false"}
    >
      {/* Notice & TSV paste banner */}
      {pasteNotice && (
        <div
          role="alert"
          className="p-3 bg-[#FEF3C7] text-[#92400E] text-sm font-medium rounded-xl border border-[#FDE68A] flex items-center justify-between"
        >
          <span>{pasteNotice}</span>
          <button
            type="button"
            onClick={() => setPasteNotice(null)}
            className="min-h-[44px] px-3 text-[#92400E] font-bold text-sm hover:underline cursor-pointer ml-2 shrink-0"
          >
            닫기
          </button>
        </div>
      )}

      {/* Unified Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-3.5 py-2.5 text-[#475569] text-sm">
        <span className="font-bold text-[#334155]">
          엑셀형 입력 (최고층 → 지하층 · 1줄 1호실)
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="rent-roll-paste-btn"
            onClick={handleClickPasteFromClipboard}
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-extrabold cursor-pointer shadow-2xs transition"
          >
            📋 표 붙여넣기
          </button>
          <button
            type="button"
            data-testid="rent-roll-ai-parse-btn"
            aria-expanded={isAiDrawerOpen}
            onClick={() => setIsAiDrawerOpen((p) => !p)}
            className={`min-h-[44px] px-3 py-1.5 rounded-xl border text-sm font-extrabold cursor-pointer transition ${
              isAiDrawerOpen
                ? "bg-purple-700 text-white border-purple-700"
                : "bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-200"
            }`}
          >
            ✨ 텍스트·메모 AI 채우기
          </button>
          {extraToolbarAction}
          <button
            type="button"
            data-testid="rent-roll-exclusive-toggle"
            aria-pressed={showExclusiveCol}
            onClick={() => setShowExclusiveArea((prev) => !prev)}
            className={`min-h-[44px] px-3 py-1.5 rounded-xl border text-sm font-bold cursor-pointer shrink-0 transition ${
              showExclusiveCol
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white hover:bg-slate-50 border-[#CBD5E1] text-[#334155]"
            }`}
          >
            전용면적(㎡)
          </button>
          <button
            type="button"
            data-testid="rent-roll-add-floor-btn"
            onClick={handleAddRow}
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white hover:bg-blue-50 border border-[#CBD5E1] text-[#1D4ED8] text-sm font-extrabold cursor-pointer shrink-0 transition"
          >
            + 층 추가
          </button>
        </div>
      </div>

      {/* Inline AI Text Parser Drawer */}
      {isAiDrawerOpen && (
        <div
          data-testid="rent-roll-ai-drawer"
          className="rounded-xl border-2 border-purple-200 bg-purple-50/60 p-3.5 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-extrabold text-purple-950">
              매도인 문자·카톡·메모 또는 표 데이터를 그대로 붙여넣으면 층별 임대차 현황표로 자동 정리합니다
            </span>
            <span className="text-sm font-semibold text-purple-700">
              예: &quot;1층 카페 5000/400, 2층 사무실 3000/200, 3층 공실&quot;
            </span>
          </div>
          <textarea
            rows={3}
            data-testid="rent-roll-ai-textarea"
            value={aiRawText}
            onChange={(e) => {
              setAiRawText(e.target.value);
              setPendingAiRows(null);
            }}
            placeholder="예: B1 주점 5,000/450 관리비 30, 1F 스타벅스 보증금 1억 월세 800, 2F 의원 5000/350, 3F 공실"
            className="w-full rounded-xl border border-purple-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
          />
          {detectedTablePreview && (
            <div
              data-testid="rent-roll-ai-table-detected"
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900"
            >
              ✓ 표 형식 자동 인식: {detectedTablePreview.rows.length}개 호실 즉시 반영 가능 (AI 호출 없이 바로 적용 · {detectedTablePreview.summaryMessage})
            </div>
          )}
          {pendingAiRows && (
            <div
              data-testid="rent-roll-ai-overwrite-confirm"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2 text-sm text-amber-950"
            >
              <p className="font-bold">
                ⚠️ 기존에 입력된 임대차 내역({rows.length}행)을 새로 인식한{" "}
                {pendingAiRows.rows.length}개 호실로 덮어쓸까요?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingAiRows(null)}
                  className="min-h-[44px] px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-bold cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  data-testid="rent-roll-ai-confirm-overwrite-btn"
                  onClick={() =>
                    applyParsedAiRows(pendingAiRows.rows, pendingAiRows.source)
                  }
                  className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-sm font-extrabold cursor-pointer"
                >
                  기존 표 덮어쓰기 ({pendingAiRows.rows.length}행)
                </button>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPendingAiRows(null);
                setIsAiDrawerOpen(false);
              }}
              className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-bold cursor-pointer"
            >
              닫기
            </button>
            <button
              type="button"
              data-testid="rent-roll-ai-submit-btn"
              disabled={isAiParsing}
              onClick={handleParseAiText}
              className="min-h-[44px] px-4 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-sm font-extrabold cursor-pointer"
            >
              {detectedTablePreview
                ? `표 ${detectedTablePreview.rows.length}행 바로 채우기`
                : isAiParsing
                ? "분석 중…"
                : "AI로 표 채우기"}
            </button>
          </div>
        </div>
      )}

      {/* Spreadsheet Table (Single Header Row, Compact Excel Ergonomics) */}
      <div
        ref={gridRef}
        role="grid"
        aria-label="층별 임대차 현황 입력표"
        className="overflow-hidden rounded-2xl border-2 border-[#CBD5E1] bg-white shadow-sm"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#0F172A] text-white text-sm font-extrabold">
                <th className="py-2.5 px-1.5 text-center min-w-[64px] border-r border-slate-700">층</th>
                <th className="py-2.5 px-1.5 text-center min-w-[88px] border-r border-slate-700">호실</th>
                <th className="py-2.5 px-2 text-left min-w-[130px] border-r border-slate-700">임차인</th>
                <th className="py-2.5 px-2 text-left min-w-[120px] border-r border-slate-700">업종/용도</th>
                <th className="py-2.5 px-1.5 text-right min-w-[84px] border-r border-slate-700">면적(㎡)</th>
                {showExclusiveCol && (
                  <th className="py-2.5 px-1.5 text-right min-w-[84px] border-r border-slate-700">전용(㎡)</th>
                )}
                <th className="py-2.5 px-1.5 text-right min-w-[104px] border-r border-slate-700">보증금(만)</th>
                <th className="py-2.5 px-1.5 text-right min-w-[88px] border-r border-slate-700">월세(만)</th>
                <th className="py-2.5 px-1.5 text-right min-w-[82px] border-r border-slate-700">관리비(만)</th>
                <th className="py-2.5 px-1.5 text-center min-w-[108px] border-r border-slate-700">만기일</th>
                <th className="py-2.5 px-1.5 text-center min-w-[144px] border-r border-slate-700">상태</th>
                <th className="py-2.5 px-1.5 text-center min-w-[108px]">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={showExclusiveCol ? 12 : 11}
                    className="py-6 px-4 text-center text-sm font-semibold text-slate-600"
                  >
                    입력된 임대차 내역이 없습니다. 상단 버튼으로 붙여넣거나 [+ 층 추가]를 눌러 입력하세요.
                  </td>
                </tr>
              )}
              {rows.map((row, idx) => {
                const isVacant = row.status === "vacant";
                const isOwner = row.status === "owner";
                const isSuspicious = Boolean(row.unitMistakeWarning);
                const rowKey = row.id || String(idx);

                return (
                  <tr
                    key={rowKey}
                    role="row"
                    onFocusCapture={() =>
                      setActiveCell((prev) =>
                        prev?.rowIdx === idx ? prev : { rowIdx: idx, colKey: "floor" }
                      )
                    }
                    className={`transition-colors ${
                      isVacant
                        ? "bg-amber-50/40"
                        : isOwner
                        ? "bg-slate-50/80"
                        : isSuspicious
                        ? "bg-[#FEFCE8]"
                        : idx % 2 === 0
                        ? "bg-white hover:bg-blue-50/30"
                        : "bg-[#FAFCFF] hover:bg-blue-50/30"
                    }`}
                  >
                    {/* Floor */}
                    <td className="p-1 min-w-[64px] border-r border-[#E2E8F0]">
                      <input
                        type="text"
                        aria-label={`${idx + 1}행 층`}
                        data-rr-cell={`${idx}:floor`}
                        data-rr-row={idx}
                        data-rr-col="floor"
                        value={row.floor}
                        onChange={(e) => handleUpdateRow(idx, { floor: e.target.value })}
                        onBlur={(e) =>
                          handleUpdateRow(idx, { floor: normalizeFloorName(e.target.value) })
                        }
                        onKeyDown={(e) => handleKeyDown(e, idx, "floor")}
                        className="w-full h-9 rounded-md border border-transparent hover:border-slate-300 focus:border-[#1D4ED8] focus:bg-white bg-slate-50/70 px-1 text-center font-extrabold text-sm text-[#0F172A] outline-none"
                      />
                    </td>

                    {/* Unit */}
                    <td className="p-1 min-w-[88px] border-r border-[#E2E8F0]">
                      <input
                        type="text"
                        aria-label={`${idx + 1}행 호실`}
                        data-rr-cell={`${idx}:unit`}
                        data-rr-row={idx}
                        data-rr-col="unit"
                        value={row.unit}
                        placeholder="호실"
                        onChange={(e) => handleUpdateRow(idx, { unit: e.target.value })}
                        onKeyDown={(e) => handleKeyDown(e, idx, "unit")}
                        className="w-full h-9 rounded-md border border-transparent hover:border-slate-300 focus:border-[#1D4ED8] focus:bg-white bg-transparent px-1.5 text-center text-sm font-semibold text-[#334155] outline-none"
                      />
                    </td>

                    {/* Tenant Name */}
                    <td className="p-1 min-w-[130px] border-r border-[#E2E8F0]">
                      <input
                        type="text"
                        aria-label={`${idx + 1}행 임차인`}
                        data-rr-cell={`${idx}:tenantName`}
                        data-rr-row={idx}
                        data-rr-col="tenantName"
                        disabled={isVacant}
                        value={isVacant ? "" : row.tenantName ?? ""}
                        placeholder={isVacant ? "-" : isOwner ? "자가사옥" : "상호명"}
                        onChange={(e) => handleUpdateRow(idx, { tenantName: e.target.value })}
                        onKeyDown={(e) => handleKeyDown(e, idx, "tenantName")}
                        className={`w-full h-9 rounded-md border border-transparent px-1.5 text-sm font-semibold outline-none ${
                          isVacant
                            ? "bg-transparent text-slate-400"
                            : "hover:border-slate-300 focus:border-[#1D4ED8] focus:bg-white bg-transparent text-[#0F172A]"
                        }`}
                      />
                    </td>

                    {/* Use / Sector */}
                    <td className="p-1 min-w-[120px] border-r border-[#E2E8F0]">
                      <input
                        type="text"
                        aria-label={`${idx + 1}행 용도 및 업종`}
                        data-rr-cell={`${idx}:use`}
                        data-rr-row={idx}
                        data-rr-col="use"
                        disabled={isVacant}
                        value={row.use}
                        placeholder={isVacant ? "공실" : "카페·사무실"}
                        onChange={(e) => handleUpdateRow(idx, { use: e.target.value })}
                        onKeyDown={(e) => handleKeyDown(e, idx, "use")}
                        className={`w-full h-9 rounded-md border border-transparent px-1.5 text-sm font-semibold outline-none ${
                          isVacant
                            ? "bg-transparent text-amber-800 italic"
                            : "hover:border-slate-300 focus:border-[#1D4ED8] focus:bg-white bg-transparent text-[#334155]"
                        }`}
                      />
                    </td>

                    {/* Area (㎡) */}
                    <td className="p-1 min-w-[84px] border-r border-[#E2E8F0]">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`${idx + 1}행 면적`}
                        data-rr-cell={`${idx}:areaSqm`}
                        data-rr-row={idx}
                        data-rr-col="areaSqm"
                        title="숫자(㎡) 또는 '33평' 입력 시 자동 환산"
                        value={
                          cellDraft?.key === `${rowKey}:areaSqm`
                            ? cellDraft.value
                            : row.areaSqm
                            ? String(row.areaSqm)
                            : ""
                        }
                        placeholder="㎡ / 평"
                        onFocus={() =>
                          setCellDraft({
                            key: `${rowKey}:areaSqm`,
                            value: row.areaSqm ? String(row.areaSqm) : "",
                          })
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          setCellDraft({ key: `${rowKey}:areaSqm`, value: raw });
                          handleUpdateRow(idx, {
                            areaSqm: parseAreaCellValue(raw),
                            areaPyeong: undefined,
                            areaSqmIsProxy: undefined,
                          });
                        }}
                        onBlur={(e) => {
                          setCellDraft(null);
                          handleUpdateRow(idx, {
                            areaSqm: parseAreaCellValue(e.target.value),
                            areaPyeong: undefined,
                            areaSqmIsProxy: undefined,
                          });
                        }}
                        onKeyDown={(e) => handleKeyDown(e, idx, "areaSqm")}
                        className="w-full h-9 rounded-md border border-transparent hover:border-slate-300 focus:border-[#1D4ED8] focus:bg-white bg-transparent px-1 text-right text-sm font-semibold tabular-nums text-[#334155] outline-none"
                      />
                    </td>

                    {/* Exclusive Area (㎡, optional) */}
                    {showExclusiveCol && (
                      <td className="p-1 min-w-[84px] border-r border-[#E2E8F0]">
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`${idx + 1}행 전용면적`}
                          data-rr-cell={`${idx}:exclusiveAreaSqm`}
                          data-rr-row={idx}
                          data-rr-col="exclusiveAreaSqm"
                          title="전용면적(㎡) 또는 '25평' 입력 시 자동 환산"
                          value={
                            cellDraft?.key === `${rowKey}:exclusiveAreaSqm`
                              ? cellDraft.value
                              : row.exclusiveAreaSqm
                              ? String(row.exclusiveAreaSqm)
                              : ""
                          }
                          placeholder="-"
                          onFocus={() =>
                            setCellDraft({
                              key: `${rowKey}:exclusiveAreaSqm`,
                              value: row.exclusiveAreaSqm ? String(row.exclusiveAreaSqm) : "",
                            })
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            setCellDraft({ key: `${rowKey}:exclusiveAreaSqm`, value: raw });
                            handleUpdateRow(idx, {
                              exclusiveAreaSqm: parseAreaCellValue(raw),
                              areaPyeong: undefined,
                            });
                          }}
                          onBlur={(e) => {
                            setCellDraft(null);
                            handleUpdateRow(idx, {
                              exclusiveAreaSqm: parseAreaCellValue(e.target.value),
                              areaPyeong: undefined,
                            });
                          }}
                          onKeyDown={(e) => handleKeyDown(e, idx, "exclusiveAreaSqm")}
                          className="w-full h-9 rounded-md border border-transparent hover:border-slate-300 focus:border-[#1D4ED8] focus:bg-white bg-transparent px-1 text-right text-sm font-semibold tabular-nums text-[#334155] outline-none"
                        />
                      </td>
                    )}

                    {/* Deposit (만) */}
                    <td className="p-1 min-w-[104px] border-r border-[#E2E8F0]">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`${idx + 1}행 보증금`}
                        data-rr-cell={`${idx}:depositManwon`}
                        data-rr-row={idx}
                        data-rr-col="depositManwon"
                        disabled={isVacant || isOwner}
                        value={
                          isVacant || isOwner
                            ? ""
                            : cellDraft?.key === `${rowKey}:depositManwon`
                            ? cellDraft.value
                            : row.depositManwon || ""
                        }
                        placeholder={isVacant || isOwner ? "-" : "0"}
                        onFocus={() => {
                          setActiveCell({ rowIdx: idx, colKey: "depositManwon" });
                          setCellDraft({
                            key: `${rowKey}:depositManwon`,
                            value: row.depositManwon ? String(row.depositManwon) : "",
                          });
                        }}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setCellDraft({ key: `${rowKey}:depositManwon`, value: raw });
                          handleUpdateRow(idx, { depositManwon: parseManwonCellValue(raw) });
                        }}
                        onBlur={(e) => {
                          setCellDraft(null);
                          handleUpdateRow(idx, {
                            depositManwon: parseManwonCellValue(e.target.value),
                          });
                        }}
                        onKeyDown={(e) => handleKeyDown(e, idx, "depositManwon")}
                        className={`w-full h-9 rounded-md border border-transparent px-1.5 text-right font-extrabold text-sm tabular-nums outline-none ${
                          isVacant || isOwner
                            ? "bg-transparent text-[#94A3B8] cursor-not-allowed"
                            : "hover:border-slate-300 focus:border-[#1D4ED8] focus:bg-white bg-transparent text-[#0F172A]"
                        }`}
                      />
                    </td>

                    {/* Monthly Rent (만) */}
                    <td className="p-1 min-w-[88px] border-r border-[#E2E8F0]">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`${idx + 1}행 월세`}
                        data-rr-cell={`${idx}:monthlyRentManwon`}
                        data-rr-row={idx}
                        data-rr-col="monthlyRentManwon"
                        disabled={isVacant}
                        value={
                          isVacant
                            ? ""
                            : cellDraft?.key === `${rowKey}:monthlyRentManwon`
                            ? cellDraft.value
                            : row.monthlyRentManwon || ""
                        }
                        placeholder="0"
                        onFocus={() => {
                          setActiveCell({ rowIdx: idx, colKey: "monthlyRentManwon" });
                          setCellDraft({
                            key: `${rowKey}:monthlyRentManwon`,
                            value: row.monthlyRentManwon ? String(row.monthlyRentManwon) : "",
                          });
                        }}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setCellDraft({ key: `${rowKey}:monthlyRentManwon`, value: raw });
                          handleUpdateRow(idx, {
                            monthlyRentManwon: parseManwonCellValue(raw),
                          });
                        }}
                        onBlur={(e) => {
                          setCellDraft(null);
                          handleUpdateRow(idx, {
                            monthlyRentManwon: parseManwonCellValue(e.target.value),
                          });
                        }}
                        onKeyDown={(e) => handleKeyDown(e, idx, "monthlyRentManwon")}
                        className={`w-full h-9 rounded-md border border-transparent px-1.5 text-right font-extrabold text-sm tabular-nums outline-none ${
                          isVacant
                            ? "bg-transparent text-[#94A3B8]"
                            : "hover:border-slate-300 focus:border-[#1D4ED8] focus:bg-white bg-transparent text-[#1D4ED8]"
                        }`}
                      />
                    </td>

                    {/* Maintenance Fee (만) */}
                    <td className="p-1 min-w-[82px] border-r border-[#E2E8F0]">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`${idx + 1}행 관리비`}
                        data-rr-cell={`${idx}:maintenanceManwon`}
                        data-rr-row={idx}
                        data-rr-col="maintenanceManwon"
                        disabled={isVacant}
                        value={
                          isVacant
                            ? ""
                            : cellDraft?.key === `${rowKey}:maintenanceManwon`
                            ? cellDraft.value
                            : row.maintenanceManwon || ""
                        }
                        placeholder="0"
                        onFocus={() => {
                          setActiveCell({ rowIdx: idx, colKey: "maintenanceManwon" });
                          setCellDraft({
                            key: `${rowKey}:maintenanceManwon`,
                            value: row.maintenanceManwon ? String(row.maintenanceManwon) : "",
                          });
                        }}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setCellDraft({ key: `${rowKey}:maintenanceManwon`, value: raw });
                          handleUpdateRow(idx, {
                            maintenanceManwon: parseManwonCellValue(raw),
                          });
                        }}
                        onBlur={(e) => {
                          setCellDraft(null);
                          handleUpdateRow(idx, {
                            maintenanceManwon: parseManwonCellValue(e.target.value),
                          });
                        }}
                        onKeyDown={(e) => handleKeyDown(e, idx, "maintenanceManwon")}
                        className={`w-full h-9 rounded-md border border-transparent px-1 text-right font-semibold text-sm tabular-nums outline-none ${
                          isVacant
                            ? "bg-transparent text-[#94A3B8]"
                            : "hover:border-slate-300 focus:border-[#1D4ED8] focus:bg-white bg-transparent text-[#334155]"
                        }`}
                      />
                    </td>

                    {/* Expiry */}
                    <td className="p-1 min-w-[108px] border-r border-[#E2E8F0]">
                      <input
                        type="text"
                        aria-label={`${idx + 1}행 계약만기`}
                        data-rr-cell={`${idx}:leaseExpiry`}
                        data-rr-row={idx}
                        data-rr-col="leaseExpiry"
                        disabled={isVacant}
                        value={row.leaseExpiry}
                        placeholder={isVacant ? "-" : "27.05"}
                        onChange={(e) => handleExpiryChange(idx, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, idx, "leaseExpiry")}
                        className={`w-full h-9 rounded-md border border-transparent hover:border-slate-300 focus:border-[#1D4ED8] focus:bg-white bg-transparent px-1 text-center font-semibold text-sm tabular-nums outline-none ${
                          row.isExpired ? "text-[#991B1B]" : "text-[#0F172A]"
                        }`}
                      />
                    </td>

                    {/* Status Pills */}
                    <td className="p-1 min-w-[144px] border-r border-[#E2E8F0]">
                      <div className="inline-flex rounded-lg border border-[#CBD5E1] p-0.5 bg-[#FAF9F5]">
                        {(["occupied", "vacant", "owner"] as const).map((st) => {
                          const isCur = row.status === st;
                          const label =
                            st === "occupied" ? "임대" : st === "vacant" ? "공실" : "자가";
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleStatusChange(idx, st)}
                              className={`min-h-[44px] px-2 py-1 text-sm font-extrabold rounded-md transition-colors cursor-pointer ${
                                isCur
                                  ? st === "vacant"
                                    ? "bg-amber-600 text-white"
                                    : st === "owner"
                                    ? "bg-slate-700 text-white"
                                    : "bg-[#0F172A] text-white"
                                  : "text-[#475569] hover:text-[#0F172A]"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    {/* Split Unit + Delete */}
                    <td className="p-1 min-w-[108px] text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          data-testid={`rentroll-split-unit-${idx}`}
                          onClick={() => handleSplitUnitAt(idx)}
                          title={`${row.floor}에 호실 추가`}
                          className="min-h-[44px] px-2.5 py-1 rounded-md text-sm font-extrabold text-[#1D4ED8] hover:bg-blue-100 cursor-pointer"
                        >
                          +호실
                        </button>
                        <button
                          type="button"
                          disabled={rows.length <= 1}
                          onClick={() => handleDeleteRow(idx)}
                          className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-sm font-bold p-1 cursor-pointer rounded-md ${
                            rows.length <= 1
                              ? "text-[#CBD5E1] cursor-not-allowed"
                              : "text-[#991B1B] hover:bg-[#FEE2E2]"
                          }`}
                          title="행 삭제"
                          aria-label={`${row.floor || idx + 1}층 삭제`}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Active Row Currency & Area Conversion Readout + Summary Footer */}
        <div className="bg-[#F8FAFC] border-t-2 border-[#CBD5E1] p-3.5 space-y-2">
          {activeRow &&
            (activeRow.depositManwon > 0 ||
              activeRow.monthlyRentManwon > 0 ||
              (activeRow.areaSqm ?? 0) > 0 ||
              (activeRow.exclusiveAreaSqm ?? 0) > 0) && (
              <div
                data-testid="rent-roll-active-row-readout"
                className="text-sm font-bold text-[#1D4ED8] bg-blue-50/80 border border-blue-200/80 rounded-lg px-2.5 py-1 flex flex-wrap items-center gap-x-3 gap-y-0.5"
              >
                <span>선택 행 ({activeRow.floor} {activeRow.unit}):</span>
                {activeRow.areaSqm && activeRow.areaSqm > 0 && (
                  <span>
                    임대 {activeRow.areaSqm.toFixed(1)}㎡ (
                    {(activeRow.areaSqm / PYEONG_TO_SQM_V15).toFixed(1)}평)
                    {activeRow.areaSqmIsProxy ? " · 전용기준" : ""}
                  </span>
                )}
                {activeRow.exclusiveAreaSqm && activeRow.exclusiveAreaSqm > 0 && (
                  <span>
                    전용 {activeRow.exclusiveAreaSqm.toFixed(1)}㎡ (
                    {(activeRow.exclusiveAreaSqm / PYEONG_TO_SQM_V15).toFixed(1)}평)
                  </span>
                )}
                <span>
                  보증금{" "}
                  {formatKoreanCurrencyReadout(activeRow.depositManwon).replace(/^=\s*/, "") ||
                    "0원"}
                </span>
                <span>
                  월세{" "}
                  {formatKoreanCurrencyReadout(activeRow.monthlyRentManwon).replace(/^=\s*/, "") ||
                    "0원"}
                </span>
                {activeRow.maintenanceManwon > 0 && (
                  <span>
                    관리비{" "}
                    {formatKoreanCurrencyReadout(activeRow.maintenanceManwon).replace(/^=\s*/, "")}
                  </span>
                )}
              </div>
            )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm sm:text-base font-extrabold text-[#0F172A]">
                합계 ({rows.length}개 호실)
              </span>
              {totals.grossYieldPct !== null && (
                <span
                  title="임대수익률(Gross Yield, 실투자금 기준) = 연간 임대료 ÷ (매매가 − 보증금), 운영비 차감 전"
                  className="text-sm sm:text-sm font-bold text-[#065F46] bg-[#D1FAE5] px-2.5 py-0.5 rounded-full"
                >
                  임대수익률(실투자금 기준) {totals.grossYieldPct.toFixed(2)}%
                </span>
              )}
              {totals.noiCapRatePct !== null && (
                <span
                  title="NOI Cap Rate(자본환원율, 매매가 기준) = 연간 순영업소득(표준 운영비 5% 차감) ÷ 매매가"
                  className="text-sm sm:text-sm font-bold text-[#1E40AF] bg-[#DBEAFE] px-2.5 py-0.5 rounded-full"
                >
                  NOI Cap Rate {totals.noiCapRatePct.toFixed(2)}%
                </span>
              )}
            </div>
            <span className="text-sm sm:text-sm font-extrabold text-[#334155] tabular-nums">
              연간 총 임대수익 {totals.annualRent.toLocaleString()}만 원
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1.5 border-t border-[#E2E8F0]">
            <div className="flex items-baseline justify-between sm:block">
              <div className="text-sm font-semibold text-[#64748B]">총 보증금</div>
              <div className="text-sm sm:text-base font-extrabold text-[#1D4ED8] tabular-nums">
                {formatKoreanCurrencyReadout(totals.totalDeposit).replace(/^=\s*/, "") ||
                  `${totals.totalDeposit.toLocaleString()}만 원`}
              </div>
            </div>
            <div className="flex items-baseline justify-between sm:block">
              <div className="text-sm font-semibold text-[#64748B]">월 임대료 합계</div>
              <div className="text-sm sm:text-base font-extrabold text-[#1D4ED8] tabular-nums">
                {formatKoreanCurrencyReadout(totals.totalRent).replace(/^=\s*/, "") ||
                  `${totals.totalRent.toLocaleString()}만 원`}
              </div>
            </div>
            <div className="flex items-baseline justify-between sm:block">
              <div className="text-sm font-semibold text-[#64748B]">월 관리비 합계</div>
              <div className="text-sm sm:text-base font-extrabold text-[#334155] tabular-nums">
                {formatKoreanCurrencyReadout(totals.totalMaintenance).replace(/^=\s*/, "") ||
                  `${totals.totalMaintenance.toLocaleString()}만 원`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
