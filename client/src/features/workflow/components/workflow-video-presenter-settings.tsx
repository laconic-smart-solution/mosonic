import { useCallback, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { T } from "@/lib/tokens"
import { mergeHeygenVideoConfig } from "@/features/workflow/lib/workflow-node-validation"
import { VIDEO_CINEMATIC_UI_ENABLED } from "@/features/workflow/lib/video-generation-ui"
import { HeygenVoicePicker } from "@/features/workflow/components/heygen-voice-picker"
import {
  heygenService,
  type HeygenAvatarLook,
} from "@/shared/services/heygen.service"

const ACCEPT = "image/png,image/jpeg,image/jpg"
const MAX_BYTES = 32 * 1024 * 1024
const HEYGEN_AVATARS_QUERY_KEY = ["heygen", "avatars"] as const

function removeAvatarFromCache(queryClient: QueryClient, lookId: string) {
  queryClient.setQueryData<HeygenAvatarLook[]>(HEYGEN_AVATARS_QUERY_KEY, (old) =>
    (old ?? []).filter((avatar) => avatar.lookId !== lookId),
  )
}

function upsertAvatarInCache(queryClient: QueryClient, look: HeygenAvatarLook) {
  queryClient.setQueryData<HeygenAvatarLook[]>(HEYGEN_AVATARS_QUERY_KEY, (old) => {
    const list = old ?? []
    const index = list.findIndex((avatar) => avatar.lookId === look.lookId)
    if (index === -1) return [look, ...list]
    const next = [...list]
    next[index] = { ...next[index], ...look }
    return next
  })
}

function uploadResultToAvatarLook(
  result: { heygenAvatarId: string; previewUrl: string },
  fileName: string,
): HeygenAvatarLook {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim()
  return {
    lookId: result.heygenAvatarId,
    name: baseName || "Uploaded avatar",
    avatarType: "photo_avatar",
    previewImageUrl: result.previewUrl,
    deletable: true,
  }
}

type WorkflowVideoPresenterSettingsProps = {
  workflowId: string | undefined
  nodeId: string
  config: Record<string, unknown>
  onPatch: (patch: Record<string, unknown>) => void
  compact?: boolean
  /** When false, skip workflow-node API calls (Generate more before node is saved). */
  persistToServer?: boolean
}

function isAvatarSelectable(look: HeygenAvatarLook): boolean {
  if (!look.status) return true
  return look.status === "completed"
}

export function WorkflowVideoPresenterSettings({
  workflowId,
  nodeId,
  config,
  onPatch,
  compact = false,
  persistToServer = true,
}: WorkflowVideoPresenterSettingsProps) {
  const { t } = useTranslation("workflow")
  const queryClient = useQueryClient()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bgInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<"avatar" | "background" | null>(null)
  const [deletingLookId, setDeletingLookId] = useState<string | null>(null)
  const [removedLookIds, setRemovedLookIds] = useState<string[]>([])
  const [pendingUploadedAvatars, setPendingUploadedAvatars] = useState<
    HeygenAvatarLook[]
  >([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const avatarsQuery = useQuery({
    queryKey: HEYGEN_AVATARS_QUERY_KEY,
    queryFn: () => heygenService.listAvatars(),
    staleTime: 0,
  })

  const visibleAvatars = useMemo(() => {
    const removed = new Set(removedLookIds)
    const fromQuery = (avatarsQuery.data ?? []).filter(
      (avatar) => !removed.has(avatar.lookId),
    )
    const queryIds = new Set(fromQuery.map((avatar) => avatar.lookId))
    const pending = pendingUploadedAvatars.filter(
      (avatar) => !removed.has(avatar.lookId) && !queryIds.has(avatar.lookId),
    )
    return [...pending, ...fromQuery]
  }, [avatarsQuery.data, removedLookIds, pendingUploadedAvatars])

  const canSyncToServer =
    persistToServer && Boolean(workflowId?.trim()) && Boolean(nodeId?.trim())
  const canUploadAssets = true
  const selectedAvatarId = String(config.heygenAvatarId ?? "")
  const motionPrompt = String(config.heygenMotionPrompt ?? "")

  const persistPatch = useCallback(
    async (patch: Record<string, unknown>) => {
      const merged = mergeHeygenVideoConfig(config, patch)
      onPatch(merged)
      if (!canSyncToServer) return
      try {
        await heygenService.patchPresenterConfig(workflowId!, nodeId, patch)
      } catch {
        setUploadError(t("presenter.saveFailed"))
      }
    },
    [canSyncToServer, config, workflowId, nodeId, onPatch, t],
  )

  const handleSelectAvatar = useCallback(
    (look: HeygenAvatarLook) => {
      if (!isAvatarSelectable(look)) return
      const patch: Record<string, unknown> = {
        mode: "presenter",
        heygenAvatarId: look.lookId,
        heygenAvatarPhotoUrl: look.previewImageUrl ?? "",
      }
      if (look.defaultVoiceId && !String(config.heygenVoiceId ?? "").trim()) {
        patch.heygenVoiceId = look.defaultVoiceId
      }
      void persistPatch(patch)
    },
    [config.heygenVoiceId, persistPatch],
  )

  const handleClearAvatar = useCallback(() => {
    onPatch(
      mergeHeygenVideoConfig(config, {
        heygenAvatarId: "",
        heygenAvatarPhotoUrl: "",
        heygenAvatarAssetId: "",
        mode: VIDEO_CINEMATIC_UI_ENABLED ? "cinematic" : "presenter",
      }),
    )
  }, [config, onPatch])

  const handleDeleteAvatar = useCallback(
    async (look: HeygenAvatarLook) => {
      setUploadError(null)
      setDeletingLookId(look.lookId)
      try {
        await heygenService.deleteAvatar(look.lookId)
        if (selectedAvatarId === look.lookId) {
          onPatch(
            mergeHeygenVideoConfig(config, {
              heygenAvatarId: "",
              heygenAvatarPhotoUrl: "",
              heygenAvatarAssetId: "",
              mode: VIDEO_CINEMATIC_UI_ENABLED ? "cinematic" : "presenter",
            }),
          )
        }
        setRemovedLookIds((prev) =>
          prev.includes(look.lookId) ? prev : [...prev, look.lookId],
        )
        setPendingUploadedAvatars((prev) =>
          prev.filter((avatar) => avatar.lookId !== look.lookId),
        )
        removeAvatarFromCache(queryClient, look.lookId)
        await queryClient.refetchQueries({ queryKey: HEYGEN_AVATARS_QUERY_KEY })
        removeAvatarFromCache(queryClient, look.lookId)
        toast.success(t("presenter.deleteSuccess", { name: look.name }))
      } catch (e) {
        const message =
          e instanceof Error ? e.message : t("presenter.deleteFailed")
        setUploadError(message)
        toast.error(message)
      } finally {
        setDeletingLookId(null)
      }
    },
    [config, selectedAvatarId, onPatch, queryClient, t],
  )

  const handleFile = useCallback(
    async (kind: "avatar" | "background", file: File | undefined) => {
      if (!file || !canUploadAssets) return
      if (file.size > MAX_BYTES) {
        setUploadError(t("presenter.fileTooLarge"))
        return
      }
      setUploadError(null)
      setUploading(kind)
      try {
        if (kind === "avatar") {
          const result =
            canSyncToServer && workflowId
              ? await heygenService.uploadAvatar(workflowId, nodeId, file)
              : await heygenService.uploadAvatarDraft(file)
          const optimisticLook = uploadResultToAvatarLook(result, file.name)
          upsertAvatarInCache(queryClient, optimisticLook)
          setPendingUploadedAvatars((prev) => [
            optimisticLook,
            ...prev.filter((avatar) => avatar.lookId !== optimisticLook.lookId),
          ])
          onPatch(
            mergeHeygenVideoConfig(config, {
              mode: "presenter",
              heygenAvatarId: result.heygenAvatarId,
              heygenAvatarAssetId: result.heygenAvatarAssetId,
              heygenAvatarPhotoUrl: result.previewUrl,
            }),
          )
          await queryClient.refetchQueries({ queryKey: HEYGEN_AVATARS_QUERY_KEY })
          upsertAvatarInCache(queryClient, optimisticLook)
          const freshAvatars =
            queryClient.getQueryData<HeygenAvatarLook[]>(
              HEYGEN_AVATARS_QUERY_KEY,
            ) ?? []
          if (freshAvatars.some((avatar) => avatar.lookId === optimisticLook.lookId)) {
            setPendingUploadedAvatars((prev) =>
              prev.filter((avatar) => avatar.lookId !== optimisticLook.lookId),
            )
          }
          toast.success(t("presenter.uploadSuccess", { name: optimisticLook.name }))
        } else {
          const result =
            canSyncToServer && workflowId
              ? await heygenService.uploadBackground(workflowId, nodeId, file)
              : await heygenService.uploadBackgroundDraft(file)
          onPatch({
            heygenBackgroundAssetId: result.heygenBackgroundAssetId,
            heygenBackgroundUrl: result.previewUrl,
            removeBackground: true,
          })
          toast.success(t("presenter.backgroundUploadSuccess"))
        }
      } catch (e) {
        const message =
          e instanceof Error ? e.message : t("presenter.uploadFailed")
        setUploadError(message)
        toast.error(message)
      } finally {
        setUploading(null)
      }
    },
    [
      canUploadAssets,
      canSyncToServer,
      config,
      workflowId,
      nodeId,
      onPatch,
      queryClient,
      t,
    ],
  )

  const handleMotionPromptBlur = useCallback(() => {
    void persistPatch({ heygenMotionPrompt: motionPrompt })
  }, [motionPrompt, persistPatch])

  const labelClass = cn(
    "mb-1.5 block font-bold",
    compact ? "text-[10px]" : "text-[11px]",
  )

  const avatarUrl = String(config.heygenAvatarPhotoUrl ?? "")
  const bgUrl = String(config.heygenBackgroundUrl ?? "")
  const voiceId = String(config.heygenVoiceId ?? "")

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className={labelClass} style={{ color: T.textPrimary, marginBottom: 0 }}>
            {t("presenter.avatar")}
          </p>
          {selectedAvatarId ? (
            <button
              type="button"
              onClick={handleClearAvatar}
              className="text-[10px] text-gray-500 underline hover:text-gray-700"
            >
              {t("presenter.clearSelection")}
            </button>
          ) : null}
        </div>

        {avatarsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-2 text-[11px] text-gray-500">
            <Spinner className="size-3" />
            {t("presenter.loadingAvatars")}
          </div>
        ) : avatarsQuery.isError ? (
          <p className="text-[11px] text-red-600">
            {t("presenter.loadAvatarsFailed")}
          </p>
        ) : visibleAvatars.length === 0 ? (
          <p className="text-[11px] text-gray-500">
            {t("presenter.noAvatars")}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {visibleAvatars.map((look) => {
              const selected = selectedAvatarId === look.lookId
              const selectable = isAvatarSelectable(look)
              const busy = deletingLookId === look.lookId

              return (
                <div
                  key={look.lookId}
                  className={cn(
                    "group relative overflow-hidden rounded-lg border bg-[#FDFCFA]",
                    selected && "ring-2 ring-teal-500",
                    !selectable && "opacity-60",
                  )}
                  style={{ borderColor: T.surfaceBorder }}
                >
                  <button
                    type="button"
                    disabled={!selectable || busy}
                    onClick={() => handleSelectAvatar(look)}
                    className="flex w-full flex-col items-center gap-1 p-2 text-left disabled:cursor-not-allowed"
                  >
                    {look.previewImageUrl ? (
                      <img
                        src={look.previewImageUrl}
                        alt=""
                        className="aspect-square w-full rounded object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center rounded bg-gray-100 text-[10px] text-gray-400">
                        No preview
                      </div>
                    )}
                    <span className="line-clamp-2 w-full text-center text-[10px] font-medium text-gray-700">
                      {look.name}
                    </span>
                    {look.status && look.status !== "completed" ? (
                      <span className="text-[9px] capitalize text-amber-700">
                        {look.status}
                      </span>
                    ) : null}
                  </button>

                  {look.deletable ? (
                    <button
                      type="button"
                      aria-label={`Delete ${look.name}`}
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleDeleteAvatar(look)
                      }}
                      className="absolute right-1 top-1 rounded bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
                    >
                      {busy ? (
                        <Spinner className="size-3" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <UploadSlot
        label={t("presenter.uploadNewAvatar")}
        hint={t("presenter.uploadAvatarHint")}
        uploadLabel={t("presenter.clickOrDrag")}
        uploadingLabel={t("presenter.uploading")}
        previewUrl={avatarUrl && !selectedAvatarId ? avatarUrl : ""}
        disabled={!canUploadAssets || uploading !== null}
        busy={uploading === "avatar"}
        inputRef={avatarInputRef}
        onPick={() => avatarInputRef.current?.click()}
        onFile={(f) => void handleFile("avatar", f)}
      />

      <UploadSlot
        label={t("presenter.backgroundImage")}
        hint={t("presenter.backgroundHint")}
        uploadLabel={t("presenter.clickOrDrag")}
        uploadingLabel={t("presenter.uploading")}
        previewUrl={bgUrl}
        disabled={!canUploadAssets || uploading !== null}
        busy={uploading === "background"}
        inputRef={bgInputRef}
        onPick={() => bgInputRef.current?.click()}
        onFile={(f) => void handleFile("background", f)}
      />

      <div>
        <label className={labelClass} style={{ color: T.textPrimary }}>
          {t("presenter.voice")}
        </label>
        <p
          className={cn(
            "mb-2 text-gray-500",
            compact ? "text-[9px]" : "text-[10px]",
          )}
        >
          Pick language and gender, load more as needed, then select a voice.
        </p>
        <HeygenVoicePicker
          value={voiceId}
          selectionDisabled={false}
          compact={compact}
          onChange={(nextVoice) => {
            const patch: Record<string, unknown> = { heygenVoiceId: nextVoice }
            if (selectedAvatarId) {
              patch.mode = "presenter"
            }
            const merged = mergeHeygenVideoConfig(config, patch)
            onPatch(merged)
            if (canSyncToServer && nextVoice) {
              void heygenService
                .patchPresenterConfig(workflowId!, nodeId, patch)
                .catch(() => {
                  setUploadError(t("presenter.voiceSaveFailed"))
                })
            }
          }}
        />
      </div>

      <div>
        <label className={labelClass} style={{ color: T.textPrimary }}>
          {t("fields.video.heygenMotionPrompt.label")}
        </label>
        <Textarea
          value={motionPrompt}
          onChange={(e) => onPatch({ heygenMotionPrompt: e.target.value })}
          onBlur={handleMotionPromptBlur}
          rows={2}
          maxLength={500}
          className={cn(
            "mt-1 min-h-[56px] resize-y bg-background leading-relaxed",
            compact ? "text-xs" : "text-sm",
          )}
          placeholder={t("fields.video.heygenMotionPrompt.placeholder", {
            defaultValue: "",
          })}
        />
      </div>

      {uploadError ? (
        <p className="text-[11px] text-red-600">{uploadError}</p>
      ) : null}
    </div>
  )
}

function UploadSlot({
  label,
  hint,
  uploadLabel,
  uploadingLabel,
  previewUrl,
  disabled,
  busy,
  inputRef,
  onPick,
  onFile,
}: {
  label: string
  hint: string
  uploadLabel: string
  uploadingLabel: string
  previewUrl: string
  disabled: boolean
  busy: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onPick: () => void
  onFile: (file: File | undefined) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div>
      <p className="mb-1 text-[11px] font-bold" style={{ color: T.textPrimary }}>
        {label}
      </p>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onPick()
        }}
        onClick={() => {
          if (!disabled) onPick()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (disabled) return
          const file = e.dataTransfer.files?.[0]
          onFile(file)
        }}
        className={cn(
          "flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-4 text-center transition-colors",
          dragOver && "border-teal-400 bg-teal-50/50",
          disabled && "cursor-not-allowed opacity-60",
        )}
        style={{ borderColor: dragOver ? undefined : T.surfaceBorder }}
      >
        {busy ? (
          <>
            <Spinner className="size-4" />
            <span className="text-[11px] text-gray-500">{uploadingLabel}</span>
          </>
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="max-h-20 max-w-full rounded object-contain"
          />
        ) : (
          <span className="text-[11px] text-gray-500">{uploadLabel}</span>
        )}
        <span className="text-[10px] text-gray-400">{hint}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ""
        }}
      />
    </div>
  )
}
