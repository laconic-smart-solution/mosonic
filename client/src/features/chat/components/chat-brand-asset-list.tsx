import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { FileText } from "lucide-react"

import { FileServiceImage } from "@/features/upload/components/upload-display-media"
import { retryErroredFileObjectUrls } from "@/shared/lib/file-object-url-cache"
import { useRuleAssetsQuery } from "@/shared/queries/rule-asset.query"

export function ChatBrandAssetList({ ruleId }: { ruleId: string }) {
  const { t } = useTranslation("chat")
  const assetsQuery = useRuleAssetsQuery(ruleId)
  // A refetch of the list retries any thumbnail whose earlier load failed.
  useEffect(() => {
    if (assetsQuery.dataUpdatedAt) retryErroredFileObjectUrls()
  }, [assetsQuery.dataUpdatedAt])
  const assets = (assetsQuery.data ?? []).filter((a) => a.status === "ready")

  const images = assets.filter((a) => a.type === "logo" || a.type === "reference_image")
  const documents = assets.filter((a) => a.type === "guideline_document")

  if (!assetsQuery.isLoading && assets.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("brandPanel.noAssets")}</p>
  }

  return (
    <div className="space-y-3">
      {images.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {images.map((asset) => (
            <div
              key={asset.ruleAssetId}
              title={asset.originalFileName}
              className="aspect-square overflow-hidden rounded-lg border border-border/60 bg-background"
            >
              <FileServiceImage url={asset.fileUrl} className="size-full object-cover" />
            </div>
          ))}
        </div>
      ) : null}

      {documents.length > 0 ? (
        <div className="space-y-1">
          {documents.map((asset) => (
            <div
              key={asset.ruleAssetId}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2 py-1.5"
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <p className="truncate text-[11px] text-foreground">{asset.originalFileName}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
