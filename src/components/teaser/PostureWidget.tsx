"use client";

import React from "react";
import { BudgetSlider } from "./BudgetSlider";
import { OwnerOccupiedWidget } from "./OwnerOccupiedWidget";
import { DevelopmentWidget } from "./DevelopmentWidget";
import { OperatingWidget } from "./OperatingWidget";
import { TradingWidget } from "./TradingWidget";
import type { PublicPostureWidgetInput } from "@/domain/public-projection/deal-card";

/**
 * P0-SEC (SEC-5): this is a client component on the PUBLIC /dc/[id] page, so its props are
 * serialised into the RSC payload. It accepts ONLY the minimal allowlisted numeric inputs
 * produced by `toPublicDealCard()` — never full attrs (address / memo / rent roll).
 */
interface Props {
  input: PublicPostureWidgetInput;
  buildingId: string;
}

export function PostureWidget({ input, buildingId }: Props) {
  const { posture } = input;
  const priceEok = input.askingPriceEok ?? 0;
  const defaultBudgetEok = Math.round(priceEok > 0 ? priceEok * 1.1 : 100);
  const maxBudgetEok = Math.max(300, Math.round(defaultBudgetEok * 1.5));

  const assetType = input.assetType || "";
  const isHotelOrResort = ['hotel', 'resort', 'motel'].includes(assetType.toLowerCase()) || assetType.includes('호텔');

  // Narrow attrs-shaped view for the sub-widgets (built client-side from the minimal input;
  // keys match exactly what each sub-widget reads).
  const widgetAttrs: Record<string, unknown> = {
    askingPriceKrw: input.askingPriceEok != null ? input.askingPriceEok * 100000000 : 0,
    totalFloorAreaPyung: input.totalFloorAreaPyung ?? 0,
    landAreaPyung: input.landAreaPyung ?? undefined,
    roomCount: input.roomCount ?? undefined,
    hospitalitySpec: {
      totalRoomCount: input.roomCount ?? undefined,
      averageDailyRate: input.averageDailyRateManwon ?? undefined,
      occupancyRate: input.occupancyRatePct ?? undefined,
      gopMargin: input.gopMarginPct ?? undefined,
    },
    pricePerPyung: input.pricePerPyung ?? 0,
    comparableAvgPricePerPyung: input.comparableAvgPricePerPyung ?? 0,
    assetType,
  };

  if (posture === "owner_occupied") {
    return <OwnerOccupiedWidget attrs={widgetAttrs} />;
  }

  if (posture === "development") {
    return <DevelopmentWidget attrs={widgetAttrs} />;
  }

  if (posture === "operating" && isHotelOrResort) {
    return <OperatingWidget attrs={widgetAttrs} />;
  }

  if (posture === "trading") {
    return <TradingWidget attrs={widgetAttrs} />;
  }

  // Fallback for income & general operating/trading
  return (
    <BudgetSlider
      defaultBudgetEok={defaultBudgetEok}
      maxBudgetEok={maxBudgetEok}
      teaserConfigId={buildingId}
      posture={posture}
      sliderAxis2Config={input.sliderAxis2 ?? undefined}
      askingPriceEok={input.askingPriceEok ? Math.round(input.askingPriceEok) : undefined}
      annualRentEok={input.annualRentEok ?? undefined}
    />
  );
}
