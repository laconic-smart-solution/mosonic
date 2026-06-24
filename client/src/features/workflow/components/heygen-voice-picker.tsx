import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { Pause, Play } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import {
  HEYGEN_VOICE_PAGE_SIZE,
  heygenService,
  type HeygenVoice,
} from "@/shared/services/heygen.service"

export type VoiceGenderFilter = "all" | "male" | "female"

const VOICE_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Thai",
  "Japanese",
  "Chinese",
  "Korean",
  "Hindi",
  "Arabic",
] as const

function formatGenderLabel(
  gender: string | undefined,
  t: TFunction<"workflow">,
): string | null {
  const g = gender?.trim().toLowerCase()
  if (g === "male") return t("voicePicker.genderMale")
  if (g === "female") return t("voicePicker.genderFemale")
  return null
}

function voiceLabel(v: HeygenVoice, t: TFunction<"workflow">): string {
  const gender = formatGenderLabel(v.gender, t)
  const lang = v.language?.trim()
  const parts = [v.name]
  if (lang) parts.push(`(${lang})`)
  if (gender) parts.push(`· ${gender}`)
  return parts.join(" ")
}

type HeygenVoicePickerProps = {
  value: string
  selectionDisabled?: boolean
  compact?: boolean
  onChange: (voiceId: string) => void
}

export function HeygenVoicePicker({
  value,
  selectionDisabled,
  compact,
  onChange,
}: HeygenVoicePickerProps) {
  const { t } = useTranslation(["workflow", "common"])
  const [genderFilter, setGenderFilter] = useState<VoiceGenderFilter>("all")
  const [language, setLanguage] = useState<string>("English")
  const [search, setSearch] = useState("")
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const voicesQuery = useInfiniteQuery({
    queryKey: ["heygen", "voices", genderFilter, language],
    queryFn: ({ pageParam }) =>
      heygenService.listVoicesPage({
        language: language.trim() || undefined,
        gender: genderFilter === "all" ? undefined : genderFilter,
        limit: HEYGEN_VOICE_PAGE_SIZE,
        token: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.hasMore && last.nextToken ? last.nextToken : undefined,
    staleTime: 5 * 60 * 1000,
  })

  const loadedVoices = useMemo(
    () => voicesQuery.data?.pages.flatMap((p) => p.voices) ?? [],
    [voicesQuery.data],
  )

  const filteredVoices = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return loadedVoices
    return loadedVoices.filter((v) => v.name.toLowerCase().includes(q))
  }, [loadedVoices, search])

  const selectedInList = loadedVoices.find((v) => v.voiceId === value)
  const needsSelectedFetch = Boolean(value?.trim()) && !selectedInList

  const selectedVoiceQuery = useQuery({
    queryKey: ["heygen", "voice", value],
    queryFn: () => heygenService.getVoice(value),
    enabled: needsSelectedFetch,
    staleTime: 10 * 60 * 1000,
  })

  const selected: HeygenVoice | undefined =
    selectedInList ?? selectedVoiceQuery.data ?? undefined

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    revokeObjectUrl()
    setPlayingId(null)
    setPreviewLoadingId(null)
  }, [revokeObjectUrl])

  useEffect(() => () => stopPreview(), [stopPreview])

  useEffect(() => {
    setSearch("")
  }, [genderFilter, language])

  const playPreview = useCallback(
    async (voice: HeygenVoice, e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (playingId === voice.voiceId && audioRef.current) {
        stopPreview()
        return
      }

      stopPreview()
      setPreviewError(null)
      setPreviewLoadingId(voice.voiceId)

      try {
        const blob = await heygenService.fetchVoicePreviewBlob(voice.voiceId)
        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio
        setPlayingId(voice.voiceId)
        setPreviewLoadingId(null)
        audio.onended = () => stopPreview()
        audio.onerror = () => {
          setPreviewError(
            t("voicePicker.previewPlayFailed", { name: voice.name }),
          )
          stopPreview()
        }
        await audio.play()
      } catch {
        setPreviewError(
          t("voicePicker.previewLoadFailed", { name: voice.name }),
        )
        stopPreview()
      }
    },
    [playingId, stopPreview, t],
  )

  const textSize = compact ? "text-[10px]" : "text-[11px]"
  const inputClass = cn(
    "w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground",
    textSize,
  )
  const hasMore = Boolean(voicesQuery.hasNextPage)
  const isLoading = voicesQuery.isLoading
  const isFetchingMore = voicesQuery.isFetchingNextPage

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {(["all", "male", "female"] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setGenderFilter(filter)}
            className={cn(
              "rounded-md border px-2 py-0.5 font-medium capitalize transition-colors",
              textSize,
              genderFilter === filter
                ? "border-teal-500 bg-teal-50 text-teal-800 dark:border-teal-400 dark:bg-teal-950/60 dark:text-teal-300"
                : "border-transparent bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {filter === "all"
              ? t("voicePicker.genderAll")
              : filter === "male"
                ? t("voicePicker.genderMale")
                : t("voicePicker.genderFemale")}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className={cn("mb-1 block text-muted-foreground", textSize)}>
            {t("voicePicker.language")}
          </span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className={inputClass}
          >
            {VOICE_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1">
          <span className={cn("mb-1 block text-muted-foreground", textSize)}>
            {t("voicePicker.search")}
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("voicePicker.searchPlaceholder")}
            className={inputClass}
          />
        </label>
      </div>

      {selected ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5",
            textSize,
          )}
        >
          <VoicePreviewButton
            voice={selected}
            playing={playingId === selected.voiceId}
            loading={previewLoadingId === selected.voiceId}
            onClick={(e) => void playPreview(selected, e)}
            size={compact ? "sm" : "md"}
          />
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
            {selectedVoiceQuery.isLoading && needsSelectedFetch
              ? t("voicePicker.loadingSelection")
              : voiceLabel(selected, t)}
          </span>
          {formatGenderLabel(selected.gender, t) ? (
            <GenderBadge gender={selected.gender!} compact={compact} />
          ) : null}
        </div>
      ) : (
        <p className={cn("text-muted-foreground", textSize)}>
          {t("voicePicker.noVoiceSelected")}
        </p>
      )}

      <div
        className="max-h-44 overflow-y-auto rounded-md border border-border bg-background"
        role="listbox"
        aria-label={t("voicePicker.voicesAria")}
      >
        {isLoading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-muted-foreground">
            <Spinner className="size-3" />
            <span className={textSize}>{t("voicePicker.loadingVoices")}</span>
          </div>
        ) : voicesQuery.isError ? (
          <p className={cn("px-2 py-3 text-red-600", textSize)}>
            {t("voicePicker.loadVoicesFailed")}
          </p>
        ) : filteredVoices.length === 0 ? (
          <p className={cn("px-2 py-3 text-muted-foreground", textSize)}>
            {search.trim()
              ? t("voicePicker.noSearchResults")
              : t("voicePicker.noFilterResults")}
          </p>
        ) : (
          filteredVoices.map((voice) => {
            const isSelected = value === voice.voiceId
            const genderLabel = formatGenderLabel(voice.gender, t)
            return (
              <button
                key={voice.voiceId}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={selectionDisabled}
                onClick={() => {
                  if (selectionDisabled) return
                  stopPreview()
                  onChange(voice.voiceId)
                }}
                className={cn(
                  "flex w-full items-center gap-2 border-b border-border px-2 py-1.5 text-left last:border-b-0",
                  textSize,
                  isSelected
                    ? "bg-teal-50 dark:bg-teal-950/40"
                    : "bg-background hover:bg-muted/50",
                  selectionDisabled && "cursor-default",
                )}
              >
                <VoicePreviewButton
                  voice={voice}
                  playing={playingId === voice.voiceId}
                  loading={previewLoadingId === voice.voiceId}
                  onClick={(e) => void playPreview(voice, e)}
                  size={compact ? "sm" : "md"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {voice.name}
                  </span>
                  <span className="block truncate text-muted-foreground">
                    {voice.language || t("voicePicker.unknownLanguage")}
                  </span>
                </span>
                {genderLabel ? (
                  <GenderBadge gender={voice.gender!} compact={compact} />
                ) : null}
              </button>
            )
          })
        )}

        {hasMore && !search.trim() ? (
          <div className="border-t border-border px-2 py-2">
            <button
              type="button"
              disabled={isFetchingMore}
              onClick={() => void voicesQuery.fetchNextPage()}
              className={cn(
                "w-full rounded-md border border-teal-200 bg-teal-50 py-1.5 font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-60 dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-950/60",
                textSize,
              )}
            >
              {isFetchingMore ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Spinner className="size-3" />
                  {t("common:actions.loading")}
                </span>
              ) : (
                t("voicePicker.loadMore", { count: loadedVoices.length })
              )}
            </button>
          </div>
        ) : null}
      </div>

      {!isLoading && !search.trim() ? (
        <p className={cn("text-muted-foreground/70", compact ? "text-[9px]" : "text-[10px]")}>
          Showing {loadedVoices.length} voice{loadedVoices.length === 1 ? "" : "s"}
          {hasMore ? " — load more for additional options" : ""}.
        </p>
      ) : null}

      {previewError ? (
        <p className={cn("text-red-600", textSize)}>{previewError}</p>
      ) : null}
      {selectionDisabled ? (
        <p className={cn("text-amber-700 dark:text-amber-400", textSize)}>
          Save the workflow to select a voice. You can still preview loaded voices.
        </p>
      ) : null}
    </div>
  )
}

