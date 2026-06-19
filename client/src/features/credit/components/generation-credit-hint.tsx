import { Coins } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

type GenerationCreditHintProps = {
  credits: number | undefined
  className?: string
}

export function GenerationCreditHint({
  credits,
  className,
}: GenerationCreditHintProps) {
  const { t } = useTranslation("credit")
  const amount = credits ?? 0
  if (amount <= 0) return null

  return (
    <p
      className={cn(
        "flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <Coins className="size-3 shrink-0" aria-hidden />
      <span>{t("generationCost", { count: amount })}</span>
    </p>
  )
}
