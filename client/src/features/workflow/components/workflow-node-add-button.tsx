import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

type WorkflowNodeAddButtonProps = {
  visible: boolean
  onOpen: (event: React.MouseEvent) => void
  size?: "sm" | "md"
}

export function WorkflowNodeAddButton({
  visible,
  onOpen,
  size = "md",
}: WorkflowNodeAddButtonProps) {
  const { t } = useTranslation("workflow")
  const dim = size === "sm" ? 24 : 28
  const icon = size === "sm" ? 14 : 16

  return (
    <button
      type="button"
      className={`nodrag nopan absolute left-1/2 z-10 flex -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-[#00A589] text-white shadow-md transition-opacity duration-150 hover:bg-[#008f77] ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
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
