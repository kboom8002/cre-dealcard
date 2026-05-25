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
  { label: string; sublabel: string; bg: string; text: string; border: string }
> = {
  G1: {
    label: "G1",
    sublabel: "등록 관심",
    bg: "bg-deal-cold/10",
    text: "text-deal-cold",
    border: "border-deal-cold/20",
  },
  G2: {
    label: "G2",
    sublabel: "자격 요약",
    bg: "bg-deal-warm/10",
    text: "text-deal-warm",
    border: "border-deal-warm/20",
  },
  G3: {
    label: "G3",
    sublabel: "Snapshot / IM Lite",
    bg: "bg-deal-hot/10",
    text: "text-deal-hot",
    border: "border-deal-hot/20",
  },
};

export function GateLevelBadge({ level, showLabel = true }: GateLevelBadgeProps) {
  const config = LEVEL_CONFIG[level] ?? {
    label: level,
    sublabel: "",
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold ${config.bg} ${config.text} ${config.border}`}
    >
      {config.label}
      {showLabel && config.sublabel && (
        <span className="font-normal opacity-80">· {config.sublabel}</span>
      )}
    </span>
  );
}
