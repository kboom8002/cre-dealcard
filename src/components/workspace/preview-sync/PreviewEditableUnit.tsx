"use client";

import React from "react";

export interface PreviewEditableUnitProps {
  unitId: string;
  label: string;
  onActivate: (unitId: string) => void;
  isActive?: boolean;
  badgeText?: string;
  activeBadgeText?: string;
  testId?: string;
  className?: string;
  as?: "div" | "section";
  children: React.ReactNode;
}

export function PreviewEditableUnit({
  unitId,
  label,
  onActivate,
  isActive = false,
  badgeText = "✎ 눌러서 수정",
  activeBadgeText = "편집 중",
  testId,
  className = "",
  as: Tag = "div",
  children,
}: PreviewEditableUnitProps) {
  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    if (target) {
      // Allow nested links or standalone action buttons to keep working normally
      const interactiveChild = target.closest("a[href], button:not([data-preview-unit-id])");
      if (interactiveChild && interactiveChild !== e.currentTarget) {
        return;
      }
      // If clicking inside a more specific nested PreviewEditableUnit, let the inner unit handle it
      const closestUnit = target.closest("[data-preview-unit-id]");
      if (closestUnit && closestUnit !== e.currentTarget) {
        return;
      }
    }
    e.stopPropagation();
    onActivate(unitId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onActivate(unitId);
    }
  };

  return (
    <Tag
      data-testid={testId}
      data-preview-unit-id={unitId}
      data-preview-active={isActive ? "true" : "false"}
      role="button"
      tabIndex={0}
      aria-label={`${label} 편집하기`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`group/unit relative cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] ${
        isActive
          ? "ring-2 ring-[#007AFF] shadow-xs"
          : "hover:ring-2 hover:ring-[#007AFF]/50"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-3 -top-3 z-20 inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold transition-opacity shadow-sm whitespace-nowrap ${
          isActive
            ? "opacity-100 bg-[#007AFF] text-white border border-[#005FCC]"
            : "opacity-0 group-hover/unit:opacity-100 group-focus-within/unit:opacity-100 bg-white text-[#0040DD] border border-[#007AFF]/45"
        }`}
      >
        {isActive ? activeBadgeText : badgeText}
      </span>
      {children}
    </Tag>
  );
}
