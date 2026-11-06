import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"

import { HomeWelcome } from "@/features/home/components/home-welcome"
import type { RuleListItem } from "@/shared/services/rule.service"

/** DEV-only: real HomeWelcome with fixture brands. ?theme=dark, ?empty=1 */
const NAMES = [
  "myu",
  "myu",
  "myu",
  "Purchase Order Cancellation Request",
  "Beauty Phoo",
  "Weverse",
  "LNGSHOT SWISH Pre-Order Instagram Campaign",
  "CareerForge Early Access Job Search Campaign",
]
const FIXTURE: RuleListItem[] = NAMES.map((name, i) => ({
  ruleId: `preview-${i}`,
  name,
  status: "active",
  tones: [],
  channels: [],
  updatedAt: "2026-11-06T06:00:00.000Z",
}))

export default function WelcomePreviewPage() {
  const [params] = useSearchParams()
  const dark = params.get("theme") === "dark"
  const empty = params.get("empty") === "1"
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])
  return (
    <div className="h-screen w-full">
      <HomeWelcome
        rules={empty ? [] : FIXTURE}
        isLoadingRules={false}
        isLoadingMore={false}
        canViewMore={false}
        onViewMore={() => {}}
        onSelectRule={() => {}}
        creating={false}
        onCreated={() => {}}
      />
    </div>
  )
}