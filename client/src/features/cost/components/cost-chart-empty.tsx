import { T } from "@/lib/tokens"

type Props = {
  label: string
}

export function CostChartEmpty({ label }: Props) {
  return (
    <div
      className="flex min-h-[200px] flex-col items-center justify-center rounded-[10px] border px-4 py-8 text-center text-sm"
      style={{ background: T.surfaceBg, borderColor: T.surfaceBorder, color: T.textSecondary }}
    >
      {label}
    </div>
  )
}
