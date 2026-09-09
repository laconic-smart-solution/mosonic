import { useTranslation } from "react-i18next"
import { Sparkles } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { T } from "@/lib/tokens"
import { FileServiceImage } from "@/features/upload/components/upload-display-media"
import {
  useImageDesignStylesQuery,
  useImageTemplatesQuery,
} from "@/shared/queries/image-node-options.query"
import type {
  ImageDesignStyleOption,
  ImageTemplateOption,
} from "@/shared/services/image-node-options.service"

type PickerOption = { key: string; name: string; imageUrl?: string | null }

type WorkflowImageTemplateStylePickerProps = {
  config: Record<string, unknown>
  onPatch: (patch: Record<string, unknown>) => void
  compact?: boolean
}

function OptionCard({
  option,
  selected,
  onSelect,
  compact,
}: {
  option: PickerOption
  selected: boolean
  onSelect: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex flex-col items-center gap-1 overflow-hidden rounded-lg border border-border bg-muted/30 p-2 text-left transition-colors hover:border-teal-400",
        selected && "ring-2 ring-teal-500",
      )}
    >
      {option.imageUrl ? (
        <div className="relative aspect-square w-full overflow-hidden rounded">
          <FileServiceImage
            url={option.imageUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loadingClassName="absolute inset-0 flex size-full items-center justify-center bg-muted/30 text-[9px] text-muted-foreground"
          />
        </div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded bg-muted text-muted-foreground">
          <Sparkles className={compact ? "size-4" : "size-5"} />
        </div>
      )}
      <span className="line-clamp-2 w-full text-center text-[10px] font-medium text-foreground">
        {option.name}
      </span>
    </button>
  )
}

function PickerSection({
  heading,
  autoLabel,
  selectedKey,
  options,
  isLoading,
  isError,
  loadingLabel,
  errorLabel,
  emptyLabel,
  onSelect,
  compact,
}: {
  heading: string
  autoLabel: string
  selectedKey: string
  options: PickerOption[]
  isLoading: boolean
  isError: boolean
  loadingLabel: string
  errorLabel: string
  emptyLabel: string
  onSelect: (key: string) => void
  compact?: boolean
}) {
  return (
    <div>
      <p
        className={cn("mb-1.5 block font-bold", compact ? "text-[10px]" : "text-[11px]")}
        style={{ color: T.textPrimary }}
      >
        {heading}
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
          <Spinner className="size-3" />
          {loadingLabel}
        </div>
      ) : isError ? (
        <p className="text-[11px] text-red-600">{errorLabel}</p>
      ) : options.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <OptionCard
            option={{ key: "auto", name: autoLabel }}
            selected={!selectedKey || selectedKey === "auto"}
            onSelect={() => onSelect("auto")}
            compact={compact}
          />
          {options.map((option) => (
            <OptionCard
              key={option.key}
              option={option}
              selected={selectedKey === option.key}
              onSelect={() => onSelect(option.key)}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Manual template/style picker for the image_generation node config, shown
 * on both the workflow canvas and the content page's "Generate more" panel
 * (both render through WorkflowNodeConfigFields). Values are plain config
 * fields like aspectRatio/quality — no server sync needed here.
 */
export function WorkflowImageTemplateStylePicker({
  config,
  onPatch,
  compact = false,
}: WorkflowImageTemplateStylePickerProps) {
  const { t } = useTranslation("workflow")
  const templatesQuery = useImageTemplatesQuery()
  const stylesQuery = useImageDesignStylesQuery()

  const selectedTemplate = String(config.template ?? "auto")
  const selectedDesignStyle = String(config.designStyle ?? "auto")

  const templates: ImageTemplateOption[] = templatesQuery.data ?? []
  const styles: ImageDesignStyleOption[] = stylesQuery.data ?? []

  return (
    <div className="flex flex-col gap-3">
      <PickerSection
        heading={t("fields.image.template.label")}
        autoLabel={t("fields.options.auto")}
        selectedKey={selectedTemplate}
        options={templates}
        isLoading={templatesQuery.isLoading}
        isError={templatesQuery.isError}
        loadingLabel={t("imageTemplateStylePicker.loadingTemplates")}
        errorLabel={t("imageTemplateStylePicker.loadTemplatesFailed")}
        emptyLabel={t("imageTemplateStylePicker.noTemplates")}
        onSelect={(key) => onPatch({ template: key })}
        compact={compact}
      />

      <PickerSection
        heading={t("fields.image.designStyle.label")}
        autoLabel={t("fields.options.auto")}
        selectedKey={selectedDesignStyle}
        options={styles}
        isLoading={stylesQuery.isLoading}
        isError={stylesQuery.isError}
        loadingLabel={t("imageTemplateStylePicker.loadingStyles")}
        errorLabel={t("imageTemplateStylePicker.loadStylesFailed")}
        emptyLabel={t("imageTemplateStylePicker.noStyles")}
        onSelect={(key) => onPatch({ designStyle: key })}
        compact={compact}
      />
    </div>
  )
}
