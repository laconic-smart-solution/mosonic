import type { ReactNode } from "react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"

import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"

type NavItem = {
  id: string
  label: string
  path: string
  badge?: string
  badgeColor?: string
  icon: (active: boolean) => ReactNode
}

const NAV: NavItem[] = [
  {
    id: "home",
    label: "Home",
    path: "/",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 6.5L8 2l6 4.5V14H2V6.5z" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" strokeLinejoin="round" fill={active ? "#ffffff18" : "none"} />
      </svg>
    ),
  },
  {
    id: "dashboard",
    label: "Dashboard",
    path: "/dashboard",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2" y="2" width="5" height="5" rx="1" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" />
        <rect x="9" y="2" width="5" height="5" rx="1" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" />
        <rect x="2" y="9" width="5" height="5" rx="1" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" />
        <rect x="9" y="9" width="5" height="5" rx="1" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" fill={active ? "#ffffff30" : "none"} />
      </svg>
    ),
  },
  {
    id: "rules",
    label: "Rules",
    path: "/rules",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M3 4h10M3 8h7M3 12h5" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="13" cy="11" r="2.5" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    id: "workflow",
    label: "Workflows",
    path: "/rules",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1" y="5" width="4" height="6" rx="1" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" />
        <rect x="11" y="3" width="4" height="4" rx="1" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" />
        <rect x="11" y="9" width="4" height="4" rx="1" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" />
        <path d="M5 8h3M8 8V5h3M8 8v3h3" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    id: "run",
    label: "Live Run",
    path: "/run",
    badge: "1",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="6" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" />
        <path d="M6.5 5.5l4 2.5-4 2.5V5.5z" fill={active ? "#fff" : "currentColor"} />
      </svg>
    ),
  },
  {
    id: "content",
    label: "Content",
    path: "/content",
    badge: "3",
    badgeColor: "#D97706",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2" y="2" width="12" height="12" rx="2" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" />
        <path d="M5 6h6M5 9h4" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "upload",
    label: "Upload",
    path: "/upload",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 10V3M5 6l3-3 3 3M3 13h10" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "analytics",
    label: "Analytics",
    path: "/analytics",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 12l3-4 3 2 3-5 3 3" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "logs",
    label: "Logs",
    path: "/logs",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2" y="2" width="12" height="12" rx="2" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.4" />
        <path d="M5 5.5h6M5 8h6M5 10.5h3" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "components",
    label: "Components",
    path: "/components",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 2l3 2v3L8 9 5 7V4L8 2zM3 9l2.5 1.5v3L3 15l-2-1.5v-3L3 9zM13 9l2 1.5v3L13 15l-2.5-1.5v-3L13 9z" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
]

type SidebarPanelProps = {
  /** Called after navigation (e.g. close drawer). */
  onNavigate?: () => void
  className?: string
}

export function SidebarPanel({ onNavigate, className }: SidebarPanelProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleHome = () => {
    navigate("/")
    onNavigate?.()
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-[216px] min-w-[216px] flex-col border-r border-[#0F1F3D] bg-[#040B15]",
        className,
      )}
      style={{ borderColor: T.sidebarBorder, background: T.sidebarBg }}
    >
      <div className="border-b border-[#0F1F3D] px-4 pb-3.5 pt-[18px]" style={{ borderColor: T.sidebarBorder }}>
        <button
          type="button"
          onClick={handleHome}
          className="flex cursor-pointer items-center gap-2.5 border-none bg-transparent p-0"
        >
          <div className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#00A589] to-[#254C94] shadow-[0_0_12px_#00A58950]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="3" fill="white" opacity="0.9" />
              <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="1.2" opacity="0.4" />
              <circle cx="8" cy="8" r="7.5" stroke="white" strokeWidth="0.6" opacity="0.2" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold leading-tight tracking-[-0.3px] text-white">NeuralTex</div>
            <div className="text-[9px] font-semibold uppercase tracking-[1.2px] text-[#00A589]">AI Platform</div>
          </div>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2.5">
        <div className="px-2 pb-1.5 pt-1.5 text-[9px] font-bold uppercase tracking-wide text-[#3A3A55]">Platform</div>
        {NAV.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.path === "/"}
            onClick={() => onNavigate?.()}
          >
            {({ isActive }) => {
              const active = item.id === "workflow" ? location.pathname.startsWith("/workflow/") : isActive
              return (
              <div
                className={cn(
                  "relative mb-px flex w-full cursor-pointer items-center gap-[9px] rounded-md px-2 py-[7px] text-[13px] transition-all duration-100",
                  active
                    ? "bg-[#1A1A2E] font-semibold text-white"
                    : "font-normal text-[#8888AA]",
                )}
              >
                {active ? (
                  <div className="absolute top-[20%] bottom-[20%] left-0 w-0.5 rounded-r-sm bg-[#00A589]" />
                ) : null}
                <span className={cn("shrink-0", active ? "opacity-100" : "opacity-[0.65]")}>{item.icon(active)}</span>
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span
                    className="rounded-[10px] px-[5px] py-px text-[9px] leading-snug font-bold text-white"
                    style={{ background: item.badgeColor ?? T.accent }}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </div>
            )
            }}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[#0F1F3D] p-2.5" style={{ borderColor: T.sidebarBorder }}>
        <div className="flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors hover:bg-white/5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#00A589] to-[#254C94] text-[11px] font-bold text-white">
            A
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-white">Apisit K.</div>
            <div className="truncate text-[10px]" style={{ color: T.sidebarText }}>
              BKK Agency Co.
            </div>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 opacity-40" aria-hidden>
            <path d="M3 5l3-3 3 3M3 7l3 3 3-3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}
