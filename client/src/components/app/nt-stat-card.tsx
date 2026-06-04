import { T } from "@/lib/tokens"

type NtStatCardProps = {
  label: string
  value: string
  delta?: string | null
  up?: boolean | null
}

export function NtStatCard({ label, value, delta, up }: NtStatCardProps) {
  return (
    <div
      className="rounded-[10px] p-4 pr-5"
      style={{
        background: T.surfaceBg,
        border: `1px solid ${T.surfaceBorder}`,
        boxShadow: T.surfaceShadow,
      }}
    >
      <div
        className="mb-2.5 text-[10px] font-bold tracking-wide uppercase"
        style={{ color: T.textMuted }}
      >
        {label}
      </div>
      <div
        className="mb-1 text-[28px] font-bold tracking-[-1px]"
        style={{ color: T.textPrimary }}
      >
        {value}
      </div>
      {delta != null && delta !== "" && up != null ? (
        <div
          className="flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: up ? T.green : T.red }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            {up ? (
              <path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            ) : (
              <path d="M5 2v6M2 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            )}
          </svg>
          <span>{delta} vs last period</span>
        </div>
      ) : null}
    </div>
  )
}
