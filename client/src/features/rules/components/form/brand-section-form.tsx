import { FormSection, FullRow } from "./rule-form-helpers"
import { RuleFormCommaList } from "./rule-form-comma-list"
import { RuleFormInput } from "./rule-form-input"
import { RuleFormTextarea } from "./rule-form-textarea"

export function BrandSectionForm() {
  return (
    <FormSection
      id="detail-brand"
      title="Brand"
      subtitle="Voice, positioning, and how the brand shows up in content."
    >
      <RuleFormInput name="brand.brandName" label="Brand name" />
      <RuleFormInput name="brand.industry" label="Industry" />
      <FullRow>
        <RuleFormTextarea
          name="brand.brandDescription"
          label="Description"
          rows={3}
          className="min-h-20"
        />
      </FullRow>
      <FullRow>
        <RuleFormTextarea
          name="brand.brandVoice"
          label="Brand voice"
          rows={3}
          className="min-h-20"
        />
      </FullRow>
      <FullRow>
        <RuleFormCommaList name="brand.brandTone" label="Tone" className="min-h-16" />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="brand.brandRestrictions"
          label="Restrictions"
          className="min-h-16"
        />
      </FullRow>
      <RuleFormInput name="brand.callToAction" label="Call to action" />
    </FormSection>
  )
}
