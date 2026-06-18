import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { channelLabel } from "@/shared/constants/distribution-channels"
import { cn } from "@/lib/utils"

type Props = {
  options: string[]
  value: string[]
  onChange: (channels: string[]) => void
}

export function WorkflowQaChannelPicker({ options, value, onChange }: Props) {
  const { t } = useTranslation("workflow")

  function toggle(channelId: string) {
    onChange(
      value.includes(channelId)
        ? value.filter((id) => id !== channelId)
        : [...value, channelId],
    )
  }

  const allSelected =
    options.length > 0 && options.every((id) => value.includes(id))

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={allSelected}
          onClick={() => onChange([...options])}
        >
          {t("qaWizard.selectAll")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={value.length === 0}
          onClick={() => onChange([])}
        >
          {t("qaWizard.deselectAll")}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((channelId) => {
          const id = `qa-channel-${channelId}`
          return (
            <label
              key={channelId}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                value.includes(channelId)
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:border-primary/30 hover:bg-muted/40",
              )}
            >
              <Checkbox
                id={id}
                checked={value.includes(channelId)}
                onCheckedChange={() => toggle(channelId)}
              />
              <Label htmlFor={id} className="cursor-pointer font-normal">
                {channelLabel(channelId)}
              </Label>
            </label>
          )
        })}
      </div>
    </div>
  )
}
