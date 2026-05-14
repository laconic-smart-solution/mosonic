import type { PipelineCostBreakdown } from "@/shared/types/cost.type"
import { T } from "@/lib/tokens"

type Props = {
  data: PipelineCostBreakdown | undefined
  isLoading: boolean
}

export function PipelineCostTable({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="rounded-[10px] border p-4 text-sm" style={{ borderColor: T.surfaceBorder }}>
        Loading pipeline costs…
      </div>
    )
  }
  if (!data?.entries?.length) {
    return null
  }

  return (
    <div
      className="overflow-hidden rounded-[10px] border"
      style={{ borderColor: T.surfaceBorder, background: T.surfaceBg }}
    >
      <div className="border-b px-4 py-3 text-sm font-semibold" style={{ borderColor: T.surfaceBorder, color: T.textPrimary }}>
        Pipeline breakdown (${data.totalUsd.toFixed(4)} total)
      </div>
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ color: T.textMuted }}>
              <th className="px-4 py-2 font-medium">Node</th>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium text-right">USD</th>
              <th className="px-4 py-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((row, i) => (
              <tr key={i} className="border-t" style={{ borderColor: T.surfaceBorder }}>
                <td className="px-4 py-2" style={{ color: T.textPrimary }}>
                  {row.nodeType ?? "—"}
                </td>
                <td className="px-4 py-2" style={{ color: T.textSecondary }}>
                  {row.model ?? "—"}
                </td>
                <td className="px-4 py-2 text-right font-mono" style={{ color: T.textPrimary }}>
                  ${row.costUsd.toFixed(6)}
                </td>
                <td className="px-4 py-2 text-[11px]" style={{ color: T.textMuted }}>
                  {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
