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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { type OutputKey, cardTitle, resolveNodeId } from "@/features/content/data/content-review-helpers"
import { cn } from "@/lib/utils"
import type { WorkflowNode } from "@/shared/types/workflow.type"
import { LightboxInner, CARD_ICONS, nodeIconBoxClass } from "./content-detail-review-ui"

type WorkflowNodesLite = WorkflowNode[]

type RerunSheetProps = {
  openKey: OutputKey | null
  workflowNodes: WorkflowNodesLite
  globalRerunning: boolean
  draft: string
  onDraftChange: (v: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (key: OutputKey) => void
}

export function ContentDetailRerunSheet({
  openKey,
  workflowNodes,
  globalRerunning,
  draft,
  onDraftChange,
  onOpenChange,
  onSubmit,
}: RerunSheetProps) {
  return (
    <Sheet
      open={!!openKey}
      onOpenChange={(open) => onOpenChange(open)}
    >
      <SheetContent
        side="bottom"
        showCloseButton={true}
        className="mx-auto max-w-3xl rounded-t-2xl"
      >
        <div
          className="mx-auto mb-5 h-1 w-9 shrink-0 rounded-full bg-muted"
          aria-hidden
        />
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2.5 font-heading text-lg">
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
            ) : null}
          </SheetTitle>
          <SheetDescription>
            Adjust the prompt below and re-run. Output replaces this node only —
            other nodes stay untouched.
          </SheetDescription>
        </SheetHeader>
        <Textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          className="mt-3 min-h-[88px] rounded-[10px] border-[#D9D3C7] bg-[color:var(--nt-canvas)] focus-visible:border-[#00C9A7]"
          placeholder="Add or modify instruction for this node…"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#0F1F3D] text-white hover:bg-[#1A3260]"
            disabled={
              !openKey ||
              !resolveNodeId(workflowNodes, openKey) ||
              globalRerunning
            }
            onClick={() => openKey && onSubmit(openKey)}
          >
            Re-run node
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

type LightboxProps = {
  url: string | null
  onClose: () => void
}

export function ContentDetailImageLightbox({ url, onClose }: LightboxProps) {
  return (
    <Dialog open={!!url} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Image</DialogTitle>
        </DialogHeader>
        {url ? <LightboxInner url={url} /> : null}
      </DialogContent>
    </Dialog>
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
              Are you sure you want to approve this content? It will be sent
              to the upload screen.
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
