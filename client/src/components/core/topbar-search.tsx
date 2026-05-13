import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
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
import { displayLinkedRef } from "@/features/content/lib/content-display"
import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import { useContentPageQuery } from "@/shared/queries/content.query"

import {
  filterTopbarSearchRoutes,
  TOPBAR_SEARCH_ROUTES,
} from "./topbar-search-routes"

const SEARCH_DEBOUNCE_MS = 300

export function TopbarSearch() {
  const navigate = useNavigate()
  const hydrated = useAuthStoreHydrated()
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

  const contentPayload = useMemo(
    () => ({
      page: 1,
      limit: 8,
      search: debounced,
      sortBy: "updatedAt" as const,
      sortOrder: "desc" as const,
    }),
    [debounced],
  )

  const contentEnabled = hydrated && open && debounced.length > 0
  const { data: contentPage, isPending: contentLoading } = useContentPageQuery(
    contentPayload,
    contentEnabled,
  )
  const contentItems = contentPage?.data ?? []

  const routeMatches = useMemo(
    () => filterTopbarSearchRoutes(TOPBAR_SEARCH_ROUTES, debounced),
    [debounced],
  )

  const go = (path: string) => {
    navigate(path)
    setOpen(false)
    setQuery("")
    setDebounced("")
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setQuery("")
      setDebounced("")
    }
  }

  const showGlobalEmpty =
    debounced.length > 0 &&
    routeMatches.length === 0 &&
    !contentLoading &&
    contentItems.length === 0

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        ref={triggerRef}
        type="button"
        className={cn(
          "flex w-[280px] max-w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-left outline-none transition-shadow",
          "hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[#00A589]/25",
        )}
        style={{
          background: "#EDF2F7",
          borderColor: T.surfaceBorder,
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Search content and pages"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 13 13"
          fill="none"
          className="shrink-0"
          aria-hidden
        >
          <circle
            cx="5.5"
            cy="5.5"
            r="4"
            stroke={T.textMuted}
            strokeWidth="1.4"
          />
          <path
            d="M9 9l2.5 2.5"
            stroke={T.textMuted}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span
          className="min-w-0 flex-1 truncate text-xs"
          style={{ color: T.textMuted }}
        >
          Search content and pages…
        </span>
        <kbd
          className="rounded border px-1.5 py-0.5 font-mono text-[9px]"
          style={{
            color: T.textMuted,
            background: "#E8E6E0",
            borderColor: "#D8D5CE",
          }}
        >
          ⌘K
        </kbd>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={6}
        className="w-[min(420px,calc(100vw-2rem))] gap-0 p-0"
        style={
          popoverMinWidth != null ? { minWidth: popoverMinWidth } : undefined
        }
      >
        <Command
          shouldFilter={false}
          className="max-h-[min(420px,70vh)] rounded-2xl border-0 bg-popover shadow-none"
        >
          <CommandInput
            placeholder="Search content and pages…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {showGlobalEmpty ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No matching pages or content.
              </div>
            ) : (
              <>
                {routeMatches.length > 0 ? (
                  <CommandGroup heading="Go to">
                    {routeMatches.map((r) => (
                      <CommandItem
                        key={r.id}
                        value={`route-${r.id}`}
                        onSelect={() => go(r.path)}
                        className="flex flex-col items-start gap-0.5 py-2"
                      >
                        <span className="font-medium">{r.title}</span>
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

                {debounced.length > 0 ? (
                  <CommandGroup heading="Content">
                    {contentLoading ? (
                      <div className="px-3 py-3 text-xs text-muted-foreground">
                        Searching…
                      </div>
                    ) : (
                      <>
                        {contentItems.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            No content matches. Try a campaign ref, workflow ref,
                            pipeline ref, or content ID.
                          </div>
                        ) : null}
                        {contentItems.map((item) => {
                          const label = displayLinkedRef(item.ruleRef, "campaign")
                          return (
                            <CommandItem
                              key={item.contentId}
                              value={`content-${item.contentId}`}
                              onSelect={() =>
                                go(
                                  item.uploadId
                                    ? `/upload/${item.uploadId}`
                                    : `/content/${item.contentId}`
                                )
                              }
                              className="flex flex-col items-start gap-0.5 py-2"
                            >
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {item.contentId}
                              </span>
                              <span className="font-medium">
                                {label !== "—" ? label : item.status}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {item.workflowRef}
                              </span>
                            </CommandItem>
                          )
                        })}
                        <CommandItem
                          value="content-view-all"
                          onSelect={() =>
                            go(`/content?search=${encodeURIComponent(debounced)}`)
                          }
                          className="text-primary"
                        >
                          View all in Content
                        </CommandItem>
                      </>
                    )}
                  </CommandGroup>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
