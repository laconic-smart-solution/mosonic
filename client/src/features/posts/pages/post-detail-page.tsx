import { useEffect, useMemo, useState } from "react"

import { Link, useNavigate, useParams } from "react-router-dom"

import { ExternalLink, Loader2, Pencil, Send } from "lucide-react"

import { useTranslation } from "react-i18next"

import { toast } from "sonner"



import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageShell } from "@/components/app/page-shell"
import { useSetBreadcrumbLabel } from "@/components/app/breadcrumb-override.context"

import { Badge } from "@/components/ui/badge"

import { Button } from "@/components/ui/button"

import {

  Card,

  CardContent,

  CardDescription,

  CardHeader,

  CardTitle,

} from "@/components/ui/card"

import { Input } from "@/components/ui/input"

import { Label } from "@/components/ui/label"

import { Spinner } from "@/components/ui/spinner"

import { Textarea } from "@/components/ui/textarea"

import { PostAnalyticsPanel } from "@/features/posts/components/post-analytics-panel"

import { PostDetailMediaEditor } from "@/features/posts/components/post-detail-media-editor"

import { PostDetailMediaGallery } from "@/features/posts/components/post-detail-media-gallery"

import { ChannelStack } from "@/features/posts/lib/channel-stack"

import { isAnalyticsEligible } from "@/features/posts/lib/post-detail-analytics.util"

import {

  draftMediaFromItems,

  editableFieldsFromZernio,

  isPostPublishable,

  isPostZernioEditable,

  isoFromDatetimeLocal,

  postDraftToMediaPayload,

  type PostDrawerDraft,

} from "@/features/posts/lib/post-drawer-form"

import {
  isTikTokPhotoMedia,
  tiktokPhotoCaptionErrorI18n,
} from "@/features/upload/lib/tiktok-publish"

import { normalizeChannelKey } from "@/features/upload/lib/upload-platform-media"

import { toastApiError } from "@/shared/lib/toast-error"

import { buttonVariants } from "@/lib/button-variants"

import { cn } from "@/lib/utils"

import {

  usePatchPostMutation,

  usePostDetailQuery,

  usePublishPostMutation,

  useSyncPostAnalyticsMutation,

} from "@/shared/queries/posts.query"

