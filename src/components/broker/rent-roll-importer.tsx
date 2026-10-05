"use client";

import React, { useRef, useState } from "react";
// SECURITY: xlsx@0.18.5 has known CVEs (CVE-2023-30533 Prototype Pollution) - inputs must be validated
import * as XLSX from "xlsx";
import { calculateEfficiencyRatio } from "@/types/im";
import { sqmToPyeong } from "@/lib/utils/area-conversion";
import {
  parseRentRollData,
  summarizeRentRollAreas,
  type ParsedRentRollRow,
  type RentRollAreaSummary,
} from "@/lib/rentroll/parse-rentroll-sheet";

/** 바텀시트 '빈 양식' 다운로드 파일 — public/ 정적 파일. scripts/build-rentroll-template.mjs 로 생성 */
const TEMPLATE_HREF = "/CREDEAL_rentroll_template_v1.3.xlsx";
const TEMPLATE_DOWNLOAD_NAME = "CREDEAL_렌트롤_표준양식_v1.3.xlsx";

interface RentRollImporterProps {
  hasExistingData?: boolean;
  onImport: (data: {
    monthlyRent: number;
    totalDeposit: number;
    mgmtFeeTotal: number;
    vacancyPct: number;
    floorLeases: ParsedRentRollRow[];
  }) => void;
}

/** 프리뷰 표에서 편집되는 행 — 금액/공실 필드는 항상 값이 있다 */
type PreviewRow = ParsedRentRollRow & {
  deposit_manwon: number;
  rent_manwon: number;
  mgmt_fee_manwon?: number; // 미기재 시 undefined → IM 에서 '-' (0 날조 금지, Rule 34/37)
  is_vacant: boolean;
};

const HELP_CONTENT = [
  { icon: "📋", text: "필수(R1): 호실/층, 업종·상호, 보증금, 월세, 만료일, 임대상태" },
  { icon: "📐", text: "권장(R2): 임대면적(㎡)·전용면적(㎡)·관리비·적용법령 — 전용률은 자동 계산" },
  { icon: "🔎", text: "R3(최초계약일·갱신요구권·대항력)는 엑셀 '자동검증' 시트의 갱신권·명도 판정용" },
  { icon: "💰", text: "금액은 머리글의 단위(원/만원)를 읽고 만원으로 자동 변환" },
  { icon: "📄", text: "제목·주소 행이 위에 있어도, 합계·예시·빈 행은 자동으로 건너뜀" },
  { icon: "🏢", text: "임대상태(임대중/공실/자가사용) 열이 있으면 우선 사용, 없으면 업종·임차인 공란을 공실로 추정" },
  { icon: "📁", text: ".xlsx, .xls, .csv 모두 지원 — 컬럼 정의는 양식의 '컬럼정의' 시트 참고" },
];

