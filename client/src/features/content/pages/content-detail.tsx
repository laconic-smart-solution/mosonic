import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  FileText,
  ImageIcon,
  Languages,
  ListOrdered,
  Loader2,
  Mic,
  RefreshCw,
  Video,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  OUTPUT_GRID,
  type OutputKey,
  cardTitle,
  mergeExecutorOutput,
  outputsFromDetail,
  resolveNodeId,
} from "@/features/content/data/content-review-helpers"
import { useFileObjectUrl } from "@/shared/hooks/use-file-object-url"
import { useGetContentQuery } from "@/shared/queries/content.query"
import { useGetWorkflowQuery } from "@/shared/queries/workflow.query"
import { contentService } from "@/shared/services/content.service"
import { uploadMediaService } from "@/shared/services/upload-media.service"
import type { ContentDetail } from "@/shared/types/content.type"
import {
  joinContentRoom,
  leaveContentRoom,
  onContentNodeFailedFinal,
  onContentNodeProcessing,
  onContentNodeRetrying,
  onContentNodeRerunCompleted,
  onContentNodeStarted,
  onContentNodeStreaming,
} from "@/shared/socket/content-events"

const CARD_ICONS: Record<OutputKey, ReactNode> = {
  text: <FileText className="size-4" />,
  translatedText: <Languages className="size-4" />,
  image: <ImageIcon className="size-4" />,
  video: <Video className="size-4" />,
  transcription: <Mic className="size-4" />,
  summary: <ListOrdered className="size-4" />,
}

function isNonEmptyOutput(v: string | undefined): boolean {
  return v != null && String(v).trim() !== ""
}

function outputKeyForNodeId(
  nodes: Array<{ nodeId: string; type: string; order: number }>,
  nodeId: string
): OutputKey | undefined {
  for (const row of OUTPUT_GRID) {
    for (const k of row) {
      if (resolveNodeId(nodes as Parameters<typeof resolveNodeId>[0], k) === nodeId) {
        return k
      }
    }
  }
  return undefined
}

type CardRunPhase = "idle" | "running" | "streaming" | "processing" | "retrying" | "error"

type CardRunState = {
  phase: CardRunPhase
  stream: string
  processingMessage: string
  retryLabel: string
  errorMessage: string
}

const emptyRunState = (): CardRunState => ({
  phase: "idle",
  stream: "",
  processingMessage: "",
  retryLabel: "",
  errorMessage: "",
})

function MediaImageBlock({
  url,
  title,
  onOpen,
}: {
  url: string
  title: string
  onOpen: () => void
}) {
  const src = useFileObjectUrl(url)
  if (!src) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
        Loading image…
      </div>
    )
  }
  return (
    <button
      type="button"
      className="block w-full overflow-hidden rounded-lg border-0 p-0"
      onClick={onOpen}
    >
      <img src={src} alt={title} className="aspect-video w-full object-cover" />
    </button>
  )
}

function MediaVideoBlock({ url }: { url: string }) {
  const src = useFileObjectUrl(url)
  if (!src) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
        Loading video…
      </div>
    )
  }
  return (
    <video src={src} controls className="aspect-video w-full rounded-lg bg-black" autoPlay muted playsInline />
  )
}

