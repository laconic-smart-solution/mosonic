import { useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { WorkflowVideoPresenterSettings } from "@/features/workflow/components/workflow-video-presenter-settings"
import i18n from "@/i18n"
import { cn } from "@/lib/utils"

const fo = (key: string) => i18n.t(`workflow:fields.options.${key}`)
const fl = (node: string, field: string) =>
  i18n.t(`workflow:fields.${node}.${field}.label`)
const fp = (node: string, field: string) =>
  i18n.t(`workflow:fields.${node}.${field}.placeholder`, { defaultValue: "" })

type FieldOption = { label: string; value: string }

type VisibleWhen = { key: string; value: string }

type ConfigFieldSelect = {
  key: string
  label: string
  control: "select"
  options: FieldOption[]
  defaultValue: string
  visibleWhen?: VisibleWhen
}

type ConfigFieldButtons = {
  key: string
  label: string
  control: "buttons"
  options: FieldOption[]
  defaultValue: string
  /** When true, stores option values as numbers (e.g. video duration seconds). */
  valueAsNumber?: boolean
  visibleWhen?: VisibleWhen
}

type ConfigFieldToggle = {
  key: string
  label: string
  control: "toggle"
  defaultValue: boolean
  visibleWhen?: VisibleWhen
}

type ConfigFieldTextarea = {
  key: string
  label: string
  control: "textarea"
  defaultValue: string
  rows?: number
  placeholder?: string
  visibleWhen?: VisibleWhen
}

export type ConfigField =
  | ConfigFieldSelect
  | ConfigFieldButtons
  | ConfigFieldToggle
  | ConfigFieldTextarea

export function getWorkflowNodeFieldDefs(): Record<string, ConfigField[]> {
  return {
  text: [
    {
      key: "outputFormat",
      label: fl("text", "outputFormat"),
      control: "select",
      options: [
        { label: fo("paragraph"), value: "paragraph" },
        { label: fo("bullets"), value: "bullets" },
        { label: fo("caption"), value: "caption" },
      ],
      defaultValue: "paragraph",
    },
    {
      key: "tone",
      label: fl("text", "tone"),
      control: "select",
      options: [
        { label: fo("professional"), value: "professional" },
        { label: fo("casual"), value: "casual" },
        { label: fo("friendly"), value: "friendly" },
        { label: fo("formal"), value: "formal" },
        { label: fo("witty"), value: "witty" },
      ],
      defaultValue: "professional",
    },
    {
      key: "textLength",
      label: fl("text", "textLength"),
      control: "buttons",
      options: [
        { label: fo("short"), value: "short" },
        { label: fo("medium"), value: "medium" },
        { label: fo("long"), value: "long" },
      ],
      defaultValue: "medium",
    },
  ],
  image: [
    {
      key: "style",
      label: fl("image", "style"),
      control: "buttons",
      options: [
        { label: fo("natural"), value: "natural" },
        { label: fo("vivid"), value: "vivid" },
      ],
      defaultValue: "natural",
    },
    {
      key: "aspectRatio",
      label: fl("image", "aspectRatio"),
      control: "buttons",
      options: [
        { label: "1:1", value: "1:1" },
        { label: "4:5", value: "4:5" },
        { label: "16:9", value: "16:9" },
        { label: "9:16", value: "9:16" },
      ],
      defaultValue: "1:1",
    },
    {
      key: "quality",
      label: fl("image", "quality"),
      control: "buttons",
      options: [
        { label: fo("standard"), value: "standard" },
        { label: fo("hd"), value: "hd" },
      ],
      defaultValue: "standard",
    },
    {
      key: "negativePrompt",
      label: fl("image", "negativePrompt"),
      control: "textarea",
      defaultValue: "",
      rows: 3,
      placeholder: fp("image", "negativePrompt"),
    },
  ],
  video: [
    {
      key: "mode",
      label: fl("video", "mode"),
      control: "buttons",
      options: [
        { label: fo("cinematic"), value: "cinematic" },
        { label: fo("presenter"), value: "presenter" },
      ],
      defaultValue: "cinematic",
    },
    {
      key: "aspectRatio",
      label: fl("video", "aspectRatio"),
      control: "buttons",
      options: [
        { label: "16:9", value: "16:9" },
        { label: "9:16", value: "9:16" },
      ],
      defaultValue: "16:9",
      visibleWhen: { key: "mode", value: "cinematic" },
    },
    {
      key: "duration",
      label: fl("video", "duration"),
      control: "buttons",
      valueAsNumber: true,
      options: [
        { label: fo("duration4s"), value: "4" },
        { label: fo("duration8s"), value: "8" },
        { label: fo("duration12s"), value: "12" },
        { label: fo("duration16s"), value: "16" },
        { label: fo("duration20s"), value: "20" },
      ],
      defaultValue: "8",
      visibleWhen: { key: "mode", value: "cinematic" },
    },
    {
      key: "resolution",
      label: fl("video", "resolution"),
      control: "select",
      options: [{ label: fo("resolution720p"), value: "720p" }],
      defaultValue: "720p",
      visibleWhen: { key: "mode", value: "cinematic" },
    },
    {
      key: "negativePrompt",
      label: fl("video", "negativePrompt"),
      control: "textarea",
      defaultValue: "",
      rows: 3,
      placeholder: fp("video", "negativePrompt"),
      visibleWhen: { key: "mode", value: "cinematic" },
    },
    {
      key: "duration",
      label: fl("video", "targetDuration"),
      control: "buttons",
      valueAsNumber: true,
      options: [
        { label: fo("duration4s"), value: "4" },
        { label: fo("duration8s"), value: "8" },
        { label: fo("duration12s"), value: "12" },
        { label: fo("duration16s"), value: "16" },
        { label: fo("duration20s"), value: "20" },
      ],
      defaultValue: "8",
      visibleWhen: { key: "mode", value: "presenter" },
    },
    {
      key: "heygenOrientation",
      label: fl("video", "heygenOrientation"),
      control: "buttons",
      options: [
        { label: fo("landscape169"), value: "landscape" },
        { label: fo("portrait916"), value: "portrait" },
      ],
      defaultValue: "landscape",
      visibleWhen: { key: "mode", value: "presenter" },
    },
    {
      key: "heygenExpressiveness",
      label: fl("video", "heygenExpressiveness"),
      control: "buttons",
      options: [
        { label: fo("low"), value: "low" },
        { label: fo("medium"), value: "medium" },
        { label: fo("high"), value: "high" },
      ],
      defaultValue: "medium",
      visibleWhen: { key: "mode", value: "presenter" },
    },
    {
      key: "removeBackground",
      label: fl("video", "removeBackground"),
      control: "toggle",
      defaultValue: true,
      visibleWhen: { key: "mode", value: "presenter" },
    },
  ],
  translation: [
    {
      key: "sourceLanguage",
      label: fl("translation", "sourceLanguage"),
      control: "select",
      options: [
        { label: fo("autoDetect"), value: "auto" },
        { label: fo("english"), value: "en" },
        { label: fo("thai"), value: "th" },
        { label: fo("japanese"), value: "ja" },
        { label: fo("chinese"), value: "zh" },
        { label: fo("korean"), value: "ko" },
        { label: fo("spanish"), value: "es" },
        { label: fo("french"), value: "fr" },
        { label: fo("german"), value: "de" },
      ],
      defaultValue: "auto",
    },
    {
      key: "targetLanguage",
      label: fl("translation", "targetLanguage"),
      control: "select",
      options: [
        { label: fo("thai"), value: "th" },
        { label: fo("english"), value: "en" },
        { label: fo("japanese"), value: "ja" },
        { label: fo("chinese"), value: "zh" },
        { label: fo("korean"), value: "ko" },
        { label: fo("spanish"), value: "es" },
        { label: fo("french"), value: "fr" },
        { label: fo("german"), value: "de" },
      ],
      defaultValue: "th",
    },
    {
      key: "formalityLevel",
      label: fl("translation", "formalityLevel"),
      control: "buttons",
      options: [
        { label: fo("formal"), value: "formal" },
        { label: fo("casual"), value: "casual" },
      ],
      defaultValue: "casual",
    },
    {
      key: "preserveFormatting",
      label: fl("translation", "preserveFormatting"),
      control: "toggle",
      defaultValue: true,
    },
  ],
  transcription: [
    {
      key: "language",
      label: fl("transcription", "language"),
      control: "select",
      options: [
        { label: fo("auto"), value: "auto" },
        { label: fo("thai"), value: "th" },
        { label: fo("english"), value: "en" },
      ],
      defaultValue: "auto",
    },
  ],
  summarization: [
    {
      key: "summaryLength",
      label: fl("summarization", "summaryLength"),
      control: "buttons",
      options: [
        { label: fo("short"), value: "short" },
        { label: fo("medium"), value: "medium" },
        { label: fo("long"), value: "long" },
      ],
      defaultValue: "medium",
    },
    {
      key: "outputFormat",
      label: fl("summarization", "outputFormat"),
      control: "select",
      options: [
        { label: fo("paragraph"), value: "paragraph" },
        { label: fo("bullets"), value: "bullets" },
        { label: fo("tldr"), value: "tldr" },
      ],
      defaultValue: "paragraph",
    },
  ],
  intelligence: [
    {
      key: "searchType",
      label: fl("intelligence", "searchType"),
      control: "select",
      options: [
        { label: fo("searchAll"), value: "all" },
        { label: fo("searchTrend"), value: "trend" },
        { label: fo("searchMarket"), value: "market" },
        { label: fo("searchCompetitor"), value: "competitor" },
        { label: fo("searchCustom"), value: "custom" },
      ],
      defaultValue: "all",
    },
    {
      key: "customPrompt",
      label: fl("intelligence", "customPrompt"),
      control: "textarea",
      defaultValue: "",
      rows: 4,
      placeholder: fp("intelligence", "customPrompt"),
      visibleWhen: { key: "searchType", value: "custom" },
    },
  ],
  branch: [],
  }
}

/** Locale-aware field definitions; refreshed when language changes via getWorkflowNodeFieldDefs(). */
export const WORKFLOW_NODE_FIELD_DEFS = getWorkflowNodeFieldDefs()

export type WorkflowNodeConfigFieldsProps = {
  canvasType: string
  config: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  compact?: boolean
  className?: string
  /** Required for presenter avatar/background uploads (workflow editor). */
  workflowId?: string
  nodeId?: string
  /** When false, presenter assets update local config only (Generate more draft). */
  persistPresenterToServer?: boolean
}

function ConfigFieldShell({
  label,
  children,
  layout = "stacked",
}: {
  label: string
  children: ReactNode
  layout?: "stacked" | "inline"
}) {
  if (layout === "inline") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-2.5">
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        {children}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function configControlClass(compact: boolean) {
  return cn(compact ? "text-xs" : "text-sm")
}

function filterVisibleFields(
  fields: ReturnType<typeof getWorkflowNodeFieldDefs>[string],
  canvasType: string,
  config: Record<string, unknown>,
  mode: string,
) {
  return (fields ?? []).filter((field) => {
    if (!field.visibleWhen) return true
    const current =
      field.visibleWhen.key === "mode" && canvasType === "video"
        ? mode
        : String(config[field.visibleWhen.key] ?? "")
    return current === field.visibleWhen.value
  })
}

function renderConfigField(
  field: ConfigField,
  config: Record<string, unknown>,
  compact: boolean,
  triggerClass: string,
  setConfigValue: (key: string, value: unknown) => void,
  updateConfig: (key: string, value: string) => void,
) {
  if (field.control === "toggle") {
    const on = Boolean(config[field.key] ?? field.defaultValue)
    return (
      <ConfigFieldShell key={field.key} label={field.label} layout="inline">
        <Switch
          checked={on}
          onCheckedChange={(checked) => setConfigValue(field.key, checked)}
          size={compact ? "sm" : "default"}
          aria-label={field.label}
        />
      </ConfigFieldShell>
    )
  }

  if (field.control === "textarea") {
    const val = String(config[field.key] ?? field.defaultValue ?? "")
    return (
      <ConfigFieldShell key={field.key} label={field.label}>
        <Textarea
          value={val}
          onChange={(e) => setConfigValue(field.key, e.target.value)}
          rows={field.rows ?? 3}
          className={cn(
            "min-h-[72px] resize-y bg-background leading-relaxed",
            configControlClass(compact),
          )}
          placeholder={field.placeholder}
        />
      </ConfigFieldShell>
    )
  }

  const current = String(config[field.key] ?? field.defaultValue)
  if (field.control === "buttons") {
    return (
      <ConfigFieldShell key={field.key} label={field.label}>
        <ToggleGroup
          value={current ? [current] : []}
          onValueChange={(values) => {
            const next = values[0]
            if (!next) return
            if ("valueAsNumber" in field && field.valueAsNumber) {
              setConfigValue(field.key, Number(next))
              return
            }
            updateConfig(field.key, next)
          }}
          variant="outline"
          spacing={0}
          size={compact ? "sm" : "default"}
          className="flex w-full flex-wrap"
        >
          {field.options.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className={cn("min-w-0 flex-1 px-2", configControlClass(compact))}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </ConfigFieldShell>
    )
  }

  const selectedLabel =
    field.options.find((option) => option.value === current)?.label ?? current

  return (
    <ConfigFieldShell key={field.key} label={field.label}>
      <Select
        value={current}
        onValueChange={(value) => {
          if (value) updateConfig(field.key, value)
        }}
      >
        <SelectTrigger className={triggerClass} size={compact ? "sm" : "default"}>
          <SelectValue>{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ConfigFieldShell>
  )
}

export function WorkflowNodeConfigFields({
  canvasType,
  config,
  onChange,
  compact = false,
  className,
  workflowId,
  nodeId,
  persistPresenterToServer = true,
}: WorkflowNodeConfigFieldsProps) {
  const { i18n: i18nInstance } = useTranslation("workflow")
  const fieldDefs = useMemo(
    () => getWorkflowNodeFieldDefs(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh labels on locale change
    [i18nInstance.language],
  )

  const mode =
    canvasType === "video"
      ? String(config.mode ?? "cinematic")
      : ""

  const allFields = fieldDefs[canvasType] ?? []
  const visibleFields = filterVisibleFields(allFields, canvasType, config, mode)
  const modeField =
    canvasType === "video"
      ? visibleFields.find((field) => field.key === "mode")
      : undefined
  const configFields = visibleFields.filter((field) => field.key !== "mode")

  function patchConfig(patch: Record<string, unknown>) {
    onChange({ ...config, ...patch })
  }

  function updateConfig(key: string, value: string) {
    patchConfig({ [key]: value })
  }

  function setConfigValue(key: string, value: unknown) {
    patchConfig({ [key]: value })
  }

  const triggerClass = cn(
    "w-full bg-background",
    compact ? "h-8 text-xs" : "h-9",
  )

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {modeField
        ? renderConfigField(
            modeField,
            config,
            compact,
            triggerClass,
            setConfigValue,
            updateConfig,
          )
        : null}
      {canvasType === "video" && mode === "presenter" && nodeId ? (
        <WorkflowVideoPresenterSettings
          workflowId={workflowId}
          nodeId={nodeId}
          config={config}
          onPatch={(patch) => patchConfig(patch)}
          compact={compact}
          persistToServer={persistPresenterToServer}
        />
      ) : null}
      {configFields.map((field) =>
        renderConfigField(
          field,
          config,
          compact,
          triggerClass,
          setConfigValue,
          updateConfig,
        ),
      )}
    </div>
  )
}
