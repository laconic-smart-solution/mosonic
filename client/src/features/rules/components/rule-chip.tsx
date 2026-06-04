import { T } from "@/lib/tokens"

export type RuleChipTone = "gray" | "indigo" | "green" | "amber"

export function RuleChip({ label, color = "gray" }: { label: string; color?: RuleChipTone }) {
  const map = {
    gray: { bg: "#EDF2F7", text: "#4A5568", border: "#D9E1EC" },
    indigo: { bg: T.accentLight, text: T.accent, border: T.accentBorder },
    green: { bg: T.greenBg, text: T.green, border: T.greenBorder },
    amber: { bg: T.amberBg, text: T.amber, border: T.amberBorder },
  }
  const token = map[color]
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        border: `1px solid ${token.border}`,
        background: token.bg,
        color: token.text,
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 8px",
      }}
    >
      {label}
    </span>
  )
}
