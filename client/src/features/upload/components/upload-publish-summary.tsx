import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Summary = {
  published: number
  scheduled: number
  failed: number
  skipped: number
  total: number
}

type UploadPublishSummaryProps = {
  summary: Summary
  onGoToDashboard: () => void
}

function isSummaryComplete(s: Summary): boolean {
  if (s.total <= 0) return false
  return s.published + s.scheduled + s.failed + s.skipped === s.total
}

export function UploadPublishSummary({ summary, onGoToDashboard }: UploadPublishSummaryProps) {
  const complete = isSummaryComplete(summary)

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-slate-50 px-3 py-3 text-xs text-muted-foreground",
        "dark:bg-slate-950/40",
      )}
    >
      <span>
        Summary: {summary.published} published, {summary.scheduled} scheduled, {summary.failed}{" "}
        failed, {summary.skipped} skipped.
      </span>
      {complete ? (
        <Button
          type="button"
          variant="link"
          className="ml-3 h-auto p-0 text-xs font-medium"
          onClick={onGoToDashboard}
        >
          Go to Dashboard
        </Button>
      ) : null}
    </div>
  )
}
