import { Settings } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

type WorkflowNodeSettingsButtonProps = {
  active?: boolean
  onOpen?: () => void
}

export function WorkflowNodeSettingsButton({
  active,
  onOpen,
}: WorkflowNodeSettingsButtonProps) {
  const { t } = useTranslation("workflow")
  if (!onOpen) return null

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      className={cn(
        "nodrag nopan flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border shadow-sm transition-colors",
        active
          ? "border-teal-500 bg-teal-50 text-teal-700"
          : "border-[#E5E1D8] bg-white text-gray-500 hover:border-teal-300 hover:bg-teal-50/80 hover:text-teal-700",
      )}
      aria-label={t("aria.openNodeSettings")}
      title={t("properties.title")}
    >
      <Settings className="size-3.5" strokeWidth={2} />
    </button>
  )
}
