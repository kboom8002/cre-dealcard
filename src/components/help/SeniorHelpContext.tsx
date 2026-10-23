"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface SeniorHelpContextValue {
  /** 친절 도우미(인라인 툴팁·코칭 배너) 표시 여부 (기본 true) */
  helperEnabled: boolean;
  toggleHelperEnabled: () => void;
  /** 우측 20초 사용법 슬라이드 서랍 열림 상태 */
  isDrawerOpen: boolean;
  activeModuleId: string | null;
  openHelpDrawer: (moduleId?: string) => void;
  closeHelpDrawer: () => void;
}

const DEFAULT_CONTEXT: SeniorHelpContextValue = {
  helperEnabled: true,
  toggleHelperEnabled: () => {},
  isDrawerOpen: false,
  activeModuleId: null,
  openHelpDrawer: () => {},
  closeHelpDrawer: () => {},
};

const SeniorHelpContext = createContext<SeniorHelpContextValue>(DEFAULT_CONTEXT);

const STORAGE_KEY = "credeal-senior-helper-enabled";

export function SeniorHelpProvider({ children }: { children: React.ReactNode }) {
  const [helperEnabled, setHelperEnabled] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "false") {
        setHelperEnabled(false);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleHelperEnabled = useCallback(() => {
    setHelperEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const openHelpDrawer = useCallback((moduleId?: string) => {
    if (moduleId) setActiveModuleId(moduleId);
    setIsDrawerOpen(true);
  }, []);

  const closeHelpDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  return (
    <SeniorHelpContext.Provider
      value={{
        helperEnabled,
        toggleHelperEnabled,
        isDrawerOpen,
        activeModuleId,
        openHelpDrawer,
        closeHelpDrawer,
      }}
    >
      {children}
    </SeniorHelpContext.Provider>
  );
}

export function useSeniorHelp(): SeniorHelpContextValue {
  try {
    return useContext(SeniorHelpContext);
  } catch {
    return DEFAULT_CONTEXT;
  }
}