function GenderBadge({
  gender,
  compact,
}: {
  gender: string
  compact?: boolean
}) {
  const { t } = useTranslation("workflow")
  const label = formatGenderLabel(gender, t)
  if (!label) return null
  const isMale = gender.toLowerCase() === "male"
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide",
        compact ? "text-[8px]" : "text-[9px]",
        isMale
          ? "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
          : "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
      )}
    >
      {label}
    </span>
  )
}

function VoicePreviewButton({
  voice,
  playing,
  loading,
  onClick,
  size,
}: {
  voice: HeygenVoice
  playing: boolean
  loading?: boolean
  onClick: (e: React.MouseEvent) => void
  size: "sm" | "md"
}) {
  const { t } = useTranslation("workflow")
  const dim = size === "sm" ? "size-6" : "size-7"
  const icon = size === "sm" ? "size-3" : "size-3.5"
  const canPlay = Boolean(voice.voiceId?.trim())

  return (
    <button
      type="button"
      aria-label={
        playing
          ? t("voicePicker.stopPreview", { name: voice.name })
          : t("voicePicker.playPreview", { name: voice.name })
      }
      disabled={!canPlay || loading}
      onClick={onClick}
      className={cn(
        "nodrag nopan flex shrink-0 items-center justify-center rounded-full border transition-colors",
        dim,
        canPlay && !loading
          ? "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-950/60"
          : "cursor-not-allowed border-border bg-muted text-muted-foreground/50",
        playing && "border-teal-600 bg-teal-600 text-white hover:bg-teal-700 dark:border-teal-500 dark:bg-teal-500",
      )}
    >
      {loading ? (
        <Spinner className={icon} />
      ) : playing ? (
        <Pause className={icon} fill="currentColor" />
      ) : (
        <Play className={cn(icon, "ml-0.5")} fill="currentColor" />
      )}
    </button>
  )
}
