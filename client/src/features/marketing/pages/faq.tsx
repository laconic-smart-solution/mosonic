import { useState } from "react"
import { useTranslation } from "react-i18next"
import { MessageCircle } from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LandingFloatingLeavesCanvas } from "@/features/marketing/components/landing/landing-floating-leaves-canvas"
import { usePublicFaqsQuery } from "@/shared/queries/faq.query"

export default function MarketingFaqPage() {
  const { t } = useTranslation("faq")
  const { t: tc } = useTranslation("common")
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")

  const { data, isLoading } = usePublicFaqsQuery({
    page,
    limit: 20,
    q: search || undefined,
  })

  return (
    <div className="relative">
      <LandingFloatingLeavesCanvas />
      <div className="relative z-[1] mx-auto w-full max-w-3xl px-6 pb-24 pt-28 sm:px-8">
        <header className="mb-8 space-y-2 text-center sm:text-left">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">{t("subtitle")}</p>
        </header>

        <form
          className="mb-6 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setSearch(query.trim())
            setPage(1)
          }}
        >
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="max-w-md bg-background/80"
            aria-label={t("searchPlaceholder")}
          />
          <Button type="submit" variant="secondary">
            {tc("actions.search")}
          </Button>
        </form>

        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-border bg-card/80 px-4 py-3 text-sm text-muted-foreground">
          <MessageCircle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p>{t("chatCta")}</p>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{tc("actions.loading")}</p>
        ) : data?.items.length ? (
          <Accordion multiple className="bg-card/80 backdrop-blur-sm">
            {data.items.map((faq) => (
              <AccordionItem key={faq.id} value={faq.id}>
                <AccordionTrigger className="font-medium hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {faq.answer}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}

        {data && data.total > data.limit ? (
          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t("prev")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * data.limit >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("next")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
