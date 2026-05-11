/**
 * GateStatusBadge — shared UI component
 *
 * Displays gate request status as a styled badge.
 * Source: docs/11-gate-disclosure-policy.md section 11.3
 */

interface GateStatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  submitted: {
    label: "제출됨",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  broker_review: {
    label: "브로커 검토 중",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  approved: {
    label: "승인됨",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
  },
  rejected: {
    label: "거절됨",
    bg: "bg-red-50",
    text: "text-red-600",
    dot: "bg-red-500",
  },
  expired: {
    label: "만료됨",
    bg: "bg-gray-50",
    text: "text-gray-500",
    dot: "bg-gray-400",
  },
  cancelled: {
    label: "취소됨",
    bg: "bg-gray-50",
    text: "text-gray-500",
    dot: "bg-gray-400",
  },
};

export function GateStatusBadge({
  status,
  size = "sm",
}: GateStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    bg: "bg-gray-50",
    text: "text-gray-600",
    dot: "bg-gray-400",
  };

  const padding = size === "md" ? "px-3 py-1" : "px-2 py-0.5";
  const textSize = size === "md" ? "text-sm" : "text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${padding} ${textSize} ${config.bg} ${config.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
