import type { ReactNode } from "react"
import { useMemo } from "react"
import { UserCog, Wallet, GitBranch, Megaphone, Play } from "lucide-react"
import { useTranslation } from "react-i18next"
import { NavLink, useLocation, useNavigate } from "react-router-dom"

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/shared/stores/auth.store"
import { BrandLogo } from "@/assets/icon/brand-logo"

type NavItem = {
  id: string
  labelKey: `nav.${string}`
  path: string
  badge?: string
  badgeColor?: string
  icon: (active: boolean) => ReactNode
}

const NAV: NavItem[] = [
  {
    id: "home",
    labelKey: "nav.home",
    path: "/",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M2 6.5L8 2l6 4.5V14H2V6.5z"
          stroke={active ? "#fff" : "currentColor"}
          strokeWidth="1.4"
          strokeLinejoin="round"
          fill={active ? "#ffffff18" : "none"}
        />
      </svg>
    ),
  },
  {
    id: "dashboard",
    labelKey: "nav.dashboard",
    path: "/dashboard",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect
          x="2"
          y="2"
          width="5"
          height="5"
          rx="1"
          stroke={active ? "#fff" : "currentColor"}
          strokeWidth="1.4"
        />
        <rect
          x="9"
          y="2"
          width="5"
          height="5"
          rx="1"
          stroke={active ? "#fff" : "currentColor"}
          strokeWidth="1.4"
        />
        <rect
          x="2"
          y="9"
          width="5"
          height="5"
          rx="1"
          stroke={active ? "#fff" : "currentColor"}
          strokeWidth="1.4"
        />
        <rect
          x="9"
          y="9"
          width="5"
          height="5"
          rx="1"
          stroke={active ? "#fff" : "currentColor"}
          strokeWidth="1.4"
          fill={active ? "#ffffff30" : "none"}
        />
      </svg>
    ),
  },
  {
    id: "rules",
    labelKey: "nav.rules",
    path: "/rules",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M3 4h10M3 8h7M3 12h5"
          stroke={active ? "#fff" : "currentColor"}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle
          cx="13"
          cy="11"
          r="2.5"
          stroke={active ? "#fff" : "currentColor"}
          strokeWidth="1.4"
        />
      </svg>
    ),
  },
  {
    id: "workflows",
    labelKey: "nav.workflows",
    path: "/workflows",
    icon: (active) => (
      <GitBranch
        className="size-4 shrink-0"
        strokeWidth={1.65}
        aria-hidden
        color={active ? "#fff" : undefined}
      />
    ),
  },
  {
    id: "pipelines",
    labelKey: "nav.pipelines",
    path: "/pipelines",
    icon: (active) => (
      <Play
        className="size-4 shrink-0"
        strokeWidth={1.65}
        aria-hidden
        color={active ? "#fff" : undefined}
      />
    ),
  },
  {
    id: "content",
    labelKey: "nav.content",
    path: "/content",
    badgeColor: "#D97706",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect
          x="2"
          y="2"
          width="12"
          height="12"
          rx="2"
          stroke={active ? "#fff" : "currentColor"}
          strokeWidth="1.4"
        />
        <path
          d="M5 6h6M5 9h4"
          stroke={active ? "#fff" : "currentColor"}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "posts",
    labelKey: "nav.posts",
    path: "/posts",
    icon: (active) => (
      <Megaphone
        className="size-4 shrink-0"
        strokeWidth={1.65}
        aria-hidden
        color={active ? "#fff" : undefined}
      />
    ),
  },
  {
    id: "usage",
    labelKey: "nav.usage",
    path: "/usage",
    icon: (active) => (
      <Wallet
        className="size-4 shrink-0"
        strokeWidth={1.65}
        aria-hidden
        color={active ? "#fff" : undefined}
      />
    ),
  },
  {
    id: "settings-accounts",
    labelKey: "nav.settingsAccounts",
    path: "/settings/accounts",
    icon: (active) => (
      <UserCog
        className="size-4 shrink-0"
        strokeWidth={1.65}
        aria-hidden
        color={active ? "#fff" : undefined}
      />
    ),
  },
  {
    id: "admin",
    labelKey: "nav.admin",
    path: "/admin/dashboard",
    icon: (active) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M8 2l5 2v4c0 3-2.2 5.8-5 6-2.8-.2-5-3-5-6V4l5-2z"
          stroke={active ? "#fff" : "currentColor"}
          strokeWidth="1.3"
          strokeLinejoin="round"
          fill={active ? "#ffffff18" : "none"}
        />
        <path
          d="M8 6v4"
          stroke={active ? "#fff" : "currentColor"}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M8 11h0"
          stroke={active ? "#fff" : "currentColor"}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
]

