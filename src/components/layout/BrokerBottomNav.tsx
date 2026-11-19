"use client";

import React from "react";
import {
  DEFAULT_WORKSPACE_TABS,
  WorkspaceBottomNav,
} from "@/components/workspace/WorkspaceBottomNav";

/**
 * WP 4-B: Unified mobile bottom navigation for secondary broker routes (/broker/profile, /broker/tutorial, etc.).
 * Delegates directly to WorkspaceBottomNav (5 canonical tabs: 홈 / 딜카드 / IM / 뉴스레터 / 소통함)
 * in daylight Paper theme, eliminating legacy dark nav & dormant links.
 */
export default function BrokerBottomNav({ userEmail: _userEmail }: { userEmail?: string }) {
  void _userEmail;
  return (
    <div id="broker-bottom-nav" className="lg:hidden">
      <WorkspaceBottomNav tabs={DEFAULT_WORKSPACE_TABS} />
    </div>
  );
}
