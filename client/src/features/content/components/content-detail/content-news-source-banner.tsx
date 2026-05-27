import { ExternalLink, Newspaper } from "lucide-react"

import type { ContentDetail } from "@/shared/types/content.type"

type Props = {
  newsMeta: NonNullable<ContentDetail["newsMeta"]>
}

export function ContentNewsSourceBanner({ newsMeta }: Props) {
  return (
    <div className="mb-4 flex gap-3 rounded-xl border border-sky-200/80 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
      <Newspaper className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
          Generated from news
        </p>
        <p className="mt-0.5 font-medium leading-snug">{newsMeta.title}</p>
        {newsMeta.url ? (
          <a
            href={newsMeta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-sky-700 underline-offset-2 hover:underline"
          >
            View source
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </div>
  )
}
