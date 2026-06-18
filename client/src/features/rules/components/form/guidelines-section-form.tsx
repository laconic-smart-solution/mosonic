import { useTranslation } from "react-i18next"
import { FormSection, FullRow } from "./rule-form-helpers"
import { RuleFormTagList } from "./rule-form-tag-list"
import { RuleFormInput } from "./rule-form-input"

export function GuidelinesSectionForm() {
  const { t } = useTranslation("rules")

  return (
    <FormSection
      id="detail-guidelines"
      title={t("form.guidelines.title")}
      subtitle={t("form.guidelines.subtitle")}
    >
      <FullRow>
        <RuleFormTagList name="contentGuidelines.dos" label={t("form.guidelines.dos")} />
      </FullRow>
      <FullRow>
        <RuleFormTagList
          name="contentGuidelines.donts"
          label={t("form.guidelines.donts")}
        />
      </FullRow>
      <FullRow>
        <RuleFormTagList
          name="contentGuidelines.requiredElements"
          label={t("form.guidelines.requiredElements")}
        />
      </FullRow>
      <FullRow>
        <RuleFormTagList
          name="contentGuidelines.seoGuidelines.primaryKeywords"
          label={t("form.guidelines.primarySeo")}
        />
      </FullRow>
      <FullRow>
        <RuleFormTagList
          name="contentGuidelines.seoGuidelines.secondaryKeywords"
          label={t("form.guidelines.secondarySeo")}
        />
      </FullRow>
      <RuleFormInput
        name="contentGuidelines.seoGuidelines.keywordDensity"
        label={t("form.guidelines.keywordDensity")}
      />
    </FormSection>
  )
}
