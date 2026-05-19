import { toast } from "sonner"

import type { BulkDeleteResult, DeletePostResult } from "@/shared/types/post.type"

export function toastDeletePostResult(result: DeletePostResult): void {
  if (result.skipped.length > 0) {
    toast.warning(result.message, {
      description: `Unpublish not supported for: ${result.skipped.join(", ")}`,
    })
    return
  }
  toast.success(result.message)
}

export function toastBulkDeleteResult(result: BulkDeleteResult): void {
  const skippedEntries = Object.entries(result.skipped)
  let description = `Succeeded ${result.succeeded}, failed ${result.failed} of ${result.total}`
  if (skippedEntries.length > 0) {
    const parts = skippedEntries.map(
      ([id, platforms]) =>
        `${id.slice(0, 8)}… (${platforms.join(", ")})`,
    )
    description += `. Skipped platforms: ${parts.join("; ")}`
  }
  toast.message("Bulk delete", { description })
}
