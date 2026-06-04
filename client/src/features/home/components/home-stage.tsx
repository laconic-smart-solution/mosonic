import type { ReactNode } from "react"

import { HomeOrb } from "@/features/home/components/home-orb"
import { HomeRecentRail } from "@/features/home/components/home-recent-rail"
import { HomeTemplateRail } from "@/features/home/components/home-template-rail"
import type { HomeTemplate } from "@/features/home/data/home-constants"
import type { HomeRecentSlot } from "@/features/home/lib/home-recent-slots"

type HomeStageProps = {
  mounted: boolean
  orbPulse: boolean
  hovLeft: number | null
  hovRight: number | null
  setHovLeft: (i: number | null) => void
  setHovRight: (i: number | null) => void
  templates: HomeTemplate[]
  onNavigateTemplate: (path: string) => void
  recentSlots: readonly HomeRecentSlot[]
  isRecentLoading: boolean
  onOpenRecentContent: (contentId: string, uploadId?: string) => void
  onOpenRecentLibrary: () => void
  children?: ReactNode
}

export function HomeStage({
  mounted,
  orbPulse,
  hovLeft,
  hovRight,
  setHovLeft,
  setHovRight,
  templates,
  onNavigateTemplate,
  recentSlots,
  isRecentLoading,
  onOpenRecentContent,
  onOpenRecentLibrary,
  children,
}: HomeStageProps) {
  return (
    <div className="relative flex min-h-0 w-full flex-1">
      <div className="pointer-events-none absolute top-1/2 left-3 z-20 -translate-y-1/2 sm:left-5 md:left-8">
        <div className="pointer-events-auto">
          <HomeTemplateRail
            templates={templates}
            hovLeft={hovLeft}
            onHover={setHovLeft}
            onNavigate={onNavigateTemplate}
          />
        </div>
      </div>
      <div className="pointer-events-none absolute top-1/2 right-3 z-20 -translate-y-1/2 sm:right-5 md:right-8">
        <div className="pointer-events-auto">
          <HomeRecentRail
            slots={recentSlots}
            isLoading={isRecentLoading}
            hovRight={hovRight}
            onHover={setHovRight}
            onOpenContent={onOpenRecentContent}
            onOpenLibrary={onOpenRecentLibrary}
          />
        </div>
      </div>

      <div
        className={[
          "flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-10 sm:py-12",
          "transition-all duration-[600ms]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-2.5 opacity-0",
        ].join(" ")}
        style={{ transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)" }}
      >
        <div className="flex w-full max-w-[640px] flex-col items-center gap-5 sm:gap-6">
          <HomeOrb orbPulse={orbPulse} />
          {children ? (
            <div className="flex w-full flex-col items-center gap-3">
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
