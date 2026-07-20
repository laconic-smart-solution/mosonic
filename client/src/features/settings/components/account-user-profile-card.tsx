import type { ComponentType, ReactNode } from "react"
import {
  CheckCircle2,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Shield,
  UserRound,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { LineConnectDialog } from "@/features/settings/components/line-connect-dialog"
import { TelegramConnectDialog } from "@/features/settings/components/telegram-connect-dialog"
import { ViberConnectDialog } from "@/features/settings/components/viber-connect-dialog"
import { WhatsAppConnectDialog } from "@/features/settings/components/whatsapp-connect-dialog"
import { cn } from "@/lib/utils"
import { initialsFromDisplayName } from "@/shared/lib/user-initials"
import { useLineConnectStatusQuery } from "@/shared/queries/line.query"
import { useTelegramConnectStatusQuery } from "@/shared/queries/telegram.query"
import { useViberConnectStatusQuery } from "@/shared/queries/viber.query"
import { useWhatsAppConnectStatusQuery } from "@/shared/queries/whatsapp.query"
import type { User } from "@/shared/types/user.type"

type AccountUserProfileCardProps = {
  user: User | null
  loading?: boolean
  className?: string
}

function roleLabel(roleName: string | undefined, t: (key: string) => string): string {
  if (roleName === "ADMIN") return t("profile.roles.admin")
  if (roleName === "CUSTOMER") return t("profile.roles.member")
  return roleName?.trim() || "—"
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border">
        <Icon className="size-3.5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-0.5 truncate text-[13px] font-medium text-foreground">
          {value}
        </p>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-2.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </p>
  )
}

function ViberIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M11.4 0C9.18 0 5.04.42 2.9 2.5.86 4.5.3 7.62.12 11.34c-.2 4.16.16 6.66 1.1 8.34C2.5 21.9 5.3 24 9.3 24c.74 0 1.5-.06 2.26-.18 3.9-.64 6.7-2.7 7.82-4.66.9-1.58 1.34-4.1 1.5-7.86.14-3.4-.18-6.4-1.9-8.4C17.3.7 14.1 0 11.4 0zm.34 4.64c2.02 0 3.7.5 4.86 1.7 1.08 1.12 1.42 2.86 1.3 5.34-.12 2.7-.46 4.46-1.08 5.54-.8 1.4-2.86 2.9-5.74 3.36-.58.1-1.14.14-1.68.14-2.78 0-4.68-1.36-5.5-2.8-.68-1.2-.96-3-.82-6 .14-2.7.58-4.9 2.02-6.3C6.4 5.08 8.9 4.64 11.74 4.64zm-.2 2.2c-.34 0-.62.28-.62.62v5.16c0 .34.28.62.62.62h3.42c.34 0 .62-.28.62-.62s-.28-.62-.62-.62h-2.8V7.46c0-.34-.28-.62-.62-.62zm-3.7 1.66c-.34 0-.62.28-.62.62v3.5c0 .34.28.62.62.62s.62-.28.62-.62v-3.5c0-.34-.28-.62-.62-.62z" />
    </svg>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M17.47 14.38c-.29-.14-1.7-.84-1.96-.93-.26-.1-.45-.14-.64.14-.19.29-.74.93-.9 1.12-.17.19-.33.21-.62.07-.29-.14-1.22-.45-2.33-1.43-.86-.77-1.44-1.72-1.61-2.01-.17-.29-.02-.45.12-.59.13-.13.29-.33.43-.5.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.5-.07-.14-.64-1.54-.88-2.11-.23-.55-.47-.48-.64-.48h-.55c-.19 0-.5.07-.76.36-.26.29-1 1-1 2.43s1.02 2.82 1.17 3.01c.14.19 2 3.05 4.85 4.28 1.8.78 2.5.84 3.4.7.55-.08 1.7-.69 1.94-1.36.24-.67.24-1.24.17-1.36-.07-.12-.26-.19-.55-.33zM12.05 21.8h-.01a9.8 9.8 0 0 1-4.99-1.37l-.36-.21-3.71.97 1-3.62-.24-.37a9.78 9.78 0 0 1-1.5-5.22c0-5.41 4.4-9.81 9.82-9.81 2.62 0 5.08 1.02 6.93 2.88a9.74 9.74 0 0 1 2.87 6.93c-.01 5.41-4.41 9.82-9.81 9.82zm8.41-18.23A11.8 11.8 0 0 0 12.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.25-1.64a11.9 11.9 0 0 0 5.78 1.47h.01c6.59 0 11.94-5.35 11.95-11.94 0-3.19-1.24-6.19-3.5-8.45z" />
    </svg>
  )
}

