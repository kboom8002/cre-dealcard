"use client";

import React from "react";
import { BudgetSlider } from "./BudgetSlider";
import { OwnerOccupiedWidget } from "./OwnerOccupiedWidget";
import { DevelopmentWidget } from "./DevelopmentWidget";
import { OperatingWidget } from "./OperatingWidget";
import { TradingWidget } from "./TradingWidget";
import { TeaserView } from "@/domain/deal/teaser/teaser-projector";

interface Props {
  posture: string;
  attrs: Record<string, unknown>;
  teaserView: TeaserView;
  buildingId: string;
}

export function PostureWidget({ posture, attrs, teaserView, buildingId }: Props) {
  const priceEok = Number(attrs.askingPriceKrw || 0) / 100000000;
  const defaultBudgetEok = Math.round(priceEok > 0 ? priceEok * 1.1 : 100);
  const maxBudgetEok = Math.max(300, Math.round(defaultBudgetEok * 1.5));

  const assetType = String(attrs.assetType || attrs.asset_type || "");
  const isHotelOrResort = ['hotel', 'resort', 'motel'].includes(assetType.toLowerCase()) || assetType.includes('호텔');

  if (posture === "owner_occupied") {
    return <OwnerOccupiedWidget attrs={attrs} />;
  }

  if (posture === "development") {
    return <DevelopmentWidget attrs={attrs} />;
  }

  if (posture === "operating" && isHotelOrResort) {
    return <OperatingWidget attrs={attrs} />;
  }

  if (posture === "trading") {
    return <TradingWidget attrs={attrs} />;
  }

  // Fallback for income & general operating/trading
  return (
    <BudgetSlider
      defaultBudgetEok={defaultBudgetEok}
      maxBudgetEok={maxBudgetEok}
      teaserConfigId={buildingId}
      posture={posture}
      sliderAxis2Config={teaserView.sliderAxis2}
    />
  );
}
