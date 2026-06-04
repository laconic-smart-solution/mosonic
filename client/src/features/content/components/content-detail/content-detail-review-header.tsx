import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { Check, ChevronRight, Clock, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ContentDetail } from "@/shared/types/content.type"
type Props = {
  workflowTitle: string
  data: ContentDetail
  /** Defaults to Content library */
  breadcrumbParentHref?: string
  breadcrumbParentLabel?: string
}

export function ContentDetailReviewHeader({
  workflowTitle,
  data,
  breadcrumbParentHref = "/content",
  breadcrumbParentLabel = "Content",
}: Props) {
  return (
    <>
      <motion.div
        className="mb-4 flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground"
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Link to={breadcrumbParentHref} className="hover:text-foreground">
          {breadcrumbParentLabel}
        </Link>
        <ChevronRight className="size-3.5 shrink-0 opacity-50" />
        <span className="font-medium text-foreground">Review</span>
      </motion.div>

      <motion.div
        className="mb-6 flex flex-col gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.05 }}
      >
        <h1 className="font-heading text-2xl leading-tight font-medium tracking-tight text-foreground sm:text-[26px]">
          {workflowTitle}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
              data.status === "draft" &&
                "border-amber-200/80 bg-[#FEF6E4] text-[#7C4F07]",
              data.status === "approved" &&
                "border-[rgba(0,201,167,0.25)] bg-[#E0FAF5] text-[#005C4D]",
              data.status === "rejected" &&
                "border-red-200 bg-red-50 text-red-700"
            )}
          >
            {data.status === "draft" ? (
              <Clock className="size-3 shrink-0" />
            ) : data.status === "approved" ? (
              <Check className="size-3 shrink-0" />
            ) : (
              <X className="size-3 shrink-0" />
            )}
            {data.status}
          </span>
          <span className="text-xs text-[#A89D8E]">
            Last edited{" "}
            {new Date(data.updatedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </div>
      </motion.div>
    </>
  )
}
