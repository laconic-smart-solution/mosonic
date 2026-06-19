import { X } from "lucide-react"

export function NtToastDismiss() {
  return (
    <>
      <span className="nt-ring" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 22 22">
          <circle className="nt-ring-bg" cx="11" cy="11" r="9" />
          <circle className="nt-ring-fg" cx="11" cy="11" r="9" />
        </svg>
      </span>
      <X className="size-3" strokeWidth={2} />
    </>
  )
}
