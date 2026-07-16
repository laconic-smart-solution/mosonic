import { useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import type { FaqItem } from "@/shared/types/faq.type"

type Props = {
  faq: FaqItem
  footer?: ReactNode
}

export function FaqBarItem({ faq, footer }: Props) {
  const { t } = useTranslation("faq")
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const answerRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    setExpanded(false)
  }, [faq.id, faq.answer])

  useEffect(() => {
    const el = answerRef.current
    if (!el) return

    const measure = () => {
      if (expanded) return
      setCanExpand(el.scrollHeight > el.clientHeight + 1)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [faq.answer, expanded])

  return (
    <article className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <h3 className="text-sm font-medium leading-snug text-foreground">
        {faq.question}
      </h3>
      <p
        ref={answerRef}
        className={cn(
          "mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground",
          !expanded && "line-clamp-3",
        )}
      >
        {faq.answer}
      </p>
      {(canExpand || expanded) && (
        <button
          type="button"
          className="mt-1.5 text-xs font-medium text-primary hover:underline"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? t("seeLess") : t("seeMore")}
        </button>
      )}
      {footer ? <div className="mt-2">{footer}</div> : null}
    </article>
  )
}
