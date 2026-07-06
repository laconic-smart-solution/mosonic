import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { RuleIntakeAnswers } from "@/features/rules/types/rule-intake.type"
import { RuleQaTagInput } from "./rule-qa-tag-input"

type Patch = (patch: Partial<RuleIntakeAnswers>) => void

export function RuleQaBrandStep({
  answers,
  patchAnswers,
}: {
  answers: RuleIntakeAnswers
  patchAnswers: Patch
}) {
  const { t } = useTranslation("rules")
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("form.brand.brandName")}</Label>
        <Input
          value={answers.brandName ?? ""}
          onChange={(e) => patchAnswers({ brandName: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("form.brand.industry")}</Label>
        <Input
          value={answers.industry ?? ""}
          onChange={(e) => patchAnswers({ industry: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("form.brand.description")}</Label>
        <Textarea
          value={answers.brandDescription ?? ""}
          onChange={(e) => patchAnswers({ brandDescription: e.target.value })}
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("form.brand.brandVoice")}</Label>
        <Textarea
          value={answers.brandVoice ?? ""}
          onChange={(e) => patchAnswers({ brandVoice: e.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("qaWizard.steps.brand.toneLabel")}</Label>
        <RuleQaTagInput
          value={answers.brandTone ?? []}
          onChange={(brandTone) => patchAnswers({ brandTone })}
          placeholder={t("qaWizard.steps.brand.tonePlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("form.brand.callToAction")}</Label>
        <Input
          value={answers.callToAction ?? ""}
          onChange={(e) => patchAnswers({ callToAction: e.target.value })}
        />
      </div>
    </div>
  )
}

export function RuleQaAudienceStep({
  answers,
  patchAnswers,
}: {
  answers: RuleIntakeAnswers
  patchAnswers: Patch
}) {
  const { t } = useTranslation("rules")
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("form.audience.description")}</Label>
        <Textarea
          value={answers.audienceDescription ?? ""}
          onChange={(e) => patchAnswers({ audienceDescription: e.target.value })}
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("qaWizard.steps.audience.locationsLabel")}</Label>
        <RuleQaTagInput
          value={answers.locations ?? []}
          onChange={(locations) => patchAnswers({ locations })}
          placeholder={t("qaWizard.steps.audience.locationsPlaceholder")}
        />
      </div>
    </div>
  )
}

export function RuleQaCampaignStep({
  answers,
  patchAnswers,
}: {
  answers: RuleIntakeAnswers
  patchAnswers: Patch
}) {
  const { t } = useTranslation("rules")
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("form.campaign.goals")}</Label>
        <RuleQaTagInput
          value={answers.goals ?? []}
          onChange={(goals) => patchAnswers({ goals })}
          placeholder={t("qaWizard.steps.campaign.goalsPlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("form.campaign.keywords")}</Label>
        <RuleQaTagInput
          value={answers.keywords ?? []}
          onChange={(keywords) => patchAnswers({ keywords })}
          placeholder={t("qaWizard.steps.campaign.keywordsPlaceholder")}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={answers.useHashtags !== false}
          onChange={(e) =>
            patchAnswers({
              useHashtags: e.target.checked,
              hashtagStrategy: e.target.checked ? answers.hashtagStrategy : [],
            })
          }
        />
        {t("qaWizard.steps.campaign.useHashtags")}
      </label>
      {answers.useHashtags !== false ? (
        <div className="space-y-2">
          <Label>{t("form.campaign.hashtagStrategy")}</Label>
          <RuleQaTagInput
            value={answers.hashtagStrategy ?? []}
            onChange={(hashtagStrategy) => patchAnswers({ hashtagStrategy })}
            placeholder={t("qaWizard.steps.campaign.hashtagsPlaceholder")}
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>{t("form.campaign.contentFormats")}</Label>
        <RuleQaTagInput
          value={answers.contentFormats ?? []}
          onChange={(contentFormats) => patchAnswers({ contentFormats })}
          placeholder={t("qaWizard.steps.campaign.formatsPlaceholder")}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{t("qaWizard.steps.campaign.startDate")}</Label>
          <Input
            type="date"
            value={answers.duration?.startDate ?? ""}
            onChange={(e) =>
              patchAnswers({
                duration: { ...answers.duration, startDate: e.target.value },
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>{t("qaWizard.steps.campaign.endDate")}</Label>
          <Input
            type="date"
            value={answers.duration?.endDate ?? ""}
            onChange={(e) =>
              patchAnswers({
                duration: { ...answers.duration, endDate: e.target.value },
              })
            }
          />
        </div>
      </div>
    </div>
  )
}

export function RuleQaGuidelinesStep({
  answers,
  patchAnswers,
}: {
  answers: RuleIntakeAnswers
  patchAnswers: Patch
}) {
  const { t } = useTranslation("rules")
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("form.guidelines.dos")}</Label>
        <RuleQaTagInput
          value={answers.dos ?? []}
          onChange={(dos) => patchAnswers({ dos })}
          placeholder={t("qaWizard.steps.guidelines.dosPlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("form.guidelines.donts")}</Label>
        <RuleQaTagInput
          value={answers.donts ?? []}
          onChange={(donts) => patchAnswers({ donts })}
          placeholder={t("qaWizard.steps.guidelines.dontsPlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("form.guidelines.requiredElements")}</Label>
        <RuleQaTagInput
          value={answers.requiredElements ?? []}
          onChange={(requiredElements) => patchAnswers({ requiredElements })}
          placeholder={t("qaWizard.steps.guidelines.requiredPlaceholder")}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={answers.useSeo !== false}
          onChange={(e) =>
            patchAnswers({
              useSeo: e.target.checked,
              primarySeoKeywords: e.target.checked
                ? answers.primarySeoKeywords
                : [],
            })
          }
        />
        {t("qaWizard.steps.guidelines.useSeo")}
      </label>
      {answers.useSeo !== false ? (
        <div className="space-y-2">
          <Label>{t("form.guidelines.primarySeo")}</Label>
          <RuleQaTagInput
            value={answers.primarySeoKeywords ?? []}
            onChange={(primarySeoKeywords) => patchAnswers({ primarySeoKeywords })}
            placeholder={t("qaWizard.steps.guidelines.seoPlaceholder")}
          />
        </div>
      ) : null}
    </div>
  )
}
