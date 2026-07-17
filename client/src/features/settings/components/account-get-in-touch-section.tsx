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
import { ViberConnectDialog } from "@/features/settings/components/viber-connect-dialog"
import { useLineConnectStatusQuery } from "@/shared/queries/line.query"
import { useTelegramConnectStatusQuery } from "@/shared/queries/telegram.query"
import { useViberConnectStatusQuery } from "@/shared/queries/viber.query"

function ViberIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12.04 2C6.58 2 2.15 5.95 2.15 10.9c0 2.95 1.55 5.55 3.95 7.23V22l3.62-1.98c.75.21 1.54.32 2.32.32 5.46 0 9.89-3.95 9.89-8.9S17.5 2 12.04 2zm5.74 12.66l-.17.26c-.2.31-.72.66-1.16.72-.31.04-.71.06-1.15-.07-.27-.08-.61-.18-1.05-.35-1.85-.73-3.06-2.45-3.15-2.56-.09-.11-.74-.98-.74-1.87s.47-1.33.64-1.51c.16-.18.35-.23.47-.23h.34c.11 0 .26-.04.4.31.15.37.5 1.28.54 1.37.05.09.08.2.01.32-.07.12-.1.2-.2.31-.1.11-.21.24-.3.32-.1.09-.2.19-.09.37.11.18.49.81 1.05 1.31.72.64 1.33.84 1.52.93.18.09.29.08.4-.05.1-.12.45-.53.57-.71.12-.18.24-.15.4-.09.17.06 1.07.5 1.25.6.18.09.3.14.34.21.05.08.05.45-.1.88z" />
    </svg>
  )
}

export function AccountGetInTouchSection() {
  const { t } = useTranslation("settings")
  const [open, setOpen] = useState(false)
  const [lineOpen, setLineOpen] = useState(false)
  const [telegramOpen, setTelegramOpen] = useState(false)
  const [viberOpen, setViberOpen] = useState(false)

  const lineStatusQuery = useLineConnectStatusQuery({ enabled: true })
  const telegramStatusQuery = useTelegramConnectStatusQuery({ enabled: true })
  const viberStatusQuery = useViberConnectStatusQuery({ enabled: true })
  const lineConnected = lineStatusQuery.data?.connected === true
  const telegramConnected = telegramStatusQuery.data?.connected === true
  const viberConnected = viberStatusQuery.data?.connected === true

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

          <ChannelCard
            brandClass="bg-[#7360F2]/15 text-[#7360F2]"
            icon={<ViberIcon className="size-4" />}
            label={t("contact.viber.label")}
            loading={viberStatusQuery.isLoading}
            connected={viberConnected}
            loadingText={t("contact.viber.statusLoading")}
            connectedText={t("contact.viber.statusConnected")}
            description={t("contact.viber.description")}
            statusBadge={t("contact.viber.statusBadge")}
            connectLabel={t("contact.viber.connect")}
            manageLabel={t("contact.viber.manage")}
            onAction={() => setViberOpen(true)}
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

            <ContactOptionRow
              brandClass="bg-[#7360F2]/15 text-[#7360F2]"
              connectedClass="text-[#7360F2]"
              icon={<ViberIcon className="size-4" />}
              label={t("contact.viber.label")}
              connected={viberConnected}
              connectedText={t("contact.viber.statusConnected")}
              description={t("contact.viber.description")}
              statusBadge={t("contact.viber.statusBadge")}
              connectLabel={t("contact.viber.connect")}
              manageAria={t("contact.viber.manageAria")}
              connectAria={t("contact.viber.connectAria")}
              onSelect={() => {
                setOpen(false)
                setViberOpen(true)
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <LineConnectDialog open={lineOpen} onOpenChange={setLineOpen} />
      <TelegramConnectDialog open={telegramOpen} onOpenChange={setTelegramOpen} />
      <ViberConnectDialog open={viberOpen} onOpenChange={setViberOpen} />
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
