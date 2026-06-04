import { useTranslation } from "react-i18next"
import { FormSection, FullRow } from "./rule-form-helpers"
import { RuleFormCommaList } from "./rule-form-comma-list"
import { RuleFormInput } from "./rule-form-input"
import { RuleFormSelect } from "./rule-form-select"
import { RuleFormTextarea } from "./rule-form-textarea"

export function AudienceSectionForm() {
  const { t } = useTranslation("rules")

  return (
    <FormSection
      id="detail-audience"
      title={t("form.audience.title")}
      subtitle={t("form.audience.subtitle")}
    >
      <FullRow>
        <RuleFormTextarea
          name="audience.description"
          label={t("form.audience.description")}
          rows={3}
          className="min-h-20"
        />
      </FullRow>
      <RuleFormInput name="audience.ageRange.min" label={t("form.audience.ageMin")} type="number" />
      <RuleFormInput name="audience.ageRange.max" label={t("form.audience.ageMax")} type="number" />
      <RuleFormSelect
        name="audience.gender"
        label={t("form.audience.gender")}
        options={[
          { value: "all", label: t("form.audience.genderAll") },
          { value: "male", label: t("form.audience.genderMale") },
          { value: "female", label: t("form.audience.genderFemale") },
        ]}
      />
      <RuleFormInput name="audience.language" label={t("form.audience.primaryLanguage")} />
      <FullRow>
        <RuleFormCommaList name="audience.location" label={t("form.audience.locations")} className="min-h-16" />
      </FullRow>
      <FullRow>
        <RuleFormCommaList name="audience.interests" label={t("form.audience.interests")} className="min-h-16" />
      </FullRow>
      <FullRow>
        <RuleFormCommaList name="audience.painPoints" label={t("form.audience.painPoints")} className="min-h-16" />
      </FullRow>
      <RuleFormCommaList name="audience.targetLanguages" label={t("form.audience.targetLanguages")} rows={1} />
    </FormSection>
  )
}
