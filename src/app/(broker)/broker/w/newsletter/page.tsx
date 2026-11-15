"use client";

import React, { Suspense } from "react";
import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";

/**
 * Canonical workspace route for Newsletter (`/broker/w/newsletter`).
 * Linked from WorkspaceShell (`WS_TOPBAR_LINKS`) and WorkspaceBottomNav.
 * Renders the DB-backed `MagazineEditorPage` directly with zero redirect loop.
 */
export default function NewsletterWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div
          data-testid="newsletter-workspace-loading"
          className="flex min-h-screen items-center justify-center bg-[#F5F5F7] text-base font-bold text-slate-700"
        >
          뉴스레터 편집실을 불러오는 중입니다…
        </div>
      }
    >
      <MagazineEditorPage />
    </Suspense>
  );
}
