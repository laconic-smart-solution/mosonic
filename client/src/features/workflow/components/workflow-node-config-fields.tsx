import { Textarea } from "@/components/ui/textarea"
import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"

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

export const WORKFLOW_NODE_FIELD_DEFS: Record<string, ConfigField[]> = {
  text: [
    {
      key: "outputFormat",
      label: "Output Format",
      control: "select",
      options: [
        { label: "Paragraph", value: "paragraph" },
        { label: "Bullets", value: "bullets" },
        { label: "Caption", value: "caption" },
      ],
      defaultValue: "paragraph",
    },
    {
      key: "tone",
      label: "Writing tone",
      control: "select",
      options: [
        { label: "Professional", value: "professional" },
        { label: "Casual", value: "casual" },
        { label: "Friendly", value: "friendly" },
        { label: "Formal", value: "formal" },
        { label: "Witty", value: "witty" },
      ],
      defaultValue: "professional",
    },
    {
      key: "textLength",
      label: "Length",
      control: "buttons",
      options: [
        { label: "Short", value: "short" },
        { label: "Medium", value: "medium" },
        { label: "Long", value: "long" },
      ],
      defaultValue: "medium",
    },
  ],
  image: [
    {
      key: "style",
      label: "Style",
      control: "buttons",
      options: [
        { label: "Natural", value: "natural" },
        { label: "Vivid", value: "vivid" },
      ],
      defaultValue: "natural",
    },
    {
      key: "aspectRatio",
      label: "Aspect Ratio",
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
      label: "Quality",
      control: "buttons",
      options: [
        { label: "Standard", value: "standard" },
        { label: "HD", value: "hd" },
      ],
      defaultValue: "standard",
    },
    {
      key: "negativePrompt",
      label: "Negative prompt",
      control: "textarea",
      defaultValue: "",
      rows: 3,
      placeholder: "Optional — things to avoid in the image",
    },
  ],
  video: [
    {
      key: "aspectRatio",
      label: "Aspect Ratio",
      control: "buttons",
      options: [
        { label: "16:9", value: "16:9" },
        { label: "9:16", value: "9:16" },
      ],
      defaultValue: "16:9",
    },
    {
      key: "duration",
      label: "Duration",
      control: "buttons",
      valueAsNumber: true,
      options: [
        { label: "4s", value: "4" },
        { label: "8s", value: "8" },
        { label: "12s", value: "12" },
        { label: "16s", value: "16" },
        { label: "20s", value: "20" },
      ],
      defaultValue: "8",
    },
    {
      key: "resolution",
      label: "Resolution",
      control: "select",
      options: [{ label: "720p (Sora 2)", value: "720p" }],
      defaultValue: "720p",
    },
    {
      key: "negativePrompt",
      label: "Negative prompt",
      control: "textarea",
      defaultValue: "",
      rows: 3,
      placeholder: "Optional — extra things to avoid in the video",
    },
  ],
  translation: [
    {
      key: "sourceLanguage",
      label: "Source Language",
      control: "select",
      options: [
        { label: "Auto-detect", value: "auto" },
        { label: "English", value: "en" },
        { label: "Thai", value: "th" },
        { label: "Japanese", value: "ja" },
        { label: "Chinese", value: "zh" },
        { label: "Korean", value: "ko" },
        { label: "Spanish", value: "es" },
        { label: "French", value: "fr" },
        { label: "German", value: "de" },
      ],
      defaultValue: "auto",
    },
    {
      key: "targetLanguage",
      label: "Target Language",
      control: "select",
      options: [
        { label: "Thai", value: "th" },
        { label: "English", value: "en" },
        { label: "Japanese", value: "ja" },
        { label: "Chinese", value: "zh" },
        { label: "Korean", value: "ko" },
        { label: "Spanish", value: "es" },
        { label: "French", value: "fr" },
        { label: "German", value: "de" },
      ],
      defaultValue: "th",
    },
    {
      key: "formalityLevel",
      label: "Formality",
      control: "buttons",
      options: [
        { label: "Formal", value: "formal" },
        { label: "Casual", value: "casual" },
      ],
      defaultValue: "casual",
    },
    {
      key: "preserveFormatting",
      label: "Preserve formatting",
      control: "toggle",
      defaultValue: true,
    },
  ],
  transcription: [
    {
      key: "language",
      label: "Language",
      control: "select",
      options: [
        { label: "Auto", value: "auto" },
        { label: "Thai", value: "th" },
        { label: "English", value: "en" },
      ],
      defaultValue: "auto",
    },
  ],
  summarization: [
    {
      key: "summaryLength",
      label: "Summary Length",
      control: "buttons",
      options: [
        { label: "Short", value: "short" },
        { label: "Medium", value: "medium" },
        { label: "Long", value: "long" },
      ],
      defaultValue: "medium",
    },
    {
      key: "outputFormat",
      label: "Output shape",
      control: "select",
      options: [
        { label: "Paragraph", value: "paragraph" },
        { label: "Bullets", value: "bullets" },
        { label: "TL;DR", value: "tldr" },
      ],
      defaultValue: "paragraph",
    },
  ],
  intelligence: [
    {
      key: "searchType",
      label: "Search type",
      control: "select",
      options: [
        { label: "All (trend + market + competitor)", value: "all" },
        { label: "Trend — hashtags & formats", value: "trend" },
        { label: "Market — news & signals", value: "market" },
        { label: "Competitor — gaps & angles", value: "competitor" },
        { label: "Custom — your own prompt", value: "custom" },
      ],
      defaultValue: "all",
    },
    {
      key: "customPrompt",
      label: "Custom search prompt",
      control: "textarea",
      defaultValue: "",
      rows: 4,
      placeholder: "Describe what to search for…",
      visibleWhen: { key: "searchType", value: "custom" },
    },
  ],
  branch: [
    {
      key: "mode",
      label: "Branch mode",
      control: "select",
      options: [
        { label: "Rule channels", value: "rule_channels" },
        { label: "Manual channels", value: "manual" },
        { label: "A/B test", value: "ab_test" },
      ],
      defaultValue: "rule_channels",
    },
  ],
}

