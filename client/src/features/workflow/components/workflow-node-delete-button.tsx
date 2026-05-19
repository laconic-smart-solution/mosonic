import { T } from "@/lib/tokens"

type WorkflowNodeDeleteButtonProps = {
  visible: boolean
  onDelete?: () => void
}

export function WorkflowNodeDeleteButton({
  visible,
  onDelete,
}: WorkflowNodeDeleteButtonProps) {
  if (!visible || !onDelete) return null

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onDelete()
      }}
      className="nodrag nopan absolute top-2 right-2 flex size-[22px] cursor-pointer items-center justify-center rounded-[5px] border border-[#FCA5A5] bg-[#FEE2E2] text-[11px] text-[#DC2626] shadow-sm"
      style={{ borderColor: T.surfaceBorder }}
      aria-label="Delete node"
    >
      ✕
    </button>
  )
}
