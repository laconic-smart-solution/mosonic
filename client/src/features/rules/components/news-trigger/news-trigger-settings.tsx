import { useEffect, useRef, useState } from "react"
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

const NEWS_COUNTRIES = [
  { code: "th", label: "Thailand" },
  { code: "us", label: "United States" },
  { code: "gb", label: "United Kingdom" },
  { code: "sg", label: "Singapore" },
  { code: "jp", label: "Japan" },
  { code: "au", label: "Australia" },
  { code: "my", label: "Malaysia" },
  { code: "id", label: "Indonesia" },
  { code: "in", label: "India" },
  { code: "ph", label: "Philippines" },
  { code: "vn", label: "Vietnam" },
  { code: "de", label: "Germany" },
  { code: "fr", label: "France" },
  { code: "cn", label: "China" },
] as const

const NEWS_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "th", label: "Thai" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "ms", label: "Malay" },
  { code: "id", label: "Indonesian" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "hi", label: "Hindi" },
  { code: "vi", label: "Vietnamese" },
] as const

const NEWS_CATEGORIES: { value: NewsTriggerCategory; label: string }[] = [
  { value: "", label: "All categories" },
  { value: "business", label: "Business" },
  { value: "technology", label: "Technology" },
  { value: "general", label: "General" },
  { value: "entertainment", label: "Entertainment" },
  { value: "health", label: "Health" },
  { value: "science", label: "Science" },
  { value: "sports", label: "Sports" },
]