import type {

  PostAnalyticsSnapshot,

  PostDetailHydrated,

  PostDetailResponse,

  PostMediaItem,

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



function pullDetailParts(detail: PostDetailResponse | undefined): {

  local: PostRecord | null

  remote: Record<string, unknown> | null

  analytics: PostAnalyticsSnapshot | null | undefined

} {

  if (!detail) return { local: null, remote: null, analytics: undefined }

  if (isHydratedDetail(detail)) {

    return {

      local: detail.local,

      remote: detail.remote ?? null,

      analytics: detail.analytics,

    }

  }

  const flat = detail as PostRecord & {

    analytics?: PostAnalyticsSnapshot | null

  }

  const { analytics, ...rest } = flat

  return {

    local: rest as PostRecord,

    remote: null,

    analytics,

  }

}



function fmtIso(iso: string | null | undefined): string {

  if (!iso) return "—"

  const d = new Date(iso)

  if (Number.isNaN(d.getTime())) return "—"

  return d.toLocaleString()

}



function resolveMediaItems(local: PostRecord): PostMediaItem[] {

  if (local.mediaItems?.length) return local.mediaItems

  if (local.mediaPreviewUrl) {

    return [

      {

        url: local.mediaPreviewUrl,

        kind: local.mediaKind === "video" ? "video" : "image",

      },

    ]

  }

  return []

}



export default function PostDetailPage() {

  const { t } = useTranslation("posts")

  const navigate = useNavigate()

  const { postId } = useParams<{ postId: string }>()

  const detailQuery = usePostDetailQuery(postId, { hydrateZernio: true })

  const patchMu = usePatchPostMutation()

  const publishMu = usePublishPostMutation()

  const syncMu = useSyncPostAnalyticsMutation(postId)



  const { local, remote, analytics } = useMemo(

    () => pullDetailParts(detailQuery.data),

    [detailQuery.data],

  )



  const editable = !!local && isPostZernioEditable(local)

  const publishable = !!local && isPostPublishable(local)

  const analyticsEligible = isAnalyticsEligible(local)

  useSetBreadcrumbLabel(
    local?.youtubeTitlePreview?.trim() ||
      local?.captionPreview?.trim() ||
      postId,
  )

  const primaryChannel = local?.channels?.[0] ?? "instagram"

  const primaryChannelKey = normalizeChannelKey(primaryChannel)

  const mediaItems = useMemo(

    () => (local ? resolveMediaItems(local) : []),

    [local],

  )



  const [draft, setDraft] = useState<PostDrawerDraft>({

    content: "",

    title: "",

    scheduledLocal: "",

    mediaTab: "single",

    imageUrls: [],

    videoUrl: null,

  })

  const [editing, setEditing] = useState(false)



  const tiktokPhotoCaptionLimit =

    primaryChannelKey === "tiktok" &&

    draft.mediaTab !== "video" &&

    (draft.imageUrls.length > 0 || draft.mediaTab === "single")

      ? 90

      : null



  useEffect(() => {

    setEditing(false)

  }, [local?.postId])



  useEffect(() => {

    if (!local) return

    const fields = editableFieldsFromZernio(remote, local)

    const caption =

      local.detailCaption?.trim() ||

      fields.content.trim() ||

      local.captionPreview?.trim() ||

      ""

    const title =

      fields.title.trim() || local.youtubeTitlePreview?.trim() || ""

    const mediaDraft = draftMediaFromItems(

      local.mediaItems?.length ? local.mediaItems : resolveMediaItems(local),

    )

    setDraft({

      content: caption,

      title,

      scheduledLocal: fields.scheduledLocal,

      ...mediaDraft,

    })

  }, [local, remote])



  const busy = patchMu.isPending || publishMu.isPending || syncMu.isPending



  async function handlePublishNow() {

    if (!postId || !local) return

    try {

      const res = await publishMu.mutateAsync(postId)

      toast.success(t("drawer.publishedNow"), {

        description:

          res.postId !== postId

            ? t("drawer.newPostRecord", { id: res.postId.slice(0, 10) })

            : undefined,

      })

      if (res.postId !== postId) {

        navigate(`/posts/${res.postId}`, { replace: true })

        return

      }

      void detailQuery.refetch()

    } catch (e: unknown) {

      toastApiError(e, "posts:drawer.publishFailed")

    }

  }



  async function handleSave() {

    if (!postId || !local || !editable) return

    const scheduledAt =

      draft.scheduledLocal.trim().length > 0

        ? isoFromDatetimeLocal(draft.scheduledLocal)

        : undefined

    if (draft.scheduledLocal.trim().length > 0 && scheduledAt === undefined) {

      toast.error(t("drawer.scheduleInvalid"))

      return

    }

    const { mediaUrl, mediaUrls } = postDraftToMediaPayload(draft, primaryChannel)

    if (primaryChannelKey === "tiktok" && isTikTokPhotoMedia(mediaUrls)) {
      const tiktokErr = tiktokPhotoCaptionErrorI18n(draft.content, (key, opts) =>
        t(key, { ...(opts ?? {}), ns: "upload" }),
      )
      if (tiktokErr) {
        toast.error(tiktokErr)
        return
      }
    }

    try {

      await patchMu.mutateAsync({

        postId,

        body: {

          content: draft.content,

          title: draft.title,

          mediaUrl,

          mediaUrls,

          ...(scheduledAt ? { scheduledAt } : {}),

        },

      })

      toast.success(t("drawer.updated"))

      setEditing(false)

      void detailQuery.refetch()

    } catch (e: unknown) {

      toastApiError(e, "posts:drawer.saveFailed")

    }

  }



  async function handleSyncAnalytics() {

    if (!postId) return

    try {

      await syncMu.mutateAsync()

      toast.success(t("detail.analytics.syncSuccess"))

      void detailQuery.refetch()

    } catch (e: unknown) {

      toastApiError(e, "posts:detail.analytics.syncFailed")

    }

  }



  function cancelEditing() {

    if (!local) return

    const fields = editableFieldsFromZernio(remote, local)

    const caption =

      local.detailCaption?.trim() ||

      fields.content.trim() ||

      local.captionPreview?.trim() ||

      ""

    const title =

      fields.title.trim() || local.youtubeTitlePreview?.trim() || ""

    const mediaDraft = draftMediaFromItems(

      local.mediaItems?.length ? local.mediaItems : resolveMediaItems(local),

    )

    setDraft({

      content: caption,

      title,

      scheduledLocal: fields.scheduledLocal,

      ...mediaDraft,

    })

    setEditing(false)

  }



  return (
    <PageShell>
      <div className="flex flex-col gap-5">
        {detailQuery.isLoading ? (

          <div className="flex items-center gap-2 text-sm text-muted-foreground">

            <Spinner />

            {t("drawer.loading")}

          </div>

        ) : detailQuery.isError ? (

          <p className="text-sm text-destructive">{t("drawer.loadFailed")}</p>

        ) : !local ? null : (

          <>

            <header className="space-y-3">

              <div className="flex flex-wrap items-start justify-between gap-3">

                <div className="min-w-0 space-y-1">

                  <h1 className="font-heading text-2xl font-semibold tracking-tight">

                    {t("detail.title")}

                  </h1>

                  <p className="font-mono text-xs text-muted-foreground">

                    {local.postId}

                  </p>

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

                    {editing ? t("drawer.cancelEdit") : t("drawer.edit")}

                  </Button>

                ) : null}

              </div>

              <div className="flex flex-wrap items-center gap-2">

                <Badge variant="secondary" className="capitalize">

                  {local.status}

                </Badge>

                <ChannelStack channels={local.channels ?? []} sizeClass="size-7" />

              </div>

            </header>



            {!editable ? (

              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">

                <AlertTitle className="text-amber-950 dark:text-amber-50">

                  {t("detail.editingLockedTitle")}

                </AlertTitle>

                <AlertDescription className="text-amber-900 dark:text-amber-100">

                  {t("detail.editingLockedDesc")}

                </AlertDescription>

              </Alert>

            ) : null}



            <div className="grid gap-5 lg:grid-cols-12 lg:items-start">

              <div className="flex flex-col gap-5 lg:col-span-7">

                {editable && editing ? (

                  <PostDetailMediaEditor

                    channel={primaryChannel}

                    draft={draft}

                    disabled={busy}

                    onChange={(patch) =>

                      setDraft((d) => ({

                        ...d,

                        ...patch,

                      }))

                    }

                  />

                ) : (

                  <PostDetailMediaGallery items={mediaItems} />

                )}



                <Card>

                  <CardHeader className="pb-3">

                    <CardTitle className="text-base">{t("drawer.contentTitle")}</CardTitle>

                  </CardHeader>

                  <CardContent className="space-y-3">

                    {!editable || !editing ? (

                      <div className="space-y-2">

                        {draft.title.trim() ? (

                          <p className="font-serif text-[15px] leading-snug font-medium">

                            {draft.title}

                          </p>

                        ) : null}

                        <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">

                          {draft.content.trim() || "—"}

                        </p>

                      </div>

                    ) : (

                      <>

                        <div className="space-y-2">

                          <Label htmlFor="post-content">{t("drawer.captionLabel")}</Label>

                          <Textarea

                            id="post-content"

                            value={draft.content}

                            onChange={(e) =>

                              setDraft((d) => ({ ...d, content: e.target.value }))

                            }

                            rows={6}

                            className="text-sm"

                            disabled={busy}

                            maxLength={tiktokPhotoCaptionLimit ?? undefined}

                          />

                          {tiktokPhotoCaptionLimit ? (
                            <p className="text-[11px] text-muted-foreground">
                              {draft.content.trim().length}/{tiktokPhotoCaptionLimit}{" "}
                              {t("drawer.tiktokCaptionHint")}
                            </p>
                          ) : null}

                        </div>

                        <div className="space-y-2">

                          <Label htmlFor="post-title">{t("drawer.titleLabel")}</Label>

                          <Input

                            id="post-title"

                            value={draft.title}

                            onChange={(e) =>

                              setDraft((d) => ({ ...d, title: e.target.value }))

                            }

                            placeholder={t("drawer.titlePlaceholder")}

                            disabled={busy}

                          />

                        </div>

                        <div className="space-y-2">

                          <Label htmlFor="post-scheduled">{t("drawer.scheduleLabel")}</Label>

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

                  </CardContent>

                </Card>



                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">

                  <Link

                    to={`/content/${encodeURIComponent(local.contentRef)}`}

                    className={cn(

                      buttonVariants({ variant: "outline", size: "default" }),

                      "inline-flex items-center gap-1.5",

                    )}

                  >

                    {t("drawer.contentLink")}

                    <ExternalLink className="size-3.5 opacity-70" aria-hidden />

                  </Link>

                  {publishable && !editing ? (

                    <Button

                      type="button"

                      disabled={busy}

                      className="gap-1.5 border-[#185FA5] bg-[#E6F1FB] text-[#042C53] hover:bg-[#B5D4F4]"

                      onClick={() => void handlePublishNow()}

                    >

                      {publishMu.isPending ? (

                        <Loader2 className="size-4 animate-spin" aria-hidden />

                      ) : (

                        <Send className="size-4" aria-hidden />

                      )}

                      {t("drawer.publishNow")}

                    </Button>

                  ) : null}

                  {editable && editing ? (

                    <Button

                      type="button"

                      disabled={busy}

                      onClick={() => void handleSave()}

                    >

                      {patchMu.isPending ? (

                        <>

                          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />

                          Saving…

                        </>

                      ) : (

                        t("drawer.saveChanges")

                      )}

                    </Button>

                  ) : null}

                </div>

              </div>



              <div className="flex flex-col gap-5 lg:col-span-5">

                <Card>

                  <CardHeader className="pb-3">

                    <CardTitle className="text-base">{t("drawer.timingTitle")}</CardTitle>

                  </CardHeader>

                  <CardContent>

                    <dl className="grid grid-cols-2 gap-3 text-sm">

                      <div>

                        <dt className="text-muted-foreground">{t("drawer.scheduled")}</dt>

                        <dd className="mt-0.5 font-mono text-[11px]">

                          {fmtIso(local.scheduledAt)}

                        </dd>

                      </div>

                      <div>

                        <dt className="text-muted-foreground">{t("drawer.published")}</dt>

                        <dd className="mt-0.5 font-mono text-[11px]">

                          {fmtIso(local.publishedAt)}

                        </dd>

                      </div>

                    </dl>

                  </CardContent>

                </Card>



                {analyticsEligible && local ? (

                  <PostAnalyticsPanel

                    post={local}

                    analytics={analytics}

                    busy={busy}

                    onRefresh={() => void handleSyncAnalytics()}

                  />

                ) : (

                  <Card>

                    <CardHeader className="pb-3">

                      <CardTitle className="text-base">

                        {t("detail.analytics.title")}

                      </CardTitle>

                      <CardDescription>

                        {t("detail.analytics.afterPublish")}

                      </CardDescription>

                    </CardHeader>

                    <CardContent>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">

                        {(["views", "likes", "comments", "engagement"] as const).map(

                          (key) => (

                            <div

                              key={key}

                              className="rounded-lg border bg-muted/20 px-3 py-2.5 text-center"

                            >

                              <p className="text-[11px] text-muted-foreground">

                                {t(`detail.analytics.stats.${key}`)}

                              </p>

                              <p className="mt-1 font-heading text-lg font-semibold">—</p>

                            </div>

                          ),

                        )}

                      </div>

                    </CardContent>

                  </Card>

                )}

              </div>

            </div>

          </>

        )}

      </div>
    </PageShell>
  )
}
