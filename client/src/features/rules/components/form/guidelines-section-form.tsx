import { useTranslation } from "react-i18next"
import { FormSection, FullRow } from "./rule-form-helpers"
import { RuleFormCommaList } from "./rule-form-comma-list"
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
        <RuleFormCommaList name="contentGuidelines.dos" label={t("form.guidelines.dos")} className="min-h-16" />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="contentGuidelines.donts"
          label={t("form.guidelines.donts")}
          className="min-h-16"
        />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="contentGuidelines.requiredElements"
          label={t("form.guidelines.requiredElements")}
          className="min-h-16"
        />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="contentGuidelines.seoGuidelines.primaryKeywords"
          label={t("form.guidelines.primarySeo")}
          className="min-h-16"
        />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="contentGuidelines.seoGuidelines.secondaryKeywords"
          label={t("form.guidelines.secondarySeo")}
          className="min-h-16"
        />
      </FullRow>
      <RuleFormInput
        name="contentGuidelines.seoGuidelines.keywordDensity"
        label={t("form.guidelines.keywordDensity")}
      />
    </FormSection>
  )
}