const SCHEDULE_OPTIONS: {
  value: NewsTriggerSchedule
  label: string
  detail: string
}[] = [
  { value: "daily", label: "Daily", detail: "8:00 AM" },
  { value: "twice_daily", label: "Twice daily", detail: "8:00 AM & 6:00 PM" },
]

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

  const disabled = !form.enabled
  const countryLabel =
    NEWS_COUNTRIES.find((c) => c.code === form.country)?.label ?? form.country
  const languageLabel =
    NEWS_LANGUAGES.find((l) => l.code === form.language)?.label ?? form.language
  const categoryLabel =
    NEWS_CATEGORIES.find((c) => c.value === form.category)?.label ??
    "All categories"

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
          message:
            "News run timed out. Ensure the API worker is running (RUN_WORKERS_IN_API) and Redis is available.",
        }
      })
      toast.error(
        "News run timed out. Check that the background worker is running.",
      )
    }, 90_000)

    return () => window.clearTimeout(timer)
  }, [lastRun?.runId, lastRun?.status])

  const handleRunNow = () => {
    notifiedRunIdRef.current = null
    triggerRun.mutate(undefined, {
      onSuccess: (data) => {
        setLastRun({
          runId: data.runId,
          status: "running",
          message: "News check queued…",
        })
        runningSinceRef.current = Date.now()
      },
      onError: (err) => {
        const msg = getApiErrorMessage(err)
        if (msg.toLowerCase().includes("already in progress")) {
          toast.error("A run is already in progress for this campaign.")
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
        Back to rules
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
                Automation
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">
                News Auto-Generate
              </h1>
              {ruleName ? (
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {ruleName}
                </p>
              ) : null}
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Monitor breaking news and draft campaign content for your review.
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/25 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Enable auto-generate</p>
              <p className="text-xs text-muted-foreground">
                {form.enabled
                  ? form.schedule === "daily"
                    ? "Runs once daily at 8:00 AM (server time)"
                    : "Runs at 8:00 AM and 6:00 PM (server time)"
                  : "Turn on to start scheduled news checks"}
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
              title="Schedule"
              description="How often we fetch and evaluate headlines."
            >
              <div
                className="flex gap-2 rounded-lg border border-border/60 bg-muted/20 p-1"
                role="radiogroup"
                aria-label="Schedule frequency"
              >
                {SCHEDULE_OPTIONS.map((opt) => {
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
              title="News source"
              description="Region and topic filters for the news feed."
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Country">
                  <Select
                    disabled={disabled}
                    value={form.country}
                    onValueChange={(v) => v && set("country", v)}
                  >
                    <SelectTrigger className="w-full bg-background">
                      <span className="truncate">{countryLabel}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {NEWS_COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Language">
                  <Select
                    disabled={disabled}
                    value={form.language}
                    onValueChange={(v) => v && set("language", v)}
                  >
                    <SelectTrigger className="w-full bg-background">
                      <span className="truncate">{languageLabel}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {NEWS_LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Category">
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
                      {NEWS_CATEGORIES.map((c) => (
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
              title="Keywords"
              description="Require at least one keyword in the headline or summary. Leave empty to rely on relevance scoring only."
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
                title="Content limits"
                description="Cap volume and filter low-relevance stories."
              >
                <div className="space-y-4">
                  <Field label="Max posts per day">
                    <Select
                      disabled={disabled}
                      value={String(form.maxPostsPerDay)}
                      onValueChange={(v) => set("maxPostsPerDay", Number(v))}
                    >
                      <SelectTrigger className="w-full bg-background">
                        <span>
                          {form.maxPostsPerDay} post
                          {form.maxPostsPerDay !== 1 ? "s" : ""} per day
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 post per day</SelectItem>
                        <SelectItem value="2">2 posts per day</SelectItem>
                        <SelectItem value="3">3 posts per day</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Min relevance score">
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
                            ? " — Balanced"
                            : form.minRelevanceScore >= 80
                              ? " — Strict"
                              : " — Broad"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="60">60 — Broad match</SelectItem>
                        <SelectItem value="70">
                          70 — Balanced (recommended)
                        </SelectItem>
                        <SelectItem value="80">80 — Strict match</SelectItem>
                        <SelectItem value="90">90 — Very strict</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </SettingsBlock>

              <SettingsBlock
                icon={ShieldCheck}
                title="Content review"
                description="Choose whether drafts need manual approval."
              >
                <div className="space-y-2">
                  <ReviewOption
                    disabled={disabled}
                    checked={!form.autoApprove}
                    onSelect={() => set("autoApprove", false)}
                    title="Draft — review before publishing"
                    badge="Recommended"
                    badgeTone="primary"
                    description="Content lands in drafts. You approve before it goes live."
                  />
                  <ReviewOption
                    disabled={disabled}
                    checked={form.autoApprove}
                    onSelect={() => setShowWarning(true)}
                    title="Auto-approve — skip manual review"
                    description="Approved automatically when generation completes (no auto-publish in v1)."
                    tone="caution"
                  />
                </div>
              </SettingsBlock>
            </div>
          </div>
        </div>

        <footer className="border-t border-border/50 bg-muted/15 px-5 py-4 sm:px-6">
          {displayRun ? (
            <LastRunPanel run={displayRun} ruleId={ruleId} />
          ) : null}
          {form.totalTriggeredCount > 0 && (
            <p className="mb-3 text-center text-xs text-muted-foreground sm:text-left">
              {form.totalTriggeredCount} piece
              {form.totalTriggeredCount !== 1 ? "s" : ""} generated
              {form.lastTriggeredAt && (
                <>
                  {" "}
                  · Last{" "}
                  {new Date(form.lastTriggeredAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </>
              )}
            </p>
          )}
          <p className="mb-3 text-center text-xs text-muted-foreground sm:text-left">
            Run now uses your saved news source, keywords, and relevance settings.
            Counts toward max posts per day.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {update.isSuccess ? (
              <p className="text-center text-sm text-emerald-600 sm:text-left">
                Settings saved
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
                    Running…
                  </>
                ) : (
                  <>
                    <Play className="mr-2 size-4" />
                    Run now
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
                    Saving…
                  </>
                ) : (
                  "Save settings"
                )}
              </Button>
            </div>
          </div>
        </footer>
      </div>

      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable auto-approve?</DialogTitle>
            <DialogDescription>
              Generated content will be approved automatically without manual
              review. Ensure keywords and relevance score are strict enough to
              avoid off-brand posts.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWarning(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                set("autoApprove", true)
                setShowWarning(false)
              }}
            >
              Yes, enable
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

function runStatusLabel(run: NewsTriggerRunStatusResponse): string {
  if (run.status === "running") return "Running"
  if (run.status === "failed") return "Failed"
  if (run.outcome === "triggered") return "Started"
  return "No match"
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
}: {
  run: NewsTriggerRunStatusResponse
  ruleId: string
}) {
  return (
    <div className="mb-4 rounded-lg border border-border/60 bg-background/60 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Last run</p>
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
          {runStatusLabel(run)}
        </span>
      </div>
      {run.pipelineId ? (
        <Link
          to={`/workflow/${ruleId}?pipelineId=${run.pipelineId}`}
          className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
        >
          View generation
        </Link>
      ) : null}
      {run.status === "running" ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Checking headlines…
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
