import { useCallback, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { T } from "@/lib/tokens"
import {
  heygenService,
  type HeygenVoice,
} from "@/shared/services/heygen.service"

const ACCEPT = "image/png,image/jpeg,image/jpg"
const MAX_BYTES = 32 * 1024 * 1024

type WorkflowVideoPresenterSettingsProps = {
  workflowId: string | undefined
  nodeId: string
  config: Record<string, unknown>
  onPatch: (patch: Record<string, unknown>) => void
  compact?: boolean
}

export function WorkflowVideoPresenterSettings({
  workflowId,
  nodeId,
  config,
  onPatch,
  compact = false,
}: WorkflowVideoPresenterSettingsProps) {
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bgInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<"avatar" | "background" | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const voicesQuery = useQuery({
    queryKey: ["heygen", "voices"],
    queryFn: () => heygenService.listVoices(),
    staleTime: 5 * 60 * 1000,
  })

  const canUpload = Boolean(workflowId?.trim())

  const handleFile = useCallback(
    async (kind: "avatar" | "background", file: File | undefined) => {
      if (!file || !workflowId) return
      if (file.size > MAX_BYTES) {
        setUploadError("Image must be 32MB or smaller.")
        return
      }
      setUploadError(null)
      setUploading(kind)
      try {
        if (kind === "avatar") {
          const result = await heygenService.uploadAvatar(workflowId, nodeId, file)
          onPatch({
            mode: "presenter",
            heygenAvatarId: result.heygenAvatarId,
            heygenAvatarAssetId: result.heygenAvatarAssetId,
            heygenAvatarPhotoUrl: result.previewUrl,
          })
        } else {
          const result = await heygenService.uploadBackground(
            workflowId,
            nodeId,
            file,
          )
          onPatch({
            heygenBackgroundAssetId: result.heygenBackgroundAssetId,
            heygenBackgroundUrl: result.previewUrl,
            removeBackground: true,
          })
        }
      } catch (e) {
        setUploadError(
          e instanceof Error ? e.message : "Upload failed. Try again.",
        )
      } finally {
        setUploading(null)
      }
    },
    [workflowId, nodeId, onPatch],
  )

  const labelClass = cn(
    "mb-1.5 block font-bold",
    compact ? "text-[10px]" : "text-[11px]",
  )

  const avatarUrl = String(config.heygenAvatarPhotoUrl ?? "")
  const bgUrl = String(config.heygenBackgroundUrl ?? "")
  const voiceId = String(config.heygenVoiceId ?? "")

  return (
    <div className="flex flex-col gap-3">
      {!canUpload ? (
        <p className="text-[11px] text-amber-700">
          Save the workflow first to upload avatar and background images to HeyGen.
        </p>
      ) : null}

      <UploadSlot
        label="Avatar photo"
        hint="PNG/JPEG · front-facing · max 32MB"
        previewUrl={avatarUrl}
        disabled={!canUpload || uploading !== null}
        busy={uploading === "avatar"}
        inputRef={avatarInputRef}
        onPick={() => avatarInputRef.current?.click()}
        onFile={(f) => void handleFile("avatar", f)}
      />

      <UploadSlot
        label="Background image"
        hint="Optional custom background"
        previewUrl={bgUrl}
        disabled={!canUpload || uploading !== null}
        busy={uploading === "background"}
        inputRef={bgInputRef}
        onPick={() => bgInputRef.current?.click()}
        onFile={(f) => void handleFile("background", f)}
      />

      <div>
        <label className={labelClass} style={{ color: T.textPrimary }}>
          Voice
        </label>
        {voicesQuery.isLoading ? (
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <Spinner className="size-3" />
            Loading voices…
          </div>
        ) : (
          <select
            value={voiceId}
            disabled={!canUpload}
            onChange={(e) => {
              const nextVoice = e.target.value
              const patch = { mode: "presenter", heygenVoiceId: nextVoice }
              onPatch(patch)
              if (workflowId?.trim() && nextVoice) {
                void heygenService
                  .patchPresenterConfig(workflowId, nodeId, patch)
                  .catch(() => {
                    setUploadError(
                      "Voice could not be saved. Save the workflow and try again.",
                    )
                  })
              }
            }}
            className={cn(
              "w-full rounded-md border bg-[#FDFCFA] px-2 py-1.5",
              compact ? "text-[10px]" : "text-[11px]",
            )}
            style={{ borderColor: T.surfaceBorder }}
          >
            <option value="">Select a voice…</option>
            {(voicesQuery.data ?? []).map((v: HeygenVoice) => (
              <option key={v.voiceId} value={v.voiceId}>
                {v.name} ({v.language})
              </option>
            ))}
          </select>
        )}
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
  previewUrl,
  disabled,
  busy,
  inputRef,
  onPick,
  onFile,
}: {
  label: string
  hint: string
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
          <Spinner className="size-4" />
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="max-h-20 max-w-full rounded object-contain"
          />
        ) : (
          <span className="text-[11px] text-gray-500">
            Upload or drag and drop
          </span>
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
