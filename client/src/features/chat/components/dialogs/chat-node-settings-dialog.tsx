import { useState } from "react"
import { useTranslation } from "react-i18next"
import { SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  ChatDialogBody,
  ChatDialogFooter,
  ChatDialogHeading,
} from "./chat-dialog-shell"
import { CHAT_DIALOG_CONTENT_CLASS, chatDialogButton } from "../../lib/chat-dialog-styles"

export type ChatNodeSettings = {
  imagesPerPost: number
  aspectRatio: "4:5" | "1:1" | "16:9"
  useBrandAssets: boolean
  addLogoWatermark: boolean
}

const DEFAULTS: ChatNodeSettings = {
  imagesPerPost: 1,
  aspectRatio: "1:1",
  useBrandAssets: true,
  addLogoWatermark: false,
}

/**
 * 08 · Workflow node settings (image generation).
 * TODO: no single-node config endpoint is exposed to the client; the full canvas saves through
 * useSaveWorkflowNodesByRuleMutation. The caller owns `onSave` (e.g. send a chat instruction, or
 * route to the canvas) until a per-node PATCH exists.
 */
export function ChatNodeSettingsDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  initial,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  initial?: Partial<ChatNodeSettings>
  onSave: (settings: ChatNodeSettings) => void
}) {
  const { t } = useTranslation("chat")
  // Initialised on mount — mount this dialog only while it is open.
  const [settings, setSettings] = useState<ChatNodeSettings>(() => ({ ...DEFAULTS, ...initial }))

  const row = "flex items-center justify-between border-b border-canvas-200 dark:border-white/8 py-2.5 text-sm last:border-0"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-md")}>
        <ChatDialogHeading
          icon={SlidersHorizontal}
          tone="navy"
          title={<DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>}
          subtitle={subtitle ? <DialogDescription className="text-xs">{subtitle}</DialogDescription> : undefined}
        />
        <ChatDialogBody className="space-y-0">
          <div className={row}>
            <span>{t("dialogs.nodeSettings.imagesPerPost")}</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={settings.imagesPerPost}
              onChange={(e) => setSettings((s) => ({ ...s, imagesPerPost: Number(e.target.value) || 1 }))}
              className="h-8 w-16 rounded-[9px] border-canvas-300 dark:border-white/14 text-center"
            />
          </div>
          <div className={row}>
            <span>{t("dialogs.nodeSettings.aspectRatio")}</span>
            <div className="inline-flex rounded-[9px] bg-canvas-100 dark:bg-navy-800 p-0.5">
              {(["4:5", "1:1", "16:9"] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, aspectRatio: ratio }))}
                  className={cn(
                    "rounded-[7px] px-2.5 py-1 text-xs",
                    settings.aspectRatio === ratio ? "bg-white dark:bg-navy-700 font-medium shadow-sm" : "text-canvas-700 dark:text-navy-200",
                  )}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>
          <div className={row}>
            <span>{t("dialogs.nodeSettings.useBrandAssets")}</span>
            <Switch
              checked={settings.useBrandAssets}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, useBrandAssets: Boolean(v) }))}
            />
          </div>
          <div className={row}>
            <span>{t("dialogs.nodeSettings.addLogoWatermark")}</span>
            <Switch
              checked={settings.addLogoWatermark}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, addLogoWatermark: Boolean(v) }))}
            />
          </div>
        </ChatDialogBody>
        <ChatDialogFooter
          start={
            <Button
              variant="outline"
              className={chatDialogButton.secondary}
              onClick={() => setSettings({ ...DEFAULTS, ...initial })}
            >
              {t("dialogs.actions.reset")}
            </Button>
          }
        >
          <DialogClose render={<Button variant="outline" className={chatDialogButton.secondary} />}>
            {t("dialogs.actions.cancel")}
          </DialogClose>
          <Button
            className={chatDialogButton.primary}
            onClick={() => {
              onSave(settings)
              onOpenChange(false)
            }}
          >
            {t("dialogs.actions.save")}
          </Button>
        </ChatDialogFooter>
      </DialogContent>
    </Dialog>
  )
}