export default function ContentDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { contentId } = useParams<{ contentId: string }>()

  const contentQuery = useGetContentQuery(contentId)
  const data = contentQuery.data

  const workflowQuery = useGetWorkflowQuery(data?.workflowRef, {
    refetchInterval: false,
  })
  const workflowNodes = useMemo(
    () => workflowQuery.data?.nodes ?? [],
    [workflowQuery.data?.nodes]
  )

  const [editedOutputs, setEditedOutputs] = useState<Partial<Record<OutputKey, string | undefined>>>({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [approveEnabled, setApproveEnabled] = useState(false)
  const [displayVersion, setDisplayVersion] = useState(1)
  const [showRejectedBanner, setShowRejectedBanner] = useState(false)
  const [retainedSlots, setRetainedSlots] = useState<Set<OutputKey>>(new Set())

  const [versionSheetOpen, setVersionSheetOpen] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const [rerunPanelKey, setRerunPanelKey] = useState<OutputKey | null>(null)
  const [rerunPromptDraft, setRerunPromptDraft] = useState("")
  const [runByKey, setRunByKey] = useState<Partial<Record<OutputKey, CardRunState>>>({})
  const [globalRerunning, setGlobalRerunning] = useState(false)

  const [saveLoading, setSaveLoading] = useState(false)
  const [approveLoading, setApproveLoading] = useState(false)

  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false)
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null)

  const lastNavContentIdRef = useRef<string | null>(null)

  const applyServerContent = useCallback((doc: ContentDetail) => {
    const o = outputsFromDetail(doc.outputs)
    const slots = new Set<OutputKey>()
    for (const k of OUTPUT_GRID.flat()) {
      if (isNonEmptyOutput(o[k])) slots.add(k)
    }
    setRetainedSlots(slots)
    setEditedOutputs(o)
    setHasUnsavedChanges(false)
    setApproveEnabled(false)
    setDisplayVersion(doc.currentVersion)
    setShowRejectedBanner(doc.status === "rejected")
  }, [])

  useEffect(() => {
    if (!data || !contentId) return
    if (lastNavContentIdRef.current === contentId) return
    lastNavContentIdRef.current = contentId
    applyServerContent(data)
  }, [contentId, data, applyServerContent])

  const versionsQuery = useQuery({
    queryKey: ["content", contentId, "versions"],
    queryFn: () => contentService.getVersions(contentId!),
    enabled: !!contentId && versionSheetOpen,
  })

  const visibleKeys = useMemo(() => {
    const keys = new Set<OutputKey>(retainedSlots)
    for (const k of OUTPUT_GRID.flat()) {
      if (isNonEmptyOutput(editedOutputs[k])) keys.add(k)
    }
    return keys
  }, [editedOutputs, retainedSlots])

  const markDirty = useCallback(() => {
    setHasUnsavedChanges(true)
    setApproveEnabled(false)
  }, [])

  const updateOutput = useCallback(
    (key: OutputKey, value: string | undefined) => {
      setEditedOutputs((prev) => ({ ...prev, [key]: value }))
      markDirty()
    },
    [markDirty]
  )

  const getNodePrompt = useCallback(
    (key: OutputKey) => {
      const id = resolveNodeId(workflowNodes, key)
      if (!id) return ""
      const n = workflowNodes.find((x) => x.nodeId === id)
      return n?.userPrompt?.trim() ?? ""
    },
    [workflowNodes]
  )

  const setRunState = useCallback((key: OutputKey, partial: Partial<CardRunState>) => {
    setRunByKey((prev) => ({
      ...prev,
      [key]: { ...emptyRunState(), ...prev[key], ...partial },
    }))
  }, [])

  useEffect(() => {
    if (!contentId) return
    joinContentRoom(contentId)

    const filter =
      <T extends { contentId?: string }>(p: T) =>
        p.contentId === contentId

    const cleanups = [
      onContentNodeStarted((p) => {
        if (!filter(p)) return
        const key = outputKeyForNodeId(workflowNodes, p.nodeId)
        if (!key) return
        setRunState(key, { phase: "running", stream: "", errorMessage: "" })
      }),
      onContentNodeStreaming((p) => {
        if (!filter(p)) return
        const key = outputKeyForNodeId(workflowNodes, p.nodeId)
        if (!key) return
        setRunByKey((prev) => {
          const cur = prev[key] ?? emptyRunState()
          return {
            ...prev,
            [key]: {
              ...cur,
              phase: "streaming",
              stream: `${cur.stream}${p.chunk}`,
            },
          }
        })
      }),
      onContentNodeProcessing((p) => {
        if (!filter(p)) return
        const key = outputKeyForNodeId(workflowNodes, p.nodeId)
        if (!key) return
        setRunState(key, {
          phase: "processing",
          processingMessage: p.message ?? "Processing…",
        })
      }),
      onContentNodeRetrying((p) => {
        if (!filter(p)) return
        const key = outputKeyForNodeId(workflowNodes, p.nodeId)
        if (!key) return
        setRunState(key, {
          phase: "retrying",
          retryLabel: `Retrying… attempt ${p.attempt}/${p.maxAttempts}`,
        })
      }),
      onContentNodeFailedFinal((p) => {
        if (!filter(p)) return
        const key = outputKeyForNodeId(workflowNodes, p.nodeId)
        if (!key) return
        setRunState(key, {
          phase: "error",
          errorMessage: p.message ?? "Re-run failed. Please try again.",
        })
        setGlobalRerunning(false)
        setRerunPanelKey(null)
      }),
      onContentNodeRerunCompleted((p) => {
        if (!filter(p)) return
        const key = outputKeyForNodeId(workflowNodes, p.nodeId)
        if (!key) return
        setEditedOutputs((prev) => mergeExecutorOutput(p.nodeType, p.output, prev))
        setRetainedSlots((rs) => new Set(rs).add(key))
        setHasUnsavedChanges(true)
        setApproveEnabled(false)
        setRunState(key, emptyRunState())
        setGlobalRerunning(false)
        setRerunPanelKey(null)
        toast.success("Node output updated — save when ready.")
      }),
    ]

    return () => {
      cleanups.forEach((fn) => fn())
      leaveContentRoom(contentId)
    }
  }, [contentId, workflowNodes, setRunState])

  const saveMutation = useMutation({
    mutationFn: () =>
      contentService.save(contentId!, {
        userEdits: {
          text: editedOutputs.text,
          translatedText: editedOutputs.translatedText,
          transcription: editedOutputs.transcription,
          summary: editedOutputs.summary,
          image: editedOutputs.image,
          video: editedOutputs.video,
        },
      }),
    onSuccess: ({ versionNumber }) => {
      toast.success(`Changes saved (version ${versionNumber})`)
      setHasUnsavedChanges(false)
      setApproveEnabled(true)
      setDisplayVersion(versionNumber)
      queryClient.setQueryData<ContentDetail | undefined>(["content", contentId], (old) =>
        old ? { ...old, currentVersion: versionNumber } : old
      )
    },
    onError: () => {
      toast.error("Failed to save. Please try again.")
    },
  })

  const approveMutation = useMutation({
    mutationFn: () => contentService.approve(contentId!),
    onSuccess: ({ uploadId }) => {
      navigate(`/upload/${uploadId}`)
    },
    onError: () => {
      toast.error("Could not approve. Please try again.")
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => contentService.reject(contentId!),
    onSuccess: () => {
      toast.success("Content rejected.")
      setShowRejectedBanner(true)
      queryClient.setQueryData<ContentDetail | undefined>(["content", contentId], (old) =>
        old ? { ...old, status: "rejected" } : old
      )
    },
    onError: () => {
      toast.error("Could not reject. Please try again.")
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (versionNumber: number) =>
      contentService.restoreVersion(contentId!, { versionNumber }),
    onSuccess: async (_data, versionNumber) => {
      await queryClient.invalidateQueries({ queryKey: ["content", contentId] })
      const fresh = await queryClient.fetchQuery({
        queryKey: ["content", contentId],
        queryFn: () => contentService.getById(contentId!),
      })
      if (fresh) {
        applyServerContent(fresh)
      }
      setVersionSheetOpen(false)
      setRestoreTarget(null)
      toast.success(`Restored to version ${versionNumber}`)
    },
    onError: () => {
      toast.error("Could not restore version.")
    },
  })

  async function handleSave() {
    if (!contentId) return
    setSaveLoading(true)
    try {
      await saveMutation.mutateAsync()
    } finally {
      setSaveLoading(false)
    }
  }

  async function handleApproveConfirm() {
    if (!contentId) return
    setConfirmApproveOpen(false)
    setApproveLoading(true)
    try {
      await approveMutation.mutateAsync()
    } finally {
      setApproveLoading(false)
    }
  }

  function openRerun(key: OutputKey) {
    setRerunPanelKey(key)
    setRerunPromptDraft(getNodePrompt(key))
    setRunByKey((prev) => ({ ...prev, [key]: emptyRunState() }))
  }

  async function submitRerun(key: OutputKey) {
    const nodeId = resolveNodeId(workflowNodes, key)
    if (!nodeId || !contentId) {
      toast.error("Could not resolve node for this output.")
      return
    }
    setGlobalRerunning(true)
    setApproveEnabled(false)
    setRunState(key, { phase: "running", stream: "", errorMessage: "" })
    try {
      await contentService.rerunNode(contentId, {
        nodeId,
        updatedPrompt: rerunPromptDraft.trim() || undefined,
      })
    } catch {
      toast.error("Could not start re-run.")
      setGlobalRerunning(false)
      setRunState(key, { phase: "error", errorMessage: "Could not start re-run." })
    }
  }

  async function uploadMedia(key: "image" | "video", file: File) {
    const label = key === "image" ? "image" : "video"
    setRunState(key, { phase: "running", processingMessage: `Uploading ${label}…` })
    try {
      const { url } = await uploadMediaService.uploadFile(file)
      updateOutput(key, url)
      setRunState(key, emptyRunState())
    } catch {
      setRunState(key, {
        phase: "error",
        errorMessage: "Upload failed. Try again.",
      })
      toast.error("Media upload failed.")
    }
  }

  if (!contentId) {
    return <div className="p-6 text-sm">Invalid content id.</div>
  }

  if (contentQuery.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 p-6 pb-28">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    )
  }

  if (contentQuery.isError || !data) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">Could not load content. Please try again.</p>
        <Button type="button" variant="outline" onClick={() => contentQuery.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const approveDisabled = !approveEnabled || hasUnsavedChanges || approveLoading || globalRerunning

  return (
    <TooltipProvider>
      <div className="relative flex min-h-0 flex-1 flex-col bg-muted/20">
        {showRejectedBanner ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
            This content has been rejected. You can continue editing.
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto max-w-5xl p-6 pb-32">
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h1 className="text-lg font-semibold">Content review</h1>
                <p className="text-xs text-muted-foreground">
                  Content {data.contentId.slice(0, 8)}… · Version {displayVersion} ·{" "}
                  <span className="capitalize">{data.status}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {OUTPUT_GRID.map((row, ri) => (
                <div key={ri} className="contents sm:contents">
                  {row.map((key) => {
                    if (!visibleKeys.has(key)) return null
                    const run = runByKey[key] ?? emptyRunState()
                    const isTextLike =
                      key === "text" ||
                      key === "translatedText" ||
                      key === "transcription" ||
                      key === "summary"
                    const nodeId = resolveNodeId(workflowNodes, key)
                    const highlight =
                      run.phase === "running" ||
                      run.phase === "streaming" ||
                      run.phase === "processing" ||
                      run.phase === "retrying"
                        ? "ring-2 ring-blue-500/60"
                        : run.phase === "error"
                          ? "ring-2 ring-red-400/70"
                          : ""

                    const displayText =
                      run.phase === "streaming" || run.phase === "running"
                        ? run.stream || (run.phase === "running" ? "" : editedOutputs[key] ?? "")
                        : editedOutputs[key] ?? ""

                    return (
                      <Card key={key} className={`rounded-xl ${highlight}`}>
                        <CardHeader className="border-b py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {CARD_ICONS[key]}
                              <CardTitle className="text-sm">{cardTitle(key)}</CardTitle>
                            </div>
                            <div className="flex items-center gap-1">
                              {(run.phase === "running" ||
                                run.phase === "streaming" ||
                                run.phase === "processing" ||
                                run.phase === "retrying") && (
                                <Loader2 className="size-4 animate-spin text-blue-600" />
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={!nodeId || globalRerunning}
                                onClick={() => openRerun(key)}
                              >
                                <RefreshCw className="mr-1 size-3" />
                                Re-run
                              </Button>
                            </div>
                          </div>
                          {rerunPanelKey === key ? (
                            <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3">
                              <p className="text-[11px] font-medium text-muted-foreground">Node prompt</p>
                              <Textarea
                                value={rerunPromptDraft}
                                onChange={(e) => setRerunPromptDraft(e.target.value)}
                                className="min-h-[72px] text-xs"
                                placeholder="Optional prompt override…"
                              />
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 text-xs"
                                  disabled={!nodeId || globalRerunning}
                                  onClick={() => void submitRerun(key)}
                                >
                                  Run
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => setRerunPanelKey(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </CardHeader>
                        <CardContent className="space-y-3 pt-3">
                          {run.phase === "running" && !run.stream && (
                            <p className="text-xs text-blue-600">Generating…</p>
                          )}
                          {run.phase === "processing" && run.processingMessage && (
                            <p className="text-xs text-blue-600">{run.processingMessage}</p>
                          )}
                          {run.phase === "retrying" && run.retryLabel && (
                            <p className="text-xs text-amber-700">{run.retryLabel}</p>
                          )}
                          {run.phase === "error" && run.errorMessage && (
                            <div className="space-y-2">
                              <p className="text-xs text-red-600">{run.errorMessage}</p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => void submitRerun(key)}
                              >
                                Retry
                              </Button>
                            </div>
                          )}

                          {isTextLike && (
                            <Textarea
                              value={displayText}
                              onChange={(e) => {
                                updateOutput(key, e.target.value)
                                if (run.stream) {
                                  setRunState(key, { phase: "idle", stream: "" })
                                }
                              }}
                              className="min-h-[120px] text-sm"
                            />
                          )}

                          {key === "image" && (
                            <div className="space-y-2">
                              {editedOutputs.image ? (
                                <>
                                  <MediaImageBlock
                                    url={editedOutputs.image}
                                    title={cardTitle(key)}
                                    onOpen={() => setLightboxUrl(editedOutputs.image!)}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => updateOutput("image", undefined)}
                                  >
                                    Remove
                                  </Button>
                                </>
                              ) : (
                                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed py-8 text-xs text-muted-foreground">
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0]
                                      e.target.value = ""
                                      if (f) void uploadMedia("image", f)
                                    }}
                                  />
                                  Drop or click to upload (JPG, PNG)
                                </label>
                              )}
                            </div>
                          )}

                          {key === "video" && (
                            <div className="space-y-2">
                              {editedOutputs.video ? (
                                <>
                                  <MediaVideoBlock url={editedOutputs.video} />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => updateOutput("video", undefined)}
                                  >
                                    Remove
                                  </Button>
                                </>
                              ) : (
                                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed py-8 text-xs text-muted-foreground">
                                  <input
                                    type="file"
                                    accept="video/mp4,.mp4"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0]
                                      e.target.value = ""
                                      if (f) void uploadMedia("video", f)
                                    }}
                                  />
                                  Drop or click to upload (MP4)
                                </label>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              ))}
            </div>

            {visibleKeys.size === 0 ? (
              <p className="mt-6 text-center text-sm text-muted-foreground">No outputs to display yet.</p>
            ) : null}
          </div>
        </ScrollArea>

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVersionSheetOpen(true)}
            >
              Version History
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmRejectOpen(true)}
              >
                Reject
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saveLoading || globalRerunning}
                onClick={() => void handleSave()}
                className="relative"
              >
                {saveLoading ? "Saving…" : "Save Changes"}
                {hasUnsavedChanges ? (
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500" aria-hidden />
                ) : null}
              </Button>
              {approveDisabled ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex">
                        <Button type="button" size="sm" disabled className="pointer-events-none opacity-50">
                          {approveLoading ? "Approving…" : "Approve"}
                        </Button>
                      </span>
                    }
                  />
                  <TooltipContent>Save your changes first</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={approveLoading}
                  onClick={() => setConfirmApproveOpen(true)}
                >
                  {approveLoading ? "Approving…" : "Approve"}
                </Button>
              )}
            </div>
          </div>
        </div>

        <Sheet open={versionSheetOpen} onOpenChange={setVersionSheetOpen}>
          <SheetContent side="right" className="w-[380px]">
            <SheetHeader>
              <SheetTitle>Version history</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-2">
              {versionsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : (
                (versionsQuery.data ?? []).map((v) => {
                  const isCurrent = v.versionNumber === displayVersion
                  return (
                    <div
                      key={v.versionNumber}
                      className={`rounded-lg border p-3 ${isCurrent ? "border-primary/50 bg-primary/5" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold">Version {v.versionNumber}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(v.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {isCurrent ? (
                          <span className="text-[10px] font-medium text-emerald-600">Current</span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setRestoreTarget(v.versionNumber)}
                          >
                            Restore
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </SheetContent>
        </Sheet>

        <Dialog open={!!lightboxUrl} onOpenChange={(o) => !o && setLightboxUrl(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Image</DialogTitle>
            </DialogHeader>
            {lightboxUrl ? (
              <LightboxInner url={lightboxUrl} />
            ) : null}
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve content?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to approve this content? It will be sent to the upload screen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleApproveConfirm()}>Approve</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmRejectOpen} onOpenChange={setConfirmRejectOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject this content?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to reject this content? You can continue editing.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmRejectOpen(false)
                  void rejectMutation.mutateAsync()
                }}
              >
                Reject
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={restoreTarget != null} onOpenChange={(o) => !o && setRestoreTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restore version {restoreTarget}?</AlertDialogTitle>
              <AlertDialogDescription>
                Your current unsaved changes will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (restoreTarget != null) void restoreMutation.mutateAsync(restoreTarget)
                }}
              >
                Restore
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}

function LightboxInner({ url }: { url: string }) {
  const src = useFileObjectUrl(url)
  if (!src) return <p className="text-sm text-muted-foreground">Loading…</p>
  return <img src={src} alt="" className="max-h-[80vh] w-full object-contain" />
}
