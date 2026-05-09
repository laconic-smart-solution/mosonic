import { FormSection, FullRow } from "./rule-form-helpers"
import { RuleFormCommaList } from "./rule-form-comma-list"
import { RuleFormInput } from "./rule-form-input"

export function GuidelinesSectionForm() {
  return (
    <FormSection
      id="detail-guidelines"
      title="Guidelines"
      subtitle="Guardrails and SEO hints for generated content."
    >
      <FullRow>
        <RuleFormCommaList name="contentGuidelines.dos" label="Dos" className="min-h-16" />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="contentGuidelines.donts"
          label="Don&apos;ts"
          className="min-h-16"
        />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="contentGuidelines.requiredElements"
          label="Required elements"
          className="min-h-16"
        />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="contentGuidelines.seoGuidelines.primaryKeywords"
          label="Primary SEO keywords"
          className="min-h-16"
        />
      </FullRow>
      <FullRow>
        <RuleFormCommaList
          name="contentGuidelines.seoGuidelines.secondaryKeywords"
          label="Secondary SEO keywords"
          className="min-h-16"
        />
      </FullRow>
      <RuleFormInput
        name="contentGuidelines.seoGuidelines.keywordDensity"
        label="Keyword density note"
      />
    </FormSection>
  )
}
