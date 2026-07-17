import { useEffect, useId, useState } from "react"
import { Loader2, Megaphone } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import {
  useAdminPublishAnnouncement,
  type AnnouncementLevel,
} from "../hooks/use-admin-announcements"

const MAX_TITLE = 200
const MAX_MESSAGE = 5000

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AdminAnnouncementPublishDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("admin")
  const titleId = useId()
  const messageId = useId()
  const publish = useAdminPublishAnnouncement()

  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [level, setLevel] = useState<AnnouncementLevel>("info")
  const [sendInApp, setSendInApp] = useState(true)
  const [sendLine, setSendLine] = useState(false)

  useEffect(() => {
    if (!open) {
      setTitle("")
      setMessage("")
      setLevel("info")
      setSendInApp(true)
      setSendLine(false)
    }
  }, [open])

  const titleTrimmed = title.trim()
  const messageTrimmed = message.trim()
  const channelOk = sendInApp || sendLine
  const canSubmit =
    titleTrimmed.length > 0 &&
    messageTrimmed.length > 0 &&
    channelOk &&
    !publish.isPending

  const handleSubmit = () => {
    if (!canSubmit) return
    publish.mutate(
      {
        title: titleTrimmed,
        message: messageTrimmed,
        level,
        sendInApp,
        sendLine,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (publish.isPending) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="border-b border-border bg-muted/20 px-6 py-5">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Megaphone className="size-4" aria-hidden />
              </span>
              {t("communication.announcements.publishTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("communication.announcements.publishDesc")}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor={titleId}>
              {t("communication.announcements.titleLabel")}
            </Label>
            <Input
              id={titleId}
              value={title}
              maxLength={MAX_TITLE}
              placeholder={t("communication.announcements.titlePlaceholder")}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={messageId}>
              {t("communication.announcements.messageLabel")}
            </Label>
            <Textarea
              id={messageId}
              value={message}
              maxLength={MAX_MESSAGE}
              rows={5}
              placeholder={t("communication.announcements.messagePlaceholder")}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
            <p
              className={cn(
                "text-right text-xs text-muted-foreground",
                message.length > MAX_MESSAGE * 0.9 && "text-amber-600",
              )}
            >
              {t("communication.announcements.charCount", {
                count: message.length,
                max: MAX_MESSAGE,
              })}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t("communication.announcements.levelLabel")}</Label>
            <Select
              value={level}
              onValueChange={(v) => setLevel(v as AnnouncementLevel)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">
                  {t("communication.announcements.levels.info")}
                </SelectItem>
                <SelectItem value="warning">
                  {t("communication.announcements.levels.warning")}
                </SelectItem>
                <SelectItem value="critical">
                  {t("communication.announcements.levels.critical")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {t("communication.announcements.channelInApp")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("communication.announcements.channelInAppHint")}
                </p>
              </div>
              <Switch checked={sendInApp} onCheckedChange={setSendInApp} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {t("communication.announcements.channelLine")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("communication.announcements.channelLineHint")}
                </p>
              </div>
              <Switch checked={sendLine} onCheckedChange={setSendLine} />
            </div>
            {!channelOk ? (
              <p className="text-xs text-destructive">
                {t("communication.announcements.channelRequired")}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={publish.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("communication.announcements.cancel")}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
            {publish.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("communication.announcements.publishing")}
              </>
            ) : (
              t("communication.announcements.publish")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
