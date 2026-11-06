import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronRight, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {
  WelcomeOrbitArt,
  WelcomeSpark,
  WelcomeStackedCardsArt,
} from "@/features/home/components/welcome-art"
import "@/features/home/components/home-welcome.css"
import {
  useCreateBlankRuleMutation,
  useDeleteRuleMutation,
} from "@/shared/queries/rule.query"
import type { RuleListItem } from "@/shared/services/rule.service"

type HomeWelcomeProps = {
  rules: RuleListItem[]
  isLoadingRules: boolean
  isLoadingMore: boolean
  canViewMore: boolean
  onViewMore: () => void
  onSelectRule: (ruleId: string) => void
  creating: boolean
  onCreateStarted?: () => void
  onCreated: (ruleId: string) => void
}

const AVATAR_TONES = ["teal", "blue", "sand"] as const

function initials(name?: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map((p) => p[0]).join("") || "?").toUpperCase()
}

export function HomeWelcome({
  rules,
  isLoadingRules,
  isLoadingMore,
  canViewMore,
  onViewMore,
  onSelectRule,
  creating,
  onCreateStarted,
  onCreated,
}: HomeWelcomeProps) {
  const { t, i18n } = useTranslation("home")
  const dateFmt = new Intl.DateTimeFormat(
    i18n.language?.startsWith("en") ? "en-GB" : i18n.language,
    { day: "numeric", month: "short", year: "numeric" },
  )
  const createBlank = useCreateBlankRuleMutation()
  const deleteRule = useDeleteRuleMutation()
  const [pendingDelete, setPendingDelete] = useState<RuleListItem | null>(null)

  const busy = creating || createBlank.isPending

  async function handleCreate() {
    if (busy) return
    onCreateStarted?.()
    try {
      const created = await createBlank.mutateAsync()
      toast.success(t("welcome.createdToast", { name: created.name }))
      onCreated(created.ruleId)
    } catch {
      // toast via mutation onError (welcome.createFailed) — button re-enables for retry
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleteRule.isPending) return
    const target = pendingDelete
    try {
      await deleteRule.mutateAsync(target.ruleId)
      toast.success(t("welcome.deletedToast", { name: target.name }))
      setPendingDelete(null)
    } catch {
      // toast via mutation onError
    }
  }

  const isEmpty = !isLoadingRules && rules.length === 0

  const cta = (
    <button
      type="button"
      className="welcome-cta"
      disabled={busy}
      aria-busy={busy}
      onClick={() => void handleCreate()}
    >
      {busy ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <Plus aria-hidden />
      )}
      {t("welcome.startNewBrand")}
    </button>
  )

  return (
    <div
      className={cn(
        "welcome-root flex h-full min-h-0 w-full flex-col overflow-y-auto overflow-x-hidden",
        isEmpty && "welcome-empty",
      )}
    >
      <div className="mx-auto flex w-full max-w-[1112px] flex-col gap-8 px-6 pb-16 sm:px-10">
        <header className="welcome-hero">
          <WelcomeOrbitArt className="welcome-orbit" />
          {isEmpty ? null : <WelcomeStackedCardsArt className="welcome-hero-art" />}
          <div className="welcome-eyebrow">
            <WelcomeSpark />
            {t("welcome.eyebrow", { defaultValue: "Your creative workspace" })}
          </div>
          <h1 className="welcome-title">{t("welcome.title")}</h1>
          <p className="welcome-sub">{t("welcome.subtitle")}</p>
          {isEmpty ? null : cta}
        </header>

        <section className="space-y-4" aria-labelledby="welcome-brand-list">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="welcome-brand-list" className="text-sm font-semibold">
              {t("welcome.brandList")}
            </h2>
            {isLoadingRules ? null : <span className="welcome-count">{rules.length}</span>}
            <span className="text-xs text-[var(--welcome-muted)]">
              {isEmpty
                ? t("welcome.hintEmpty", { defaultValue: "A home for every brand" })
                : t("welcome.hint", { defaultValue: "Choose a brand to open its workspace" })}
            </span>
            {canViewMore ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="ml-auto rounded-full"
                disabled={isLoadingMore}
                onClick={onViewMore}
                aria-label={t("helper.viewMore")}
                title={t("helper.viewMore")}
              >
                {isLoadingMore ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <ChevronRight className="size-3.5" aria-hidden />
                )}
              </Button>
            ) : null}
          </div>

          {isLoadingRules ? (
            <ul className="welcome-grid" aria-busy="true" aria-label={t("helper.loadingRules")}>
              {Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="welcome-brand animate-pulse motion-reduce:animate-none" />
              ))}
            </ul>
          ) : isEmpty ? (
            <div className="welcome-empty-box">
              <WelcomeStackedCardsArt className="welcome-empty-art" />
              <div className="max-w-[360px]">
                <h3 className="mb-2.5 text-xl font-semibold tracking-tight">
                  {t("welcome.emptyTitle", { defaultValue: "Your next big idea starts here." })}
                </h3>
                <p className="mb-5 text-[13px] leading-relaxed text-[var(--welcome-muted)]">
                  {t("welcome.emptyBody", {
                    defaultValue:
                      "Create a brand to keep its voice, visuals and content together in one place.",
                  })}
                </p>
                {cta}
              </div>
            </div>
          ) : (
            <ul className="welcome-grid">
              {rules.map((rule, i) => (
                <li key={rule.ruleId} className="welcome-card group relative min-w-0">
                  <a
                    href={`?rule=${encodeURIComponent(rule.ruleId)}`}
                    className="welcome-brand"
                    title={rule.name}
                    aria-label={t("welcome.openBrand", {
                      name: rule.name,
                      defaultValue: "Open {{name}}",
                    })}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                      e.preventDefault()
                      onSelectRule(rule.ruleId)
                    }}
                  >
                    <span className="welcome-avatar" data-tone={AVATAR_TONES[i % 3]} aria-hidden>
                      {initials(rule.name)}
                    </span>
                    <span className="welcome-brand-name">{rule.name}</span>
                    <span className="welcome-date">
                      {t("helper.updated", {
                        date: dateFmt.format(new Date(rule.updatedAt)),
                      })}
                    </span>
                  </a>
                  <svg className="welcome-go" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                  {/* Sibling (not nested) so the card stays a single link. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute bottom-2 right-2 rounded-full text-[var(--welcome-muted)] opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label={t("welcome.deleteBrand", { name: rule.name })}
                    title={t("welcome.deleteBrand", { name: rule.name })}
                    onClick={() => setPendingDelete(rule)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="welcome-foot">
          {t("welcome.footer", { defaultValue: "Your brands. Your voice. One place." })}
        </p>
      </div>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteRule.isPending) setPendingDelete(null)
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogTitle className="text-[15px] font-semibold">
            {t("welcome.deleteTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            {t("welcome.deleteSubtitle", { name: pendingDelete?.name ?? "" })}
          </AlertDialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogCancel disabled={deleteRule.isPending}>
              {t("welcome.deleteCancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteRule.isPending}
              onClick={() => void confirmDelete()}
            >
              {deleteRule.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {t("welcome.deleteConfirm")}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
