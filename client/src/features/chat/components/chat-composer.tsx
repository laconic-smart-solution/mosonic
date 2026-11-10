import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type { Attachment } from "@/components/core/prompt-area"
import { PromptArea } from "@/components/core/prompt-area"
import { Spinner } from "@/components/ui/spinner"
import { useUploadRuleAssetMutation } from "@/shared/queries/rule-asset.query"
import type { RuleAssetType } from "@/shared/services/rule-asset.service"
import { formatAttachmentMarker } from "../lib/chat-attachments"

type ChatComposerProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: (text: string) => void
  disabled?: boolean
  /** A reply is in progress for this chat — show the locked "Still answering…" state. */
  busy?: boolean
  /** Files attach as brand assets on this Rule — null while the chat is still ruleless. */
  ruleId: string | null
  /**
   * When the chat has no brand yet, bootstrap one from attached files (extract + bind)
   * and return the new ruleId so assets can be uploaded before the message is sent.
   */
  onBootstrapFromFiles?: (files: File[], text: string) => Promise<string>
}

function inferAssetType(file: File, allFiles: File[]): RuleAssetType {
  if (!file.type.startsWith("image/")) return "guideline_document"
  const isNamedLogo = /logo/i.test(file.name)
  const isFirstImage = allFiles.find((f) => f.type.startsWith("image/")) === file
  return isNamedLogo || isFirstImage ? "logo" : "reference_image"
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled = false,
  busy = false,
  ruleId,
  onBootstrapFromFiles,
}: ChatComposerProps) {
  const { t } = useTranslation("chat")
  const uploadAssetMutation = useUploadRuleAssetMutation()

  async function handleSubmit(text: string, attachments: Attachment[]) {
    const urls = attachments
      .filter((a) => a.type === "url" && typeof a.data === "string")
      .map((a) => a.data as string)
    const fileAttachments = attachments.filter(
      (a) => a.type === "file" && a.data instanceof File,
    )
    const files = fileAttachments.map((a) => a.data as File)

    let effectiveRuleId = ruleId
    let uploaded: { ruleAssetId: string; type: string; fileUrl: string }[] = []

    if (files.length > 0) {
      if (!effectiveRuleId) {
        if (!onBootstrapFromFiles) {
          toast.error(t("composer.uploadNeedsRule"))
          return
        }
        try {
          effectiveRuleId = await onBootstrapFromFiles(files, text)
        } catch {
          // Caller / mutation toasts the extract or bind failure.
          return
        }
      }
      try {
        uploaded = await Promise.all(
          files.map((file) =>
            uploadAssetMutation.mutateAsync({
              ruleId: effectiveRuleId as string,
              file,
              type: inferAssetType(file, files),
            }),
          ),
        )
      } catch {
        return
      }
    }

    // Saved assets travel as markers: the AI knows they're stored, the bubble shows thumbnails.
    const fileNote = uploaded
      .map((asset) => formatAttachmentMarker(asset.type, asset.ruleAssetId, asset.fileUrl))
      .join("\n")
    const combined = [text.trim(), ...urls, fileNote].filter(Boolean).join("\n")
    if (!combined) return
    onSubmit(combined)
  }

  if (busy) {
    // The backend can't cancel a turn yet (no cancel endpoint), so this is a disabled state, not Stop.
    return (
      <div className="border-t border-border bg-background px-4 py-3">
        <div
          className="flex items-center gap-3 rounded-2xl border border-canvas-300 dark:border-white/14 bg-canvas-100/60 dark:bg-navy-800 px-4 py-3"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {value.trim() || t("composer.stillAnswering")}
          </p>
          <span className="text-xs text-muted-foreground">{t("composer.stillAnswering")}</span>
          <button
            type="button"
            disabled
            aria-label={t("composer.stillAnswering")}
            className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-navy-700 dark:bg-teal-400 text-white dark:text-navy-700 opacity-80"
          >
            <Spinner className="size-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-border bg-background px-4 py-3">
      <PromptArea
        value={value}
        onChange={onChange}
        onSubmit={(text, attachments) => void handleSubmit(text, attachments)}
        placeholder={t("composer.placeholder")}
        enableFiles
        acceptFileTypes=".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.txt,.md"
        disabled={disabled}
        className="shadow-none"
      />
    </div>
  )
}
