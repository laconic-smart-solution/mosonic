import { CheckCircle2, MessageCircle, QrCode } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LineConnectDialog } from "@/features/settings/components/line-connect-dialog"
import { useLineConnectStatusQuery } from "@/shared/queries/line.query"

export function AccountGetInTouchSection() {
  const { t } = useTranslation("settings")
  const [open, setOpen] = useState(false)
  const [lineOpen, setLineOpen] = useState(false)

  const statusQuery = useLineConnectStatusQuery({ enabled: true })
  const connected = statusQuery.data?.connected === true

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">{t("contact.sectionTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("contact.sectionDesc")}</p>

        <div className="mt-4 rounded-xl border border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#06C755]/15 text-[#06C755]">
                <MessageCircle className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{t("contact.line.label")}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {statusQuery.isLoading
                    ? t("contact.line.statusLoading")
                    : connected
                      ? t("contact.line.statusConnected")
                      : t("contact.line.description")}
                </div>
              </div>
            </div>
            {connected ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#06C755]/15 px-2 py-1 text-xs font-medium text-[#06C755]">
                <CheckCircle2 className="size-3.5" />
                {t("contact.line.statusBadge")}
              </span>
            ) : null}
          </div>

          <Button
            className="mt-3 w-full"
            variant={connected ? "outline" : "default"}
            onClick={() => setLineOpen(true)}
          >
            {connected ? t("contact.line.manage") : t("contact.line.connect")}
          </Button>
        </div>

        <Button className="mt-3 w-full" variant="outline" onClick={() => setOpen(true)}>
          {t("contact.openButton")}
        </Button>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("contact.modalTitle")}</DialogTitle>
            <DialogDescription>{t("contact.modalDesc")}</DialogDescription>
          </DialogHeader>

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setLineOpen(true)
            }}
            className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-muted/40"
            aria-label={
              connected ? t("contact.line.manageAria") : t("contact.line.connectAria")
            }
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#06C755]/15 text-[#06C755]">
                <MessageCircle className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{t("contact.line.label")}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {connected
                    ? t("contact.line.statusConnected")
                    : t("contact.line.description")}
                </div>
              </div>
            </div>
            {connected ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#06C755]">
                <CheckCircle2 className="size-3.5" />
                {t("contact.line.statusBadge")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                <QrCode className="size-3.5" />
                {t("contact.line.connect")}
              </span>
            )}
          </button>
        </DialogContent>
      </Dialog>

      <LineConnectDialog open={lineOpen} onOpenChange={setLineOpen} />
    </>
  )
}
