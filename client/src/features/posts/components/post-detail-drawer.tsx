import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { AxiosError } from "axios"
import {
  ExternalLink,
  Loader2,
  Pencil,
  Send,
  Trash2,
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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ChannelStack } from "@/features/posts/lib/channel-stack"
import {
  editableFieldsFromZernio,
  isPostPublishable,
  isPostZernioEditable,
  isoFromDatetimeLocal,
  type PostDrawerDraft,
} from "@/features/posts/lib/post-drawer-form"
import { toastDeletePostResult } from "@/features/posts/lib/post-delete-toast"
import { getApiErrorMessage } from "@/features/upload/lib/upload-publish.helpers"
import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"
import {
  useDeletePostMutation,
  usePatchPostMutation,
  usePostDetailQuery,
  usePublishPostMutation,
} from "@/shared/queries/posts.query"
import type {
  PostDetailHydrated,
  PostDetailResponse,
  PostRecord,
} from "@/shared/types/post.type"

function isHydratedDetail(
  detail: PostDetailResponse,
): detail is PostDetailHydrated {
  return (
    !!detail &&
    typeof detail === "object" &&
    "local" in detail &&
    "remote" in detail
  )
}

function pullLocalAndRemote(detail: PostDetailResponse | undefined): {
  local: PostRecord | null
  remote: Record<string, unknown> | null
} {
  if (!detail) return { local: null, remote: null }
  if (isHydratedDetail(detail)) {
    return {
      local: detail.local,
      remote: detail.remote ?? null,
    }
  }
  return { local: detail as PostRecord, remote: null }
}

type PostDetailDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  postId: string | null
}

