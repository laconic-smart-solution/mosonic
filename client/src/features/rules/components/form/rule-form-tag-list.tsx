import { useState } from "react"
import { Plus, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Controller, useFormContext, type FieldPath } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { cn } from "@/lib/utils"
import { FieldLabel } from "./rule-form-helpers"

type Props = {
  name: FieldPath<RuleEntity>
  label: string
  hint?: string
  placeholder?: string
  className?: string
}

export function RuleFormTagList({
  name,
  label,
  hint,
  placeholder,
  className,
}: Props) {
  const { t } = useTranslation("rules")
  const { control } = useFormContext<RuleEntity>()
  const resolvedHint = hint ?? t("form.tagListHint")

  return (
    <div className={className}>
      <FieldLabel hint={resolvedHint}>{label}</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <TagListEditor
            items={Array.isArray(field.value) ? field.value : []}
            placeholder={placeholder ?? t("form.tagListPlaceholder")}
            onChange={field.onChange}
          />
        )}
      />
    </div>
  )
}

function TagListEditor({
  items,
  placeholder,
  onChange,
}: {
  items: string[]
  placeholder: string
  onChange: (items: string[]) => void
}) {
  const { t } = useTranslation("rules")
  const [input, setInput] = useState("")

  function addItem() {
    const next = input.trim()
    if (!next) return
    if (items.some((item) => item.toLowerCase() === next.toLowerCase())) {
      setInput("")
      return
    }
    onChange([...items, next])
    setInput("")
  }

  function removeAt(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2.5">
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground"
            >
              {item}
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={t("form.tagListRemoveAria", { value: item })}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              addItem()
            }
          }}
          placeholder={placeholder}
          className={cn("h-9 flex-1 text-sm")}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          onClick={addItem}
          disabled={!input.trim()}
          aria-label={t("form.tagListAdd")}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
