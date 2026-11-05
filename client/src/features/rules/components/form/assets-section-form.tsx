import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { FileText, Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FileServiceImage } from "@/features/upload/components/upload-display-media"
import {
  useDeleteRuleAssetMutation,
  useRuleAssetsQuery,
  useUploadRuleAssetMutation,
} from "@/shared/queries/rule-asset.query"
import type { RuleAsset, RuleAssetType } from "@/shared/services/rule-asset.service"
import { RuleChip, type RuleChipTone } from "../rule-chip"
import { FormSection, FullRow } from "./rule-form-helpers"

const ASSET_TYPES: RuleAssetType[] = ["logo", "reference_image", "guideline_document"]

function statusToChipTone(status: RuleAsset["status"]): RuleChipTone {
  if (status === "ready") return "green"
  if (status === "failed") return "amber"
  return "gray"
}

function AssetUploadButton({
  ruleId,
  type,
  label,
}: {
  ruleId: string
  type: RuleAssetType
  label: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadMutation = useUploadRuleAssetMutation()

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={type === "guideline_document" ? "application/pdf" : "image/*"}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (!file) return
          uploadMutation.mutate({ ruleId, file, type })
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploadMutation.isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload data-icon="inline-start" />
        {label}
      </Button>
    </>
  )
}

function AssetRow({ ruleId, asset }: { ruleId: string; asset: RuleAsset }) {
  const { t } = useTranslation("rules")
  const deleteMutation = useDeleteRuleAssetMutation()
  const isImage = asset.type === "logo" || asset.type === "reference_image"

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-2.5">
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background">
        {isImage ? (
          <FileServiceImage url={asset.fileUrl} className="size-10 object-cover" />
        ) : (
          <FileText className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{asset.originalFileName}</p>
        <p className="text-[11px] text-muted-foreground">
          {t(`assets.type.${asset.type}`)}
        </p>
      </div>
      <RuleChip
        label={t(`assets.status.${asset.status}`)}
        color={statusToChipTone(asset.status)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("assets.deleteAction")}
        disabled={deleteMutation.isPending}
        onClick={() =>
          deleteMutation.mutate({ ruleId, ruleAssetId: asset.ruleAssetId })
        }
      >
        <Trash2 className="text-destructive" />
      </Button>
    </div>
  )
}

export function AssetsSectionForm({ ruleId }: { ruleId: string }) {
  const { t } = useTranslation("rules")
  const assetsQuery = useRuleAssetsQuery(ruleId)
  const assets = assetsQuery.data ?? []

  return (
    <FormSection
      id="detail-assets"
      title={t("form.assets.title")}
      subtitle={t("form.assets.subtitle")}
    >
      <FullRow>
        <div className="flex flex-wrap gap-2">
          {ASSET_TYPES.map((type) => (
            <AssetUploadButton
              key={type}
              ruleId={ruleId}
              type={type}
              label={t(`assets.upload.${type}`)}
            />
          ))}
        </div>
      </FullRow>
      <FullRow>
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("form.assets.empty")}</p>
        ) : (
          <div className="space-y-2">
            {assets.map((asset) => (
              <AssetRow key={asset.ruleAssetId} ruleId={ruleId} asset={asset} />
            ))}
          </div>
        )}
      </FullRow>
    </FormSection>
  )
}
