import { FormSection, FullRow } from "./rule-form-helpers"
import { RuleFormCommaList } from "./rule-form-comma-list"
import { RuleFormSelect } from "./rule-form-select"

export function CampaignSectionForm() {
  return (
    <FormSection
      id="detail-campaign"
      title="Campaign"
      subtitle="Goals, discovery, and publishing rhythm."
    >
      <FullRow>
        <RuleFormCommaList name="campaign.goals" label="Goals" className="min-h-16" />
      </FullRow>
      <FullRow>
        <RuleFormCommaList name="campaign.keywords" label="Keywords" className="min-h-16" />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="campaign.hashtagStrategy"
          label="Hashtags"
          className="min-h-16"
        />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="campaign.contentFormats"
          label="Content formats"
          className="min-h-16"
        />
      </FullRow>
      <RuleFormSelect
        name="campaign.postingFrequency"
        label="Posting frequency"
        options={[
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "custom", label: "Custom" },
        ]}
      />
      <FullRow>
        <RuleFormCommaList
          name="campaign.customSchedule"
          label="Custom schedule"
          className="min-h-16"
        />
      </FullRow>
    </FormSection>
  )
}
