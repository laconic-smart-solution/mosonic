import { useTranslation } from "react-i18next"
import { FormSection, FullRow } from "./rule-form-helpers"
import { RuleFormTagList } from "./rule-form-tag-list"
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
        <RuleFormTagList name="campaign.goals" label={t("form.campaign.goals")} />
      </FullRow>
      <FullRow>
        <RuleFormTagList name="campaign.keywords" label={t("form.campaign.keywords")} />
      </FullRow>
      <FullRow>
        <RuleFormTagList
          name="campaign.hashtagStrategy"
          label={t("form.campaign.hashtags")}
        />
      </FullRow>
      <FullRow>
        <RuleFormTagList
          name="campaign.contentFormats"
          label={t("form.campaign.contentFormats")}
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
        <RuleFormTagList
          name="campaign.customSchedule"
          label={t("form.campaign.customSchedule")}
        />
      </FullRow>
    </FormSection>
  )
}
