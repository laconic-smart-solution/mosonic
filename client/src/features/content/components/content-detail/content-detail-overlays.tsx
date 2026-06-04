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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal"
import { WorkflowNodeConfigFields } from "@/features/workflow/components/workflow-node-config-fields"
import { backendTypeToCanvas } from "@/features/workflow/data/workflow-model"
import {
  type OutputKey,
  cardTitle,
  outputKeyForNodeType,
} from "@/features/content/data/content-review-helpers"
import { cn } from "@/lib/utils"
import type { WorkflowNode } from "@/shared/types/workflow.type"
import {
  LightboxInner,
  CARD_ICONS,
  nodeIconBoxClass,
} from "./content-detail-review-ui"

type WorkflowNodesLite = WorkflowNode[]

type RerunSheetProps = {
  openNodeId: string | null
  workflowNodes: WorkflowNodesLite
  globalRerunning: boolean
  configDraft: Record<string, unknown>
  onConfigChange: (next: Record<string, unknown>) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (nodeId: string) => void
}

export function ContentDetailRerunSheet({
  openNodeId,
  workflowNodes,
  globalRerunning,
  configDraft,
  onConfigChange,
  onOpenChange,
  onSubmit,
}: RerunSheetProps) {
  const openNode = openNodeId
    ? workflowNodes.find((n) => n.nodeId === openNodeId)
    : undefined
  const openKey: OutputKey | undefined = openNode
    ? outputKeyForNodeType(openNode.type)
    : undefined
  const canvasType = openNode ? backendTypeToCanvas(openNode.type) : ""

  return (
    <Drawer
      open={!!openNodeId}
      onOpenChange={(open) => onOpenChange(open)}
      direction="bottom"
    >
      <DrawerContent
        variant="panel"
        showCloseButton
        className="mx-auto max-h-[85vh] max-w-3xl overflow-y-auto rounded-t-2xl p-5"
      >
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2.5 font-heading text-lg">
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
            ) : openNode ? (
              <span>Re-run node</span>
            ) : null}
          </DrawerTitle>
          <DrawerDescription>
            Adjust settings below and re-run. Output replaces this node only —
            other nodes stay untouched.
          </DrawerDescription>
        </DrawerHeader>
        {openNode && canvasType ? (
          <div className="mt-3 max-h-[50vh] overflow-y-auto pr-1">
            <WorkflowNodeConfigFields
              canvasType={canvasType}
              config={configDraft}
              onChange={onConfigChange}
            />
          </div>
        ) : null}
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
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!openNodeId || globalRerunning}
            onClick={() => openNodeId && onSubmit(openNodeId)}
          >
            Re-run node
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

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
