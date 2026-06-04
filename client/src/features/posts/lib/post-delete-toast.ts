import { toast } from "sonner"
import i18n from "@/i18n"
import type { BulkDeleteResult } from "@/shared/types/post.type"

export function toastDeleteResult(result: { message: string; skipped?: string[] }) {
  if (result.skipped?.length) {
    toast.warning(result.message, {
      description: i18n.t("posts:toast.skippedDescription", {
        channels: result.skipped.join(", "),
      }),
    })
    return
  }
  toast.success(result.message)
}

export function toastBulkDeleteResult(result: BulkDeleteResult) {
  let description = i18n.t("posts:bulk.deleteDescription", {
    succeeded: result.succeeded,
    failed: result.failed,
    total: result.total,
    skipped: "",
  })
  const skippedEntries = Object.entries(result.skipped ?? {})
  if (skippedEntries.length > 0) {
    const channels = skippedEntries
      .flatMap(([postId, platforms]) =>
        platforms.map((p) => `${postId}:${p}`),
      )
      .join(", ")
    description += i18n.t("posts:bulk.skippedUnpublish", { channels })
  }
  toast.message(i18n.t("posts:bulk.deleteTitle"), { description })
}
