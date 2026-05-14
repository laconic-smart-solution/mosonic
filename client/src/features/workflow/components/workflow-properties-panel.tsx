import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { WF_NODE_TYPES, type WFNode } from "@/features/workflow/data/workflow-model"
import { T } from "@/lib/tokens"

type WorkflowPropertiesPanelProps = {
  selNode: WFNode
  propConfig: Record<string, unknown>
  setPropConfig: (next: Record<string, unknown>) => void
  onClose: () => void
  onApply: () => void
  onReset: () => void
}

export function WorkflowPropertiesPanel({
  selNode,
  propConfig,
  setPropConfig,
  onClose,
  onApply,
  onReset,
}: WorkflowPropertiesPanelProps) {
  const selType =
    WF_NODE_TYPES.find((t) => t.type === selNode.type) ?? WF_NODE_TYPES[0]
  const configFields = FIELD_DEFS[selNode.type] ?? []

  function updateConfig(key: string, value: string) {
    setPropConfig({ ...propConfig, [key]: value })
  }

  function setConfigValue(key: string, value: unknown) {
    setPropConfig({ ...propConfig, [key]: value })
  }

  return (
    <div
      className="z-50 flex w-[300px] min-w-[300px] flex-col overflow-hidden border-l bg-white"
      style={{ borderColor: T.surfaceBorder }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 py-3.5"
        style={{ borderColor: T.surfaceBorder }}
      >
        <div
          className="flex size-6 shrink-0 items-center justify-center rounded-md border text-current"
          style={{
            background: selType.bg,
            borderColor: `${selType.color}30`,
            color: selType.color,
          }}
        >
          {selType.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold" style={{ color: T.textPrimary }}>
            {selNode.label}
          </div>
          <div className="text-[10px] text-gray-400">Properties</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex cursor-pointer rounded-md border-none bg-transparent p-1 text-gray-400"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden
          >
            <path
              d="M2 2l10 10M12 2L2 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
        <div
          className="rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed"
          style={{ borderColor: T.surfaceBorder, color: T.textSecondary }}
        >
          Tune how this step runs using the fields below. The topic or campaign brief is entered when you
          generate content (pipeline run), not on the node.
        </div>

        {configFields.map((field) => {
          if (field.control === "toggle") {
            const on = Boolean(propConfig[field.key] ?? field.defaultValue)
            return (
              <div key={field.key}>
                <label
                  className="mb-1.5 block text-[11px] font-bold"
                  style={{ color: T.textPrimary }}
                >
                  {field.label}
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setConfigValue(field.key, true)}
                    className="flex-1 cursor-pointer rounded-md border py-1 text-[11px]"
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
                    className="flex-1 cursor-pointer rounded-md border py-1 text-[11px]"
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
            const val = String(propConfig[field.key] ?? field.defaultValue ?? "")
            return (
              <div key={field.key}>
                <label
                  className="mb-1.5 block text-[11px] font-bold"
                  style={{ color: T.textPrimary }}
                >
                  {field.label}
                </label>
                <Textarea
                  value={val}
                  onChange={(e) => setConfigValue(field.key, e.target.value)}
                  rows={field.rows ?? 3}
                  className="resize-y bg-[#FDFCFA] text-xs leading-relaxed"
                  style={{ color: T.textPrimary }}
                  placeholder={field.placeholder}
                />
              </div>
            )
          }

          const current = String(propConfig[field.key] ?? field.defaultValue)
          if (field.control === "buttons") {
            return (
              <div key={field.key}>
                <label
                  className="mb-1.5 block text-[11px] font-bold"
                  style={{ color: T.textPrimary }}
                >
                  {field.label}
                </label>
                <div className="flex flex-wrap gap-1">
                  {field.options.map((option) => {
                    const active = current === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateConfig(field.key, option.value)}
                        className="min-w-13 flex-1 cursor-pointer rounded-md border py-1 text-[11px]"
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
              <label
                className="mb-1.5 block text-[11px] font-bold"
                style={{ color: T.textPrimary }}
              >
                {field.label}
              </label>
              <select
                value={current}
                onChange={(e) => updateConfig(field.key, e.target.value)}
                className="w-full rounded-md border px-2.5 py-1.5 text-xs outline-none"
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

        <div className="rounded-lg bg-gray-100 px-2.5 py-2 text-[11px] leading-relaxed text-gray-400">
          Changes apply to this run only. Save the workflow to persist.
        </div>
      </div>

      <div
        className="flex gap-2 border-t px-4 py-3"
        style={{ borderColor: T.surfaceBorder }}
      >
        <Button
          type="button"
          className="flex-1"
          size="sm"
          onClick={() => {
            onApply()
            onClose()
          }}
        >
          Apply changes
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          Reset
        </Button>
      </div>
    </div>
  )
}

type FieldOption = { label: string; value: string }

type ConfigFieldSelect = {
  key: string
  label: string
  control: "select"
  options: FieldOption[]
  defaultValue: string
}

type ConfigFieldButtons = {
  key: string
  label: string
  control: "buttons"
  options: FieldOption[]
  defaultValue: string
}

type ConfigFieldToggle = {
  key: string
  label: string
  control: "toggle"
  defaultValue: boolean
}

type ConfigFieldTextarea = {
  key: string
  label: string
  control: "textarea"
  defaultValue: string
  rows?: number
  placeholder?: string
}

type ConfigField =
  | ConfigFieldSelect
  | ConfigFieldButtons
  | ConfigFieldToggle
  | ConfigFieldTextarea

const FIELD_DEFS: Record<string, ConfigField[]> = {
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
        { label: "1:1", value: "1:1" },
        { label: "4:5", value: "4:5" },
      ],
      defaultValue: "16:9",
    },
    {
      key: "resolution",
      label: "Resolution",
      control: "select",
      options: [
        { label: "720p", value: "720p" },
        { label: "1080p", value: "1080p" },
      ],
      defaultValue: "1080p",
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
}