export type WorkflowNodeConfigFieldsProps = {
  canvasType: string
  config: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  compact?: boolean
  className?: string
}

export function WorkflowNodeConfigFields({
  canvasType,
  config,
  onChange,
  compact = false,
  className,
}: WorkflowNodeConfigFieldsProps) {
  const configFields = (WORKFLOW_NODE_FIELD_DEFS[canvasType] ?? []).filter(
    (field) => {
      if (!field.visibleWhen) return true
      return String(config[field.visibleWhen.key] ?? "") === field.visibleWhen.value
    },
  )

  function updateConfig(key: string, value: string) {
    onChange({ ...config, [key]: value })
  }

  function setConfigValue(key: string, value: unknown) {
    onChange({ ...config, [key]: value })
  }

  const labelClass = cn(
    "mb-1.5 block font-bold",
    compact ? "text-[10px]" : "text-[11px]",
  )

  const controlClass = compact ? "text-[10px]" : "text-[11px]"

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {configFields.map((field) => {
        if (field.control === "toggle") {
          const on = Boolean(config[field.key] ?? field.defaultValue)
          return (
            <div key={field.key}>
              <label className={labelClass} style={{ color: T.textPrimary }}>
                {field.label}
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setConfigValue(field.key, true)}
                  className={cn(
                    "flex-1 cursor-pointer rounded-md border py-1",
                    controlClass,
                  )}
                  style={{
                    borderColor: on ? T.accent : T.surfaceBorder,
                    background: on ? T.accentLight : "white",
                    color: on ? T.accent : T.textSecondary,
                    fontWeight: on ? 700 : 400,
                  }}
                >
                  On
                </button>
                <button
                  type="button"
                  onClick={() => setConfigValue(field.key, false)}
                  className={cn(
                    "flex-1 cursor-pointer rounded-md border py-1",
                    controlClass,
                  )}
                  style={{
                    borderColor: !on ? T.accent : T.surfaceBorder,
                    background: !on ? T.accentLight : "white",
                    color: !on ? T.accent : T.textSecondary,
                    fontWeight: !on ? 700 : 400,
                  }}
                >
                  Off
                </button>
              </div>
            </div>
          )
        }

        if (field.control === "textarea") {
          const val = String(config[field.key] ?? field.defaultValue ?? "")
          return (
            <div key={field.key}>
              <label className={labelClass} style={{ color: T.textPrimary }}>
                {field.label}
              </label>
              <Textarea
                value={val}
                onChange={(e) => setConfigValue(field.key, e.target.value)}
                rows={field.rows ?? 3}
                className={cn(
                  "resize-y bg-[#FDFCFA] leading-relaxed",
                  compact ? "text-[11px]" : "text-xs",
                )}
                style={{ color: T.textPrimary }}
                placeholder={field.placeholder}
              />
            </div>
          )
        }

        const current = String(config[field.key] ?? field.defaultValue)
        if (field.control === "buttons") {
          return (
            <div key={field.key}>
              <label className={labelClass} style={{ color: T.textPrimary }}>
                {field.label}
              </label>
              <div className="flex flex-wrap gap-1">
                {field.options.map((option) => {
                  const active = current === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        "valueAsNumber" in field && field.valueAsNumber
                          ? setConfigValue(field.key, Number(option.value))
                          : updateConfig(field.key, option.value)
                      }
                      className={cn(
                        "min-w-13 flex-1 cursor-pointer rounded-md border py-1",
                        controlClass,
                      )}
                      style={{
                        borderColor: active ? T.accent : T.surfaceBorder,
                        background: active ? T.accentLight : "white",
                        color: active ? T.accent : T.textSecondary,
                        fontWeight: active ? 700 : 400,
                      }}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        }
        return (
          <div key={field.key}>
            <label className={labelClass} style={{ color: T.textPrimary }}>
              {field.label}
            </label>
            <select
              value={current}
              onChange={(e) => updateConfig(field.key, e.target.value)}
              className={cn(
                "w-full rounded-md border px-2.5 py-1.5 outline-none",
                compact ? "text-[11px]" : "text-xs",
              )}
              style={{
                borderColor: T.surfaceBorder,
                color: T.textPrimary,
                background: "white",
              }}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )
      })}
    </div>
  )
}
