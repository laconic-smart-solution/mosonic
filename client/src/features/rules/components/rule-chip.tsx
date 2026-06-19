import { cn } from "@/lib/utils"

export type RuleChipTone = "gray" | "indigo" | "green" | "amber"

const CHIP_CLASS: Record<RuleChipTone, string> = {
  gray: "border-border bg-secondary text-muted-foreground dark:bg-muted dark:text-muted-foreground",
  indigo:
    "border-primary/25 bg-accent/80 text-accent-foreground dark:border-primary/35 dark:bg-accent/30 dark:text-primary",
  green:
    "border-[color:var(--nt-green-border)] bg-[color:var(--nt-green-bg)] text-[color:var(--nt-green)]",
  amber:
    "border-[color:var(--nt-amber-border)] bg-[color:var(--nt-amber-bg)] text-[color:var(--nt-amber)]",
}

export function RuleChip({
  label,
  color = "gray",
}: {
  label: string
  color?: RuleChipTone
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        CHIP_CLASS[color],
      )}
    >
      {label}
    </span>
  )
}
