"use client";

import React, { useMemo, useState } from "react";
import { checkX05 } from "@/domain/ontology/rules/parcel";

interface AddressResult {
  roadAddr?: string;
  jibunAddr?: string;
  bdNm?: string;
  pnu?: string;
  bdMgtSn?: string;
  admCd?: string;
}

function PnuSearchInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [mode, setMode] = useState<"search" | "manual">(value ? "manual" : "search");
  const [keyword, setKeyword] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<AddressResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedAddr, setSelectedAddr] = useState("");

  const handleSearch = async () => {
    if (!keyword.trim() || keyword.trim().length < 2) return;
    setIsSearching(true);
    setShowResults(true);
    try {
      const res = await fetch(`/api/public/address?keyword=${encodeURIComponent(keyword)}`);
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data.results ?? data.juso ?? []);
        setResults(arr);
      }
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const selectAddress = (result: AddressResult) => {
    const displayAddr = result.roadAddr || result.jibunAddr || "";
    setSelectedAddr(displayAddr);
    setKeyword(displayAddr);
    const resolvedPnu = (result.pnu as string) || (result.bdMgtSn as string) || (result.admCd as string) || "";
    onChange(resolvedPnu);
    setShowResults(false);
    setResults([]);
  };

  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <div className="flex justify-between items-end">
        <label className="block text-[10px] text-muted-foreground">
          PNU (필지고유번호)
        </label>
        <button
          type="button"
          onClick={() => setMode(m => m === "search" ? "manual" : "search")}
          className="text-[10px] text-teal-400 hover:text-teal-300 font-medium"
        >
          {mode === "search" ? "직접 입력하기" : "주소로 검색하기"}
        </button>
      </div>

      {mode === "search" ? (
        <div className="relative">
          <div className="flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={e => {
                setKeyword(e.target.value);
                if (selectedAddr) { setSelectedAddr(""); onChange(""); }
              }}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              onFocus={() => { if (results.length > 0) setShowResults(true); }}
              placeholder="동/도로명 입력 (예: 당산동5가 11-47)"
              className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-teal-500"
            />
            <button 
              type="button"
              onClick={handleSearch}
              disabled={isSearching || keyword.trim().length < 2}
              className="bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-zinc-600 disabled:opacity-50 shrink-0"
            >
              {isSearching ? "검색중..." : "검색"}
            </button>
          </div>

          {showResults && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-y-auto z-[100] divide-y divide-zinc-700">
              {isSearching ? (
                <div className="p-3 text-center text-[10px] text-zinc-400">검색 중...</div>
              ) : results.length > 0 ? (
                results.map((result, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectAddress(result)}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-700 transition-colors flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium text-zinc-100 truncate">
                        {result.roadAddr || result.jibunAddr}
                      </p>
                      {(result.pnu || result.bdMgtSn) && (
                        <span className="text-[9px] font-mono bg-teal-500/20 text-teal-300 px-1 rounded border border-teal-500/30 shrink-0">
                          PNU {String(result.pnu || result.bdMgtSn).slice(0, 19)}
                        </span>
                      )}
                    </div>
                    {result.jibunAddr && result.roadAddr && (
                      <p className="text-[10px] text-zinc-400">지번: {result.jibunAddr}</p>
                    )}
                  </button>
                ))
              ) : (
                <div className="p-3 text-center text-[10px] text-zinc-400">
                  검색 결과가 없습니다.
                </div>
              )}
            </div>
          )}

          {selectedAddr && value && (
            <div className="mt-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-1">
              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                ✅ {selectedAddr}
              </span>
              <span className="text-[10px] font-mono text-emerald-300">
                PNU: {value}
              </span>
            </div>
          )}
        </div>
      ) : (
        <input
          type="text"
          placeholder="예: 1114010100-10001-0000"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-teal-500"
        />
      )}
    </div>
  );
}

interface ParcelEntry {
  pnu: string;
  landCategory: string;
  areaM2: string;
  shareRatio: string;
  officialPricePerM2: string;
}

interface ParcelSectionProps {
  parcels: ParcelEntry[];
  setParcels: (v: ParcelEntry[]) => void;
  ledgerTotalM2: number;
}

const EMPTY_PARCEL: ParcelEntry = {
  pnu: "", landCategory: "", areaM2: "", shareRatio: "1", officialPricePerM2: "",
};

export function ParcelSection({ parcels, setParcels, ledgerTotalM2 }: ParcelSectionProps) {
  // X05 실시간 교차 검증
  const x05Result = useMemo(() => {
    const parsed = parcels
      .filter(p => p.areaM2)
      .map(p => ({
        ledgerAreaM2: parseFloat(p.areaM2) || 0,
        shareRatio: parseFloat(p.shareRatio) || 1,
      }));
    return checkX05(parsed, ledgerTotalM2);
  }, [parcels, ledgerTotalM2]);

  const updateParcel = (idx: number, field: keyof ParcelEntry, value: string) => {
    const updated = [...parcels];
    updated[idx] = { ...updated[idx], [field]: value };
    setParcels(updated);
  };

  const addParcel = () => setParcels([...parcels, { ...EMPTY_PARCEL }]);
  const removeParcel = (idx: number) => setParcels(parcels.filter((_, i) => i !== idx));

  return (
    <div className="border border-teal-500/30 rounded-xl p-4 bg-teal-500/5 space-y-3">
      <div className="flex justify-between items-center border-b border-teal-500/20 pb-2">
        <span className="text-xs font-bold text-teal-300">📐 필지 정보</span>
        <button
          type="button"
          onClick={addParcel}
          className="text-[10px] text-teal-400 hover:text-teal-300 font-medium"
        >
          + 필지 추가
        </button>
      </div>

      {/* X05 교차 검증 경고 */}
      {!x05Result.passed && (
        <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
          ⚠️ {x05Result.message}
        </div>
      )}

      {parcels.map((parcel, idx) => (
        <div key={idx} className="grid grid-cols-2 gap-2 border border-border/30 rounded-lg p-2.5 relative">
          {parcels.length > 1 && (
            <button
              type="button"
              onClick={() => removeParcel(idx)}
              className="absolute top-1 right-1 text-red-400 text-[10px] hover:text-red-300"
            >
              ✕
            </button>
          )}
          <PnuSearchInput
            value={parcel.pnu}
            onChange={(val) => updateParcel(idx, "pnu", val)}
          />
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">지목</label>
            <select
              value={parcel.landCategory}
              onChange={(e) => updateParcel(idx, "landCategory", e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            >
              <option value="">선택</option>
              <option value="대">대</option>
              <option value="전">전</option>
              <option value="답">답</option>
              <option value="임야">임야</option>
              <option value="잡종지">잡종지</option>
              <option value="공장용지">공장용지</option>
              <option value="창고용지">창고용지</option>
              <option value="도로">도로</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">면적 (㎡)</label>
            <input
              type="number"
              step="0.01"
              placeholder="예: 450.00"
              value={parcel.areaM2}
              onChange={(e) => updateParcel(idx, "areaM2", e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">지분율</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              placeholder="예: 1.0"
              value={parcel.shareRatio}
              onChange={(e) => updateParcel(idx, "shareRatio", e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">공시지가 (원/㎡)</label>
            <input
              type="number"
              placeholder="예: 28000000"
              value={parcel.officialPricePerM2}
              onChange={(e) => updateParcel(idx, "officialPricePerM2", e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
