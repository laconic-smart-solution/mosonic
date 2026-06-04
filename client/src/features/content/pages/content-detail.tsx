import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Navigate, useParams } from "react-router-dom"

import { Spinner } from "@/components/ui/spinner"
import { contentService } from "@/shared/services/content.service"
import { uploadService } from "@/shared/services/upload.service"

/**
 * Legacy `/content/:contentId` URLs redirect to the unified upload workspace.
 */
export default function ContentDetailRedirectPage() {
  const { t } = useTranslation("content")
  const { contentId } = useParams<{ contentId: string }>()
  const [to, setTo] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!contentId) return
    let cancelled = false
    void (async () => {
      try {
        const { uploadId } = await uploadService.findIdByContentRef(contentId)
        if (!cancelled) setTo(`/upload/${uploadId}`)
      } catch {
        try {
          const { uploadId } = await contentService.ensureUpload(contentId)
          if (!cancelled) setTo(`/upload/${uploadId}`)
        } catch {
          if (!cancelled) setFailed(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [contentId])

  if (!contentId || failed) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t("redirect.openFailed")}
      </div>
    )
  }
  if (!to) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        {t("redirect.opening")}
      </div>
    )
  }
  return <Navigate to={to} replace />
}
