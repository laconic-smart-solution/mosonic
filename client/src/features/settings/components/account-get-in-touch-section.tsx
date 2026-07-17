import { CheckCircle2, MessageCircle, QrCode, Send } from "lucide-react"
import { useState, type ReactNode } from "react"
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
import { TelegramConnectDialog } from "@/features/settings/components/telegram-connect-dialog"
import { useLineConnectStatusQuery } from "@/shared/queries/line.query"
import { useTelegramConnectStatusQuery } from "@/shared/queries/telegram.query"

export function AccountGetInTouchSection() {
  const { t } = useTranslation("settings")
  const [open, setOpen] = useState(false)
  const [lineOpen, setLineOpen] = useState(false)
  const [telegramOpen, setTelegramOpen] = useState(false)

  const lineStatusQuery = useLineConnectStatusQuery({ enabled: true })
  const telegramStatusQuery = useTelegramConnectStatusQuery({ enabled: true })
  const lineConnected = lineStatusQuery.data?.connected === true
  const telegramConnected = telegramStatusQuery.data?.connected === true

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">
          {t("contact.sectionTitle")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("contact.sectionDesc")}
        </p>

        <div className="mt-4 space-y-3">
          <ChannelCard
            brandClass="bg-[#06C755]/15 text-[#06C755]"
            icon={<MessageCircle className="size-4" />}
            label={t("contact.line.label")}
            loading={lineStatusQuery.isLoading}
            connected={lineConnected}
            loadingText={t("contact.line.statusLoading")}
            connectedText={t("contact.line.statusConnected")}
            description={t("contact.line.description")}
            statusBadge={t("contact.line.statusBadge")}
            connectLabel={t("contact.line.connect")}
            manageLabel={t("contact.line.manage")}
            onAction={() => setLineOpen(true)}
          />

          <ChannelCard
            brandClass="bg-[#229ED9]/15 text-[#229ED9]"
            icon={<Send className="size-4" />}
            label={t("contact.telegram.label")}
            loading={telegramStatusQuery.isLoading}
            connected={telegramConnected}
            loadingText={t("contact.telegram.statusLoading")}
            connectedText={t("contact.telegram.statusConnected")}
            description={t("contact.telegram.description")}
            statusBadge={t("contact.telegram.statusBadge")}
            connectLabel={t("contact.telegram.connect")}
            manageLabel={t("contact.telegram.manage")}
            onAction={() => setTelegramOpen(true)}
          />
        </div>

        <Button
          className="mt-3 w-full"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          {t("contact.openButton")}
        </Button>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("contact.modalTitle")}</DialogTitle>
            <DialogDescription>{t("contact.modalDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <ContactOptionRow
              brandClass="bg-[#06C755]/15 text-[#06C755]"
              connectedClass="text-[#06C755]"
              icon={<MessageCircle className="size-4" />}
              label={t("contact.line.label")}
              connected={lineConnected}
              connectedText={t("contact.line.statusConnected")}
              description={t("contact.line.description")}
              statusBadge={t("contact.line.statusBadge")}
              connectLabel={t("contact.line.connect")}
              manageAria={t("contact.line.manageAria")}
              connectAria={t("contact.line.connectAria")}
              onSelect={() => {
                setOpen(false)
                setLineOpen(true)
              }}
            />

            <ContactOptionRow
              brandClass="bg-[#229ED9]/15 text-[#229ED9]"
              connectedClass="text-[#229ED9]"
              icon={<Send className="size-4" />}
              label={t("contact.telegram.label")}
              connected={telegramConnected}
              connectedText={t("contact.telegram.statusConnected")}
              description={t("contact.telegram.description")}
              statusBadge={t("contact.telegram.statusBadge")}
              connectLabel={t("contact.telegram.connect")}
              manageAria={t("contact.telegram.manageAria")}
              connectAria={t("contact.telegram.connectAria")}
              onSelect={() => {
                setOpen(false)
                setTelegramOpen(true)
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <LineConnectDialog open={lineOpen} onOpenChange={setLineOpen} />
      <TelegramConnectDialog open={telegramOpen} onOpenChange={setTelegramOpen} />
    </>
  )
}

function ChannelCard(props: {
  brandClass: string
  icon: ReactNode
  label: string
  loading: boolean
  connected: boolean
  loadingText: string
  connectedText: string
  description: string
  statusBadge: string
  connectLabel: string
  manageLabel: string
  onAction: () => void
}) {
  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${props.brandClass}`}
          >
            {props.icon}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">
              {props.label}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {props.loading
                ? props.loadingText
                : props.connected
                  ? props.connectedText
                  : props.description}
            </div>
          </div>
        </div>
        {props.connected ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${props.brandClass}`}
          >
            <CheckCircle2 className="size-3.5" />
            {props.statusBadge}
          </span>
        ) : null}
      </div>

      <Button
        className="mt-3 w-full"
        variant={props.connected ? "outline" : "default"}
        onClick={props.onAction}
      >
        {props.connected ? props.manageLabel : props.connectLabel}
      </Button>
    </div>
  )
}

function ContactOptionRow(props: {
  brandClass: string
  connectedClass: string
  icon: ReactNode
  label: string
  connected: boolean
  connectedText: string
  description: string
  statusBadge: string
  connectLabel: string
  manageAria: string
  connectAria: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-muted/40"
      aria-label={props.connected ? props.manageAria : props.connectAria}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${props.brandClass}`}
        >
          {props.icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{props.label}</div>
          <div className="truncate text-xs text-muted-foreground">
            {props.connected ? props.connectedText : props.description}
          </div>
        </div>
      </div>
      {props.connected ? (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${props.connectedClass}`}
        >
          <CheckCircle2 className="size-3.5" />
          {props.statusBadge}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          <QrCode className="size-3.5" />
          {props.connectLabel}
        </span>
      )}
    </button>
  )
}
