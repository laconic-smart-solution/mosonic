import { useTranslation } from "react-i18next"
import { FormSection, FullRow } from "./rule-form-helpers"
import { RuleFormTagList } from "./rule-form-tag-list"
import { RuleFormInput } from "./rule-form-input"
import { RuleFormTextarea } from "./rule-form-textarea"

export function BrandSectionForm() {
  const { t } = useTranslation("rules")

  return (
    <FormSection
      id="detail-brand"
      title={t("form.brand.title")}
      subtitle={t("form.brand.subtitle")}
    >
      <RuleFormInput name="brand.brandName" label={t("form.brand.brandName")} />
      <RuleFormInput name="brand.industry" label={t("form.brand.industry")} />
      <FullRow>
        <RuleFormTextarea
          name="brand.brandDescription"
          label={t("form.brand.description")}
          rows={3}
          className="min-h-20"
        />
      </FullRow>
      <FullRow>
        <RuleFormTextarea
          name="brand.brandVoice"
          label={t("form.brand.brandVoice")}
          rows={3}
          className="min-h-20"
        />
      </FullRow>
      <FullRow>
        <RuleFormTagList name="brand.brandTone" label={t("form.brand.tone")} />
      </FullRow>
      <FullRow>
        <RuleFormTagList
          name="brand.brandRestrictions"
          label={t("form.brand.restrictions")}
        />
      </FullRow>
      <RuleFormInput name="brand.callToAction" label={t("form.brand.callToAction")} />
    </FormSection>
  )
}
