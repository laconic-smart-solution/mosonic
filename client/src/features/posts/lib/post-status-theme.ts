import type { PostStatus } from "@/shared/types/post.type"

export type PostStatusTheme = {
  label: string
  badge: string
  heroGradient: string
  emoji: string
  pulse?: boolean
  tileIdle: string
  tileActive: string
  tileLabelActive: string
  tileCountActive: string
}

export const POST_STATUS_THEME: Record<PostStatus, PostStatusTheme> = {
  pending: {
    label: "Pending",
    badge: "bg-[#EEEDFE] text-[#3C3489] border-[#AFA9EC]",
    heroGradient: "from-[#EEEDFE]/90 via-[#F5F4FF] to-muted/80",
    emoji: "◷",
    tileIdle:
      "border-[#AFA9EC]/50 bg-[color:var(--nt-surface)] hover:bg-[#EEEDFE]/40",
    tileActive: "border-[#AFA9EC] bg-[#EEEDFE] shadow-sm",
    tileLabelActive: "text-[#3C3489]",
    tileCountActive: "text-[#3C3489]",
  },
  scheduled: {
    label: "Scheduled",
    badge: "bg-[#E6F1FB] text-[#185FA5] border-[#B5D4F4]",
    heroGradient: "from-[#E6F1FB]/95 via-[#F3F8FE] to-muted/70",
    emoji: "📅",
    pulse: true,
    tileIdle:
      "border-[#B5D4F4] bg-[color:var(--nt-surface)] hover:bg-[#E6F1FB]/50",
    tileActive: "border-[#185FA5] bg-[#E6F1FB] shadow-sm",
    tileLabelActive: "text-[#185FA5]",
    tileCountActive: "text-[#185FA5]",
  },
  published: {
    label: "Published",
    badge: "bg-[#E1F5EE] text-[#0F6E56] border-[#5DCAA5]",
    heroGradient: "from-[#E1F5EE]/95 via-[#F0FBF7] to-muted/70",
    emoji: "✓",
    tileIdle:
      "border-[#5DCAA5]/50 bg-[color:var(--nt-surface)] hover:bg-[#E1F5EE]/50",
    tileActive: "border-[#0F6E56] bg-[#E1F5EE] shadow-sm",
    tileLabelActive: "text-[#0F6E56]",
    tileCountActive: "text-[#0F6E56]",
  },
  failed: {
    label: "Failed",
    badge: "bg-[#FCEBEB] text-[#791F1F] border-[#F09595]",
    heroGradient: "from-[#FCEBEB]/90 via-[#FEF5F5] to-muted/70",
    emoji: "✕",
    tileIdle:
      "border-[#F09595]/50 bg-[color:var(--nt-surface)] hover:bg-[#FCEBEB]/50",
    tileActive: "border-[#791F1F] bg-[#FCEBEB] shadow-sm",
    tileLabelActive: "text-[#791F1F]",
    tileCountActive: "text-[#791F1F]",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-muted text-muted-foreground border-border",
    heroGradient: "from-muted/80 via-muted/40 to-muted/60",
    emoji: "—",
    tileIdle:
      "border-border bg-[color:var(--nt-surface)] hover:bg-muted/40",
    tileActive: "border-foreground/30 bg-muted shadow-sm",
    tileLabelActive: "text-foreground",
    tileCountActive: "text-foreground",
  },
  partial: {
    label: "Partial",
    badge: "bg-[#FAEEDA] text-[#633806] border-[#FAC775]",
    heroGradient: "from-[#FAEEDA]/90 via-[#FEF9EE] to-muted/70",
    emoji: "◐",
    tileIdle:
      "border-[#FAC775]/50 bg-[color:var(--nt-surface)] hover:bg-[#FAEEDA]/50",
    tileActive: "border-[#633806] bg-[#FAEEDA] shadow-sm",
    tileLabelActive: "text-[#633806]",
    tileCountActive: "text-[#633806]",
  },
}

export const ALL_STAT_TILE_THEME = {
  tileIdle:
    "border-[color:var(--nt-border)] bg-[color:var(--nt-surface)] hover:bg-muted/40",
  tileActive: "border-navy-700 bg-navy-50 shadow-sm",
  tileLabelActive: "text-navy-700",
  tileCountActive: "text-navy-700",
} as const
