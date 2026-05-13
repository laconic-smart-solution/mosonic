import type { ReactNode } from "react"
import { T } from "@/lib/tokens"

export function FieldLabel({
  children,
  hint,
}: {
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="mb-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {children}
      </span>
      {hint ? (
        <p className="mt-0.5 text-[11px] font-normal normal-case text-muted-foreground/80">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function FormSection({
  id,
  title,
  subtitle,
  children,
}: {
  id: string
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 border-b border-border/50 pb-10 last:border-b-0 last:pb-0"
    >
      <div className="mb-5 flex items-start gap-3">
        <div
          className="mt-1 h-9 w-1 shrink-0 rounded-full"
          style={{ background: T.accent }}
          aria-hidden
        />
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-6">{children}</div>
    </section>
  )
}

export function FullRow({ children }: { children: ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>
}
