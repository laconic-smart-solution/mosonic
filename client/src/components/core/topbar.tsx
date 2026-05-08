import { useLocation, useNavigate } from "react-router-dom"

import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/rules": "Rules",
  "/workflow": "Workflows",
  "/run": "Live Run",
  "/content": "Content",
  "/upload": "Upload",
  "/analytics": "Analytics",
  "/logs": "Logs",
  "/components": "Components",
}

type TopbarProps = {
  onOpenNav?: () => void
}

export function Topbar({ onOpenNav }: TopbarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const label =
    location.pathname.startsWith("/workflow/")
      ? "Workflows"
      : ROUTE_LABELS[location.pathname] ?? "Dashboard"

  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex h-14 min-h-14 shrink-0 items-center gap-3 border-b px-5 backdrop-blur-md",
      )}
      style={{
        background: T.topbarBg,
        borderColor: T.topbarBorder,
      }}
    >
      {onOpenNav ? (
        <button
          type="button"
          onClick={onOpenNav}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-white transition-colors hover:bg-[#F7F9FC]"
          style={{ borderColor: T.surfaceBorder }}
          aria-label="Open navigation menu"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M3 5h12M3 9h12M3 13h12" stroke={T.textPrimary} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}

      <div className="flex shrink-0 items-center gap-1.5 text-xs" style={{ color: T.textSecondary }}>
        <span style={{ color: T.textMuted }}>NeuralTex</span>
        <span className="text-[10px]" style={{ color: T.textMuted }}>
          ›
        </span>
        <span className="font-semibold" style={{ color: T.textPrimary }}>
          {label}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 justify-center px-2">
        <div
          className="flex w-[280px] max-w-full items-center gap-2 rounded-lg border px-3 py-1.5"
          style={{
            background: "#EDF2F7",
            borderColor: T.surfaceBorder,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0" aria-hidden>
            <circle cx="5.5" cy="5.5" r="4" stroke={T.textMuted} strokeWidth="1.4" />
            <path d="M9 9l2.5 2.5" stroke={T.textMuted} strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Search campaigns, rules, content…"
            className="min-w-0 flex-1 border-none bg-transparent text-xs outline-none"
            style={{ color: T.textPrimary }}
          />
          <kbd
            className="rounded border px-1.5 py-0.5 font-mono text-[9px]"
            style={{ color: T.textMuted, background: "#E8E6E0", borderColor: "#D8D5CE" }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="relative flex size-8 cursor-pointer items-center justify-center rounded-md border bg-white transition-colors"
          style={{ borderColor: T.surfaceBorder }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
            <path d="M7.5 1.5a4 4 0 0 0-4 4v2.5L2 10h11l-1.5-2V5.5a4 4 0 0 0-4-4zM6 11a1.5 1.5 0 0 0 3 0" stroke={T.textSecondary} strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span
            className="absolute top-1.5 right-1.5 size-1.5 rounded-full border-[1.5px] border-white"
            style={{ background: T.accent }}
          />
        </button>

        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs transition-colors"
          style={{ borderColor: T.surfaceBorder, color: T.textPrimary }}
        >
          <div className="flex size-5 items-center justify-center rounded-[5px] bg-gradient-to-br from-[#00A589] to-[#254C94] text-[9px] font-bold text-white">
            BK
          </div>
          <span className="font-medium">BKK Agency</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2 4l3 3 3-3" stroke={T.textMuted} strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  )
}
