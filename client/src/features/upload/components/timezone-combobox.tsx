import { useMemo, useId } from "react"
import { useTranslation } from "react-i18next"
import { Globe2 } from "lucide-react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Label } from "@/components/ui/label"
import {
  TIMEZONE_OPTIONS,
  timezoneLabel,
} from "@/shared/lib/timezones"
import { cn } from "@/lib/utils"

type TimezoneComboboxProps = {
  value: string
  onChange: (timezone: string) => void
  disabled?: boolean
  id?: string
  className?: string
}

export function TimezoneCombobox({
  value,
  onChange,
  disabled,
  id: idProp,
  className,
}: TimezoneComboboxProps) {
  const { t } = useTranslation(["upload"])
  const autoId = useId()
  const inputId = idProp ?? `timezone-${autoId}`
  const listboxId = `${inputId}-listbox`
  const hintId = `${inputId}-hint`

  const items = useMemo(() => {
    const ids = TIMEZONE_OPTIONS.map((z) => z.value)
    if (value.trim() && !ids.includes(value)) {
      return [value, ...ids]
    }
    return ids
  }, [value])

  const metaById = useMemo(() => {
    const map = new Map(TIMEZONE_OPTIONS.map((z) => [z.value, z]))
    return map
  }, [])

  return (
    <div className={cn("space-y-2", className)}>
      <Label
        htmlFor={inputId}
        className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
      >
        <Globe2 className="size-3 opacity-80" aria-hidden />
        {t("upload:publish.timezone")}
      </Label>
      <Combobox
        items={items}
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string" && next.trim()) onChange(next)
        }}
        itemToStringLabel={(tz) => timezoneLabel(tz)}
        disabled={disabled}
        autoHighlight
      >
        <ComboboxInput
          id={inputId}
          showClear={false}
          disabled={disabled}
          placeholder={t("upload:publish.timezoneSearchPlaceholder")}
          aria-controls={listboxId}
          aria-describedby={hintId}
          aria-label={t("upload:publish.timezone")}
          className="w-full min-w-0 [&_[data-slot=input-group]]:h-11 [&_[data-slot=input-group]]:rounded-md [&_input]:text-sm"
        />
        <ComboboxContent className="z-80 w-(--anchor-width) min-w-(--anchor-width)">
          <ComboboxEmpty>{t("upload:publish.timezoneEmpty")}</ComboboxEmpty>
          <ComboboxList id={listboxId}>
            {(tz: string) => {
              const meta = metaById.get(tz)
              return (
                <ComboboxItem key={tz} value={tz}>
                  <span className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="truncate font-medium">
                      {meta?.label ?? tz}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {tz}
                    </span>
                  </span>
                </ComboboxItem>
              )
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <p className="text-[11px] text-muted-foreground" id={hintId}>
        {t("upload:publish.timezoneHint", {
          zone: timezoneLabel(value || "Asia/Bangkok"),
        })}
      </p>
    </div>
  )
}
