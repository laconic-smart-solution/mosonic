import { useTranslation } from "react-i18next"
import { FormSection, FullRow } from "./rule-form-helpers"
import { RuleFormCommaList } from "./rule-form-comma-list"
import { RuleFormSelect } from "./rule-form-select"

export function CampaignSectionForm() {
  const { t } = useTranslation("rules")

  return (
    <FormSection
      id="detail-campaign"
      title={t("form.campaign.title")}
      subtitle={t("form.campaign.subtitle")}
    >
      <FullRow>
        <RuleFormCommaList name="campaign.goals" label={t("form.campaign.goals")} className="min-h-16" />
      </FullRow>
      <FullRow>
        <RuleFormCommaList name="campaign.keywords" label={t("form.campaign.keywords")} className="min-h-16" />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="campaign.hashtagStrategy"
          label={t("form.campaign.hashtags")}
          className="min-h-16"
        />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="campaign.contentFormats"
          label={t("form.campaign.contentFormats")}
          className="min-h-16"
        />
      </FullRow>
      <RuleFormSelect
        name="campaign.postingFrequency"
        label={t("form.campaign.postingFrequency")}
        options={[
          { value: "daily", label: t("form.campaign.frequencyDaily") },
          { value: "weekly", label: t("form.campaign.frequencyWeekly") },
          { value: "custom", label: t("form.campaign.frequencyCustom") },
        ]}
      />
      <FullRow>
        <RuleFormCommaList
          name="campaign.customSchedule"
          label={t("form.campaign.customSchedule")}
          className="min-h-16"
        />
      </FullRow>
    </FormSection>
  )
}
