import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Check, Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  useCreditPackagesQuery,
  useCreditTopupMutation,
} from "@/shared/queries/credit.query"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onToppedUp?: (creditsRemaining: number) => void
}

export function TopupDialog({ open, onOpenChange, onToppedUp }: Props) {
  const { t } = useTranslation("credit")
  const packagesQuery = useCreditPackagesQuery(open)
  const topupMutation = useCreditTopupMutation()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const packages = packagesQuery.data ?? []

  useEffect(() => {
    if (open && selectedId === null && packages.length > 0) {
      setSelectedId(packages[0].id)
    }
    if (!open) {
      setSelectedId(null)
    }
  }, [open, packages, selectedId])

  function handleConfirm() {
    if (!selectedId) return
    const pkg = packages.find((p) => p.id === selectedId)
    topupMutation.mutate(
      { packageId: selectedId },
      {
        onSuccess: (data) => {
          toast.success(
            t("topup.success", { credits: (pkg?.credits ?? data.creditsAdded).toLocaleString() }),
          )
          onToppedUp?.(data.creditsRemaining)
          onOpenChange(false)
        },
        onError: () => toast.error(t("topup.error")),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {t("topup.title")}
          </DialogTitle>
          <DialogDescription>{t("topup.description")}</DialogDescription>
        </DialogHeader>

        {packagesQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("topup.loading")}
          </div>
        ) : packagesQuery.isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            {t("topup.loadError")}
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-label={t("topup.title")}
            className="grid gap-3 sm:grid-cols-3"
          >
            {packages.map((pkg) => {
              const selected = pkg.id === selectedId
              return (
                <button
                  key={pkg.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedId(pkg.id)}
                  className={cn(
                    "relative flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/50",
                  )}
                >
                  {selected && (
                    <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                  )}
                  <span className="text-xs font-medium text-muted-foreground">
                    {pkg.label}
                  </span>
                  <span className="font-heading text-xl font-semibold tabular-nums">
                    {pkg.credits.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("topup.credits")} · ${pkg.priceUsd}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={topupMutation.isPending}
          >
            {t("topup.cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedId || topupMutation.isPending}
          >
            {topupMutation.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            {topupMutation.isPending
              ? t("topup.processing")
              : t("topup.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
