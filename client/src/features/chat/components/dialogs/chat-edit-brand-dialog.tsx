import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Tag, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { cn } from "@/lib/utils"
import { toastApiError } from "@/shared/lib/toast-error"
import { usePatchRuleMutation } from "@/shared/queries/rule.query"
import type { RulePatchPayload } from "@/shared/services/rule.service"
import {
  ChatDialogBody,
  ChatDialogFooter,
  ChatDialogHeading,
} from "./chat-dialog-shell"
import { CHAT_DIALOG_CONTENT_CLASS, chatDialogButton } from "../../lib/chat-dialog-styles"

/**
 * 05 · Edit brand profile — voice + restrictions via PATCH /rules/:id.
 * Audience / Channels / Rules tabs live on the full Rules page (`onOpenFullSetup`).
 */
export function ChatEditBrandDialog({
  open,
  onOpenChange,
  rule,
  onOpenFullSetup,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule: RuleEntity
  onOpenFullSetup: () => void
}) {
  const { t } = useTranslation("chat")
  const patch = usePatchRuleMutation()
  // Initialised from the rule on mount — the caller mounts this dialog only while it is open.
  const [voice, setVoice] = useState(rule.brand.brandDescription ?? "")
  const [avoid, setAvoid] = useState<string[]>(rule.brand.brandRestrictions ?? [])
  const [newAvoid, setNewAvoid] = useState("")

  function addAvoid() {
    const value = newAvoid.trim()
    if (value && !avoid.includes(value)) setAvoid((prev) => [...prev, value])
    setNewAvoid("")
  }

  function save() {
    const body = {
      brand: { ...rule.brand, brandDescription: voice, brandRestrictions: avoid },
    } as RulePatchPayload
    patch.mutate(
      { ruleId: rule.ruleId, patch: body },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => toastApiError(err, "chat:toast.saveBrandFailed"),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-md")}>
        <ChatDialogHeading
          icon={Tag}
          tone="teal"
          title={<DialogTitle className="text-[15px] font-semibold">{t("dialogs.editBrand.title")}</DialogTitle>}
          subtitle={<DialogDescription className="text-xs">{rule.name}</DialogDescription>}
        />
        <ChatDialogBody>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-canvas-700 dark:text-navy-200">{t("dialogs.editBrand.voice")}</span>
            <Textarea
              value={voice}
              rows={3}
              onChange={(e) => setVoice(e.target.value)}
              className="rounded-[9px] border-canvas-300 dark:border-white/14"
            />
          </label>
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-canvas-700 dark:text-navy-200">{t("dialogs.editBrand.avoid")}</span>
            <div className="flex flex-wrap gap-1.5">
              {avoid.map((item) => (
                <span key={item} className="inline-flex items-center gap-1 rounded-full bg-canvas-100 dark:bg-navy-800 px-2.5 py-1 text-xs">
                  {item}
                  <button
                    type="button"
                    aria-label={t("dialogs.actions.remove")}
                    onClick={() => setAvoid((prev) => prev.filter((a) => a !== item))}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <Input
              value={newAvoid}
              placeholder={t("dialogs.editBrand.addAvoid")}
              onChange={(e) => setNewAvoid(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addAvoid()
                }
              }}
              className="h-8 rounded-[9px] border-canvas-300 dark:border-white/14 text-xs"
            />
          </div>
          <button type="button" onClick={onOpenFullSetup} className="text-xs font-medium text-navy-500 dark:text-navy-200 hover:underline">
            {t("dialogs.editBrand.fullSetup")}
          </button>
        </ChatDialogBody>
        <ChatDialogFooter>
          <DialogClose render={<Button variant="outline" className={chatDialogButton.secondary} />}>
            {t("dialogs.actions.cancel")}
          </DialogClose>
          <Button className={chatDialogButton.primary} disabled={patch.isPending} onClick={save}>
            {t("dialogs.actions.saveProfile")}
          </Button>
        </ChatDialogFooter>
      </DialogContent>
    </Dialog>
  )
}
