import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FormSection } from "./rule-form-helpers"
import {
  campaignAutonomyService,
  type CampaignAutonomyPolicy,
} from "@/shared/services/campaign-autonomy.service"

export function AutonomySectionForm() {
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
      toast.success("Autonomy policy saved.")
    } catch {
      toast.error("Could not save autonomy policy.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormSection
      id="detail-autonomy"
      title="Autonomous publishing"
      subtitle="Optional auto-approve and publish after scheduled pipeline runs (global kill switch applies)."
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => void save({ enabled: e.target.checked })}
          disabled={saving}
        />
        Enable autonomy for this rule
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
            {m.replace(/_/g, " ")}
          </Button>
        ))}
      </div>
    </FormSection>
  )
}
