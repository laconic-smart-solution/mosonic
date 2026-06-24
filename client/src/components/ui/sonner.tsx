import {
  AlertTriangle,
  Check,
  Info,
  Loader2,
  X,
} from "lucide-react"
import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { NtToastDismiss } from "@/components/ui/nt-toast-dismiss"
import { useToastEyebrowVars } from "@/shared/hooks/use-toast-eyebrow-vars"

const Toaster = ({ ...props }: ToasterProps) => {
  useToastEyebrowVars()

  return (
    <Sonner
      position="top-right"
      offset={20}
      gap={10}
      closeButton
      className="nt-toaster"
      icons={{
        success: <Check className="size-[15px]" strokeWidth={2.5} />,
        error: <X className="size-[15px]" strokeWidth={2.5} />,
        warning: <AlertTriangle className="size-[15px]" strokeWidth={2.5} />,
        info: <Info className="size-[15px]" strokeWidth={2.5} />,
        loading: <Loader2 className="size-[14px] animate-spin" strokeWidth={2.5} />,
        close: <NtToastDismiss />,
      }}
      toastOptions={{
        unstyled: true,
        duration: 4000,
        style: {
          "--nt-duration": "4000ms",
        } as CSSProperties,
        classNames: {
          toast: "nt-toast",
          icon: "nt-icon",
          content: "nt-text",
          title: "nt-msg",
          description: "nt-desc",
          actionButton: "nt-action",
          closeButton: "nt-dismiss",
          success: "nt-toast--success",
          error: "nt-toast--error",
          warning: "nt-toast--warning",
          info: "nt-toast--info",
          loading: "nt-toast--loading",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
