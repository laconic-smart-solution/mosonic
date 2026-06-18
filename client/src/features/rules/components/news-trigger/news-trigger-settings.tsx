import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import {
  ArrowLeft,
  Clock,
  Globe,
  Hash,
  Loader2,
  Newspaper,
  Play,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { KeywordTagInput } from "@/features/rules/components/news-trigger/keyword-tag-input"
import { cn } from "@/lib/utils"
import { getApiErrorMessage } from "@/features/upload/lib/upload-publish.helpers"
import {
  useLatestNewsRunQuery,
  useNewsTriggerSettingsQuery,
  useTriggerNewsRunMutation,
  useUpdateNewsTriggerMutation,
} from "@/shared/queries/news-trigger.query"
import {
  ensureNotificationSocket,
  onNotification,
} from "@/shared/socket/notification-events"
import { subscribeNewsTriggerRun } from "@/shared/socket/news-trigger-events"
import {
  toNewsTriggerUpdatePayload,
  type NewsTriggerCategory,
  type NewsTriggerRunStatusResponse,
  type NewsTriggerSchedule,
  type NewsTriggerSettings,
} from "@/shared/services/news-trigger.service"

const NEWS_COUNTRY_CODES = [
  "th", "us", "gb", "sg", "jp", "au", "my", "id", "in", "ph", "vn", "de", "fr", "cn",
] as const

const NEWS_LANGUAGE_CODES = [
  "en", "th", "ja", "zh", "ms", "id", "de", "fr", "hi", "vi",
] as const

const NEWS_CATEGORY_VALUES: { value: NewsTriggerCategory; key: string }[] = [
  { value: "", key: "categoryAll" },
  { value: "business", key: "categoryBusiness" },
  { value: "technology", key: "categoryTechnology" },
  { value: "general", key: "categoryGeneral" },
  { value: "entertainment", key: "categoryEntertainment" },
  { value: "health", key: "categoryHealth" },
  { value: "science", key: "categoryScience" },
  { value: "sports", key: "categorySports" },
]

const SCHEDULE_VALUES: NewsTriggerSchedule[] = ["daily", "twice_daily"]

const COUNTRY_I18N_KEYS: Record<(typeof NEWS_COUNTRY_CODES)[number], string> = {
  th: "newsTrigger.countryTh",
  us: "newsTrigger.countryUs",
  gb: "newsTrigger.countryGb",
  sg: "newsTrigger.countrySg",
  jp: "newsTrigger.countryJp",
  au: "newsTrigger.countryAu",
  my: "newsTrigger.countryMy",
  id: "newsTrigger.countryId",
  in: "newsTrigger.countryIn",
  ph: "newsTrigger.countryPh",
  vn: "newsTrigger.countryVn",
  de: "newsTrigger.countryDe",
  fr: "newsTrigger.countryFr",
  cn: "newsTrigger.countryCn",
}

const LANGUAGE_I18N_KEYS: Record<(typeof NEWS_LANGUAGE_CODES)[number], string> = {
  en: "newsTrigger.langEn",
  th: "newsTrigger.langTh",
  ja: "newsTrigger.langJa",
  zh: "newsTrigger.langZh",
  ms: "newsTrigger.langMs",
  id: "newsTrigger.langId",
  de: "newsTrigger.langDe",
  fr: "newsTrigger.langFr",
  hi: "newsTrigger.langHi",
  vi: "newsTrigger.langVi",
}

const DEFAULT_FORM: NewsTriggerSettings = {
  enabled: false,
  schedule: "daily",
  country: "us",
  language: "en",
  category: "business",
  keywords: [],
  minRelevanceScore: 70,
  maxPostsPerDay: 1,
  autoApprove: false,
  lastTriggeredAt: null,
  totalTriggeredCount: 0,
}

type Props = {
  ruleId: string
  ruleName?: string
}

export function NewsTriggerSettingsPanel({ ruleId, ruleName }: Props) {
  const { t, i18n } = useTranslation("rules")
  const { data: settings, isLoading } = useNewsTriggerSettingsQuery(ruleId)
  const update = useUpdateNewsTriggerMutation(ruleId)
  const triggerRun = useTriggerNewsRunMutation(ruleId)
  const latestRunQuery = useLatestNewsRunQuery(ruleId)
  const [lastRun, setLastRun] = useState<NewsTriggerRunStatusResponse | null>(
    null,
  )
  const notifiedRunIdRef = useRef<string | null>(null)
  const runningSinceRef = useRef<number | null>(null)
  const [form, setForm] = useState<NewsTriggerSettings>(DEFAULT_FORM)
  const [showWarning, setShowWarning] = useState(false)

  const displayRun = lastRun

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const set = <K extends keyof NewsTriggerSettings>(
    key: K,
    val: NewsTriggerSettings[K],
  ) => setForm((f) => ({ ...f, [key]: val }))

  const newsCountries = useMemo(
    () =>
      NEWS_COUNTRY_CODES.map((code) => ({
        code,
        label: t(COUNTRY_I18N_KEYS[code]),
      })),
    [t],
  )
  const newsLanguages = useMemo(
    () =>
      NEWS_LANGUAGE_CODES.map((code) => ({
        code,
        label: t(LANGUAGE_I18N_KEYS[code]),
      })),
    [t],
  )
  const newsCategories = useMemo(
    () =>
      NEWS_CATEGORY_VALUES.map((c) => ({
        value: c.value,
        label: t(`newsTrigger.${c.key}`),
      })),
    [t],
  )
  const scheduleOptions = useMemo(
    () =>
      SCHEDULE_VALUES.map((value) => ({
        value,
        label:
          value === "daily"
            ? t("newsTrigger.scheduleDaily")
            : t("newsTrigger.scheduleTwiceDaily"),
        detail:
          value === "daily"
            ? t("newsTrigger.scheduleDailyDetail")
            : t("newsTrigger.scheduleTwiceDailyDetail"),
      })),
    [t],
  )

  const disabled = !form.enabled
  const countryLabel =
    newsCountries.find((c) => c.code === form.country)?.label ?? form.country
  const languageLabel =
    newsLanguages.find((l) => l.code === form.language)?.label ?? form.language
  const categoryLabel =
    newsCategories.find((c) => c.value === form.category)?.label ??
    t("newsTrigger.categoryAll")

  const handleSave = () => update.mutate(toNewsTriggerUpdatePayload(form))

  useEffect(() => {
    if (!latestRunQuery.isSuccess || !latestRunQuery.data) return
    setLastRun((prev) => {
      const next = latestRunQuery.data!
      if (
        prev?.status === "running" &&
        prev.runId !== next.runId &&
        next.status === "failed"
      ) {
        return prev
      }
      return next
    })
  }, [latestRunQuery.isSuccess, latestRunQuery.data])

  const applyRunUpdate = (run: NewsTriggerRunStatusResponse) => {
    setLastRun(run)
    if (run.status === "running") {
      runningSinceRef.current = Date.now()
      return
    }
    runningSinceRef.current = null

    if (notifiedRunIdRef.current === run.runId) return
    notifiedRunIdRef.current = run.runId

    if (run.status === "failed") {
      toast.error(run.message)
    } else if (run.outcome === "triggered") {
      toast.success(run.message)
    } else if (run.status === "completed") {
      toast.warning(run.message)
    }
  }

  useEffect(() => {
    ensureNotificationSocket()

    const unsubscribeSocket = subscribeNewsTriggerRun(ruleId, applyRunUpdate)

    const unsubscribeNoti = onNotification((payload) => {
      if (payload.type !== "news.run_completed") return
      const ruleRef = payload.data?.ruleRef
      if (typeof ruleRef !== "string" || ruleRef !== ruleId) return

      const run = runStatusFromNotificationData(payload.data)
      if (!run) return
      applyRunUpdate(run)
    })

    return () => {
      unsubscribeSocket()
      unsubscribeNoti()
    }
  }, [ruleId])

  useEffect(() => {
    if (!lastRun || lastRun.status !== "running") return

    const timer = window.setTimeout(() => {
      setLastRun((prev) => {
        if (!prev || prev.status !== "running") return prev
        return {
          ...prev,
          status: "failed",
          message: t("newsTrigger.runTimeoutMessage"),
        }
      })
      toast.error(t("newsTrigger.runTimeoutToast"))
    }, 90_000)

    return () => window.clearTimeout(timer)
  }, [lastRun?.runId, lastRun?.status, t])

  const handleRunNow = () => {
    notifiedRunIdRef.current = null
    triggerRun.mutate(undefined, {
      onSuccess: (data) => {
        setLastRun({
          runId: data.runId,
          status: "running",
          message: t("newsTrigger.runQueued"),
        })
        runningSinceRef.current = Date.now()
      },
      onError: (err) => {
        const msg = getApiErrorMessage(err)
        if (msg.toLowerCase().includes("already in progress")) {
          toast.error(t("newsTrigger.runInProgress"))
        } else {
          toast.error(msg)
        }
      },
    })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/rules"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("newsTrigger.backToRules")}
      </Link>

      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-border/70 bg-linear-to-b from-card/95 to-card/50 shadow-sm ring-1 ring-black/3 dark:ring-white/6",
          disabled && "opacity-95",
        )}
      >
        <header className="border-b border-border/50 px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
              <Newspaper className="size-5 text-primary" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("newsTrigger.automation")}
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">
                {t("newsTrigger.title")}
              </h1>
              {ruleName ? (
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {ruleName}
                </p>
              ) : null}
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t("newsTrigger.description")}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/25 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("newsTrigger.enableTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {form.enabled
                  ? form.schedule === "daily"
                    ? t("newsTrigger.enabledDaily")
                    : t("newsTrigger.enabledTwiceDaily")
                  : t("newsTrigger.disabledHint")}
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => set("enabled", v)}
              className="shrink-0"
            />
          </div>
        </header>

        <div
          className={cn(
            "px-5 py-6 sm:px-6",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <div className="space-y-8">
            <SettingsBlock
              icon={Clock}
              title={t("newsTrigger.scheduleTitle")}
              description={t("newsTrigger.scheduleDescription")}
            >
              <div
                className="flex gap-2 rounded-lg border border-border/60 bg-muted/20 p-1"
                role="radiogroup"
                aria-label={t("newsTrigger.scheduleAria")}
              >
                {scheduleOptions.map((opt) => {
                  const active = form.schedule === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={disabled}
                      role="radio"
                      aria-checked={active}
                      onClick={() => set("schedule", opt.value)}
                      className={cn(
                        "flex flex-1 flex-col items-center rounded-md px-3 py-2.5 text-center transition",
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                      )}
                    >
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span
                        className={cn(
                          "mt-0.5 text-[11px]",
                          active
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        {opt.detail}
                      </span>
                    </button>
                  )
                })}
              </div>
            </SettingsBlock>

            <SettingsBlock
              icon={Globe}
              title={t("newsTrigger.sourceTitle")}
              description={t("newsTrigger.sourceDescription")}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t("newsTrigger.country")}>
                  <Select
                    disabled={disabled}
                    value={form.country}
                    onValueChange={(v) => v && set("country", v)}
                  >
                    <SelectTrigger className="w-full bg-background">
                      <span className="truncate">{countryLabel}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {newsCountries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("newsTrigger.language")}>
                  <Select
                    disabled={disabled}
                    value={form.language}
                    onValueChange={(v) => v && set("language", v)}
                  >
                    <SelectTrigger className="w-full bg-background">
                      <span className="truncate">{languageLabel}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {newsLanguages.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("newsTrigger.category")}>
                  <Select
                    disabled={disabled}
                    value={form.category}
                    onValueChange={(v) =>
                      set("category", v as NewsTriggerCategory)
                    }
                  >
                    <SelectTrigger className="w-full bg-background">
                      <span className="truncate">{categoryLabel}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {newsCategories.map((c) => (
                        <SelectItem key={c.value || "all"} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </SettingsBlock>

            <SettingsBlock
              icon={Hash}
              title={t("newsTrigger.keywordsTitle")}
              description={t("newsTrigger.keywordsDescription")}
            >
              <KeywordTagInput
                keywords={form.keywords}
                disabled={disabled}
                onChange={(keywords) => set("keywords", keywords)}
              />
            </SettingsBlock>

            <div className="grid gap-8 md:grid-cols-2">
              <SettingsBlock
                icon={SlidersHorizontal}
                title={t("newsTrigger.limitsTitle")}
                description={t("newsTrigger.limitsDescription")}
              >
                <div className="space-y-4">
                  <Field label={t("newsTrigger.maxPostsPerDay")}>
                    <Select
                      disabled={disabled}
                      value={String(form.maxPostsPerDay)}
                      onValueChange={(v) => set("maxPostsPerDay", Number(v))}
                    >
                      <SelectTrigger className="w-full bg-background">
                        <span>
                          {t("newsTrigger.postsPerDay", { count: form.maxPostsPerDay })}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{t("newsTrigger.postsOption", { count: 1 })}</SelectItem>
                        <SelectItem value="2">{t("newsTrigger.postsOption", { count: 2 })}</SelectItem>
                        <SelectItem value="3">{t("newsTrigger.postsOption", { count: 3 })}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={t("newsTrigger.minRelevanceScore")}>
                    <Select
                      disabled={disabled}
                      value={String(form.minRelevanceScore)}
                      onValueChange={(v) =>
                        set("minRelevanceScore", Number(v))
                      }
                    >
                      <SelectTrigger className="w-full bg-background">
                        <span>
                          {form.minRelevanceScore}
                          {form.minRelevanceScore === 70
                            ? t("newsTrigger.relevanceBalanced")
                            : form.minRelevanceScore >= 80
                              ? t("newsTrigger.relevanceStrict")
                              : t("newsTrigger.relevanceBroad")}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="60">{t("newsTrigger.relevance60")}</SelectItem>
                        <SelectItem value="70">{t("newsTrigger.relevance70")}</SelectItem>
                        <SelectItem value="80">{t("newsTrigger.relevance80")}</SelectItem>
                        <SelectItem value="90">{t("newsTrigger.relevance90")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </SettingsBlock>

              <SettingsBlock
                icon={ShieldCheck}
                title={t("newsTrigger.reviewTitle")}
                description={t("newsTrigger.reviewDescription")}
              >
                <div className="space-y-2">
                  <ReviewOption
                    disabled={disabled}
                    checked={!form.autoApprove}
                    onSelect={() => set("autoApprove", false)}
                    title={t("newsTrigger.draftReviewTitle")}
                    badge={t("newsTrigger.recommended")}
                    badgeTone="primary"
                    description={t("newsTrigger.draftReviewDescription")}
                  />
                  <ReviewOption
                    disabled={disabled}
                    checked={form.autoApprove}
                    onSelect={() => setShowWarning(true)}
                    title={t("newsTrigger.autoApproveTitle")}
                    description={t("newsTrigger.autoApproveDescription")}
                    tone="caution"
                  />
                </div>
              </SettingsBlock>
            </div>
          </div>
        </div>

        <footer className="border-t border-border/50 bg-muted/15 px-5 py-4 sm:px-6">
          {displayRun ? (
            <LastRunPanel run={displayRun} ruleId={ruleId} t={t} />
          ) : null}
          {form.totalTriggeredCount > 0 && (
            <p className="mb-3 text-center text-xs text-muted-foreground sm:text-left">
              {t("newsTrigger.generatedCount", { count: form.totalTriggeredCount })}
              {form.lastTriggeredAt && (
                <>
                  {t("newsTrigger.lastTriggered", {
                    date: new Date(form.lastTriggeredAt).toLocaleDateString(
                      i18n.language === "zh-CN"
                        ? "zh-CN"
                        : i18n.language === "th"
                          ? "th-TH"
                          : undefined,
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    ),
                  })}
                </>
              )}
            </p>
          )}
          <p className="mb-3 text-center text-xs text-muted-foreground sm:text-left">
            {t("newsTrigger.runNowHint")}
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {update.isSuccess ? (
              <p className="text-center text-sm text-emerald-600 sm:text-left">
                {t("newsTrigger.settingsSaved")}
              </p>
            ) : (
              <span className="hidden sm:block" />
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleRunNow}
                disabled={triggerRun.isPending}
              >
                {triggerRun.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {t("newsTrigger.running")}
                  </>
                ) : (
                  <>
                    <Play className="mr-2 size-4" />
                    {t("newsTrigger.runNow")}
                  </>
                )}
              </Button>
              <Button
                className="w-full sm:w-auto sm:min-w-[140px]"
                onClick={handleSave}
                disabled={update.isPending}
              >
                {update.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {t("newsTrigger.saving")}
                  </>
                ) : (
                  t("newsTrigger.saveSettings")
                )}
              </Button>
            </div>
          </div>
        </footer>
      </div>

      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newsTrigger.autoApproveDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("newsTrigger.autoApproveDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWarning(false)}>
              {t("newsTrigger.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                set("autoApprove", true)
                setShowWarning(false)
              }}
            >
              {t("newsTrigger.yesEnable")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function runStatusFromNotificationData(
  data: Record<string, unknown> | undefined,
): NewsTriggerRunStatusResponse | null {
  if (!data) return null

  const runId = data.runId
  const status = data.status
  const message = data.message
  if (
    typeof runId !== "string" ||
    typeof message !== "string" ||
    (status !== "running" && status !== "completed" && status !== "failed")
  ) {
    return null
  }

  const outcome = data.outcome
  return {
    runId,
    status,
    message,
    ...(outcome === "triggered" || outcome === "skipped"
      ? { outcome }
      : {}),
    ...(typeof data.articlesFetched === "number"
      ? { articlesFetched: data.articlesFetched }
      : {}),
    ...(typeof data.pipelinesTriggered === "number"
      ? { pipelinesTriggered: data.pipelinesTriggered }
      : {}),
    ...(typeof data.articleTitle === "string"
      ? { articleTitle: data.articleTitle }
      : {}),
    ...(typeof data.relevanceScore === "number"
      ? { relevanceScore: data.relevanceScore }
      : {}),
    ...(typeof data.pipelineId === "string"
      ? { pipelineId: data.pipelineId }
      : {}),
    ...(typeof data.skipReason === "string"
      ? { skipReason: data.skipReason }
      : {}),
    ...(typeof data.completedAt === "string"
      ? { completedAt: data.completedAt }
      : {}),
  }
}

function runStatusLabel(
  run: NewsTriggerRunStatusResponse,
  t: (key: string) => string,
): string {
  if (run.status === "running") return t("newsTrigger.runStatusRunning")
  if (run.status === "failed") return t("newsTrigger.runStatusFailed")
  if (run.outcome === "triggered") return t("newsTrigger.runStatusStarted")

  const reason = run.skipReason?.toLowerCase() ?? ""
  if (reason.includes("keyword pre-filter")) {
    return t("newsTrigger.runStatusKeywordSkip")
  }
  if (reason.includes("below threshold") || reason.includes("score")) {
    return t("newsTrigger.runStatusRelevanceSkip")
  }
  if (reason.includes("max posts per day")) {
    return t("newsTrigger.runStatusDailyLimit")
  }
  if (reason.includes("max concurrent")) {
    return t("newsTrigger.runStatusConcurrentLimit")
  }
  if (reason.includes("no ready workflow")) {
    return t("newsTrigger.runStatusNoWorkflow")
  }
  if (
    reason.includes("no articles") ||
    (run.articlesFetched ?? 0) === 0
  ) {
    return t("newsTrigger.runStatusNoArticles")
  }

  return t("newsTrigger.runStatusNoMatch")
}

function runStatusBadgeClass(run: NewsTriggerRunStatusResponse): string {
  if (run.status === "running") {
    return "bg-primary/15 text-primary"
  }
  if (run.status === "failed") {
    return "bg-destructive/15 text-destructive"
  }
  if (run.outcome === "triggered") {
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
  }
  return "bg-amber-500/15 text-amber-800 dark:text-amber-300"
}

function LastRunPanel({
  run,
  ruleId,
  t,
}: {
  run: NewsTriggerRunStatusResponse
  ruleId: string
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <div className="mb-4 rounded-lg border border-border/60 bg-background/60 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{t("newsTrigger.lastRun")}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {run.message}
          </p>
          {run.completedAt ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {new Date(run.completedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            runStatusBadgeClass(run),
          )}
        >
          {runStatusLabel(run, t)}
        </span>
      </div>
      {run.pipelineId ? (
        <Link
          to={`/workflow/${ruleId}?pipelineId=${run.pipelineId}`}
          className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
        >
          {t("newsTrigger.viewGeneration")}
        </Link>
      ) : null}
      {run.status === "running" ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("newsTrigger.checkingHeadlines")}
        </div>
      ) : null}
    </div>
  )
}

function SettingsBlock({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex gap-2.5">
        <Icon
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
        />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="pl-6 sm:pl-[26px]">{children}</div>
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function ReviewOption({
  checked,
  disabled,
  onSelect,
  title,
  description,
  badge,
  badgeTone = "muted",
  tone = "default",
}: {
  checked: boolean
  disabled?: boolean
  onSelect: () => void
  title: string
  description: string
  badge?: string
  badgeTone?: "primary" | "muted"
  tone?: "default" | "caution"
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition",
        checked && tone === "default" && "border-primary/40 bg-primary/5",
        checked && tone === "caution" && "border-destructive/40 bg-destructive/5",
        !checked && "border-border/60 hover:border-border",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <input
        type="radio"
        name="approval"
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="mt-1 size-3.5 accent-primary"
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "flex flex-wrap items-center gap-2 text-sm font-medium",
            tone === "caution" && checked && "text-destructive",
          )}
        >
          {title}
          {badge ? (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                badgeTone === "primary" &&
                  "bg-primary/15 text-primary",
                badgeTone === "muted" &&
                  "bg-muted text-muted-foreground",
              )}
            >
              {badge}
            </span>
          ) : null}
        </p>
        <p
          className={cn(
            "mt-0.5 text-xs leading-relaxed text-muted-foreground",
            tone === "caution" && checked && "text-destructive/80",
          )}
        >
          {description}
        </p>
      </div>
    </label>
  )
}
