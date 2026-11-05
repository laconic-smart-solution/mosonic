import { useTranslation } from "react-i18next"
import { Paperclip } from "lucide-react"

import type { ChatAttachment } from "../lib/chat-attachments"

/** Image thumbnails (or a small file chip) for files attached to a user message. */
export function ChatAttachmentThumbs({ attachments }: { attachments: ChatAttachment[] }) {
  const { t } = useTranslation("chat")
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {attachments.map((a) =>
        a.url && a.type !== "guideline_document" ? (
          <img
            key={a.id}
            src={a.url}
            alt={t("composer.attachedImage")}
            className="size-24 rounded-xl border border-canvas-200 dark:border-white/8 object-cover"
            loading="lazy"
          />
        ) : (
          <span
            key={a.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-canvas-300 dark:border-white/14 bg-white dark:bg-navy-700 px-2.5 py-1 text-xs text-navy-700 dark:text-[#E8EDF6]"
          >
            <Paperclip className="size-3.5" aria-hidden />
            {t("composer.attachedFile")}
          </span>
        ),
      )}
    </div>
  )
}