function MessagingChannelCard({
  accent,
  icon,
  label,
  loading,
  connected,
  loadingText,
  connectedText,
  description,
  statusBadge,
  connectLabel,
  manageLabel,
  onAction,
}: {
  accent: string
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
    <div
      className={cn(
        "rounded-xl border p-3.5",
        connected ? undefined : "border-border bg-muted/20",
      )}
      style={
        connected
          ? {
              borderColor: `${accent}40`,
              backgroundColor: `${accent}0F`,
            }
          : undefined
      }
    >
      <div className="flex items-start gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl ring-1"
          style={{
            backgroundColor: `${accent}26`,
            color: accent,
            boxShadow: `inset 0 0 0 1px ${accent}33`,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            {connected ? (
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  backgroundColor: `${accent}26`,
                  color: accent,
                }}
              >
                <CheckCircle2 className="size-3" aria-hidden />
                {statusBadge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {loading ? loadingText : connected ? connectedText : description}
          </p>
          <Button
            type="button"
            variant={connected ? "outline" : "default"}
            size="sm"
            className="mt-3 h-8 rounded-full px-3.5 text-xs"
            onClick={onAction}
          >
            {connected ? manageLabel : connectLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AccountUserProfileCard({
  user,
  loading = false,
  className,
}: AccountUserProfileCardProps) {
  const { t } = useTranslation("settings")
  const [lineOpen, setLineOpen] = useState(false)
  const [telegramOpen, setTelegramOpen] = useState(false)
  const [viberOpen, setViberOpen] = useState(false)
  const [whatsappOpen, setWhatsappOpen] = useState(false)

  const lineStatusQuery = useLineConnectStatusQuery({ enabled: true })
  const telegramStatusQuery = useTelegramConnectStatusQuery({ enabled: true })
  const viberStatusQuery = useViberConnectStatusQuery({ enabled: true })
  const whatsappStatusQuery = useWhatsAppConnectStatusQuery({ enabled: true })

  const lineConnected = lineStatusQuery.data?.connected === true
  const telegramConnected = telegramStatusQuery.data?.connected === true
  const viberConnected = viberStatusQuery.data?.connected === true
  const whatsappConnected = whatsappStatusQuery.data?.connected === true

  if (loading) {
    return (
      <section
        className={cn(
          "overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
          className,
        )}
      >
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-36 rounded-md" />
              <Skeleton className="h-4 w-28 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </section>
    )
  }

  const displayName = user?.name?.trim() || t("profile.unnamed")
  const initials = initialsFromDisplayName(user?.name)
  const email = user?.email?.trim()
  const phone = user?.phoneNumber?.trim()
  const address = user?.address?.trim()

  return (
    <>
      <section
        className={cn(
          "overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:sticky lg:top-20",
          className,
        )}
      >
        <div className="border-b border-border bg-muted/25 px-5 py-4">
          <SectionLabel>{t("profile.sectionTitle")}</SectionLabel>
          <div className="flex items-center gap-4">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="size-16 shrink-0 rounded-full object-cover ring-2 ring-background shadow-sm"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#00A589] to-[#254C94] text-lg font-bold text-white ring-2 ring-background shadow-sm">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
                {displayName}
              </h2>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Shield className="size-3" aria-hidden />
                {roleLabel(user?.roleName, t)}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2.5 border-b border-border px-5 py-4">
          <SectionLabel>{t("profile.detailsTitle")}</SectionLabel>
          <DetailRow
            icon={UserRound}
            label={t("profile.email")}
            value={email || t("profile.notSet")}
          />
          <DetailRow
            icon={Phone}
            label={t("profile.phone")}
            value={phone || t("profile.notSet")}
          />
          <DetailRow
            icon={MapPin}
            label={t("profile.address")}
            value={address || t("profile.notSet")}
          />
        </div>

        <div className="space-y-2.5 px-5 py-4">
          <SectionLabel>{t("contact.messagingTitle")}</SectionLabel>

          <MessagingChannelCard
            accent="#06C755"
            icon={<MessageCircle className="size-5" aria-hidden />}
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

          <MessagingChannelCard
            accent="#229ED9"
            icon={<Send className="size-5" aria-hidden />}
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

          <MessagingChannelCard
            accent="#7360F2"
            icon={<ViberIcon className="size-5" />}
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

          <MessagingChannelCard
            accent="#25D366"
            icon={<WhatsAppIcon className="size-5" />}
            label={t("contact.whatsapp.label")}
            loading={whatsappStatusQuery.isLoading}
            connected={whatsappConnected}
            loadingText={t("contact.whatsapp.statusLoading")}
            connectedText={t("contact.whatsapp.statusConnected")}
            description={t("contact.whatsapp.description")}
            statusBadge={t("contact.whatsapp.statusBadge")}
            connectLabel={t("contact.whatsapp.connect")}
            manageLabel={t("contact.whatsapp.manage")}
            onAction={() => setWhatsappOpen(true)}
          />
        </div>
      </section>

      <LineConnectDialog open={lineOpen} onOpenChange={setLineOpen} />
      <TelegramConnectDialog open={telegramOpen} onOpenChange={setTelegramOpen} />
      <ViberConnectDialog open={viberOpen} onOpenChange={setViberOpen} />
      <WhatsAppConnectDialog open={whatsappOpen} onOpenChange={setWhatsappOpen} />
    </>
  )
}
