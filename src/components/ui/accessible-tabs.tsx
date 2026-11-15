"use client";

import React, { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AccessibleTabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  panelId?: string;
  disabled?: boolean;
  testId?: string;
}

export interface AccessibleTabsProps<T extends string = string> {
  tabs: ReadonlyArray<AccessibleTabItem<T>>;
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  idPrefix?: string;
  className?: string;
  tabClassName?: string;
  activeTabClassName?: string;
  inactiveTabClassName?: string;
}

export function getAccessibleTabId(prefix: string, id: string): string {
  return `${prefix}-tab-${id}`;
}

export function getAccessibleTabPanelId(prefix: string, id: string): string {
  return `${prefix}-panel-${id}`;
}

/**
 * WAI-ARIA Authoring Practices Guide (APG) 준수 접근성 탭 바.
 * - role="tablist" / role="tab" / aria-selected / aria-controls
 * - Roving tabIndex (선택 탭 0, 비선택 탭 -1)
 * - ArrowRight / ArrowLeft / Home / End 키보드로 포커스 이동 및 즉시 활성화
 * - 최소 44px(min-h-[44px]) 시니어 친화 터치 타깃 보장
 */
export function AccessibleTabs<T extends string = string>({
  tabs,
  value,
  onValueChange,
  ariaLabel,
  idPrefix,
  className,
  tabClassName,
  activeTabClassName = "border-primary text-primary bg-primary/10",
  inactiveTabClassName = "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
}: AccessibleTabsProps<T>) {
  const reactUid = useId();
  const prefix = idPrefix ?? reactUid;
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentId: T) => {
    const enabledTabs = tabs.filter((t) => !t.disabled);
    if (enabledTabs.length === 0) return;

    const currentIndex = enabledTabs.findIndex((t) => t.id === currentId);
    let nextIndex = -1;

    if (e.key === "ArrowRight") {
      nextIndex = currentIndex >= 0 ? (currentIndex + 1) % enabledTabs.length : 0;
    } else if (e.key === "ArrowLeft") {
      nextIndex =
        currentIndex >= 0
          ? (currentIndex - 1 + enabledTabs.length) % enabledTabs.length
          : enabledTabs.length - 1;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = enabledTabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const targetTab = enabledTabs[nextIndex];
    if (!targetTab) return;

    const targetButton = tabRefs.current[targetTab.id];
    targetButton?.focus();
    if (targetTab.id !== value) {
      onValueChange(targetTab.id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cn("flex items-center gap-1 overflow-x-auto", className)}
    >
      {tabs.map((tab) => {
        const isSelected = tab.id === value;
        const tabDomId = getAccessibleTabId(prefix, tab.id);
        const panelDomId = tab.panelId ?? getAccessibleTabPanelId(prefix, tab.id);

        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[tab.id] = el;
            }}
            id={tabDomId}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={panelDomId}
            tabIndex={isSelected ? 0 : -1}
            disabled={tab.disabled}
            data-testid={tab.testId}
            onClick={() => {
              if (!tab.disabled && tab.id !== value) {
                onValueChange(tab.id);
              }
            }}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
            className={cn(
              "inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed",
              isSelected ? activeTabClassName : inactiveTabClassName,
              tabClassName,
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export interface AccessibleTabPanelProps {
  idPrefix: string;
  tabId: string;
  active: boolean;
  className?: string;
  children: ReactNode;
}

export function AccessibleTabPanel({
  idPrefix,
  tabId,
  active,
  className,
  children,
}: AccessibleTabPanelProps) {
  return (
    <div
      id={getAccessibleTabPanelId(idPrefix, tabId)}
      role="tabpanel"
      aria-labelledby={getAccessibleTabId(idPrefix, tabId)}
      tabIndex={0}
      hidden={!active}
      className={className}
    >
      {active ? children : null}
    </div>
  );
}
