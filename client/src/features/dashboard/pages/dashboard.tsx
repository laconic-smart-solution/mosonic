import { useNavigate } from "react-router-dom"

import { NtChip } from "@/components/app/nt-chip"
import { NtStatCard } from "@/components/app/nt-stat-card"
import { Button } from "@/components/ui/button"
import {
  DB_GENS,
  DB_RULES,
  DB_STATS,
  DB_SUGGESTIONS,
} from "@/features/dashboard/data/dashboard-mock"
import { STATUS_CHIP_COLOR } from "@/lib/tokens"
import { T } from "@/lib/tokens"

export default function DashboardPage() {
  const navigate = useNavigate()

  return (
    <div className="flex max-w-[1200px] flex-col gap-7 px-7 pt-7 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="m-0 text-2xl font-bold tracking-[-0.5px]" style={{ color: T.textPrimary }}>
            Good afternoon, Apisit <span className="ml-2 text-[22px]">👋</span>
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: T.textSecondary }}>
            Here&apos;s what&apos;s happening across your campaigns today.
          </p>
        </div>
        <Button size="default" className="gap-1.5" onClick={() => navigate("/")}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Start New Generation
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {DB_STATS.map((s, i) => (
          <NtStatCard
            key={i}
            label={s.label}
            value={s.value}
            delta={s.delta ?? undefined}
            up={s.up ?? undefined}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[3fr_2fr]">
        <div
          className="overflow-hidden rounded-[10px] border shadow-[var(--nt-surface-shadow)]"
          style={{
            background: T.surfaceBg,
            borderColor: T.surfaceBorder,
            boxShadow: T.surfaceShadow,
          }}
        >
          <div
            className="flex items-center justify-between border-b px-[18px] py-3.5"
            style={{ borderColor: T.surfaceBorder }}
          >
            <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
              Recent Generations
            </span>
            <Button variant="ghost" size="sm" onClick={() => navigate("/content")}>
              View all →
            </Button>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr style={{ background: "#F9F8F5" }}>
                {["Campaign", "Workflow", "Status", "Updated", ""].map((h, idx) => (
                  <th
                    key={idx}
                    className="border-b px-4 py-2 text-left text-[10px] font-bold tracking-wide uppercase"
                    style={{ color: T.textMuted, borderColor: T.surfaceBorder }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DB_GENS.map((r, i) => (
                <tr
                  key={i}
                  className="cursor-pointer border-b border-[#EDF2F7] transition-colors hover:bg-[#FDFCFA]"
                  onClick={() =>
                    navigate(r.status === "running" ? "/run" : "/content")
                  }
                >
                  <td className="px-4 py-2.5 font-semibold" style={{ color: T.textPrimary }}>
                    {r.campaign}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: T.textSecondary }}>
                    {r.workflow}
                  </td>
                  <td className="px-4 py-2.5">
                    <NtChip
                      label={r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      color={STATUS_CHIP_COLOR[r.status] ?? "gray"}
                      size="xs"
                      dot
                    />
                  </td>
                  <td className="px-4 py-2.5 text-[11px]" style={{ color: T.textMuted }}>
                    {r.updated}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(r.status === "running" ? "/run" : "/content")
                      }}
                    >
                      {r.status === "running" ? "View Run →" : "Open →"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className="overflow-hidden rounded-[10px] border shadow-[var(--nt-surface-shadow)]"
          style={{
            background: T.surfaceBg,
            borderColor: T.surfaceBorder,
            boxShadow: T.surfaceShadow,
          }}
        >
          <div
            className="flex items-center gap-1.5 border-b px-[18px] py-3.5"
            style={{ borderColor: T.surfaceBorder }}
          >
            <div className="flex size-[22px] items-center justify-center rounded-md bg-gradient-to-br from-[#00A589] to-[#254C94] text-[11px]">
              ✨
            </div>
            <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
              AI Suggestions
            </span>
          </div>
          {DB_SUGGESTIONS.map((s, i) => (
            <div
              key={i}
              className="border-b border-[#EDF2F7] px-[18px] py-3.5 last:border-b-0"
            >
              <div className="mb-1 text-[11px] font-semibold" style={{ color: T.textMuted }}>
                {s.campaign}
              </div>
              <div className="mb-2.5 text-xs leading-relaxed" style={{ color: T.textPrimary }}>
                {s.text}
              </div>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={() => navigate("/rules")}>
                  Accept
                </Button>
                <Button variant="ghost" size="sm">
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-start justify-between">
          <h2 className="m-0 text-[17px] font-bold tracking-[-0.3px]" style={{ color: T.textPrimary }}>
            Your Rules
          </h2>
          <Button variant="ghost" size="sm" onClick={() => navigate("/rules")}>
            Manage →
          </Button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {DB_RULES.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => navigate("/rules")}
              className="min-w-[196px] shrink-0 cursor-pointer rounded-[10px] border p-3.5 text-left transition-all duration-150"
              style={{
                background: T.surfaceBg,
                borderColor: T.surfaceBorder,
                boxShadow: T.surfaceShadow,
              }}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <div
                  className="flex size-7 items-center justify-center rounded-md border"
                  style={{ background: T.accentLight, borderColor: T.accentBorder }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M2 3h10M2 7h7M2 11h9" stroke={T.accent} strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="text-xs font-bold" style={{ color: T.textPrimary }}>
                  {r.name}
                </span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                {r.channels.map((c) => (
                  <NtChip key={c} label={c} color="gray" size="xs" />
                ))}
              </div>
              <div className="text-[10px]" style={{ color: T.textMuted }}>
                Last used {r.lastUsed}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
