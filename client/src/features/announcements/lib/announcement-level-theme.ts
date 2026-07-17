import type { LucideIcon } from "lucide-react"
import { AlertTriangle, Info, OctagonAlert } from "lucide-react"

import type { AnnouncementLevel } from "../api/announcements.api"

export type AnnouncementLevelTheme = {
  accent: string
  soft: string
  iconWrap: string
  badge: string
  banner: string
  Icon: LucideIcon
}

export function announcementLevelTheme(
  level: AnnouncementLevel,
): AnnouncementLevelTheme {
  if (level === "critical") {
    return {
      accent: "bg-destructive",
      soft: "bg-destructive/8",
      iconWrap: "bg-destructive/15 text-destructive",
      badge: "border-destructive/25 bg-destructive/10 text-destructive",
      banner:
        "border-destructive/25 bg-destructive/[0.07] text-foreground dark:bg-destructive/10",
      Icon: OctagonAlert,
    }
  }
  if (level === "warning") {
    return {
      accent: "bg-amber-500",
      soft: "bg-amber-500/8",
      iconWrap: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      badge:
        "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
      banner:
        "border-amber-500/25 bg-amber-500/[0.07] text-foreground dark:bg-amber-500/10",
      Icon: AlertTriangle,
    }
  }
  return {
    accent: "bg-sky-500",
    soft: "bg-sky-500/8",
    iconWrap: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    badge: "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-300",
    banner:
      "border-sky-500/25 bg-sky-500/[0.07] text-foreground dark:bg-sky-500/10",
    Icon: Info,
  }
}
