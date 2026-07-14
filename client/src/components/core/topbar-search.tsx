import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import {
  filterTopbarSearchRoutes,
  resolveTopbarSearchRoutes,
  TOPBAR_SEARCH_ROUTE_DEFS,
} from "./topbar-search-routes"

const SEARCH_DEBOUNCE_MS = 300

type TopbarSearchProps = {
  /** Icon-only trigger for narrow viewports. */
  compact?: boolean
  className?: string
  onNavigate?: () => void
}

export function TopbarSearch({
  compact = false,
  className,
  onNavigate,
}: TopbarSearchProps) {
  const { t, i18n } = useTranslation("common")
  const navigate = useNavigate()

  const topbarRoutes = useMemo(
    () => resolveTopbarSearchRoutes(TOPBAR_SEARCH_ROUTE_DEFS, t),
    [t, i18n.language],
  )
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [popoverMinWidth, setPopoverMinWidth] = useState<number | undefined>()

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(query.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [query])

  useLayoutEffect(() => {
    if (!open) return
    const el = triggerRef.current
    if (!el) return
    setPopoverMinWidth(Math.max(el.offsetWidth, 320))
  }, [open])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const routeMatches = useMemo(
    () => filterTopbarSearchRoutes(topbarRoutes, debounced),
    [debounced, topbarRoutes],
  )

  const go = (path: string) => {
    navigate(path)
    setOpen(false)
    setQuery("")
    setDebounced("")
    onNavigate?.()
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setQuery("")
      setDebounced("")
    }
  }

  const showGlobalEmpty = debounced.length > 0 && routeMatches.length === 0

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        ref={triggerRef}
        type="button"
        className={cn(
          "cursor-pointer rounded-lg border border-border bg-muted text-left outline-none transition-colors",
          "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring/40",
          compact
            ? "flex size-9 shrink-0 items-center justify-center p-0"
            : "flex w-full max-w-full items-center gap-2 px-3 py-1.5 sm:w-[min(280px,100%)]",
          className,
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("search.ariaLabel")}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 13 13"
          fill="none"
          className="shrink-0 text-muted-foreground"
          aria-hidden
        >
          <circle
            cx="5.5"
            cy="5.5"
            r="4"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M9 9l2.5 2.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        {!compact ? (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {t("search.placeholder")}
            </span>
            <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground sm:inline">
              ⌘K
            </kbd>
          </>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align={compact ? "end" : "center"}
        sideOffset={6}
        className="w-[min(420px,calc(100vw-2rem))] gap-0 border-border bg-popover p-0 text-popover-foreground"
        style={
          popoverMinWidth != null ? { minWidth: popoverMinWidth } : undefined
        }
      >
        <Command
          shouldFilter={false}
          className="max-h-[min(420px,70vh)] rounded-2xl border-0 bg-transparent shadow-none"
        >
          <CommandInput
            placeholder={t("search.placeholder")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {showGlobalEmpty ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("search.noMatches")}
              </div>
            ) : routeMatches.length > 0 ? (
              <CommandGroup heading={t("search.goTo")}>
                {routeMatches.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`route-${r.id}`}
                    onSelect={() => go(r.path)}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <span className="font-medium text-foreground">{r.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.subtitle}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {r.path}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
