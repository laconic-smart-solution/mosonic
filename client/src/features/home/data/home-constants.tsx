import type { ReactNode } from "react"

export type HomeTemplateId = "dashboard" | "content" | "rules"

export type HomeTemplateDef = {
  id: HomeTemplateId
  color: string
  path: string
  icon: ReactNode
}

export type HomeTemplate = HomeTemplateDef & {
  label: string
  sub: string
}

export const HOME_TEMPLATE_DEFS: HomeTemplateDef[] = [
  {
    id: "dashboard",
    color: "#00A589",
    path: "/dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2.5" y="2.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="10.5" y="2.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="2.5" y="10.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="10.5" y="10.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    id: "content",
    color: "#254C94",
    path: "/content",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M5.5 3.5h10v11h-10a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M5.5 7h7M5.5 10h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "rules",
    color: "#06B6D4",
    path: "/rules",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M4.5 5.5h9M4.5 9h9M4.5 12.5h6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle cx="4.5" cy="5.5" r="0.9" fill="currentColor" />
        <circle cx="4.5" cy="9" r="0.9" fill="currentColor" />
        <circle cx="4.5" cy="12.5" r="0.9" fill="currentColor" />
      </svg>
    ),
  },
]

/** Accent colors for the three “Recent” rail slots (cycles if the API returns fewer). */
export const HOME_RECENT_RAIL_COLORS = ["#00A589", "#254C94", "#06B6D4"] as const

export const PROMPT_SUGGESTION_KEYS = [
  "promptSuggestions.songkran",
  "promptSuggestions.coffee",
  "promptSuggestions.newsletter",
] as const