export function PostDetailDrawer({
  open,
  onOpenChange,
  postId,
}: PostDetailDrawerProps) {
  const detailQuery = usePostDetailQuery(postId ?? undefined, {
    hydrateZernio: true,
    enabled: open && !!postId,
  })
  const patchMu = usePatchPostMutation()
  const publishMu = usePublishPostMutation()
  const deleteMu = useDeletePostMutation()

  const { local, remote } = useMemo(
    () => pullLocalAndRemote(detailQuery.data),
    [detailQuery.data],
  )

  const editable = !!local && isPostZernioEditable(local)
  const publishable = !!local && isPostPublishable(local)

  const [draft, setDraft] = useState<PostDrawerDraft>({
    content: "",
    title: "",
    scheduledLocal: "",
  })

  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (!open) setEditing(false)
  }, [open])

  useEffect(() => {
    setEditing(false)
  }, [local?.postId])

  useEffect(() => {
    if (!open || !local) return
    const hydrated = editableFieldsFromZernio(remote, local)
    setDraft(hydrated)
  }, [open, local, remote])

  const busy = patchMu.isPending || publishMu.isPending || deleteMu.isPending

  const isUnpublishAction =
    local?.status === "published" || local?.status === "partial"
  const deleteActionLabel = isUnpublishAction ? "Unpublish" : "Delete"

  async function handleDeleteConfirm() {
    if (!postId) return
    try {
      const result = await deleteMu.mutateAsync(postId)
      toastDeletePostResult(result)
      setDeleteOpen(false)
      onOpenChange(false)
    } catch (e: unknown) {
      toast.error(getApiErrorMessage(e as AxiosError))
    }
  }

  async function handlePublishNow() {
    if (!postId || !local) return
    try {
      const res = await publishMu.mutateAsync(postId)
      toast.success("Published now", {
        description:
          res.postId !== postId
            ? `New post record ${res.postId.slice(0, 10)}…`
            : undefined,
      })
      void detailQuery.refetch()
    } catch (e: unknown) {
      toast.error(getApiErrorMessage(e as AxiosError))
    }
  }

  async function handleSave() {
    if (!postId || !local || !editable) return
    const scheduledAt =
      draft.scheduledLocal.trim().length > 0
        ? isoFromDatetimeLocal(draft.scheduledLocal)
        : undefined
    if (
      draft.scheduledLocal.trim().length > 0 &&
      scheduledAt === undefined
    ) {
      toast.error("Pick a valid schedule time.")
      return
    }
    try {
      await patchMu.mutateAsync({
        postId,
        body: {
          content: draft.content,
          title: draft.title,
          ...(scheduledAt ? { scheduledAt } : {}),
        },
      })
      toast.success("Post updated")
      setEditing(false)
      void detailQuery.refetch()
    } catch (e: unknown) {
      toast.error(getApiErrorMessage(e as AxiosError))
    }
  }

  function cancelEditing() {
    if (!local) return
    setDraft(editableFieldsFromZernio(remote, local))
    setEditing(false)
  }

  const scheduledLabel = fmtIso(local?.scheduledAt)
  const publishedLabel = fmtIso(local?.publishedAt)

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        variant="panel"
        showCloseButton={false}
        className={cn(
          "w-full max-w-none gap-0 border-l p-0 shadow-md sm:max-w-[480px]",
          "flex max-h-dvh flex-col duration-200",
        )}
      >
        <DrawerHeader className="space-y-3 border-b border-border/60 p-4 text-left sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <DrawerTitle className="font-serif text-xl">
                Post detail
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                Scheduling, channels, and caption for this post.
              </DrawerDescription>
            </div>
            {editable ? (
              <Button
                type="button"
                size="sm"
                variant={editing ? "secondary" : "outline"}
                className="shrink-0 gap-1.5"
                onClick={() => (editing ? cancelEditing() : setEditing(true))}
                disabled={busy}
              >
                <Pencil className="size-3.5" aria-hidden />
                {editing ? "Cancel edit" : "Edit"}
              </Button>
            ) : null}
          </div>

          {local ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="capitalize">
                {local.status}
              </Badge>
              <ChannelStack channels={local.channels ?? []} sizeClass="size-7" />
            </div>
          ) : null}
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4">
          {detailQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Loading…
            </div>
          ) : detailQuery.isError ? (
            <p className="text-sm text-destructive">Could not load post.</p>
          ) : !local ? null : (
            <>
              {!editable ? (
                <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
                  <AlertTitle className="text-amber-950 dark:text-amber-50">
                    Editing locked
                  </AlertTitle>
                  <AlertDescription className="text-amber-900 dark:text-amber-100">
                    This post cannot be edited remotely (it needs a linked Zernio
                    post and status pending, scheduled, or partial).
                  </AlertDescription>
                </Alert>
              ) : null}

              <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Timing
                </h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Scheduled</dt>
                    <dd className="mt-0.5 font-mono text-[11px]">
                      {scheduledLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Published</dt>
                    <dd className="mt-0.5 font-mono text-[11px]">
                      {publishedLabel}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Channels
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(local.channels ?? []).map((ch) => (
                    <Badge key={ch} variant="outline" className="text-[11px]">
                      {ch}
                    </Badge>
                  ))}
                </div>
              </section>

              <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Caption & title
                </h3>
                {!editable || !editing ? (
                  <div className="space-y-2">
                    {draft.title.trim() ? (
                      <p className="font-serif text-[15px] font-medium leading-snug">
                        {draft.title}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {draft.content.trim() || "—"}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="post-content">Caption / content</Label>
                      <Textarea
                        id="post-content"
                        value={draft.content}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, content: e.target.value }))
                        }
                        rows={6}
                        className="text-sm"
                        disabled={busy}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="post-title">Title</Label>
                      <Input
                        id="post-title"
                        value={draft.title}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, title: e.target.value }))
                        }
                        placeholder="Optional (e.g. YouTube)"
                        disabled={busy}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="post-scheduled">Schedule (local)</Label>
                      <Input
                        id="post-scheduled"
                        type="datetime-local"
                        value={draft.scheduledLocal}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            scheduledLocal: e.target.value,
                          }))
                        }
                        className="text-sm"
                        disabled={busy}
                      />
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </div>

        <DrawerFooter className="gap-2 border-t border-border/60 bg-muted/30 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {local ? (
              <>
                <Link
                  to={`/upload/${encodeURIComponent(local.uploadRef)}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "default" }),
                    "inline-flex items-center gap-1.5",
                  )}
                >
                  Upload
                  <ExternalLink className="size-3.5 opacity-70" aria-hidden />
                </Link>
                <Link
                  to={`/content/${encodeURIComponent(local.contentRef)}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "default" }),
                    "inline-flex items-center gap-1.5",
                  )}
                >
                  Content
                  <ExternalLink className="size-3.5 opacity-70" aria-hidden />
                </Link>
              </>
            ) : null}
            {publishable && !editing ? (
              <Button
                type="button"
                disabled={busy || !postId || detailQuery.isLoading}
                className="ml-auto gap-1.5 border-[#185FA5] bg-[#E6F1FB] text-[#042C53] hover:bg-[#B5D4F4]"
                onClick={() => void handlePublishNow()}
              >
                {publishMu.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="size-4" aria-hidden />
                )}
                Publish now
              </Button>
            ) : null}
            {editable && editing ? (
              <Button
                type="button"
                disabled={busy || !postId || detailQuery.isLoading}
                className={publishable ? undefined : "ml-auto"}
                onClick={() => void handleSave()}
              >
                {patchMu.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            ) : null}
            {local && local.status !== "cancelled" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="ml-auto gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={busy || !postId}
                  onClick={() => setDeleteOpen(true)}
                >
                  {deleteMu.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-4" aria-hidden />
                  )}
                  {deleteActionLabel}
                </Button>
                <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {isUnpublishAction
                          ? "Unpublish this post?"
                          : "Delete this post?"}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {isUnpublishAction
                          ? "Removes the post from supported platforms and resets those upload channels to pending. Instagram, TikTok, and Snapchat cannot be unpublished via Zernio."
                          : "Permanently removes this post and resets its upload channels to pending so you can publish again."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleteMu.isPending}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        disabled={deleteMu.isPending}
                        onClick={() => void handleDeleteConfirm()}
                      >
                        {deleteActionLabel}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : null}
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function fmtIso(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString()
}
