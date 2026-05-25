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
  { label: string; bg: string; text: string; dot: string; border: string }
> = {
  submitted: {
    label: "제출됨",
    bg: "bg-primary/10",
    text: "text-primary",
    dot: "bg-primary/80",
    border: "border-primary/20",
  },
  broker_review: {
    label: "브로커 검토 중",
    bg: "bg-warning/10",
    text: "text-warning",
    dot: "bg-warning/80",
    border: "border-warning/20",
  },
  approved: {
    label: "승인됨",
    bg: "bg-success/10",
    text: "text-success",
    dot: "bg-success/80",
    border: "border-success/20",
  },
  rejected: {
    label: "거절됨",
    bg: "bg-destructive/10",
    text: "text-destructive",
    dot: "bg-destructive/80",
    border: "border-destructive/20",
  },
  expired: {
    label: "만료됨",
    bg: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/60",
    border: "border-border",
  },
  cancelled: {
    label: "취소됨",
    bg: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/60",
    border: "border-border",
  },
};

export function GateStatusBadge({
  status,
  size = "sm",
}: GateStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    bg: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/60",
    border: "border-border",
  };

  const padding = size === "md" ? "px-3 py-1" : "px-2 py-0.5";
  const textSize = size === "md" ? "text-sm" : "text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${padding} ${textSize} ${config.bg} ${config.text} ${config.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
