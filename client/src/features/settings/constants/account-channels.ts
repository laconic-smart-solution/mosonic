import type { LucideIcon } from "lucide-react"
import { Bird, Building2, Camera, Music2, PlayCircle, Share2 } from "lucide-react"

export type AccountChannelDef = {
  /** Stable id for React keys */
  id: string
  /** Path segment for Zernio `GET /zernio/connect/:platform` */
  apiKey: string
  /** Lowercase channel keys returned from sync / stored on user */
  matchKeys: readonly string[]
  label: string
  description: string
  icon: LucideIcon
  /** Tailwind classes for the icon tile background (no HTML in tokens) */
  iconTileClass: string
}

/** Display order: Facebook, Twitter, Instagram, YouTube, LinkedIn, TikTok */
export const ACCOUNT_CHANNELS: readonly AccountChannelDef[] = [
  {
    id: "facebook",
    apiKey: "facebook",
    matchKeys: ["facebook"],
    label: "Facebook",
    description: "Pages and profiles for Meta publishing.",
    icon: Share2,
    iconTileClass: "bg-[#1877F2]/15 text-[#1877F2]",
  },
  {
    id: "twitter",
    apiKey: "x",
    matchKeys: ["x", "twitter"],
    label: "Twitter",
    description: "Short-form posts via X.",
    icon: Bird,
    iconTileClass: "bg-foreground/10 text-foreground",
  },
  {
    id: "instagram",
    apiKey: "instagram",
    matchKeys: ["instagram"],
    label: "Instagram",
    description: "Feed, reels, and visual stories.",
    icon: Camera,
    iconTileClass: "bg-gradient-to-br from-[#F58529]/20 via-[#DD2A7B]/20 to-[#8134AF]/25 text-[#DD2A7B]",
  },
  {
    id: "youtube",
    apiKey: "youtube",
    matchKeys: ["youtube"],
    label: "YouTube",
    description: "Long-form and Shorts video publishing.",
    icon: PlayCircle,
    iconTileClass: "bg-[#FF0000]/12 text-[#FF0000]",
  },
  {
    id: "linkedin",
    apiKey: "linkedin",
    matchKeys: ["linkedin"],
    label: "LinkedIn",
    description: "Professional updates and company pages.",
    icon: Building2,
    iconTileClass: "bg-[#0A66C2]/15 text-[#0A66C2]",
  },
  {
    id: "tiktok",
    apiKey: "tiktok",
    matchKeys: ["tiktok"],
    label: "TikTok",
    description: "Vertical video and TikTok-native formats.",
    icon: Music2,
    iconTileClass: "bg-foreground/10 text-foreground",
  },
] as const
