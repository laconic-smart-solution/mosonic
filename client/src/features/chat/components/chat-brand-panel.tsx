import { forwardRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RuleChip } from "@/features/rules/components/rule-chip"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { channelLabel } from "@/shared/constants/distribution-channels"
import { useRuleByIdQuery } from "@/shared/queries/rule.query"
import { ChatBrandAssetList } from "./chat-brand-asset-list"
import { ChatEditBrandDialog } from "./dialogs/chat-edit-brand-dialog"

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  )
}

export const ChatBrandPanel = forwardRef<
  HTMLDivElement,
  { ruleId: string | null; onNavigateSetup: () => void; onAddAssets: () => void }
>(function ChatBrandPanel({ ruleId, onNavigateSetup, onAddAssets }, ref) {
  const { t } = useTranslation("chat")
  const [editOpen, setEditOpen] = useState(false)
  const ruleQuery = useRuleByIdQuery<RuleEntity>(ruleId ?? "", Boolean(ruleId))
  const rule = ruleQuery.data

  if (!ruleId) {
    return (
      <div
        ref={ref}
        className="flex h-full w-80 min-w-0 shrink-0 flex-col items-center justify-center overflow-hidden border-l border-canvas-200 dark:border-white/8 bg-white dark:bg-navy-800 px-4 text-center"
      >
        <p className="text-xs text-muted-foreground">{t("workspace.noRule")}</p>
      </div>
    )
  }

  return (
    <div ref={ref} className="flex h-full w-80 min-w-0 shrink-0 flex-col overflow-hidden border-l border-canvas-200 dark:border-white/8 bg-white dark:bg-navy-800">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <p className="min-w-0 truncate text-sm font-semibold text-foreground">
          {rule?.name ?? t("brandPanel.panelTitle")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0 rounded-[9px] font-semibold text-navy-700 dark:text-[#E8EDF6]"
          disabled={!rule}
          onClick={() => setEditOpen(true)}
        >
          {t("brandPanel.editAction")}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 pb-4">
        {ruleQuery.isLoading ? (
            <div className="space-y-2" aria-busy="true">
              <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted/50" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted/50" />
            </div>
          ) : !rule ? null : (
            <div className="space-y-4">
              <PanelSection title={t("brandPanel.brandSection")}>
                <div className="space-y-1 text-xs text-foreground">
                  {rule.brand.industry ? <p>{rule.brand.industry}</p> : null}
                  {rule.brand.brandDescription ? (
                    <p className="text-muted-foreground">{rule.brand.brandDescription}</p>
                  ) : null}
                  {rule.brand.callToAction ? (
                    <p className="text-muted-foreground">{rule.brand.callToAction}</p>
                  ) : null}
                </div>
                {rule.brand.brandTone.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {rule.brand.brandTone.map((tone) => (
                      <RuleChip key={tone} label={tone} color="indigo" />
                    ))}
                  </div>
                ) : null}
              </PanelSection>

              <PanelSection title={t("brandPanel.audienceSection")}>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {rule.audience.description ? <p>{rule.audience.description}</p> : null}
                  {rule.audience.location.length > 0 ? (
                    <p>{rule.audience.location.join(", ")}</p>
                  ) : null}
                </div>
                {rule.audience.interests.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {rule.audience.interests.map((interest) => (
                      <RuleChip key={interest} label={interest} color="gray" />
                    ))}
                  </div>
                ) : null}
              </PanelSection>

              {rule.channels.length > 0 ? (
                <PanelSection title={t("brandPanel.channelsSection")}>
                  <div className="flex flex-wrap gap-1">
                    {rule.channels.map((item) => (
                      <RuleChip
                        key={item.channel}
                        label={channelLabel(item.channel)}
                        color="green"
                      />
                    ))}
                  </div>
                </PanelSection>
              ) : null}

              <PanelSection title={t("brandPanel.assetsSection")}>
                <ChatBrandAssetList ruleId={ruleId} />
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="rounded-[9px] border-canvas-300 dark:border-white/14"
                  onClick={onAddAssets}
                >
                  {t("brandPanel.addAssets")}
                </Button>
              </PanelSection>
              {/* TODO: "Generating images 2 of 4" progress — needs the active pipeline's per-node
                  image progress in this panel (pipeline socket events are only joined on the
                  pipeline pages today). */}
            </div>
          )}
        </ScrollArea>
      {rule && editOpen ? (
        <ChatEditBrandDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          rule={rule}
          onOpenFullSetup={() => {
            setEditOpen(false)
            onNavigateSetup()
          }}
        />
      ) : null}
      </div>
    )
  },
)
