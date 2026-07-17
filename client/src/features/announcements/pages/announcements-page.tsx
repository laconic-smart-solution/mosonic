import { useEffect, useMemo, useRef, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Loader2, Newspaper } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PageShell } from "@/components/app/page-shell"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type {
  AnnouncementLevel,
  PublicAnnouncement,
} from "../api/announcements.api"
import {
  ANNOUNCEMENTS_PAGE_SIZE,
  useAnnouncementsInfiniteQuery,
} from "../hooks/use-announcements"
import { announcementLevelTheme } from "../lib/announcement-level-theme"

const PREVIEW_CHARS = 220

function formatPublishedAt(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function relativePublishedAt(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

function AnnouncementCard({
  item,
  locale,
}: {
  item: PublicAnnouncement
  locale: string
}) {
  const { t } = useTranslation("announcements")
  const [expanded, setExpanded] = useState(false)
  const theme = announcementLevelTheme(item.level)
  const needsTruncate = item.message.length > PREVIEW_CHARS
  const body =
    !needsTruncate || expanded
      ? item.message
      : `${item.message.slice(0, PREVIEW_CHARS).trimEnd()}…`

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_0_rgba(0,0,0,0.04)]",
      )}
    >
      <div className={cn("pl-2", theme.soft)}>
        <div className="flex flex-col gap-4 p-3 sm:flex-row sm:items-start sm:gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-semibold tracking-wide uppercase",
                  theme.badge,
                )}
              >
                {t(`levels.${item.level as AnnouncementLevel}`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {relativePublishedAt(item.publishedAt)}
              </span>
              <span className="hidden text-xs text-muted-foreground/50 sm:inline">
                ·
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {formatPublishedAt(item.publishedAt, locale)}
              </span>
            </div>

            <h2 className="mt-2.5 font-heading text-lg font-semibold tracking-tight text-foreground">
              {item.title}
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {body}
            </p>

            {needsTruncate ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="mt-2 h-auto px-0 text-foreground"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? t("page.showLess") : t("page.viewMore")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

export default function AnnouncementsPage() {
  const { t, i18n } = useTranslation("announcements")
  const query = useAnnouncementsInfiniteQuery(ANNOUNCEMENTS_PAGE_SIZE)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const rows = useMemo(
    () => query.data?.pages.flatMap((page) => page.announcements) ?? [],
    [query.data],
  )

  const hasNextPage = Boolean(query.hasNextPage)
  const isFetchingNextPage = query.isFetchingNextPage

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    const target = loadMoreRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void query.fetchNextPage()
        }
      },
      { root: null, rootMargin: "240px 0px" },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, query.fetchNextPage, rows.length])

  return (
    <PageShell>
      <div className="flex w-full flex-col gap-5">
        <header className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {t("page.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
        </header>

        {query.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : query.isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-sm text-destructive">
            {t("page.loadError")}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Newspaper className="size-6 opacity-70" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">{t("page.empty")}</p>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {rows.map((item) => (
                <li key={item.id}>
                  <AnnouncementCard item={item} locale={i18n.language} />
                </li>
              ))}
            </ul>

            <div
              ref={loadMoreRef}
              className="flex min-h-10 items-center justify-center py-2"
              aria-hidden={!hasNextPage}
            >
              {isFetchingNextPage ? (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("page.loadingMore")}
                </span>
              ) : hasNextPage ? (
                <span className="text-xs text-muted-foreground/60">
                  {t("page.scrollForMore")}
                </span>
              ) : rows.length > ANNOUNCEMENTS_PAGE_SIZE ? (
                <span className="text-xs text-muted-foreground/60">
                  {t("page.end")}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
