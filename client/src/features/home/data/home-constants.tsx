import type { ReactNode } from "react"

export type HomeTemplate = {
  label: string
  sub: string
  color: string
  icon: ReactNode
}

export const HOME_TEMPLATES: HomeTemplate[] = [
  {
    label: "Social Post",
    sub: "Quick campaign",
    color: "#00A589",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="9" cy="9" r="2" fill="currentColor" opacity="0.5" />
      </svg>
    ),
  },
  {
    label: "Product Launch",
    sub: "Full campaign",
    color: "#254C94",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M9 2l2 5h5l-4 3 1.5 5L9 12l-4.5 3L6 10 2 7h5L9 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Newsletter",
    sub: "Email digest",
    color: "#06B6D4",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2 7l7 4 7-4" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
]

export const HOME_RECENT = [
  { label: "Songkran 2026", color: "#00A589", initial: "S", updated: "2h ago" },
  { label: "BKK Café", color: "#254C94", initial: "B", updated: "1d ago" },
  { label: "Summer Sale", color: "#06B6D4", initial: "S", updated: "3d ago" },
] as const

export const PROMPT_SUGGESTIONS = [
  "Write a Songkran festival promotion for Facebook and Instagram",
  "Create a product launch campaign for Thai coffee brand",
  "Generate a weekly newsletter for BKK lifestyle audience",
] as const
