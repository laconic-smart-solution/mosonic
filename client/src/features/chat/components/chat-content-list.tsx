import { Link, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Inbox } from "lucide-react"

import { ContentListCard } from "@/features/content/components/content-list/content-list-card"
import { useContentPageQuery } from "@/shared/queries/content.query"
import { Skeleton } from "@/components/ui/skeleton"

/** One brand = one thread, so the rail shows every draft for this brand (capped for safety). */
const LIMIT = 50

export function ChatContentList({ ruleId }: { ruleId: string }) {
  const { t } = useTranslation("chat")
  const navigate = useNavigate()
  const query = useContentPageQuery(
    {
      page: 1,
      limit: LIMIT,
      sortBy: "updatedAt",
      sortOrder: "desc",
      filter: { ruleRef: ruleId },
    },
    Boolean(ruleId),
  )

  const items = query.data?.data ?? []

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-border bg-card"
            aria-busy="true"
          >
            <Skeleton className="h-28 rounded-none bg-muted" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-2/3 bg-muted" />
              <Skeleton className="h-3 w-1/3 bg-muted" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border px-3 py-6 text-center">
        <Inbox className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">{t("workspace.noContent")}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <ContentListCard
          key={item.contentId}
          item={item}
          index={index}
          compact
          onOpen={(id) => navigate(`/content/${id}`)}
        />
      ))}
      <Link
        to="/content"
        className="text-center text-[11px] font-medium text-primary underline-offset-2 hover:underline"
      >
        {t("workspace.viewAllContents")}
      </Link>
    </div>
  )
}
