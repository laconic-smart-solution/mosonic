import { useTranslation } from "react-i18next"
import { Skeleton } from "@/components/ui/skeleton"
import { T } from "@/lib/tokens"

const NAV_KEYS = [
  "overview",
  "brand",
  "audience",
  "campaign",
  "channels",
  "guidelines",
] as const

function FormSectionSkeleton() {
  return (
    <div className="border-b border-border/50 pb-10 last:border-b-0 last:pb-0">
      <div className="mb-5 flex items-start gap-3">
        <div
          className="mt-1 h-9 w-1 shrink-0 rounded-full"
          style={{ background: T.accent }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-40 rounded-md" />
          <Skeleton className="h-3 w-full max-w-md rounded-md" />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-6">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-28 rounded-md" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Skeleton className="h-3 w-32 rounded-md" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export function RuleDetailViewSkeleton() {
  const { t } = useTranslation("rules")
  const navLabels = NAV_KEYS.map((key) => t(`detail.nav.${key}`))

  return (
    <div className="flex w-full gap-8 lg:gap-10">
      <nav aria-hidden className="hidden w-44 shrink-0 lg:block">
        <div className="sticky top-2 space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-2">
          {navLabels.map((label) => (
            <Skeleton key={label} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </nav>

      <div className="min-w-0 flex-1 rounded-2xl border border-border/70 bg-linear-to-b from-card/90 to-card/40 p-6 shadow-sm ring-1 ring-black/3 sm:p-8 dark:ring-white/6">
        <div className="-mx-1 mb-6 flex gap-1 overflow-x-auto pb-1 lg:hidden">
          {navLabels.map((label) => (
            <Skeleton key={label} className="h-8 w-20 shrink-0 rounded-full" />
          ))}
        </div>

        <header className="border-b border-border/50 pb-8">
          <Skeleton className="h-3 w-28 rounded-md" />
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-9 w-full max-w-lg rounded-md" />
              <Skeleton className="h-3 w-full max-w-xl rounded-md" />
            </div>
            <Skeleton className="h-11 w-36 shrink-0 rounded-xl" />
          </div>
        </header>

        <div className="mt-8 space-y-10">
          {NAV_KEYS.slice(1).map((key) => (
            <FormSectionSkeleton key={key} />
          ))}
        </div>
      </div>
    </div>
  )
}
