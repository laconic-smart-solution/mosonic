import { FormSection, FullRow } from "./rule-form-helpers"
import { RuleFormCommaList } from "./rule-form-comma-list"
import { RuleFormInput } from "./rule-form-input"
import { RuleFormSelect } from "./rule-form-select"
import { RuleFormTextarea } from "./rule-form-textarea"

export function AudienceSectionForm() {
  return (
    <FormSection
      id="detail-audience"
      title="Audience"
      subtitle="Who you are targeting and how they behave."
    >
      <FullRow>
        <RuleFormTextarea
          name="audience.description"
          label="Audience description"
          rows={3}
          className="min-h-20"
        />
      </FullRow>
      <RuleFormInput name="audience.ageRange.min" label="Age min" type="number" />
      <RuleFormInput name="audience.ageRange.max" label="Age max" type="number" />
      <RuleFormSelect
        name="audience.gender"
        label="Gender"
        options={[
          { value: "all", label: "All" },
          { value: "male", label: "Male" },
          { value: "female", label: "Female" },
        ]}
      />
      <RuleFormInput name="audience.language" label="Primary language" />
      <FullRow>
        <RuleFormCommaList name="audience.location" label="Locations" className="min-h-16" />
      </FullRow>
      <FullRow>
        <RuleFormCommaList name="audience.interests" label="Interests" className="min-h-16" />
      </FullRow>
      <FullRow>
        <RuleFormCommaList name="audience.painPoints" label="Pain points" className="min-h-16" />
      </FullRow>
      <RuleFormCommaList name="audience.targetLanguages" label="Target languages" rows={1} />
    </FormSection>
  )
}
