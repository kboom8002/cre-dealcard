"use client";

import React from "react";

export interface ImDeckReadinessBarProps {
  address: string;
  askingPriceManwon: number;
  gfaSqm: string;
  landAreaSqm: string;
  hasRentRollRow: boolean;
  photoCount: number;
  onFocusEditorUnit?: (unitId: string) => void;
}

interface ReadinessItem {
  key: "address" | "price" | "area" | "rentroll" | "photos";
  label: string;
  ready: boolean;
  unitId: string;
}

/**
 * IM 미리보기 상단에 5대 핵심 항목(주소·매매가·면적·임대현황·현장사진) 준비도를 3초 만에 보여주고
 * 비어 있는 칩을 누르면 해당 입력칸으로 즉시 점프하는 바.
 */
export function ImDeckReadinessBar({
  address,
  askingPriceManwon,
  gfaSqm,
  landAreaSqm,
  hasRentRollRow,
  photoCount,
  onFocusEditorUnit,
}: ImDeckReadinessBarProps) {
  const gfaVal = Number(String(gfaSqm ?? "").replace(/[^0-9.]/g, ""));
  const landVal = Number(String(landAreaSqm ?? "").replace(/[^0-9.]/g, ""));

  const items: readonly ReadinessItem[] = [
    {
      key: "address",
      label: "주소",
      ready: Boolean(address.trim()),
      unitId: "im-unit-address",
    },
    {
      key: "price",
      label: "매매가",
      ready: Number.isFinite(askingPriceManwon) && askingPriceManwon > 0,
      unitId: "im-unit-price",
    },
    {
      key: "area",
      label: "면적",
      ready: (Number.isFinite(gfaVal) && gfaVal > 0) || (Number.isFinite(landVal) && landVal > 0),
      unitId: "im-unit-building",
    },
    {
      key: "rentroll",
      label: "임대현황",
      ready: hasRentRollRow,
      unitId: "im-unit-rentroll",
    },
    {
      key: "photos",
      label: "현장사진",
      ready: photoCount > 0,
      unitId: "im-unit-photos",
    },
  ];

  const readyCount = items.filter((item) => item.ready).length;
  const allReady = readyCount === items.length;

  return (
    <div
      data-testid="im-deck-readiness-bar"
      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-2xs space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-slate-900">
            발행 준비도
          </span>
          <span
            data-testid="im-deck-readiness-count"
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-extrabold ${
              allReady
                ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                : "bg-amber-100 text-amber-950 border border-amber-300"
            }`}
          >
            {readyCount}/5 채워짐
          </span>
        </div>
        <span className="text-sm text-slate-600 break-keep">
          {allReady
            ? "고객에게 바로 보낼 수 있습니다"
            : "비어 있는 항목을 누르면 바로 이동합니다"}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            data-testid={`im-readiness-chip-${item.key}`}
            onClick={() => onFocusEditorUnit?.(item.unitId)}
            className={`inline-flex min-h-[44px] items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-bold transition cursor-pointer ${
              item.ready
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                : "border-amber-300 bg-amber-50/70 text-amber-950 hover:bg-amber-100"
            }`}
          >
            <span aria-hidden="true">{item.ready ? "✓" : "+"}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
