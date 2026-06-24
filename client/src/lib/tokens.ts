/** Mosonic design tokens — values follow CSS variables in styles/index.css */
export const T = {
  // Sidebar (navy scale)
  sidebarBg: "var(--nt-sidebar)",
  sidebarBorder: "var(--nt-sidebar-border)",
  sidebarText: "#A0AEC0",
  sidebarActive: "#FFFFFF",
  sidebarActiveBg: "#091528",
  sidebarHoverBg: "#09152880",

  // Canvas / main
  canvasBg: "var(--nt-canvas)",
  surfaceBg: "var(--nt-surface)",
  surfaceBorder: "var(--nt-border)",
  surfaceShadow: "var(--nt-surface-shadow)",
  surfaceShadowMd:
    "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",

  // Topbar
  topbarBg: "var(--nt-topbar-bg)",
  topbarBorder: "var(--nt-topbar-border)",

  // Text (gray scale)
  textPrimary: "var(--nt-text-primary)",
  textSecondary: "var(--nt-text-secondary)",
  textMuted: "var(--nt-text-muted)",

  // Accent (teal scale)
  accent: "var(--nt-accent)",
  accentLight: "var(--nt-accent-light)",
  accentBorder: "var(--nt-accent-border)",

  // Status
  green: "var(--nt-green)",
  greenBg: "var(--nt-green-bg)",
  greenBorder: "var(--nt-green-border)",
  amber: "var(--nt-amber)",
  amberBg: "var(--nt-amber-bg)",
  amberBorder: "var(--nt-amber-border)",
  red: "var(--nt-red)",
  redBg: "var(--nt-red-bg)",
  redBorder: "var(--nt-red-border)",
  blue: "var(--nt-blue, #2563EB)",
  blueBg: "var(--nt-blue-bg, #DBEAFE)",
  blueBorder: "var(--nt-blue-border, #93C5FD)",
} as const

export type ChipColor = "gray" | "indigo" | "green" | "amber" | "red" | "blue"

export const CHIP_COLORS: Record<
  ChipColor,
  { bg: string; text: string; border: string }
> = {
  gray: { bg: "var(--nt-muted-bg)", text: T.textSecondary, border: T.surfaceBorder },
  indigo: { bg: T.accentLight, text: T.accent, border: T.accentBorder },
  green: { bg: T.greenBg, text: T.green, border: T.greenBorder },
  amber: { bg: T.amberBg, text: T.amber, border: T.amberBorder },
  red: { bg: T.redBg, text: T.red, border: T.redBorder },
  blue: { bg: T.blueBg, text: T.blue, border: T.blueBorder },
}

export const STATUS_CHIP_COLOR: Record<string, ChipColor> = {
  done: "green",
  running: "blue",
  pending: "amber",
  failed: "red",
  idle: "gray",
  active: "green",
  draft: "amber",
  archived: "gray",
  published: "green",
  scheduled: "indigo",
  blocked: "amber",
}
