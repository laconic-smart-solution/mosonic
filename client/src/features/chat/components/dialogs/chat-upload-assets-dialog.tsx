import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { FileImage, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useUploadRuleAssetMutation } from "@/shared/queries/rule-asset.query"
import type { RuleAssetType } from "@/shared/services/rule-asset.service"
import {
  ChatDialogBody,
  ChatDialogFooter,
  ChatDialogHeading,
} from "./chat-dialog-shell"
import { CHAT_DIALOG_CONTENT_CLASS, chatDialogButton } from "../../lib/chat-dialog-styles"

const ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.txt,.md"

function inferAssetType(file: File, requested?: string): RuleAssetType {
  if (requested === "logo") return "logo"
  return file.type.startsWith("image/") ? "reference_image" : "guideline_document"
}

/** 07 · Upload brand assets — uploads through the existing rule-asset endpoint. */
export function ChatUploadAssetsDialog({
  open,
  onOpenChange,
  ruleId,
  requestedAssetType,
  onUploaded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ruleId: string
  requestedAssetType?: string
  onUploaded?: (fileNames: string[]) => void
}) {
  const { t } = useTranslation("chat")
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadRuleAssetMutation()
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)

  function add(list: FileList | null) {
    if (!list) return
    setFiles((prev) => [...prev, ...Array.from(list)])
  }

  async function submit() {
    try {
      await Promise.all(
        files.map((file) =>
          upload.mutateAsync({ ruleId, file, type: inferAssetType(file, requestedAssetType) }),
        ),
      )
      onUploaded?.(files.map((f) => f.name))
      setFiles([])
      onOpenChange(false)
    } catch {
      // mutation already toasts
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-md")}>
        <ChatDialogHeading
          icon={Upload}
          tone="navy"
          title={<DialogTitle className="text-[15px] font-semibold">{t("dialogs.upload.title")}</DialogTitle>}
          subtitle={<DialogDescription className="text-xs">{t("dialogs.upload.subtitle")}</DialogDescription>}
        />
        <ChatDialogBody>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              add(e.dataTransfer.files)
            }}
            className={cn(
              "w-full rounded-xl border border-dashed px-4 py-6 text-center text-xs",
              dragging ? "border-teal-400 bg-teal-50 dark:bg-teal-400/10" : "border-canvas-300 dark:border-white/14 bg-canvas-100 dark:bg-navy-800",
            )}
          >
            <span className="block font-semibold">{t("dialogs.upload.drop")}</span>
            <span className="text-canvas-600 dark:text-navy-200">{t("dialogs.upload.types")}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept={ACCEPT}
            onChange={(e) => {
              add(e.target.files)
              e.target.value = ""
            }}
          />
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="flex items-center gap-2 text-xs">
              <FileImage className="size-4 text-navy-500 dark:text-navy-200" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button
                type="button"
                aria-label={t("dialogs.actions.remove")}
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {upload.isPending ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-canvas-200 dark:bg-white/8">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-teal-400" />
            </div>
          ) : null}
        </ChatDialogBody>
        <ChatDialogFooter>
          <DialogClose render={<Button variant="outline" className={chatDialogButton.secondary} />}>
            {t("dialogs.actions.cancel")}
          </DialogClose>
          <Button
            className={chatDialogButton.primary}
            disabled={files.length === 0 || upload.isPending}
            onClick={() => void submit()}
          >
            {t("dialogs.upload.submit", { count: files.length })}
          </Button>
        </ChatDialogFooter>
      </DialogContent>
    </Dialog>
  )
}
