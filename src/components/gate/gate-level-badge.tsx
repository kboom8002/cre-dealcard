/**
 * GateLevelBadge — shared UI component
 *
 * Displays gate level (G1/G2/G3) with access level meaning.
 * Source: docs/11-gate-disclosure-policy.md section 3
 */

interface GateLevelBadgeProps {
  level: string;
  showLabel?: boolean;
}

const LEVEL_CONFIG: Record<
  string,
  { label: string; sublabel: string; bg: string; text: string }
> = {
  G1: {
    label: "G1",
    sublabel: "등록 관심",
    bg: "bg-sky-50",
    text: "text-sky-700",
  },
  G2: {
    label: "G2",
    sublabel: "자격 요약",
    bg: "bg-violet-50",
    text: "text-violet-700",
  },
  G3: {
    label: "G3",
    sublabel: "Snapshot / IM Lite",
    bg: "bg-orange-50",
    text: "text-orange-700",
  },
};

export function GateLevelBadge({ level, showLabel = true }: GateLevelBadgeProps) {
  const config = LEVEL_CONFIG[level] ?? {
    label: level,
    sublabel: "",
    bg: "bg-gray-50",
    text: "text-gray-600",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${config.bg} ${config.text}`}
    >
      {config.label}
      {showLabel && config.sublabel && (
        <span className="font-normal opacity-80">· {config.sublabel}</span>
      )}
    </span>
  );
}