function navItemActive(item: NavItem, pathname: string): boolean {
  if (item.id === "rules") {
    return (
      pathname === "/rules" ||
      pathname.startsWith("/rules/") ||
      pathname.startsWith("/workflow/")
    )
  }
  if (item.id === "workflows") {
    return pathname === "/workflows" || pathname.startsWith("/workflows/")
  }
  if (item.id === "pipelines") {
    return pathname === "/pipelines" || pathname.startsWith("/pipelines/")
  }
  if (item.id === "posts") {
    return pathname === "/posts" || pathname.startsWith("/posts/")
  }
  if (item.id === "usage") {
    return pathname === "/usage" || pathname.startsWith("/usage/")
  }
  if (item.id === "admin") {
    return pathname.startsWith("/admin")
  }
  if (item.id === "settings-accounts") {
    return (
      pathname === "/settings/accounts" || pathname.startsWith("/settings/")
    )
  }
  if (item.path === "/") return pathname === "/"
  return pathname === item.path || pathname.startsWith(`${item.path}/`)
}

export function SidebarPanel() {
  const { t } = useTranslation("common")
  const navigate = useNavigate()
  const location = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const role = useAuthStore((s) => s.role)

  const navItems = useMemo(
    () => (role === "ADMIN" ? NAV : NAV.filter((item) => item.id !== "admin")),
    [role]
  )

  const closeMobileIfNeeded = () => {
    if (isMobile) setOpenMobile(false)
  }

  const handleHome = () => {
    navigate("/")
    closeMobileIfNeeded()
  }

  return (
    <>
      <SidebarHeader className="gap-0 border-b border-sidebar-border px-4 pt-[18px] pb-3.5 group-data-[collapsible=icon]:px-2">
        <button
          type="button"
          onClick={handleHome}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent p-0 text-left",
            "group-data-[collapsible=icon]:justify-center"
          )}
        >
          <div className="bg-primary-foreground/90 rounded-sm px-1">
            <BrandLogo size="nav" className="size-[30px] shrink-0" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-sm leading-tight font-bold tracking-[-0.3px] text-white">
              {t("appName")}
            </div>
            <div className="text-[9px] font-semibold tracking-[1.2px] text-[#00A589] uppercase">
              {t("appTagline")}
            </div>
          </div>
        </button>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2.5">
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className="px-2 text-[9px] font-bold tracking-wide text-[#3A3A55] uppercase">
            {t("platform")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active = navItemActive(item, location.pathname)
                const displayBadge = item.badge ?? null
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      tooltip={t(item.labelKey)}
                      isActive={active}
                      render={
                        <NavLink
                          to={item.path}
                          end={item.path === "/"}
                          onClick={closeMobileIfNeeded}
                        />
                      }
                      className={cn(
                        "relative gap-[9px] py-[7px] pr-2 pl-2 text-[13px] font-normal text-[#8888AA]",
                        "data-active:!border-none data-active:!bg-[#1A1A2E] data-active:!text-white data-active:!shadow-none",
                        "hover:!bg-white/5 hover:!text-white/90 data-active:font-semibold",
                        active && "[&_svg]:opacity-100",
                        !active && "[&_svg]:opacity-[0.65]"
                      )}
                    >
                      {active ? (
                        <div
                          className="absolute top-[20%] bottom-[20%] left-0 w-0.5 rounded-r-sm bg-[#00A589]"
                          aria-hidden
                        />
                      ) : null}
                      <span className="relative z-10 shrink-0">
                        {item.icon(active)}
                      </span>
                      <span className="relative z-10 min-w-0 flex-1 truncate">
                        {t(item.labelKey)}
                      </span>
                    </SidebarMenuButton>
                    {displayBadge ? (
                      <SidebarMenuBadge
                        className="rounded-[10px] px-[5px] py-px text-[9px] font-bold text-white"
                        style={{
                          background: item.badgeColor ?? T.accent,
                        }}
                      >
                        {displayBadge}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  )
}