export function RentRollImporter({ hasExistingData, onImport }: RentRollImporterProps) {
  const [mode, setMode] = useState<"excel" | "text">("excel");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<string>("");
  const [isError, setIsError] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedPreview, setParsedPreview] = useState<{
    rows: PreviewRow[];
    monthlyRent: number;
    totalDeposit: number;
    mgmtFeeTotal: number;
    vacancyPct: number;
    areaSummary: RentRollAreaSummary;
    warnings: string[];
  } | null>(null);

  const updatePreviewTotals = (newRows: PreviewRow[]) => {
    let totDep = 0;
    let totRent = 0;
    let totMgmt = 0;
    let vacCnt = 0;
    // 파서(parseRentRollData)와 같은 기준: 공실·자가사용 행은 합계에서 제외, 자가사용은 공실률 분모에서도 제외
    let leasableCnt = 0;
    newRows.forEach(r => {
      const ownerUse = r.lease_state === '자가사용';
      if (!ownerUse) leasableCnt++;
      if (r.is_vacant) vacCnt++;
      if (r.is_vacant || ownerUse) return;
      totDep += (r.deposit_manwon || 0);
      totRent += (r.rent_manwon || 0);
      totMgmt += (r.mgmt_fee_manwon || 0);
    });
    const vacPct = leasableCnt > 0 ? Math.round((vacCnt / leasableCnt) * 100) : 0;
    setParsedPreview(prev => prev ? {
      ...prev,
      rows: newRows,
      totalDeposit: totDep,
      monthlyRent: totRent,
      mgmtFeeTotal: totMgmt,
      vacancyPct: vacPct,
      areaSummary: summarizeRentRollAreas(newRows),
    } : null);

    // 실시간 수정 내용도 상위 폼에 즉시 반영
    onImport({
      monthlyRent: totRent,
      totalDeposit: totDep,
      mgmtFeeTotal: totMgmt,
      vacancyPct: vacPct,
      floorLeases: newRows,
    });
  };

  const handleTextParse = async () => {
    if (hasExistingData && !window.confirm('기존 렌트롤 데이터가 있습니다. 새 데이터로 덮어쓰시겠습니까?')) return;
    if (!textInput.trim() || textInput.trim().length < 5) {
      setIsError(true);
      setResult("❌ 최소 5자 이상의 텍스트를 입력해 주세요.");
      return;
    }
    setIsParsing(true);
    setResult("");
    setIsError(false);
    try {
      const res = await fetch("/api/broker/rent-roll/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textInput.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "파싱에 실패했습니다.");
      }
      const data = await res.json();
      
      const rows: PreviewRow[] = (data.floorLeases || []).map((r: any) => ({
        ...r,
        deposit_manwon: r.deposit_manwon || 0,
        rent_manwon: r.rent_manwon || 0,
        mgmt_fee_manwon: Number.isFinite(r.mgmt_fee_manwon) ? r.mgmt_fee_manwon : undefined,
        is_vacant: r.is_vacant || false,
      }));

      setParsedPreview({
        rows,
        monthlyRent: data.monthlyRent,
        totalDeposit: data.totalDeposit,
        mgmtFeeTotal: data.mgmtFeeTotal,
        vacancyPct: data.vacancyPct,
        areaSummary: summarizeRentRollAreas(rows),
        warnings: [],
      });

      // 파싱 즉시 상위 폼(월 임대료, 보증금, 관리비, 공실률)에 자동 입력
      onImport({
        monthlyRent: data.monthlyRent,
        totalDeposit: data.totalDeposit,
        mgmtFeeTotal: data.mgmtFeeTotal,
        vacancyPct: data.vacancyPct,
        floorLeases: rows,
      });

      setResult("✅ AI 분석이 완료되었습니다. 폼에 금액이 자동 입력되었습니다.");
    } catch (err: any) {
      setIsError(true);
      setResult(`❌ ${err?.message ?? "텍스트 파싱 실패"}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (hasExistingData && !window.confirm('기존 렌트롤 데이터가 있습니다. 새 데이터로 덮어쓰시겠습니까?')) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // SECURITY: Validate file size to prevent DoS attacks via malicious large xlsx files
    if (file.size > 5 * 1024 * 1024) {
      setIsError(true);
      setResult("❌ 파일 크기는 5MB를 초과할 수 없습니다.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsImporting(true);
    setResult("");
    setIsError(false);

    try {
      // xlsx@0.18.5 — readAsBinaryString + type:'binary'가 .xlsx 파싱에 가장 안정적
      const binaryStr = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
        reader.readAsBinaryString(file);
      });

      const workbook = XLSX.read(binaryStr, { type: "binary" });
      
      if (!workbook.SheetNames.length) {
        throw new Error("시트를 찾을 수 없습니다. 파일이 비어있는지 확인해주세요.");
      }

      // v1.2 표준양식 호환: '렌트롤' 시트 우선 탐지
      const rentRollSheetName = workbook.SheetNames.find(
        (name) => name.includes('렌트롤') || name.toLowerCase().includes('rent')
      );
      const targetSheetName = rentRollSheetName || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[targetSheetName];
      console.log(`[RentRollImporter] Using sheet: '${targetSheetName}' (of ${workbook.SheetNames.length} sheets)`);
      
      if (!worksheet) {
        throw new Error(`시트 '${targetSheetName}'를 읽을 수 없습니다.`);
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (!jsonData || jsonData.length === 0) {
        throw new Error("시트에 데이터가 없습니다. 다른 시트나 파일을 확인해주세요.");
      }

      const parsed = parseRentRollData(jsonData);

      const rows: PreviewRow[] = parsed.parsedRows.map((r) => ({
        ...r,
        deposit_manwon: r.deposit_manwon || 0,
        rent_manwon: r.rent_manwon || 0,
        mgmt_fee_manwon: Number.isFinite(r.mgmt_fee_manwon) ? r.mgmt_fee_manwon : undefined,
        is_vacant: r.is_vacant || false,
      }));

      setParsedPreview({
        rows,
        monthlyRent: parsed.monthlyRent,
        totalDeposit: parsed.totalDeposit,
        mgmtFeeTotal: parsed.mgmtFeeTotal,
        vacancyPct: parsed.vacancyPct,
        areaSummary: parsed.areaSummary,
        warnings: parsed.warnings,
      });

      // 파싱 즉시 상위 폼(월 임대료, 보증금, 관리비, 공실률)에 자동 입력
      onImport({
        monthlyRent: parsed.monthlyRent,
        totalDeposit: parsed.totalDeposit,
        mgmtFeeTotal: parsed.mgmtFeeTotal,
        vacancyPct: parsed.vacancyPct,
        floorLeases: rows,
      });

      const unitLabel = parsed.unitDetected === "won" ? "(원→만원 자동변환)" : "(만원 단위)";
      const a = parsed.areaSummary;
      const areaLabel = a.leaseSqm > 0 || a.exclusiveSqm > 0
        ? ` 임대 ${a.leaseSqm.toLocaleString()}㎡${a.exclusiveSqm > 0 ? ` · 전용 ${a.exclusiveSqm.toLocaleString()}㎡` : ""}${a.weightedEfficiencyPct != null ? ` · 전용률 ${a.weightedEfficiencyPct}%` : ""}.`
        : "";
      setResult(`✅ ${parsed.rowCount}개 호실 분석 완료 ${unitLabel}.${areaLabel} 폼에 금액이 자동 입력되었습니다.`);
    } catch (err: any) {
      setIsError(true);
      setResult(`❌ ${err?.message ?? "파일 파싱 실패"}\n💡 아래 '?' 버튼을 눌러 작성 가이드를 확인하세요.`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
      {/* Tab Toggle */}
      <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
        <button
          type="button"
          onClick={() => { setMode("excel"); setResult(""); setIsError(false); setParsedPreview(null); }}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
            mode === "excel"
              ? "bg-background text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📁 엑셀/CSV
        </button>
        <button
          type="button"
          onClick={() => { setMode("text"); setResult(""); setIsError(false); setParsedPreview(null); }}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
            mode === "text"
              ? "bg-background text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📝 텍스트 입력
        </button>
      </div>

      {/* Excel Mode */}
      {mode === "excel" && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary">엑셀 렌트롤 간편 임포트</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                임대차 현황표 업로드 → 임대료·보증금·공실률 자동 계산
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => setShowHelp((v) => !v)}
                className={`w-7 h-7 rounded-full border text-xs font-bold flex items-center justify-center transition-colors ${
                  showHelp
                    ? "bg-primary/20 border-primary text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
                }`}
                aria-label="엑셀 작성 가이드"
                title="엑셀 작성 가이드"
              >
                ?
              </button>
              <a
                href={TEMPLATE_HREF}
                download={TEMPLATE_DOWNLOAD_NAME}
                className="border border-primary/30 text-primary px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-primary/10 transition-colors whitespace-nowrap"
                title="빈 엑셀 양식 다운로드 (임대면적·전용면적·전용률 포함, R1/R2/R3 컬럼 설명 시트 포함)"
              >
                📥 빈 양식
              </a>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
              >
                {isImporting ? "분석 중..." : "엑셀/CSV 업로드"}
              </button>
            </div>
          </div>

          {showHelp && (
            <div className="bg-background border border-border rounded-lg p-3 space-y-2 animate-in fade-in duration-150">
              <p className="text-xs font-bold text-foreground">📋 엑셀 작성 가이드</p>
              <ul className="space-y-1.5">
                {HELP_CONTENT.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="shrink-0">{item.icon}</span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 p-2 bg-primary/5 rounded text-[11px] text-primary/80 leading-relaxed">
                💡 <strong>팁:</strong> 기존 임대차 현황표를 그대로 업로드해보세요! 제목·주소·소계 행이 있어도 자동으로 건너뜁니다.
              </div>
            </div>
          )}
        </>
      )}

      {/* Text Mode */}
      {mode === "text" && (
        <div className="space-y-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">자연어 렌트롤 입력</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              층별 임대 현황을 자유롭게 입력하면 AI가 자동 분석합니다
            </p>
          </div>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={`예시:\nB1 라이브펍(5,000/450)\n1F 카페 보증금 8,000 월세 600\n2F 공실\n3~4F 스튜디오(5,000/400)\n\n또는 상세하게:\n1층 약국 보증금 8000만 월세 600만 관리비 50만 계약 2023.03~2026.02`}
            className="w-full h-28 bg-background border border-input rounded-lg px-3 py-2 text-xs leading-relaxed resize-none outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            onClick={handleTextParse}
            disabled={isParsing || !textInput.trim()}
            className="w-full bg-primary text-primary-foreground py-2 rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isParsing ? "🔄 AI 분석 중..." : "✨ AI 분석"}
          </button>
        </div>
      )}

      {/* Result */}
      {result && !parsedPreview && (
        <p className={`text-xs font-medium whitespace-pre-line ${
          isError ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"
        }`}>
          {result}
        </p>
      )}

      {/* Parsed Preview Editable Mini-Table */}
      {parsedPreview && (
        <div className="mt-4 bg-secondary/50 rounded-lg p-3 border border-border animate-in fade-in duration-150">
          <h4 className="text-sm font-semibold mb-2 text-foreground">데이터 확인 및 수정</h4>
          <div className="max-h-60 overflow-auto mb-2 border border-border rounded">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-2 py-1 font-medium">층</th>
                  <th className="px-2 py-1 font-medium">업종</th>
                  <th className="px-2 py-1 font-medium whitespace-nowrap" title="임대차계약서상 계약면적(전용+공용분담), ㎡">임대㎡</th>
                  <th className="px-2 py-1 font-medium whitespace-nowrap" title="임차인 독점 사용면적, ㎡">전용㎡</th>
                  <th className="px-2 py-1 font-medium whitespace-nowrap" title="전용면적 ÷ 임대면적 × 100 (자동)">전용률</th>
                  <th className="px-2 py-1 font-medium">보증금</th>
                  <th className="px-2 py-1 font-medium">월세</th>
                  <th className="px-2 py-1 font-medium" title="보증금 + (월세 × 100)">환산보증금</th>
                  <th className="px-2 py-1 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {parsedPreview.rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-2 py-1">
                      <input 
                        type="text" 
                        value={row.floor} 
                        onChange={(e) => {
                          const newRows = [...parsedPreview.rows];
                          newRows[idx].floor = e.target.value;
                          setParsedPreview({ ...parsedPreview, rows: newRows });
                        }}
                        className="w-12 bg-transparent border-none p-0 focus:ring-1 focus:ring-primary text-xs" 
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input 
                        type="text" 
                        value={row.tenant_type || ''} 
                        onChange={(e) => {
                          const newRows = [...parsedPreview.rows];
                          newRows[idx].tenant_type = e.target.value;
                          setParsedPreview({ ...parsedPreview, rows: newRows });
                        }}
                        className="w-16 bg-transparent border-none p-0 focus:ring-1 focus:ring-primary text-xs" 
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.area_sqm_is_proxy ? "" : (row.area_sqm ?? "")}
                        placeholder="-"
                        onChange={(e) => {
                          const newRows = [...parsedPreview.rows];
                          const v = e.target.value === "" ? undefined : Number(e.target.value);
                          newRows[idx].area_sqm = v;
                          // 사용자가 임대면적을 직접 입력/삭제하면 레거시 대용값 표시는 해제
                          newRows[idx].area_sqm_is_proxy = undefined;
                          newRows[idx].efficiency_ratio_pct = calculateEfficiencyRatio(newRows[idx].exclusive_area_sqm ?? null, v ?? null) ?? undefined;
                          updatePreviewTotals(newRows);
                        }}
                        className="w-16 bg-transparent border-none p-0 focus:ring-1 focus:ring-primary text-xs"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.exclusive_area_sqm ?? ""}
                        placeholder="-"
                        onChange={(e) => {
                          const newRows = [...parsedPreview.rows];
                          const v = e.target.value === "" ? undefined : Number(e.target.value);
                          newRows[idx].exclusive_area_sqm = v;
                          if (newRows[idx].area_sqm_is_proxy) {
                            // 레거시 대용 임대면적은 전용면적과 같은 값을 유지 (전용률은 계산하지 않음)
                            newRows[idx].area_sqm = v;
                            newRows[idx].efficiency_ratio_pct = undefined;
                          } else {
                            newRows[idx].efficiency_ratio_pct = calculateEfficiencyRatio(v ?? null, newRows[idx].area_sqm ?? null) ?? undefined;
                          }
                          updatePreviewTotals(newRows);
                        }}
                        className="w-16 bg-transparent border-none p-0 focus:ring-1 focus:ring-primary text-xs"
                      />
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                      {(() => {
                        const ratio = row.efficiency_ratio_pct;
                        if (ratio == null) return <span className="text-muted-foreground">-</span>;
                        const bad = ratio > 100;
                        const low = ratio < 30;
                        return (
                          <span
                            className={bad ? "text-rose-500 font-semibold" : low ? "text-amber-500" : ""}
                            title={bad ? "전용면적이 임대면적보다 큽니다 — 값을 확인해 주세요" : low ? "전용률이 30% 미만입니다 — 면적 입력을 확인해 주세요" : "전용면적 ÷ 임대면적 × 100"}
                          >
                            {ratio.toFixed(1)}%
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-1">
                      <input 
                        type="number" 
                        value={row.deposit_manwon} 
                        onChange={(e) => {
                          const newRows = [...parsedPreview.rows];
                          newRows[idx].deposit_manwon = Number(e.target.value);
                          updatePreviewTotals(newRows);
                        }}
                        className="w-16 bg-transparent border-none p-0 focus:ring-1 focus:ring-primary text-xs" 
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input 
                        type="number" 
                        value={row.rent_manwon} 
                        onChange={(e) => {
                          const newRows = [...parsedPreview.rows];
                          newRows[idx].rent_manwon = Number(e.target.value);
                          updatePreviewTotals(newRows);
                        }}
                        className="w-16 bg-transparent border-none p-0 focus:ring-1 focus:ring-primary text-xs" 
                      />
                    </td>
                    {/* D37 H-6: 환산보증금 + 상임법 뱃지 */}
                    <td className="px-2 py-1 text-right">
                      {(() => {
                        const dep = row.deposit_manwon ?? 0;
                        const rent = row.rent_manwon ?? 0;
                        const converted = dep + rent * 100; // 상임법 시행령 제2조
                        const THRESHOLD = 90000; // 서울 9억 만원
                        const isProtected = converted <= THRESHOLD;
                        return (
                          <span className="inline-flex items-center gap-1">
                            <span className="tabular-nums">{converted.toLocaleString()}</span>
                            {!row.is_vacant && (
                              <span className={`text-[9px] px-1 rounded ${isProtected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-neutral-500/10 text-neutral-400'}`}
                                title={isProtected ? '상임법 보호 대상' : '상임법 미적용'}>
                                {isProtected ? '보호' : '-'}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-1">
                      <select 
                        value={row.is_vacant ? '공실' : '임대중'} 
                        onChange={(e) => {
                          const newRows = [...parsedPreview.rows];
                          newRows[idx].is_vacant = e.target.value === '공실';
                          updatePreviewTotals(newRows);
                        }}
                        className="bg-transparent border-none p-0 text-xs focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        <option value="임대중">임대중</option>
                        <option value="공실">공실</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center text-xs text-muted-foreground mb-3 font-medium">
            <span>총 보증금: {parsedPreview.totalDeposit.toLocaleString()}만원</span>
            <span>총 월세: {parsedPreview.monthlyRent.toLocaleString()}만원</span>
            <span>공실률: {parsedPreview.vacancyPct}%</span>
          </div>
          {(parsedPreview.areaSummary.leaseSqm > 0 || parsedPreview.areaSummary.exclusiveSqm > 0) && (
            <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
              📐 임대면적 {parsedPreview.areaSummary.leaseSqm.toLocaleString()}㎡({sqmToPyeong(parsedPreview.areaSummary.leaseSqm).toFixed(1)}평)
              {parsedPreview.areaSummary.exclusiveSqm > 0 && ` · 전용면적 ${parsedPreview.areaSummary.exclusiveSqm.toLocaleString()}㎡`}
              {parsedPreview.areaSummary.weightedEfficiencyPct != null && ` · 전용률 ${parsedPreview.areaSummary.weightedEfficiencyPct}%`}
              {parsedPreview.areaSummary.exclusiveSqm > 0 && parsedPreview.areaSummary.rowsMissingExclusive > 0 && ` · 전용면적 미입력 ${parsedPreview.areaSummary.rowsMissingExclusive}호실`}
            </p>
          )}
          {parsedPreview.warnings.length > 0 && (
            <ul className="mb-2 space-y-0.5 text-[11px] text-amber-500">
              {parsedPreview.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
          {result && (
            <p className={`text-xs font-medium whitespace-pre-line mb-3 ${
              isError ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"
            }`}>
              {result}
            </p>
          )}
          <div className="flex gap-2">
            <button 
              type="button"
              onClick={() => {
                onImport({
                  monthlyRent: parsedPreview.monthlyRent,
                  totalDeposit: parsedPreview.totalDeposit,
                  mgmtFeeTotal: parsedPreview.mgmtFeeTotal,
                  vacancyPct: parsedPreview.vacancyPct,
                  floorLeases: parsedPreview.rows
                });
                setParsedPreview(null);
                setResult("✅ 데이터가 성공적으로 반영되었습니다.");
              }} 
              className="flex-1 bg-primary text-primary-foreground py-1.5 rounded text-xs font-medium hover:opacity-90 transition-opacity"
            >
              적용
            </button>
            <button 
              type="button"
              onClick={() => {
                setParsedPreview(null);
                setResult("");
              }} 
              className="flex-1 bg-muted text-foreground py-1.5 rounded text-xs font-medium hover:bg-muted/80 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
