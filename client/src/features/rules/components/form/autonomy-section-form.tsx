import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FormSection } from "./rule-form-helpers"
import {
  campaignAutonomyService,
  type CampaignAutonomyPolicy,
} from "@/shared/services/campaign-autonomy.service"

export function AutonomySectionForm() {
  const { t } = useTranslation("rules")
  const { ruleId } = useParams<{ ruleId: string }>()
  const [policy, setPolicy] = useState<CampaignAutonomyPolicy | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!ruleId) return
    void campaignAutonomyService.getForRule(ruleId).then(setPolicy)
  }, [ruleId])

  if (!ruleId) return null

  const enabled = policy?.enabled ?? false
  const mode = policy?.mode ?? "off"

  const modeLabels: Record<CampaignAutonomyPolicy["mode"], string> = {
    off: t("form.autonomy.modeOff"),
    review_optional: t("form.autonomy.modeReviewOptional"),
    full_auto: t("form.autonomy.modeFullAuto"),
  }

  async function save(next: Partial<CampaignAutonomyPolicy>) {
    setSaving(true)
    try {
      const saved = await campaignAutonomyService.upsert(ruleId!, {
        enabled,
        mode,
        allowedChannels: policy?.allowedChannels ?? [],
        maxPostsPerDay: policy?.maxPostsPerDay ?? 5,
        blockIfPendingSuggestions: policy?.blockIfPendingSuggestions ?? true,
        ...next,
      })
      setPolicy(saved)
      toast.success(t("toast.autonomySaved"))
    } catch {
      toast.error(t("toast.couldNotSaveAutonomy"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormSection
      id="detail-autonomy"
      title={t("form.autonomy.title")}
      subtitle={t("form.autonomy.subtitle")}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => void save({ enabled: e.target.checked })}
          disabled={saving}
        />
        {t("form.autonomy.enable")}
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["off", "review_optional", "full_auto"] as const).map((m) => (
          <Button
            key={m}
            type="button"
            size="sm"
            variant={mode === m ? "default" : "outline"}
            disabled={saving}
            onClick={() => void save({ mode: m, enabled: m !== "off" })}
          >
            {modeLabels[m]}
          </Button>
        ))}
      </div>
    </FormSection>
  )
}
