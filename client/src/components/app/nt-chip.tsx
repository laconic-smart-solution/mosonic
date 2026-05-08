import { CHIP_COLORS, type ChipColor } from "@/lib/tokens"

type NtChipProps = {
  label: string
  color?: ChipColor
  size?: "xs" | "sm"
  dot?: boolean
}

export function NtChip({ label, color = "gray", size = "sm", dot = false }: NtChipProps) {
  const c = CHIP_COLORS[color] ?? CHIP_COLORS.gray
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-[20px] font-semibold whitespace-nowrap"
      style={{
        padding: size === "xs" ? "2px 7px" : "3px 9px",
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        fontSize: size === "xs" ? 10 : 11,
        lineHeight: 1.5,
      }}
    >
      {dot ? (
        <span className="size-[5px] shrink-0 rounded-full" style={{ background: c.text }} />
      ) : null}
      {label}
    </span>
  )
}
