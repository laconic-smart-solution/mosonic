import { useEffect, useRef, useState } from "react"
import { ImagePlus, X } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal"
import { Textarea } from "@/components/ui/textarea"
import {
  type OutputKey,
  cardTitle,
  outputKeyForNodeType,
} from "@/features/content/data/content-review-helpers"
import { cn } from "@/lib/utils"
import { randomUuid } from "@/lib/random-uuid"
import type { WorkflowNode } from "@/shared/types/workflow.type"
import {
  LightboxInner,
  CARD_ICONS,
  nodeIconBoxClass,
} from "./content-detail-review-ui"

type WorkflowNodesLite = WorkflowNode[]

export type RerunAttachment = {
  id: string
  label: string
  file: File
}

type RerunConfirmDialogProps = {
  openNodeId: string | null
  workflowNodes: WorkflowNodesLite
  globalRerunning: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (
    nodeId: string,
    message?: string,
    attachments?: RerunAttachment[],
  ) => void
}

export function ContentDetailRerunConfirmDialog({
  openNodeId,
  workflowNodes,
  globalRerunning,
  onOpenChange,
  onSubmit,
}: RerunConfirmDialogProps) {
  const openNode = openNodeId
    ? workflowNodes.find((n) => n.nodeId === openNodeId)
    : undefined
  const openKey: OutputKey | undefined = openNode
    ? outputKeyForNodeType(openNode.type)
    : undefined
  const isImageNode = openNode?.type === "image_generation"

  const [message, setMessage] = useState("")
  const [attachments, setAttachments] = useState<RerunAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset the message whenever a different node's dialog opens (or it closes).
  useEffect(() => {
    setMessage("")
    setAttachments([])
  }, [openNodeId])

  return (
    <AlertDialog
      open={!!openNodeId}
      onOpenChange={(open) => onOpenChange(open)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2.5">
            {openKey ? (
              <>
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-lg text-sm [&_svg]:size-3.5",
                    nodeIconBoxClass(openKey),
                  )}
                >
                  {CARD_ICONS[openKey]}
                </span>
                Re-run {cardTitle(openKey)}
              </>
            ) : (
              "Re-run node"
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Re-run this step? Output replaces this node only — other nodes stay
            untouched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label
              htmlFor="rerun-message"
              className="text-xs font-medium text-foreground"
            >
              What should change? (optional)
            </Label>
            <Textarea
              id="rerun-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                isImageNode
                  ? "Describe a change to adjust the current image, or leave empty to try a fresh one…"
                  : "e.g. make the background darker, shorten the caption…"
              }
              rows={3}
              disabled={globalRerunning}
              className="resize-y bg-background text-sm leading-relaxed"
            />
          </div>
          {isImageNode ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">
                Reference images (optional)
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Leave the note empty to generate a fresh image. Describe a tweak
                to adjust the current one. Attach a logo/product to composite —
                say “start over” for a completely new concept.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp"
                multiple
                className="hidden"
                disabled={globalRerunning}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  if (files.length === 0) return
                  setAttachments((prev) => [
                    ...prev,
                    ...files.map((file) => ({
                      id: randomUuid(),
                      label: file.name,
                      file,
                    })),
                  ])
                  e.target.value = ""
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={globalRerunning || attachments.length >= 4}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="size-3.5" />
                  Add images
                </Button>
                {attachments.map((att) => (
                  <span
                    key={att.id}
                    className="inline-flex max-w-[180px] items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs"
                  >
                    <span className="truncate">{att.label}</span>
                    <button
                      type="button"
                      disabled={globalRerunning}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${att.label}`}
                      onClick={() =>
                        setAttachments((prev) =>
                          prev.filter((a) => a.id !== att.id),
                        )
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={globalRerunning}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!openNodeId || globalRerunning}
            onClick={(event) => {
              event.preventDefault()
              if (openNodeId)
                onSubmit(
                  openNodeId,
                  message.trim() || undefined,
                  attachments.length > 0 ? attachments : undefined,
                )
            }}
          >
            Re-run node
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** @deprecated Use ContentDetailRerunConfirmDialog */
export const ContentDetailRerunSheet = ContentDetailRerunConfirmDialog

type LightboxProps = {
  url: string | null
  onClose: () => void
}

export function ContentDetailImageLightbox({ url, onClose }: LightboxProps) {
  return (
    <Modal open={!!url} onOpenChange={(open) => !open && onClose()}>
      <ModalContent className="max-w-4xl sm:max-w-4xl">
        <ModalHeader>
          <ModalTitle>Image</ModalTitle>
        </ModalHeader>
        {url ? <LightboxInner url={url} /> : null}
      </ModalContent>
    </Modal>
  )
}

type ConfirmProps = {
  approveOpen: boolean
  rejectOpen: boolean
  setApproveOpen: (v: boolean) => void
  setRejectOpen: (v: boolean) => void
  onApproveConfirm: () => void
  onRejectConfirm: () => void
}

export function ContentDetailConfirmDialogs({
  approveOpen,
  rejectOpen,
  setApproveOpen,
  setRejectOpen,
  onApproveConfirm,
  onRejectConfirm,
}: ConfirmProps) {
  return (
    <>
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve content?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this content? It will be sent to
              the upload screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onApproveConfirm()}>
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this content?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this content? You can continue
              editing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRejectOpen(false)
                void onRejectConfirm()
              }}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
