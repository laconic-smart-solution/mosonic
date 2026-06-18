import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

type WorkflowNodeAddButtonProps = {
  visible: boolean
  onOpen: (event: React.MouseEvent) => void
  size?: "sm" | "md"
  highlighted?: boolean
  active?: boolean
}

export function WorkflowNodeAddButton({
  visible,
  onOpen,
  size = "md",
  highlighted = false,
  active = false,
}: WorkflowNodeAddButtonProps) {
  const { t } = useTranslation("workflow")
  const dim = size === "sm" ? 24 : 28
  const icon = size === "sm" ? 14 : 16
  const show = visible || highlighted

  return (
    <button
      type="button"
      className={`nodrag nopan absolute left-1/2 z-10 flex -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-[#00A589] text-white shadow-md transition-all duration-150 hover:bg-[#008f77] ${
        show ? "opacity-100" : "pointer-events-none opacity-0"
      } ${highlighted && !visible ? "pointer-events-none" : ""} ${
        highlighted ? "ring-4 ring-[#00A589]/30" : ""
      } ${
        active ? "scale-110 shadow-[0_0_0_4px_rgba(0,165,137,0.35)]" : ""
      } ${highlighted && !active ? "animate-pulse" : ""}`}
      style={{
        width: dim,
        height: dim,
        bottom: -16,
      }}
      onClick={(event) => {
        event.stopPropagation()
        onOpen(event)
      }}
      aria-label={t("aria.addNode")}
    >
      <Plus size={icon} strokeWidth={2.5} />
    </button>
  )
}
