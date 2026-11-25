/**
 * @file src/lib/ux/workspace-identity.ts
 * @description CRE DealCard 4대 핵심 서비스 명칭·순서·아이덴티티 컬러 SSOT.
 *
 * 중개인 확정 순서 (영업 퍼널 순):
 *  ① 부동산뉴스 (초록 #059669)
 *  ② 딜카드     (노랑/골드 #D97706)
 *  ③ IM         (파랑/네이비 #1D4ED8)
 *  ④ 고객 소통  (분홍 #DB2777)
 */

export type WorkspaceServiceId = "magazine" | "dealcards" | "im" | "inbox";

export interface WorkspaceIdentitySpec {
  id: WorkspaceServiceId;
  order: 1 | 2 | 3 | 4;
  label: string;
  topbarLabel: string;
  icon: string;
  href: string;
  accentHex: string;
  softHex: string;
  borderHex: string;
  bgClass: string;
  softBgClass: string;
  textClass: string;
  borderClass: string;
  activePillClass: string;
  bottomTabActiveClass: string;
  bottomTabBarClass: string;
  doorGlowClass: string;
  doorAccentBgClass: string;
  doorBadgeHighlightClass: string;
}

export const WORKSPACE_IDENTITY_ORDER: readonly WorkspaceServiceId[] = [
  "magazine",
  "dealcards",
  "im",
  "inbox",
] as const;

export const WORKSPACE_IDENTITY: Readonly<
  Record<WorkspaceServiceId, WorkspaceIdentitySpec>
> = {
  magazine: {
    id: "magazine",
    order: 1,
    label: "부동산뉴스",
    topbarLabel: "📰 부동산뉴스",
    icon: "📰",
    href: "/broker/w/newsletter",
    accentHex: "#059669",
    softHex: "#ECFDF5",
    borderHex: "#A7F3D0",
    bgClass: "bg-emerald-600",
    softBgClass: "bg-emerald-50",
    textClass: "text-emerald-700",
    borderClass: "border-emerald-300",
    activePillClass:
      "bg-[#059669] text-white shadow-xs",
    bottomTabActiveClass:
      "bg-emerald-600/12 text-[#047857] font-semibold",
    bottomTabBarClass: "bg-[#059669]",
    doorGlowClass: "from-[#10B981]/[0.09] via-transparent to-transparent",
    doorAccentBgClass:
      "bg-[#059669] text-white shadow-xs",
    doorBadgeHighlightClass:
      "bg-[#10B981]/12 text-[#065F46] border-[#10B981]/28 hover:bg-[#10B981]/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
  },
  dealcards: {
    id: "dealcards",
    order: 2,
    label: "딜카드",
    topbarLabel: "📄 딜카드",
    icon: "📄",
    href: "/broker/w/dealcards",
    accentHex: "#D97706",
    softHex: "#FFFBEB",
    borderHex: "#FDE68A",
    bgClass: "bg-amber-600",
    softBgClass: "bg-amber-50",
    textClass: "text-amber-700",
    borderClass: "border-amber-300",
    activePillClass:
      "bg-[#B45309] text-white shadow-xs",
    bottomTabActiveClass:
      "bg-amber-500/14 text-[#B45309] font-semibold",
    bottomTabBarClass: "bg-[#B45309]",
    doorGlowClass: "from-[#F59E0B]/[0.10] via-transparent to-transparent",
    doorAccentBgClass:
      "bg-[#B45309] text-white shadow-xs",
    doorBadgeHighlightClass:
      "bg-[#F59E0B]/14 text-[#92400E] border-[#F59E0B]/30 hover:bg-[#F59E0B]/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
  },
  im: {
    id: "im",
    order: 3,
    label: "IM",
    topbarLabel: "📊 IM",
    icon: "📊",
    href: "/broker/w/im",
    accentHex: "#1D4ED8",
    softHex: "#EFF6FF",
    borderHex: "#BFDBFE",
    bgClass: "bg-blue-700",
    softBgClass: "bg-blue-50",
    textClass: "text-blue-700",
    borderClass: "border-blue-300",
    activePillClass:
      "bg-[#1D4ED8] text-white shadow-xs",
    bottomTabActiveClass:
      "bg-blue-600/12 text-[#1D4ED8] font-semibold",
    bottomTabBarClass: "bg-[#1D4ED8]",
    doorGlowClass: "from-[#2563EB]/[0.09] via-transparent to-transparent",
    doorAccentBgClass:
      "bg-[#1D4ED8] text-white shadow-xs",
    doorBadgeHighlightClass:
      "bg-[#2563EB]/12 text-[#1E40AF] border-[#2563EB]/25 hover:bg-[#2563EB]/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
  },
  inbox: {
    id: "inbox",
    order: 4,
    label: "고객 소통",
    topbarLabel: "💬 고객 소통",
    icon: "💬",
    href: "/broker/w/inbox",
    accentHex: "#DB2777",
    softHex: "#FDF2F8",
    borderHex: "#FBCFE8",
    bgClass: "bg-pink-600",
    softBgClass: "bg-pink-50",
    textClass: "text-pink-700",
    borderClass: "border-pink-300",
    activePillClass:
      "bg-[#BE185D] text-white shadow-xs",
    bottomTabActiveClass:
      "bg-pink-600/12 text-[#BE185D] font-semibold",
    bottomTabBarClass: "bg-[#BE185D]",
    doorGlowClass: "from-[#EC4899]/[0.09] via-transparent to-transparent",
    doorAccentBgClass:
      "bg-[#BE185D] text-white shadow-xs",
    doorBadgeHighlightClass:
      "bg-[#EC4899]/12 text-[#9D174D] border-[#EC4899]/26 hover:bg-[#EC4899]/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
  },
} as const;
